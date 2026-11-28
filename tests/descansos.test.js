/* Descansos automáticos (49d-descansos-nucleo.js): sorteo con reglas sobre una semana con la forma de la del 30/11/2026
   (49 de día + 37 de noche + 1 descanso médico, mínimos de prueba). Nombres FICTICIOS: no se suben nombres reales al repositorio.
   Uso: node tests/descansos.test.js */
'use strict';
const D = require('../js/personal/49d-descansos-nucleo.js');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if(!c) fallas++; };
const SEM = '2026-11-30';
const EQ = [
  ['pet-dia', 'Equipo PET', 'DÍA', 8], ['b7l-dia', 'Bidones 7L', 'DÍA', 16], ['c20l-int', 'Cajas 20L', 'DÍA', 11], ['hielo-dia', 'Equipo Hielo', 'DÍA', 11], ['b20l-int', 'Bidones 20L', 'DÍA', 3],
  ['b7l-noche', 'Bidones 7L', 'NOCHE', 11], ['hielo-noche', 'Equipo de Hielo', 'NOCHE', 12], ['pet-noche', 'PET', 'NOCHE', 14]
];
const equipos = EQ.map(([id, nombre, columna], i) => ({ id, nombre, columna, minimo: 0, minimoDescanso: D.MINIMOS_PRUEBA[id], orden: i + 1, activo: true }));
function semanaBase(){
  const asign = [], ant = [];
  EQ.forEach(([id, , col, n]) => { for(let i = 1; i <= n; i++){ const t = id + '-' + i; asign.push({ trabajadorId: t, nombre: 'Operario ' + t, equipoId: id, orden: i }); ant.push({ trabajadorId: t, equipoId: id }); } });
  return { asign, ant };
}
const { asign, ant } = semanaBase();
// cambios de turno respecto a la semana anterior (como en la semana real): 2 pasan a noche, 3 pasan a día
const aNoche = ['b7l-noche-1', 'pet-noche-13'], aDia = ['b7l-dia-5', 'b7l-dia-12', 'hielo-dia-2'];
ant.forEach(a => { if(aNoche.includes(a.trabajadorId)) a.equipoId = 'pet-dia'; if(aDia.includes(a.trabajadorId)) a.equipoId = 'b7l-noche'; });
// descanso médico (solo en el bloque, columna día, hasta el lunes)
asign.push({ trabajadorId: 'medico-1', nombre: 'Persona en descanso', bloque: 'DESCANSO_MEDICO', columna: 'DÍA', hasta: '2026-11-30' });
const conv = { semana: SEM, asignaciones: asign }, anterior = { semana: '2026-11-23', asignaciones: ant };

const gen = (col, semilla, extra) => D.generarDescansos(Object.assign({ semana: SEM, columna: col, equipos, conv, anterior, semilla }, extra || {}));
const dia = gen('DÍA', 4821), noche = gen('NOCHE', 4821);
const todos = dia.asignaciones.concat(noche.asignaciones), conDesc = todos.filter(a => a.status !== 'MEDICO');
ok(dia.conDescanso === 49 && noche.conDescanso === 37 && dia.asignaciones.length === 50, 'cuadro de día con 49 + 1 descanso médico y de noche con 37');
ok(conDesc.every(a => a.dia !== null && a.dia >= 0 && a.dia <= 6) && dia.porProgramar + noche.porProgramar === 0, '1 descanso por semana para los 86 (0 por programar)');
const bajoMin = r => Object.keys(r.trabajando).some(id => r.trabajando[id].some((t, d) => r.minimos[id][d] !== null && t < r.minimos[id][d]));
ok(!bajoMin(dia) && !bajoMin(noche), 'ningún equipo baja de su mínimo ningún día');
const domExacto = r => Object.keys(r.trabajando).every(id => r.trabajando[id][6] === r.minimos[id][6]);
ok(domExacto(dia) && domExacto(noche) && dia.totalesPorDia[6] + noche.totalesPorDia[6] === 23, 'domingo con el mínimo exacto: descansan ' + (dia.totalesPorDia[6] + noche.totalesPorDia[6]) + ' (23)');
const por = id => todos.find(a => a.trabajadorId === id);
ok(aNoche.every(id => por(id).dia === 0 && por(id).status === 'PASA_NOCHE' && por(id).origen === 'FIJO'), 'quienes pasan de día a noche → lunes fijo');
ok(aDia.every(id => por(id).dia !== 6 && por(id).status === 'VIENE_NOCHE'), 'quienes pasan de noche a día → nunca domingo');
const med = por('medico-1');
ok(med.dia === null && med.status === 'MEDICO' && D.statusTexto(med) === 'Descanso médico hasta 30/11', 'descanso médico → sin X («Descanso médico hasta 30/11»)');
ok(dia.reglas.every(r => r.ok) && noche.reglas.every(r => r.ok), 'checklist de reglas: todas cumplidas');
ok(dia.avisos.some(a => a.tipo === 'info' && /Bidones 20L: solo 1 puede descansar por día/.test(a.texto)), 'aviso: «Bidones 20L: solo 1 puede descansar por día»');

