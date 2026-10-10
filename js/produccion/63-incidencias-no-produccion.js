/* =============================================================
   GLACIAL · MOTIVOS DE NO PRODUCCIÓN (incidencias informativas por línea)
   -------------------------------------------------------------
   Explica por qué una línea no produce (falta de personal, falla de máquina…). Es INFORMATIVO:
     · NO es una parada oficial (no crea paradas en Avance/Cierre, no suma minutos, no toca el ratio ni la producción);
     · NO es un estado operativo (no sustituye Programada, Pendiente, Detenida, Finalizada).
   Fuentes separadas (ver docs/inicio-motivos-sin-produccion.md):
     estado de la línea → Producción Actual / semáforo · motivo → este registro · tiempos de paradas → Avance/Cierre.

   MODELO (colección incidenciasNoProduccion, un documento por fecha operativa + bloque + línea → no hay vigentes duplicadas):
     {linea, fecha, bloque:'DIA_INTERMEDIO'|'NOCHE', estado:'VIGENTE'|'RESUELTA', motivo, descripcion,
      registradoPor, registradoUid, registradoEn (ms), resueltoEn, resueltoPor, resueltoPorEvento,
      historial:[{accion:'REGISTRO'|'CORRECCION'|'RESOLUCION', en, por, uid, motivo, descripcion, anterior|evento}],
      actualizadoUid, actualizadoEn (hora del servidor)}
   Un nuevo motivo después de una resolución reabre el mismo documento y conserva lo anterior en `historial`.
   Un motivo de ayer o de otro bloque nunca se reutiliza: el documento es de su fecha y bloque.

   RESOLUCIÓN: solo un inicio o una reanudación REAL posterior al registro (botones Iniciar / Reanudar de Producción Actual) la cierra.
   Abrir Inicio, un registro antiguo o producción acumulada previa NO la cierran, y quien solo consulta nunca escribe.
   ============================================================= */
