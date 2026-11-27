/* Convocatoria semanal · núcleo puro (js/personal/49-convocatoria-nucleo.js). node tests/convocatoria.test.js
   Casos con la forma de la semana 23/11–29/11/2026 (nombres FICTICIOS: no se suben nombres reales del personal al repositorio):
   50 día + 37 noche = 87 · 4 con ⇄ (2 vienen de noche al día, 2 del día a la noche) · 8 NUEVO · 1 en descanso médico · Bidones 20L con 3 (mínimo 4). */
'use strict';
const C = require('../js/personal/49-convocatoria-nucleo.js');
let fallas = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };

const SEMANA = '2026-11-23', ANTERIOR = '2026-11-16';
const E = C.equiposDe();                                             // equipos de fábrica (los de esta semana)
const cupos = { 'pet-dia': 8, 'b7l-dia': 16, 'c20l-int': 12, 'hielo-dia': 11, 'b20l-int': 3, 'b7l-noche': 11, 'hielo-noche': 12, 'pet-noche': 14 };   // 50 día · 37 noche
const trabajadores = []; const asig = []; let k = 0;
Object.keys(cupos).forEach(eq => { for (let i = 0; i < cupos[eq]; i++) { k++; const id = 'w' + k; trabajadores.push({ id, nombre: 'Operario ' + k, dni: String(40000000 + k), estado: 'Activo', fechaIngreso: '2024-01-15' }); asig.push({ trabajadorId: id, equipoId: eq, orden: i + 1 }); } });
// 8 NUEVOS (ingreso en las últimas 2 semanas): w3 w5 (PET día), w40 (Hielo día), w60, w61 (B7L noche), w70 (Hielo noche), w80, w81 (PET noche)
['w3', 'w5', 'w40', 'w60', 'w61', 'w70', 'w80', 'w81'].forEach((id, i) => { trabajadores.find(t => t.id === id).fechaIngreso = i % 2 ? '2026-11-20' : '2026-11-10'; });
// uno sin DNI y uno en descanso médico (no está en un equipo)
trabajadores.find(t => t.id === 'w2').dni = '';
trabajadores.push({ id: 'w-dm', nombre: 'Operario en descanso', dni: '49999999', estado: 'Activo' });
asig.push({ trabajadorId: 'w-dm', bloque: 'DESCANSO_MEDICO', hasta: '2026-11-30', columna: 'DÍA' });
const conv = { semana: SEMANA, estado: 'PUBLICADA', asignaciones: asig };
// semana anterior: w13 y w20 estaban de noche (vienen de noche: ⇄ en día); w55 y w85 estaban de día (⇄ en noche)
const antes = { semana: ANTERIOR, estado: 'CERRADA', asignaciones: asig.filter(a => !a.bloque).map(a => {
  if (a.trabajadorId === 'w13' || a.trabajadorId === 'w20') return Object.assign({}, a, { equipoId: 'b7l-noche' });
  if (a.trabajadorId === 'w55' || a.trabajadorId === 'w85') return Object.assign({}, a, { equipoId: 'b7l-dia' });
  return a; }) };

