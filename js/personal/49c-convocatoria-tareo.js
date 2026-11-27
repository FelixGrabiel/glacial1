/* =============================================================
   GLACIAL · PERSONAL · CONVOCATORIA → TAREO PRELLENADO (27/11/2026)
   -------------------------------------------------------------
   docs/personal-tareo/convocatoria-semanal.md
   Con una convocatoria PUBLICADA (o CERRADA) para la semana de la fecha, el Tareo de Producción toma de ella a su personal: cada persona en su equipo
   (columna «línea» = equipo), con la hora programada del equipo (las tardanzas se calculan con el horario del EQUIPO: 13:00 en Cajas 20L, 21:00 en la
   noche, que cruza la medianoche) y su salida programada. Quien está en descanso médico / vacaciones / licencia ese día aparece ya con ese estado.
   Sin convocatoria publicada, el Tareo sigue usando la rotación importada del Excel, como siempre (transición).
   Reglas del Tareo que NO cambian: hora automática al marcar ASISTIÓ, horas extras, bloqueo a los 2 días, maquinistas desde Mantenimiento, personal por día.
   Cómo: envuelve obtenerPersonalPorRotacion (13-tareo.js) y tareoNuevaPersona. La convocatoria se lee del servidor (glacial_72) al abrir el Tareo
   y queda en memoria y en este equipo (localStorage) para trabajar sin conexión.
   Cargar DESPUÉS de 13-tareo.js y de 49-convocatoria-nucleo.js.
   ============================================================= */
(function(W){
  'use strict';
  if(typeof document === 'undefined') return;
  const C = () => W.glacialConvocatoria;
  const CLAVE = 'glacial:convocatoria:publicada:';
  const memoria = new Map();                                  // semana → { conv, equipos, en }
  const BLOQUE_ESTADO = { DESCANSO_MEDICO: 'Descanso médico', VACACIONES: 'Vacaciones', LICENCIA: 'Licencia sin goce' };

  function recordar(semana, conv, equipos){
    if(!semana || !conv) return;
    const x = { conv, equipos, en: Date.now() };
    memoria.set(semana, x);
    try{ localStorage.setItem(CLAVE + semana, JSON.stringify(x)); }catch(_){ }
  }
  function leer(semana){
    if(memoria.has(semana)) return memoria.get(semana);
    try{ const x = JSON.parse(localStorage.getItem(CLAVE + semana) || 'null'); if(x && x.conv){ memoria.set(semana, x); return x; } }catch(_){ }
    return null;
  }
  const pidiendo = new Set();
  /** Lee del servidor la convocatoria de la semana de una fecha (sin bloquear: el Tareo se vuelve a pintar cuando llega). */
  async function traer(fecha){
    const sb = W.glacialSupabaseCliente; if(!sb || typeof sb.rpc !== 'function' || !C()) return null;
    const semana = C().lunesDe(fecha); if(!semana || pidiendo.has(semana)) return leer(semana);
    pidiendo.add(semana);
    try{
      const r = await sb.rpc('convocatoria_obtener', { p_semana: semana });
      if(r && !r.error && r.data){
        const d = r.data, c = d.convocatoria;
        const equipos = C().equiposDe((d.equipos || []).map(e => ({ id: e.id, nombre: e.nombre, columna: e.columna, turnoBase: e.turno_base, inicio: e.hora_inicio, fin: e.hora_fin, minimo: e.minimo, orden: e.orden, activo: e.activo })));
        const conv = c ? { semana, estado: c.estado, version: c.version, asignaciones: (d.asignaciones || []).map(x => ({ id: x.id, trabajadorId: x.trabajador_id, nombre: x.nombre, equipoId: x.equipo_id || '', bloque: x.bloque || '', columna: x.columna, orden: x.orden, hasta: x.hasta_fecha || '' })) } : { semana, estado: 'NINGUNA', asignaciones: [] };
        const antes = leer(semana);
        recordar(semana, conv, equipos);
        if(!antes || antes.conv.version !== conv.version || antes.conv.estado !== conv.estado) avisar();
      }
    }catch(_){ /* sin conexión: queda lo guardado en este equipo */ }
    finally{ pidiendo.delete(semana); }
    return leer(semana);
  }
  const oyentes = [];
  const avisar = () => oyentes.forEach(f => { try{ f(); }catch(_){ } });

  /** Personal del Tareo desde la convocatoria publicada de la semana de la fecha, o null si no hay. */
  function personalDe(fecha, turno){
    if(!C()) return null;
    const x = leer(C().lunesDe(fecha));
    if(!x || !x.conv || !['PUBLICADA', 'CERRADA'].includes(x.conv.estado)) return null;
    const trab = (() => { try{ return typeof loadWorkers === 'function' ? (loadWorkers() || []) : []; }catch(_){ return []; } })();
    return { conv: x.conv, personal: C().prellenarTareo(x.conv, x.equipos, trab, fecha, turno) };
  }

  /* ---------- envolver el Tareo ---------- */
  if(typeof obtenerPersonalPorRotacion === 'function'){
    const original = obtenerPersonalPorRotacion;
    obtenerPersonalPorRotacion = function(fecha, turno){                // eslint-disable-line no-global-assign
      const p = personalDe(fecha, turno);
      if(!p){ traer(fecha); return original.apply(this, arguments); }
      return { tieneRotacion: true, rotacion: { id: 'CONV-' + p.conv.semana, origen: 'CONVOCATORIA', estado: p.conv.estado, personal: p.personal }, personal: p.personal, desdeConvocatoria: true };
    };
  }
  if(typeof tareoNuevaPersona === 'function'){
    const original = tareoNuevaPersona;
    tareoNuevaPersona = function(trabajador, area){                     // eslint-disable-line no-global-assign
      const p = original.apply(this, arguments);
      if(trabajador && trabajador.origen === 'CONVOCATORIA'){
        p.equipoId = trabajador.equipoId || ''; p.equipo = trabajador.equipo || ''; p.horaProgramadaSalida = trabajador.horaProgramadaSalida || '';
        p.origenConvocatoria = true;
        if(trabajador.estadoBloque && BLOQUE_ESTADO[trabajador.estadoBloque]) p.asistencia = BLOQUE_ESTADO[trabajador.estadoBloque];
      }
      return p;
    };
  }
  // No se vuelve a pintar el Tareo solo al llegar la convocatoria (podría interrumpir a quien está marcando): entra la próxima vez que se abre el Tareo.

  // Se trae apenas hay sesión (antes de que alguien cree el Tareo del turno) y cada 5 minutos.
  (function precargar(){
    try{ if(typeof state !== 'undefined' && state.user && W.glacialSupabaseCliente && C() && W.GlacialFecha){ const h = W.GlacialFecha.fechaOperativa(); traer(h); traer(C().sumarDias(h, -7)); setTimeout(precargar, 300000); return; } }catch(_){ }
    setTimeout(precargar, 5000);
  })();
  W.glacialConvocatoriaTareo = { recordar, leer, traer, personalDe, alCambiar: f => { if(typeof f === 'function') oyentes.push(f); } };
})(typeof window !== 'undefined' ? window : globalThis);
