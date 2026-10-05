/* Etapa 2 · información económica protegida por UID: escuchas, valores con historial, migración y auditoría del código. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

/* ---------- Firestore falso ---------- */
function crearDb(){
  const docs=new Map(),oyentes=[],escuchasAbiertas=[];
  const ref=(col,id)=>({__col:col,__id:id,path:col+'/'+id,
    get:async()=>({exists:docs.has(col+'/'+id),data:()=>docs.get(col+'/'+id)}),
    onSnapshot(cb){escuchasAbiertas.push(col+'/'+id);const o={col,id,cb,vivo:true};oyentes.push(o);cb({exists:docs.has(col+'/'+id),data:()=>docs.get(col+'/'+id)});return()=>{o.vivo=false;};}});
  const col=nombre=>({
    doc:id=>ref(nombre,id),
    where(){return {get:async()=>({docs:[...docs.entries()].filter(([k])=>k.startsWith(nombre+'/')).map(([k,v])=>({id:k.split('/')[1],data:()=>v}))})};},
    onSnapshot(cb){escuchasAbiertas.push(nombre);const o={col:nombre,cb,vivo:true,coleccion:true};oyentes.push(o);emitir(o);return()=>{o.vivo=false;};},
    get:async()=>({docs:[...docs.entries()].filter(([k])=>k.startsWith(nombre+'/')).map(([k,v])=>({id:k.split('/')[1],data:()=>v}))})
  });
  const emitir=o=>o.cb({docs:[...docs.entries()].filter(([k])=>k.startsWith(o.col+'/')).map(([k,v])=>({id:k.split('/')[1],data:()=>v}))});
  const fusionar=(a,b)=>{const r=Object.assign({},a);Object.keys(b).forEach(k=>{r[k]=(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&b[k].__ts!==true&&a&&typeof a[k]==='object'&&a[k])?fusionar(a[k],b[k]):b[k];});return r;};
  const db={collection:col,
    runTransaction:async fn=>{
      const escrituras=[];
      const tx={get:async r=>r.get(),set:(r,d,o)=>escrituras.push([r,d,o])};
      const res=await fn(tx);
      escrituras.forEach(([r,d,o])=>{const k=r.__col+'/'+r.__id;docs.set(k,o&&o.merge?fusionar(docs.get(k)||{},d):d);});
      oyentes.filter(x=>x.vivo&&x.coleccion).forEach(emitir);
      return res;
    }};
  return {db,docs,escuchasAbiertas,oyentes};
}
function entorno(uid,acceso,estado){
  const F=crearDb();
  if(acceso)F.docs.set('accesoEconomico/'+uid,{nivel:acceso});
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout};vm.createContext(sb);sb.window=sb;
  sb.db=F.db;sb.auth={currentUser:{uid}};
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>({__ts:true})}}};
  sb.state={user:{rol:estado||'Administrador',username:'u'}};
  sb.glacialCierresSesion=[];
  sb.document={getElementById:()=>null};
  vm.runInContext(leer('js/produccion/55-valores-economicos.js'),sb);
  return {sb,F};
}
const eco=sb=>sb.window.glacialEconomico;

