/* =============================================================
   GLACIAL · MODO VISUALIZACIÓN GENERAL (por usuario)
   -------------------------------------------------------------
   El Administrador activa este modo a una cuenta concreta (Jefatura, Gerencia o cualquiera), elige qué módulos y
   qué líneas puede consultar y si puede descargar reportes. Mientras está activo, la cuenta SOLO consulta.

   DÓNDE SE GUARDA: en el registro del usuario (sync/users), campo `modoVisualizacion`:
     { activo, modulos:[clave…], lineas:['PET1'…], exportar, actualizadoPor, actualizadoEn }
   y, para que las reglas de Firestore puedan bloquear sus escrituras, 36-seguridad-auth.js publica `soloVista:true` en
   sync/perfiles (uid → rol/permisos/soloVista). Los permisos operativos anteriores NO se borran: quedan guardados y
   vuelven a aplicarse al desactivar el modo.

   CÓMO SE APLICA (una sola evaluación, reutilizada por todas las pantallas):
     · normalizarPermisosUsuario / tienePermiso: con el modo activo la lista efectiva sale SOLO de los módulos marcados
       (más exportación si se permite). No se conserva ningún permiso de modificación.
     · esUsuarioSoloConsulta: devuelve true con el modo activo, así que todas las pantallas que ya tenían «modo consulta»
       (tareo, avance, resúmenes, rotaciones, producción actual…) pasan a solo lectura sin cambiar su código.
     · Menú y navegación directa: renderSidebar / renderMain solo dejan abrir las pestañas de los módulos marcados;
       las demás se redirigen a una vista permitida o a la pantalla «sin áreas autorizadas».
     · Líneas: LINES se reduce a las líneas autorizadas y loadRecords / loadPaletas / loadProgramaciones devuelven solo
       esas líneas, de modo que listados, indicadores y totales corresponden al conjunto permitido.
     · Escrituras: además de las reglas del servidor, las clases de Firestore (set, update, delete, add, lotes y
       transacciones) se bloquean en el navegador. Ocultar botones es solo ayuda visual.
     · Descargas: sin la casilla «descargar / exportar», se bloquean la descarga de archivos (Excel, imágenes, PDF),
       la impresión y la copia al portapapeles, y se ocultan los comandos.

   LÍMITE CONOCIDO: los datos compartidos de Firestore (records, paletas, programaciones… un documento por colección)
   mezclan todas las líneas. Las reglas no pueden dar «solo PET1» sobre un documento así; el filtro por línea es del
   navegador. La escritura SÍ está protegida en el servidor. Separar esos documentos por línea queda como etapa aparte.
   ============================================================= */
