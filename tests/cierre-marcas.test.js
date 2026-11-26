/* Cierre progresivo de marcas y cierre de turno (16f-cierre-marcas.js · glacial_69): lógica pura. node tests/cierre-marcas.test.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if(!c) fallas++; };
const C = require(R + '/js/produccion/16f-cierre-marcas.js');
const T = [{ id: 'tr_a', marca: 'SCALA', presentacion: '7 Litros', orden: 1 }, { id: 'tr_b', marca: 'CUISINE', presentacion: '7 Litros', orden: 2 }, { id: 'tr_c', marca: 'SCALA', presentacion: '7 Litros', orden: 3 }];
const fila = (id, x) => Object.assign({ tramo_id: id, estado: 'cerrado', hora_corte: '02:00', paletas_acumuladas: 7, paletas_tramo: 7, saldo_paquetes: 12 }, x || {});
// estados
let L = C.estadoTramos(T, []);
ok(L.map(t => t.estado).join() === 'activo,espera,espera', 'sin cierres: la primera marca está activa y las demás en espera');
L = C.estadoTramos(T, [fila('tr_a')]);
ok(L.map(t => t.estado).join() === 'cerrado,activo,espera' && L[0].cierre.saldo_paquetes === 12, 'al cerrar la 1.ª, la 2.ª pasa a activa');
ok(C.estadoTramos(T, [fila('tr_a', { estado: 'abierto' })])[0].estado === 'activo', 'una fila reabierta (abierto) no cuenta como cerrada');
// paletas del tramo: SCALA retoma con acumulado 10 → este tramo 3
L = C.estadoTramos(T, [fila('tr_a'), fila('tr_b', { paletas_acumuladas: 4, paletas_tramo: 4 })]);
ok(C.paletasDelTramo(L, 2, 10) === 3 && C.paletasDelTramo(L, 1, 4) === 4, 'paletas del tramo = acumulado − lo congelado al cerrar la misma marca antes (SCALA 10 − 7 = 3)');
// cabecera
ok(C.cabecera({ tramos: L, pendientes: 0 }).nivel === 'ok' && C.cabecera({ tramos: L, pendientes: 0 }).mensaje === 'Todo listo para envío rápido' && C.cabecera({ tramos: L }).cerradas === 2, 'franja verde «Todo listo para envío rápido» con 2 de 3 cerradas');
ok(/sin subir/.test(C.cabecera({ tramos: L, pendientes: 2 }).mensaje) && C.cabecera({ tramos: L, pendientes: 2 }).nivel === 'aviso', 'con pendientes: advertencia');
ok(/Cierra 1 marca anterior/.test(C.cabecera({ tramos: C.estadoTramos(T, [fila('tr_a')]) }).mensaje), 'con una marca anterior sin cerrar: lo dice');
ok(C.cabecera({ tramos: L, enviado: true }).nivel === 'enviado', 'enviado: franja azul');
// validar envío
ok(C.validarEnvio({ tramos: L, puede: true }).ok, 'se puede enviar con todas cerradas menos la última');
const v1 = C.validarEnvio({ tramos: C.estadoTramos(T, [fila('tr_a')]), puede: true, pendientes: 1, rechazados: 1, saldoUltimo: '-2' });
ok(!v1.ok && v1.motivos.some(m => /sin subir/.test(m)) && v1.motivos.some(m => /rechazado/.test(m)) && v1.motivos.some(m => /Falta cerrar: CUISINE/.test(m)) && v1.motivos.some(m => /entero ≥ 0/.test(m)), 'no se envía con pendientes, rechazados, marcas sin cerrar o saldo inválido');
ok(!C.validarEnvio({ tramos: L, puede: true, enviado: true }).ok && !C.validarEnvio({ tramos: [], puede: true }).ok && !C.validarEnvio({ tramos: L, puede: false }).ok, 'ni ya enviado, ni sin secuencia, ni sin permiso');
// pedidos al servidor (lo que valida glacial_69)
const ctx = { linea: 'B7L', fecha: '2026-11-24', turno: 'NOCHE' };
const pc = C.payloadCerrar(ctx, C.estadoTramos(T, [fila('tr_a')]), 1, { hora: '04:30', acumulado: 4, saldo: '', evento: 'e-1' });
ok(pc.tramo_id === 'tr_b' && pc.hora_corte === '04:30' && pc.paletas_acumuladas === 4 && pc.paletas_tramo === 4 && pc.saldo_paquetes === 0 && pc.secuencia.length === 3 && pc.secuencia[0].tramo_id === 'tr_a', 'cerrar marca: hora de corte, paletas congeladas, saldo (vacío = 0) y la secuencia completa');
const pe = C.payloadEnviar(ctx, L, { evento: 'e-2', pendientes: 0, observaciones: '  Bidones NO PARA ', hora: '07:00', acumulado: 10, saldo: '5', ahoraMs: Date.parse('2026-11-25T12:00:00Z') });
ok(pe.ultimo && pe.ultimo.paletas_tramo === 3 && pe.ultimo.saldo_paquetes === 5 && pe.ultimo.hora_corte === '07:00' && pe.observaciones === 'Bidones NO PARA' && pe.capturado_en === '2026-11-25T12:00:00.000Z' && pe.client_event_id === 'e-2', 'envío: la última marca se cierra en el mismo envío con su saldo; observaciones y evento');
ok(!C.payloadEnviar(ctx, C.estadoTramos(T, [fila('tr_a'), fila('tr_b'), fila('tr_c')]), { evento: 'e' }).ultimo, 'si la última ya está cerrada, el envío no la vuelve a cerrar');
// conexión con la página
const html = fs.readFileSync(R + '/index.html', 'utf8');
ok(html.indexOf('16f-cierre-marcas.js?v=') > html.indexOf('16e-paletas-rapido.js?v='), 'index.html carga 16f después de 16e');
const sql = fs.readFileSync(R + '/supabase/migraciones/glacial_69_cierre_turno.sql', 'utf8');
ok(/create table if not exists public\.cierre_tramos/.test(sql) && /create table if not exists public\.cierres_turno/.test(sql) && /closed_at/.test(sql) && /sync_estado/.test(sql) && /enable row level security/.test(sql) && /function public\.cierre_turno_enviar/.test(sql), 'glacial_69: tablas de tramos y cierre consolidado (closed_at, sync_estado), RLS y la función de envío');
ok(/primero cierra la marca anterior/.test(sql) && /faltan % marca\(s\) por cerrar/.test(sql) && /sin subir/.test(sql) && /ya se envió/.test(sql), 'glacial_69: integridad (orden, marcas por cerrar, pendientes, doble envío)');
console.log(fallas ? fallas + ' falla(s)' : 'todo correcto'); process.exit(fallas ? 1 : 0);
