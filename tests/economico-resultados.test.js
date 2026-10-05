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
  sb.state={user:{rol,username:'u'},currentTab:'perdidas'};
  sb._recordsReady=true;sb.glacialCierresSesion=[];
  const celdas=new Map();
  sb.document={getElementById:()=>null,addEventListener(){},createElement:()=>({}),head:{appendChild(){}},body:{contains:()=>false}};
  sb.LINES=[{key:'PET1',name:'PET 1'}];
  sb.window.glacialReporteIndicadores={
    addDias:(f,n)=>{const d=new Date(f+'T00:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);},
    hoyOp:()=>'2026-10-10',fechaOk:f=>/^\d{4}-\d{2}-\d{2}$/.test(f||''),nombreLinea:k=>k==='PET1'?'PET 1':k,etiquetaGrupo:g=>g==='NOCHE'?'Noche':'Día',
    etiquetaProd:(m,p)=>m+' · '+p,recolectar:()=>({partes:partes||[],hayVivo:false}),filtrarPartes:p=>p,marcaCanon:m=>m,catPres:()=>'',ORDEN_PRES:[]};
  vm.runInContext(leer('js/produccion/55-valores-economicos.js'),sb);
  vm.runInContext(leer('js/produccion/50-impacto-economico.js'),sb);
  vm.runInContext(leer('js/produccion/56-impacto-resultados.js'),sb);
  return {sb,F};
}
const parte={linea:'PET1',fecha:'2026-10-10',grupo:'DIA',marca:'Scala',pres:'2.5L',marcaN:'Scala',cat:'2.5 L',pkey:'2.5L|Scala',producido:300,programado:1000,progUnit:true,
  planMin:480,availMin:420,npMin:60,vel:1000,paradas:[{motivo:'Falla de sopladora',minutos:60,estimada:false}],mermas:{Botellas:{unidades:100,peso:0}}};
const valores={'valoresUnitarios/P__pet1__scala__2-5-l':{tipo:'producto',linea:'PET1',marca:'Scala',presentacion:'2.5 L',clave:'pet1__scala__2-5-l',valorUnitario:0.40,vigencias:{'2020-01-01':0.40},activo:true,version:1},
  'valoresUnitarios/I__pet1--botellas':{tipo:'insumo',linea:'PET1',componente:'Botellas',clave:'pet1--botellas',valorUnitario:0.5,vigencias:{'2020-01-01':0.5},activo:true,version:1},
  'valoresUnitarios/META__perdida-mensual':{tipo:'meta',clave:'meta',valorUnitario:1000,vigencias:{'2020-01-01':1000},activo:true,version:1}};
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
/* ---------- Gerencia publica sus resultados ---------- */
const g=entorno('Gerente',valores,[parte]);
g.sb.window.glacialEconomicoEscuchas();
await tick();
await g.sb.window.glacialImpactoResultados.publicar(true);
const dia=g.F.docs.get('resultadosEconomicos/2026-10-10');
ok(!!dia&&dia.generadoPorUid==='u-Gerente'&&dia.generadoEn.__ts,'Gerencia publica el resultado del día con su UID y la hora del servidor');
// paradas: 60 min /60 × 1000 UND/h × 0,40 = 400 · velocidad: (1000×7 h − 300) × 0,40 = 2 680 · mermas: 100 × 0,50 = 50
ok(Math.abs(dia.totales.paradasS-400)<0.01&&Math.abs(dia.totales.velS-2680)<0.01&&Math.abs(dia.totales.mermaS-50)<0.01&&Math.abs(dia.totales.total-3130)<0.01,'los soles publicados son los del motor (400 + 2 680 + 50 = 3 130)');
const texto=JSON.stringify(dia).toLowerCase();if(process.env.DEPURAR)console.log(texto);
ok(!/valor|margen|costo|precio|0\.4\b|scala|2\.5/.test(texto.replace(/valorunitario/g,'')),'el documento publicado NO trae valores unitarios, márgenes, costos ni nombres de producto');
ok(dia.porLinea.length===1&&dia.porMotivo.length===1&&Array.isArray(dia.mermaComp),'trae solo agregados: por línea, motivo, turno y componente de merma');
ok(g.F.docs.get('resultadosEconomicos/meta').metaPerdidaMes===1000,'publica también la meta mensual');
const n0=g.F.escritos.length;await g.sb.window.glacialImpactoResultados.publicar(true);
ok(g.F.escritos.length===n0,'si nada cambió, no vuelve a escribir (sin escrituras innecesarias)');
/* ---------- Los demás no publican ni leen resultados ---------- */
for(const rol of ['Administrador','Supervisor','Ventas']){
  const x=entorno(rol,Object.assign({},valores,{'resultadosEconomicos/2026-10-10':dia}),[parte]);
  x.sb.window.glacialEconomicoEscuchas();await tick();
  await x.sb.window.glacialImpactoResultados.publicar(true);
  ok(x.F.abiertas.length===0&&x.F.escritos.length===0,rol+': 0 escuchas (ni valores ni resultados) y no publica nada');
}
/* ---------- Jefatura: lee resultados, nunca valores ---------- */
const j=entorno('Jefe de Producción',{'resultadosEconomicos/2026-10-10':Object.assign({},dia,{generadoEn:{toMillis:()=>Date.now()}}),'resultadosEconomicos/meta':{metaPerdidaMes:1000,fecha:'9999-12-31'}},[parte]);
j.sb.window.glacialEconomicoEscuchas();await tick();
ok(j.F.abiertas.length===1&&j.F.abiertas[0]==='resultadosEconomicos'&&!j.F.abiertas.some(a=>/valoresUnitarios|configEconomica|precios/.test(a)),'Jefatura: su navegador solo escucha resultadosEconomicos (cero escuchas hacia valores unitarios)');
await j.sb.window.glacialImpactoResultados.publicar(true);
ok(j.F.escritos.length===0,'Jefatura no publica ni escribe nada');
const S=j.sb.window.glacialImpactoResultados.sumarResultados('2026-10-01','2026-10-31');
ok(S.dias===1&&Math.abs(S.total-3130)<0.01&&S.listas.linea[0].etq==='PET 1','Jefatura suma los resultados diarios publicados del periodo');
const mainJ={innerHTML:''};j.sb.window.renderPerdidasSoles(mainJ);
const hj=mainJ.innerHTML;
ok(/S\/ 3\.130,00/.test(hj)||/S\/ 3.130,00/.test(hj)||/3[.,]130/.test(hj),'Jefatura ve la pérdida total en S/ del periodo');
ok(!/valor unitario|margen|precio|costo unitario|Valores unitarios|Supuestos/i.test(hj),'Jefatura NO ve valor unitario, margen, precio, costo ni la pantalla de valores');
ok(/Minutos perdidos/.test(hj)&&/Unidades perdidas/.test(hj),'Jefatura ve también la parte operativa (minutos y unidades)');
/* ---------- Administrador / supervisor: solo lo operativo ---------- */
for(const rol of ['Administrador','Supervisor']){
  const o=entorno(rol,valores,[parte]);o.sb.window.glacialEconomicoEscuchas();await tick();
  const m={innerHTML:''};o.sb.window.renderPerdidasSoles(m);
  const h=m.innerHTML.replace(/<[^>]+>/g,' ');
  ok(/Impacto operativo/.test(h)&&/Minutos perdidos/.test(h)&&/Unidades perdidas/.test(h)&&/Cantidad de paradas/.test(h),rol+': ve minutos, unidades, cantidad de paradas y rankings');
  ok(!/S\/|soles|costo|precio|margen|valor unitario|pérdida económica|total económico/i.test(h.replace('Los valores económicos están reservados a Gerencia y Jefatura autorizada.','')),rol+': no aparece ninguna cifra ni palabra económica (S/, soles, costo, precio, valor unitario…)');
  ok(/Los valores económicos están reservados a Gerencia y Jefatura autorizada\./.test(h),rol+': ve el aviso de que los valores económicos están reservados');
}
/* ---------- Parte operativa ---------- */
const op=j.sb.window.glacialImpactoResultados.calcularOperativo([parte]);
ok(Math.round(op.T.npMin)===60&&Math.round(op.T.paradasU)===1000&&Math.round(op.T.velU)===6700&&op.T.nParadas===1&&op.porMotivo[0].etq==='Falla de sopladora','operativo: 60 min, 1 000 unidades por paradas, 6 700 por velocidad, 1 parada y su ranking por motivo');
/* ---------- Auditoría de archivos ---------- */
const f56=leer('js/produccion/56-impacto-resultados.js');
ok(!/valoresUnitarios|configEconomica|sync'\)\.doc\('precios/.test(f56.replace(/\/\*[\s\S]*?\*\//g,'')),'56 no lee valoresUnitarios, configEconomica ni sync/precios');
const html=leer('index.html');ok(/56-impacto-resultados\.js/.test(html),'56 está cargado en index.html');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
