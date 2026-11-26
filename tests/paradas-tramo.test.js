/* Paradas por marca (tramo) · 16g-paradas-tramo.js · glacial_70: lógica pura con los datos del pedido. node tests/paradas-tramo.test.js
   PET1 · 26/11/2026 · DÍA · SCALA 625 → BELLS 2.5 L → SCALA 625 (turno 07:00–15:00). */
'use strict';
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if(!c) fallas++; };
const P = require(R + '/js/produccion/16g-paradas-tramo.js');
const C = require(R + '/js/produccion/16f-cierre-marcas.js');
const F = '2026-11-26', ctx = { linea: 'PET1', fecha: F, turno: 'DÍA' };
const ms = h => P.hms(F, h, 'DÍA');
const T = [{ id: 't1', marca: 'SCALA', presentacion: '625 ml' }, { id: 't2', marca: 'BELLS', presentacion: '2.5 L' }, { id: 't3', marca: 'SCALA', presentacion: '625 ml' }];
const cerr = (id, h, pal) => ({ tramo_id: id, estado: 'cerrado', hora_corte: h, paletas_acumuladas: pal, paletas_tramo: pal, saldo_paquetes: 0 });
const par = (id, h, min, tipo, desc, x) => Object.assign({ id, horaInicio: h, minutos: min, tipo, descripcion: desc, origen: 'AVANCE' }, x || {});
const PARADAS = [par('a1', '08:15', 18, 'NO_PROGRAMADA', 'Falla sopladora'), par('a2', '09:30', 10, 'PROGRAMADA', 'Limpieza de llenadora'),
  par('a3', '10:40', 35, 'PROGRAMADA', 'Cambio de formato'), par('a4', '11:50', 12, 'NO_PROGRAMADA', 'Atasco etiquetadora'),
  par('a5', '12:30', 30, 'PROGRAMADA', 'Refrigerio'), par('a6', '', 8, 'NO_PROGRAMADA', 'Falta de preformas')];

// --- a las 13:10: SCALA cerrada 10:40, BELLS en curso
let E = C.estadoTramos(T, [cerr('t1', '10:40', 14)]);
let V = P.ventanas(E, { fecha: F, turno: 'DÍA', inicioTurnoMs: ms('07:00'), ahoraMs: ms('13:10') });
ok(V[0].inicioMs === ms('07:00') && V[0].finMs === ms('10:40') && V[1].inicioMs === ms('10:40') && V[1].abierto && V[1].finMs === ms('13:10') && !V[2].inicioMs, 'ventanas: SCALA 07:00–10:40 (cerrada), BELLS 10:40–ahora (en curso), SCALA 3 en espera');
ok(P.tramoDeParada(PARADAS[0], V, ctx).i === 0 && P.tramoDeParada(PARADAS[3], V, ctx).i === 1 && P.tramoDeParada(PARADAS[3], V, ctx).asignacion === 'AUTO', 'tramoDeParada: 08:15 → SCALA, 11:50 → BELLS (AUTO por la hora)');
ok(P.tramoDeParada(PARADAS[2], V, ctx).i === 1, 'cambio de formato a las 10:40 (hora de corte) → la marca que ENTRA (BELLS)');
ok(P.tramoDeParada(PARADAS[5], V, ctx).asignacion === 'PENDIENTE', '«Falta de preformas» sin hora → PENDIENTE');
ok(P.tramoDeParada(Object.assign({}, PARADAS[5], { tramoId: 't2' }), V, ctx).asignacion === 'MANUAL' && P.tramoDeParada(Object.assign({}, PARADAS[0], { tramoId: 't2', asignacion: 'MANUAL' }), V, ctx).i === 1, 'MANUAL: la marca elegida por el supervisor manda (también sobre la hora)');
ok(P.tramoDeParada({ id: 'r', origen: 'REGISTRO', marca: 'Bells', presentacion: '2.5 l', minutos: 5 }, V, ctx).i === 1, 'Nuevo registro: va al tramo de su cuadro (misma marca y presentación)');
ok(P.tramoDeParada({ id: 'r', origen: 'REGISTRO', marca: 'SCALA', presentacion: '625 ml', cuadroHoraInicio: '14:00', minutos: 5 }, P.ventanas(C.estadoTramos(T, [cerr('t1', '10:40', 14), cerr('t2', '13:10', 6)]), { fecha: F, turno: 'DÍA', inicioTurnoMs: ms('07:00'), ahoraMs: ms('14:30') }), ctx).i === 2, 'marca repetida (SCALA 1 y 3): decide la hora del cuadro');
ok(P.tramoDeParada(PARADAS[0], [], ctx).asignacion === 'SIN_SECUENCIA', 'sin secuencia del turno: no se asigna ni bloquea');