const otra = gen('DÍA', 4821), distinta = gen('DÍA', 7777);
ok(JSON.stringify(otra.asignaciones) === JSON.stringify(dia.asignaciones), 'misma semilla ⇒ mismo resultado');
ok(JSON.stringify(distinta.asignaciones) !== JSON.stringify(dia.asignaciones) && distinta.reglas.every(r => r.ok), 'otra semilla ⇒ otra solución, también válida');

// sin solución: equipo con tamaño = mínimo
const eqApretado = equipos.map(e => e.id === 'b20l-int' ? Object.assign({}, e, { minimoDescanso: 3 }) : e);
const sin = D.generarDescansos({ semana: SEM, columna: 'DÍA', equipos: eqApretado, conv, anterior, semilla: 1 });
const prog = sin.asignaciones.filter(a => a.equipoId === 'b20l-int');
ok(prog.every(a => a.status === 'PROGRAMAR' && a.dia === null && /Bidones 20L: 3 personas y mínimo 3, no hay días libres/.test(a.motivo)) && sin.porProgramar === 3 && !sin.reglas[0].ok, 'sin solución (3 personas y mínimo 3) ⇒ «Programar» con el motivo');

// mínimo por día y días sin operar
const eqDom = equipos.map(e => e.id === 'b20l-int' ? Object.assign({}, e, { diasSinOperar: [6] }) : e);
const sd = D.generarDescansos({ semana: SEM, columna: 'DÍA', equipos: eqDom, conv, anterior, semilla: 3 });
ok(sd.asignaciones.filter(a => a.equipoId === 'b20l-int').every(a => a.dia === 6) && sd.minimos['b20l-int'][6] === null, 'equipo que no opera el domingo: todos descansan ese día (no cuenta mínimo)');
const eqPd = equipos.map(e => e.id === 'pet-dia' ? Object.assign({}, e, { minimoPorDia: [8, 6, 6, 6, 6, 6, 6] }) : e);
const pd = D.generarDescansos({ semana: SEM, columna: 'DÍA', equipos: eqPd, conv, anterior, semilla: 3 });
ok(pd.trabajando['pet-dia'][0] === 8 && pd.reglas[1].ok, 'mínimo por día: PET pide 8 el lunes → nadie de PET descansa lunes');

// médico parcial (configurable): con medicoParcial recibe descanso después del fin
const conv2 = { semana: SEM, asignaciones: asign.concat([{ trabajadorId: 'pet-dia-3', bloque: 'DESCANSO_MEDICO', columna: 'DÍA', hasta: '2026-12-02' }]) };
const noParcial = D.generarDescansos({ semana: SEM, columna: 'DÍA', equipos, conv: conv2, anterior, semilla: 5 });
const parcial = D.generarDescansos({ semana: SEM, columna: 'DÍA', equipos, conv: conv2, anterior, semilla: 5, config: { medicoParcial: true } });
const p3 = r => r.asignaciones.find(a => a.trabajadorId === 'pet-dia-3');
ok(p3(noParcial).status === 'MEDICO' && p3(noParcial).dia === null, 'descanso médico hasta el miércoles: por defecto sin descanso sorteado');
ok(p3(parcial).dia > 2 && p3(parcial).status !== 'MEDICO', 'con «médico parcial»: recibe su descanso después del miércoles (' + D.DIAS[p3(parcial).dia] + ')');
ok(noParcial.trabajando['pet-dia'][0] === noParcial.asignaciones.filter(a => a.equipoId === 'pet-dia' && a.trabajadorId !== 'pet-dia-3' && a.dia !== 0).length, 'quien está en descanso médico no cuenta como «trabajando» esos días');

