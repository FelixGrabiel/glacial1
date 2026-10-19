/* Horas extras (registro con justificación y autorización): reglas puras. */
const N = require('../js/personal/47a-horas-extras-nucleo.js');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const base = { id: 'a', area: 'produccion', trabajadorId: 't1', trabajadorNombre: 'Pérez Ramos, Luis', dni: '12345678', fecha: '2026-10-19', turno: 'Día', horaInicio: '19:00', horaFin: '22:30',
  motivo: 'Cobertura de falta / descanso', justificacion: 'Cubre a un compañero con descanso médico', autorizadoPor: 'rtorres', autorizadoPorNombre: 'R. Torres', estado: 'VIGENTE' };
const MOT = { produccion: ['Cobertura de falta / descanso', 'Otro'], mantenimiento: ['Correctivo / avería'] };

ok(N.totalHoras('19:00', '22:30') === 3.5 && N.totalHoras('22:00', '02:00') === 4 && N.totalHoras('07:00', '07:00') === 0 && N.totalHoras('23:30', '00:15') === 0.75, 'total de horas: 3,5 h; cruza medianoche (22→02 = 4 h); iguales = 0');
ok(N.totalHoras('', '10:00') === 0 && N.totalHoras('25:00', '10:00') === 0 && N.hmAMin('9:05') === 545, 'horas inválidas o vacías no suman');
ok(N.validar(base, { motivos: MOT }).length === 0, 'un registro completo es válido');
ok(N.validar(Object.assign({}, base, { horaFin: '19:00' }), { motivos: MOT }).some(e => /distinta/.test(e)), 'hora fin igual a inicio: error');
ok(N.validar(Object.assign({}, base, { justificacion: 'corta' }), { motivos: MOT }).some(e => /al menos 15/.test(e)), 'justificación de menos de 15 caracteres: error');
ok(N.validar(Object.assign({}, base, { justificacion: '            x    ' }), { motivos: MOT }).some(e => /al menos 15/.test(e)), 'los espacios no cuentan como justificación');
ok(N.validar(Object.assign({}, base, { autorizadoPor: '' }), { motivos: MOT }).some(e => /autorizó/.test(e)), 'sin autorizador: error');
ok(N.validar(Object.assign({}, base, { motivo: 'Inventado' }), { motivos: MOT }).some(e => /lista/.test(e)) && N.validar(Object.assign({}, base, { motivo: '' }), { motivos: MOT }).some(e => /Falta el motivo/.test(e)), 'el motivo debe ser de la lista del área');
ok(N.validar(Object.assign({}, base, { area: 'otra' }), { motivos: MOT }).some(e => /área/.test(e)) && N.validar(Object.assign({}, base, { turno: '' }), { motivos: MOT }).some(e => /turno/.test(e)), 'área y turno válidos');
const f = N.faltantes({ area: 'produccion', trabajadorNombre: 'X', horaInicio: '10:00', justificacion: 'abc' });
ok(f.join('|') === 'la hora de fin|el motivo|la justificación (3/15 caracteres)|quién autorizó', 'el mensaje dice qué falta: ' + f.join(', '));
ok(N.faltantes(base).length === 0, 'completo: no falta nada');
/* choques */
const otro = Object.assign({}, base, { id: 'b', horaInicio: '22:00', horaFin: '23:00' });
ok(N.choques(otro, [base]).length === 1, 'dos tramos solapados de la misma persona y fecha chocan');
ok(N.choques(Object.assign({}, otro, { horaInicio: '22:30' }), [base]).length === 0, 'tramos contiguos no chocan');
ok(N.choques(Object.assign({}, otro, { trabajadorId: 't2', dni: '999', trabajadorNombre: 'Otro' }), [base]).length === 0, 'otra persona no choca');
ok(N.choques(Object.assign({}, otro, { fecha: '2026-10-20' }), [base]).length === 0, 'otra fecha no choca');
ok(N.choques(otro, [Object.assign({}, base, { estado: 'ANULADO' })]).length === 0, 'un registro anulado no choca');
ok(N.choques(Object.assign({}, base), [base]).length === 0, 'un registro no choca consigo mismo (editar)');
const noche = Object.assign({}, base, { id: 'n', horaInicio: '23:00', horaFin: '02:00' });
ok(N.choques(Object.assign({}, base, { id: 'm', horaInicio: '01:00', horaFin: '03:00' }), [noche]).length === 0, 'el tramo que cruza medianoche cuenta como de su fecha de inicio: 01:00 de la misma fecha no choca con 23:00→02:00');
ok(N.choques(Object.assign({}, base, { id: 'm', horaInicio: '22:00', horaFin: '23:30' }), [noche]).length === 1, 'pero 22:00–23:30 sí choca con 23:00→02:00');
/* resumen */
const lista = [base, otro, Object.assign({}, base, { id: 'c', trabajadorId: 't3', dni: '777', trabajadorNombre: 'Quispe', horaInicio: '07:00', horaFin: '10:00', autorizadoPor: '' }), Object.assign({}, base, { id: 'd', estado: 'ANULADO' })];
const r = N.resumen(lista);
ok(r.registros === 3 && r.horas === 3.5 + 1 + 3 && r.trabajadores === 2 && r.sinAutorizar === 1, 'tarjetas: horas, trabajadores distintos y sin autorizar (los anulados no cuentan)');
const tp = N.totalesPorPersona(lista);
ok(tp.get('DNI:12345678').horas === 4.5 && tp.get('DNI:12345678').registros === 2 && tp.size === 2, 'total por persona (solo vigentes)');
/* filtros */
const fl = N.filtrar(lista, { area: 'produccion', desde: '2026-10-01', hasta: '2026-10-31' });
ok(fl.length === 3 && N.filtrar(lista, { trabajador: 'quispe' }).length === 1 && N.filtrar(lista, { estado: 'anulados' }).length === 1 && N.filtrar(lista, { motivo: 'Otro' }).length === 0, 'filtros por área, rango, trabajador, motivo y estado');
/* diferencias para la bitácora */
const df = N.diferencias(base, Object.assign({}, base, { horaFin: '23:00', totalHoras: 4 }));
ok(JSON.stringify(df.antes) === '{"horaFin":"22:30"}'.replace('}', ',"totalHoras":null}') || (df.antes.horaFin === '22:30' && df.despues.horaFin === '23:00' && df.despues.totalHoras === 4 && Object.keys(df.antes).length === 2), 'la bitácora guarda solo lo que cambió (antes y después)');
ok(N.textoHoras(3.5) === '3,5 h' && N.textoHoras(3) === '3 h' && N.textoHoras(0.75) === '0,75 h', 'texto de horas con coma');
console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
