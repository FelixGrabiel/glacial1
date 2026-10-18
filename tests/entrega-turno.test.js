/* Entrega de turno: entregar, corregir, recibir (dos dispositivos), reglas por campos, sugerencia por rotación, tarjeta del Inicio y compatibilidad. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
const SERVIDOR={__ts:true};

/* ---------- nube falsa: documentos, transacciones, consultas con where >= + orderBy, oyentes y dos "dispositivos" ---------- */
const docs=new Map(),oyentes=[];let reloj=Date.parse('2026-10-11T14:05:00');
const escrituras=[];                                    // {tipo, campos, id}
const sellar=o=>{const s={};Object.keys(o).forEach(k=>{s[k]=o[k]&&o[k].__ts?{toMillis:()=>reloj}:clon(o[k]);});return s;};
function notificar(){oyentes.forEach(o=>o());}
const dbFalsa={
  collection(c){
    return {
      doc(id){return {id,_c:c,get:async()=>({exists:docs.has(c+'/'+id),data:()=>docs.get(c+'/'+id)})};},
      where(campo,op,val){
        return {orderBy(){return {limit(){return {onSnapshot(cb){
          const f=()=>cb({docs:[...docs.entries()].filter(([k,v])=>k.startsWith(c+'/')&&v.fecha>=val).map(([k,v])=>({id:k.split('/')[1],data:()=>v}))});
          oyentes.push(f);f();return()=>{};
        }};}};}};
      }
    };
  },
  async runTransaction(fn){
    const tx={
      async get(ref){const k=ref._c+'/'+ref.id;return {exists:docs.has(k),data:()=>docs.get(k)};},
      set(ref,d){escrituras.push({tipo:'create',campos:Object.keys(d),id:ref.id});docs.set(ref._c+'/'+ref.id,sellar(d));},
      update(ref,d){const k=ref._c+'/'+ref.id;escrituras.push({tipo:'update',campos:Object.keys(d),id:ref.id});docs.set(k,Object.assign({},docs.get(k),sellar(d)));}
    };
    const r=await fn(tx);notificar();return r;
  }
};
function dispositivo(usuario,uid,opciones){
  const o=opciones||{};
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,Promise,RegExp,Error,setInterval:()=>0,clearInterval(){},setTimeout:(f)=>0,db:dbFalsa};
  vm.createContext(sb);sb.window=sb;
  const el={style:{},appendChild(){},remove(){},querySelector:()=>null,addEventListener(){},insertAdjacentHTML(){},innerHTML:''};
  sb.document={getElementById:()=>null,addEventListener(){},createElement:()=>({style:{},setAttribute(){},addEventListener(){},querySelector:()=>null,remove(){}}),head:el,body:el};
  sb.state={user:usuario,currentTab:'centro-perfil'};
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>SERVIDOR}},auth:()=>({currentUser:{uid}})};
  sb.tareoAhoraServidor=()=>reloj;
  sb.esMantCompartido=u=>u.rol==='Mantenimiento compartido';
  sb.esUsuarioSoloConsulta=u=>['Gerente General','Gerente','Jefatura'].includes(u.rol);
  sb.tienePermiso=()=>false;
  sb.glacialResumenTurno={construirDatos:async(fecha,turno)=>({lineas:[
      {linea:'PET1',nombre:'PET 1',estado:'DETENIDA',programado:1000,producido:600,cumplimiento:60},
      {linea:'B7L',nombre:'B7L',estado:'EN_CURSO',programado:500,producido:500,cumplimiento:100}],
    totales:{programado:1500,producido:1100,cumplimiento:73.3},
    pendientes:{paradasSinMotivo:[{linea:'PET1',nombre:'PET 1'},{linea:'PET1',nombre:'PET 1'}]}})};
  sb.rotSupBuscarSemanaPorFecha=f=>({detalles:[{username:'ana',nombre:'Ana'},{username:'luis',nombre:'Luis'},{username:'rosa',nombre:'Rosa'}]});
  sb.rotSupAsignacionFecha=(rot,u,f)=>({ana:{turno:'DÍA'},luis:{turno:'INTERMEDIO'},rosa:{turno:'NOCHE'}}[u]);
  vm.runInContext(leer('js/produccion/66-entrega-turno.js'),sb);
  return sb.window.glacialEntregaTurno;
}
const ana=dispositivo({username:'ana',nombre:'Ana',rol:'Supervisor'},'uid-ana');
const luis=dispositivo({username:'luis',nombre:'Luis',rol:'Supervisor'},'uid-luis');
const jefe=dispositivo({username:'gg',nombre:'Gerente',rol:'Gerente General'},'uid-gg');
const mtto=dispositivo({username:'mtto',nombre:'Mtto',rol:'Mantenimiento compartido'},'uid-mtto');

