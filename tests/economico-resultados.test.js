/* Etapa 3 · Jefatura recibe soles ya calculados (sin valores unitarios); los demás solo ven la parte operativa. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

function crearDb(inicial){
  const docs=new Map(Object.entries(inicial||{})),oyentes=[],abiertas=[],escritos=[];
  const lista=col=>[...docs.entries()].filter(([k])=>k.startsWith(col+'/')).map(([k,v])=>({id:k.split('/')[1],data:()=>v}));
  const consulta=col=>({
    orderBy(){return {limit(){return {onSnapshot(cb){abiertas.push(col);const o={col,cb,vivo:true,query:true};oyentes.push(o);cb({docs:lista(col)});return()=>{o.vivo=false;};}};}};},
    onSnapshot(cb){abiertas.push(col);const o={col,cb,vivo:true};oyentes.push(o);cb({docs:lista(col)});return()=>{o.vivo=false;};},
    doc:id=>({set:async d=>{docs.set(col+'/'+id,d);escritos.push(col+'/'+id);oyentes.filter(x=>x.vivo&&x.col===col).forEach(x=>x.cb({docs:lista(col)}));},get:async()=>({exists:docs.has(col+'/'+id),data:()=>docs.get(col+'/'+id)}),onSnapshot(cb){abiertas.push(col+'/'+id);cb({exists:docs.has(col+'/'+id),data:()=>docs.get(col+'/'+id)});return()=>{};}}),
    get:async()=>({docs:lista(col)})
  });
  return {db:{collection:consulta,runTransaction:async fn=>fn({get:async r=>r.get(),set:(r,d)=>r.set(d)})},docs,abiertas,escritos,oyentes};
}
function entorno(rol,inicial,partes){
  const F=crearDb(inicial);
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{}};vm.createContext(sb);sb.window=sb;
  sb.db=F.db;sb.auth={currentUser:{uid:'u-'+rol}};
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>({__ts:true})}}};
  sb.state={user:{rol,username:'u',economico:/^Jefe/.test(rol)?{ver:true,gestionar:false}:undefined},currentTab:'perdidas'};
  sb._recordsReady=true;sb.glacialCierresSesion=[];
  const celdas=new Map();
  sb.document={getElementById:()=>null,addEventListener(){},createElement:()=>({}),head:{appendChild(){}},body:{contains:()=>false}};
  sb.LINES=[{key:'PET1',name:'PET 1'}];
  sb.window.glacialReporteIndicadores={
    addDias:(f,n)=>{const d=new Date(f+'T00:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);},
    hoyOp:()=>'2026-10-10',fechaOk:f=>/^\d{4}-\d{2}-\d{2}$/.test(f||''),nombreLinea:k=>k==='PET1'?'PET 1':k,etiquetaGrupo:g=>g==='NOCHE'?'Noche':'Día',
    etiquetaProd:(m,p)=>m+' · '+p,recolectar:(d,h)=>({partes:(partes||[]).filter(p=>p.fecha>=d&&p.fecha<=h),hayVivo:false,marcas:new Set(),cats:new Set(),productos:new Map(),avisos:{}}),filtrarPartes:p=>p,marcaCanon:m=>m,catPres:()=>'',ORDEN_PRES:[],MARCAS_FIJAS:[],ORDEN_PRES_:[],componenteMerma:x=>x,grupoDeTurno:x=>x};
  vm.runInContext(leer('js/produccion/55-valores-economicos.js'),sb);
  vm.runInContext(leer('js/produccion/50-impacto-economico.js'),sb);
  ['56-impacto-resultados','57-impacto-estado','59-impacto-analisis','58-impacto-dashboard'].forEach(n=>vm.runInContext(leer('js/produccion/'+n+'.js'),sb));
  return {sb,F};
}
const parte={linea:'PET1',fecha:'2026-10-10',grupo:'DIA',marca:'Scala',pres:'2.5L',marcaN:'Scala',cat:'2.5 L',pkey:'2.5L|Scala',producido:300,programado:1000,progUnit:true,
  planMin:480,availMin:420,npMin:60,vel:1000,paradas:[{motivo:'Falla de sopladora',minutos:60,estimada:false}],mermas:{Botellas:{unidades:100,peso:0}}};
const valores={'valoresUnitarios/P__pet1__scala__2-5-l':{tipo:'producto',linea:'PET1',marca:'Scala',presentacion:'2.5 L',clave:'pet1__scala__2-5-l',valorUnitario:0.40,vigencias:{'2020-01-01':0.40},activo:true,version:1},
  'valoresUnitarios/I__pet1--botellas':{tipo:'insumo',linea:'PET1',componente:'Botellas',clave:'pet1--botellas',valorUnitario:0.5,vigencias:{'2020-01-01':0.5},activo:true,version:1},
  'valoresUnitarios/META__perdida-mensual':{tipo:'meta',clave:'meta',valorUnitario:1000,vigencias:{'2020-01-01':1000},activo:true,version:1}};
const espera=()=>new Promise(r=>setTimeout(r,400));const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
/* ---------- Gerencia publica sus resultados (esquema v2: un documento por día con los eventos) ---------- */
const g=entorno('Gerente',valores,[parte]);
g.sb.window.glacialEconomicoEscuchas();
await tick();
await g.sb.window.glacialImpactoResultados.publicar(true);await espera();
const dia=g.F.docs.get('resultadosEconomicos/2026-10-10');
ok(!!dia&&dia.generadoPorUid==='u-Gerente'&&dia.generadoEn.__ts&&dia.v===2,'Gerencia publica el día con su UID, la hora del servidor y versión 2');
const sumS=dia.filas.reduce((a,f)=>a+(f.s||0),0);
// paradas: 60 min × 1000 UND/h × 0,40 = 400 · velocidad: (1000×7 h − 300) × 0,40 = 2 680 · mermas: 100 × 0,50 = 50
ok(Math.abs(sumS-3130)<0.01&&dia.filas.filter(f=>f.t==='P').length===1&&dia.filas.filter(f=>f.t==='V').length===1&&dia.filas.filter(f=>f.t==='M').length===1,'los soles publicados son los del motor (400 + 2 680 + 50 = 3 130) en 3 eventos');
const texto=JSON.stringify(dia).toLowerCase();
ok(!/valorunitario|margen|costo|precio|vigencia/.test(texto),'el documento publicado NO trae valores unitarios, márgenes, costos ni precios');
ok(g.F.docs.get('resultadosEconomicos/meta').metaPerdidaMes===1000,'publica también la meta mensual');
ok(!g.F.docs.has('resultadosEconomicos/2026-10-09'),'no publica días sin eventos');
const n0=g.F.escritos.length;await g.sb.window.glacialImpactoResultados.publicar(true);await espera();
ok(g.F.escritos.length===n0,'si nada cambió, no vuelve a escribir (sin escrituras innecesarias)');
/* Gerencia: carga de filas con valores */
const cg=await new Promise(r=>g.sb.window.glacialImpactoResultados.cargar('2026-10-10','2026-10-10',(f,i)=>r({f,i})));
ok(cg.f.length===3&&Math.abs(cg.f.reduce((a,x)=>a+(x.s||0),0)-3130)<0.01&&cg.f.every(x=>x.linea==='PET 1'),'Gerencia: el dashboard recibe los 3 eventos valorizados con el nombre legible de la línea');
/* ---------- Los demás no publican ni leen resultados; calculan SIN valores ---------- */
for(const rol of ['Administrador','Supervisor','Ventas']){
  const x=entorno(rol,Object.assign({},valores,{'resultadosEconomicos/2026-10-10':dia}),[parte]);
  x.sb.window.glacialEconomicoEscuchas();await tick();
  await x.sb.window.glacialImpactoResultados.publicar(true);
  ok(x.F.abiertas.length===0&&x.F.escritos.length===0,rol+': 0 escuchas (ni valores ni resultados) y no publica nada');
  const c=await new Promise(r=>x.sb.window.glacialImpactoResultados.cargar('2026-10-10','2026-10-10',(f,i)=>r({f,i})));
  ok(c.f.length===3&&c.f.every(e=>e.s===null),rol+': recibe los eventos operativos con soles = null (ningún valor en memoria)');
  const m={innerHTML:''};x.sb.window.renderPerdidasSoles(m);
  ok(!/S\/|Valores unitarios|soles|costo|precio|margen/i.test(m.innerHTML.replace(/<[^>]+>/g,' ')),rol+': la pantalla no contiene ninguna palabra ni cifra económica');
}
/* ---------- Jefatura: lee resultados, nunca valores ---------- */
const j=entorno('Jefe de Producción',{'resultadosEconomicos/2026-10-10':Object.assign({},dia,{generadoEn:{toMillis:()=>Date.now()}}),'resultadosEconomicos/2026-09-30':{fecha:'2026-09-30',v:1,totales:{total:5}},'resultadosEconomicos/meta':{metaPerdidaMes:1000,fecha:'9999-12-31'}},[parte]);
j.sb.window.glacialEconomicoEscuchas();await tick();
ok(j.F.abiertas.length===1&&j.F.abiertas[0]==='resultadosEconomicos'&&!j.F.abiertas.some(a=>/valoresUnitarios|configEconomica|precios/.test(a)),'Jefatura: su navegador solo escucha resultadosEconomicos (cero escuchas hacia valores unitarios)');
await j.sb.window.glacialImpactoResultados.publicar(true);
ok(j.F.escritos.length===0,'Jefatura no publica ni escribe nada');
const cj=await new Promise(r=>j.sb.window.glacialImpactoResultados.cargar('2026-09-30','2026-10-10',(f,i)=>r({f,i})));
ok(cj.f.length===3&&Math.abs(cj.f.reduce((a,x)=>a+(x.s||0),0)-3130)<0.01&&cj.f[0].linea==='PET 1','Jefatura expande los eventos publicados (soles y unidades) e ignora documentos de la versión anterior');
ok(cj.i.diasSinPublicar===10&&j.sb.window.glacialImpactoResultados.meta()===1000,'Jefatura sabe cuántos días no están publicados y lee la meta');
const mj={innerHTML:''};j.sb.window.renderPerdidasSoles(mj);
ok(!/valor unitario|margen|precio|costo unitario|Valores unitarios|Supuestos/i.test(mj.innerHTML),'Jefatura: la pantalla NO tiene pestaña ni acceso a valores unitarios');
const mg={innerHTML:''};g.sb.window.renderPerdidasSoles(mg);
ok(/Valores unitarios/.test(mg.innerHTML),'Gerencia: la pantalla sí tiene la pestaña Valores unitarios');
/* ---------- Auditoría de archivos ---------- */
const f56=leer('js/produccion/56-impacto-resultados.js');
ok(!/valoresUnitarios|configEconomica|sync'\)\.doc\('precios/.test(f56.replace(/\/\*[\s\S]*?\*\//g,'')),'56 no lee valoresUnitarios, configEconomica ni sync/precios');
const html=leer('index.html');ok(/56-impacto-resultados\.js/.test(html),'56 está cargado en index.html');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
