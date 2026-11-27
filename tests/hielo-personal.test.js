/* Hielo · el personal escrito debe ser igual al N.º de personas para finalizar (27/11/2026).
   Lista numerada («1. Nombre»): solo cuentan las líneas numeradas (los títulos como «Máquinas» o «Tolva manual» no). Sin números: cada línea. */
'use strict';
const N = require('../js/hielo/97-hielo.js');
let fallas = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };
const P = personal => N.personasEscritas({ personal });
ok(P(['Máquinas', '1. Ana Paz', 'Sup. Juan', '2. Luis Rey', 'Tolva manual', '3. Rosa Li']) === 3, 'lista numerada con títulos de grupo: cuentan solo «1.», «2.», «3.» (3 personas)');
ok(P(['Ana Paz', 'Luis Rey', 'Rosa Li']) === 3 && P('Ana\nLuis\n\nRosa\n') === 3, 'sin números: cada línea es una persona (las vacías no cuentan)');
ok(P(['Ana', 'ana', 'Luis']) === 2, 'un nombre repetido cuenta una vez');
const rep = (personas, personal) => ({ fecha: '2026-11-26', turno: 'DÍA', horaInicio: '07:00', horaFin: '19:00', personas, personal,
  produccion: [{ marca: 'Glacial', presentacion: '3 kg', estacion: 'Tolva manual', bolsas: 10, horas: 11, vence: '2027-11-26', lote: '21148330' }], paradas: [], mermas: [] });
const err = r => N.validarFinalizar(r, {}).filter(x => /Personal del turno/.test(x));
const diez = Array.from({ length: 10 }, (_, i) => (i + 1) + '. Persona ' + (i + 1));
ok(err(rep(10, diez)).length === 0, '10 personas y 10 nombres numerados: se puede finalizar');
ok(err(rep(10, ['Máquinas'].concat(diez, ['Tolva manual']))).length === 0, '10 numerados con títulos de grupo: también');
const e8 = err(rep(10, diez.slice(0, 8)));
ok(e8.length === 1 && /escribiste 8 personas y el N\.º de personas es 10/.test(e8[0]), '10 personas y solo 8 nombres: no deja finalizar y lo dice');
ok(err(rep(7, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])).length === 1, '8 nombres para 7 personas: tampoco (sobra uno)');
ok(N.controlPersonal({ personas: 10, personal: diez.slice(0, 8) }).texto === '⚠ Personal escrito: 8 de 10 · faltan 2' && N.controlPersonal({ personas: 10, personal: diez }).clase === 'k', 'aviso en pantalla: «Personal escrito: 8 de 10 · faltan 2» (verde cuando cuadra)');
console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