(async()=>{
/* ---------- 1) Quién abre qué escucha ---------- */
for(const [rol,acceso] of [['Administrador',null],['Supervisor',null],['Jefatura','jefatura']]){
  const {sb,F}=entorno('uid-'+rol,acceso,rol);
  sb.window.glacialEconomicoEscuchas();
  const aValores=F.escuchasAbiertas.filter(x=>x==='valoresUnitarios'||x.startsWith('valoresUnitarios/')||x.startsWith('configEconomica')||x==='sync/precios');
  ok(F.escuchasAbiertas.length===1&&F.escuchasAbiertas[0]==='accesoEconomico/uid-'+rol&&aValores.length===0,rol+(acceso?' (Jefatura autorizada)':'')+': solo abre su propio accesoEconomico; NO abre ninguna escucha hacia valores unitarios, historial, configEconomica ni sync/precios');
  ok(Object.keys(eco(sb).docs().margenes.valores).length===0&&!eco(sb).esGerencia()&&eco(sb).accesoListo(),rol+': no tiene valores en memoria y su acceso quedó resuelto');
  let err='';try{await eco(sb).guardar({tipo:'producto',linea:'PET1',marca:'Scala',presentacion:'2.5 L',valor:1});}catch(e){err=e.message;}
  ok(/Gerencia/.test(err)&&![...F.docs.keys()].some(k=>k.startsWith('valoresUnitarios')),rol+': no puede guardar valores desde la app (ni se escribe nada)');
  err='';try{await eco(sb).historial('P__x');}catch(e){err=e.message;}
  ok(/Gerencia/.test(err),rol+': no puede consultar el historial');
}
/* ---------- 2) Gerencia: valores, historial, tiempo real ---------- */
const g=entorno('uid-ger','gerencia','Gerente');
g.sb.window.glacialEconomicoEscuchas();
ok(eco(g.sb).esGerencia()&&g.F.escuchasAbiertas.includes('valoresUnitarios'),'Gerencia: abre la escucha de valoresUnitarios');
let avisos=0;eco(g.sb).alCambiar(()=>avisos++);
await eco(g.sb).guardar({tipo:'producto',linea:'PET1',marca:'Scala',presentacion:'2.5 L',valor:0.30,fecha:'2020-01-01'});
let d=g.F.docs.get('valoresUnitarios/P__pet1__scala__2-5-l');
ok(d&&d.version===1&&d.valorUnitario===0.30&&d.actualizadoPorUid==='uid-ger'&&d.fechaActualizacion&&d.fechaActualizacion.__ts,'crea el valor con versión 1, UID y hora del servidor');
let h=g.F.docs.get('valoresUnitariosHistorial/P__pet1__scala__2-5-l_1');
ok(h&&h.valorAnterior===null&&h.valorNuevo===0.30&&h.uid==='uid-ger'&&h.timestamp.__ts&&h.linea==='PET1'&&h.marca==='Scala'&&h.presentacion==='2.5 L','historial v1: valor anterior vacío, nuevo, línea, marca, presentación, UID y hora del servidor');
await eco(g.sb).guardar({tipo:'producto',linea:'PET1',marca:'Scala',presentacion:'2.5 L',valor:0.35,fecha:'2020-06-01'});
d=g.F.docs.get('valoresUnitarios/P__pet1__scala__2-5-l');
h=g.F.docs.get('valoresUnitariosHistorial/P__pet1__scala__2-5-l_2');
ok(d.version===2&&d.valorUnitario===0.35&&Object.keys(d.vigencias).length===2&&d.vigencias['2020-01-01']===0.30,'segundo cambio: versión 2, el valor vigente es el nuevo y la vigencia anterior se conserva (actualización por campos, no se pisa el documento)');
ok(h&&h.valorAnterior===0.30&&h.valorNuevo===0.35,'historial v2: valor anterior 0,30 y valor nuevo 0,35');
ok(g.F.docs.has('valoresUnitariosHistorial/P__pet1__scala__2-5-l_1'),'el historial anterior sigue ahí (solo se agrega)');
const prov=g.sb.window.glacialEconomico.docs().margenes.valores['pet1__scala__2-5-l'];
ok(prov&&prov.v['2020-01-01'].valor===0.30&&prov.v['2020-06-01'].valor===0.35&&avisos>=2,'en vivo: el otro dispositivo de Gerencia recibe el cambio y se recalcula (se notificó '+avisos+' veces)');
await eco(g.sb).guardar({tipo:'insumo',linea:'PET1',componente:'Botellas',valor:0.4,fecha:'2020-01-01'});
await eco(g.sb).guardar({tipo:'meta',valor:5000});
ok(eco(g.sb).docs().costos.valores['pet1--botellas']&&eco(g.sb).docs().general.metaPerdidaMes===5000,'costo de insumo y meta mensual también se cargan con su historial');
let e3='';try{await eco(g.sb).guardar({tipo:'producto',linea:'PET1',marca:'Scala',presentacion:'2.5 L',valor:-1});}catch(e){e3=e.message;}
ok(/mayor o igual/.test(e3),'rechaza valores negativos');
const idsHist=[...g.F.docs.keys()].filter(k=>k.startsWith('valoresUnitariosHistorial/'));
ok(idsHist.length===4,'cada cambio dejó su historial ('+idsHist.length+' registros)');
/* cierre de sesión */
g.sb.glacialCierresSesion.forEach(f=>f());
ok(g.F.oyentes.every(o=>!o.vivo)&&Object.keys(eco(g.sb).docs().margenes.valores).length===0,'al cerrar sesión se cierran todas las escuchas y se vacían los valores de la memoria');
/* si Gerencia pierde el acceso en vivo, deja de escuchar */
const g2=entorno('uid-g2','gerencia');g2.sb.window.glacialEconomicoEscuchas();
await eco(g2.sb).guardar({tipo:'meta',valor:100});
const oAcc=g2.F.oyentes.find(o=>o.col==='accesoEconomico');
g2.F.docs.delete('accesoEconomico/uid-g2');oAcc.cb({exists:false,data:()=>null});
ok(!eco(g2.sb).esGerencia()&&g2.F.oyentes.filter(o=>o.col==='valoresUnitarios').every(o=>!o.vivo)&&Object.keys(eco(g2.sb).docs().general).length===0,'si se retira el UID de Gerencia en Firebase Console, el navegador deja de escuchar y borra los valores de memoria');
/* ---------- 3) Migración ---------- */
const m=entorno('uid-m','gerencia');
m.F.docs.set('configEconomica/margenes',{valores:{'625-ml-bells':{etiqueta:'Bells · 625 ml',v:{'2020-01-01':{valor:0.5}}},'huerfano':{etiqueta:'Producto viejo',v:{'2020-01-01':{valor:9}}}}});
m.F.docs.set('configEconomica/costos',{valores:{'pet1--botellas':{etiqueta:'x',v:{'2020-01-01':{valor:0.4}}}}});
m.F.docs.set('configEconomica/general',{metaPerdidaMes:2000});
m.F.docs.set('sync/precios',{items:{PET1:1}});
m.sb.LINES=[{key:'PET1'},{key:'PET2'}];
m.sb.window.glacialReporteIndicadores={addDias:(f)=>f,recolectar:()=>({partes:[{pkey:'625 ml|Bells',linea:'PET1',marcaN:'Bells',cat:'625 ml'},{pkey:'625 ml|Bells',linea:'PET2',marcaN:'Bells',cat:'625 ml'}]})};
m.sb.window.glacialEconomicoEscuchas();
const inf=await eco(m.sb).migrar();
ok(inf.productos===2&&inf.insumos===1&&inf.meta&&inf.sinLinea.includes('Producto viejo'),'migración: el margen anterior se copia a cada línea donde el producto aparece, más costo de insumo y meta; lo que no tiene línea se informa');
ok(m.F.docs.has('valoresUnitarios/P__pet1__bells__625-ml')&&m.F.docs.has('valoresUnitarios/P__pet2__bells__625-ml')&&m.F.docs.has('valoresUnitarios/I__pet1--botellas')&&inf.precios.PET1===1,'migración: documentos nuevos creados con historial; los precios por línea de sync/precios solo se devuelven como referencia');
ok(m.F.docs.has('sync/precios')&&m.F.docs.has('configEconomica/margenes')&&m.F.docs.has('configEconomica/costos')&&m.F.docs.has('configEconomica/general'),'migración: no modifica ni borra los documentos anteriores (se borran después, desde Firebase Console)');
/* ---------- 4) Auditoría del código ---------- */
const jsDir=R+'/js';const archivos=[];
(function rec(d){fs.readdirSync(d).forEach(n=>{const p=d+'/'+n;fs.statSync(p).isDirectory()?rec(p):/\.js$/.test(n)&&archivos.push(p);});})(jsDir);
const prohibidos=/PRECIOS_UNITARIOS|loadPrecios|savePrecios|precioUnitarioLinea|_preciosCache|_preciosReady|onPreciosUpdated|renderPerdidasSoles\s*\(\s*main\s*\)\s*\{/;
const malos=archivos.filter(f=>prohibidos.test(fs.readFileSync(f,'utf8')));
ok(malos.length===0,'ningún archivo de /js conserva las funciones ni las constantes de precios antiguas'+(malos.length?': '+malos.map(x=>path.basename(x)).join(', '):''));
const conPrecios=archivos.filter(f=>/doc\('precios'\)/.test(fs.readFileSync(f,'utf8'))).map(x=>path.basename(x));
ok(conPrecios.length===0||(conPrecios.length===1&&conPrecios[0]==='55-valores-economicos.js'),'solo la migración (55) lee sync/precios, y solo Gerencia puede: '+conPrecios.join(', '));
const soles=archivos.filter(f=>/(PET1|PET2|B7L|C20L|B20L|HIELO)\s*:\s*\d+(\.\d+)?\s*,?\s*\n/.test(fs.readFileSync(f,'utf8').replace(/RATIO[^\n]*\n/g,'')) && /precio|S\/\s?\d/i.test(fs.readFileSync(f,'utf8')));
ok(soles.length===0,'no queda ningún objeto línea→número junto a «precio» o «S/» en /js'+(soles.length?': '+soles.map(x=>path.basename(x)).join(', '):''));
ok(!fs.existsSync(R+'/js/produccion/15-perdidas-soles.js')&&!fs.existsSync(R+'/js/produccion/22-impacto-para-pegar.js')&&!/15-perdidas-soles|22-impacto-para-pegar/.test(leer('index.html')),'la vista antigua (15 y 22) se retiró del código y de index.html');
/* ---------- 5) Reglas ---------- */
const reglas=leer('firestore.rules.etapa2.txt');
const bloque=n=>{const i=reglas.indexOf('match /'+n+'/');const j=reglas.indexOf('\n    }\n',i);return reglas.slice(i,j);};
const eco4=['valoresUnitarios','valoresUnitariosHistorial','resultadosEconomicos','configEconomica','accesoEconomico'].map(bloque);
ok(eco4.every(b=>b.length>0)&&eco4.every(b=>!/esAdmin\(\)|\.rol\b|permisos/.test(b)),'las reglas de lo económico no usan rol, permisos ni esAdmin(): solo el UID (accesoEconomico)');
ok(/allow read: if esGerencia\(\);/.test(bloque('valoresUnitarios'))&&/allow read: if esGerencia\(\);/.test(bloque('valoresUnitariosHistorial')),'valores unitarios e historial: lectura solo Gerencia (Jefatura, Administrador y demás reciben permission-denied)');
ok(/allow update, delete: if false/.test(bloque('valoresUnitariosHistorial'))&&/allow delete: if false/.test(bloque('valoresUnitarios')),'el historial no se edita ni se borra; los valores no se borran');
ok(/existsAfter\(/.test(bloque('valoresUnitarios'))&&/getAfter\(/.test(bloque('valoresUnitariosHistorial')),'un valor no puede cambiar sin su historial, y el historial debe coincidir con la versión del valor');
ok(/allow write: if false/.test(bloque('accesoEconomico'))&&/request\.auth\.uid == uid/.test(bloque('accesoEconomico')),'accesoEconomico: nadie lo escribe desde la app y cada quien solo lee el suyo');
ok(/allow read: if esGerencia\(\) \|\| esJefaturaEco\(\);/.test(bloque('resultadosEconomicos'))&&/esGerencia\(\)/.test(bloque('resultadosEconomicos').split('allow create')[1]),'resultados económicos: leen Gerencia y Jefatura autorizada; solo Gerencia escribe');
ok(!/'precios', 'paletas'/.test(reglas)&&/doc == 'precios' && esGerencia\(\)/.test(reglas),'sync/precios: ya no lo escribe ni lo lee nadie salvo Gerencia (para migrar)');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
