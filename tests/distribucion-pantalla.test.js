/* Pantalla «Distribución de personal» del Tareo: render, permisos, contexto, guardado y avisos (con DOM y Firestore simulados). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-08';
const ms=(h,m,dia)=>new Date(2026,9,dia||8,h,m||0).getTime();

function fakeDb(){
  const docs=new Map(),oyentes=new Map();let ts=1000;
  const notificar=p=>{const base=p.split('/').slice(0,2).join('/');[...oyentes.entries()].forEach(([k,fs_])=>{if(k===base||k===base+'/eventos')fs_.forEach(f=>f());});};
  const snapDoc=p=>({exists:docs.has(p),data:()=>docs.has(p)?JSON.parse(JSON.stringify(docs.get(p))):undefined});
  const eventos=base=>[...docs.entries()].filter(([k])=>k.startsWith(base+'/eventos/')).map(([,v])=>({data:()=>JSON.parse(JSON.stringify(v))})).sort((a,b)=>a.data().desdeMs-b.data().desdeMs);
  const mkref=p=>({path:p,collection:n=>({doc:id=>mkref(p+'/'+n+'/'+id),
      orderBy:()=>({async get(){return {docs:eventos(p)};},onSnapshot(cb){const f=()=>cb({docs:eventos(p)});(oyentes.get(p+'/eventos')||oyentes.set(p+'/eventos',[]).get(p+'/eventos')).push(f);f();return ()=>{};}})}),
    async get(){return snapDoc(p);},
    onSnapshot(cb){const f=()=>cb(snapDoc(p));(oyentes.get(p)||oyentes.set(p,[]).get(p)).push(f);f();return ()=>{};}});
  return {docs,collection:n=>({doc:id=>mkref(n+'/'+id)}),
    async runTransaction(fn){const esc=[];const tx={async get(r){return snapDoc(r.path);},set(r,d){esc.push([r.path,d]);}};await fn(tx);
      esc.forEach(([p,d])=>docs.set(p,JSON.parse(JSON.stringify(d,(k,v)=>v&&v.__ts?ts++:v))));esc.forEach(([p])=>notificar(p));}};
}
function entorno(usuario,ahora){
  const els={};const el=id=>els[id]||(els[id]={id,innerHTML:'',textContent:''});
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,Infinity,isFinite};
  vm.createContext(sb);sb.window=sb;sb.els=els;
  sb.document={getElementById:id=>els[id]||null,createElement:()=>({}),head:{appendChild(){}}};
  sb.db=fakeDb();
  sb.firebase={auth:()=>({currentUser:{uid:usuario.uid||'u1'}}),firestore:{FieldValue:{serverTimestamp:()=>({__ts:true})}}};
  sb.state={user:usuario};sb.ahora=ahora||ms(12);sb.tareoAhoraServidor=()=>sb.ahora;sb.glacialCierresSesion=[];
  els.main={id:'main',innerHTML:''};
  sb.tareoRenderTabs=a=>'<div class="tareo-tabs" data-activa="'+a+'"></div>';
  sb.obtenerTareos=()=>sb.tareos||[];sb.tareoAreaDe=()=> 'Producción';
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  const s02=leer('js/nucleo/02-estado.js');
  vm.runInContext(s02.slice(s02.indexOf('const ROLES_DISTRIBUCION_PERSONAL'),s02.indexOf('function tienePermiso(permiso)'))+"function tienePermiso(p){return p==='distribuirPersonal'?distribucionPersonalPermitida(state.user):false;}",sb);
  vm.runInContext(leer('js/personal/43-distribucion-personal.js'),sb);
  vm.runInContext(leer('js/personal/44-distribucion-personal-pantalla.js'),sb);
  // los elementos hijos que la pantalla actualiza por id: se crean al pintar (se leen del HTML de main)
  sb.refrescarHijos=()=>{const h=els.main.innerHTML;['dp-banner','dp-resumen','dp-form','dp-modal','dp-root','dp-total-form'].forEach(id=>{els[id]=els[id]||{id,innerHTML:'',textContent:''};});};
  return sb;
}
const sup={rol:'Supervisor',uid:'s1',nombre:'Ana',username:'ana',permisos:['tareoProduccion'],fechaOperativa:FECHA,turnoOperativo:'DÍA'};

/* 1) supervisor en su contexto */
let sb=entorno(sup);sb.refrescarHijos();
sb.glacialDistribucionPantalla.pintar();
let html=sb.els.main.innerHTML;
ok(/DISTRIBUCIÓN DE PERSONAL/.test(html)&&/data-activa="distribucion"/.test(html),'pestaña y título «DISTRIBUCIÓN DE PERSONAL»');
ok(['PET1','PET2','B7L','CAJAS 20L','B20L'].every(l=>html.includes('>'+l+'<')),'las cinco líneas: PET1, PET2, B7L, C20L y B20L');
ok((html.match(/inputmode="numeric"/g)||[]).length>=6,'campos enteros por línea (y apoyo) con teclado numérico para celular');
ok(/Pendiente de confirmar/.test(html)&&/Sin confirmar/.test(html),'sin datos: «Pendiente de confirmar» y «Sin confirmar»');
ok(/Confirmar distribución/.test(html)&&/Registrar cambio/.test(html)&&/Ver historial/.test(html),'botones Confirmar distribución, Registrar cambio y Ver historial');
ok(/Registrar cambio<\/button>/.test(html)&&/<button class="dp-primario" disabled[^>]*>Registrar cambio/.test(html.replace(/\s+/g,' ').replace(/> </g,'><'))||/disabled onclick="glacialDistribucionPantalla.guardar\(\)" title="Cambio posterior/.test(html.replace(/\s+/g,' ')),'sin confirmación previa, «Registrar cambio» está deshabilitado');
ok(/Fecha operativa/.test(html)&&/Bloque/.test(html)&&/Hora desde la que aplica/.test(html)&&/Total distribuido/.test(html)&&/asignaciones declaradas/.test(html),'fecha operativa, bloque, hora de vigencia, total y aclaración de que son asignaciones declaradas');
ok(/No se puede comprobar/.test(html),'sin asistencia en el Tareo: «No se puede comprobar» (no inventa disponibilidad)');

/* 2) guardar desde la pantalla y ver lo confirmado */
(async()=>{
  const P=sb.glacialDistribucionPantalla;
  P.campo('PET1','6');P.campo('PET2','0');P.campo('B7L','8');P.desde('07:00');
  await P.guardar();
  ok(sb.db.docs.has('distribucionPersonal/'+FECHA+'_DIA')&&[...sb.db.docs.keys()].some(k=>k.includes('/eventos/')),'guardar desde la pantalla crea la versión y el evento');
  sb.refrescarHijos();P.pintar();html=sb.els.main.innerHTML;
  ok(/class="dp-ok">6 /.test(html)&&/class="dp-ok">0 /.test(html)&&/class="dp-ok">8 /.test(html)&&/Pendiente de confirmar/.test(html),'PET1 6, PET2 0 confirmado y B7L 8; las líneas no declaradas siguen pendientes (no 0)');
  ok(/Confirmada por <b>Ana<\/b>/.test(html)&&/versión 1/.test(html)&&/Total distribuido ahora<\/span><span>14<\/span>/.test(html),'muestra quién confirmó, la versión y el total distribuido (14)');
  ok(/<h3 style="font-size:15px">Registrar cambio<\/h3>/.test(html),'después de confirmar, el formulario pasa a «Registrar cambio» (exige motivo)');
  /* disponibles: Tareo con 12 asistentes */
  sb.tareos=[{fecha:FECHA,turno:'DÍA',personal:Array.from({length:12},(_,i)=>({nombre:'P'+i,asistencia:'ASISTIO'}))}];
  sb.refrescarHijos();P.pintar();html=sb.els.main.innerHTML;
  ok(/Se distribuyeron 2 más que el personal disponible: revisar/.test(html)&&/disponibles según Tareo: 12/.test(html),'compara con el personal disponible del Tareo (14 distribuidos vs 12) y pide revisar');
  /* historial */
  P.historial(true);ok(/Historial/.test(sb.els['dp-modal'].innerHTML)&&/Aplica desde/.test(sb.els['dp-modal'].innerHTML)&&/PET1: — → <b>6<\/b>/.test(sb.els['dp-modal'].innerHTML),'«Ver historial» muestra hora efectiva, hora guardada, usuario y cantidades anterior → nueva');
  P.historial(false);
  /* cambio con motivo obligatorio */
  P.campo('PET1','5');P.desde('10:00');
  await P.guardar();
  ok(/motivo/i.test(sb.glacialDistribucionPantalla.estado().error),'un cambio sin motivo se rechaza con mensaje claro');
  P.motivo('Se mueve una persona a PET2');P.campo('PET2','1');
  await P.guardar();
  ok([...sb.db.docs.keys()].filter(k=>k.includes('/eventos/')).length===2&&sb.db.docs.get('distribucionPersonal/'+FECHA+'_DIA').version===2,'con motivo se registra el cambio (versión 2)');
  /* conflicto: otro dispositivo guardó mientras se editaba */
  sb.refrescarHijos();P.pintar();
  P.campo('B7L','9');
  const otro=sb.glacialDistribucionPersonal;
  await otro.guardar(FECHA,'DÍA',{opId:'externo',versionEsperada:2,desdeMs:ms(11),lineas:{PET1:5,PET2:1,B7L:7},motivo:'Otro supervisor'});
  ok(/Otra persona guardó/.test(sb.els['dp-banner'].innerHTML),'si otra persona guarda mientras editas, aparece el aviso y no se pierde lo escrito');
  P.motivo('Mi cambio');
  await P.guardar();
  ok(/cambió mientras la editabas/.test(sb.glacialDistribucionPantalla.estado().error)&&sb.db.docs.get('distribucionPersonal/'+FECHA+'_DIA').version===3,'al guardar con una versión vieja se rechaza: no pisa el cambio del otro supervisor');

  /* 3) consulta: Jefatura no ve formulario */
  sb=entorno({rol:'Jefatura',uid:'j1',nombre:'Jefe',username:'j',permisos:['ver_tareo_produccion']});sb.refrescarHijos();
  sb.glacialDistribucionPantalla.pintar();html=sb.els.main.innerHTML;
  ok(/Modo consulta/.test(html)&&!/inputmode="numeric"/.test(html)&&!/Confirmar distribución/.test(html)&&/Ver historial/.test(html),'Jefatura: solo consulta (sin formulario ni botones de guardar; sí puede ver el historial)');
  /* 4) supervisor fuera de su contexto */
  sb=entorno(sup);sb.refrescarHijos();sb.glacialDistribucionPantalla.pintar();
  sb.glacialDistribucionPantalla.contexto('2026-10-07',null);html=sb.els.main.innerHTML;
  ok(/solo puedes registrar la distribución de tu fecha y bloque/.test(html)&&!/inputmode="numeric"/.test(html),'un supervisor no edita otra fecha (solo la consulta)');
  sb.glacialDistribucionPantalla.contexto(FECHA,'NOCHE');html=sb.els.main.innerHTML;
  ok(/solo puedes registrar/.test(html),'ni otro bloque');
  /* 5) Jefe de Producción edita cualquier fecha */
  sb=entorno({rol:'Jefe de Producción',uid:'jp',nombre:'JP',username:'jp',permisos:[]});sb.refrescarHijos();sb.glacialDistribucionPantalla.pintar();
  sb.glacialDistribucionPantalla.contexto('2026-10-07',null);
  ok(/inputmode="numeric"/.test(sb.els.main.innerHTML),'el Jefe de Producción puede registrar en otra fecha');
  /* 6) pestaña en el Tareo */
  const t13=leer('js/personal/13-tareo.js');
  ok(/distribucion: \['tareo'\]/.test(t13)&&/renderDistribucionPersonal\(\)/.test(t13),'la pestaña se agrega al Tareo de Producción (y solo allí)');
  ok(/glacialCierresSesion/.test(leer('js/personal/44-distribucion-personal-pantalla.js')),'las escuchas se cierran al cerrar sesión');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