const t = C.totales(conv, E);
ok(t['DÍA'] === 50 && t['NOCHE'] === 37 && t.total === 87 && t.bloques.DESCANSO_MEDICO === 1, 'totales: 50 día + 37 noche = 87 operarios (el descanso médico no suma)');
const cambian = trabajadores.filter(x => C.cambioDeTurno(x.id, conv, antes, E)).map(x => x.id).sort();
ok(cambian.join() === ['w13', 'w20', 'w55', 'w85'].sort().join(), '⇄ automático: solo los 4 que la semana anterior estaban en el otro turno (' + cambian.join(', ') + ')');
const nuevos = trabajadores.filter(x => C.esNuevo(x, SEMANA)).map(x => x.id);
ok(nuevos.length === 8 && !C.esNuevo({ fechaIngreso: '2026-10-30' }, SEMANA) && C.esNuevo({ fechaIngreso: '2026-11-09' }, SEMANA) && C.esNuevo({ fechaIngreso: '2026-11-09' }, SEMANA, 1) === false, 'NUEVO automático: los 8 con ingreso en las últimas 2 semanas (N configurable)');
const av = C.validarConvocatoria(conv, E, trabajadores);
ok(av.some(a => a.tipo === 'minimo' && /Bidones 20L \(día\): 3 de 4 mínimos/.test(a.texto)), 'aviso: Bidones 20L 3 de 4 mínimos');
ok(av.some(a => a.tipo === 'dni' && a.trabajadorId === 'w2') && !av.some(a => a.tipo === 'doble'), 'aviso: persona sin DNI; nadie en día y noche a la vez');
// misma persona en día y noche, en descanso y convocada, dada de baja
const conv2 = Object.assign({}, conv, { asignaciones: conv.asignaciones.concat([{ trabajadorId: 'w1', equipoId: 'pet-noche' }, { trabajadorId: 'w-dm', equipoId: 'hielo-dia' }]) });
trabajadores.find(x => x.id === 'w4').estado = 'Inactivo';
const av2 = C.validarConvocatoria(conv2, E, trabajadores);
ok(av2.some(a => a.tipo === 'doble' && a.trabajadorId === 'w1') && av2.some(a => a.tipo === 'descanso' && a.trabajadorId === 'w-dm') && av2.some(a => a.tipo === 'baja' && a.trabajadorId === 'w4'), 'avisos: día y noche a la vez, descanso médico convocado y dado de baja');
trabajadores.find(x => x.id === 'w4').estado = 'Activo';

const copia = C.copiarSemana(conv, '2026-11-30', E);
ok(copia.estado === 'BORRADOR' && copia.asignaciones.filter(a => !a.bloque).length === 87 && copia.asignaciones.some(a => a.bloque === 'DESCANSO_MEDICO'), 'copiar semana: mismas 87 personas en sus equipos (BORRADOR); el descanso hasta el 30/11 sigue');
ok(C.copiarSemana(conv, '2026-12-07', E).asignaciones.every(a => !a.bloque), 'copiar semana: un descanso que ya terminó no pasa');

const dia = C.prellenarTareo(conv, E, trabajadores, '2026-11-27', 'Día'), noche = C.prellenarTareo(conv, E, trabajadores, '2026-11-27', 'Noche');
ok(dia.filter(p => !p.estadoBloque).length === 50 && noche.length === 37, 'Tareo prellenado: 50 en el turno Día (incluye los intermedios 13:00) y 37 en Noche');
const c20 = dia.find(p => p.equipoId === 'c20l-int');
ok(c20.horaProgramadaIngreso === '13:00' && c20.horaProgramadaSalida === '22:00' && c20.horario === 'Intermedio' && c20.equipo === 'Cajas 20L' && c20.origen === 'CONVOCATORIA', 'cada persona trae su equipo y horario (Cajas 20L 13:00–22:00, intermedio)');
ok(dia.some(p => p.trabajadorId === 'w-dm' && p.estadoBloque === 'DESCANSO_MEDICO') && !C.prellenarTareo(conv, E, trabajadores, '2026-12-01', 'Día').some(p => p.trabajadorId === 'w-dm'), 'el de descanso médico sale con su estado hasta el 30/11; después ya no');
ok(C.prellenarTareo(Object.assign({}, conv, { estado: 'BORRADOR' }), E, trabajadores, '2026-11-27', 'Día').length === 0, 'una convocatoria en BORRADOR no prellena el Tareo');

