/* =============================================================
   GLACIAL · PRODUCCIÓN › PALETAS › CAPTURA AL MINUTO (26/11/2026) · docs/produccion/paletas-rapido.md
   Se carga DESPUÉS de 16-paletas.js, 21-programacion-turno.js y 16c-saldo-entrega.js y de 16d-paletas-cola.js (que trae la cola y las reglas puras).
   No cambia el modelo de datos: cada registro sigue siendo un ACUMULADO («paletas completas acumuladas») dentro de sync/paletas; solo se añade
   clientEventId + capturadoEn para que reenviar un registro no lo duplique.
   Qué agrega a la pestaña Paletas:
     · Marca y Presentación se autoseleccionan con el tramo vigente de la «Secuencia del turno» (fecha, turno y línea elegidos). El operario puede cambiarlas:
       desde ese momento (y para esa fecha/turno/línea) ya no se vuelven a tocar solas.
     · «+1 Paleta (Ahora)»: toma el minuto exacto del toque, suma 1 al acumulado visible (confirmados + pendientes) y lo guarda en la cola local.
       Bloqueado mientras guarda y 1,2 s después (doble toque). La edición manual (acumulado, Saldo, Hora, Observaciones) sigue igual.
     · «Hora» se mantiene en la hora actual mientras nadie la haya editado en esa captura.
     · Línea «Último registro: …» y el indicador «En línea / N pendientes por subir».
     · «Guardar» de un registro NUEVO también pasa por la cola (sin conexión no se pierde). Editar un registro existente sigue siendo directo.
     · Al agregar un tramo a la secuencia: si el tramo anterior no tiene hora de corte, se ofrece cortarlo a la hora actual.
   ============================================================= */
