/* Reclasificar paradas: agrupar descripciones parecidas, sugerencia, documento por parada con versión e historial, permisos, la parada original intacta,
   aplicación en Análisis de paradas (mismos minutos) y reglas de Firestore. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}

/* ---------- Firestore falso: documentos, transacciones, where de rango por fecha, onSnapshot ---------- */
const docs=new Map();const oyentes=[];let transacciones=0,escrituras=[];
const TS='__SERVER_TS__';
const resolverTs=(d,t)=>{const o={};Object.keys(d).forEach(k=>{o[k]=d[k]===TS?t:d[k];});return o;};
const refDoc=(c,id)=>({__k:c+'/'+id,__c:c,__id:id});
const db={collection:c=>({doc:id=>refDoc(c,id),
    where(){const cond=[[...arguments]];const enc={where(){cond.push([...arguments]);return enc;},onSnapshot(cb){
      const f=()=>{const lista=[...docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.slice(c.length+1),data:()=>clon(v)}))
        .filter(d=>cond.every(([campo,op,val])=>{const x=d.data()[campo];return op==='>='?x>=val:op==='<='?x<=val:op==='=='?x===val:true;}));cb({docs:lista});};
      oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}};return enc;}}),
  runTransaction:async fn=>{transacciones++;const w=[];const tx={get:async r=>({exists:docs.has(r.__k),data:()=>clon(docs.get(r.__k))}),set:(r,d)=>w.push([r,d])};
    const res=await fn(tx);w.forEach(([r,d])=>{escrituras.push(r.__k);docs.set(r.__k,resolverTs(clon(d),1700000000000));});oyentes.slice().forEach(f=>f());return res;}};