(async()=>{
  /* ---------- permisos ---------- */
  ok(ana.puedeOperar()&&luis.puedeOperar()&&!jefe.puedeOperar()&&!mtto.puedeOperar(),'entregan y reciben quienes operan Producción; jefatura/gerencia y la cuenta compartida no');
  ok(ana.puedeVer()&&jefe.puedeVer()&&!mtto.puedeVer(),'leen todos con sesión, salvo la cuenta compartida de Mantenimiento (jefatura en modo consulta)');
  ok(ana.idEntrega('2026-10-11','DÍA')==='2026-10-11_DIA'&&ana.idEntrega('2026-10-11','intermedio')==='2026-10-11_INTERMEDIO'&&ana.idEntrega('2026-10-11','NOCHE')==='2026-10-11_NOCHE','id = fecha + _ + turno (DIA, INTERMEDIO, NOCHE)');

  /* ---------- foto del resumen: reutiliza construirDatos ---------- */
  const resumen=await ana.armarResumen('2026-10-11','INTERMEDIO');
  const pet=resumen.lineas.find(l=>l.linea==='PET1');
  ok(resumen.lineas.length===2&&pet.estado==='DETENIDA'&&pet.paradaAbierta===true&&pet.motivosPendientes===2&&pet.producido===600&&pet.programado===1000,'resumen por línea: estado, producido contra programado, parada abierta y motivos pendientes');
  ok(resumen.lineas.find(l=>l.linea==='B7L').paradaAbierta===false&&resumen.motivosPendientes===2&&resumen.totales.producido===1100,'sin parada abierta en la línea en curso; totales y pendientes del turno');

  /* ---------- novedades ---------- */
  const nov=ana.limpiarNovedades([{id:'a',linea:'PET1',texto:'  Falta etiqueta  '},{id:'a',linea:'XX',texto:'otra'},{linea:'B7L',texto:'   '}]);
  ok(nov.length===2&&nov[0].texto==='Falta etiqueta'&&nov[1].linea==='GENERAL'&&nov[0].id!==nov[1].id,'novedades: se descartan las vacías, la línea inválida pasa a GENERAL y los ids son únicos');

  /* ---------- sugerencia por rotación ---------- */
  ok(ana.sugerirEntrante('2026-10-11','DIA','ana')==='Luis'&&ana.sugerirEntrante('2026-10-11','INTERMEDIO','ana')==='Rosa'&&ana.sugerirEntrante('2026-10-11','NOCHE','rosa')==='Ana','sugerencia: DÍA→INTERMEDIO, INTERMEDIO→NOCHE y NOCHE→DÍA (según la rotación)');

  /* ---------- entregar ---------- */
  const r1=await ana.entregar('2026-10-11','INTERMEDIO',resumen,nov);
  const id='2026-10-11_INTERMEDIO',d1=docs.get('entregasTurno/'+id);
  ok(r1.creado&&d1&&d1.estado==='ENTREGADA'&&d1.entregaUid==='uid-ana'&&d1.entregaNombre==='Ana'&&d1.entregadaEn.toMillis()===reloj,'entregar crea el documento con estado ENTREGADA, quién entrega y la hora del servidor');
  const r2=await luis.entregar('2026-10-11','INTERMEDIO',resumen,nov);
  ok(!r2.creado&&docs.get('entregasTurno/'+id).entregaUid==='uid-ana','una segunda entrega del mismo turno no pisa la existente');
  let err='';try{await jefe.entregar('2026-10-11','NOCHE',resumen,nov);}catch(e){err=e.message;}
  ok(err!==''&&!docs.has('entregasTurno/2026-10-11_NOCHE'),'jefatura en consulta no puede entregar');

  /* ---------- tarjeta del Inicio en el otro dispositivo (sin recargar) ---------- */
  luis.escuchar();
  const pend=luis.pendientesPara('uid-luis','2026-10-11');
  ok(pend.length===1&&pend[0].id===id&&pend[0].entregaNombre==='Ana','el otro dispositivo recibe la entrega pendiente en vivo');
  ana.escuchar();
  ok(ana.pendientesPara('uid-ana','2026-10-11').length===0,'quien entregó no ve la tarjeta de entrega pendiente de su propia entrega');
  ok(luis.pendientesPara('uid-luis','2026-10-20').length===0,'una entrega muy antigua deja de aparecer como pendiente');

  /* ---------- corregir mientras siga ENTREGADA ---------- */
  escrituras.length=0;reloj+=60000;
  await ana.corregir(id,[{id:'z',linea:'PET1',texto:'Corregido'}],null);
  const d2=docs.get('entregasTurno/'+id);
  ok(d2.novedades.length===1&&d2.novedades[0].texto==='Corregido'&&d2.actualizaciones.length===1&&d2.actualizadaEn&&d2.estado==='ENTREGADA','quien entregó corrige las novedades; queda actualizadaEn y el registro de actualizaciones');
  const llaves=escrituras.filter(e=>e.tipo==='update').flatMap(e=>e.campos);
  err='';try{await luis.corregir(id,[{linea:'GENERAL',texto:'x'}],null);}catch(e){err=e.message;}
  ok(err!=='','otro usuario no puede corregir la entrega');

  /* ---------- recibir ---------- */
  err='';try{await ana.recibir(id,'');}catch(e){err=e.message;}
  ok(/propia/.test(err)&&docs.get('entregasTurno/'+id).estado==='ENTREGADA','quien entregó no puede recibir su propia entrega');
  escrituras.length=0;reloj+=120000;
  const rr=await luis.recibir(id,'  Todo conforme  ');
  const d3=docs.get('entregasTurno/'+id);
  ok(rr.recibida&&d3.estado==='RECIBIDA'&&d3.recibeUid==='uid-luis'&&d3.recibeNombre==='Luis'&&d3.recibidaEn.toMillis()===reloj&&d3.observacionRecibe==='Todo conforme','recibir escribe estado, quién recibe, hora del servidor y la observación');
  const camposRecibir=escrituras.filter(e=>e.tipo==='update').flatMap(e=>e.campos);
  ana.escuchar();
  const visto=ana.estado().docs.find(d=>d.id===id);
  ok(visto&&visto.estado==='RECIBIDA'&&visto.recibeNombre==='Luis'&&visto.recibidaEnMs===reloj,'el primer dispositivo ve en vivo quién recibió y a qué hora');
  ok(luis.pendientesPara('uid-luis','2026-10-11').length===0,'tras «Recibido» la tarjeta desaparece');
  err='';try{await ana.corregir(id,[{linea:'GENERAL',texto:'tarde'}],null);}catch(e){err=e.message;}
  ok(/recibida/i.test(err)&&docs.get('entregasTurno/'+id).novedades[0].texto==='Corregido','una entrega recibida ya no se puede editar');
  err='';try{await jefe.recibir(id,'');}catch(e){err=e.message;}
  ok(err!=='','jefatura en consulta no puede recibir');
  const rr2=await luis.recibir(id,'');
  ok(rr2.yaRecibida&&rr2.por==='Luis'&&docs.get('entregasTurno/'+id).recibidaEn.toMillis()===reloj,'recibir dos veces no cambia nada: informa quién la recibió');

  /* ---------- la regla de Firestore autoriza exactamente los campos que escribe el código ---------- */
  const reglas=leer('_archivo/firebase/firestore.rules.etapa2.txt');
  const bloque=reglas.slice(reglas.indexOf('match /entregasTurno/{id}'),reglas.indexOf('match /avancesTurnoItems/{id}'));
  const lista=(re)=>{const m=bloque.match(re);return m?m[1].split(',').map(x=>x.replace(/['\s]/g,'')).filter(Boolean):[];};
  const hasOnlyCrear=lista(/create:[^]*?keys\(\)\s*\.hasOnly\(\[([^\]]*)\]/);
  const hasOnlyCorregir=lista(/Corregir[^]*?hasOnly\(\[([^\]]*)\]/);
  const hasOnlyRecibir=lista(/Recibir: otro[^]*?hasOnly\(\[([^\]]*)\]/);
  const crearReal=['fecha','turno','estado','resumen','novedades','entregaUid','entregaPor','entregaNombre','entregadaEn'];
  ok(crearReal.length===hasOnlyCrear.length&&crearReal.every(k=>hasOnlyCrear.includes(k)),'regla: campos permitidos al crear = los que escribe el código');
  ok(['resumen','novedades','actualizadaEn','actualizaciones'].every(k=>hasOnlyCorregir.includes(k))&&llaves.every(k=>hasOnlyCorregir.includes(k)),'regla: al corregir solo resumen, novedades, actualizadaEn y actualizaciones');
  ok(['estado','recibeUid','recibePor','recibeNombre','recibidaEn','observacionRecibe'].every(k=>hasOnlyRecibir.includes(k))&&camposRecibir.every(k=>hasOnlyRecibir.includes(k)),'regla: al recibir solo los campos de recepción');
  ok(/entregaUid != request\.auth\.uid/.test(bloque)&&/entregaUid == request\.auth\.uid/.test(bloque)&&/recibidaEn == request\.time/.test(bloque)&&/entregadaEn == request\.time/.test(bloque)&&/allow delete: if false/.test(bloque),'regla: receptor distinto del que entrega, horas iguales a request.time y sin borrar');
  ok(/puedeOperarProduccion\(\)/.test(bloque)&&/allow read: if autenticado\(\) && !esMantCompartido\(\)/.test(bloque)&&/resource\.data\.estado == 'ENTREGADA'/.test(bloque),'regla: operan quienes operan Producción; leen todos menos la cuenta compartida; solo se cambia mientras sea ENTREGADA');

  /* ---------- pantalla, menú y compatibilidad (fuentes) ---------- */
  const src=leer('js/produccion/66-entrega-turno.js'),html=leer('index.html'),vista=leer('js/accesos/23b-modo-visualizacion.js');
  ok(/id="btn-entrega-turno"/.test(html)&&/goEntregaTurno\(\)/.test(html)&&html.indexOf('btn-entrega-turno')>html.indexOf('btn-resumenes-turno'),'«Entrega de turno» en el grupo Producción del menú');
  ok(/66-entrega-turno\.js\?v=20261011-et1/.test(html)&&html.indexOf('66-entrega-turno.js')>html.indexOf('48-resumen-turno.js')&&html.indexOf('66-entrega-turno.js')>html.indexOf('31-rotacion-supervisores.js'),'index.html carga el módulo después de 48 y 31, con versión nueva');
  ok(/clave:'entrega_turno'/.test(vista)&&/tabs:\['entrega-turno'\]/.test(vista),'modo consulta: la jefatura ve la pantalla desde «Ver como / modo visualización»');
  ok(/where\('fecha','>=',desde\)\.orderBy\('fecha','desc'\)/.test(src),'historial por fecha con where >= y orderBy (sin «in»)');
  ok(!/arrayUnion|arrayRemove|increment\(|array-contains|'in'|'!='|startAfter|endBefore|\.update\(\s*\{\s*['"][a-zA-Z]+\./.test(src),'compatible con el puente de Supabase');
  ok(!/[^.\w]alert\(|[^.\w]confirm\(|[^.\w]prompt\(/.test(src.replace(/\/\*[^]*?\*\//g,'').replace(/\/\/.*$/gm,'')),'sin alert / confirm / prompt (ventanas propias)');
  ok(/escaparHtml/.test(src)&&/const esc=/.test(src)&&!/innerHTML\s*=\s*[^;]*\+\s*d\.entregaNombre/.test(src),'los textos se escapan con escaparHtml antes de mostrarse');
  ok(/id="et-pendiente"/.test(src)&&/data-et-recibir/.test(src)&&/resolverContext|sugerirEntrante/.test(src),'tarjeta «Entrega de turno pendiente» con botón «Recibido» y sugerencia de la rotación');
  ok(!/state\.currentTab===.produccion-actual.[^;]*recibid/i.test(src),'la confirmación no bloquea la operación de las líneas (el módulo no toca Producción Actual)');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
