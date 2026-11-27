/* Hielo · lote automático (js/hielo/97l-hielo-lote.js + 97-hielo.js). node tests/hielo-lote.test.js
   LOTE = TURNO (Día/Intermedio 2 · Noche 1) + MARCA + MÁQUINA (tolva 1 · envasadora 3 · vasos 2 · premium 0) + SEMANA (2) + DÍA JULIANO (3), todo junto. */
'use strict';
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if(!c) fallas++; };
const L = require(R + '/js/hielo/97l-hielo-lote.js');
const H = require(R + '/js/hielo/97-hielo.js');
const F = '2026-11-26';      // semana 48, día juliano 330
const lote = (producto, marca, estacion, turno, fecha, bolsas) => L.loteHielo({ producto, marca, estacion, turno, fecha: fecha || F, bolsas: bolsas === undefined ? 100 : bolsas });
ok(L.semana(F) === '48' && L.juliano(F) === '330' && L.semana('2026-01-05') === '02' && L.juliano('2026-01-05') === '005', 'semana con 2 dígitos y día juliano con 3 (26/11/2026 → 48 y 330; 05/01 → 02 y 005)');
ok(lote('CUBOS', 'Glacial', 'Tolva manual', 'DÍA').lote === '21148330', 'Glacial 3 kg · tolva manual · Día → 21148330');
ok(lote('CUBOS', 'Glacial', 'Tolva manual', 'INTERMEDIO').lote === '21148330' && lote('CUBOS', 'Glacial', 'Tolva manual', 'NOCHE').lote === '11148330', 'Intermedio = 2 (como Día) · Noche = 1');
ok(lote('CUBOS', 'Precio Uno', 'Env. automática', 'NOCHE').lote === '113348330', 'Precio Uno (13) · envasadora automática (3) · Noche → 113348330');
const cod = m => L.codigoMarca('CUBOS', m);
ok(cod('Glacial') === '1' && cod('Rappi') === '1' && cod('Nutra') === '1' && cod('Cusine & Co') === '2' && cod('Cuisine & Co') === '2' && cod('Scala') === '3' && cod('Tottus CD') === '4' && cod("Bell's") === '6' && cod('Aro') === '6' && cod('Listo') === '7' && cod('Austral') === '9' && cod('Precio Uno') === '13',
  'códigos de cubos con los nombres del sistema (Cusine & Co, Tottus CD, Bell’s…)');
ok(lote('VASOS', 'OXXO', '', 'DÍA').lote === '2102' + '48330' && lote('VASOS', 'Glacial', '', 'NOCHE').lote === '11248330', 'vasos: Oxxo 10 / Glacial 1, máquina 2');
ok(lote('PREMIUM', 'Glacial', '', 'DÍA').lote === '21048330' && lote('PREMIUM', 'Cuisine & Co', '', 'DÍA').lote === '22048330' && lote('PREMIUM', "Bell's", '', 'NOCHE').lote === '16048330', 'premium: Glacial 1 / Cuisine 2 / Bell’s 6, máquina 0');
ok(['Molitalia', 'Certificado', 'Hoteles'].every(m => lote('CUBOS', m, 'Tolva manual', 'DÍA').manual && !lote('CUBOS', m, 'Tolva manual', 'DÍA').lote), 'Molitalia, Certificado y Hoteles: lote a mano');
ok(lote('CUBOS', 'San Fernando', 'Tolva manual', 'DÍA').manual && /sin código/.test(lote('CUBOS', 'San Fernando', 'Tolva manual', 'DÍA').motivo), 'marca sin código (San Fernando): a mano');
ok(lote('CUBOS', 'Glacial', 'Tolva manual', 'DÍA', F, 0).lote === '' && /producción/.test(lote('CUBOS', 'Glacial', 'Tolva manual', 'DÍA', F, 0).motivo), 'sin producción no hay lote');
ok(lote('CUBOS', 'Glacial', '', 'DÍA').lote === '' && /estación/.test(lote('CUBOS', 'Glacial', '', 'DÍA').motivo), 'cubos sin estación: pide la estación');

// En el reporte: se aplica solo y finalizar exige el lote a mano
const rep = { producto: 'CUBOS', fecha: F, turno: 'DÍA', estado: 'EN_REGISTRO', horaInicio: '07:00', horaFin: '15:00', personas: 4, personal: ['A'], paradas: [], mermas: [],
  produccion: [{ marca: 'Glacial', presentacion: '3 kg', estacion: 'Tolva manual', bolsas: 300, horas: 8, vence: '2027-01-01', lote: 'viejo' },
               { marca: 'Molitalia', presentacion: '3 kg', estacion: 'Env. automática', bolsas: 50, horas: 2, vence: '2027-01-01', lote: '' }] };
H.aplicarLotes(rep);
ok(rep.produccion[0].lote === '21148330' && rep.produccion[1].lote === '', 'aplicarLotes: pone el automático y no toca el de Molitalia');
let e = H.validarFinalizar(rep, {});
ok(e.some(x => /escribe el lote de Molitalia \(obligatorio\)/.test(x)), 'finalizar exige el lote a mano de Molitalia si se produjo');
rep.produccion[1].lote = 'MOL-2611';
ok(!H.validarFinalizar(rep, {}).some(x => /lote/i.test(x)), 'con el lote de Molitalia escrito, no hay error de lote');
const fin = JSON.parse(JSON.stringify(rep)); fin.estado = 'FINALIZADO'; fin.produccion[0].lote = 'X'; H.aplicarLotes(fin);
ok(fin.produccion[0].lote === 'X', 'un reporte finalizado no cambia su lote');
const html = fs.readFileSync(R + '/index.html', 'utf8');
ok(html.indexOf('97l-hielo-lote.js?v=') > 0 && html.indexOf('97l-hielo-lote.js?v=') < html.indexOf('97-hielo.js?v='), 'index.html carga 97l antes de 97-hielo');
console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