// cambio a mano: aviso, no bloquea
const pasa = dia.asignaciones.find(a => a.equipoId === 'b20l-int' && a.dia !== 6 && a.status !== 'MEDICO');
const otroDiaB20 = dia.asignaciones.find(a => a.equipoId === 'b20l-int' && a.dia !== 6 && a.trabajadorId !== pasa.trabajadorId).dia;
const m = D.mover(dia.asignaciones, pasa.trabajadorId, otroDiaB20, 'J. Pérez', equipos, 'DÍA', SEM, D.personasDe(conv, anterior, equipos, 'DÍA', SEM));
const movida = m.asignaciones.find(a => a.trabajadorId === pasa.trabajadorId);
ok(movida.dia === otroDiaB20 && movida.status === 'MANUAL' && D.statusTexto(movida) === 'Cambiado a mano (J. Pérez)', 'mover a mano: la X cambia de día y queda «Cambiado a mano (J. Pérez)»');
ok(m.avisos.some(x => x.tipo === 'minimo' && /Bidones 20L/.test(x.texto)), 'si rompe una regla avisa (Bidones 20L bajo el mínimo) sin bloquear');
const vn = D.mover(dia.asignaciones, 'b7l-dia-5', 6, 'J. Pérez', equipos, 'DÍA', SEM, D.personasDe(conv, anterior, equipos, 'DÍA', SEM));
ok(vn.avisos.some(x => /viene de noche y descansa domingo/.test(x.texto)), 'mover a domingo a quien viene de noche → aviso de regla');

// equidad: 8 semanas seguidas con la misma gente
const hist = [], domingos = new Map();
let semana = SEM, convK = conv, antK = { semana: '2026-11-23', asignaciones: asign.filter(a => !a.bloque).map(a => ({ trabajadorId: a.trabajadorId, equipoId: a.equipoId })) };
for(let k = 0; k < 8; k++){
  const eq = D.equidad(hist, semana, 8);
  ['DÍA', 'NOCHE'].forEach(col => {
    const r = D.generarDescansos({ semana, columna: col, equipos, conv: Object.assign({}, convK, { semana, asignaciones: asign.filter(a => !a.bloque) }), anterior: antK, historial: eq, semilla: 100 + k });
    hist.push({ semana, asignaciones: r.asignaciones });
    r.asignaciones.forEach(a => { if(a.dia === 6) domingos.set(a.trabajadorId, (domingos.get(a.trabajadorId) || 0) + 1); });
  });
  semana = D.sumarDias(semana, 7);
}
const ids = asign.filter(a => !a.bloque).map(a => a.trabajadorId), cuenta = ids.map(id => domingos.get(id) || 0);
const repetidos = hist.filter((h, i) => i >= 2).reduce((n, h, i) => n + h.asignaciones.filter(a => { const prev = hist[i].asignaciones.find(x => x.trabajadorId === a.trabajadorId); return prev && a.dia !== 6 && prev.dia === a.dia; }).length, 0);
ok(Math.min(...cuenta) >= 1 && Math.max(...cuenta) <= 4, 'equidad en 8 semanas: cada operario descansa entre ' + Math.min(...cuenta) + ' y ' + Math.max(...cuenta) + ' domingos (nadie 0)');
ok(cuenta.filter(c => c === 2).length >= ids.length * 0.6, 'equidad: la mayoría (' + cuenta.filter(c => c === 2).length + ' de ' + ids.length + ') descansa ~2 domingos (uno cada 4 semanas)');
ok(repetidos <= ids.length * 0.15, 'casi nunca el mismo día entre semana que la semana anterior (' + repetidos + ' repeticiones en 7 semanas)');

// cuadro (formato del Excel) y Tareo
const cuadro = D.modeloCuadro(dia, equipos, []);
ok(/^DESCANSOS TURNO DÍA · SEMANA 30\/11 AL 06\/12 · GENERADO POR GLACIAL$/.test(cuadro.titulo) && cuadro.dias.map(x => x.letra + x.num).join(' ') === 'L30 M01 M02 J03 V04 S05 D06', 'cuadro con el título y los días del Excel (L 30 … D 06)');
ok(cuadro.resumen === '49 de 49 · 0 por programar' && /mínimos 6 \/ 12 \/ 8 \/ 8 \/ 2/.test(cuadro.trabajando.minimos), 'fila roja «49 de 49 · 0 por programar» y mínimos 6 / 12 / 8 / 8 / 2');
const unoDia = dia.asignaciones.find(a => a.dia === 3);
ok(D.descansaEn([{ semana: SEM, asignaciones: dia.asignaciones }], unoDia.trabajadorId, '2026-12-03') && !D.descansaEn([{ semana: SEM, asignaciones: dia.asignaciones }], unoDia.trabajadorId, '2026-12-04'), 'Tareo: descansaEn sabe qué día descansa cada persona');
console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
