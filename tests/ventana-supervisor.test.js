/* Pruebas de la ventana de trabajo del supervisor (js/accesos/17b-ventana-supervisor.js).
   Se ejecutan con:   node tests/ventana-supervisor.test.js
   Todas las horas son de Lima (UTC−5). No necesitan navegador ni base de datos. */
'use strict';
const V = require('../js/accesos/17b-ventana-supervisor.js');

let fallas = 0, total = 0;
const ok = (c, t) => { total++; console.log((c ? '✔ ' : '✘ FALLA ') + t); if(!c){ fallas++; process.exitCode = 1; } };
const L = (fecha, hhmm) => V.msLima(fecha, hhmm, 0);
const est = (ahora, asignaciones, ampliaciones) => V.calcularVentana({ ahoraMs: ahora, asignaciones, ampliaciones: ampliaciones || [], toleranciaNocheMin: 30 });

const DIA = [{ fecha: '2026-10-21', turno: 'DÍA', inicio: '07:00', fin: '15:00' }];
const INTER = [{ fecha: '2026-10-21', turno: 'INTERMEDIO', inicio: '14:00', fin: '22:00' }];
const NOCHE = [{ fecha: '2026-10-21', turno: 'NOCHE', inicio: '22:00', fin: '07:00' }];
const DIA12 = [{ fecha: '2026-10-21', turno: 'DÍA', inicio: '07:00', fin: '19:00' }];
const NOCHE12 = [{ fecha: '2026-10-21', turno: 'NOCHE', inicio: '19:00', fin: '07:00' }];

/* ---------- Día 07:00–15:00 ---------- */
ok(est(L('2026-10-21', '06:44'), DIA).estado === 'ANTES', 'Día: a las 06:44 todavía no abre');
ok(est(L('2026-10-21', '06:45'), DIA).estado === 'ANTICIPADA', 'Día: a las 06:45 abre (15 min antes)');
ok(est(L('2026-10-21', '06:45'), DIA).puedeTrabajar === true, 'Día: en la entrada anticipada puede trabajar');
ok(est(L('2026-10-21', '10:00'), DIA).estado === 'ABIERTA', 'Día: a las 10:00 está abierta');
ok(est(L('2026-10-21', '14:46'), DIA).porCerrar === true, 'Día: a las 14:46 avisa (últimos 15 min)');
ok(est(L('2026-10-21', '14:44'), DIA).porCerrar === false, 'Día: a las 14:44 aún no avisa');
ok(est(L('2026-10-21', '15:00'), DIA).estado === 'CERRADA', 'Día: a las 15:00 cierra (sin tolerancia)');
ok(est(L('2026-10-21', '15:00'), DIA).puedeTrabajar === false, 'Día: cerrado = solo visualización');

/* ---------- Intermedio 14:00–22:00 ---------- */
ok(est(L('2026-10-21', '13:45'), INTER).estado === 'ANTICIPADA', 'Intermedio: abre a las 13:45');
ok(est(L('2026-10-21', '21:59'), INTER).puedeTrabajar === true, 'Intermedio: a las 21:59 todavía trabaja');
ok(est(L('2026-10-21', '22:00'), INTER).puedeTrabajar === false, 'Intermedio: a las 22:00 cierra (sin tolerancia)');

/* ---------- Noche 22:00–07:00 + 30 min ---------- */
ok(est(L('2026-10-21', '21:45'), NOCHE).estado === 'ANTICIPADA', 'Noche: abre a las 21:45');
ok(est(L('2026-10-22', '02:00'), NOCHE).estado === 'ABIERTA', 'Noche: cruza la medianoche (02:00 abierta)');
ok(est(L('2026-10-22', '07:10'), NOCHE).estado === 'TOLERANCIA', 'Noche: 07:10 en tolerancia');
ok(est(L('2026-10-22', '07:29'), NOCHE).puedeTrabajar === true, 'Noche: 07:29 todavía trabaja');
ok(est(L('2026-10-22', '07:30'), NOCHE).puedeTrabajar === false, 'Noche: 07:30 cierra');
ok(est(L('2026-10-22', '07:16'), NOCHE).porCerrar === true, 'Noche: el aviso se cuenta contra el cierre con tolerancia (07:16)');

/* ---------- 12 horas ---------- */
ok(est(L('2026-10-21', '18:59'), DIA12).puedeTrabajar === true, '12 h Día: 18:59 trabaja');
ok(est(L('2026-10-21', '19:00'), DIA12).puedeTrabajar === false, '12 h Día: 19:00 cierra (sin tolerancia)');
ok(est(L('2026-10-21', '18:45'), NOCHE12).estado === 'ANTICIPADA', '12 h Noche: abre a las 18:45');
ok(est(L('2026-10-22', '07:29'), NOCHE12).puedeTrabajar === true, '12 h Noche: 07:29 trabaja');
ok(est(L('2026-10-22', '07:30'), NOCHE12).puedeTrabajar === false, '12 h Noche: 07:30 cierra');

