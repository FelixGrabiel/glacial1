/* Kardex por insumo (js/asistente/80-almacen-enlace-nucleo.js · 81 · 72). node tests/almacen-kardex.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const E=require('../js/asistente/80-almacen-enlace-nucleo.js');
const ins={codigo:'i1',itemCode:'A1'},catalogo=[{id:'a',itemCode:'A1'}],corte={items:[{id:'a',w:[100]}]},corteMeta={fechaCorte:'2026-11-18'};
const base={insumo:ins,catalogo,corte,corteMeta};
const movs=[{tipo:'ENTREGA',insumo:'i1',cantidad:30,fecha:'2026-11-18',en:2,opId:'e1',usuario:'ana',solicitudId:'S1'},
  {tipo:'ENTREGA',insumo:'i1',cantidad:10,fecha:'2026-11-18',en:3,opId:'e2'},
  {tipo:'ANULACION',anulaA:'e2',fecha:'2026-11-18',en:4,opId:'n1'},
  {tipo:'ENTREGA',insumo:'otro',cantidad:99,fecha:'2026-11-18',en:3,opId:'e9'},
  {tipo:'ENTREGA',insumo:'i1',cantidad:7,fecha:'2026-11-10',en:1,opId:'viejo'}];
const devs=[{tipo:'DEVOLUCION',insumo:'i1',cantidad:5,fecha:'2026-11-19',en:5,opId:'d1'},
  {tipo:'DEVOLUCION',insumo:'i1',cantidad:4,fecha:'2026-11-19',en:6,opId:'d2',condicion:'DANADA'}];
const k=E.kardex({...base,movs,devs});
ok(k.estado==='OK'&&k.base===100,'base = corte');
ok(JSON.stringify(k.filas.map(f=>[f.tipo,f.entrada,f.salida,f.saldo]))==='[["ENTREGA",0,30,70],["ENTREGA",0,10,60],["ANULACION",10,0,70],["DEVOLUCION",5,0,75],["DEVOLUCION",0,0,75]]','orden, entradas/salidas y saldo corrido (anulación revierte, dañado no mueve)');
ok(k.saldo===E.stockAlmacen({...base,movs,devs}).disponible,'saldo final = stockAlmacen.disponible');
ok(!k.filas.some(f=>f.opId==='e9'||f.opId==='viejo'),'excluye otros insumos y movimientos previos al corte');
ok(k.totalEntradas===15&&k.totalSalidas===40,'totales');
ok(E.kardex({...base,insumo:{codigo:'x',itemCode:''},movs,devs}).estado==='SIN_ENLACE','sin código SAP → estado');
ok(E.kardex({...base,corte:null,movs,devs}).estado==='SIN_CORTE','sin corte → estado');
const csv=E.kardexCsv(k,'Prueba "A"');
ok(csv.startsWith('﻿')&&csv.includes('"Saldo inicial (corte)"')&&csv.includes(';75;')&&csv.split('\r\n').length===10,'CSV con BOM, saldo inicial y una fila por movimiento');
const p=fs.readFileSync(R+'/js/asistente/72-asistente-pantalla.js','utf8'),d=fs.readFileSync(R+'/js/asistente/81-almacen-enlace-datos.js','utf8');
ok(/function htmlKardex/.test(p)&&/\$\{panel\}\$\{kardex\}/.test(p)&&/alm&&en\?htmlKardex/.test(p),'pantalla: tarjeta Kardex solo para Almacén');
ok(/kardexDe/.test(d),'datos expone kardexDe');
console.log(fallas?'\n'+fallas+' fallas':'\nTodo bien');