let A = P.asignar(PARADAS, V, ctx);
const rS = P.resumenTramo(V[0], A.porTramo[0], { produccion: 14 * 1200 });
ok(A.porTramo[0].length === 2 && rS.minutos === 220 && rS.paradasMin === 28 && Math.abs(rS.horas - 3.2) < 1e-9 && Math.round(rS.ratio) === 5250, 'SCALA 07:00–10:40: 14 × 1 200 = 16 800 und, paradas 18 NP + 10 P → 3.20 h → 5 250 und/h');
// BELLS hasta 13:10 (al cerrarla)
const rB = P.resumenTramo(V[1], A.porTramo[1], { produccion: 6 * 480 });
ok(A.porTramo[1].length === 3 && rB.minutos === 150 && rB.prog === 65 && rB.noprog === 12 && rB.cambio === 35 && Math.round(rB.ratio) === 2367, 'BELLS 10:40–13:10: 6 × 480 = 2 880 und, cambio 35 + refrigerio 30 + atasco 12 → 2 367 und/h');
ok(A.pendientes.length === 1 && A.pendientes[0].descripcion === 'Falta de preformas' && P.pendientesBloquean(A.pendientes).length === 1, 'la parada sin hora queda pendiente y BLOQUEA el envío');
ok(P.pendientesBloquean(P.asignar(PARADAS, V, { fecha: '2026-11-20', turno: 'DÍA' }).pendientes).length === 0, 'en turnos anteriores al despliegue la pendiente no bloquea');
ok(A.porTramo[1][0].esCambio && P.etiqueta(A.porTramo[1][0]) === 'CAMBIO' && P.etiqueta(PARADAS[0]) === 'NP' && P.etiqueta(PARADAS[1]) === 'P', 'etiquetas: CAMBIO / P / NP');

// --- parada que cruza el corte 10:40: 10:30–10:50 (20 min) → SCALA 10 + BELLS 10
const cruza = par('x1', '10:30', 20, 'NO_PROGRAMADA', 'Corte de energía');
const partes = P.partirEnCorte(cruza, V, 0, ctx);
ok(partes.length === 2 && partes[0].i === 0 && partes[0].minutos === 10 && partes[1].i === 1 && partes[1].minutos === 10 && partes[0].paradaPadreId === 'x1' && partes[1].horaInicio === '10:40', 'parada 10:30–10:50 → SCALA 10 min + BELLS 10 min, enlazadas (paradaPadreId)');
const A2 = P.asignar([cruza], V, ctx);
ok(A2.porTramo[0].reduce((s, p) => s + p.minutos, 0) + A2.porTramo[1].reduce((s, p) => s + p.minutos, 0) === 20, 'al partir, el total no cambia (20 min)');
ok(P.partirEnCorte(par('x2', '09:00', 20, 'PROGRAMADA', 'Refrigerio'), V, 0, ctx).length === 1, 'una parada dentro de su tramo no se parte');
const pp = P.payloadPartir(ctx, cruza, partes, V, { evento: 'e-p' });
ok(pp.partes.length === 2 && pp.partes[0].tramo_id === 't1' && pp.partes[1].tramo_id === 't2' && pp.minutos === 20 && pp.partes[0].minutos + pp.partes[1].minutos === 20, 'pedido de partición para glacial_70 (partes con su marca y la suma igual al total)');

// --- dos equipos guardan la misma parada (mismo id) sin conexión → una sola
const A3 = P.asignar([PARADAS[3], Object.assign({}, PARADAS[3])], V, ctx);
ok(A3.porTramo[1].length === 1, 'la misma parada (mismo id) de dos equipos cuenta UNA vez');
const pa1 = P.payloadAsignar(ctx, PARADAS[3], V[1], { evento: 'ev-1' }), pa2 = P.payloadAsignar(ctx, PARADAS[3], V[1], { evento: 'ev-2' });
ok(pa1.parada_id === pa2.parada_id && pa1.tramo_id === 't2' && pa1.asignacion === 'AUTO' && pa1.hora_inicio === '11:50' && pa1.tipo === 'NO_PROGRAMADA', 'constancia: misma parada_id (una fila en el servidor) aunque el evento sea otro');
ok(P.payloadAsignar(ctx, PARADAS[5], null, { evento: 'e' }).asignacion === 'PENDIENTE' && !P.payloadAsignar(ctx, PARADAS[5], null, { evento: 'e' }).tramo_id, 'constancia de una pendiente: sin tramo');

// --- turno completo (15:00): 23 520 und, 138 min de paradas → 5.70 h → 4 126 und/h
E = C.estadoTramos(T, [cerr('t1', '10:40', 14), cerr('t2', '13:10', 9), cerr('t3', '15:00', 2)]);
V = P.ventanas(E, { fecha: F, turno: 'DÍA', inicioTurnoMs: ms('07:00'), ahoraMs: ms('15:00') });
A = P.asignar(PARADAS.concat([par('a7', '13:55', 25, 'PROGRAMADA', 'Cambio de formato')]), V, ctx);
const prod = [16800, 4320, 2400];
const RS = V.map((t, i) => P.resumenTramo(t, A.porTramo[i], { produccion: prod[i] }));
const TT = P.totalTurno(RS, A.pendientes);
ok(TT.produccion === 23520 && TT.paradasMin === 138 && Math.abs(TT.horas - 5.7) < 1e-9 && Math.round(TT.ratio) === 4126, 'turno completo: 23 520 und, 138 min de paradas (incluye la pendiente) → 5.70 h → 4 126 und/h');
ok(TT.prog === 100 && TT.noprog === 38, 'programadas 100 · no programadas 38 (la suma de las marcas, sin contar dos veces)');
ok(RS[2].cambio === 25 && A.porTramo[2][0].descripcion === 'Cambio de formato', 'el cambio de 13:55 va a la marca que entra (SCALA 3)');

