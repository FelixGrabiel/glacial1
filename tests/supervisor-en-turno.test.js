/* Supervisor en turno (js/personal/45-supervisor-en-turno.js): núcleo puro — área por supervisor, solo nombres, una entrada por persona. */
'use strict';
const fs = require('fs');
const S = require('../js/personal/45-supervisor-en-turno.js');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
ok(Object.keys(S.AREAS).join() === 'AGUA,HIELO' && /PET1, PET2, B7L, Cajas 20L y B20L/.test(S.AREAS.AGUA.detalle) && /cubos, premium y vasos/.test(S.AREAS.HIELO.detalle), 'solo dos áreas: Agua (PET1, PET2, B7L, Cajas 20L, B20L) y Hielo (cubos, premium y vasos)');
ok(S.clave('2026-11-21', 'DÍA') === 'supervisores_2026-11-21_DIA' && S.clave('2026-11-21', 'INTERMEDIO') === 'supervisores_2026-11-21_DIA' && S.clave('2026-11-21', 'NOCHE') === 'supervisores_2026-11-21_NOCHE', 'un documento por fecha y bloque (Intermedio comparte con Día)');
let d = S.aplicar(null, { uid: 'u1', nombre: 'Ana Pérez', area: 'HIELO', turno: 'DÍA', desdeMs: 10 });
d = S.aplicar(d, { uid: 'u2', nombre: 'Luis Rojas', area: 'AGUA', turno: 'DÍA', desdeMs: 5 });
ok(JSON.stringify(S.porArea(d)) === JSON.stringify({ AGUA: ['Luis Rojas'], HIELO: ['Ana Pérez'] }), 'cada nombre aparece en su área');
d = S.aplicar(d, { uid: 'u1', nombre: 'Ana Pérez', area: 'AGUA', turno: 'DÍA', desdeMs: 20 });
ok(JSON.stringify(S.porArea(d)) === JSON.stringify({ AGUA: ['Luis Rojas', 'Ana Pérez'], HIELO: [] }) && Object.keys(d.supervisores).length === 2, 'quien cambia de área reemplaza su entrada (no se duplica) y los nombres salen por hora de ingreso');
ok(JSON.stringify(S.porArea(null)) === JSON.stringify({ AGUA: [], HIELO: [] }), 'sin datos: ningún nombre (la barra dice «sin indicar»)');
const err = f => { try { f(); return ''; } catch (e) { return e.message; } };
ok(/Agua o Hielo/.test(err(() => S.aplicar(null, { uid: 'u', nombre: 'X', area: 'PET1' }))) && /nombre/.test(err(() => S.aplicar(null, { uid: 'u', nombre: ' ', area: 'AGUA' }))) && /usuario/.test(err(() => S.aplicar(null, { nombre: 'X', area: 'AGUA' }))), 'rechaza un área distinta de Agua/Hielo, un nombre vacío y la falta de usuario');
ok(S.propia(d, 'u1').area === 'AGUA' && S.propia(d, 'zz') === null, 'cada quien reconoce su propia entrada');
const idx = fs.readFileSync(__dirname + '/../index.html', 'utf8');
ok(/id="sup-turno-barra"/.test(idx) && /45-supervisor-en-turno\.js\?v=/.test(idx) && /glacialSupervisorTurno\.htmlBarraHielo/.test(fs.readFileSync(__dirname + '/../js/hielo/97-hielo.js', 'utf8')), 'la barra está en la pantalla de Agua (index.html) y en la de Hielo');

/* Solo quien está en planta (26/11/2026): datos reales del 26/11 — 5 entraron entre 07:00 y 09:02 (turno Día, salen 15:00) y 1 a las 15:39 (Intermedio, sale 23:00). */
const L = h => Date.parse('2026-11-26T' + h + ':00-05:00');
let h = null;
[['a', 'Leandro', 'AGUA', '07:00'], ['b', 'Yeikari', 'AGUA', '07:23'], ['c', 'Carlos', 'HIELO', '07:00'], ['e', 'Owar', 'HIELO', '07:42'], ['f', 'Mariangel', 'HIELO', '09:02']]
  .forEach(([uid, nombre, area, hh]) => { h = S.aplicar(h, { uid, nombre, area, turno: 'DÍA', desdeMs: L(hh), hastaMs: L('15:00') }); });
