/* Reporte General de Producción (js/asistente/73-reporte-general.js).
   Modelo (puro): las 5 líneas siempre presentes, línea sin producción con su motivo, códigos de cuadro, paradas asignadas al cuadro, mermas
   rechazadas fuera, personal sin duplicar y sin línea en el Resumen, factor por UND, sin datos inventados.
   Libro (si ExcelJS está disponible: NODE_PATH o node_modules): 6 hojas en orden, enlaces internos, fórmulas sin #REF y sin funciones
   posteriores a Excel 2010. La verificación con recálculo real (LibreOffice) está descrita en docs/ASISTENTE-PRODUCCION.md. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp,Error,Promise};vm.createContext(sb);sb.window=sb;
vm.runInContext(leer('js/asistente/70-asistente-nucleo.js'),sb);
vm.runInContext(leer('js/asistente/73-reporte-general.js'),sb);
const N=sb.glacialAsistenteNucleo,G=sb.glacialReporteGeneral;
const F='2026-10-14';
const P=(id,l,t,m,p,q,upp)=>({id,linea:l,fecha:F,turno:t,marca:m,presentacion:p,cantidadProgramada:q,unidadesPorPaleta:upp,estadoOperacion:{estado:'FINALIZADA'}});
const progs=[P('a','PET1','DÍA','Scala','2.5 L',16000,324),P('c','B7L','DÍA','Aro','7 L',1200,126),P('d','B7L','DÍA','Cuisine','7 L',1600,126),P('n','PET2','NOCHE','Fontlife','1 L',8000,720)];
const cu=(m,p,lote,hi,hf,ef,pp,pnp)=>({marca:m,presentacion:p,lote,horaInicio:hi,horaFin:hf,estadoCuadro:'FINALIZADO',produccion:{efectiva:ef},
  paradasProgramadas:pp.map(([d,t])=>({descripcion:d,tiempoMin:t})),paradasNoProgramadas:pnp.map(([d,t,e])=>({descripcion:d,tiempoMin:t,equipo:e}))});
const records=[{id:'r1',linea:'PET1',fecha:F,grupoTurno:'DIA_INTERMEDIO',estadoRegistro:'FINALIZADO',finalizadoPor:'Luis',cuadros:[cu('Scala','2.5 L','L1','07:20','19:00',15552,[['Preparación',12]],[['Etiquetado',8,'Etiquetadora']])]},
  {id:'r2',linea:'B7L',fecha:F,grupoTurno:'DIA_INTERMEDIO',estadoRegistro:'FINALIZADO',cuadros:[cu('Aro','7 L','L2','07:15','10:30',1180,[],[]),cu('Cuisine','7 L','L3','10:40','15:00',1300,[],[['Falla',12,'Tapadora']])]}];
const k=(l,m,p,b)=>N.claveCuadro(F,b||'DIA',l,m,p);
const insumos=[{codigo:'POLIETILENO',nombre:'Polietileno',unidad:'kg'},{codigo:'PREFORMA',nombre:'Preforma',unidad:'UND'}];
const factores=[{insumo:'POLIETILENO',linea:'PET1',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:1.89,vigenteDesde:'2020-01-01'},
  {insumo:'PREFORMA',linea:'PET1',marca:'*',presentacion:'*',base:'UND',cantidadBase:1,factor:1,vigenteDesde:'2020-01-01'},
  {insumo:'POLIETILENO',linea:'B7L',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:0,vigenteDesde:'2020-01-01'}];
const mermas=[{linea:'PET1',fecha:F,cuadro:k('PET1','Scala','2.5 L'),insumo:'PREFORMA',unidad:'UND',cantidad:24,estado:'VALIDADA',causa:'Arranque',categoria:'MATERIAL'},
  {linea:'PET1',fecha:F,cuadro:k('PET1','Scala','2.5 L'),insumo:'POLIETILENO',unidad:'kg',cantidad:0.3,estado:'PENDIENTE',causa:'Ajuste',categoria:'MATERIAL'},
  {linea:'PET1',fecha:F,cuadro:k('PET1','Scala','2.5 L'),insumo:'PREFORMA',unidad:'UND',cantidad:99,estado:'RECHAZADA',causa:'Error',categoria:'MATERIAL'}];
const conciliaciones=[{cuadro:k('PET1','Scala','2.5 L'),insumo:'POLIETILENO',saldoInicial:2,saldoFinal:1.5}];
const movimientos=[{opId:'1',tipo:'RECEPCION',cuadro:k('PET1','Scala','2.5 L'),insumo:'POLIETILENO',cantidad:39,en:1},{opId:'2',tipo:'TRANSFERENCIA_SALIDA',cuadro:k('PET1','Scala','2.5 L'),insumo:'POLIETILENO',cantidad:2,en:2}];
const per=(id,l,a)=>({trabajadorId:id,nombre:'Persona '+id,cargo:'Operario',linea:l,asistencia:a||'ASISTIÓ',horaIngreso:'07:00',horaSalida:'19:00'});
const tareos=[{fecha:F,turno:'DÍA',area:'Producción',personal:[per('01','PET1'),per('02','B7L'),per('03','B7L','FALTA'),per('31','')]},{fecha:F,turno:'INTERMEDIO',area:'Producción',personal:[per('02','B7L')]},
  {fecha:F,turno:'DÍA',area:'Mantenimiento',personal:[per('99','PET1')]}];
const m=G.modelo({fecha:F,programaciones:progs,records,produccionAlCorte:()=>({encontrada:false}),mermas,conciliaciones,movimientos,factores,insumos,tareos,
  motivoSinProduccion:l=>l==='B20L'?'Sin producción por falta de personal':''});
const L=c=>m.lineas.find(x=>x.codigo===c);
ok(m.lineas.map(l=>l.hoja).join('|')==='PET1|PET2|B7L|CAJAS 20L|B20L','las 5 líneas siempre presentes y con su nombre visible (C20L → «CAJAS 20L»)');
ok(L('B20L').cuadros.length===0&&L('B20L').motivo==='Sin producción por falta de personal'&&m.observaciones.some(o=>/B20L: sin producción por falta de personal/.test(o.texto)),'prueba 10: línea sin producción con su motivo y observación');
ok(L('C20L').motivo==='Sin producción registrada','sin motivo informado: «Sin producción registrada» (no se inventa uno)');
ok(L('B7L').cuadros.map(c=>c.codigo+':'+c.marca).join()==='C01:Aro,C02:Cuisine'&&L('B7L').cuadros[0].lote==='L2','prueba 1: B7L con dos marcas → C01, C02 con su lote');
ok(L('PET2').cuadros.length===1&&L('PET2').cuadros[0].producido===0&&L('PET2').bloques==='Noche','el bloque Noche de la fecha operativa entra en el mismo archivo');
ok(L('B7L').paradas.length===1&&L('B7L').paradas[0].cuadro==='C02'&&L('B7L').paradas[0].tipo==='No programada'&&L('PET1').paradas.length===2,'paradas con su cuadro y tipo (nunca con la columna cuadro vacía)');
ok(L('PET1').mermas.length===2&&!L('PET1').mermas.some(x=>x.cantidad===99),'las mermas rechazadas no entran al reporte');
ok(L('PET1').insumos.length===2&&!L('B7L').insumos.length,'insumos: los del factor; B7L con factor 0 («no aplica») y sin datos no aparece');
const pol=L('PET1').insumos.find(x=>x.insumo==='Polietileno');
ok(N.red(pol.factorPorUnd,8)===N.red(1.89/324,8)&&pol.saldoInicial===2&&pol.saldoFinal===1.5&&pol.entregado===37,'factor por UND = factor por paleta ÷ UND por paleta; entregado incluye transferencias netas (39 − 2)');
ok(L('PET1').insumos.find(x=>x.insumo==='Preforma').saldoInicial===null,'saldo no registrado queda vacío (el Excel muestra «Pendiente de conciliación»), no 0');
ok(L('B7L').personal.length===2&&L('PET1').personal.length===1&&m.apoyo.length===1&&m.apoyo[0].asignacion==='Sin asignar','personal por línea sin duplicar (Día + Intermedio una vez), sin Mantenimiento; sin línea → Resumen');
ok(L('B7L').personal.find(p=>p.codigo==='03').asistencia==='Falta','asistencia distinta de «Asistió» se conserva (el Excel la marca en rojo)');

let ExcelJS=null;try{ExcelJS=require('exceljs');}catch(_){ExcelJS=null;}
if(!ExcelJS){console.log('• ExcelJS no está instalado aquí: se omite la comprobación del libro (ver docs/ASISTENTE-PRODUCCION.md).');}
else{
  const wb=G.escribir(ExcelJS,m,{});
  ok(wb.worksheets.map(w=>w.name).join('|')==='Resumen general|PET1|PET2|B7L|CAJAS 20L|B20L','prueba 16: 6 hojas, en orden y con los nombres correctos');
  const formulas=[];wb.worksheets.forEach(w=>w.eachRow(r=>r.eachCell(c=>{if(c.value&&c.value.formula)formulas.push(w.name+'!'+c.address+' '+c.value.formula);})));
  ok(formulas.length>150&&!formulas.some(f=>/#REF|XLOOKUP|FILTER\(|UNIQUE\(|LET\(|LAMBDA/.test(f)),'fórmulas vivas, sin #REF ni funciones posteriores a Excel 2010 ('+formulas.length+')');
  ok(formulas.some(f=>/^Resumen general!C14 PET1!G\d+$/.test(f))&&formulas.some(f=>/SUMIFS\(.*'CAJAS 20L'!/.test(f)),'el Resumen toma los totales de las hojas de línea (se recalcula al corregir un dato)');
  const links=[];wb.worksheets.forEach(w=>w.eachRow(r=>r.eachCell(c=>{if(c.value&&c.value.hyperlink)links.push(c.value.hyperlink);})));
  ok(links.includes("#'Resumen general'!A1")&&links.includes("#'CAJAS 20L'!A1"),'enlaces internos entre el Resumen y las hojas de línea');
  const b20=wb.getWorksheet('B20L');let sin=0;b20.eachRow(r=>r.eachCell(c=>{if(typeof c.value==='string'&&/^Sin registros/.test(c.value))sin++;}));
  ok(sin>=4,'prueba 21: la hoja de la línea sin producción muestra «Sin registros» en sus secciones');
  ok(wb.getWorksheet('PET1').views[0].state==='frozen'&&wb.getWorksheet('PET1').views[0].showGridLines===false&&wb.getWorksheet('PET1').pageSetup.orientation==='landscape','paneles fijos, sin cuadrícula y horizontal');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
