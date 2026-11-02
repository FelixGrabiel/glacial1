/* Almacén: carga masiva de stock mínimo y punto de reorden (74-inventario-insumos-nucleo.js › leerMinimos / plantillaMinimos). */
'use strict';
const N=require('../js/asistente/74-inventario-insumos-nucleo.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const cat=[{id:'a',codigo:'INS-0001',itemCode:'I0002',nombre:'BOBINA BELLS',stockMinimo:0,puntoReorden:0,prioritario:true},
  {id:'b',codigo:'INS-0002',itemCode:'I0012',nombre:'BOLSA "GLACIAL"',stockMinimo:100,puntoReorden:200,prioritario:true},
  {id:'c',codigo:'INS-0003',itemCode:'I0022',nombre:'TAPA 28 MM',stockMinimo:0,puntoReorden:0,prioritario:true}];

let r=N.leerMinimos('INS-0001\t500\t800\nINS-0003\t1.200,5',cat);          // pegado desde Excel (tabulación)
ok(r.cambian===2&&r.filas[0].id==='a'&&r.filas[0].stockMinimo===500&&r.filas[0].puntoReorden===800,'pegado desde Excel: código, mínimo y reorden');
ok(r.filas.find(f=>f.id==='c').stockMinimo===1200.5&&N.leerMinimos('INS-0001;1,200.5',cat).filas[0].stockMinimo===1200.5&&N.leerMinimos('INS-0001;2,5',cat).filas[0].stockMinimo===2.5,'«1.200,5», «1,200.5» y «2,5» se leen bien');
r=N.leerMinimos('Código;Mínimo;Reorden\nINS-0001;300;450\nI0022;50',cat);
ok(r.cambian===2&&r.errores.length===0,'CSV con «;», encabezado ignorado y código SAP (ItemCode) aceptado');
ok(r.filas.find(f=>f.id==='c').puntoReorden===0&&r.filas.find(f=>f.id==='c').stockMinimo===50,'sin tercera columna el reorden se conserva (0 en este caso)');
r=N.leerMinimos('INS-0002;100;200',cat);
ok(r.cambian===0&&r.sinCambio===1,'si los valores ya son esos, no hay cambio');
r=N.leerMinimos('INS-9999;10;20\nINS-0001;abc\nINS-0001;-5\nINS-0003;300;100',cat);
ok(r.errores.length===4&&r.cambian===0,'código inexistente, texto, negativo y reorden menor que el mínimo: cada uno con su motivo');
ok(/No se encontró/.test(r.errores[0].motivo)&&/número/.test(r.errores[1].motivo)&&/mayor o igual a 0/.test(r.errores[2].motivo)&&/no puede ser menor/.test(r.errores[3].motivo),'los mensajes dicen qué corregir');
r=N.leerMinimos('INS-0001;10\nINS-0001;20',cat);
ok(r.cambian===1&&r.errores.length===1&&/repetido/.test(r.errores[0].motivo),'un código repetido en la lista se avisa y no se aplica dos veces');
r=N.leerMinimos('',cat);ok(r.cambian===0&&r.errores.length===0,'texto vacío: nada que hacer');
const pl=N.plantillaMinimos(cat);
ok(/^Código;Artículo;Stock mínimo;Punto de reorden/.test(pl)&&/INS-0002;"BOLSA ""GLACIAL""";100;200/.test(pl)&&pl.split('\r\n').length===4,'la plantilla trae código, artículo (con comillas protegidas) y los valores actuales');
ok(N.TIPOS_AUDITORIA.EDITAR_MINIMOS&&N.TIPOS_AUDITORIA.EDITAR_MINIMOS.grupo==='CATALOGO','la carga masiva queda en la auditoría como un solo evento');
const fs=require('fs'),d=fs.readFileSync(__dirname+'/../js/asistente/75-inventario-insumos-datos.js','utf8');
ok(/async function guardarMinimos/.test(d)&&/db\.runTransaction/.test(d.slice(d.indexOf('async function guardarMinimos')))&&/auditar\(tx,'EDITAR_MINIMOS'/.test(d),'se guarda en una sola transacción con un evento de auditoría');
console.log(fallas?'\n'+fallas+' fallas':'\nMínimos correcto');process.exit(fallas?1:0);