const n = { inicio: '21:00' };
ok(C.tardanzaPorHorarioEquipo('21:10', n) === 10 && C.tardanzaPorHorarioEquipo('20:55', n) === 0 && C.tardanzaPorHorarioEquipo('00:05', n) === 185 && C.tardanzaPorHorarioEquipo('07:11', { inicio: '07:00' }) === 11 && C.tardanzaPorHorarioEquipo('13:20', { inicio: '13:00' }) === 20, 'tardanza según el horario del equipo (también 21:00–07:00, que cruza la medianoche)');
ok(C.horasEquipo({ inicio: '21:00', fin: '07:00' }) === 10 && C.horasEquipo({ inicio: '13:00', fin: '22:00' }) === 9, 'horas del equipo: 21:00–07:00 = 10 h · 13:00–22:00 = 9 h');

// importador (formato de la imagen actual)
const txt = ['N°\tTURNO DÍA\tN°\tTURNO NOCHE', '\tEQUIPO PET 07:00–19:00 (8)\t\tBIDONES 7L 21:00–07:00 (11)', '1\tCARMEN DEMO\t1\tCARLOS DEMO *', '5\tGENNER DEMO NUEVO\t2\tELVIS DEMO', '\tBIDONES 20L 13:00-22:00 (3)\t\t', '1\tLUISA DEMO\t\t', '\tDESCANSO MÉDICO\t\t', '\tMARTINEZ DEMO\t\t', '50 OPERARIOS\t\t37 OPERARIOS'].join('\n');
const L = C.leerConvocatoriaTexto(txt);
ok(L.equipos.length === 3 && L.equipos[0].nombre === 'EQUIPO PET' && L.equipos[0].inicio === '07:00' && L.equipos[1].columna === 'NOCHE' && L.equipos[1].inicio === '21:00' && L.equipos[2].inicio === '13:00', 'importador: lee los equipos con su horario (día y noche)');
const f = n2 => L.filas.find(x => x.nombre === n2);
ok(f('GENNER DEMO').nuevo && f('CARLOS DEMO').cambio && f('CARLOS DEMO').columna === 'NOCHE' && f('MARTINEZ DEMO').bloque === 'DESCANSO_MEDICO' && L.filas.length === 6, 'importador: separa «NUEVO» y «*» del nombre, columna y descanso médico');
const maestro = [{ id: 'a', nombre: 'Carmen Demo' }, { id: 'b', nombre: 'Genner Javier Demo' }, { id: 'c', nombre: 'Demo Carlos' }, { id: 'd', nombre: 'Luisa Beltran Demo' }];
const X = C.cruzarNombres(L.filas, maestro, { [C.claveAlias('ELVIS DEMO')]: 'b' });
const x = n2 => X.find(y => y.nombre === n2);
ok(x('CARMEN DEMO').estado === 'exacto' && x('CARLOS DEMO').estado === 'exacto' && x('ELVIS DEMO').estado === 'alias' && x('ELVIS DEMO').trabajadorId === 'b' && x('GENNER DEMO').estado === 'parecido' && x('GENNER DEMO').trabajadorId === 'b' && x('MARTINEZ DEMO').estado === 'sin', 'cruce con el maestro: exacto (sin importar orden), alias guardado, parecido y sin cruce');

const im = C.modeloImagen(conv, E, trabajadores, antes, E);
ok(/CONVOCATORIA DE LA SEMANA 23\/11 AL 29\/11 · GLACIAL/.test(im.titulo) && im.dia[0].titulo === 'EQUIPO PET 07:00–19:00 (8)' && im.dia.some(b => b.titulo === 'DESCANSO MÉDICO') && im.noche.length === 3 && im.totales.total === 87, 'imagen: título, bloques por equipo con horario y cantidad, descanso médico y totales');
ok(im.dia[0].filas.find(r => r.nombre === 'OPERARIO 3').nuevo && im.dia.find(b => b.equipoId === 'b7l-dia').filas.find(r => r.nombre === 'OPERARIO 13').cambio, 'imagen: NUEVO y ⇄ calculados en cada nombre');
ok(C.lunesDe('2026-11-27') === '2026-11-23' && C.lunesDe('2026-11-29') === '2026-11-23' && C.lunesDe('2026-11-30') === '2026-11-30', 'semana de lunes a domingo');
console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