// --- turno NOCHE que cruza la medianoche
const FN = '2026-11-26', mn = h => P.hms(FN, h, 'NOCHE');
const EN = C.estadoTramos(T, [cerr('t1', '01:00', 5)]);
const VN = P.ventanas(EN, { fecha: FN, turno: 'NOCHE', inicioTurnoMs: mn('19:00'), ahoraMs: mn('04:00') });
const cN = { linea: 'PET1', fecha: FN, turno: 'NOCHE' };
ok(VN[0].finMs - VN[0].inicioMs === 6 * 3600000 && P.tramoDeParada(par('n1', '23:30', 10, 'NO_PROGRAMADA', 'x'), VN, cN).i === 0 && P.tramoDeParada(par('n2', '02:00', 10, 'NO_PROGRAMADA', 'x'), VN, cN).i === 1, 'NOCHE: 19:00–01:00 es SCALA (6 h, cruza medianoche); 23:30 → SCALA, 02:00 → BELLS');
const pN = P.partirEnCorte(par('n3', '00:40', 40, 'PROGRAMADA', 'Refrigerio'), VN, 0, cN);
ok(pN.length === 2 && pN[0].minutos === 20 && pN[1].minutos === 20, 'NOCHE: refrigerio 00:40–01:20 cruza el corte 01:00 → 20 + 20');

// --- texto general (regla 11)
const txt = P.textoGeneral({ titulo: 'CIERRE DE PRODUCCIÓN', turno: 'DÍA', fecha: '26/11/2026', hora: '15:00', generadoPor: 'J. Pérez', lineas: [{
  nombre: 'PET1', inicio: '07:00', fin: '15:00', esCierre: true, unidad: 'und', produccionTotal: 23520, horasEf: 5.7, ratioTexto: '4,126 und/h', personalTexto: '4',
  productos: [{ nombre: 'SCALA 625 ml', produccion: 16800 }, { nombre: 'BELLS 2.5 L', produccion: 4320 }, { nombre: 'SCALA 625 ml', produccion: 2400 }],
  paradas: P.ordenarParadas([PARADAS[5], PARADAS[3], PARADAS[0]], F, 'DÍA'), prog: 100, noprog: 38, total: 138 }] });
ok(/Inicio: 07:00 · Término: 15:00/.test(txt) && /Producción total: 23,520 und/.test(txt) && /Horas efectivas: 5\.70 h/.test(txt) && /Ratio turno: 4,126 und\/h/.test(txt) && /Personal en línea: 4/.test(txt), 'texto general: producción total, horas efectivas, ratio del turno y personal');
const iP = txt.indexOf('08:15 Falla sopladora – 18 min'), iA = txt.indexOf('11:50 Atasco etiquetadora – 12 min'), iF = txt.indexOf('— Falta de preformas – 8 min');
ok(iP > 0 && iA > iP && iF > iA && (txt.match(/\*PARADAS\*/g) || []).length === 1, 'una sola lista de PARADAS ordenada por hora; las sin hora al final con «—»');
ok(/Programadas: 100 min\nNo programadas: 38 min\n\*Total paradas: 138 min\*/.test(txt) && /Generado por: J\. Pérez/.test(txt), 'pie «Programadas / No programadas / Total» y generado por');

// --- conexión con la página
const html = fs.readFileSync(R + '/index.html', 'utf8');
// 16g aún no está conectado a la página (trabajo en curso): cuando index.html lo cargue, debe ir después de 16f.
ok(html.indexOf('16g-paradas-tramo.js?v=') < 0 || html.indexOf('16g-paradas-tramo.js?v=') > html.indexOf('16f-cierre-marcas.js?v='), 'index.html: 16g (si ya se carga) va después de 16f');
const sql = fs.readFileSync(R + '/supabase/migraciones/glacial_70_paradas_tramo.sql', 'utf8');
ok(/create table if not exists public\.paradas_tramo/.test(sql) && /client_event_id\s+uuid not null unique/.test(sql) && /parada_padre_id/.test(sql) && /'AUTO','MANUAL','PENDIENTE'/.test(sql), 'glacial_70: paradas_tramo con asignación AUTO/MANUAL/PENDIENTE, padre e idempotencia');
ok(/function public\.paradas_tramo_listar/.test(sql) && /function public\.parada_tramo_asignar/.test(sql) && /function public\.parada_tramo_partir/.test(sql) && /supabase_realtime/.test(sql) && /Marcha atrás/.test(sql), 'glacial_70: listar / asignar / partir, tiempo real y marcha atrás');
ok(/paradas_revisadas/.test(sql) && /parada\(s\) sin marca/.test(sql), 'glacial_70: cerrar exige «Revisé las paradas» y el envío rechaza paradas sin marca');

console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