(function(){
  'use strict';
  const W = window;
  const Q = W.glacialPaletasCola;
  if(!Q || typeof renderPaletasTab !== 'function' || typeof guardarPaleta !== 'function' || typeof db === 'undefined') return;

  const esc = v => (typeof escaparHtml === 'function') ? escaparHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COOLDOWN_MS = 1200;

  /* ---------- reloj y contexto ---------- */
  const ahoraMs = () => (W.GlacialFecha && typeof W.GlacialFecha.ahoraMs === 'function') ? W.GlacialFecha.ahoraMs() : Date.now();
  function horaDe(ms){
    if(W.GlacialFecha && typeof W.GlacialFecha.ahoraLima === 'function'){
      const l = W.GlacialFecha.ahoraLima(ms);
      return String(l.hora).padStart(2, '0') + ':' + String(l.minuto).padStart(2, '0');
    }
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  const ctxDe = d => ({ linea: d.linea, fecha: d.fecha, turno: d.turno, marca: d.marca, presentacion: d.presentacion });
  const claveCtx = d => claveCombinacionPaletas(d.linea, d.fecha, d.turno, d.marca, d.presentacion);
  const mismoTurno = d => r => r && r.linea === d.linea && r.fecha === d.fecha && r.turno === d.turno;

  /* Acumulado visible = último registro de paletas COMPLETAS de la combinación (confirmados) o, si es posterior, el pendiente de la cola. */
  function acumuladoVisible(d){
    if(!d || !d.marca || !d.presentacion) return { paletas: 0, registro: null };
    const clave = claveCtx(d);
    const conf = paletasDeCombinacionPaletas(clave);
    const pend = Q.registrosPendientes().filter(r => esCombinacionPaletas(r, clave));
    return Q.acumuladoDe(Q.unir(conf, pend));
  }
  function ultimoRegistroTurno(d){
    if(!d) return null;
    const conf = (loadPaletas() || []).filter(mismoTurno(d));
    const pend = Q.registrosPendientes().filter(mismoTurno(d));
    return Q.ultimoDe(Q.unir(conf, pend));
  }

  /* ---------- envío real (lo usa la cola) ---------- */
  async function enviarRegistro(registro){
    const ref = db.collection('sync').doc('paletas');
    const res = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const lista = snap.exists && Array.isArray(snap.data().items) ? snap.data().items.slice() : [];
      /* Idempotencia: si el servidor ya tiene este id (o este evento), no se escribe nada y se da por subido. */
      const ya = lista.some(p => p && (p.id === registro.id || (registro.clientEventId && p.clientEventId === registro.clientEventId)));
      if(ya) return { items: lista, duplicado: true };
      lista.push(registro);
      tx.set(ref, { items: lista, updatedAt: Date.now() });
      return { items: lista, duplicado: false };
    });
    _paletasCache = res.items;
    try{ if(state.currentTab === 'paletas' && typeof actualizarVistaPaletas === 'function') actualizarVistaPaletas(); }catch(_){ /* la pantalla se repinta sola en el próximo aviso */ }
    return res.duplicado ? 'duplicado' : 'ok';
  }
  Q.configurar({ enviar: enviarRegistro, ahoraMs });

  /* ---------- registro a partir de la captura ---------- */
  function registroBase(d, o){
    const upp = o.upp, completa = o.tipo === 'COMPLETA';
    return {
      linea: d.linea, fecha: d.fecha, turno: d.turno, marca: d.marca, presentacion: d.presentacion,
      hora: o.hora,
      tipoPaleta: o.tipo,
      paletas: completa ? o.paletas : 1,
      unidadesPorPaleta: upp,
      paquetesIncompleta: completa ? null : o.paquetes,
      unidadesIncompleta: completa ? 0 : o.unidadesSaldo,
      totalUnidades: completa ? Math.round(o.paletas * upp) : o.unidadesSaldo,
      observaciones: o.observaciones || '',
      usuario: nombreUsuarioActualPaletas(),
      usuarioUsername: (state.user && state.user.username) || '',
      actualizadoPor: nombreUsuarioActualPaletas()
    };
  }

  /* ---------- estado de la captura ---------- */
  let bloqueado = false, hasta = 0, mensaje = null, relojMsg = null;
  const horaManual = new WeakSet();            // borradores cuya Hora editó el usuario
  const marcaManual = new WeakMap();           // borrador → «fecha|turno|línea» en que el usuario eligió marca/presentación a mano
  let tramoActual = null;                      // { i, n, tramo } para mostrarlo
  const clavePantalla = d => [d.linea, d.fecha, d.turno].join('|');
  const puedeRegistrar = () => { try{ return !!tienePermiso('paletas'); }catch(_){ return false; } };

  function avisar(texto, tipo){
    mensaje = { texto, tipo: tipo || 'ok' };
    clearTimeout(relojMsg);
    relojMsg = setTimeout(() => { mensaje = null; pintarBarra(); }, 7000);
    pintarBarra();
  }

  /* ---------- Secuencia del turno → marca/presentación ---------- */
  function unidadesDelTramo(d, t){
    try{
      const r = resumenProgramacionCombinacionTurnos(d.linea, d.fecha, [d.turno], t.marca, t.presentacion);
      return Number(r && r.unidadesProducidas) || 0;
    }catch(_){ return 0; }
  }
  /* Devuelve true si cambió marca/presentación (hay que volver a dibujar). */
  function aplicarTramo(){
    const d = draftPaleta;
    if(!d || paletaEditId || !puedeRegistrar() || !W.GlacialFecha) return false;
    const manual = marcaManual.get(d) === clavePantalla(d);
    const tramos = tramosSecuenciaTurnoPaletas(d.linea, d.fecha, d.turno);
    tramoActual = null;
    if(!tramos.length) return false;
    const t = Q.tramoVigente(tramos, {
      ahoraMs: ahoraMs(),
      msHora: h => W.GlacialFecha.hhmmAMs(d.fecha, h, d.turno),
      unidades: x => unidadesDelTramo(d, x)
    });
    if(!t) return false;
    tramoActual = { i: tramos.findIndex(x => x.id === t.id) + 1, n: tramos.length, tramo: t };
    if(manual) return false;                   // el operario ya eligió a mano para esta fecha/turno/línea: no se le cambia
    if(t.marca === d.marca && t.presentacion === d.presentacion) return false;
    d.marca = t.marca; d.presentacion = t.presentacion;
    return true;
  }

  /* ---------- barra rápida ---------- */
  const CSS = `<style>
    #paleta-rapido{border-top:1px solid #e3e9ee;background:#f4faff}
    #paleta-rapido .pr-fila{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
    #paleta-rapido .pr-mas{min-height:52px;padding:0 22px;font-size:18px;font-weight:800;border-radius:12px}
    #paleta-rapido .pr-mas small{display:block;font-size:11px;font-weight:600;opacity:.85}
    #paleta-rapido .pr-acum{font-size:15px;color:#033350}
    #paleta-rapido .pr-acum b{font-size:30px;line-height:1;margin:0 4px}
    #paleta-rapido .pr-sync{margin-left:auto;font-size:13px;font-weight:700;padding:4px 10px;border-radius:999px;background:#e7f6ec;color:#15803d}
    #paleta-rapido .pr-sync.subiendo{background:#fff4d6;color:#8a5a00}
    #paleta-rapido .pr-sync.sin-conexion{background:#eef1f4;color:#4b5b68}
    #paleta-rapido .pr-sync.error{background:#fdecec;color:#991b1b}
    #paleta-rapido .pr-nota{margin-top:8px;font-size:13px}
    #paleta-rapido .pr-msg{margin-top:8px;padding:8px 10px;border-radius:8px;font-size:13px;background:#e7f6ec;color:#15803d}
    #paleta-rapido .pr-msg.error{background:#fdecec;color:#991b1b}
    #paleta-rapido .pr-pend{margin-top:8px;display:grid;gap:4px;font-size:13px}
    #paleta-rapido .pr-pend .rech{color:#991b1b}
  </style>`;

  function htmlBarra(){
    const d = draftPaleta;
    if(!d) return '';
    const est = Q.estado();
    const av = acumuladoVisible(d);
    const listo = !!(d.marca && d.presentacion) && !paletaEditId;
    const bloq = bloqueado || _guardandoPaleta || Date.now() < hasta;
    const destino = d.marca && d.presentacion
      ? (typeof nombrePresentacionUI === 'function' ? nombrePresentacionUI(d.linea, d.marca, d.presentacion) : d.presentacion)
      : '';
    const ult = ultimoRegistroTurno(d);
    let ultTxt = 'Último registro: aún no hay registros en este turno.';
    if(ult){
      const m = Q.minutosDesde(ult.creadoEn || ult.actualizadoEn, ahoraMs());
      const cual = ult.tipoPaleta === 'INCOMPLETA' ? 'Saldo ' + (Number(ult.unidadesIncompleta) || 0) + ' UND' : (Number(ult.paletas) || 0) + ' acumuladas';
      ultTxt = 'Último registro: <b>' + esc(cual) + '</b> · ' + esc(ult.marca) + ' · ' + esc(typeof nombrePresentacionUI === 'function' ? nombrePresentacionUI(ult.linea, ult.marca, ult.presentacion) : ult.presentacion) +
        ' · <b>' + esc(ult.hora || '—') + '</b>' + (m === null ? '' : ' (' + esc(Q.textoMinutos(m)) + ')') + (Q.registrosPendientes().some(r => r.id === ult.id) ? ' · <i>pendiente por subir</i>' : '');
    }
    const nota = paletaEditId
      ? '<div class="pr-nota small-muted">Estás editando un registro: termina o cancela la edición para usar «+1 Paleta».</div>'
      : tramoActual
        ? '<div class="pr-nota small-muted">Secuencia del turno: tramo ' + tramoActual.i + ' de ' + tramoActual.n + ' · <b>' + esc(tramoActual.tramo.marca || '') + '</b> (' + esc(textoFinTramoPaletas(tramoActual.tramo)) + '). Marca y presentación se eligen solas; puedes cambiarlas.</div>'
        : '';
    const pend = Q.todos().sort((a, b) => a.capturadoMs - b.capturadoMs).map(e => {
      const r = e.registro, txt = esc(r.hora || '') + ' · ' + (r.tipoPaleta === 'INCOMPLETA' ? 'saldo ' + (Number(r.unidadesIncompleta) || 0) + ' UND' : (Number(r.paletas) || 0) + ' acumuladas') + ' · ' + esc(r.marca);
      return e.estado === 'rechazado'
        ? '<div class="rech">✘ ' + txt + ' — rechazado: ' + esc(e.ultimoError || 'sin detalle') + ' <button type="button" class="btn btn-ghost btn-sm" onclick="paletaColaDescartar(\'' + esc(e.clientEventId) + '\')">Descartar</button></div>'
        : '<div>⏳ ' + txt + ' — pendiente por subir</div>';
    }).join('');
    return CSS +
      '<div class="pr-fila">' +
        '<button type="button" id="btn-paleta-mas1" class="btn btn-primary pr-mas" onclick="paletaMasUnoAhora()" ' + (!listo || bloq ? 'disabled' : '') + '>+1 Paleta (Ahora)' +
          (listo ? '<small>→ ' + (av.paletas + 1) + ' · ' + esc(d.marca) + ' · ' + esc(destino) + '</small>' : '<small>elige marca y presentación</small>') + '</button>' +
        '<div class="pr-acum">Acumulado actual<b id="paleta-acumulado">' + av.paletas + '</b>paletas completas</div>' +
        '<span class="pr-sync ' + est.clase + '" id="paleta-sync-estado" role="status">● ' + esc(est.texto) + '</span>' +
      '</div>' +
      '<div class="pr-nota small-muted" id="paleta-ultimo">' + ultTxt + '</div>' + nota +
      (mensaje ? '<div class="pr-msg ' + (mensaje.tipo === 'error' ? 'error' : '') + '" role="status">' + esc(mensaje.texto) + '</div>' : '') +
      (pend ? '<div class="pr-pend">' + pend + (est.rechazados ? '<div><button type="button" class="btn btn-ghost btn-sm" onclick="paletaColaReintentar()">Reintentar los rechazados</button></div>' : '') + '</div>' : '');
  }
  function pintarBarra(){
    const el = document.getElementById('paleta-rapido');
    if(!el) return;
    try{ el.innerHTML = htmlBarra(); }catch(e){ console.warn('Barra de paletas:', e && e.message || e); }
  }
  function campoPorEtiqueta(panel, etiqueta){
    return Array.from(panel.querySelectorAll('.field-sm')).find(el => { const l = el.querySelector('label'); return l && l.textContent.trim() === etiqueta; });
  }
  function montarBarra(){
    const panel = document.getElementById('paletas-form-panel');
    if(!panel || !draftPaleta || !puedeRegistrar()) return;
    const hora = campoPorEtiqueta(panel, 'Hora');
    if(!hora) return;
    const fila = hora.closest('.panel-body');
    const previo = document.getElementById('paleta-rapido'); if(previo) previo.remove();
    const barra = document.createElement('div');
    barra.id = 'paleta-rapido'; barra.className = 'panel-body';
    fila.insertAdjacentElement('beforebegin', barra);
    const inp = hora.querySelector('input');
    if(inp){
      inp.id = 'paleta-hora-input';
      if(!horaManual.has(draftPaleta) && !paletaEditId){ const h = horaDe(ahoraMs()); draftPaleta.hora = h; inp.value = h; }
      inp.addEventListener('input', () => { if(draftPaleta) horaManual.add(draftPaleta); });
    }
    pintarBarra();
  }

  /* ---------- «+1 Paleta (Ahora)» ---------- */
  W.paletaMasUnoAhora = async function(){
    if(bloqueado || _guardandoPaleta || Date.now() < hasta) return;        // anti doble toque
    const d = draftPaleta;
    if(!tienePermiso('paletas') || !d || !visibleLines().some(l => l.key === d.linea)){ alert('No tienes permiso para registrar paletas en esta línea.'); return; }
    if(paletaEditId){ alert('Estás editando un registro: guarda o cancela la edición primero.'); return; }
    if(!d.marca || !d.presentacion){ alert('Selecciona una marca y una presentación.'); return; }
    const upp = unidadesPorPaletaActiva(d.linea, d.fecha, d.turno, d.marca, d.presentacion);
    if(!upp){ alert('Faltan unidades por paleta para esta presentación. Solicita a jefatura que las configure.'); return; }
    const ms = ahoraMs();                                                   // el minuto exacto del toque
    if(d.fecha !== fechaHoyPaletas() && !confirm('La fecha elegida (' + d.fecha + ') no es la del día operativo actual (' + fechaHoyPaletas() + '). ¿Registrar la paleta en esa fecha?')) return;
    bloqueado = true; pintarBarra();
    try{
      const nuevo = acumuladoVisible(d).paletas + 1;
      const ev = Q.nuevoEvento(registroBase(d, { tipo: 'COMPLETA', paletas: nuevo, upp, hora: horaDe(ms) }), ms);
      Q.encolar(ev);
      d.paletas = nuevo;                                                    // el campo manual queda con el acumulado nuevo
      const campo = document.querySelector('#paletas-form-panel input[oninput^="actualizarPaletaCantidad"]'); if(campo) campo.value = String(nuevo);
      const r = await Q.sincronizar();
      avisar(r.pendientes ? '✔ +1 guardada en este equipo (' + nuevo + ' acumuladas · ' + horaDe(ms) + '). Se subirá sola al recuperar la conexión.'
                          : '✔ +1 registrada: ' + nuevo + ' acumuladas · ' + horaDe(ms), 'ok');
      try{ if(typeof actualizarVistaPaletas === 'function') actualizarVistaPaletas(); }catch(_){ /* se repinta con el aviso en vivo */ }
    }catch(e){
      avisar('No se pudo registrar: ' + ((e && e.message) || e), 'error');
    }finally{
      bloqueado = false; hasta = Date.now() + COOLDOWN_MS; pintarBarra();
      setTimeout(pintarBarra, COOLDOWN_MS + 50);
    }
  };
  W.paletaColaReintentar = () => { Q.reintentarRechazados(); };
  W.paletaColaDescartar = id => { if(confirm('¿Descartar este registro rechazado? No se subirá.')) Q.descartar(id); };

  /* ---------- «Guardar» manual de un registro NUEVO: también por la cola ---------- */
  const guardarAnterior = guardarPaleta;
  guardarPaleta = async function(){
    if(paletaEditId) return guardarAnterior.apply(this, arguments);        // editar un registro existente: directo, como antes
    const d = draftPaleta;
    if(!tienePermiso('paletas') || !d || !visibleLines().some(l => l.key === d.linea)){ alert('No tienes permiso para registrar paletas en esta línea.'); return; }
    if(_guardandoPaleta || bloqueado || Date.now() < hasta) return;
    if(!d.marca || !d.presentacion){ alert('Selecciona una marca y una presentación.'); return; }
    const completa = d.tipoPaleta !== 'INCOMPLETA';
    const upp = unidadesPorPaletaActiva(d.linea, d.fecha, d.turno, d.marca, d.presentacion);
    let opciones;
    if(completa){
      const paletas = Number(d.paletas);
      if(!Number.isSafeInteger(paletas) || paletas < 0 || !upp){ alert(!upp ? 'Faltan unidades por paleta para esta presentación.' : 'Ingresa las paletas completas acumuladas (0 o más).'); return; }
      opciones = { tipo: 'COMPLETA', paletas, upp };
    }else{
      const eq = typeof W.glacialEquivalenciaSaldo === 'function' ? W.glacialEquivalenciaSaldo(d.linea, d.marca, d.presentacion) : null;
      if(!eq){ alert('Falta equivalencia para esta marca y presentación.'); return; }
      const entrada = String(d.paquetesIncompleta == null ? '' : d.paquetesIncompleta).trim(), cantidad = Number(entrada);
      if(entrada === '' || !Number.isSafeInteger(cantidad) || cantidad < 0 || !Number.isSafeInteger(cantidad * eq.factor)){ alert('Ingresa un saldo entero de ' + eq.plural + ' (0 o más).'); return; }
      opciones = { tipo: 'INCOMPLETA', paquetes: cantidad, unidadesSaldo: cantidad * eq.factor, upp };
    }
    const ms = ahoraMs();
    opciones.hora = /^\d{1,2}:\d{2}$/.test(String(d.hora || '')) ? d.hora : horaDe(ms);
    opciones.observaciones = d.observaciones || '';
    _guardandoPaleta = true;
    const btn = document.getElementById('btn-guardar-paleta'), textoOriginal = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = 'Guardando...'; }
    pintarBarra();
    try{
      Q.encolar(Q.nuevoEvento(registroBase(d, opciones), ms));
      const r = await Q.sincronizar();
      const { fecha, turno, marca, presentacion } = d;
      const eraManual = marcaManual.get(d) === clavePantalla(d);
      paletaEditId = null;
      draftPaleta = blankPaleta(state.currentLine);
      Object.assign(draftPaleta, { fecha, turno, marca, presentacion });
      if(eraManual) marcaManual.set(draftPaleta, clavePantalla(draftPaleta));   // si había elegido a mano, se respeta en el siguiente registro
      renderPaletasTab();
      avisar(r.pendientes ? '✔ Guardado en este equipo; se subirá solo al recuperar la conexión.' : '✔ Registro guardado.', 'ok');
    }catch(error){
      if(typeof _avisarErrorGuardado === 'function') _avisarErrorGuardado('paletas', error); else alert((error && error.message) || error);
    }finally{
      _guardandoPaleta = false; hasta = Date.now() + COOLDOWN_MS;
      if(btn && btn.isConnected !== false){ btn.disabled = false; btn.textContent = textoOriginal; }
      pintarBarra();
    }
  };

  /* ---------- enganches en la pestaña ---------- */
  const actualizarCampoAnterior = actualizarPaletaCampoYRerenderizar;
  actualizarPaletaCampoYRerenderizar = function(el, name){
    if(draftPaleta && (name === 'marca' || name === 'presentacion')) marcaManual.set(draftPaleta, clavePantalla(draftPaleta));   // el operario manda en esta fecha/turno/línea
    return actualizarCampoAnterior.apply(this, arguments);
  };

  const renderAnterior = renderPaletasTab;
  renderPaletasTab = function(){
    let r = renderAnterior.apply(this, arguments);
    try{
      if(aplicarTramo()) r = renderAnterior.apply(this, arguments);        // la secuencia cambió marca/presentación: se dibuja con la nueva selección
      montarBarra();
    }catch(e){ console.warn('Paletas · captura rápida:', e && e.message || e); }
    return r;
  };

  const vistaAnterior = actualizarVistaPaletas;
  actualizarVistaPaletas = function(){
    const r = vistaAnterior.apply(this, arguments);
    pintarBarra();
    return r;
  };

  /* Al agregar un tramo: si el anterior no tenía hora de corte, se ofrece cortarlo ahora. */
  const agregarAnterior = agregarTramoSecuenciaDesdeFormulario;
  agregarTramoSecuenciaDesdeFormulario = async function(){
    let previo = null, antes = 0;
    try{
      if(puedeProgramarPaletas() && draftPaleta){
        const tramos = tramosSecuenciaTurnoPaletas(draftPaleta.linea, draftPaleta.fecha, draftPaleta.turno);
        antes = tramos.length; previo = Q.tramoPrevioSinCorte(tramos);
      }
    }catch(_){ previo = null; }
    const r = await agregarAnterior.apply(this, arguments);
    try{
      if(previo && draftPaleta && tramosSecuenciaTurnoPaletas(draftPaleta.linea, draftPaleta.fecha, draftPaleta.turno).length > antes){
        const hora = horaDe(ahoraMs());
        if(confirm('El tramo anterior (' + (previo.marca || '') + ' · ' + (previo.presentacion || '') + ') no tenía hora de corte.\n\n¿Cortarlo a las ' + hora + ' (ahora)?\n\nAceptar: ese tramo termina a las ' + hora + ' y el nuevo empieza ahí.\nCancelar: el tramo anterior queda como estaba.')){
          const ref = db.collection('sync').doc('programaciones'), ahora = Date.now();
          _programacionesCache = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            const lista = snap.exists && Array.isArray(snap.data().items) ? snap.data().items.slice() : [];
            const i = lista.findIndex(p => p.clave === previo.claveProgramacion);
            if(i < 0) return lista;
            lista[i] = { ...lista[i], actualizadoEn: ahora, tramosSecuencia: (Array.isArray(lista[i].tramosSecuencia) ? lista[i].tramosSecuencia : [])
              .map(t => t.id === previo.id ? { ...t, tipoFin: 'HORA', horaFin: hora, cantidadObjetivo: 0, corteAutomatico: true } : t) };
            tx.set(ref, { items: lista, updatedAt: ahora });
            return lista;
          });
          renderPaletasTab();
        }
      }
    }catch(e){ console.warn('No se pudo cortar el tramo anterior:', e && e.message || e); alert('El tramo nuevo se agregó, pero no se pudo cortar el anterior: ' + ((e && e.message) || e)); }
    return r;
  };

  /* ---------- reloj de la pantalla (cada 10 s: la Hora y los «hace N min» siguen al minuto real) ---------- */
  setInterval(() => {
    const panel = document.getElementById('paletas-form-panel');
    if(!panel || !draftPaleta || state.currentTab !== 'paletas') return;
    if(!paletaEditId && !horaManual.has(draftPaleta)){
      const h = horaDe(ahoraMs());
      if(draftPaleta.hora !== h){ draftPaleta.hora = h; const inp = document.getElementById('paleta-hora-input'); if(inp && document.activeElement !== inp) inp.value = h; }
    }
    let cambio = false;
    try{ cambio = aplicarTramo(); }catch(_){ cambio = false; }
    if(cambio){
      const a = document.activeElement;
      if(!(a && panel.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))){ renderPaletasTab(); avisar('La secuencia cambió de tramo: ahora ' + draftPaleta.marca + ' · ' + draftPaleta.presentacion + '.', 'ok'); return; }
    }
    pintarBarra();
  }, 10000);

  Q.alCambiar(pintarBarra);
  try{ if(typeof db._alCambiarConexion === 'function') db._alCambiarConexion(() => { Q.sincronizar(); pintarBarra(); }); }catch(_){ /* sin aviso de conexión: quedan los eventos del navegador */ }
  Q.iniciar();

  W.glacialPaletasRapido = { acumuladoVisible, ultimoRegistroTurno, aplicarTramo, enviarRegistro, pintarBarra };
  if(W.Glacial && typeof W.Glacial.exponer === 'function') W.Glacial.exponer('Paletas', { masUnoAhora: W.paletaMasUnoAhora, acumuladoVisible, enviarRegistro });
})();