(function instalarModoVisualizacion(){
  'use strict';

  const LINEAS_TODAS = ['PET1','PET2','B7L','C20L','B20L'];

  /* Módulos reales del sistema que admiten consulta. `permisos` = permisos de VISTA que se activan al marcarlos;
     `tabs` = pestañas (state.currentTab) que abre. Las etiquetas son de consulta (no de modificación). */
  const MODULOS = [
    {clave:'inicio',            area:'produccion', etq:'Inicio y resumen de producción',           permisos:['ver_inicio_ejecutivo'], tabs:['centro-perfil']},
    {clave:'produccion_actual', area:'produccion', etq:'Producción Actual / Semáforo',             permisos:['produccionActual'],     tabs:['produccion-actual']},
    {clave:'planificacion',     area:'produccion', etq:'Planificación (programación y catálogo)',  permisos:[],                       tabs:['planificacion']},
    // 'paletas' NO se concede como permiso: es el permiso de REGISTRAR. La pestaña se abre por módulo (puedeAccederPaletas / permisoPestanaLinea).
    {clave:'paletas',           area:'produccion', etq:'Paletas y registros de producción',        permisos:[],                       tabs:['paletas']},
    {clave:'historial',         area:'produccion', etq:'Historial de producción por línea',        permisos:['historial'],            tabs:['historial']},
    {clave:'graficos',          area:'produccion', etq:'Gráficos de producción',                   permisos:['graficos'],             tabs:['graficos']},
    {clave:'avance',            area:'produccion', etq:'Avance y Cierre de Turno',                 permisos:['avanceProduccion'],     tabs:['avance-produccion']},
    {clave:'resumen',           area:'produccion', etq:'Resumen general y reportes',               permisos:['resumen'],              tabs:['resumen']},
    {clave:'resumenes_turno',   area:'produccion', etq:'Resúmenes de turno',                       permisos:[],                       tabs:['resumenes-turno']},
    {clave:'tareo_produccion',  area:'personal',   etq:'Tareo de producción',                      permisos:['ver_tareo_produccion'], tabs:['tareo']},
    {clave:'tareo_mantenimiento',area:'personal',  etq:'Tareo de mantenimiento',                   permisos:['ver_tareo_mantenimiento'], tabs:['mantenimiento']},
    {clave:'rotacion_supervisores',area:'personal',etq:'Rotación de supervisores',                 permisos:['gestionar_rotacion_supervisores'], tabs:['rotacion-supervisores']},
    {clave:'rotacion_trabajadores',area:'personal',etq:'Rotación de trabajadores (MTTO y maquinistas)', permisos:[],                  tabs:['mantenimiento']},
    {clave:'rrhh',              area:'personal',   etq:'Panel de RRHH (tareo general, historial y resumen mensual)', permisos:['moduloRRHH'], tabs:['rrhh'], restringido:true},
    {clave:'bitacora',          area:'operaciones',etq:'Bitácora de paradas (Producción y Mantenimiento)', permisos:['ver_bitacora_mantenimiento'], tabs:['bitacora-mtto']},
    {clave:'analisis_paradas',  area:'operaciones',etq:'Análisis de paradas',                      permisos:[],                       tabs:['analisis-paradas']}
  ];
  const AREAS = [
    {clave:'produccion',  titulo:'PRODUCCIÓN'},
    {clave:'personal',    titulo:'PERSONAL'},
    {clave:'operaciones', titulo:'OPERACIONES'}
  ];
  const POR_CLAVE = {};
  MODULOS.forEach(m => { POR_CLAVE[m.clave] = m; });
  const PERMISOS_EXPORTAR = ['exportarExcel','exportarExcelGeneral','exportarJPG'];
  // Orden en que se busca la primera vista permitida al entrar o al perder un módulo.
  const ORDEN_VISTAS = ['inicio','produccion_actual','avance','resumen','planificacion','tareo_produccion','tareo_mantenimiento',
    'rotacion_trabajadores','rotacion_supervisores','rrhh','resumenes_turno','bitacora','analisis_paradas','paletas','historial','graficos'];
  const TABS_LINEA = ['paletas','historial','graficos'];

  /* ---------- configuración del usuario ---------- */
  let ignorando = 0;   // para mostrar al administrador los permisos guardados sin el modo (formulario de usuarios)
  function sinModo(fn){ ignorando++; try{ return fn(); } finally { ignorando--; } }
  function configDe(u){
    if(ignorando) return null;
    const c = u && u.modoVisualizacion;
    if(!c || c.activo !== true) return null;
    // El Administrador (y el administrador principal) nunca quedan limitados por este modo.
    if(String(u.rol || '').trim() === 'Administrador' || u.username === 'admin') return null;
    return {
      activo: true,
      modulos: (Array.isArray(c.modulos) ? c.modulos : []).filter(k => POR_CLAVE[k]),
      lineas:  (Array.isArray(c.lineas)  ? c.lineas  : []).filter(l => LINEAS_TODAS.includes(l)),
      exportar: c.exportar === true
    };
  }
  const usuarioActual = () => (typeof state !== 'undefined' ? state.user : null);
  const activoDe = u => !!configDe(u);
  const activo = () => activoDe(usuarioActual());
  const config = () => configDe(usuarioActual());
  const puedeModulo = clave => { const c = config(); return !!c && c.modulos.includes(clave); };
  const algunModulo = claves => claves.some(puedeModulo);
  const lineaPermitida = key => { const c = config(); return !c || c.lineas.includes(key); };
  const puedeExportar = () => { const c = config(); return !c || c.exportar; };

  /* Módulo(s) que abren una pestaña. 'perdidas' (Impacto Económico) conserva su autorización independiente. */
  function modulosDeTab(tab){
    return MODULOS.filter(m => m.tabs.includes(tab)).map(m => m.clave);
  }
  function tabPermitida(tab){
    if(!activo()) return true;
    if(tab === 'perdidas') return typeof tienePermiso === 'function' && tienePermiso('perdidasSoles');
    const mods = modulosDeTab(tab);
    if(!mods.length || !algunModulo(mods)) return false;
    if(TABS_LINEA.includes(tab)) return lineasVisibles().length > 0;
    return true;
  }
  function lineasVisibles(){
    return (typeof LINES !== 'undefined' ? LINES : []).filter(l => lineaPermitida(l.key));
  }
  function primeraTab(){
    for(const k of ORDEN_VISTAS){
      if(!puedeModulo(k)) continue;
      const tab = POR_CLAVE[k].tabs[0];
      if(tabPermitida(tab)) return tab;
    }
    return '';
  }

  /* ---------- permisos efectivos ---------- */
  const normalizarOriginal = normalizarPermisosUsuario;
  normalizarPermisosUsuario = function(u){
    const c = configDe(u);
    if(!c) return normalizarOriginal.apply(this, arguments);
    const set = new Set();
    c.modulos.forEach(k => POR_CLAVE[k].permisos.forEach(p => set.add(p)));
    if(c.exportar) PERMISOS_EXPORTAR.forEach(p => set.add(p));
    // Impacto Económico conserva su autorización propia (se decide por rol en 55-valores-economicos.js y en las reglas):
    // este modo ni la concede ni la quita.
    try{
      const antes = normalizarOriginal.call(this, Object.assign({}, u, {modoVisualizacion:null}));
      if(antes === 'todos' || (Array.isArray(antes) && antes.includes('perdidasSoles'))) set.add('perdidasSoles');
    }catch(_){ /* sin permiso económico */ }
    return [...set];
  };
  window.normalizarPermisosUsuario = normalizarPermisosUsuario;

  const soloConsultaOriginal = esUsuarioSoloConsulta;
  esUsuarioSoloConsulta = function(u){ return soloConsultaOriginal.apply(this, arguments) || activoDe(u); };
  window.esUsuarioSoloConsulta = esUsuarioSoloConsulta;

  // Permisos con regla propia (no pasan por la lista): en modo consulta no se conceden.
  const tienePermisoOriginal = tienePermiso;
  tienePermiso = function(permiso){
    if(activo() && (permiso === 'planificacion' || permiso === 'distribuirPersonal')) return false;
    return tienePermisoOriginal.apply(this, arguments);
  };
  window.tienePermiso = tienePermiso;

  /* ---------- entradas de menú y navegación ---------- */
  const entradaMttoOriginal = puedeEntrarMantenimiento;
  puedeEntrarMantenimiento = function(){
    return activo() ? algunModulo(['tareo_mantenimiento','rotacion_trabajadores']) : entradaMttoOriginal.apply(this, arguments);
  };
  const entradaTareoOriginal = puedeEntrarTareoProduccion;
  puedeEntrarTareoProduccion = function(){
    return activo() ? puedeModulo('tareo_produccion') : entradaTareoOriginal.apply(this, arguments);
  };
  const entradaPlanOriginal = puedeEntrarPlanificacion;
  puedeEntrarPlanificacion = function(){
    return activo() ? puedeModulo('planificacion') : entradaPlanOriginal.apply(this, arguments);
  };
  const visibleLinesOriginal = visibleLines;
  visibleLines = function(){
    if(!activo()) return visibleLinesOriginal.apply(this, arguments);
    if(!algunModulo(TABS_LINEA)) return [];
    return lineasVisibles();
  };
  const permisoNavOriginal = permisoNavegacion;
  permisoNavegacion = function(permiso){
    if(!activo()) return permisoNavOriginal.apply(this, arguments);
    if(permiso === '__inicio__') return puedeModulo('inicio');
    if(permiso === 'planificacionEntrada') return puedeModulo('planificacion');
    if(permiso === 'moduloMantenimiento') return puedeEntrarMantenimiento();
    if(permiso === 'tareoProduccion' || permiso === 'tareoGeneral') return puedeEntrarTareoProduccion();
    return permisoNavOriginal.apply(this, arguments);
  };
  /* Pestañas de línea: abrirlas se decide por módulo; registrar (permiso 'paletas') nunca se concede. */
  const accederPaletasOriginal = puedeAccederPaletas;
  puedeAccederPaletas = function(){ return activo() ? puedeModulo('paletas') && lineasVisibles().length > 0 : accederPaletasOriginal.apply(this, arguments); };
  const permisoPestanaOriginal = permisoPestanaLinea;
  permisoPestanaLinea = function(permiso){
    if(!activo()) return permisoPestanaOriginal.apply(this, arguments);
    return TABS_LINEA.includes(permiso) && puedeModulo(permiso) && lineasVisibles().length > 0;
  };
  const selectLineOriginal = selectLine;
  selectLine = function(key){
    if(!activo()) return selectLineOriginal.apply(this, arguments);
    if(!lineaPermitida(key) || !visibleLines().some(l => l.key === key)) return;
    const tab = ['historial','graficos','paletas'].find(t => puedeModulo(t));
    if(!tab) return;
    if(typeof confirmarAbandonoRotacionPendiente === 'function' && !confirmarAbandonoRotacionPendiente()) return;
    state.currentLine = key; state.currentTab = tab; state.viewingRecordId = null; draft = null;
    renderSidebar(); renderMain();
  };
  window.selectLine = selectLine;
  // La validación de pestañas en modo consulta la hace renderMain (más abajo) con los módulos marcados.
  const ajustarOriginal = ajustarVistaSegunPermisos;
  ajustarVistaSegunPermisos = function(){ if(!activo()) return ajustarOriginal.apply(this, arguments); };
  const primeraOriginal = primeraVistaAutorizada;
  primeraVistaAutorizada = function(){
    return activo() ? primeraTab() : primeraOriginal.apply(this, arguments);
  };

  /* Pantalla informativa: el modo está activo y no hay nada autorizado que mostrar. */
  function mostrarSinAcceso(){
    const main = document.getElementById('main');
    if(!main) return;
    main.innerHTML = '<div class="empty-state vista-sin-acceso"><h4>Sin áreas autorizadas</h4>' +
      '<p>Tu cuenta está en <strong>Modo visualización</strong>, pero todavía no tiene módulos o líneas autorizados para consultar.</p>' +
      '<p class="small-muted">Solicita al administrador que seleccione qué puedes visualizar.</p></div>';
  }

  /* Corrige la vista abierta si dejó de estar autorizada (menú, enlaces internos, accesos guardados, cambios en vivo). */
  function corregirVista(){
    if(state.showWelcome) return true;
    const tab = state.currentTab;
    if(!tabPermitida(tab)){
      const siguiente = primeraTab();
      if(!siguiente){ state.currentTab = ''; return false; }
      state.currentTab = siguiente;
    }
    if(TABS_LINEA.includes(state.currentTab)){
      const visibles = lineasVisibles();
      if(!visibles.some(l => l.key === state.currentLine)) state.currentLine = visibles[0].key;
    }
    return true;
  }

  const renderMainOriginal = renderMain;
  renderMain = function(){
    sincronizar();
    if(activo() && !corregirVista()){
      mostrarSinAcceso();
      return;
    }
    return renderMainOriginal.apply(this, arguments);
  };
  window.renderMain = renderMain;

  const renderSidebarOriginal = renderSidebar;
  renderSidebar = function(){
    sincronizar();
    const r = renderSidebarOriginal.apply(this, arguments);
    if(activo()){
      const inicio = document.getElementById('btn-centro-perfil');
      if(inicio && !puedeModulo('inicio')){ inicio.hidden = true; inicio.style.display = 'none'; }
      if(typeof actualizarGruposSidebar === 'function') actualizarGruposSidebar();
    }
    return r;
  };
  window.renderSidebar = renderSidebar;

  /* ---------- líneas autorizadas ---------- */
  let LINEAS_COMPLETAS = null;
  const COPIAS = new Map();   // lista original de líneas de otros módulos (se restaura al salir del modo)
  function ajustarLista(lista){
    if(!Array.isArray(lista)) return;
    if(!COPIAS.has(lista)) COPIAS.set(lista, lista.slice());
    const c = config(), original = COPIAS.get(lista);
    const objetivo = c ? original.filter(x => c.lineas.includes(typeof x === 'string' ? x : x.key)) : original;
    const igual = lista.length === objetivo.length && lista.every((x,i) => x === objetivo[i]);
    if(!igual) lista.splice(0, lista.length, ...objetivo);
  }
  function sincronizarLineas(){
    if(typeof LINES === 'undefined') return;
    // LINES y las listas de líneas propias de otros módulos (Avance y Cierre, Distribución de personal).
    ajustarLista(LINES);
    if(typeof AVANCE_LINEAS !== 'undefined') ajustarLista(AVANCE_LINEAS);
    if(window.glacialDistribucionPersonal) ajustarLista(window.glacialDistribucionPersonal.LINEAS);
  }
  // Para listas de líneas escritas dentro de un módulo: devuelve solo las autorizadas.
  window.glacialLineasPermitidas = lista => (Array.isArray(lista) ? lista.filter(l => lineaPermitida(typeof l === 'string' ? l : l.key) || l === 'TODAS') : lista);

  /* Los listados con línea devuelven solo las líneas autorizadas (memorizado por lista para no recorrer miles de filas). */
  function filtrarPorLinea(nombre){
    const original = globalThis[nombre];
    if(typeof original !== 'function' || original.__vista) return;
    let memo = null;
    const envoltura = function(){
      const lista = original.apply(this, arguments);
      const c = config();
      if(!c || !Array.isArray(lista)) return lista;
      const clave = c.lineas.join(',');
      if(memo && memo.origen === lista && memo.n === lista.length && memo.clave === clave) return memo.salida;
      const salida = lista.filter(x => !x || !x.linea || c.lineas.includes(x.linea));
      memo = {origen:lista, n:lista.length, clave, salida};
      return salida;
    };
    envoltura.__vista = true;
    globalThis[nombre] = envoltura;
  }
  ['loadRecords','loadPaletas','loadProgramaciones'].forEach(filtrarPorLinea);

  /* ---------- bloqueo de escrituras ---------- */
  const RUTAS_PERMITIDAS = [/^relojServidor\//, /^resultadosEconomicos\//];   // hora del servidor y resultados calculados (no son ediciones)
  let ultimoAviso = 0;
  function aviso(texto){
    const ahora = Date.now();
    if(ahora - ultimoAviso < 2500) return;
    ultimoAviso = ahora;
    try{
      let t = document.getElementById('vista-aviso');
      if(!t){ t = document.createElement('div'); t.id = 'vista-aviso'; t.setAttribute('role','status'); document.body.appendChild(t); }
      t.textContent = texto;
      t.classList.add('visible');
      setTimeout(() => t.classList.remove('visible'), 3500);
    }catch(_){ /* sin DOM */ }
  }
  const MSG_ESCRITURA = 'Modo visualización: esta cuenta solo puede consultar. No se guardó ningún cambio.';
  function errorVista(){
    const e = new Error(MSG_ESCRITURA);
    e.glacialVista = true; e.code = 'modo-visualizacion';
    return e;
  }
  const rutaDe = ref => String((ref && ref.path) || '');
  function escrituraBloqueada(ref){
    return activo() && !RUTAS_PERMITIDAS.some(re => re.test(rutaDe(ref)));
  }
  function bloquearFirestore(){
    if(typeof firebase === 'undefined' || !firebase.firestore || firebase.firestore.__vista) return;
    const F = firebase.firestore;
    const envolverRef = (proto, metodo) => {
      const original = proto && proto[metodo];
      if(typeof original !== 'function') return;
      proto[metodo] = function(){
        if(escrituraBloqueada(this)){ aviso(MSG_ESCRITURA); return Promise.reject(errorVista()); }
        return original.apply(this, arguments);
      };
    };
    ['set','update','delete'].forEach(m => envolverRef(F.DocumentReference && F.DocumentReference.prototype, m));
    envolverRef(F.CollectionReference && F.CollectionReference.prototype, 'add');
    // Lotes y transacciones: el primer argumento es la referencia del documento.
    [F.WriteBatch, F.Transaction].forEach(clase => {
      ['set','update','delete'].forEach(m => {
        const proto = clase && clase.prototype, original = proto && proto[m];
        if(typeof original !== 'function') return;
        proto[m] = function(ref){
          if(escrituraBloqueada(ref)){ aviso(MSG_ESCRITURA); throw errorVista(); }
          return original.apply(this, arguments);
        };
      });
    });
    F.__vista = true;
  }
  // Segunda barrera para las funciones de guardado que actualizan la copia local antes de escribir.
  function bloquearGuardados(){
    ['saveUsers','saveRecords','saveWorkers','saveRotaciones','saveRotacionesMantenimiento','saveRotacionMaquinistas',
     'saveTareos','savePaletas','saveProgramaciones'].forEach(nombre => {
      const original = globalThis[nombre];
      if(typeof original !== 'function' || original.__vistaGuardado) return;
      const envoltura = function(){
        if(activo()){ aviso(MSG_ESCRITURA); throw errorVista(); }
        return original.apply(this, arguments);
      };
      envoltura.__vistaGuardado = true;
      globalThis[nombre] = envoltura;
    });
    // El aviso genérico «no se pudo guardar… faltan reglas» no corresponde a este caso.
    if(typeof _avisarErrorGuardado === 'function' && !_avisarErrorGuardado.__vista){
      const original = _avisarErrorGuardado;
      _avisarErrorGuardado = function(nombre, error){
        if(error && error.glacialVista){ aviso(MSG_ESCRITURA); return; }
        return original.apply(this, arguments);
      };
      _avisarErrorGuardado.__vista = true;
    }
  }

  /* ---------- descargas y exportaciones ---------- */
  const MSG_EXPORTAR = 'Modo visualización: la descarga y exportación de reportes no está autorizada para esta cuenta.';
  function bloquearExportaciones(){
    if(bloquearExportaciones.hecho) return;
    bloquearExportaciones.hecho = true;
    const A = window.HTMLAnchorElement && HTMLAnchorElement.prototype;
    if(A){
      const clic = A.click;
      A.click = function(){
        if(!puedeExportar() && this.hasAttribute('download')){ aviso(MSG_EXPORTAR); return; }
        return clic.apply(this, arguments);
      };
      const despachar = A.dispatchEvent || EventTarget.prototype.dispatchEvent;
      A.dispatchEvent = function(ev){
        if(!puedeExportar() && this.hasAttribute && this.hasAttribute('download') && ev && ev.type === 'click'){ aviso(MSG_EXPORTAR); return false; }
        return despachar.apply(this, arguments);
      };
    }
    const imprimir = window.print;
    window.print = function(){
      if(!puedeExportar()){ aviso(MSG_EXPORTAR); return; }
      return imprimir.apply(this, arguments);
    };
    const abrir = window.open;
    window.open = function(url){
      if(!puedeExportar() && /wa\.me|whatsapp/i.test(String(url || ''))){ aviso(MSG_EXPORTAR); return null; }
      return abrir.apply(this, arguments);
    };
    try{
      const cb = navigator.clipboard;
      if(cb){
        ['writeText','write'].forEach(m => {
          const original = cb[m] && cb[m].bind(cb);
          if(!original) return;
          cb[m] = function(){
            if(!puedeExportar()){ aviso(MSG_EXPORTAR); return Promise.reject(new Error(MSG_EXPORTAR)); }
            return original.apply(null, arguments);
          };
        });
      }
    }catch(_){ /* el portapapeles no se puede envolver en este navegador */ }
  }
  function bloquearXLSX(){
    if(typeof XLSX === 'undefined') return;
    ['writeFile','writeFileXLSX','writeFileAsync'].forEach(m => {
      const original = XLSX[m];
      if(typeof original !== 'function' || original.__vista) return;
      XLSX[m] = function(){
        if(!puedeExportar()){ aviso(MSG_EXPORTAR); return; }
        return original.apply(this, arguments);
      };
      XLSX[m].__vista = true;
    });
  }

  /* Comandos de exportación y de modificación: se ocultan en pantalla (la protección real son las barreras de arriba). */
  const RE_EXPORTAR = /(exportar|descargar|imprimir|whatsapp|\.xlsx|\bjpg\b|\bpng\b|\bpdf\b)/i;
  const RE_MODIFICAR = /^\s*(\+\s*)?(nuev[oa]\b|agregar|añadir|crear|guardar|eliminar|borrar|editar|modificar|registrar|finalizar|iniciar|detener|reanudar|pausar|reabrir|publicar|cerrar (semana|turno|rotaci)|confirmar (y |distribuci)|aprobar|rechazar|importar|copiar semana|corregir|solicitar|pedir|cancelar programaci)/i;
  function textoControl(el){
    return (el.textContent || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('onclick') || '');
  }
  function depurarControles(raiz){
    const base = raiz && raiz.querySelectorAll ? raiz : document;
    const objetivos = base.querySelectorAll('#main button, #main a.btn, #modal-root button, #main [role="button"]');
    const exp = !puedeExportar();
    objetivos.forEach(el => {
      if(el.closest('[data-vista-conservar]') || el.closest('.sidebar') || el.closest('#glacial-sidebar')) return;
      const t = textoControl(el);
      const oculto = (exp && RE_EXPORTAR.test(t)) || RE_MODIFICAR.test((el.textContent || '').trim());
      if(oculto){ el.setAttribute('data-vista-oculto','1'); el.hidden = true; el.style.display = 'none'; }
    });
  }
  function restaurarControles(){
    document.querySelectorAll('[data-vista-oculto]').forEach(el => {
      el.removeAttribute('data-vista-oculto'); el.hidden = false; el.style.display = '';
    });
  }
  let observador = null, pendiente = 0;
  function observar(){
    if(observador || typeof MutationObserver === 'undefined') return;
    observador = new MutationObserver(() => {
      if(pendiente) return;
      pendiente = setTimeout(() => { pendiente = 0; if(activo()) depurarControles(document); }, 60);
    });
    observador.observe(document.body, {childList:true, subtree:true});
  }

  /* ---------- etiqueta, estilos y sincronización ---------- */
  function estilos(){
    if(document.getElementById('vista-css')) return;
    const s = document.createElement('style'); s.id = 'vista-css';
    s.textContent =
      '#vista-aviso{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);background:#10265f;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;z-index:10050;opacity:0;pointer-events:none;transition:.2s;max-width:90vw;text-align:center}' +
      '#vista-aviso.visible{opacity:1;transform:translate(-50%,0)}' +
      '.vista-etiqueta{display:none;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:#e8f1fb;color:#0b4a8a;font-size:12px;font-weight:700;white-space:nowrap}' +
      'body.glacial-vista .vista-etiqueta{display:inline-flex}.vista-etiqueta svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2}' +
      'body.glacial-vista #app-screen #modo-turno-box,body.glacial-vista #app-screen .modo-turno-box,body.glacial-vista #app-screen .modo-switch,body.glacial-vista .topbar #modo-turno-box{display:none!important}' +
      '.vista-sin-acceso{max-width:520px;margin:40px auto}' +
      '@media(max-width:700px){.vista-etiqueta{padding:6px 10px;font-size:11px}}';
    document.head.appendChild(s);
  }
  function etiqueta(){
    if(document.getElementById('vista-etiqueta')) return;
    const slot = document.querySelector('.topbar-right');
    if(!slot) return;
    const e = document.createElement('div');
    e.id = 'vista-etiqueta'; e.className = 'vista-etiqueta'; e.setAttribute('role','status');
    e.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg><span>Modo visualización</span>';
    slot.insertBefore(e, slot.firstChild);
  }

  let estadoAnterior = '';
  function sincronizar(){
    estilos();
    bloquearFirestore();
    bloquearGuardados();
    bloquearExportaciones();
    bloquearXLSX();
    filtrarPorLinea('loadRecords'); filtrarPorLinea('loadPaletas'); filtrarPorLinea('loadProgramaciones');
    sincronizarLineas();
    const on = activo();
    if(document.body){
      etiqueta();
      document.body.classList.toggle('glacial-vista', on);
      if(on){ observar(); depurarControles(document); }
      else if(estadoAnterior === 'on') restaurarControles();
    }
    estadoAnterior = on ? 'on' : 'off';
  }

  /* Un cambio del administrador (llega por sync/users) reevalúa menú, controles y acceso de la sesión abierta. */
  const usuariosActualizados = onUsersUpdated;
  onUsersUpdated = function(){
    const antes = JSON.stringify(configDe(usuarioActual()));
    const r = usuariosActualizados.apply(this, arguments);
    sincronizar();
    if(JSON.stringify(configDe(usuarioActual())) !== antes && usuarioActual()){
      if(typeof renderSidebar === 'function') renderSidebar();
      if(typeof renderMain === 'function') renderMain();
    }
    return r;
  };
  window.onUsersUpdated = onUsersUpdated;

  window.glacialCierresSesion = window.glacialCierresSesion || [];
  window.glacialCierresSesion.push(() => { sincronizarLineas(); });

  window.glacialVista = {
    MODULOS, AREAS, LINEAS: LINEAS_TODAS, ORDEN_VISTAS,
    configDe, activoDe, activo, config, puedeModulo, algunModulo, lineaPermitida, lineasVisibles, puedeExportar,
    tabPermitida, primeraTab, corregirVista, sincronizar, mostrarSinAcceso, aviso, sinModo,
    escrituraBloqueada: ref => escrituraBloqueada(ref),
    normalizarConfig: c => ({
      activo: !!(c && c.activo),
      modulos: (c && Array.isArray(c.modulos) ? c.modulos : []).filter(k => POR_CLAVE[k]),
      lineas: (c && Array.isArray(c.lineas) ? c.lineas : []).filter(l => LINEAS_TODAS.includes(l)),
      exportar: !!(c && c.exportar)
    })
  };
})();
