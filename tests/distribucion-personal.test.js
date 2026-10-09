/* Distribución de personal por línea: fuente compartida, consulta al corte, horas hombre, versión, reintentos y permisos. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-08';
const ms=(h,m,dia)=>new Date(2026,9,dia||8,h,m||0).getTime();

/* ---- Firestore simulado con transacciones optimistas (reintenta si otro guardó antes) ---- */
function fakeDb(){
  const docs=new Map(),vers=new Map();let ts=1000;
  const norm=(o)=>JSON.parse(JSON.stringify(o,(k,v)=>v&&v.__ts?'__TS__':v));
  const mkref=p=>({path:p,collection:n=>({doc:id=>mkref(p+'/'+n+'/'+id)}),id:p.split('/').pop(),
    async get(){return {exists:docs.has(p),data:()=>docs.has(p)?JSON.parse(JSON.stringify(docs.get(p))):undefined};}});
  const db={docs,
    collection:n=>({doc:id=>mkref(n+'/'+id)}),
    async runTransaction(fn){
      for(let intento=0;intento<5;intento++){
        const lecturas=new Map(),escrituras=[];
        const tx={
          async get(r){await Promise.resolve();lecturas.set(r.path,vers.get(r.path)||0);return {exists:docs.has(r.path),data:()=>docs.has(r.path)?JSON.parse(JSON.stringify(docs.get(r.path))):undefined};},
          set(r,d){escrituras.push([r.path,d]);}
        };
        await fn(tx);
        await Promise.resolve();
        let limpio=true;lecturas.forEach((v,p)=>{if((vers.get(p)||0)!==v)limpio=false;});
        if(!limpio)continue;
        escrituras.forEach(([p,d])=>{const x=JSON.parse(JSON.stringify(d,(k,v)=>v&&v.__ts?ts++:v));docs.set(p,x);vers.set(p,(vers.get(p)||0)+1);});
        return;
      }
      throw new Error('transacción sin resolver');
    }};
  return db;
}
function entorno(usuario){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,Infinity,isFinite};
  vm.createContext(sb);sb.window=sb;
  sb.db=fakeDb();
  sb.firebase={auth:()=>({currentUser:{uid:usuario.uid||'u1'}}),firestore:{FieldValue:{serverTimestamp:()=>({__ts:true})}}};
  sb.state={user:usuario};
  sb.tareoAhoraServidor=()=>sb.ahora;sb.ahora=ms(12);
  sb.glacialCierresSesion=[];
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  // permisos reales de 02-estado
  const s02=leer('js/nucleo/02-estado.js');
  const a=s02.indexOf('const ROLES_DISTRIBUCION_PERSONAL'),b=s02.indexOf('function tienePermiso(permiso)');
  vm.runInContext(s02.slice(a,b)+'function tienePermiso(p){return p===\'distribuirPersonal\'?distribucionPersonalPermitida(state.user):false;}',sb);
  vm.runInContext(leer('js/personal/43-distribucion-personal.js'),sb);
  return sb;
}
const sup={rol:'Supervisor',uid:'u1',nombre:'Ana',username:'ana',permisos:['nuevo']};
let sb=entorno(sup);const D=()=>sb.glacialDistribucionPersonal;
const L=(o)=>Object.assign({PET1:null,PET2:null,B7L:null,C20L:null,B20L:null},o);
let n=0;const entrada=(o)=>Object.assign({opId:'op'+(++n),versionEsperada:0,desdeMs:ms(7),lineas:L({B7L:8}),motivo:''},o);

/* 1) sin confirmar frente a cero confirmado */
let r=D().normalizarLineas({PET1:'',PET2:0,B7L:'5',C20L:null});
ok(r.lineas.PET1===null&&r.lineas.PET2===0&&r.lineas.B7L===5&&r.lineas.B20L===null&&r.errores.length===0,'vacío = sin confirmar (null); 0 = cero confirmado; entero válido');
ok(D().normalizarLineas({PET1:-1}).errores.length===1&&D().normalizarLineas({PET1:2.5}).errores.length===1&&D().normalizarLineas({PET1:'abc'}).errores.length===1,'negativos, decimales y texto se rechazan');
const ev=[{opId:'a',version:1,desdeMs:ms(7),lineas:L({B7L:0,PET1:4})}];
ok(D().personalAlCorte(ev,'B7L',ms(9)).estado==='CONFIRMADO'&&D().personalAlCorte(ev,'B7L',ms(9)).cantidad===0,'B7L confirmado en 0: «Personal en línea: 0»');
ok(D().personalAlCorte(ev,'PET2',ms(9)).estado==='PENDIENTE'&&D().personalAlCorte(ev,'PET2',ms(9)).cantidad===null,'PET2 sin confirmar: «Personal pendiente de confirmar» (no 0)');
ok(D().personalAlCorte(ev,'PET1',ms(6)).estado==='PENDIENTE','antes de la primera confirmación no hay dato');

