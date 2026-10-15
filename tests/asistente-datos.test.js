/* Asistente de Producción · capa de datos (js/asistente/71-asistente-datos.js) con un Firestore simulado en memoria.
   Comprueba: permisos por capacidad (rol + permiso / -permiso, modo visualización), idempotencia por opId, libro de movimientos
   inmutable con anulación, recepción de una solicitud que genera UN movimiento por insumo, entrega parcial, conflicto de versión entre
   dos usuarios (prueba 14), confirmar una conciliación dos veces sin descontar dos veces, reabrir anula el consumo, factores con vigencia
   (la versión anterior se cierra; los datos históricos usan su factor) y auditoría de cada operación. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');

/* ---------- Firestore simulado (transacciones con lectura antes de escritura) ---------- */
const SERVER={__server:true};             // un solo marcador para todos los usuarios simulados (comparten la base)
function crearDb(){
  const docs=new Map();let auto=0;
  const resolver=v=>v===SERVER?Date.now():(Array.isArray(v)?v.map(resolver):(v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolver(x)])):v));
  const snap=(id,d)=>({id,exists:d!==undefined,data:()=>d===undefined?undefined:JSON.parse(JSON.stringify(d))});
  const ref=(col,id)=>({path:col+'/'+id,id,col});
  const coleccion=col=>({
    doc:id=>ref(col,id===undefined?'auto'+(++auto):id),
    where(campo,op,valor){const filtros=[[campo,op,valor]];const q={where(c,o,v){filtros.push([c,o,v]);return q;},get:async()=>consulta(col,filtros),onSnapshot(cb){cb(consulta(col,filtros));return ()=>{};}};return q;},
    get:async()=>consulta(col,[]),onSnapshot(cb){cb(consulta(col,[]));return ()=>{};}
  });
  const consulta=(col,filtros)=>({docs:[...docs.entries()].filter(([k])=>k.startsWith(col+'/')).map(([k,d])=>snap(k.slice(col.length+1),d))
    .filter(s=>filtros.every(([c,o,v])=>o==='=='?s.data()[c]===v:o==='>='?s.data()[c]>=v:true))});
  const db={collection:coleccion,docs,
    async runTransaction(fn){
      const escrituras=[];let escribio=false;
      const tx={
        async get(r){if(escribio)throw new Error('Firestore: todas las lecturas deben ir antes de las escrituras');return snap(r.id,docs.get(r.path));},
        set(r,d){escribio=true;escrituras.push([r.path,resolver(d)]);},
        update(r,d){escribio=true;escrituras.push([r.path,{...(docs.get(r.path)||{}),...resolver(d)}]);}
      };
      const res=await fn(tx);
      escrituras.forEach(([p,d])=>docs.set(p,d));
      return res;
    }};
  return {db,SERVER};
}
function entorno(usuario){
  const {db,SERVER}=crearDb();
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,Promise,Error,RegExp};vm.createContext(sb);sb.window=sb;sb.globalThis=sb;
  sb.db=db;sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>SERVER}},auth:()=>({currentUser:{uid:usuario.uid}})};
  sb.state={user:usuario};sb.PERMISOS_APP=[];sb.tienePermiso=()=>false;
  let t=1000;sb.tareoAhoraServidor=()=>++t;
  vm.runInContext(leer('js/asistente/70-asistente-nucleo.js'),sb);
  vm.runInContext(leer('js/asistente/71-asistente-datos.js'),sb);
  return {sb,D:sb.glacialAsistenteDatos,N:sb.glacialAsistenteNucleo,db};
}
const espera=async p=>{try{await p;return null;}catch(e){return e;}};