(function instalarIncidenciasNoProduccion(){
  'use strict';

  const COL = 'incidenciasNoProduccion';
  const MOTIVOS = ['Falta de personal','Falla de máquina','Falta de insumos','Mantenimiento','Limpieza','Cambio de formato','Otra causa'];
  const LINEAS = ['PET1','PET2','B7L','C20L','B20L'];

  const num = v => Number(v) || 0;
  const bloqueDe = turno => String(turno || '').toUpperCase().includes('NOCHE') ? 'NOCHE' : 'DIA_INTERMEDIO';
  const idDe = (fecha, bloque, linea) => fecha + '_' + (bloque === 'NOCHE' ? 'NOCHE' : 'DIA') + '_' + linea;
  const ahoraMs = () => (typeof window.tareoAhoraServidor === 'function' ? window.tareoAhoraServidor() : Date.now());
  const esc = v => (typeof escaparHtml === 'function' ? escaparHtml(v) : String(v == null ? '' : v));
  const lineaAutorizada = l => !window.glacialVista || window.glacialVista.lineaPermitida(l);

  /* ---------- permisos ---------- */
  function puedeVer(){
    if(typeof state === 'undefined' || !state.user) return false;
    return !(typeof esMantCompartido === 'function' && esMantCompartido());
  }
  // Informa y corrige quien controla la línea como Producción (misma regla que Iniciar/Finalizar en Producción Actual).
  // Con el Modo visualización general activo nadie informa: es consulta.
  function puedeInformar(linea){
    if(window.glacialVista && window.glacialVista.activo()) return false;
    return puedeVer() && typeof window.glacialQuienControla === 'function' && window.glacialQuienControla(linea) === 'supervisor';
  }

  /* ---------- lectura en vivo (solo la fecha operativa que se está viendo) ---------- */
  let fechaEscucha = '', desub = null, docs = new Map(), listo = false, error = '';
  const oyentes = new Set();
  const avisar = () => oyentes.forEach(f => { try{ f(); }catch(e){ console.warn('Motivos de no producción:', e && e.message || e); } });

  function detener(){
    if(typeof desub === 'function'){ try{ desub(); }catch(_){ /* ya cerrada */ } }
    desub = null; fechaEscucha = ''; docs = new Map(); listo = false; error = '';
  }
  function escuchar(fecha){
    if(!puedeVer() || !fecha || typeof db === 'undefined') return;
    if(desub && fechaEscucha === fecha) return;
    detener();
    fechaEscucha = fecha;
    try{
      desub = db.collection(COL).where('fecha', '==', fecha).onSnapshot(snap => {
        docs = new Map(snap.docs.map(d => [d.id, Object.assign({id: d.id}, d.data({serverTimestamps:'estimate'}))]));
        listo = true; error = '';
        avisar();
      }, err => {
        listo = false; error = (err && err.message) || 'No se pudieron leer los motivos.';
        console.warn('Motivos de no producción:', error);
        avisar();
      });
    }catch(e){ error = (e && e.message) || String(e); }
  }
  function alCambiar(f){ oyentes.add(f); return () => oyentes.delete(f); }
  if(window.glacialCierresSesion) window.glacialCierresSesion.push(detener);

  const estado = () => ({listo, error, fecha: fechaEscucha});
  const doc = (fecha, bloque, linea) => docs.get(idDe(fecha, bloque, linea)) || null;
  function lista(fecha, bloque){
    return LINEAS.map(l => doc(fecha, bloque, l)).filter(d => d && lineaAutorizada(d.linea));
  }

  /* ---------- registrar / corregir / resolver (solo quien opera Producción) ---------- */
  function usuarioActual(){
    const u = state.user || {};
    let uid = '';
    try{ uid = (firebase.auth().currentUser || {}).uid || ''; }catch(_){ uid = ''; }
    return {nombre: String(u.nombre || u.username || '').trim() || 'Usuario', uid};
  }
  function validar(d){
    if(!LINEAS.includes(d.linea)) return 'Línea no válida.';
    if(!MOTIVOS.includes(d.motivo)) return 'Elige un motivo de la lista.';
    if(d.motivo === 'Otra causa' && String(d.descripcion || '').trim().length < 3) return 'Describe la causa (mínimo 3 caracteres).';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha || ''))) return 'Fecha operativa no válida.';
    return '';
  }
  async function registrar(datos){
    const bloque = bloqueDe(datos.bloque || datos.turno);
    const entrada = Object.assign({}, datos, {bloque});
    const falla = validar(entrada);
    if(falla) throw new Error(falla);
    if(!puedeInformar(entrada.linea)) throw new Error('No tienes permiso para informar el motivo de no producción de esta línea.');
    const ref = db.collection(COL).doc(idDe(entrada.fecha, bloque, entrada.linea));
    const quien = usuarioActual(), ts = ahoraMs();
    const descripcion = String(entrada.descripcion || '').trim().slice(0, 300);
    let accion = 'REGISTRO';
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const previo = snap.exists ? snap.data() : null;
      const vigente = !!previo && previo.estado === 'VIGENTE';
      accion = vigente ? 'CORRECCION' : 'REGISTRO';
      const paso = {accion, en: ts, por: quien.nombre, uid: quien.uid, motivo: entrada.motivo, descripcion};
      if(vigente) paso.anterior = {motivo: previo.motivo, descripcion: previo.descripcion || ''};
      tx.set(ref, {
        linea: entrada.linea, fecha: entrada.fecha, bloque, estado: 'VIGENTE',
        motivo: entrada.motivo, descripcion,
        registradoPor: quien.nombre, registradoUid: quien.uid, registradoEn: ts,
        resueltoEn: 0, resueltoPor: '', resueltoPorEvento: '',
        historial: [...(previo && Array.isArray(previo.historial) ? previo.historial : []), paso].slice(-50),
        actualizadoUid: quien.uid, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    return accion;
  }
  /* Cierra la incidencia vigente SOLO si el inicio / la reanudación es posterior a su registro. Nunca lanza: no debe frenar la operación. */
  async function resolverPorEvento(linea, fecha, turno, tsEvento, evento){
    try{
      if(!puedeVer() || (window.glacialVista && window.glacialVista.activo()) || typeof db === 'undefined') return false;
      const bloque = bloqueDe(turno);
      const ref = db.collection(COL).doc(idDe(fecha, bloque, linea));
      const quien = usuarioActual(), ts = num(tsEvento) || ahoraMs();
      let resuelta = false;
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if(!snap.exists) return;
        const d = snap.data();
        if(d.estado !== 'VIGENTE' || !(num(d.registradoEn) < ts)) return;     // un evento anterior no la cierra
        tx.set(ref, Object.assign({}, d, {
          estado: 'RESUELTA', resueltoEn: ts, resueltoPor: quien.nombre, resueltoPorEvento: evento || '',
          historial: [...(Array.isArray(d.historial) ? d.historial : []), {accion: 'RESOLUCION', en: ts, por: quien.nombre, uid: quien.uid, evento: evento || ''}].slice(-50),
          actualizadoUid: quien.uid, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        }));
        resuelta = true;
      });
      return resuelta;
    }catch(e){
      console.warn('No se pudo cerrar el motivo de no producción (no afecta la operación):', e && e.message || e);
      return false;
    }
  }

  /* ---------- qué líneas muestra el bloque «Líneas sin producción» (función pura, con pruebas) ----------
     Entradas: filas (de glacialResumenEjecutivoLineas), líneas autorizadas, incidencias de la fecha/bloque y el contexto.
     Reglas:
       · incidencia VIGENTE informada → se muestra aunque la línea no tenga paletas ni avance;
       · línea que debía producir y no lo hace (inicio del bloque ya pasó, hay programación vigente) →
           NO_INICIADA (nada empezó y no hay producción) o DETENIDA (estado real DETENIDA); sin causa registrada → «motivo pendiente»;
       · no se marca: inicio previsto aún no llegado, finalizadas/canceladas, en pausa programada, turnos sin programación,
         ni bloques que no son el vigente (una fecha pasada solo muestra lo informado).
       · una incidencia se considera superada cuando la línea está en producción real por un evento operativo POSTERIOR a su registro. */
  function sinProduccion(o){
    const filas = new Map((o.filas || []).map(f => [f.linea, f]));
    const salida = [];
    (o.lineas || []).forEach(linea => {
      const f = filas.get(linea) || null, inc = (o.incidencias || []).find(d => d && d.linea === linea && d.estado === 'VIGENTE') || null;
      const superada = !!(inc && f && f.enProduccionReal && num(f.ultimaOperacionMs) > num(inc.registradoEn));
      if(inc && !superada){
        salida.push({linea, pendiente: false, motivo: inc.motivo, descripcion: inc.descripcion || '', por: inc.registradoPor || '', en: num(inc.registradoEn), id: inc.id || '', causa: 'INFORMADA'});
        return;
      }
      if(!o.bloqueActual || !f || num(o.ahora) < num(o.inicioBloque)) return;
      if(!(num(f.programado) > 0)) return;
      let causa = '';
      if(f.detenidaReal) causa = 'DETENIDA';
      else if(!f.iniciadaReal && num(f.producido) === 0 && f.estado === 'PENDIENTE' && (f.detalle || []).every(d => d.estado === 'PENDIENTE')) causa = 'NO_INICIADA';
      if(causa) salida.push({linea, pendiente: true, motivo: '', descripcion: '', por: '', en: 0, id: '', causa});
    });
    return salida;
  }

  /* ---------- formulario «Informar motivo de no producción» (Producción Actual) ---------- */
  function estilos(){
    if(document.getElementById('inp-css')) return;
    const s = document.createElement('style'); s.id = 'inp-css';
    s.textContent =
      '.inp-fondo{position:fixed;inset:0;background:rgba(10,30,50,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}' +
      '.inp-modal{background:#fff;border-radius:12px;padding:18px 20px;width:min(460px,100%);max-height:90vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.25)}' +
      '.inp-modal h3{margin:0 0 4px;color:#103b57}.inp-modal .inp-sub{margin:0 0 12px;color:#5f7382;font-size:12px}' +
      '.inp-modal label{display:block;margin:10px 0 4px;font-size:12px;font-weight:700;color:#35506a}' +
      '.inp-modal select,.inp-modal textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd8e0;border-radius:7px;font:inherit}' +
      '.inp-modal .inp-nota{margin-top:10px;font-size:11px;color:#667784;line-height:1.4}.inp-modal .inp-error{color:#b42318;font-size:12px;min-height:16px;margin-top:6px}' +
      '.inp-acc{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}' +
      '.inp-tag{display:inline-flex;gap:6px;align-items:center;margin:4px 0 0;padding:4px 10px;border-radius:8px;background:#fff7e0;border:1px solid #f0d98c;color:#7a5200;font-size:12px;font-weight:700}';
    document.head.appendChild(s);
  }
  function abrirFormulario(linea, fecha, turno){
    const raiz = document.getElementById('modal-root');
    if(!raiz) return;
    if(!puedeInformar(linea)){ alert('No tienes permiso para informar el motivo de no producción de esta línea.'); return; }
    estilos();
    const bloque = bloqueDe(turno);
    const vigente = doc(fecha, bloque, linea);
    const actual = vigente && vigente.estado === 'VIGENTE' ? vigente : null;
    raiz.innerHTML = '<div class="inp-fondo" data-inp-fondo><div class="inp-modal" role="dialog" aria-modal="true" aria-labelledby="inp-titulo">' +
      '<h3 id="inp-titulo">' + (actual ? 'Corregir motivo de no producción' : 'Informar motivo de no producción') + '</h3>' +
      '<p class="inp-sub">' + esc(linea) + ' · ' + esc(fecha) + ' · ' + (bloque === 'NOCHE' ? 'NOCHE' : 'MAÑANA + INTERMEDIO') + '</p>' +
      '<label for="inp-motivo">Motivo</label><select id="inp-motivo"><option value="">Elige un motivo…</option>' +
      MOTIVOS.map(m => '<option' + (actual && actual.motivo === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select>' +
      '<label for="inp-desc">Descripción adicional <span id="inp-obl" style="font-weight:400"></span></label>' +
      '<textarea id="inp-desc" rows="3" maxlength="300">' + esc(actual ? actual.descripcion : '') + '</textarea>' +
      '<div class="inp-nota">Explica una situación: <b>no es una parada oficial</b>, no suma tiempos de parada, no cambia el ratio ni la producción. Quedan registrados tu usuario y la hora.</div>' +
      '<div class="inp-error" id="inp-error" role="alert"></div>' +
      '<div class="inp-acc"><button type="button" class="btn btn-ghost" data-inp-cancelar>Cancelar</button><button type="button" class="btn btn-primary" data-inp-guardar>Guardar</button></div>' +
      '</div></div>';
    const q = s => raiz.querySelector(s), cerrar = () => { raiz.innerHTML = ''; };
    const marcar = () => { q('#inp-obl').textContent = q('#inp-motivo').value === 'Otra causa' ? '(obligatoria)' : ''; };
    q('#inp-motivo').addEventListener('change', marcar); marcar();
    q('[data-inp-cancelar]').onclick = cerrar;
    q('[data-inp-fondo]').addEventListener('click', e => { if(e.target === e.currentTarget) cerrar(); });
    q('[data-inp-guardar]').onclick = async function(){
      const boton = this, error = q('#inp-error');
      error.textContent = '';
      const datos = {linea, fecha, bloque, motivo: q('#inp-motivo').value, descripcion: q('#inp-desc').value};
      const falla = validar(datos);
      if(falla){ error.textContent = falla; return; }
      boton.disabled = true;
      try{ await registrar(datos); cerrar(); avisar(); }
      catch(e){ error.textContent = 'No se guardó: ' + ((e && e.message) || e); boton.disabled = false; }
    };
    q('#inp-motivo').focus();
  }

  window.glacialIncidencias = {
    COL, MOTIVOS, LINEAS, bloqueDe, idDe, puedeVer, puedeInformar, escuchar, detener, alCambiar, estado, doc, lista,
    registrar, resolverPorEvento, sinProduccion, abrirFormulario, validar
  };
})();
