/* Hielo Premium y Hielo Vasos (21/11/2026): productos, ids, pesos, configuración, reporte diario y Excel con los números de los Excel de la planta
   (Premium 16/11/2026: Glacial 2 kg · 28 bolsas = 56.00 kg; Vasos 19-20/11/2026: Oxxo 190 y 220 vasos = 47.50 y 55.00 kg, 5.43 y 6.29 jabas, total 410 vasos).
   node tests/hielo-productos.test.js   (la parte de Excel usa GLX_LIBS/node_modules/exceljs si existe) */
'use strict';
const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)process.exitCode=1;};
const N=require('../js/hielo/97-hielo.js'),RD=require('../js/hielo/99-hielo-reporte-diario.js');
const P=N.PRODUCTOS;
ok(Object.keys(P).join()==='CUBOS,PREMIUM,VASOS'&&P.PREMIUM.presentaciones.join()==='2 kg,1.8 kg'&&P.VASOS.pesos.Vaso===0.25&&P.VASOS.unidadesPorJaba===35&&P.CUBOS.pesos['3 kg']===3.25,'catálogo: Cubos, Premium (2 kg y 1.8 kg) y Vasos (0.25 kg por vaso, 35 por jaba)');
N.aplicarConfigPesos(null);
ok(N.kgDe('2 kg')===2&&N.kgDe('1.8 kg')===1.8&&N.kgDe('Vaso')===0.25&&N.kgDe('3 kg')===3.25&&N.kgDe('1.5 kg')===1.75,'kg por unidad de cada presentación (los de cubos no cambian)');
N.aplicarConfigPesos({pesos:{'3 kg':3.3},productos:{PREMIUM:{pesos:{'2 kg':2.05}},VASOS:{pesos:{Vaso:0.3}}}});
ok(N.kgDe('3 kg')===3.3&&N.kgDe('2 kg')===2.05&&N.kgDe('Vaso')===0.3&&N.kgDe('1.8 kg')===1.8,'lo configurado en cada producto cambia sus kg y solo los suyos');
N.aplicarConfigPesos(null);
ok(N.idReporte('2026-11-19','DÍA')==='2026-11-19_DÍA'&&N.idReporte('2026-11-19','DÍA','CUBOS')==='2026-11-19_DÍA'&&N.idReporte('2026-11-19','NOCHE','PREMIUM')==='2026-11-19_NOCHE_PREMIUM'&&N.idReporte('2026-11-19','DÍA','VASOS')==='2026-11-19_DÍA_VASOS'&&N.idReporte('2026-11-19','DÍA','XX')==='2026-11-19_DÍA','id del reporte: el de cubos no cambia; Premium y Vasos terminan en _PREMIUM / _VASOS');
ok(N.productoDe({})==='CUBOS'&&N.productoDe({producto:'VASOS'})==='VASOS'&&N.productoDe({producto:'otro'})==='CUBOS'&&N.productoDe(null)==='CUBOS','un reporte sin producto es de cubos (los de siempre)');
/* guardar */
const L=(marca,presentacion,bolsas,lote,extra)=>Object.assign({marca,presentacion,bolsas,lote:lote||''},extra||{});
const base={fecha:'2026-11-16',turno:'DÍA',supervisor:'Ana',produccion:[L('Glacial','2 kg',28,'21045309',{horas:'0.5',vence:'2027-11-16'})],paradas:[],mermas:[],personas:'2',personal:'Angelica\nYasmelis\n'};
const d1=N.planGuardar({previo:null,r:Object.assign({producto:'PREMIUM'},base),accion:'GUARDAR',usuario:'Ana',uid:'u1',en:1});
ok(d1.id==='2026-11-16_DÍA_PREMIUM'&&d1.producto==='PREMIUM'&&d1.produccion[0].horas===0.5&&d1.produccion[0].vence==='2027-11-16'&&d1.personas===2&&d1.personal.join()==='Angelica,Yasmelis','guardar Premium: id, producto, tiempo, vencimiento, personas y personal');
const d0=N.planGuardar({previo:null,r:Object.assign({},base,{personas:'',personal:[],produccion:[L('Rappi','3 kg',10)]}),accion:'GUARDAR',usuario:'Ana',uid:'u1',en:1});
ok(d0.id==='2026-11-16_DÍA'&&!('producto' in d0)&&!('personas' in d0)&&!('personal' in d0)&&!('horas' in d0.produccion[0])&&!('vence' in d0.produccion[0]),'guardar Cubos: el documento queda igual que siempre (sin producto ni campos nuevos vacíos)');
const e1=N.validarFinalizar(Object.assign({producto:'VASOS'},base,{produccion:[L('OXXO','Vaso',190)]}),Object.assign({},N.DEFECTO));
ok(e1.length===0,'finalizar Vasos: «Vaso» no necesita kg en el nombre (tiene 0.25 kg por vaso)');
ok(N.validarFinalizar(Object.assign({},base,{produccion:[L('Glacial','2 kg',5,'',{horas:'30'})]}),N.DEFECTO).some(x=>/tiempo/.test(x))&&N.validarFinalizar(Object.assign({},base,{produccion:[L('Glacial','2 kg',5,'',{vence:'mañana'})]}),N.DEFECTO).some(x=>/vencimiento/.test(x))&&N.validarFinalizar(Object.assign({},base,{personas:'-1'}),N.DEFECTO).some(x=>/personas/.test(x)),'validaciones: tiempo fuera de 0-24 h, vencimiento inválido y personas negativas');
/* configuración de un producto */
const cv=N.validarConfig({marcas:['Glacial','OXXO'],presentaciones:['Vaso'],pesos:{Vaso:'0.25'},capacidadTurnoKg:'',unidadesPorJaba:'35',estaciones:[],equipos:[],motivos:['Otros'],mermas:[]},'VASOS');
ok(!cv.errores.length&&cv.producto.pesos.Vaso===0.25&&cv.producto.unidadesPorJaba===35&&cv.producto.capacidadTurnoKg===0&&cv.config.motivos.join()==='Otros'&&!('marcas' in cv.config),'configuración de Vasos: marcas, peso, vasos por jaba y listas compartidas por separado');
ok(N.validarConfig({marcas:['G'],presentaciones:['2 kg'],pesos:{},motivos:['x']},'PREMIUM').errores.length===0&&N.validarConfig({marcas:[],presentaciones:['2 kg'],motivos:['x']},'PREMIUM').errores.some(x=>/marca/.test(x))&&N.validarConfig({marcas:['G'],presentaciones:['Caja'],motivos:['x']},'PREMIUM').errores.some(x=>/kg/.test(x))&&N.validarConfig({marcas:['G'],presentaciones:['Vaso'],motivos:['x'],unidadesPorJaba:'2.5'},'VASOS').errores.some(x=>/jaba/.test(x)),'configuración: faltan marcas, presentación sin kg y jaba no entera se rechazan');
ok(N.validarConfig({marcas:['Rappi'],presentaciones:['3 kg'],motivos:['x']}).config.marcas.join()==='Rappi'&&!N.validarConfig({marcas:['Rappi'],presentaciones:['3 kg'],motivos:['x']}).producto,'configuración de Cubos: igual que siempre (campos de primer nivel)');
/* reporte diario: Premium */
const cfgP=Object.assign({},N.DEFECTO,{pesos:Object.assign({},P.PREMIUM.pesos),presentaciones:['2 kg','1.8 kg'],bolsasPorPaleta:{},capacidadTurnoKg:0});
const rsP=[{id:'x1',producto:'PREMIUM',fecha:'2026-11-16',turno:'DÍA',estado:'FINALIZADO',supervisor:'Leandro',horaInicio:'13:00',horaFin:'19:00',personas:2,personal:['Angelica','Yasmelis'],produccion:[L('Glacial','2 kg',28,'21045309',{horas:0.5,vence:'2027-11-16'})],paradas:[],mermas:[{item:'Hielo (producto)',cantidad:2.1,unidad:'KG'}],observaciones:'HIELO REEFERS 3'},
  {id:'x2',producto:'PREMIUM',fecha:'2026-11-15',turno:'NOCHE',estado:'FINALIZADO',horaInicio:'02:00',horaFin:'06:00',personas:2,personal:['Yoselis Guzman','Morelia Pillaca'],produccion:[L('Glacial','2 kg',265,'11047320')],paradas:[],mermas:[]},
  {id:'2026-11-16_DÍA',fecha:'2026-11-16',turno:'DÍA',estado:'FINALIZADO',produccion:[L('Rappi','3 kg',1000)],paradas:[],mermas:[]}];            // un reporte de cubos: no debe entrar