/* 2) 36 h-h */
const dos=[{opId:'a',version:1,desdeMs:ms(7),lineas:L({B7L:8})},{opId:'b',version:2,desdeMs:ms(10),lineas:L({B7L:6})}];
let h=D().horasHombre(dos,'B7L',ms(7),ms(12));
ok(Math.abs(h.horas-36)<1e-9&&h.estado==='COMPLETO'&&h.cobertura===1,'8 personas 07:00–10:00 + 6 personas 10:00–12:00 = 24 + 12 = 36 h-h');
ok(Math.abs(D().horasHombre(dos,'B7L',ms(7),ms(9)).horas-16)<1e-9,'al corte 09:00: 16 h-h (no se multiplica la cantidad actual por todo el turno)');
ok(Math.abs(D().horasHombre(dos,'B7L',ms(8),ms(11)).horas-(16+6))<1e-9,'los intervalos se recortan al período consultado (08:00–11:00 = 16 + 6)');

/* 3) avance antes y después de un cambio: el corte decide */
const antes=D().personalAlCorte(dos,'B7L',ms(9));
const conTercero=[...dos,{opId:'c',version:3,desdeMs:ms(11),lineas:L({B7L:4})}];
ok(antes.cantidad===8&&D().personalAlCorte(conTercero,'B7L',ms(9)).cantidad===8,'un avance a las 09:00 toma 8 aunque después se cambie a 4: el cambio posterior no lo altera');
ok(D().personalAlCorte(conTercero,'B7L',ms(10,30)).cantidad===6&&D().personalAlCorte(conTercero,'B7L',ms(12)).cantidad===4,'a las 10:30 → 6; a las 12:00 → 4 (vigente a su corte, no la más reciente)');

/* 4) distribución incompleta */
const parcial=[{opId:'a',version:1,desdeMs:ms(8),lineas:L({B7L:5})}];
h=D().horasHombre(parcial,'B7L',ms(7),ms(12));
ok(h.estado==='PARCIAL'&&Math.abs(h.horas-20)<1e-9&&Math.abs(h.cobertura-0.8)<1e-9&&h.minutosSinDato===60,'distribución desde las 08:00: 20 h-h PARCIAL, cobertura 80 %, 60 min sin dato (la hora sin dato no cuenta como cero)');
h=D().horasHombre([],'B7L',ms(7),ms(12));
ok(h.estado==='SIN_DATOS'&&h.horas===null,'sin distribución: información no disponible (no 0)');
h=D().horasHombre(ev,'PET2',ms(7),ms(12));
ok(h.estado==='SIN_DATOS'&&h.horas===null,'línea sin confirmar: sin datos aunque otras líneas sí tengan');
const planta=D().horasHombrePlanta(dos,ms(7),ms(12));
ok(Math.abs(planta.horas-36)<1e-9&&planta.estado==='PARCIAL','total de planta: suma las líneas con dato y se declara PARCIAL si otras no tienen');

/* 5) Día + Intermedio compartidos, Noche aparte y medianoche */
ok(D().clave(FECHA,'DÍA')===D().clave(FECHA,'INTERMEDIO')&&D().clave(FECHA,'NOCHE')!==D().clave(FECHA,'DÍA'),'Día e Intermedio comparten el mismo documento; Noche es independiente');
const hn=D().horarioDe(FECHA,'NOCHE');
ok(hn.inicio===ms(21)&&hn.fin===ms(7,0,9),'el horario de Noche (21:00–07:00 del día siguiente) sale de la configuración');
const noche=[{opId:'a',version:1,desdeMs:ms(21),lineas:L({PET1:6})},{opId:'b',version:2,desdeMs:ms(2,0,9),lineas:L({PET1:4})}];
h=D().horasHombre(noche,'PET1',ms(21),ms(3,0,9));
ok(Math.abs(h.horas-(6*5+4*1))<1e-9&&h.estado==='COMPLETO','Noche cruzando medianoche: 6 personas 21:00–02:00 + 4 personas 02:00–03:00 = 34 h-h');

