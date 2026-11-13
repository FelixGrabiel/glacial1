/* Calculadora de conversión de Evidencias (13/11/2026): kg ↔ UND con el peso de 1 unidad. Solo calcula. node tests/evidencias-calculadora.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)process.exitCode=1;};
const N=require('../js/asistente/84-evidencias-insumos-nucleo.js');

ok(N.gramajeDeTexto('42.7gr. Cr.1881')===42.7&&N.gramajeDeTexto('21,7 g')===21.7&&N.gramajeDeTexto('Preforma 90 gramos')===90,'gramaje del Producto: «42.7gr.», «21,7 g», «90 gramos»');
ok(N.gramajeDeTexto('Y35')===null&&N.gramajeDeTexto('')===null&&N.gramajeDeTexto(null)===null&&N.gramajeDeTexto('BOLSA 3KG')===null,'sin gramaje (o en kg) → null');
ok(N.convertir({gramos:42.7,kg:346.59}).und===8117,'346.59 kg de preformas de 42.7 g → 8117 UND (misma fórmula del Registro: kg × 1000 ÷ g, redondeado)');
ok(N.convertir({gramos:42.7,und:8141}).kg===347.621,'8141 UND de 42.7 g → 347.621 kg');
ok(N.convertir({gramos:42.7,kg:'346,59'}).und===8117,'acepta coma decimal');
ok(N.convertir({gramos:0,kg:10}).und===null&&N.convertir({gramos:5,kg:''}).und===null&&N.convertir({gramos:5,kg:-1,und:''}).und===null,'sin peso de unidad o sin cantidad válida no calcula');
ok(N.diferenciaPct(8117,8141)===-0.3&&N.diferenciaPct(100,0)===null,'diferencia con la etiqueta en % (sin cantidad en la etiqueta no compara)');
const P=fs.readFileSync(R+'/js/asistente/86-evidencias-insumos-pantalla.js','utf8');
ok(/calculadoraHtml\(d\)/.test(P)&&/Solo calcula: no cambia los datos de la evidencia/.test(P)&&!/ieCalc[^\n]*borrador\(\)/.test(P),'la pantalla muestra la calculadora y no escribe en el borrador de la evidencia');
