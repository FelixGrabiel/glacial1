/* =============================================================
   GLACIAL · TIEMPO EXTRA DE SUPERVISORES (solo Administrador)
   -------------------------------------------------------------
   Panel dentro de «Rotación de supervisores», visible SOLO para el Administrador. Muestra el estado de la
   ventana de cada supervisor (17b-ventana-supervisor.js) y permite darle más minutos con un MOTIVO obligatorio.

   DÓNDE SE GUARDA: colección ampliacionesTurno (un documento por ampliación):
     { id, username, nombre, fechaOperativa, turno, minutos, motivo, estado:'VIGENTE'|'ANULADA',
       creadoUid, creadoPor, creadoEn (hora del servidor), motivoAnulacion?, anuladoUid?, anuladoPor?, anuladoEn? }
   Nada se borra: una ampliación equivocada se ANULA con motivo y queda el registro.
   Regla del servidor: supabase/migraciones/glacial_29_ampliaciones_turno.sql (solo el Administrador crea o anula;
   lee todo usuario con sesión, para que cada supervisor vea su tiempo extra).

   Los minutos se suman al cierre del turno; si el turno ya había cerrado, cuentan desde el momento en que se dan.
   Cargar DESPUÉS de 31-rotacion-supervisores.js y de 17b-ventana-supervisor.js.
   ============================================================= */