/* 6) guardado: versión, permisos, doble clic y concurrencia */
(async()=>{
  let res=await D().guardar(FECHA,'DÍA',entrada({opId:'x1'}));
  const kDoc='distribucionPersonal/'+FECHA+'_DIA';
  ok(res.duplicado===false&&sb.db.docs.get(kDoc).version===1&&sb.db.docs.has(kDoc+'/eventos/x1'),'primer guardado: versión 1 y un evento en el historial');
  const e1=sb.db.docs.get(kDoc+'/eventos/x1');
  ok(e1.uid==='u1'&&e1.usuario==='Ana'&&typeof e1.guardadoEn==='number'&&e1.desdeMs===ms(7)&&e1.guardadoEn!==e1.desdeMs,'el evento guarda autor, hora efectiva y hora de guardado del servidor (datos distintos)');
  /* reintento / doble clic con el mismo opId */
  const [a,b]=await Promise.all([D().guardar(FECHA,'DÍA',entrada({opId:'x1'})),D().guardar(FECHA,'DÍA',entrada({opId:'x1'}))]);
  ok(a.duplicado&&b.duplicado&&sb.db.docs.get(kDoc).version===1&&[...sb.db.docs.keys()].filter(k=>k.includes('/eventos/')).length===1,'doble clic / reintento con el mismo operación: no duplica eventos ni sube la versión');
  /* cambio con versión correcta */
  res=await D().guardar(FECHA,'DÍA',entrada({opId:'x2',versionEsperada:1,desdeMs:ms(10),lineas:L({B7L:6}),motivo:'Se mueven dos personas a PET1'}));
  ok(sb.db.docs.get(kDoc).version===2&&res.evento.anterior.B7L===8&&res.evento.lineas.B7L===6,'el cambio guarda la cantidad anterior (8) y la nueva (6) con su motivo');
  /* dos supervisores a la vez con la misma versión */
  const dosA=entrada({opId:'s1',versionEsperada:2,desdeMs:ms(11),lineas:L({B7L:5}),motivo:'Supervisor A cambia'});
  const dosB=entrada({opId:'s2',versionEsperada:2,desdeMs:ms(11,5),lineas:L({B7L:3}),motivo:'Supervisor B cambia'});
  const rs=await Promise.allSettled([D().guardar(FECHA,'DÍA',dosA),D().guardar(FECHA,'DÍA',dosB)]);
  const buenos=rs.filter(x=>x.status==='fulfilled'),malos=rs.filter(x=>x.status==='rejected');
  ok(buenos.length===1&&malos.length===1&&malos[0].reason.codigo==='CONFLICTO'&&sb.db.docs.get(kDoc).version===3,'dos supervisores guardando a la vez: solo se aplica uno; el otro recibe CONFLICTO y no pisa nada');
  /* validaciones */
  const intenta=async(o,cod)=>{try{await D().guardar(FECHA,'DÍA',entrada(Object.assign({versionEsperada:3},o)));return 'ok';}catch(e){return e.codigo||e.message;}};
  ok(await intenta({desdeMs:ms(15),lineas:L({B7L:2}),motivo:'hora futura'})==='VALIDACION','no se permite una hora futura (el reloj del servidor es 12:00)');
  ok(await intenta({desdeMs:ms(6),lineas:L({B7L:2}),motivo:'antes del bloque'})==='VALIDACION','no se permite una hora fuera del bloque (antes de las 07:00)');
  ok(await intenta({desdeMs:ms(12),lineas:L({B7L:2}),motivo:''})==='VALIDACION','un cambio exige motivo');
  ok(await intenta({desdeMs:ms(12),lineas:L({B7L:-2}),motivo:'negativo ok'})==='VALIDACION','cantidad negativa rechazada');
  ok(await intenta({desdeMs:ms(12),lineas:L({}),motivo:'todo vacío'})==='VALIDACION','no se guarda una distribución sin ninguna línea');
  ok(await intenta({desdeMs:ms(8),lineas:L({B7L:2}),motivo:'cambio atrás'})==='CORRECCION','una hora anterior a la última registrada es corrección y el supervisor no puede');
  ok(sb.db.docs.get(kDoc).version===3,'los intentos rechazados no alteran el documento');
  /* corrección con permiso */
  sb=entorno({rol:'Jefe de Producción',uid:'j1',nombre:'Jefe',username:'jefe',permisos:[]});sb.ahora=ms(12);
  await D().guardar(FECHA,'DÍA',entrada({opId:'k1',versionEsperada:0,desdeMs:ms(7),lineas:L({PET1:5})}));
  res=await D().guardar(FECHA,'DÍA',entrada({opId:'k2',versionEsperada:1,desdeMs:ms(9),lineas:L({PET1:6}),motivo:'cambio normal 9'}));
  let fallo=null;try{await D().guardar(FECHA,'DÍA',entrada({opId:'k3',versionEsperada:2,desdeMs:ms(8),lineas:L({PET1:7}),correccion:true,motivo:''}));}catch(e){fallo=e;}
  ok(fallo&&fallo.codigo==='CORRECCION','la corrección retroactiva exige motivo');
  res=await D().guardar(FECHA,'DÍA',entrada({opId:'k4',versionEsperada:2,desdeMs:ms(8),lineas:L({PET1:7}),correccion:true,motivo:'Error de captura a las 8'}));
  ok(res.evento.correccion===true&&[...sb.db.docs.keys()].filter(k=>k.includes("/eventos/")).length===3,'con permiso y motivo la corrección se registra como evento nuevo (el historial anterior se conserva)');
  /* usuario de consulta */
  for(const rol of ['Gerente General','Jefe de Operaciones','Jefatura','Ventas','Mantenimiento']){
    sb=entorno({rol,uid:'c1',nombre:'Consulta',username:'c',permisos:['ver_tareo_produccion']});
    let e=null;try{await D().guardar(FECHA,'DÍA',entrada({}));}catch(x){e=x;}
    ok(e&&e.codigo==='PERMISO'&&sb.db.docs.size===0,rol+': solo consulta, no puede editar (y no escribe nada)');
  }
  sb=entorno({rol:'Supervisor',uid:'s9',nombre:'S',username:'s',permisos:['nuevo','-distribuirPersonal']});
  ok(!sb.tienePermiso('distribuirPersonal'),'el Administrador puede quitar el permiso a un Supervisor (-distribuirPersonal)');
  sb=entorno({rol:'Ventas',uid:'v1',nombre:'V',username:'v',permisos:['distribuirPersonal']});
  ok(sb.tienePermiso('distribuirPersonal'),'y darlo a otro rol (distribuirPersonal)');
  sb=entorno(sup);
  /* apoyo compartido */
  const prep=D().prepararEvento(null,{opId:'z',versionEsperada:0,desdeMs:ms(7),lineas:L({PET1:3,PET2:2}),apoyoCompartido:2},{ahoraMs:ms(12),horario:D().horarioDe(FECHA,'DÍA'),uid:'u',usuario:'n'});
  ok(prep.evento.total===5&&prep.evento.apoyoCompartido===2,'el apoyo compartido se guarda aparte y no se suma al total de las líneas (5, no 7)');
  /* comparación con disponibilidad */
  ok(D().compararConDisponible(12,null).estado==='NO_COMPROBABLE'&&D().compararConDisponible(12,12).estado==='COINCIDE'&&D().compararConDisponible(14,12).estado==='REVISAR'&&D().compararConDisponible(10,12).diferencia===-2,'comparación con el personal disponible: no comprobable / coincide / revisar');
  /* reglas */
  const reglas=leer('firestore.rules.etapa2.txt');
  ok(/function puedeDistribuirPersonal\(\)/.test(reglas)&&/match \/distribucionPersonal\/\{id\}/.test(reglas)&&/match \/eventos\/\{opId\}[\s\S]*allow update, delete: if false/.test(reglas),'reglas: escribe solo quien puede distribuir; el historial de eventos nunca se edita ni se borra');
  ok(/guardadoEn == request\.time/.test(reglas)&&/version == resource\.data\.version \+ 1/.test(reglas),'reglas: hora del servidor y versión que solo sube de uno en uno');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