function dispositivo(usuario,opc){
  opc=opc||{};
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setInterval:()=>0,clearInterval(){},db};
  vm.createContext(sb);sb.window=sb;sb.state={user:usuario,currentTab:'x'};sb.glacialCierresSesion=[];sb.tareoAhoraServidor=()=>1700000000000;
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>TS}}};
  sb.esMantCompartido=u=>String((u||sb.state.user).rol)==='mantenimiento_compartido';sb.esUsuarioSoloConsulta=u=>['Gerente General'].includes(u.rol);
  sb.puedeGestionarRotacionMtto=()=>!!opc.supervisor;sb.glacialEstadoDatos={enLinea:opc.sinConexion?false:true};
  const supervisor=!!opc.supervisor||usuario.rol==='Administrador';
  sb.glacialIntervenciones={permisos:()=>({ver:true,escribir:supervisor||sb.esMantCompartido(),puedeCorregir:supervisor,consulta:false}),
    quienActua:()=>({nombre:usuario.nombre||usuario.username,uid:opc.sinUid?'':'uid_'+usuario.username,cuenta:usuario.username})};
  vm.runInContext(leer('js/mantenimiento/37c-equipos-catalogo.js'),sb);
  vm.runInContext(leer('js/mantenimiento/37e-motivos-parada.js'),sb);
  vm.runInContext(leer('js/mantenimiento/67g-reclasificacion-datos.js'),sb);
  return sb;
}
(async()=>{
  const adm=dispositivo({rol:'Administrador',username:'adm',nombre:'Admin'});
  const C=adm.glacialReclasificaciones;

  /* ---------- agrupar y sugerir ---------- */
  const k=t=>C.claveGrupo(t);
  ok(k('parada por env')===k('parad por env')&&k('parad por env')===k('Parada por  envasadora')&&k('PARADA POR ENVASADORA')===k('parada por env'),'«parada por env», «parad por env» y «parada por envasadora» caen en el mismo grupo');
  ok(k('calibración env')!==k('parada por env')&&k('Calibración env')===k('calibracion  ENV')&&k('calibración env')==='calibracion envasadora','minúsculas, sin tildes ni espacios dobles; «env» = «envasadora» solo para agrupar');
  ok(C.sugerirCausa('falta de agua en planta').causa==='Servicios (agua, aire comprimido, energía)'&&C.sugerirCausa('calibración envasadora').causa==='Ajuste o calibración'&&C.sugerirCausa('falla del motor').causa==='Falla de máquina'&&C.sugerirCausa('sin preformas').causa==='Falta de insumos'&&C.sugerirCausa('xyz abc')===null,'sugiere una causa según el texto (o ninguna)');
  const s=C.sugerirCausa('falta de agua');ok(s.motivo===''||typeof s.motivo==='string','la sugerencia no guarda nada: solo devuelve una causa');
  const it=(x)=>Object.assign({id:'avp_1',clasif:'NO_PROGRAMADA',origen:'AVANCE',causa:'Otro',motivoCat:'',motivo:'parada por env',minutos:20},x);
  ok(C.esCandidata(it())&&C.esCandidata(it({causa:''}))&&C.esCandidata(it({causa:'Falla de máquina'}))&&!C.esCandidata(it({causa:'Falla de máquina',motivoCat:'Falla de máquina'}))&&C.esCandidata(it({causa:'Otro',motivoCat:'Otro'}))&&!C.esCandidata(it({id:''}))&&!C.esCandidata(it({clasif:'PROGRAMADA'}))&&!C.esCandidata(it({origen:'BOTON'})),'candidatas: causa «Otro», vacía o sin motivo de catálogo; con id; solo Avance y Nuevo registro');
  ok(C.idDoc('reg:abc/1:0:paradasNoProgramadas:2')==='reg:abc_1:0:paradasNoProgramadas:2','el id del documento no lleva «/»');

  /* ---------- crear, versionar, historial ---------- */
  const paradas=[{paradaId:'avp_1',origen:'AVANCE',linea:'PET1',fecha:'2026-10-05',turno:'DÍA',minutos:20,descripcion:'parada por env',original:{causa:'Otro',motivo:'',detalle:'',equipo:''}},
                 {paradaId:'reg:r1:0:paradasNoProgramadas:1',origen:'REGISTRO',linea:'PET1',fecha:'2026-10-06',turno:'DÍA',minutos:35,descripcion:'parad por env',original:{causa:'',motivo:'',detalle:'',equipo:''}}];
  const valores={causa:'Falta de insumos',motivo:'Falta de paletas',detalle:'',equipo:'',razon:'Revisión del historial'};
  const r1=await C.reclasificar(paradas,valores);
  ok(transacciones===1&&r1.creadas===2&&escrituras.length===2&&escrituras.every(k=>k.startsWith('reclasificacionesParada/')),'reclasificar un grupo es UNA transacción y solo escribe en reclasificacionesParada (el registro original no se toca)');
  const d1=docs.get('reclasificacionesParada/avp_1');
  ok(d1.version===1&&d1.historial.length===1&&d1.causa==='Falta de insumos'&&d1.motivo==='Falta de paletas'&&d1.actualizadaUid==='uid_adm'&&d1.actualizadaEn===1700000000000&&d1.minutos===20&&d1.descripcionOriginal==='parada por env','versión 1, una entrada de historial, autor y hora del servidor; guarda minutos y descripción original');
  const h=d1.historial[0];
  ok(h.por==='Admin'&&h.uid==='uid_adm'&&h.antes.causa==='Otro'&&h.despues.causa==='Falta de insumos'&&h.razon==='Revisión del historial'&&/^h_/.test(h.id),'el historial guarda quién, cuándo, el valor anterior, el nuevo, el motivo y un id');
  ok(!!docs.get('reclasificacionesParada/reg:r1:0:paradasNoProgramadas:1'),'una parada de Nuevo registro usa el id estable registro:cuadro:lista:fila');
  const r2=await C.reclasificar([paradas[0]],{causa:'Servicios (agua, aire comprimido, energía)',motivo:'Falta de presión de aire',detalle:'compresor 2',equipo:'',razon:'Corrección tras revisar'});
  const d2=docs.get('reclasificacionesParada/avp_1');
  ok(r2.actualizadas===1&&d2.version===2&&d2.historial.length===2&&d2.historial[0].id===d1.historial[0].id&&d2.historial[1].antes.causa==='Falta de insumos'&&d2.historial[1].antes.motivo==='Falta de paletas'&&d2.historial[1].despues.motivo==='Falta de presión de aire','cada cambio sube la versión, agrega una entrada con el valor anterior y no toca las anteriores');
  ok(d2.minutos===20&&d2.linea==='PET1'&&d2.fecha==='2026-10-05'&&d2.paradaId==='avp_1','los campos de origen no cambian');

  /* ---------- validaciones y permisos ---------- */
  const rechaza=async(f,re,t)=>{let m='';try{await f();}catch(e){m=e.message;}ok(re.test(m),t);};
  const antesEsc=escrituras.length;
  await rechaza(()=>C.reclasificar(paradas,Object.assign({},valores,{causa:'Otro',motivo:'Otro',detalle:'corto'})),/mínimo 10/,'«Otro» sin detalle suficiente no se guarda');
  await rechaza(()=>C.reclasificar(paradas,Object.assign({},valores,{razon:'ok'})),/motivo de la reclasificación/,'el motivo de la reclasificación es obligatorio');
  await rechaza(()=>C.reclasificar(paradas,Object.assign({},valores,{causa:'Falla de máquina',motivo:'Falla de máquina',equipo:''})),/equipo/i,'una causa que pide equipo exige el equipo');
  await rechaza(()=>C.reclasificar([],valores),/No hay paradas/,'sin paradas no hay nada que guardar');
  const okEq=await C.reclasificar([paradas[1]],Object.assign({},valores,{causa:'Falla de máquina',motivo:'Falla de máquina',equipo:'Envasadora'}));
  ok(docs.get('reclasificacionesParada/reg:r1:0:paradasNoProgramadas:1').equipo==='Envasadora'&&okEq.actualizadas===1,'con el equipo indicado se guarda');
  await C.reclasificar([paradas[1]],Object.assign({},valores,{causa:'Falta de insumos',motivo:'Falta de insumos',equipo:'Envasadora'}));
  ok(docs.get('reclasificacionesParada/reg:r1:0:paradasNoProgramadas:1').equipo==='','si la causa no pide equipo, el equipo no se guarda');
  ok(escrituras.length>antesEsc,'las operaciones válidas sí escriben');
  const comp=dispositivo({rol:'mantenimiento_compartido',username:'mant',nombre:'Cuenta Mantenimiento'});
  await rechaza(()=>comp.glacialReclasificaciones.reclasificar(paradas,valores),/Solo el Supervisor de Mantenimiento/,'un técnico con la cuenta compartida no puede reclasificar');
  ok(!comp.glacialReclasificaciones.puedeReclasificar()&&!comp.glacialReclasificaciones.puedeVer(),'la cuenta compartida no ve ni usa la pantalla');
  const jef=dispositivo({rol:'Gerente General',username:'jef',nombre:'Gerente'});
  await rechaza(()=>jef.glacialReclasificaciones.reclasificar(paradas,valores),/Solo el Supervisor de Mantenimiento/,'jefatura / consulta no reclasifica');
  const sup=dispositivo({rol:'Supervisor',username:'sm',nombre:'Sup Mtto'},{supervisor:true});
  ok(sup.glacialReclasificaciones.puedeReclasificar(),'el Supervisor de Mantenimiento sí');
  await rechaza(()=>dispositivo({rol:'Administrador',username:'a2',nombre:'A2'},{sinConexion:true}).glacialReclasificaciones.reclasificar(paradas,valores),/Sin conexión/,'sin conexión no se guarda y se avisa');
  await rechaza(()=>dispositivo({rol:'Administrador',username:'a3',nombre:'A3'},{sinUid:true}).glacialReclasificaciones.reclasificar(paradas,valores),/sesión segura/,'sin sesión segura no hay autor: no se guarda');

  /* ---------- lectura en vivo y aplicación ---------- */
  const otro=dispositivo({rol:'Administrador',username:'adm2',nombre:'Admin 2'});
  otro.glacialReclasificaciones.asegurarRango('2026-10-01','2026-10-10');
  ok(otro.glacialReclasificaciones.de('avp_1')&&otro.glacialReclasificaciones.de('avp_1').version===2&&otro.glacialReclasificaciones.estado().n===2,'otro dispositivo lee lo reclasificado del rango');
  otro.glacialReclasificaciones.asegurarRango('2026-10-07','2026-10-08');
  ok(otro.glacialReclasificaciones.estado().desde==='2026-10-01','pedir un rango contenido no cambia la lectura');
  await C.reclasificar([paradas[0]],{causa:'Falta de insumos',motivo:'Falta de paletas',detalle:'',equipo:'',razon:'Tercera revisión'});
  ok(otro.glacialReclasificaciones.de('avp_1').version===3,'al reclasificar, el otro dispositivo se entera al instante (onSnapshot)');
  const orig={id:'avp_1',clasif:'NO_PROGRAMADA',origen:'AVANCE',causa:'Otro',motivoCat:'',detalle:'',equipo:'',motivo:'parada por env',minutos:20};
  const ap=otro.glacialReclasificaciones.aplicar(orig);
  ok(ap.reclasificada&&ap.causa==='Falta de insumos'&&ap.motivoCat==='Falta de paletas'&&ap.minutos===20&&ap.original.causa==='Otro'&&ap.motivo==='parada por env'&&orig.causa==='Otro'&&!orig.reclasificada,'aplicar devuelve una copia con la etiqueta nueva y el original visible; la parada original no se modifica y los minutos son los mismos');
  const sin={id:'avp_zzz',causa:'Otro',minutos:5};
  ok(otro.glacialReclasificaciones.aplicar(sin)===sin&&otro.glacialReclasificaciones.aplicar({causa:'x'}).reclasificada===undefined,'sin reclasificación la parada pasa igual');

  /* ---------- Análisis de paradas (47): mismos minutos, otra etiqueta ---------- */
  const s47=leer('js/produccion/47-analisis-paradas.js');
  const sb2={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp};vm.createContext(sb2);sb2.window={glacialEquipos:{esFalla:x=>adm.glacialMotivosParada.pideEquipo(x)}};
  vm.runInContext('const SIN_TECNICO="Sin técnico";const nombreLinea=x=>x;const num=n=>Number(n)||0;const esc=t=>String(t==null?"":t);const fmt=n=>String(Math.round(num(n)));const fmtFecha=f=>f;'+extraer(s47,'equipoDeParada')+extraer(s47,'etiquetaMotivo')+extraer(s47,'causaDeParada')+extraer(s47,'motivoDeParada')+extraer(s47,'armarPareto')+extraer(s47,'bloqueReclasificadas')+'this.f=armarPareto;this.b=bloqueReclasificadas;',sb2);
  const otro2=Object.assign({},orig,{id:'avp_9',minutos:30,motivo:'otra'});
  const mk=x=>Object.assign({},x);
  const unidadSin=[{linea:'PET1',turno:'DÍA',ajusteNp:0,ajusteProg:0,pItems:[],npItems:[mk(orig),mk(otro2)]}];
  const unidadCon=[{linea:'PET1',turno:'DÍA',fecha:'2026-10-05',ajusteNp:0,ajusteProg:0,pItems:[],npItems:[otro.glacialReclasificaciones.aplicar(orig),mk(otro2)]}];
  const p0=sb2.f(unidadSin,{agrupar:'causa',metrica:'minutos'}),p1=sb2.f(unidadCon,{agrupar:'causa',metrica:'minutos'});
  ok(p0.filas.length===1&&p0.filas[0].clave==='Otro'&&p1.filas.length===2&&p1.filas.find(f=>f.clave==='Falta de insumos').minutos===20&&p1.filas.find(f=>f.clave==='Otro').minutos===30,'el Pareto agrupa por la causa reclasificada');
  ok(p0.totalItemsMin===50&&p1.totalItemsMin===50&&p0.totalMin===p1.totalMin,'los minutos totales no cambian al reclasificar');
  const pm=sb2.f(unidadCon,{agrupar:'motivo',metrica:'minutos'});
  ok(pm.filas.some(f=>f.clave==='Falta de insumos › Falta de paletas'),'agrupar por motivo usa causa › motivo reclasificados');
  const blq=sb2.b(unidadCon);
  ok(/reclasificada/.test(blq)&&/Original: «parada por env»/.test(blq)&&sb2.b(unidadSin)==='','Análisis muestra las reclasificadas con la marca y el original; sin ellas no muestra nada');

  /* ---------- pantalla (67h): grupos y contadores ---------- */
  const sbp={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setInterval:()=>0,setTimeout,clearTimeout};vm.createContext(sbp);sbp.window=sbp;
  sbp.document={addEventListener(){},getElementById:()=>null,querySelector:()=>null,body:{}};sbp.tareoAhoraServidor=()=>1700000000000;
  sbp.glacialMantPestanas=[];sbp.glacialReclasificaciones=otro.glacialReclasificaciones;sbp.glacialMantUI={};
  const unidades=[{linea:'PET1',fecha:'2026-10-05',turno:'DÍA',npItems:[
      Object.assign({},orig,{id:'a1',minutos:20,motivo:'parada por env'}),Object.assign({},orig,{id:'a2',minutos:15,motivo:'parad por env'}),
      Object.assign({},orig,{id:'a3',minutos:40,motivo:'Falta de agua',causa:''}),Object.assign({},orig,{id:'a4',minutos:10,motivo:'bien',causa:'Falla de máquina',motivoCat:'Falla de máquina'}),
      Object.assign({},orig,{id:'a5',minutos:12,origen:'BOTON'}),otro.glacialReclasificaciones.aplicar(Object.assign({},orig,{id:'avp_1',minutos:20}))]}];
  sbp.glacialAnalisisParadas={listarUnidades:()=>({unidades,sinInicio:0})};
  vm.runInContext(leer('js/mantenimiento/67h-reclasificacion-pantalla.js'),sbp);
  const cal=sbp.glacialReclasificarPantalla.calcular();
  ok(cal.grupos.length===2&&cal.grupos[0].etiqueta==='Falta de agua'&&cal.grupos[0].min===40&&cal.grupos[1].filas.length===2&&cal.grupos[1].min===35,'agrupa las pendientes (la ya clasificada, la de botón y la que ya tiene motivo de catálogo no entran)');
  ok(cal.pendMin===75&&cal.pendN===3&&cal.reclMin===20&&cal.reclN===1&&cal.recl[0].original.causa==='Otro','contadores: minutos sin clasificar y reclasificados del rango');
  ok(cal.grupos[0].sugerencia&&cal.grupos[0].sugerencia.causa==='Servicios (agua, aire comprimido, energía)'&&cal.grupos[1].sugerencia===null,'cada grupo trae su sugerencia (o ninguna), sin guardar nada');
  ok(sbp.glacialMantPestanas.length===1&&sbp.glacialMantPestanas[0].clave==='reclasificar'&&typeof sbp.glacialMantPestanas[0].visible==='function'&&sbp.glacialMantPestanas[0].visible()===true,'la pestaña «Reclasificar paradas» se registra solo para quien puede reclasificar');

  /* ---------- fuentes: reglas, ids, index ---------- */
  const reglas=leer('firestore.rules.etapa2.txt'),i0=reglas.indexOf('match /reclasificacionesParada/{id}'),blqR=reglas.slice(i0,reglas.indexOf('// Entrega de turno entre supervisores',i0));
  ok(i0>0&&/allow read: if puedeLeerBitacoraMtto\(\)/.test(blqR)&&/allow create: if esSupervisorMtto\(\)/.test(blqR)&&/allow update: if esSupervisorMtto\(\)/.test(blqR)&&/allow delete: if false/.test(blqR),'regla: leen quienes ven la bitácora; escriben el Supervisor de Mantenimiento y el Administrador; nadie borra');
  ok(/version == 1/.test(blqR)&&/version == resource\.data\.version \+ 1/.test(blqR)&&/historial\.size\(\) == 1/.test(blqR)&&/historial\.size\(\) == resource\.data\.historial\.size\(\) \+ 1/.test(blqR)&&/historial\[0:resource\.data\.historial\.size\(\)\] == resource\.data\.historial/.test(blqR)&&/actualizadaEn == request\.time/.test(blqR)&&/hasAny\(\['id', 'paradaId', 'origen', 'linea', 'fecha'/.test(blqR),'regla: versión, hora y uid del servidor, historial +1 sin tocar las entradas anteriores, campos de origen fijos');
  const s23=leer('js/produccion/23b-tiempos-linea.js'),html=leer('index.html');
  ok(/id:String\(p\.id\|\|\('reg:'\+\(r\.id\|\|'legacy'\)\+':'\+qi\+':'\+k\+':'\+pi\)\)/.test(s23)&&(s23.match(/id:s\.id\|\|''/g)||[]).length===2,'23b entrega el id de cada parada (el mismo de Avance/Cierre para Nuevo registro) sin cambiar minutos');
  const pos=n=>html.indexOf(n);
  ok(pos('67g-reclasificacion-datos.js')>pos('67b-intervenciones-datos.js')&&pos('67g-reclasificacion-datos.js')>pos('37e-motivos-parada.js')&&pos('67h-reclasificacion-pantalla.js')>pos('67g-reclasificacion-datos.js')&&pos('67h-reclasificacion-pantalla.js')>pos('67c-intervenciones-pantalla.js')&&pos('67h-reclasificacion-pantalla.js')>pos('47-analisis-paradas.js')&&/67g-reclasificacion-datos\.js\?v=20261012-rc1/.test(html),'index.html: 67g y 67h cargan después de 67b, 67c, 37e y 47');
  const f67=leer('js/mantenimiento/67g-reclasificacion-datos.js')+leer('js/mantenimiento/67h-reclasificacion-pantalla.js');
  ok(!/[^.\w]alert\(|[^.\w]confirm\(|[^.\w]prompt\(/.test(f67.replace(/\/\/.*$/gm,''))&&!/arrayUnion|increment\(|array-contains|'!='|\.update\(/.test(f67.replace(/\/\*[^]*?\*\//g,'')),'sin alert/confirm/prompt y compatible con el puente de Supabase');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
