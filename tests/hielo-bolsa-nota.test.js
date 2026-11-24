/* Hielo: «Bolsa usada» y «Nota» en cada fila de producción (24/11/2026). Ej.: Tottus CD envasado en bolsa Glacial.
   Se guardan, salen en el avance (texto), en el Reporte diario (bloque por estación, detalle de envasado, Excel) y en el Excel del historial. */
'use strict';
const path=require('path');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const H=require('../js/hielo/97-hielo.js'),RD=require('../js/hielo/99-hielo-reporte-diario.js');
const P=(marca,presentacion,bolsas,estacion,extra)=>Object.assign({marca,presentacion,bolsas,estacion},extra||{});
// 1) Guardar
const g=H.planGuardar({previo:null,r:{fecha:'2026-11-24',turno:'DÍA',paradas:[],mermas:[],produccion:[
  P('Tottus CD','3 kg',800,'Env. automática',{bolsa:'Tottus CD'}),
  P('Tottus CD','3 kg',400,'Tolva manual',{bolsa:'Glacial',nota:'  Se acabó la bolsa Tottus 10:30 '}),
  P('Glacial','1.5 kg',960,'Tolva manual')]},accion:'GUARDAR',usuario:'X',uid:'u',en:1});
ok(!('bolsa' in g.produccion[0])&&!('nota' in g.produccion[0]),'la bolsa de la propia marca no se guarda (la fila queda como siempre)');
ok(g.produccion[1].bolsa==='Glacial'&&g.produccion[1].nota==='Se acabó la bolsa Tottus 10:30','otra bolsa y la nota se guardan (nota sin espacios de más)');
ok(!('bolsa' in g.produccion[2])&&!('nota' in g.produccion[2]),'fila sin bolsa ni nota: igual que antes');
// 2) Avance y cierre
const rep={id:'2026-11-24_DÍA',fecha:'2026-11-24',turno:'DÍA',estado:'EN_REGISTRO',produccion:g.produccion,paradas:[],mermas:[],observaciones:'Merma 1 tapa'};
const m=H.modeloAvanceCierre({fecha:'2026-11-24',turnoTxt:'Turno Día + Intermedio',turnoCod:'D+I',producto:'CUBOS',reportes:[rep],programas:[]});
const tolva=m.estaciones.find(e=>e.estacion==='Tolva manual');
ok(tolva.filas.some(f=>f.marca==='Tottus CD'&&f.bolsa==='Glacial'&&f.bolsas===400&&f.notas[0]==='Se acabó la bolsa Tottus 10:30'),'avance: la fila de Tottus en bolsa Glacial queda aparte con su nota');
ok(m.bolsas===2160&&m.kg===800*3+400*3+960*1.5,'avance: totales y kilos no cambian (cuentan para Tottus)');
const t=H.textoAvanceCierre(m);
ok(/Tottus CD 3kg: 800/.test(t)&&/Tottus CD 3kg \(bolsa Glacial\): 400\n  ↳ Se acabó la bolsa Tottus 10:30/.test(t),'texto: «Tottus CD 3kg (bolsa Glacial): 400» con la nota debajo');
ok(/Observaciones[\s\S]*Tottus CD 3 kg: 400 bolsas envasadas en bolsa Glacial \(Tolva manual\)/.test(t),'texto: observación «400 bolsas envasadas en bolsa Glacial»');
// 3) Reporte diario
const md=RD.modelo({fecha:'2026-11-24',turno:'DIA',reportes:[rep],cfg:H.DEFECTO,catalogo:[['Tottus CD','3 kg'],['Glacial','1.5 kg']]});
const tm=md.porEstacion.find(e=>e.estacion==='Tolva manual');
ok(tm.filas.map(f=>f.etiqueta).join('|')==='TOTTUS CD (3KG) · bolsa Glacial|GLACIAL (1.5KG)'&&tm.dia.bolsas===1360,'reporte diario: fila «TOTTUS CD (3KG) · bolsa Glacial» en Tolva manual; subtotal sin cambios');
ok(md.detalleEnvasado.length===1&&/^Tottus CD 3 kg → 400 bolsas en bolsa Glacial \(Tolva manual\)\. Nota: Se acabó la bolsa Tottus 10:30\.$/.test(md.detalleEnvasado[0]),'detalle de envasado: «Tottus CD 3 kg → 400 bolsas en bolsa Glacial (Tolva manual). Nota: …»');
ok(/Envasado: Tottus CD 3 kg → 400 bolsas en bolsa Glacial/.test(RD.resumenTexto(md)),'texto de WhatsApp del reporte diario lleva el envasado');
// 4) Excel del historial
const fx=H.filasExcel([rep]);
ok(fx.some(f=>f[3]==='Tottus CD'&&f[10]==='Glacial'&&f[11]==='Se acabó la bolsa Tottus 10:30'),'Excel del historial: columnas «Bolsa usada» y «Nota» al final');
(async()=>{
  let ExcelJS=null;try{ExcelJS=require(path.join(process.env.GLX_LIBS||'','node_modules','exceljs'));}catch(_){}
  if(ExcelJS){
    const ws=(await new ExcelJS.Workbook().xlsx.load(await RD.construirExcel(ExcelJS,md,{}).xlsx.writeBuffer())).getWorksheet('Reporte diario');
    const a=[],b=[];ws.eachRow(r=>{a.push(String(r.getCell(1).value||''));b.push(String(r.getCell(2).value||''));});
    const i=a.indexOf('DETALLE DE ENVASADO:');
    ok(a.some(x=>/TOTTUS CD \(3KG\) · bolsa Glacial/.test(x))&&i>0&&/bolsa Glacial \(Tolva manual\)\. Nota: Se acabó/.test(b[i]),'Excel del reporte diario: fila con la bolsa y «DETALLE DE ENVASADO»');
  } else console.log('· (Excel omitido: falta GLX_LIBS)');
  console.log(fallas?fallas+' falla(s)':'todo correcto');process.exit(fallas?1:0);
})();
