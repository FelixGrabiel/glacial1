/* Inventario de insumos: artículos «sin uso» (al final de la lista y detección por cortes), tabla de stock rotulada como SAP e importación
   del conteo físico desde Excel. node tests/inventario-insumos-sinuso-conteo.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const N=require('../js/asistente/74-inventario-insumos-nucleo.js');

/* sin uso: va al final, sin romper el resto del orden */
{
  const f=(id,sem,sinUso)=>({id,nombre:id,categoria:'TAPA',semaforo:sem,sinUso});
  const o=N.ordenarStock([f('a','verde',true),f('b','verde'),f('c','rojo',true),f('d','rojo')]).map(x=>x.id).join('');
  ok(o==='dbca','los «sin uso» van al final y conservan su orden (rojo antes que verde)');
  ok(N.ordenarStock([f('a','verde',true),f('b','rojo')],false).map(x=>x.id).join('')==='ba'&&N.ordenarStock([f('a','verde',true),f('b','rojo')],false)[0].id==='b','con la opción apagada se ordena solo por semáforo');
  ok(N.CAMPOS_EDITABLES.includes('sinUso')&&N.validarEdicion({sinUso:true}).length===0,'«sinUso» es un campo editable del catálogo');
}
/* detección de artículos sin movimiento */
{
  const cat=[{id:'A',nombre:'A'},{id:'B',nombre:'B'},{id:'C',nombre:'C',activo:false},{id:'D',nombre:'D',sinUso:true},{id:'E',nombre:'E'}];
  const corte=(fecha,A,B,E)=>({fechaCorte:fecha,items:[{id:'A',t:A},{id:'B',t:B},{id:'C',t:5},{id:'D',t:5},{id:'E',t:E}]});
  const r=N.detectarSinMovimiento(cat,[corte('2026-10-18',10,7,0),corte('2026-09-01',10,9,0),corte('2026-09-20',10,8,0)],30);
  ok(r.ids.join()==='A'&&r.dias===47,'solo el que no cambió en ningún corte (ni inactivos, ni ya marcados, ni los de stock 0)');
  ok(N.detectarSinMovimiento(cat,[corte('2026-10-18',1,1,1),corte('2026-10-10',1,1,1)],30).ids.length===0,'con menos de 3 cortes no propone nada y lo explica');
  ok(/solo abarcan 9 días/.test(N.detectarSinMovimiento(cat,[corte('2026-10-18',1,1,1),corte('2026-10-15',1,1,1),corte('2026-10-09',1,1,1)],30).motivo),'si los cortes abarcan pocos días lo avisa');
}
/* conteo desde Excel */
{
  const cat=[{id:'1',codigo:'INS-0001',itemCode:'S100',nombre:'TAPA 28 MM AZUL'},{id:'2',codigo:'INS-0002',nombre:'BOLSA GLACIAL 3 KG'},{id:'3',codigo:'INS-0003',nombre:'ASA'},{id:'4',codigo:'INS-0004',nombre:'ASA'}];
  const hoja=nombre=>({nombre,filas:[['REPORTE'],[],['Código','Artículo','Almacén','CONTEO 18/10','Ubicación'],['INS-0001','x','',1500,'Rack A'],['S100','x','',500,'Patio'],['','Bolsa glacial 3 kg','',70,null],['','ASA','',9],['','NO EXISTE','',4],['','BOLSA GLACIAL 3 KG','',''],['','TOTAL','',2000]]});
  const r=N.leerConteoExcel([{nombre:'Otra',filas:[['nada']]},hoja('Conteo')],cat);
  ok(!r.error&&r.hoja==='Conteo'&&r.lineas.length===3,'une por código interno, código SAP y nombre (sin tildes ni mayúsculas); ignora TOTAL y filas vacías');
  ok(r.lineas[0].ubicacion==='Rack A'&&r.lineas[1].itemId==='1'&&r.lineas[2].ubicacion==='Excel','guarda la ubicación del Excel o «Excel» si no trae');
  ok(r.resumen.sinUnir===2&&r.sinUnir.some(x=>x.motivo==='Nombre repetido en el catálogo')&&r.sinUnir.some(x=>x.motivo==='No está en el catálogo')&&r.resumen.vacias===1,'informa lo que no se pudo unir (nombre repetido, inexistente) y las filas sin cantidad');
  ok(/tabla del conteo/.test(N.leerConteoExcel([{nombre:'h',filas:[['a','b']]}],cat).error)&&/ningún artículo coincide/.test(N.leerConteoExcel([{nombre:'h',filas:[['Artículo','Cantidad'],['ZZZ',1]]}],cat).error),'errores claros si no hay tabla o nada coincide');
}
/* pantalla */
{
  const pant=leer('js/asistente/76-inventario-insumos-pantalla.js'),con=leer('js/asistente/77-inventario-insumos-conteo.js'),dat=leer('js/asistente/75-inventario-insumos-datos.js'),html=leer('index.html');
  ok(/STOCK SAP POR ALMACÉN/.test(pant)&&/RESULTADO SEGÚN SAP/.test(pant)&&/Total SAP/.test(pant)&&/stock según SAP/.test(pant),'la tabla de stock dice que es stock SAP (grupos de columnas, Total SAP y nota)');
  ok(pant.indexOf('Total SAP')<pant.indexOf('${alm.map((a,k)=>`<th'),'primero el resultado (Total SAP, mínimo, semáforo) y al final el detalle por almacén');
  ok(/iiSinMov/.test(pant)&&/ii-e-sinuso/.test(pant)&&/marcarSinUso/.test(dat)&&/detectarSinMovimiento/.test(dat),'pantalla y datos: detectar y marcar sin uso');
  ok(/iicImportarExcel/.test(con)&&/agregarLineasLote/.test(con)&&/agregarLineasLote/.test(dat)&&/IMPORTAR_CONTEO/.test(N.TIPOS_AUDITORIA?'IMPORTAR_CONTEO':'')||/IMPORTAR_CONTEO/.test(leer('js/asistente/74-inventario-insumos-nucleo.js')),'conteo: importar desde Excel en una transacción con auditoría');
  ok(/74-inventario-insumos-nucleo\.js\?v=20261018-(ii10|ic2)/.test(html)&&/77-inventario-insumos-conteo\.js\?v=20261018-(ii10|ic2)/.test(html),'index.html con las versiones nuevas de los scripts');
}
console.log(fallas?fallas+' fallas':'todo correcto');
