/* Búsqueda común (js/nucleo/04b-busqueda.js): lo que escribe la gente debe encontrar lo que espera. node tests/busqueda-comun.test.js */
'use strict';
const B=require('../js/nucleo/04b-busqueda.js');
const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)process.exitCode=1;};
ok(B.coincide('PREFORMA 13.5','Prefo')&&B.coincide('PREFORMA 13.5','preforma 13')&&B.coincide('PREFORMA 13.5','13.5 preforma'),'«Prefo», «preforma 13» y «13.5 preforma» encuentran PREFORMA 13.5 (inicio de palabra y cualquier orden)');
ok(B.coincide('BOLSA 3KG HIELO','bolsa 3 kg')&&B.coincide('BOLSA 3 KG HIELO','bolsa 3kg')&&!B.coincide('BOLSA 13 KG','bolsa 3 kg'),'«3 kg» y «3kg» son lo mismo, y 3 kg no coincide con 13 kg');
ok(B.coincide('GARCÍA PÉREZ, MARÍA','maria perez')&&B.coincide('García Pérez María','PEREZ GARCIA')&&B.coincide('Ñañez Peña','nanez pena'),'nombres: sin tildes ni mayúsculas, en cualquier orden');
ok(B.coincide('DNI 45218976 JUAN','5218')&&B.coincide('DNI 45218976','8976')&&!B.coincide('DNI 45218976','999'),'un DNI se encuentra por sus primeras o últimas cifras (4 o más)');
ok(B.coincide('TAPA 38MM AZUL','tapa azul')&&B.coincide('TAPA 38MM AZUL','azul 38 mm')&&!B.coincide('TAPA 38MM AZUL','tapa roja'),'«tapa azul» encuentra TAPA 38MM AZUL; una palabra que no está no coincide');
ok(B.coincide('0272-26 FIBRAPRINT','0272-26')&&B.coincide('LOTE 261011F320','f320')&&B.coincide('X','')&&B.coincide('X','  '),'lotes con guion, parte del código y consulta vacía (coincide con todo)');
ok(B.coincide(['Falla de equipo','Envasadora'],'envasadora falla')&&B.coincide(null,'')&&!B.coincide(null,'a'),'acepta lista de textos y valores vacíos');
ok(B.norm('Peso 13,5 kg')==='PESO 13.5KG'&&B.norm('  A-B/C  ')==='A B C','normaliza: coma decimal, unidades pegadas y signos como espacios');
ok(B.coincide("Bell's 250 ml",'bells')&&B.coincide('BELLS','bell\'s'),'el apóstrofo se ignora (Bell\'s = Bells)');
ok(B.filtrar([{n:'Preforma 10'},{n:'Tapa'}],'prefo',x=>x.n).length===1&&B.filtrar([1,2],'',x=>x).length===2,'filtrar: aplica la regla y devuelve todo si no hay consulta');
/* Sitios que ya usan la búsqueda común (se prueban con las funciones reales de cada módulo). */
const fs=require('fs');
const T=require('../js/asistente/87-trazabilidad-lotes-nucleo.js'),II=require('../js/asistente/74-inventario-insumos-nucleo.js'),EV=require('../js/asistente/84-evidencias-insumos-nucleo.js'),AD=require('../js/admin/110-admin-nucleo.js');
const cat=[{id:'1',nombre:'PREFORMA 10.4'},{id:'2',nombre:'BOLSA 3KG HIELO'},{id:'3',nombre:'TAPA 38MM AZUL',itemCode:'T38'},{id:'4',nombre:'Etiqueta Termo Bell\'s 250 ml'}];
ok(T.buscarArticulos(cat,'Prefo').length===1&&T.buscarArticulos(cat,'bolsa 3 kg').length===1&&T.buscarArticulos(cat,'azul tapa').length===1&&T.buscarArticulos(cat,'t38').length===1&&T.buscarArticulos(cat,'bell 250ml').length===1&&T.buscarArticulos(cat,'xyz').length===0,'catálogo del lote: «Prefo», «bolsa 3 kg», «azul tapa», código y «bell 250ml» encuentran su artículo');
const filas=[{nombre:'TAPA 38MM AZUL',itemCode:'T38',codigo:''},{nombre:'TAPA 38MM ROJA',itemCode:'',codigo:''},{nombre:'PREFORMA 13.5',itemCode:'',codigo:''}];
ok(II.filtrarStock(filas,{texto:'tapa azul'}).length===1&&II.filtrarStock(filas,{texto:'preforma 13'}).length===1&&II.filtrarStock(filas,{texto:''}).length===3,'Inventario: «tapa azul» (en cualquier orden) y «preforma 13»');
const evs=[{estado:'pendiente',archivoOriginal:'IMG-1.jpg',campos:{producto:{valor:'Etiqueta BELL\'S'},proveedor:{valor:'FIBRAPRINT S.A.C.'},lote:{valor:'0272-26'}},categoria:'etiquetas'}];
ok(EV.filtrar(evs,{texto:'fibraprint 0272'}).length===1&&EV.filtrar(evs,{texto:'bells etiqueta'}).length===1&&EV.filtrar(evs,{texto:'tapa'}).length===0,'Evidencias: palabras de campos distintos (proveedor + lote) y en cualquier orden');
ok(AD.filtrarAuditoria([{accion:'Cambió el rol',quien:'María Pérez',modulo:'Usuarios'}],{texto:'perez maria'}).length===1,'Administración › Auditoría: «perez maria» encuentra a María Pérez');
/* Todos los archivos que usan la búsqueda común están cargados en index.html antes que ellos. */
const html=fs.readFileSync(require('path').resolve(__dirname,'..','index.html'),'utf8');
ok(/js\/nucleo\/04b-busqueda\.js/.test(html)&&html.indexOf('04b-busqueda.js')<html.indexOf('js/asistente/74-inventario'),'index.html carga la búsqueda común antes de los módulos que la usan');
