/* HORAS EXTRAS de los Excel de tareo: minutos ENTEROS (antes: fracciones de día tipo 0.011111 u horas con decimales).
   node tests/tareo-extras-minutos.test.js */
'use strict';
const fs = require('fs'), R = require('path').resolve(__dirname, '..');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) { fallas++; process.exitCode = 1; } };
const leer = f => fs.readFileSync(R + '/' + f, 'utf8');
const t = leer('js/personal/13-tareo.js'), a38 = leer('js/rrhh/38-tareo-rrhh-exportacion.js'), a27 = leer('js/rrhh/27-rrhh-excel-operativo.js');
const fn = new Function(t.match(/function tareoSaldoMinutos\(saldo\) \{[\s\S]*?\n\}/)[0] + '; return tareoSaldoMinutos;')();
ok(fn(16 / 60) === 16 && fn(-1) === -60 && fn(0) === 0 && fn(1.5) === 90, 'tareoSaldoMinutos: 16 min → 16, -1 h → -60, 1,5 h → 90');
ok(Number.isInteger(fn(0.27777)) && fn(null) === '' && fn(undefined) === '' && fn(NaN) === '', 'tareoSaldoMinutos: siempre entero; sin dato → celda vacía');
ok(/'HORAS EXTRAS \(min\)': tareoSaldoMinutos\(/.test(t), 'Excel del tareo (13-tareo): HORAS EXTRAS (min) en minutos');
ok(/'HORAS EXTRAS a favor \(min\)': Math\.round\(item\.saldoFavor \* 60\)/.test(t) && /'HORAS EXTRAS en contra \(min\)': Math\.round\(item\.saldoContra \* 60\)/.test(t) && /'Total HE en minutos[^']*': Math\.round\(/.test(t), 'Resumen mensual: a favor, en contra y Total HE en minutos enteros');
ok(!/'HORAS EXTRAS(?: a favor| en contra)?': Number\(/.test(t), 'ya no queda ninguna columna de HORAS EXTRAS con decimales en 13-tareo');
ok(/'HORAS EXTRAS \(min\)'/.test(a27) && /tareoSaldoMinutos\(tareoSaldoHoras/.test(a27) && !/tareoSaldoNumero/.test(a27), 'Excel operativo (27): HORAS EXTRAS (min)');
ok(/case 'saldo':return f\.saldoMin===null\?null:Math\.round\(f\.saldoMin\)/.test(a38) && !/fraccion\(f\.saldoMin\)/.test(a38), 'Excel RRHH (38): saldo = minutos enteros, no fracción de día');
ok(/FMT_SALDO='\+0;-0;0'/.test(a38) && !/\[h\]:mm;-\[h\]:mm/.test(a38), 'Excel RRHH (38): formato numérico entero con signo');
ok(/Min\. a favor/.test(a38) && /Math\.round\(r\.favorMin\)/.test(a38) && /Math\.round\(t\.fav\)/.test(a38), 'Excel RRHH (38): resumen y totales por persona en minutos enteros');
ok(/tareoHistorialCoincide/.test(t) && /tareoGeneralBuscar/.test(t) && /tareoResumenFiltrar/.test(t), 'filtros de Historial, Tareo General y Resumen mensual presentes');
console.log(fallas ? '\n' + fallas + ' fallas' : '\nTodo bien');
