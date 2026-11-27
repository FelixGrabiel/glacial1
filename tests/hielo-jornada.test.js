/* Hielo · el «Tiempo (h)» de la producción suma la jornada sin refrigerio (27/11/2026): Noche 21:00–07:00 = 9 h · Día 07:00–19:00 = 11 h.
   Todas las filas con producción juntas (sin importar la estación); si no cuadra, no se puede finalizar (el borrador sí se guarda). */
'use strict';
const N = require('../js/hielo/97-hielo.js');
let fallas = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };
const fila = (marca, pres, estacion, bolsas, horas) => ({ marca, presentacion: pres, estacion, bolsas, horas, vence: '2027-11-27', lote: marca === 'Molitalia' ? 'M1' : '' });
const rep = (turno, ini, fin, filas) => ({ fecha: '2026-11-26', turno, horaInicio: ini, horaFin: fin, personas: 4, personal: ['A', 'B'], produccion: filas, paradas: [], mermas: [] });
const jornada = e => e.filter(x => /jornada/.test(x));

ok(N.jornadaHoras({ horaInicio: '21:00', horaFin: '07:00' }, 1) === 9 && N.jornadaHoras({ horaInicio: '07:00', horaFin: '19:00' }, 1) === 11, 'jornada: Noche 21:00–07:00 = 9 h · Día 07:00–19:00 = 11 h (menos 1 h de refrigerio)');
ok(N.jornadaHoras({ horaInicio: '07:00', horaFin: '19:00' }, 0.5) === 11.5 && N.jornadaHoras({ horaInicio: '07:00' }, 1) === null, 'el refrigerio es configurable; sin hora de fin no hay jornada');
const noche = rep('NOCHE', '21:00', '07:00', [fila('Glacial', '3 kg', 'Tolva manual', 300, 1), fila('Glacial', '1.5 kg', 'Tolva manual', 600, 1), fila('Rappi', '3 kg', 'Env. automática', 200, 1), fila('Scala', '3 kg', 'Env. automática', 100, 1)]);
const e1 = jornada(N.validarFinalizar(noche, {}));
ok(e1.length === 1 && /suma 4 h y la jornada es 9 h \(21:00–07:00 menos 1 h de refrigerio\)/.test(e1[0]), 'Noche con 4 filas de 1 h: no deja finalizar y dice cuánto suma y cuánto es la jornada');
noche.produccion[0].horas = 3; noche.produccion[1].horas = 2; noche.produccion[2].horas = 2.5; noche.produccion[3].horas = 1.5;
ok(jornada(N.validarFinalizar(noche, {})).length === 0, 'Noche: 3 + 2 + 2,5 + 1,5 = 9 h (todas las estaciones juntas) → se puede finalizar');
noche.produccion.push(fila('Glacial', '3 kg', 'Tolva manual', 0, 4));
ok(jornada(N.validarFinalizar(noche, {})).length === 0, 'una fila sin producción no suma');
const dia = rep('DÍA', '07:00', '19:00', [fila('Glacial', '3 kg', 'Tolva manual', 300, 6), fila('Glacial', '1.5 kg', 'Tolva manual', 300, 6)]);
const e2 = jornada(N.validarFinalizar(dia, {}));
ok(e2.length === 1 && /suma 12 h y la jornada es 11 h/.test(e2[0]), 'Día con 12 h registradas: avisa que sobran (jornada 11 h)');
ok(jornada(N.validarFinalizar(dia, { refrigerioHoras: 0 })).length === 0, 'con refrigerio 0 en Configuración, la jornada de 07:00–19:00 es 12 h');
const c = N.controlHoras(dia, { refrigerioHoras: 1 });
ok(!c.ok && c.clase === 'e' && /Tiempo registrado: 12 h de 11 h de jornada/.test(c.texto) && /sobran 1 h/.test(c.texto), 'aviso en pantalla: «Tiempo registrado: 12 h de 11 h de jornada … sobran 1 h»');
dia.produccion[1].horas = 5;
ok(N.controlHoras(dia, {}).ok && N.controlHoras(dia, {}).clase === 'k', 'cuando cuadra, el aviso sale en verde ✓');
ok(N.controlHoras({ produccion: [fila('Glacial', '3 kg', 'Tolva manual', 10, 2)] }, {}).clase === 'i', 'sin horas del turno: aviso informativo (aún no se puede comparar)');
const cfg = N.validarConfig(Object.assign({}, N.DEFECTO, { refrigerioHoras: '0.75' }), 'CUBOS');
ok(cfg.errores.length === 0 && cfg.config.refrigerioHoras === 0.75 && N.validarConfig(Object.assign({}, N.DEFECTO, { refrigerioHoras: '9' }), 'CUBOS').errores.some(x => /refrigerio/.test(x)), 'Configuración: refrigerio de 0 a 4 h (se guarda; 9 h no es válido)');
console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