/* ---------- Ampliaciones del Administrador ---------- */
const amp30 = [{ fechaOperativa: '2026-10-21', turno: 'DÍA', minutos: 30, estado: 'VIGENTE' }];
ok(est(L('2026-10-21', '15:20'), DIA, amp30).estado === 'AMPLIADA', 'Ampliación: +30 min deja trabajar hasta 15:30');
ok(est(L('2026-10-21', '15:30'), DIA, amp30).puedeTrabajar === false, 'Ampliación: a las 15:30 cierra');
const dos = amp30.concat([{ fechaOperativa: '2026-10-21', turno: 'DÍA', minutos: 15, estado: 'VIGENTE' }]);
ok(est(L('2026-10-21', '15:40'), DIA, dos).puedeTrabajar === true, 'Ampliación: dos ampliaciones se suman (15:40 con +45)');
const anulada = [{ fechaOperativa: '2026-10-21', turno: 'DÍA', minutos: 30, estado: 'ANULADA' }];
ok(est(L('2026-10-21', '15:10'), DIA, anulada).puedeTrabajar === false, 'Ampliación: una anulada no cuenta');
const otroTurno = [{ fechaOperativa: '2026-10-21', turno: 'NOCHE', minutos: 60, estado: 'VIGENTE' }];
ok(est(L('2026-10-21', '15:10'), DIA, otroTurno).puedeTrabajar === false, 'Ampliación: la de otro turno no cuenta');
const ampNoche = [{ fechaOperativa: '2026-10-21', turno: 'NOCHE', minutos: 20, estado: 'VIGENTE' }];
ok(est(L('2026-10-22', '07:45'), NOCHE, ampNoche).estado === 'AMPLIADA', 'Ampliación de Noche: se suma después de la tolerancia (07:45)');
ok(est(L('2026-10-22', '07:50'), NOCHE, ampNoche).puedeTrabajar === false, 'Ampliación de Noche: 07:30 + 20 min = cierra 07:50');

const tardia = [{ fechaOperativa: '2026-10-21', turno: 'DÍA', minutos: 30, estado: 'VIGENTE', creadoEnMs: L('2026-10-21', '16:00') }];
ok(est(L('2026-10-21', '16:20'), DIA, tardia).puedeTrabajar === true, 'Ampliación dada después del cierre (16:00, +30): trabaja a las 16:20');
ok(est(L('2026-10-21', '16:30'), DIA, tardia).puedeTrabajar === false, 'Ampliación dada después del cierre: cierra a las 16:30');
const antes = [{ fechaOperativa: '2026-10-21', turno: 'DÍA', minutos: 30, estado: 'VIGENTE', creadoEnMs: L('2026-10-21', '14:00') }];
ok(est(L('2026-10-21', '15:29'), DIA, antes).puedeTrabajar === true && est(L('2026-10-21', '15:30'), DIA, antes).puedeTrabajar === false, 'Ampliación dada antes del cierre: se suma al cierre (15:30)');

/* ---------- Noches seguidas y relevo ---------- */
const dosNoches = [
  { fecha: '2026-10-21', turno: 'NOCHE', inicio: '22:00', fin: '07:00' },
  { fecha: '2026-10-22', turno: 'NOCHE', inicio: '22:00', fin: '07:00' }
];
const r1 = est(L('2026-10-22', '03:00'), dosNoches);
ok(r1.puedeTrabajar && r1.ventana.fecha === '2026-10-21', 'Noches seguidas: a las 03:00 trabaja en la Noche que empezó ayer');
const r2 = est(L('2026-10-22', '12:00'), dosNoches);
ok(!r2.puedeTrabajar && r2.estado === 'CERRADA', 'Noches seguidas: a mediodía está cerrada');
const r3 = est(L('2026-10-22', '20:00'), dosNoches);
ok(!r3.puedeTrabajar && r3.estado === 'ANTES' && V.horaLima(r3.proxima.aperturaMs) === '21:45', 'Noches seguidas: a las 20:00 informa que abre a las 21:45');

/* ---------- Sin turno ---------- */
ok(est(L('2026-10-21', '10:00'), []).estado === 'SIN_TURNO', 'Sin asignaciones (descanso): SIN_TURNO, no puede trabajar');
ok(est(L('2026-10-21', '10:00'), []).puedeTrabajar === false, 'Descanso: solo visualización');

console.log(`\n${total - fallas}/${total} pruebas correctas`);
