/* Pruebas de la parte de navegador de js/accesos/17b-ventana-supervisor.js: de dónde sale el horario (rotación publicada,
   reemplazos, descanso, respaldo del perfil), ampliaciones por supervisor y el CORTE DE LAS 19:00 (contextoRegistro /
   contextoAvance). Se ejecuta con:   node tests/ventana-supervisor-navegador.test.js
   Simula el navegador con un contexto de Node (vm): sin base de datos real. Horas de Lima (UTC−5). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const codigo = fs.readFileSync(path.join(__dirname, '../js/accesos/17b-ventana-supervisor.js'), 'utf8');

let fallas = 0, total = 0;
const ok = (c, t) => { total++; console.log((c ? '✔ ' : '✘ FALLA ') + t); if(!c){ fallas++; process.exitCode = 1; } };
const L = (f, h) => { const [y, m, d] = f.split('-').map(Number); const [hh, mm] = h.split(':').map(Number); return Date.UTC(y, m - 1, d, hh + 5, mm); };
const iso = ms => { const d = new Date(ms - 5 * 3600000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
const sumar = (f, n) => { const [y, m, d] = f.split('-').map(Number); return iso(Date.UTC(y, m - 1, d + n, 12)); };

/* rotacion: { 'YYYY-MM-DD': { username: {turno, inicio, fin} } } (solo fechas publicadas). nocheDesde: hora de inicio de la Noche de producción. */
function entorno({ ahora, usuario, rotacion, nocheDesde, ampliaciones, cierre }){
  let cbAmp = null, cbCfg = null;
  const sb = {
    console,
    document: {},
    state: { user: usuario },
    LINES: [{ key: 'PET1' }, { key: 'C20L' }],
    _rotacionesReady: true,
    GlacialFecha: {
      ahoraMs: () => ahora,
      fechaISOLocal: ms => iso(ms),
      sumarDias: sumar,
      turnoActual: ms => { const h = new Date(ms - 5 * 3600000).getUTCHours(); return h < 7 || h >= 22 ? 'NOCHE' : (h < 15 ? 'DÍA' : 'INTERMEDIO'); },
      fechaOperativa: (ms, t) => { const f = iso(ms), h = new Date(ms - 5 * 3600000).getUTCHours(); return t === 'NOCHE' && h < 7 ? sumar(f, -1) : f; }
    },
    rotSupBuscarSemanaPorFecha: f => (rotacion && rotacion[f]) ? { id: 'rot-' + f, f } : null,
    rotSupAsignacionFecha: (rot, username, f) => {
      const a = rotacion[f][username];
      return a ? Object.assign({ estado: a.turno }, a) : null;
    },
    clasificarTurnoPorHorario: (i) => i === '22:00' ? 'NOCHE' : (i === '14:00' ? 'INTERMEDIO' : 'DÍA'),
    glacialHorarios: {
      TOLERANCIA_MIN: 30,
      resolver: (linea, f, bloque) => {
        if(bloque !== 'NOCHE') return null;
        const ini = L(f, nocheDesde || '22:00'), fin = L(sumar(f, 1), '07:00');
        return { habilitado: true, inicioMs: ini, finMs: fin, inicioHHMM: nocheDesde || '22:00', finHHMM: '07:00' };
      }
    },
    db: {
      collection: () => ({ where: () => ({ onSnapshot: (cb) => { cbAmp = cb; return () => {}; } }), doc: () => ({ onSnapshot: (cb) => { cbCfg = cb; return () => {}; } }) })
    }
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(codigo, sb);
  // Interruptor del Administrador: por defecto en estas pruebas, ACTIVADO (cierre=undefined). cierre=null → sin documento (apagado).
  const cfg = cierre === undefined ? { cierreActivo: true, desde: '' } : cierre;
  if(cbCfg) cbCfg(cfg === null ? { exists: false, data: () => ({}) } : { exists: true, data: () => cfg });
  if(ampliaciones && cbAmp){
    cbAmp({ docs: ampliaciones.map(a => ({ id: a.id || 'x', data: () => a })) });
  }
  return sb.glacialVentanaSupervisor;
}
const sup = (username, extra) => Object.assign({ username, rol: 'Supervisor', nombre: username }, extra || {});
const HOY = '2026-10-21', AYER = '2026-10-20';

/* ---------- 1) solo supervisores ---------- */
{
  const VS = entorno({ ahora: L(HOY, '10:00'), usuario: { username: 'admin', rol: 'Administrador' }, rotacion: {} });
  const st = VS.estado();
  ok(st.estado === 'NO_APLICA' && st.puedeTrabajar === true, 'el Administrador no tiene ventana: nunca se le bloquea');
}

/* ---------- 1b) interruptor del Administrador (apagado por defecto) ---------- */
{
  const rot = { [AYER]: {}, [HOY]: { ana: { turno: 'DÍA', inicio: '07:00', fin: '15:00' } } };
  const sinDoc = entorno({ ahora: L(HOY, '16:00'), usuario: sup('ana'), rotacion: rot, cierre: null });
  const st = sinDoc.estado();
  ok(st.puedeTrabajar === true && st.cierreDesactivado === true && st.estado === 'CERRADA', 'sin el interruptor (documento inexistente): fuera de turno igual puede trabajar; el cronómetro solo informa');
  ok(sinDoc.cierreActivo() === false, 'el cierre automático está APAGADO por defecto');
  const apagado = entorno({ ahora: L(HOY, '14:50'), usuario: sup('ana'), rotacion: rot, cierre: { cierreActivo: false } });
  ok(apagado.estado().porCerrar === false, 'apagado: no hay aviso de «por cerrar»');
  const futuro = entorno({ ahora: L(HOY, '16:00'), usuario: sup('ana'), rotacion: rot, cierre: { cierreActivo: true, desde: sumar(HOY, 1) } });
  ok(futuro.estado().puedeTrabajar === true && futuro.cierreActivo() === false, 'activado «a partir de mañana»: hoy todavía no se aplica');
  const desdeHoy = entorno({ ahora: L(HOY, '16:00'), usuario: sup('ana'), rotacion: rot, cierre: { cierreActivo: true, desde: HOY } });
  ok(desdeHoy.estado().puedeTrabajar === false, 'activado «a partir de hoy»: se aplica');
}

/* ---------- 2) rotación publicada ---------- */
{
  const rot = { [AYER]: {}, [HOY]: { ana: { turno: 'INTERMEDIO', inicio: '14:00', fin: '22:00' } } };
  const VS = entorno({ ahora: L(HOY, '13:44'), usuario: sup('ana'), rotacion: rot });
  ok(VS.estado().estado === 'ANTES' && VS.estado().puedeTrabajar === false, 'rotación: Intermedio a las 13:44 todavía no abre');
  const VS2 = entorno({ ahora: L(HOY, '13:45'), usuario: sup('ana'), rotacion: rot });
  ok(VS2.estado().puedeTrabajar === true && VS2.estado().ventana.origen === 'ROTACION', 'rotación: Intermedio abre a las 13:45');
}

/* ---------- 3) descanso en la rotación: NO usa el perfil ---------- */
{
  const rot = { [AYER]: {}, [HOY]: { ana: { turno: 'DESCANSO', inicio: '', fin: '' } } };
  const VS = entorno({ ahora: L(HOY, '10:00'), usuario: sup('ana', { horarioInicio: '07:00', horarioFin: '15:00', turnoSupervisor: 'DÍA' }), rotacion: rot });
  const st = VS.estado();
  ok(st.puedeTrabajar === false && st.descansoHoy === true, 'descanso en la rotación = solo visualización, aunque el perfil tenga horario 07:00–15:00');
  ok(/descanso/.test(VS.textoBloqueo(st)), 'el mensaje dice que hoy figura en descanso');
}

/* ---------- 4) sin rotación publicada: respaldo del perfil (opción b) ---------- */
{
  const VS = entorno({ ahora: L(HOY, '10:00'), usuario: sup('ana', { horarioInicio: '07:00', horarioFin: '15:00', turnoSupervisor: 'DÍA' }), rotacion: {} });
  const st = VS.estado();
  ok(st.puedeTrabajar === true && st.ventana.origen === 'PERFIL' && st.sinRotacionHoy === true, 'sin rotación publicada: usa el horario del perfil y lo marca');
  const VS2 = entorno({ ahora: L(HOY, '16:00'), usuario: sup('ana', { horarioInicio: '07:00', horarioFin: '15:00', turnoSupervisor: 'DÍA' }), rotacion: {} });
  ok(VS2.estado().puedeTrabajar === false, 'sin rotación publicada: con el perfil también cierra al terminar su horario');
  const VS3 = entorno({ ahora: L(HOY, '16:00'), usuario: sup('ana'), rotacion: {} });
  ok(VS3.estado().estado === 'SIN_HORARIO' && VS3.estado().puedeTrabajar === true, 'sin rotación ni perfil: no se bloquea (se avisa) — nunca se para la planta por falta de datos');
}

{
  const rot = { [AYER]: {}, [HOY]: { otro: { turno: 'DÍA', inicio: '07:00', fin: '15:00' } } };
  const VS = entorno({ ahora: L(HOY, '10:00'), usuario: sup('nuevo', { horarioInicio: '07:00', horarioFin: '15:00', turnoSupervisor: 'DÍA' }), rotacion: rot });
  ok(VS.estado().puedeTrabajar === true && VS.estado().ventana.origen === 'PERFIL', 'rotación publicada pero el supervisor no figura (recién agregado): respaldo del perfil, no se le bloquea por un olvido');
}

/* ---------- 5) Noche que empezó ayer + tolerancia ---------- */
{
  const rot = { [AYER]: { luis: { turno: 'NOCHE', inicio: '22:00', fin: '07:00' } }, [HOY]: { luis: { turno: 'DESCANSO' } } };
  const VS = entorno({ ahora: L(HOY, '07:20'), usuario: sup('luis'), rotacion: rot });
  const st = VS.estado();
  ok(st.estado === 'TOLERANCIA' && st.ventana.fecha === AYER, 'Noche de ayer: a las 07:20 sigue en tolerancia');
  const c = VS.contextoRegistro('PET1');
  ok(c && c.turno === 'NOCHE' && c.fecha === AYER, 'Noche en tolerancia: el reporte nuevo sigue siendo la Noche de ayer');
  const VS2 = entorno({ ahora: L(HOY, '07:30'), usuario: sup('luis'), rotacion: rot });
  ok(VS2.estado().puedeTrabajar === false, 'Noche de ayer: a las 07:30 cierra aunque hoy tenga descanso');
}

/* ---------- 6) ampliaciones: solo las suyas ---------- */
{
  const rot = { [AYER]: {}, [HOY]: { ana: { turno: 'DÍA', inicio: '07:00', fin: '15:00' } } };
  const amps = [
    { id: 'a1', username: 'pedro', fechaOperativa: HOY, turno: 'DÍA', minutos: 60, estado: 'VIGENTE' },
    { id: 'a2', username: 'Ana', fechaOperativa: HOY, turno: 'DÍA', minutos: 30, estado: 'VIGENTE' }
  ];
  const VS = entorno({ ahora: L(HOY, '15:20'), usuario: sup('ana'), rotacion: rot, ampliaciones: amps });
  const st = VS.estado();
  ok(st.estado === 'AMPLIADA' && st.ventana.ampliacionMin === 30, 'ampliación: solo cuentan las del propio supervisor (sin distinguir mayúsculas)');
  const VS2 = entorno({ ahora: L(HOY, '15:20'), usuario: sup('pedro2'), rotacion: { [AYER]: {}, [HOY]: { pedro2: { turno: 'DÍA', inicio: '07:00', fin: '15:00' } } }, ampliaciones: amps });
  ok(VS2.estado().puedeTrabajar === false, 'ampliación de otro supervisor no abre la ventana');
}

/* ---------- 7) CORTE DE LAS 19:00 ---------- */
{
  const rot = { [AYER]: {}, [HOY]: { ana: { turno: 'INTERMEDIO', inicio: '14:00', fin: '22:00' } } };
  const VS = entorno({ ahora: L(HOY, '20:00'), usuario: sup('ana'), rotacion: rot, nocheDesde: '19:00' });
  const cr = VS.contextoRegistro('PET1'), ca = VS.contextoAvance('INTERMEDIO');
  ok(cr && cr.turno === 'NOCHE' && cr.fecha === HOY, 'corte 19:00: a las 20:00 el reporte nuevo del supervisor intermedio nace como NOCHE de hoy');
  ok(ca && ca.turno === 'NOCHE' && ca.fecha === HOY && ca.inicio === '19:00', 'corte 19:00: a las 20:00 el avance del supervisor intermedio va a la NOCHE');
  const VS2 = entorno({ ahora: L(HOY, '18:59'), usuario: sup('ana'), rotacion: rot, nocheDesde: '19:00' });
  ok(VS2.contextoRegistro('PET1') === null && VS2.contextoAvance('INTERMEDIO') === null, 'corte 19:00: a las 18:59 sigue el bloque Día (regla de siempre)');
  const VS3 = entorno({ ahora: L(HOY, '20:00'), usuario: sup('ana'), rotacion: rot, nocheDesde: '22:00' });
  ok(VS3.contextoAvance('INTERMEDIO') === null, 'sin corte configurado (Noche 22:00): a las 20:00 nada cambia');
  const VS4 = entorno({ ahora: L(HOY, '20:00'), usuario: { username: 'jefe', rol: 'Jefe de Producción' }, rotacion: {}, nocheDesde: '19:00' });
  ok((VS4.contextoAvance('') || {}).turno === 'NOCHE', 'corte 19:00: también para usuarios sin rotación (Jefatura)');
}

/* ---------- 8) entrada anticipada: no se cruza con el turno que sale ---------- */
{
  const rot = { [AYER]: { luis: { turno: 'NOCHE', inicio: '22:00', fin: '07:00' } }, [HOY]: { ana: { turno: 'DÍA', inicio: '07:00', fin: '15:00' } } };
  const VS = entorno({ ahora: L(HOY, '06:50'), usuario: sup('ana'), rotacion: rot, nocheDesde: '19:00' });
  const cr = VS.contextoRegistro('PET1'), ca = VS.contextoAvance('DÍA');
  ok(cr && cr.turno === 'DÍA' && cr.fecha === HOY, 'entrada anticipada (06:50): el reporte nuevo es del Día de hoy, no de la Noche que sigue en curso');
  ok(ca && ca.turno === 'DÍA' && ca.anticipada === true, 'entrada anticipada: el avance abre en su turno (Día), no en la Noche');
  const VSn = entorno({ ahora: L(HOY, '06:50'), usuario: sup('luis'), rotacion: rot, nocheDesde: '19:00' });
  const cn = VSn.contextoRegistro('PET1');
  ok(cn && cn.turno === 'NOCHE' && cn.fecha === AYER, 'a la misma hora, el supervisor de Noche sigue en su Noche de ayer');
}

/* ---------- 9) 12 horas ---------- */
{
  const rot = { [AYER]: {}, [HOY]: { pepe: { turno: 'NOCHE', inicio: '19:00', fin: '07:00' } } };
  const VS = entorno({ ahora: L(HOY, '18:45'), usuario: sup('pepe'), rotacion: rot, nocheDesde: '19:00' });
  ok(VS.estado().estado === 'ANTICIPADA', '12 h Noche: abre a las 18:45');
  const VS2 = entorno({ ahora: L(sumar(HOY, 1), '07:29'), usuario: sup('pepe'), rotacion: Object.assign({}, rot, { [sumar(HOY, 1)]: { pepe: { turno: 'DESCANSO' } } }), nocheDesde: '19:00' });
  ok(VS2.estado().puedeTrabajar === true, '12 h Noche: 07:29 del día siguiente todavía trabaja (tolerancia)');
}

console.log(`\n${total - fallas}/${total} pruebas correctas`);