(function(){
  'use strict';
  const VS = window.glacialVentanaSupervisor;
  if(!VS || typeof renderRotacionSupervisores !== 'function') return;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const esAdmin = () => !!(typeof state !== 'undefined' && state.user && String(state.user.rol || '').trim() === 'Administrador');
  const nombreTurno = t => ({ 'DÍA':'Día', 'INTERMEDIO':'Intermedio', 'NOCHE':'Noche' }[t] || t || '');
  const hora = ms => VS.horaLima(ms);
  const MIN_MAX = 480;

  let abierto = null;          // username con el formulario abierto
  let minutosElegidos = 30;
  let mensaje = '', mensajeTipo = '';

  function supervisores(){
    try{ return (typeof rotSupSupervisores === 'function' ? rotSupSupervisores() : []).filter(u => VS.aplicaA(u)); }
    catch(_){ return []; }
  }

  /* Turno al que se le suma el tiempo: el abierto, el que acaba de cerrar o el próximo. */
  function ventanaObjetivo(st){ return st.ventana || st.ultima || st.proxima || null; }

  function textoEstado(st){
    if(st.estado === 'CARGANDO') return '<span class="amp-gris">Cargando…</span>';
    if(st.estado === 'SIN_HORARIO') return '<span class="amp-ambar">Sin rotación ni horario</span>';
    if(st.puedeTrabajar && st.ventana) return '<span class="amp-verde">Trabajando · cierra ' + hora(st.ventana.cierreMs) + '</span>';
    if(st.estado === 'ANTES' && st.proxima) return '<span class="amp-gris">Abre ' + hora(st.proxima.aperturaMs) + '</span>';
    if(st.estado === 'CERRADA' && st.ultima) return st.cierreDesactivado
      ? '<span class="amp-gris">Fuera de horario (terminó ' + hora(st.ultima.cierreMs) + ')</span>'
      : '<span class="amp-rojo">🔒 Cerró ' + hora(st.ultima.cierreMs) + '</span>';
    return '<span class="amp-gris">' + (st.descansoHoy ? 'Descanso' : 'Sin turno') + '</span>';
  }

  function htmlFormulario(u, v){
    const otro = ![15, 30, 60].includes(minutosElegidos);
    const chip = m => `<button type="button" class="amp-chip ${minutosElegidos === m && !otro ? 'on' : ''}" onclick="ampTurnoElegir(${m})">${m} min</button>`;
    const cierreActual = v.cierreMs;
    const desde = Math.max(cierreActual, VS.estado().ahoraMs || Date.now());
    return `<div class="amp-form">
      <div class="amp-form-tit">Dar más tiempo a <b>${esc(u.nombre || u.username)}</b> · ${esc(nombreTurno(v.turno))} ${esc(v.fecha)} (${esc(v.inicio)}–${esc(v.fin)})</div>
      <div class="amp-chips">${chip(15)}${chip(30)}${chip(60)}
        <label class="amp-otro">Otro <input type="number" min="1" max="${MIN_MAX}" step="1" value="${otro ? minutosElegidos : ''}" placeholder="min" oninput="ampTurnoElegir(this.value, true)"></label></div>
      <label class="amp-mot">Motivo (obligatorio)
        <textarea id="amp-motivo" rows="2" maxlength="300" placeholder="Cierre de paletas pendiente en B7L" oninput="ampTurnoLimpiarMsg()"></textarea></label>
      <div class="amp-pie"><span class="amp-gris">Nuevo cierre aprox.: <b id="amp-nuevo">${hora(desde + minutosElegidos * 60000)}</b></span>
        <span><button type="button" class="btn btn-ghost" onclick="ampTurnoCancelar()">Cancelar</button>
        <button type="button" class="btn btn-glacial" onclick="ampTurnoConfirmar('${esc(u.username)}')">Confirmar</button></span></div>
      ${mensaje ? `<div class="amp-msg ${mensajeTipo}" role="${mensajeTipo === 'error' ? 'alert' : 'status'}">${esc(mensaje)}</div>` : ''}
    </div>`;
  }

  /* Interruptor «Cierre automático del modo Trabajar» (apagado por defecto). Ver 17b → VS.configCierre / VS.cierreActivo. */
  function htmlInterruptor(){
    const c = VS.configCierre(), hoyActivo = VS.cierreActivo();
    let estado;
    if(!c.cierreActivo) estado = '<span class="amp-gris"><b>DESACTIVADO</b> · los supervisores pueden trabajar a cualquier hora (el cronómetro solo informa).</span>';
    else if(!hoyActivo) estado = '<span class="amp-ambar"><b>PROGRAMADO</b> · empieza a aplicarse el ' + esc(c.desde) + '.</span>';
    else estado = '<span class="amp-verde"><b>ACTIVADO</b>' + (c.desde ? ' desde el ' + esc(c.desde) : '') + ' · al terminar su turno el supervisor queda en solo visualización.</span>';
    const quien = c.actualizadoPor ? ' <span class="amp-gris">(último cambio: ' + esc(c.actualizadoPor) + (c.actualizadoEnMs ? ' · ' + new Date(c.actualizadoEnMs).toLocaleString('es-PE') : '') + ')</span>' : '';
    return `<div class="amp-interruptor">
      <div><b>Cierre automático del modo Trabajar</b><br>${estado}${quien}</div>
      <div class="amp-int-acciones">
        ${c.cierreActivo
          ? `<button type="button" class="btn btn-ghost" onclick="ampCierreGuardar(false)">Desactivar</button>`
          : `<label class="amp-otro">A partir del <input type="date" id="amp-cierre-desde" value="${esc(c.desde || '')}"></label>
             <button type="button" class="btn btn-glacial" onclick="ampCierreGuardar(true)">Activar</button>`}
      </div>
    </div>`;
  }

  function htmlPanel(){
    const lista = supervisores();
    const estAmp = VS.estadoAmpliaciones();
    const filas = lista.map(u => {
      const st = VS.estado(u), v = ventanaObjetivo(st);
      const extra = v && v.ampliacionMin ? ` <span class="amp-gris">(+${v.ampliacionMin} min dados)</span>` : '';
      return `<tr><td>${esc(u.nombre || u.username)}</td>
        <td>${v ? esc(nombreTurno(v.turno)) + ' · ' + esc(v.inicio) + '–' + esc(v.fin) : '<span class="amp-gris">—</span>'}</td>
        <td>${textoEstado(st)}${extra}</td>
        <td style="text-align:right">${v ? `<button type="button" class="btn btn-ghost" onclick="ampTurnoAbrir('${esc(u.username)}')">Dar tiempo</button>` : ''}</td></tr>
        ${abierto === u.username && v ? `<tr><td colspan="4">${htmlFormulario(u, v)}</td></tr>` : ''}`;
    }).join('');

    const hoy = VS.ampliaciones().filter(a => a.estado !== 'ANULADA').sort((a, b) => (b.creadoEnMs || 0) - (a.creadoEnMs || 0)).slice(0, 12);
    const historial = hoy.map(a => `<tr><td>${esc(a.nombre || a.username)}</td><td>${esc(nombreTurno(a.turno))} ${esc(a.fechaOperativa)}</td>
      <td>+${esc(a.minutos)} min</td><td>${esc(a.motivo)}</td><td class="amp-gris">${esc(a.creadoPor || '')}${a.creadoEnMs ? ' · ' + hora(a.creadoEnMs) : ''}</td>
      <td style="text-align:right"><button type="button" class="btn btn-ghost" onclick="ampTurnoAnular('${esc(a.id)}')">Anular</button></td></tr>`).join('');

    return `<div class="rot-sup-card" id="amp-turno-panel">
      <style>
        #amp-turno-panel table{width:100%;border-collapse:collapse;font-size:13px}#amp-turno-panel td,#amp-turno-panel th{padding:7px 6px;border-top:1px solid var(--line,#e5e7eb);vertical-align:middle;text-align:left}
        #amp-turno-panel th{font-size:11.5px;color:var(--muted,#6b7280);font-weight:700;border-top:none}
        .amp-verde{color:#166534;font-weight:600}.amp-rojo{color:#a32d2d;font-weight:600}.amp-ambar{color:#8a5a00;font-weight:600}.amp-gris{color:var(--muted,#6b7280)}
        .amp-form{background:#f7f9fb;border:1px solid var(--line,#e5e7eb);border-radius:10px;padding:12px;display:grid;gap:10px}
        .amp-form-tit{font-size:13px}.amp-chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .amp-chip{border:1px solid #c9d3dc;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:600}
        .amp-chip.on{background:#e3eefb;border-color:#5b8fd6;color:#0c447c}
        .amp-otro{display:flex;gap:6px;align-items:center;font-size:12.5px}.amp-otro input{width:80px}
        .amp-mot{display:grid;gap:4px;font-size:12.5px}.amp-mot textarea{width:100%;box-sizing:border-box}
        .amp-pie{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
        .amp-interruptor{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px;padding:10px 12px;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:#f7f9fb;font-size:13px;line-height:1.5}
        .amp-int-acciones{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .amp-msg{font-size:13px}.amp-msg.error{color:#a32d2d}.amp-msg.ok{color:#166534}
      </style>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div><h3 style="margin:0">Tiempo de supervisores</h3>
          <div class="rot-sup-muted">Solo el Administrador. Con el cierre automático activado, al terminar su turno el supervisor queda en modo visualización; aquí puedes darle más minutos con un motivo.</div></div>
      </div>
      ${htmlInterruptor()}
      ${estAmp.error ? `<div class="amp-msg error" style="margin-top:8px">No se pudieron leer las ampliaciones: falta aplicar la migración glacial_29 en Supabase.</div>` : ''}
      <table style="margin-top:10px"><thead><tr><th>Supervisor</th><th>Turno</th><th>Estado ahora</th><th></th></tr></thead>
        <tbody>${filas || '<tr><td colspan="4" class="amp-gris">No hay supervisores en la rotación.</td></tr>'}</tbody></table>
      ${historial ? `<h4 style="margin:14px 0 4px">Tiempo dado (últimos días)</h4>
        <table><thead><tr><th>Supervisor</th><th>Turno</th><th>Minutos</th><th>Motivo</th><th>Dado por</th><th></th></tr></thead><tbody>${historial}</tbody></table>` : ''}
    </div>`;
  }

  function pintar(){
    const actual = document.getElementById('amp-turno-panel');
    if(actual){
      const motivo = document.getElementById('amp-motivo');
      const textoMotivo = motivo ? motivo.value : '';
      actual.outerHTML = htmlPanel();
      const nuevo = document.getElementById('amp-motivo');
      if(nuevo && textoMotivo) nuevo.value = textoMotivo;
      return;
    }
    const acciones = document.querySelector('#main .rot-sup-page .rot-sup-actions');
    if(acciones) acciones.insertAdjacentHTML('afterend', htmlPanel());
  }

  const renderOriginal = renderRotacionSupervisores;
  renderRotacionSupervisores = function(){
    const r = renderOriginal.apply(this, arguments);
    try{ if(esAdmin()) pintar(); }catch(e){ console.warn('Tiempo de supervisores:', e); }
    return r;
  };
  window.renderRotacionSupervisores = renderRotacionSupervisores;

  // Refresco en vivo (cambian las ampliaciones) y cada 30 s (cambia la hora), solo si el panel está a la vista y no se está escribiendo.
  const refrescar = () => {
    if(!esAdmin() || !document.getElementById('amp-turno-panel')) return;
    const enfoque = document.activeElement;
    if(enfoque && enfoque.closest && enfoque.closest('#amp-turno-panel .amp-form, #amp-turno-panel .amp-interruptor')) return;
    pintar();
  };
  VS.alCambiar(refrescar);
  setInterval(refrescar, 30000);

  /* ---------- acciones ---------- */
  window.ampTurnoAbrir = function(username){
    abierto = abierto === username ? null : username; minutosElegidos = 30; mensaje = ''; mensajeTipo = '';
    pintar();
    const m = document.getElementById('amp-motivo'); if(m) m.focus();
  };
  window.ampTurnoCancelar = function(){ abierto = null; mensaje = ''; pintar(); };
  window.ampTurnoLimpiarMsg = function(){
    if(!mensaje) return;
    mensaje = ''; mensajeTipo = '';
    const m = document.querySelector('#amp-turno-panel .amp-msg'); if(m) m.remove();
  };
  window.ampTurnoElegir = function(valor, desdeCampo){
    const n = Math.round(Number(valor));
    minutosElegidos = Number.isFinite(n) && n > 0 ? Math.min(n, MIN_MAX) : minutosElegidos;
    if(desdeCampo){
      document.querySelectorAll('#amp-turno-panel .amp-chip').forEach(c => c.classList.remove('on'));
      const u = supervisores().find(x => x.username === abierto), st = u ? VS.estado(u) : null, v = st ? ventanaObjetivo(st) : null;
      const out = document.getElementById('amp-nuevo');
      if(out && v) out.textContent = hora(Math.max(v.cierreMs, st.ahoraMs) + minutosElegidos * 60000);
      return;
    }
    pintar();
  };

  function uidActual(){
    try{ return (typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.uid) || (firebase.auth().currentUser || {}).uid || ''; }
    catch(_){ return ''; }
  }

  window.ampTurnoConfirmar = async function(username){
    if(!esAdmin()){ alert('Solo el Administrador puede dar más tiempo.'); return; }
    const u = supervisores().find(x => x.username === username);
    const st = u ? VS.estado(u) : null, v = st ? ventanaObjetivo(st) : null;
    const motivo = String((document.getElementById('amp-motivo') || {}).value || '').trim();
    const minutos = Math.round(Number(minutosElegidos));
    mensajeTipo = 'error';
    if(!u || !v){ mensaje = 'Este supervisor no tiene un turno al que sumarle tiempo.'; pintar(); return; }
    if(!Number.isFinite(minutos) || minutos < 1 || minutos > MIN_MAX){ mensaje = 'Indica entre 1 y ' + MIN_MAX + ' minutos.'; pintar(); return; }
    if(motivo.length < 5){ mensaje = 'Escribe el motivo (al menos 5 caracteres).'; pintar(); const m = document.getElementById('amp-motivo'); if(m){ m.value = motivo; m.focus(); } return; }
    const uid = uidActual();
    if(!uid){ mensaje = 'No hay una sesión segura activa. Vuelve a iniciar sesión.'; pintar(); return; }
    const id = 'amp_' + v.fecha + '_' + String(u.username).toLowerCase().replace(/[^a-z0-9]+/g, '') + '_' + Date.now().toString(36);
    try{
      await db.collection('ampliacionesTurno').doc(id).set({
        id, username: u.username, nombre: u.nombre || u.username,
        fechaOperativa: v.fecha, turno: v.turno, minutos, motivo, estado: 'VIGENTE',
        creadoUid: uid, creadoPor: state.user.nombre || state.user.username || '',
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });
      abierto = null; mensaje = ''; pintar();
      if(typeof _mtToastTurno === 'function') _mtToastTurno('✅ Se dieron ' + minutos + ' min a ' + (u.nombre || u.username) + '.');
    }catch(e){
      console.error('No se pudo guardar la ampliación de turno:', e);
      mensaje = 'No se pudo guardar. ' + ((e && e.message) || '') + ' (¿está aplicada la migración glacial_29 en Supabase?)';
      pintar();
    }
  };

  window.ampCierreGuardar = async function(activar){
    if(!esAdmin()){ alert('Solo el Administrador puede cambiar el cierre automático.'); return; }
    const desde = activar ? String((document.getElementById('amp-cierre-desde') || {}).value || '').trim() : '';
    if(desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)){ alert('La fecha no es válida.'); return; }
    const pregunta = activar
      ? '¿Activar el cierre automático del modo Trabajar' + (desde ? ' a partir del ' + desde : ' desde HOY') + '?\n\nAl terminar su turno (Noche: 30 min de tolerancia) cada supervisor quedará en solo visualización. Solo tú podrás darle más tiempo.'
      : '¿Desactivar el cierre automático del modo Trabajar?\n\nLos supervisores podrán trabajar a cualquier hora; el cronómetro solo informará.';
    if(!confirm(pregunta)) return;
    const uid = uidActual();
    if(!uid){ alert('No hay una sesión segura activa. Vuelve a iniciar sesión.'); return; }
    try{
      await db.collection('ampliacionesTurno').doc('config').set({
        id: 'config', cierreActivo: !!activar, desde,
        actualizadoPor: state.user.nombre || state.user.username || '', actualizadoUid: uid,
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });
      if(typeof _mtToastTurno === 'function') _mtToastTurno(activar ? '✅ Cierre automático ' + (desde ? 'programado desde el ' + desde : 'activado') + '.' : 'Cierre automático desactivado.');
    }catch(e){
      console.error('No se pudo cambiar el cierre automático:', e);
      alert('No se pudo guardar: ' + ((e && e.message) || e) + '\n\n¿Está aplicada la migración glacial_29 en Supabase?');
    }
  };

  window.ampTurnoAnular = async function(id){
    if(!esAdmin()) return;
    const a = VS.ampliaciones().find(x => x.id === id);
    if(!a) return;
    const motivo = String(prompt('Motivo para anular los +' + a.minutos + ' min de ' + (a.nombre || a.username) + ':') || '').trim();
    if(!motivo) return;
    if(motivo.length < 5){ alert('El motivo debe tener al menos 5 caracteres.'); return; }
    try{
      await db.collection('ampliacionesTurno').doc(id).update({
        estado: 'ANULADA', motivoAnulacion: motivo, anuladoUid: uidActual(),
        anuladoPor: state.user.nombre || state.user.username || '',
        anuladoEn: firebase.firestore.FieldValue.serverTimestamp()
      });
    }catch(e){
      alert('No se pudo anular: ' + ((e && e.message) || e));
    }
  };
})();