(async()=>{
  /* ---------- permisos ---------- */
  const {sb,D}=entorno({uid:'u1',rol:'Asistente de Producción',nombre:'Ana',permisos:[]});
  ok(D.capacidad({rol:'Asistente de Producción',permisos:[]},'asistenteProduccion')&&!D.capacidad({rol:'Asistente de Producción',permisos:['-asistenteProduccion']},'asistenteProduccion'),'capacidad: el rol Asistente la trae por defecto; «-permiso» la quita');
  ok(!D.capacidad({rol:'Supervisor',permisos:[]},'asistenteProduccion')&&D.capacidad({rol:'Supervisor',permisos:[]},'ver_asistente')&&D.capacidad({rol:'Supervisor',permisos:['asistenteProduccion']},'asistenteProduccion'),'capacidad: el Supervisor consulta; registrar solo si se le asigna');
  ok(D.capacidad({rol:'Jefe de Producción',permisos:[]},'validarMermas')&&!D.capacidad({rol:'Gerente General',permisos:[]},'validarMermas')&&D.capacidad({rol:'Gerente General',permisos:[]},'ver_asistente'),'capacidad: Jefatura valida mermas; Gerencia solo consulta');
  ok(!D.capacidad({rol:'Asistente de Producción',permisos:[]},'gestionarFactores')&&D.capacidad({rol:'Administrador'},'gestionarFactores'),'prueba 13: el Asistente no modifica factores (solo Administrador o permiso explícito)');
  sb.glacialVista={activo:()=>true};
  ok(!D.capacidad({rol:'Administrador'},'asistenteProduccion')&&!D.capacidad({rol:'Asistente de Producción',permisos:['asistenteProduccion']},'asistenteProduccion'),'modo visualización: ninguna capacidad de escritura');
  delete sb.glacialVista;
  ok(sb.PERMISOS_APP.some(p=>p.key==='asistenteProduccion')&&sb.PERMISOS_APP.some(p=>p.key==='moduloAlmacen'&&p.area==='almacen'),'los permisos nuevos aparecen en Gestión de usuarios (PERMISOS_APP)');
  ok(sb.tienePermiso('asistenteProduccion')&&!sb.tienePermiso('gestionarFactores'),'tienePermiso responde las capacidades del usuario actual');
  const e1=await espera(D.guardarFactor({insumo:'POLIETILENO',linea:'PET1',base:'PALETA',cantidadBase:1,factor:2,vigenteDesde:'2026-01-01'}));
  ok(e1&&e1.codigo==='PERMISO','sin permiso, guardar un factor falla con PERMISO (no escribe)');

  /* ---------- movimientos: idempotencia e inmutabilidad ---------- */
  const m={opId:'op-1',tipo:'CONTEO',insumo:'POLIETILENO',unidad:'kg',cantidad:20,fecha:'2026-10-14',bloque:'DIA'};
  const r1=await D.registrarMovimiento(m),r2=await D.registrarMovimiento(m);
  const movs=()=>[...sb.db.docs.entries()].filter(([k])=>k.startsWith('apMovimientos/')).map(([,d])=>d);
  ok(!r1.duplicado&&r2.duplicado&&movs().length===1,'prueba 14/idempotencia: repetir el mismo opId (doble clic o reintento) no duplica el movimiento');
  const e2=await espera(D.registrarMovimiento({opId:'op-2',tipo:'DEVOLUCION',insumo:'POLIETILENO',unidad:'kg',cantidad:5,cuadro:'k',fecha:'2026-10-14',bloque:'DIA'}));
  ok(e2&&/negativo/.test(e2.message),'una devolución sin saldo registrado queda bloqueada (no hay stock negativo sin autorización)');
  D.cache.movimientos=movs();
  await D.registrarMovimiento({opId:'op-3',tipo:'DEVOLUCION',insumo:'POLIETILENO',unidad:'kg',cantidad:5,cuadro:'k',fecha:'2026-10-14',bloque:'DIA'});
  await D.anularMovimiento('op-3','Devolución duplicada por error');
  await D.anularMovimiento('op-3','Devolución duplicada por error');
  ok(movs().filter(x=>x.tipo==='ANULACION').length===1&&movs().find(x=>x.opId==='op-3').cantidad===5,'anular crea UN movimiento ANULACION (el original no se edita ni se borra)');
  ok((await espera(D.anularMovimiento('op-1','x')))!==null,'anular exige motivo (mínimo 5 caracteres)');

  /* ---------- solicitudes: entrega parcial, recepción y conflicto ---------- */
  const id=await D.crearSolicitud({fecha:'2026-10-14',bloque:'DIA',items:[{insumo:'POLIETILENO',unidad:'kg',solicitado:12},{insumo:'CARTON',unidad:'plancha',solicitado:250}],enviar:true});
  const sol=()=>sb.db.docs.get('apSolicitudes/'+id);
  ok(sol().estado==='SOLICITADA'&&sol().version===1&&sol().historial.length===1,'el Asistente crea y envía la solicitud (versión 1, historial)');
  ok((await espera(D.cambiarEstadoSolicitud(id,'EN_PREPARACION',1)))?.codigo==='PERMISO','el Asistente NO prepara ni entrega (es de Almacén)');
  const alm=entorno({uid:'u2',rol:'Personalizado',nombre:'Luis',permisos:['moduloAlmacen']});alm.sb.db.docs=sb.db.docs;alm.D.cache.movimientos=[];
  // misma base de datos para ambos usuarios
  alm.sb.db.runTransaction=sb.db.runTransaction;alm.sb.db.collection=sb.db.collection;
  await alm.D.cambiarEstadoSolicitud(id,'EN_PREPARACION',1);
  const eConf=await espera(alm.D.cambiarEstadoSolicitud(id,'ENTREGADA',1,{entregas:{POLIETILENO:12}}));
  ok(eConf&&eConf.codigo==='CONFLICTO','prueba 14: un segundo usuario con la versión vieja recibe CONFLICTO (no pisa lo guardado)');
  await alm.D.cambiarEstadoSolicitud(id,'ENTREGADA',2,{entregas:{POLIETILENO:12,CARTON:100}});
  ok(sol().estado==='ENTREGADA_PARCIAL'&&sol().items[1].entregado===100,'prueba 4: entrega parcial → «Entregada parcialmente»');
  ok(!movs().some(x=>x.tipo==='RECEPCION'),'la entrega de Almacén por sí sola NO suma existencias en Producción');
  const eRec=await espera(D.cambiarEstadoSolicitud(id,'RECIBIDA',3,{recepciones:{POLIETILENO:12}}));
  ok(eRec&&/cuadro/.test(eRec.message),'recibir exige el cuadro al que se destina el material');
  await D.cambiarEstadoSolicitud(id,'RECIBIDA',3,{recepciones:{POLIETILENO:12,CARTON:100},cuadro:'2026-10-14|DIA|PET1|scala|2.5l',linea:'PET1'});
  const rec=movs().filter(x=>x.tipo==='RECEPCION');
  ok(rec.length===2&&rec.find(x=>x.insumo==='POLIETILENO').cantidad===12&&rec.every(x=>x.solicitudId===id),'la recepción crea UN movimiento RECEPCION por insumo, ligado a la solicitud');
  ok(sol().items.every(i=>i.recibido===i.entregado)&&sol().historial.length===4&&sol().estado==='ENTREGADA_PARCIAL','lo recibido queda en la solicitud, el historial crece y sigue «Entregada parcialmente» (falta cartón)');

  /* ---------- mermas ---------- */
  const mid=await D.registrarMerma({id:'mer-1',fecha:'2026-10-14',bloque:'DIA',linea:'PET1',cuadro:'k',categoria:'MATERIAL',insumo:'PREFORMA',unidad:'UND',cantidad:24,causa:'Arranque de línea'});
  await D.registrarMerma({id:'mer-1',fecha:'2026-10-14',bloque:'DIA',linea:'PET1',cuadro:'k',categoria:'MATERIAL',insumo:'PREFORMA',unidad:'UND',cantidad:24,causa:'Arranque de línea'});
  ok([...sb.db.docs.keys()].filter(k=>k.startsWith('apMermas/')).length===1&&sb.db.docs.get('apMermas/'+mid).estado==='PENDIENTE','una merma se registra una sola vez y queda Pendiente');
  ok((await espera(D.validarMerma(mid,'VALIDADA',1)))?.codigo==='PERMISO','el Asistente no valida mermas');
  const jefe=entorno({uid:'u3',rol:'Jefe de Producción',nombre:'Rosa',permisos:[]});jefe.sb.db.runTransaction=sb.db.runTransaction;jefe.sb.db.collection=sb.db.collection;
  await jefe.D.validarMerma(mid,'VALIDADA',1);
  ok(sb.db.docs.get('apMermas/'+mid).estado==='VALIDADA'&&sb.db.docs.get('apMermas/'+mid).validadoPor==='Rosa','Jefe de Producción valida la merma (queda quién y cuándo)');
  ok((await espera(jefe.D.validarMerma(mid,'RECHAZADA',2,'cambio de opinión')))!==null,'una merma ya validada no se vuelve a cambiar');

  /* ---------- conciliación: confirmar no descuenta dos veces; reabrir anula ---------- */
  const c={fecha:'2026-10-14',bloque:'DIA',linea:'PET1',cuadro:'2026-10-14|DIA|PET1|scala|2.5l',insumo:'POLIETILENO',unidad:'kg',saldoInicial:2,saldoFinal:1.5,observaciones:'Revisar diferencia',real:12.5};
  await D.guardarConciliacion(c,'BORRADOR',0);
  await D.guardarConciliacion(c,'ENVIAR',1);
  ok((await espera(D.guardarConciliacion(c,'CONFIRMAR',2)))?.codigo==='PERMISO','el Asistente no confirma su propia conciliación');
  await jefe.D.guardarConciliacion(c,'CONFIRMAR',2);
  ok((await espera(jefe.D.guardarConciliacion(c,'CONFIRMAR',3)))!==null,'una conciliación confirmada no se confirma otra vez');
  const cons=()=>movs().filter(x=>x.tipo==='CONSUMO');
  ok(cons().length===1&&cons()[0].cantidad===12.5,'confirmar registra UN movimiento CONSUMO (12.5 kg) para el cuadro e insumo');
  ok((await espera(D.guardarConciliacion({...c,saldoFinal:0},'BORRADOR',3)))!==null,'confirmada, el Asistente no puede editar los saldos');
  await jefe.D.guardarConciliacion({...c,nota:'Saldo final mal contado'},'REABRIR',3);
  const anul=movs().filter(x=>x.tipo==='ANULACION'&&x.anulaA===cons()[0].opId);
  ok(anul.length===1,'reabrir anula el consumo anterior (no se borra)');
  await D.guardarConciliacion({...c,saldoFinal:1},'ENVIAR',4);
  await jefe.D.guardarConciliacion({...c,saldoFinal:1,real:13},'CONFIRMAR',5);
  const N=entorno({uid:'x',rol:'x'}).N;
  ok(cons().length===2&&N.red(N.saldoInsumo(movs(),'POLIETILENO').utilizable,4)===N.red(20+12-13,4),'tras reabrir y confirmar de nuevo el stock descuenta SOLO el consumo vigente (20 conteo + 12 recibido − 13)');

  /* ---------- factores con vigencia ---------- */
  const adm=entorno({uid:'u4',rol:'Administrador',nombre:'Admin'});adm.sb.db.runTransaction=sb.db.runTransaction;adm.sb.db.collection=sb.db.collection;
  const f1=await adm.D.guardarFactor({insumo:'POLIETILENO',linea:'PET1',base:'PALETA',cantidadBase:1,factor:1.89,vigenteDesde:'2020-01-01'});
  ok((await espera(adm.D.guardarFactor({insumo:'POLIETILENO',linea:'PET1',base:'PALETA',cantidadBase:1,factor:2,vigenteDesde:'2020-01-01'})))?.codigo==='CONFLICTO','no se crean dos factores con la misma clave y fecha de inicio');
  const f2=await adm.D.guardarFactor({insumo:'POLIETILENO',linea:'PET1',base:'PALETA',cantidadBase:1,factor:2.1,vigenteDesde:'2026-10-01'},f1);
  const fs1=sb.db.docs.get('apFactores/'+f1),fs2=sb.db.docs.get('apFactores/'+f2);
  ok(fs1.vigenteHasta==='2026-09-30'&&fs1.factor===1.89&&fs2.factor===2.1&&fs1.version===2,'nueva versión: la anterior conserva su valor y cierra su vigencia el día anterior');
  const lista=[fs1,fs2];
  ok(N.factorVigente(lista,{insumo:'POLIETILENO',linea:'PET1',marca:'x',presentacion:'y',fecha:'2026-09-15'}).factor.factor===1.89&&N.factorVigente(lista,{insumo:'POLIETILENO',linea:'PET1',marca:'x',presentacion:'y',fecha:'2026-10-14'}).factor.factor===2.1,'prueba 15: un día histórico usa el factor de su fecha');

  /* ---------- auditoría ---------- */
  const aud=[...sb.db.docs.entries()].filter(([k])=>k.startsWith('apAuditoria/')).map(([,d])=>d);
  ok(aud.length>=15&&aud.every(a=>a.uid&&a.operacion&&a.en)&&aud.some(a=>a.coleccion==='apFactores'&&a.operacion==='CERRAR_VIGENCIA'&&a.antes&&a.antes.factor===1.89),'cada operación deja auditoría (usuario, operación, antes y después)');
  ok(!JSON.stringify([...sb.db.docs.values()]).includes('__server'),'ningún documento guarda marcadores de hora del servidor serializados (se resuelven al escribir)');

  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
