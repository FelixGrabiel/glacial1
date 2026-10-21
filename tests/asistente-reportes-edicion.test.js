/* Asistente de Producción · Reportes con previsualización y corrección (73 · modelo con ids y filtro de líneas, 71 · editarMerma, 83 · pantalla).
   node tests/asistente-reportes-edicion.test.js   (con ExcelJS en NODE_PATH también comprueba el Excel por línea) */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');

const SERVER={__server:true};
function crearDb(){
  const docs=new Map();let auto=0;
  const res=v=>v===SERVER?Date.now():(Array.isArray(v)?v.map(res):(v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,res(x)])):v));
  const snap=(id,d)=>({id,exists:d!==undefined,data:()=>d===undefined?undefined:JSON.parse(JSON.stringify(d))});
  const ref=(c,id)=>({path:c+'/'+id,id,col:c});
  return {docs,collection:c=>({doc:id=>ref(c,id===undefined?'a'+(++auto):id)}),
    async runTransaction(fn){const esc=[];let w=false;const tx={async get(r){if(w)throw new Error('lecturas antes');return snap(r.id,docs.get(r.path));},set(r,d){w=true;esc.push([r.path,res(d)]);}};
      const r=await fn(tx);esc.forEach(([p,d])=>docs.set(p,d));return r;}};
}
function entorno(usuario,db){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,Promise,Error,RegExp};vm.createContext(sb);sb.window=sb;sb.globalThis=sb;
  sb.db=db;sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>SERVER}},auth:()=>({currentUser:{uid:usuario.uid}})};
  sb.state={user:usuario};sb.PERMISOS_APP=[];sb.tienePermiso=()=>false;let t=1000;sb.tareoAhoraServidor=()=>++t;
  ['70-asistente-nucleo','71-asistente-datos','73-reporte-general'].forEach(f=>vm.runInContext(leer('js/asistente/'+f+'.js'),sb));
  return {sb,D:sb.glacialAsistenteDatos,N:sb.glacialAsistenteNucleo,G:sb.glacialReporteGeneral};
}
const espera=async p=>{try{await p;return null;}catch(e){return e;}};