const mp=RD.modelo({fecha:'2026-11-16',producto:'PREMIUM',reportes:rsP,cfg:cfgP,catalogo:P.PREMIUM.catalogo});
ok(mp.producto==='PREMIUM'&&mp.subtitulo==='HIELO PREMIUM'&&mp.dia.kg===56&&mp.noche.kg===530&&mp.totalDiaKg===586&&mp.unidadMetrica==='kg'&&mp.extra===null&&mp.capacidad===0,'Premium: 56.00 kg el día, 530.00 la noche, sin capacidad ni paletas; el reporte de cubos no entra');
ok(mp.filas.map(f=>f.etiqueta).join('|')==="GLACIAL (2KG)|BELL'S (1.8KG)|CUISINE & CO (2KG)"&&mp.dia.eficiencia===null&&mp.dia.personas===2&&mp.dia.personal.join()==='Angelica,Yasmelis'&&mp.noche.personal.length===2,'Premium: las 3 filas del Excel (con sus kg), sin eficiencia y con el personal de cada turno');
const mc=RD.modelo({fecha:'2026-11-16',reportes:rsP,cfg:N.DEFECTO,catalogo:[['Rappi','3 kg']]});
ok(mc.producto==='CUBOS'&&mc.dia.kg===3250&&mc.noche.kg===0&&mc.extra==='paletas'&&mc.subtitulo==='HIELO EN CUBOS','Cubos: solo ve sus reportes (el de Premium no suma) y sigue con paletas');
/* reporte diario: Vasos */
const cfgV=Object.assign({},N.DEFECTO,{pesos:{Vaso:0.25},presentaciones:['Vaso'],bolsasPorPaleta:{},capacidadTurnoKg:0,unidadesPorJaba:35});
const mkV=(f,t,marca,b,lote)=>({id:f+t+'V',producto:'VASOS',fecha:f,turno:t,estado:'FINALIZADO',supervisor:'X',personas:t==='NOCHE'?1:1,personal:[t==='NOCHE'?'Alicia Pilco':'Luisa Mejia'],produccion:[L(marca,'Vaso',b,lote,{horas:t==='NOCHE'?6:null})],paradas:[],mermas:[]});
const rsV=[mkV('2026-11-19','NOCHE','OXXO',190,'110247324'),mkV('2026-11-20','DÍA','OXXO',220,'210245311'),mkV('2026-11-15','NOCHE','Glacial',175),mkV('2026-11-16','NOCHE','Glacial',70),mkV('2026-11-17','NOCHE','Glacial',330)];
const mv=RD.modelo({fecha:'2026-11-20',producto:'VASOS',reportes:rsV,cfg:cfgV,catalogo:P.VASOS.catalogo});
ok(mv.subtitulo==='HIELO VASOS'&&mv.noche.kg===190&&mv.dia.kg===220&&mv.totalDiaKg===410&&mv.unidadMetrica==='vasos'&&mv.enUnidades&&mv.extra==='jabas','Vasos: 190 de noche, 220 de día, 410 en total, medidos en vasos');
ok(mv.noche.pesoKg===47.5&&mv.dia.pesoKg===55&&mv.noche.jabas===5.43&&mv.dia.jabas===6.29&&mv.noche.eficiencia===null,'Vasos: peso 47.50 y 55.00 kg, 5.43 y 6.29 jabas, sin eficiencia');
ok(mv.filas.map(f=>f.etiqueta).join('|')==='GLACIAL|OXXO'&&mv.filas[1].noche.horas===6&&mv.filas[1].noche.jabas===5.43&&mv.filas[1].dia.lote==='210245311','Vasos: filas por marca (GLACIAL, OXXO) con tiempo, jabas y lote');
ok(mv.semana.dias.find(d=>d.nombre==='Domingo').total===175&&mv.semana.dias.find(d=>d.nombre==='Lunes').total===70&&mv.semana.dias.find(d=>d.nombre==='Martes').total===330&&mv.semana.dias.find(d=>d.nombre==='Jueves').total===410&&mv.totalSemanaKg===985,'Vasos: la semana suma 985 vasos (175 + 70 + 330 + 410), como el Excel');
/* texto del avance y cierre */
const rs2=[{fecha:'2026-11-20',turno:'DÍA',estado:'FINALIZADO',producto:'VASOS',supervisor:'X',produccion:[L('OXXO','Vaso',220)],paradas:[],mermas:[]}];
const tv=N.textoAvanceCierre(N.modeloAvanceCierre({fecha:'2026-11-20',turnoCod:'TD',reportes:rs2,programas:[],producto:'VASOS'}));
ok(/Cierre de produccion HIELO Vasos TD/.test(tv)&&/OXXO: 220/.test(tv)&&/Producción de vasos: 220/.test(tv)&&/Peso aproximado: 55kg/.test(tv)&&/Jabas: 6,29/.test(tv)&&/TOTAL VASOS: 220/.test(tv)&&!/TOTAL KILOS/.test(tv),'texto de WhatsApp de Vasos: vasos, peso aproximado y jabas');
const tp=N.textoAvanceCierre(N.modeloAvanceCierre({fecha:'2026-11-16',turnoCod:'TD',reportes:rsP.slice(0,1),programas:[],producto:'PREMIUM'}));
ok(/Avance|Cierre/.test(tp)&&/HIELO Premium TD/.test(tp)&&/Glacial 2kg: 28/.test(tp)&&/Producción de bolsas 2kg: 28/.test(tp)&&/TOTAL KILOS: 56kg/.test(tp),'texto de WhatsApp de Premium: bolsas de 2 kg y total de kilos');
const tc=N.textoAvanceCierre(N.modeloAvanceCierre({fecha:'2026-11-16',turnoCod:'TD',reportes:[rsP[2]],programas:[]}));
ok(/produccion HIELO TD/.test(tc)&&/Producción de bolsas 3kg: 1\.000|Producción de bolsas 3kg: 1000/.test(tc.replace(/\s/g,' '))||/Producción de bolsas 3kg/.test(tc),'texto de WhatsApp de Cubos: sin cambios');
/* Excel */
const fs=require('fs');let ExcelJS=null;try{ExcelJS=require(require('path').join(process.env.GLX_LIBS||'','node_modules','exceljs'));}catch(_){/* sin ExcelJS */}
(async()=>{
  if(!ExcelJS){console.log('· (Excel omitido: falta GLX_LIBS/node_modules/exceljs)');return;}
  const leer=async m=>{const w=new ExcelJS.Workbook();await w.xlsx.load(await RD.construirExcel(ExcelJS,m,{}).xlsx.writeBuffer());return w;};
  const wp=await leer(mp),sp=wp.getWorksheet('Reporte diario');
  ok(sp.getCell('A2').value==='HIELO PREMIUM'&&sp.getCell('B6').value===56&&sp.getCell('D6').value==='KG'&&sp.getCell('B5').value===530,'Excel Premium: título HIELO PREMIUM y kg de cada turno');
  const cab=[];for(let c=2;c<=13;c++)cab.push(sp.getCell(14,c).value);
  ok(cab.slice(0,5).join('|')==='BOLSAS|TIEMPO (H)|LOTE|F. VENCIMIENTO|PESO (KG)'&&cab[5]==='BOLSAS'&&!cab.includes('N° PALETAS')&&!cab.includes('N° JABAS')&&cab[10]==='PESO (KG)'&&cab[11]===null||cab.filter(Boolean).length===10,'Excel Premium: columnas del Excel de la planta (bolsas, tiempo, lote, vencimiento y peso), sin paletas');
  let fg=0;sp.eachRow((r,n)=>{if(/GLACIAL \(2KG\)/.test(String(r.getCell(1).value)))fg=n;});
  ok(fg>0&&sp.getCell('G'+fg).value===28&&sp.getCell('H'+fg).value===0.5&&sp.getCell('I'+fg).value==='21045309'&&sp.getCell('J'+fg).value==='2027-11-16'&&sp.getCell('K'+fg).value===56,'Excel Premium: fila GLACIAL (2KG) con 28 bolsas, 0.50 h, lote, vencimiento y 56 kg');
  ok(sp.getCell('J11').value==='Supervisor: Leandro · Personas: 2','Excel Premium: el responsable y el número de personas');
  const wv=await leer(mv),sv=wv.getWorksheet('Reporte diario');
  ok(sv.getCell('A2').value==='HIELO VASOS'&&sv.getCell('B5').value===190&&sv.getCell('D5').value==='VASOS'&&sv.getCell('B6').value===220&&sv.getCell('B7').value===985,'Excel Vasos: título, 190 y 220 vasos y 985 de la semana, en VASOS');
  const cv2=[];for(let c=2;c<=13;c++)cv2.push(sv.getCell(14,c).value);
  ok(cv2[0]==='VASOS'&&cv2[2]==='N° JABAS'&&cv2[5]==='PESO (KG)'&&sv.getCell('A14').value==='MARCA','Excel Vasos: columnas Vasos, tiempo, N° jabas, lote, vencimiento y peso');
  let fo=0;sv.eachRow((r,n)=>{if(/OXXO/.test(String(r.getCell(1).value)))fo=n;});
  ok(fo>0&&sv.getCell('B'+fo).value===190&&sv.getCell('C'+fo).value===6&&sv.getCell('D'+fo).value===5.43&&sv.getCell('E'+fo).value==='110247324'&&sv.getCell('G'+fo).value===47.5&&sv.getCell('H'+fo).value===220&&sv.getCell('J'+fo).value===6.29&&sv.getCell('M'+fo).value===55,'Excel Vasos: fila OXXO con vasos, tiempo, jabas, lote y peso de cada turno');
  const h2=wv.getWorksheet('Resumen y semana');let fOx=0,tot=null;h2.eachRow((r,n)=>{if(r.getCell(1).value==='OXXO')fOx=n;if(String(r.getCell(1).value).startsWith('PRODUCCIÓN TOTAL SEMANA'))tot=r.getCell(2).value;});
  ok(fOx>0&&h2.getCell('B'+fOx).value===190&&h2.getCell('C'+fOx).value===47.5&&tot===985,'Excel Vasos (hoja 2): una fila por marca, peso en kg y total de la semana en vasos');
  let nom=false;h2.eachRow(r=>{if(r.getCell(2).value==='Alicia Pilco'&&r.getCell(4).value==='Luisa Mejia')nom=true;});
  ok(nom,'Excel (hoja 2): lista de personal de cada turno');
  console.log(process.exitCode?'\nHay fallas':'\nTodo correcto');
})();