h = S.aplicar(h, { uid: 'g', nombre: 'Felix', area: 'AGUA', turno: 'INTERMEDIO', desdeMs: L('15:39'), hastaMs: L('23:00') });
ok(JSON.stringify(S.porArea(h, L('17:15'))) === JSON.stringify({ AGUA: ['Felix'], HIELO: [] }), 'a las 17:15 solo aparece quien sigue en planta (el Intermedio); los del Día ya salieron a las 15:00');
ok(S.porArea(h, L('10:00')).AGUA.join() === 'Leandro,Yeikari' && S.porArea(h, L('10:00')).HIELO.length === 3, 'a las 10:00 aparecen los del Día');
ok(S.porArea(h).AGUA.length === 3, 'sin hora (compatibilidad) no se filtra');
const legado = { supervisores: { x: { uid: 'x', nombre: 'Antiguo', area: 'AGUA', desdeMs: L('07:00') } } };
ok(S.porArea(legado, L('14:59')).AGUA.length === 1 && S.porArea(legado, L('15:01')).AGUA.length === 0, 'entradas anteriores sin hora de salida: vencen 8 h después de entrar');
const sin = S.aplicar(null, { uid: 'z', nombre: 'Sin rotación', area: 'HIELO', desdeMs: L('08:00') });
ok(sin.supervisores.z.hastaMs === L('16:00'), 'sin rotación: vence 8 h después de entrar');
h = S.salir(h, 'g', L('18:00'));
ok(S.porArea(h, L('18:01')).AGUA.length === 0 && S.propia(h, 'g', L('18:01')) === null && h.supervisores.g.salioMs === L('18:00'), '«Salir del turno»: el nombre desaparece al momento');
ok(JSON.stringify(S.anterior('2026-11-26', 'NOCHE')) === JSON.stringify({ fecha: '2026-11-26', bloque: 'DIA' }) && JSON.stringify(S.anterior('2026-11-26', 'DÍA')) === JSON.stringify({ fecha: '2026-11-25', bloque: 'NOCHE' }), 'bloque anterior: Noche ← Día de la misma fecha; Día ← Noche del día previo');
const inter = S.aplicar(null, { uid: 'g', nombre: 'Felix', area: 'AGUA', turno: 'INTERMEDIO', desdeMs: L('15:39'), hastaMs: L('23:00') });
ok(S.porArea(null, L('20:00'), inter).AGUA.join() === 'Felix', 'después de las 19:00 (documento de la Noche) el Intermedio sigue visible desde el bloque anterior hasta su salida');
ok(S.enHorario({ aplica: true, estado: 'ABIERTA', ventana: { turno: 'INTERMEDIO', cierreMs: L('23:00') } }).hastaMs === L('23:00') && S.enHorario({ aplica: true, estado: 'ABIERTA', ventana: { turno: 'INTERMEDIO', cierreMs: L('23:00') } }).turno === 'INTERMEDIO', 'en horario: se guarda su turno real y su hora de salida');
ok(!S.enHorario({ aplica: true, estado: 'CERRADA', puedeTrabajar: true, cierreDesactivado: true }).dentro && !S.enHorario({ aplica: true, estado: 'ANTES' }).dentro && !S.enHorario({ aplica: true, estado: 'SIN_TURNO' }).dentro, 'fuera de horario (aunque el cierre automático esté desactivado) no se pregunta ni se suma');
ok(S.enHorario({ aplica: false, estado: 'NO_APLICA' }).dentro && S.enHorario({ aplica: true, estado: 'SIN_HORARIO' }).dentro, 'sin rotación cargada: se pregunta como antes');
process.exit(fallas ? 1 : 0);