(async()=>{
  const db=crearDb();
  const asis=entorno({uid:'u1',rol:'Asistente de Producción',nombre:'Ana',permisos:[]},db);
  const jefe=entorno({uid:'u3',rol:'Jefe de Producción',nombre:'Rosa',permisos:[]},db);
  const F='2026-10-14',N=asis.N,k=N.claveCuadro(F,'DIA','PET1','Scala','2.5 L');
  const mer={id:'M1',fecha:F,bloque:'DIA',linea:'PET1',cuadro:k,categoria:'MATERIAL',insumo:'PREFORMA',unidad:'UND',cantidad:120,causa:'Arranque de línea',etapa:'',lote:'',estado:'PENDIENTE',version:1,creadoUid:'u1',historial:[{estado:'PENDIENTE',en:1}]};
  db.docs.set('apMermas/M1',mer);db.docs.set('apMermas/M2',{...mer,id:'M2',estado:'VALIDADA',version:2});

  /* editarMerma */
  ok((await espera(jefe.D.editarMerma('M1',{cantidad:12},1,'cantidad mal digitada')))?.codigo==='PERMISO','solo quien tiene el permiso del Asistente corrige mermas');
  ok((await espera(asis.D.editarMerma('M1',{cantidad:12},1,'x')))?.codigo==='VALIDACION','la corrección exige un motivo (mínimo 5 caracteres)');
  ok((await espera(asis.D.editarMerma('M1',{cantidad:12},9,'cantidad mal digitada')))?.codigo==='CONFLICTO','con la versión vieja: CONFLICTO (no pisa lo de otra persona)');
  ok((await espera(asis.D.editarMerma('M1',{cantidad:0},1,'cantidad mal digitada')))?.codigo==='VALIDACION','la cantidad debe seguir siendo mayor que 0');
  ok((await espera(asis.D.editarMerma('M1',{},1,'sin cambios reales')))?.codigo==='VALIDACION','sin cambios no guarda');
  ok(/no se puede corregir/.test((await espera(asis.D.editarMerma('M2',{cantidad:5},2,'cantidad mal digitada'))).message),'una merma ya VALIDADA no se corrige');
  await asis.D.editarMerma('M1',{cantidad:12,causa:'Calibración'},1,'cantidad mal digitada');
  const m1=db.docs.get('apMermas/M1');
  ok(m1.cantidad===12&&m1.causa==='Calibración'&&m1.version===2&&m1.estado==='PENDIENTE'&&m1.creadoUid==='u1','la merma queda corregida, sigue PENDIENTE y con versión +1');
  ok(m1.historial.length===2&&m1.historial[1].edicion===true&&/cantidad mal digitada/.test(m1.historial[1].nota),'el historial de la merma guarda quién corrigió y el motivo');
  const aud=[...db.docs.entries()].filter(([x])=>x.startsWith('apAuditoria/')).map(([,d])=>d).find(d=>d.operacion==='CORREGIR');
  ok(aud&&aud.antes.cantidad===120&&aud.despues.cantidad===12&&aud.despues.motivo==='cantidad mal digitada','la auditoría guarda el antes y el después de la corrección');

  /* modelo: ids y versión para editar; filtro de líneas */
  const progs=[{id:'a',linea:'PET1',fecha:F,turno:'DÍA',marca:'Scala',presentacion:'2.5 L',cantidadProgramada:16000,unidadesPorPaleta:324,estadoOperacion:{estado:'PENDIENTE'}},
    {id:'b',linea:'B7L',fecha:F,turno:'DÍA',marca:'Aro',presentacion:'7 L',cantidadProgramada:1200,unidadesPorPaleta:126,estadoOperacion:{estado:'PENDIENTE'}}];
  const insumos=[{codigo:'PREFORMA',nombre:'Preforma',unidad:'UND'}];
  const factores=[{insumo:'PREFORMA',linea:'PET1',marca:'*',presentacion:'*',base:'UND',cantidadBase:1,factor:1,vigenteDesde:'2020-01-01'}];
  const concil=[{id:'c',cuadro:k,insumo:'PREFORMA',saldoInicial:500,saldoFinal:null,estado:'BORRADOR',version:3,observaciones:'ok'}];
  const base={fecha:F,programaciones:progs,records:[],produccionAlCorte:()=>({encontrada:false}),mermas:[db.docs.get('apMermas/M1')],conciliaciones:concil,movimientos:[],factores,insumos,tareos:[]};
  const g=asis.G.modelo(base);
  const fi=g.lineas.find(l=>l.codigo==='PET1').insumos[0],fm=g.lineas.find(l=>l.codigo==='PET1').mermas[0];
  ok(fi.claveCuadro===k&&fi.insumoCodigo==='PREFORMA'&&fi.version===3&&fi.estadoConcil==='BORRADOR'&&fi.saldoInicial===500&&fi.saldoFinal===null,'cada fila de consumo trae lo necesario para corregirla (cuadro, insumo, versión, estado)');
  ok(fm.id==='M1'&&fm.version===2&&fm.estadoRaw==='PENDIENTE'&&fm.insumoCodigo==='PREFORMA'&&fm.claveCuadro===k,'cada merma trae su id y versión');
  const u=asis.G.modelo({...base,lineas:['B7L']});
  ok(g.lineas.length===5&&u.lineas.length===1&&u.lineas[0].codigo==='B7L','Resumen general = las 5 líneas; Resumen por línea = solo las elegidas');
  ok(asis.G.nombreArchivo(F,null)==='GLACIAL_Reporte_General_'+F+'.xlsx'&&asis.G.nombreArchivo(F,['PET1','C20L'])==='GLACIAL_Resumen_PET1-CAJAS20L_'+F+'.xlsx','nombres de archivo: general y por línea');
  let ExcelJS=null;try{ExcelJS=require('exceljs');}catch(_){}
  if(ExcelJS){
    const wb=asis.G.escribir(ExcelJS,u,{});
    ok(wb.worksheets.map(w=>w.name).join('|')==='Resumen general|B7L','el Excel por línea trae el resumen y solo las hojas elegidas');
    const buf=await wb.xlsx.writeBuffer();const wb2=new ExcelJS.Workbook();await wb2.xlsx.load(buf);
    let malas=0;wb2.eachSheet(w=>w.eachRow(r=>r.eachCell(c=>{if(c.value&&c.value.formula&&/#REF/.test(c.value.formula))malas++;})));
    ok(malas===0,'sin referencias rotas (#REF) en el Excel por línea');
  }else console.log('• ExcelJS no está instalado aquí: se omite la comprobación del Excel por línea.');

  /* integración */
  const p72=leer('js/asistente/72-asistente-pantalla.js'),p83=leer('js/asistente/83-asistente-reportes-pantalla.js'),idx=leer('index.html');
  ok(/glacialAsistenteReportes/.test(p72)&&/glacialAsistenteUI=/.test(p72)&&!/onclick="apExportar\(\)"/.test(p72),'Historial muestra la tarjeta de Reportes (el botón único de exportar ya no está)');
  ok(/apRepPrevia/.test(p83)&&/apRepDescargar/.test(p83)&&/apRepGuardarSaldos/.test(p83)&&/apRepGuardarMerma/.test(p83)&&/editarMerma/.test(p83),'83: previsualizar, descargar y corregir saldos y mermas');
  ok(/asistente\/83-asistente-reportes-pantalla\.js\?v=/.test(idx)&&idx.indexOf('83-asistente-reportes')>idx.indexOf('73-reporte-general'),'index.html carga 83 después de 72 y 73');
  ok(/apMermas/.test(leer('supabase/migraciones/glacial_28_asistente_corrige_mermas.sql')),'existe la migración glacial_28');
  console.log(fallas?`\n${fallas} fallas`:'\nTodo en orden');
})();
