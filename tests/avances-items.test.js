/* Avances y cierres: un documento por snapshot (avancesTurnoItems), transición con el documento antiguo, migración y reglas. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));

/* Firestore falso compartido entre «dispositivos»: documentos, consultas por fecha, escuchas en vivo, transacciones y lotes. */
function nube(){
  const docs=new Map(),oyentes=[];let escrituras=[];
  const col=n=>[...docs.entries()].filter(([k])=>k.startsWith(n+'/')).map(([k,v])=>({id:k.slice(n.length+1),data:()=>clon(v)}));
  const emitir=()=>oyentes.filter(o=>o.vivo).forEach(o=>o.cb(o.resolver()));
  const ref=(c,id)=>({__k:c+'/'+id,__c:c,__id:id,
    get:async()=>({exists:docs.has(c+'/'+id),data:()=>clon(docs.get(c+'/'+id))}),
    onSnapshot(cb){const o={vivo:true,cb,resolver:()=>({exists:docs.has(c+'/'+id),data:()=>clon(docs.get(c+'/'+id))})};oyentes.push(o);cb(o.resolver());return()=>{o.vivo=false;};}});
  const consulta=(n,filtros)=>({
    where(campo,op,val){return consulta(n,filtros.concat([[campo,op,val]]));},
    _lista:()=>col(n).filter(d=>filtros.every(([c,op,v])=>{const x=d.data()[c];return op==='=='?x===v:op==='>='?x>=v:op==='<='?x<=v:true;})),
    get(){return Promise.resolve({docs:this._lista()});},
    onSnapshot(cb,err){const self=this;const o={vivo:true,cb,resolver:()=>({docs:self._lista()})};oyentes.push(o);cb(o.resolver());return()=>{o.vivo=false;};}
  });
  const fus=(a,b)=>Object.assign({},a,b);
  const aplicar=(r,d,o)=>{const k=r.__k;if(d&&d.creadoEn&&d.creadoEn.__ts)d=Object.assign({},d,{creadoEn:{__ts:true}});docs.set(k,o&&o.merge?fus(docs.get(k)||{},d):d);escrituras.push(k);};
  const db={
    collection:n=>Object.assign(consulta(n,[]),{doc:id=>ref(n,id)}),
    runTransaction:async fn=>{const w=[];const r=await fn({get:async x=>x.get(),set:(x,d,o)=>w.push([x,d,o])});w.forEach(([x,d,o])=>aplicar(x,d,o));emitir();return r;},
    batch:()=>{const w=[];return {set:(x,d,o)=>w.push([x,d,o]),commit:async()=>{w.forEach(([x,d,o])=>aplicar(x,d,o));emitir();}};}
  };
  return {db,docs,oyentes,escrituras:()=>escrituras,limpiarEsc:()=>{escrituras=[];}};
}
function dispositivo(N,rol){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,setInterval:()=>0,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}}};
  vm.createContext(sb);sb.window=sb;sb.db=N.db;sb.auth={currentUser:{uid:'uid-'+rol}};
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>({__ts:true})}}};
  sb.state={user:{rol:rol||'Supervisor',username:'u'}};sb.glacialCierresSesion=[];sb.document=undefined;
  vm.runInContext(leer('js/produccion/29a-avances-items.js'),sb);
  return sb;
}
const snap=(id,fecha,extra)=>Object.assign({id,fecha,turno:'DÍA',tipo:id.includes('CIERRE')?'CIERRE':'AVANCE',horaReferencia:'11:00',generadoEn:1,lineas:[{linea:'PET1',reporte:{a:1}}],texto:'texto'},extra||{});

(async()=>{
const N=nube();
const A=dispositivo(N,'Supervisor'),B=dispositivo(N,'Supervisor');
const SA=A.window.glacialAvancesItems,SB=B.window.glacialAvancesItems;

/* 1) Crear */
const s1=snap('2026-10-10|DÍA|AVANCE|11:00|1','2026-10-10');
await SA.crear(s1,'El avance 11:00 de este turno ya fue generado.');
const doc=N.docs.get('avancesTurnoItems/'+s1.id);
ok(doc&&doc.id===s1.id&&doc.lineas[0].reporte.a===1&&doc.texto==='texto'&&doc.creadoPorUid==='uid-Supervisor'&&doc.creadoEn.__ts===true,'cada snapshot es su documento (mismo id y campos) con uid y hora del servidor');
let e='';try{await SA.crear(s1,'El avance 11:00 de este turno ya fue generado.');}catch(x){e=x.message;}
ok(e==='El avance 11:00 de este turno ya fue generado.','crear con un id existente falla con el mensaje de siempre');
const cierre=snap('2026-10-10|DÍA|CIERRE','2026-10-10');
await SB.crear(cierre,'El cierre de este turno ya fue generado.');
e='';try{await SA.crear(cierre,'El cierre de este turno ya fue generado.');}catch(x){e=x.message;}
ok(e==='El cierre de este turno ya fue generado.','el cierre de otro dispositivo no se pisa («el cierre ya fue generado»)');
N.docs.set('sync/avancesTurno',{items:[snap('2026-10-09|DÍA|CIERRE','2026-10-09'),snap('2026-10-09|DÍA|AVANCE|09:00|5','2026-10-09')],paradasOperativas:[{id:'p1',fecha:'2026-10-09',minutos:5}],updatedAt:777});
e='';try{await SA.crear(snap('2026-10-09|DÍA|CIERRE','2026-10-09'),'dup');}catch(x){e=x.message;}
ok(e==='dup','durante la transición también falla si el id sigue en el documento antiguo');
let esc0=N.escrituras().length;
ok(![...N.docs.keys()].includes('avancesTurnoItems/2026-10-09|DÍA|CIERRE'),'esa creación fallida no escribió nada');

/* 2) Tiempo real entre dispositivos + unión sin duplicar */
let avisosB=0;SB.alCambiar(()=>avisosB++);
SB.escucharRango('operativa','2026-10-10','2026-10-10');
SB.fijarLegado(N.docs.get('sync/avancesTurno'));
ok(SB.todos().filter(x=>x.fecha==='2026-10-10').length===2&&SB.todos().length===4,'B ve lo ya guardado de la fecha + los items antiguos (unidos)');
const antes=avisosB;
await SA.crear(snap('2026-10-10|DÍA|AVANCE|13:00|2','2026-10-10',{horaReferencia:'13:00'}),'x');
ok(SB.todos().some(x=>x.id==='2026-10-10|DÍA|AVANCE|13:00|2')&&avisosB>antes,'lo que genera A aparece en B sin recargar (escucha en vivo)');
ok(!SB.todos().some(x=>x.creadoPorUid||x.creadoEn),'en memoria el snapshot queda con los mismos campos de siempre (sin campos de control)');
SB.escucharRango('mes','2026-10-01','2026-10-31');
const dup=SB.todos().filter(x=>x.id==='2026-10-10|DÍA|CIERRE').length;
ok(dup===1,'escuchas superpuestas (mes + día) no duplican por id');
N.docs.set('avancesTurnoItems/2026-10-09|DÍA|CIERRE',Object.assign(snap('2026-10-09|DÍA|CIERRE','2026-10-09'),{texto:'nuevo'}));
SB.escucharRango('mes','2026-10-01','2026-10-31');
SB.escucharRango('mes','2026-09-01','2026-09-30');
ok(SB.todos().some(x=>x.fecha==='2026-10-10'),'al mover el mes se conserva la escucha del día operativo');
SB.cerrarTodo();
ok(SB.todos().length===0&&SB.estado.oyentes.size===0,'cerrarTodo cierra las escuchas y vacía la memoria');
ok(B.glacialCierresSesion.length===1,'el cierre de sesión cierra las escuchas (glacialCierresSesion)');
const vivosAntes=N.oyentes.filter(o=>o.vivo).length;B.glacialCierresSesion.forEach(f=>f());

/* 3) Consultas por rango */
const C=dispositivo(N,'Jefe de Producción'),SC=C.window.glacialAvancesItems;
const r1=await SC.consultarFecha('2026-10-09');
ok(r1.length===2&&r1.find(x=>x.id==='2026-10-09|DÍA|CIERRE').texto==='nuevo','consulta por fecha: une colección y documento antiguo sin duplicar (manda el documento nuevo)');
const r2=await SC.consultarRango('2026-10-09','2026-10-10');
ok(r2.length===5,'consulta por rango de fechas ('+r2.length+' snapshots)');
ok((await SC.obtener('2026-10-10|DÍA|CIERRE'))&&(await SC.obtener('no-existe'))===null,'obtener por id (reenvíos y exportaciones de otro mes)');

/* 4) Migración */
const M=nube();
const itemsViejos=[1,2,3].map(i=>snap('2026-09-0'+i+'|DÍA|AVANCE|11:00|'+i,'2026-09-0'+i,{texto:'t'+i,extra:{anidado:[{a:i}]}}));
M.docs.set('sync/avancesTurno',{items:clon(itemsViejos),paradasOperativas:[{id:'p',minutos:3}],updatedAt:555});
const adm=dispositivo(M,'Administrador'),SM=adm.window.glacialAvancesItems;
const sup=dispositivo(M,'Supervisor');
let eNo='';try{await sup.window.glacialAvancesItems.migrar({descargar(){}});}catch(x){eNo=x.message;}
ok(/Administrador/.test(eNo)&&M.escrituras().length===0,'solo el Administrador migra (otro rol no escribe nada)');
let eResp='';try{await SM.migrar({descargar(){throw Error('sin descarga');}});}catch(x){eResp=x.message;}
ok(eResp==='sin descarga'&&M.escrituras().length===0&&M.docs.get('sync/avancesTurno').items.length===3,'si el respaldo no se puede descargar, no se copia ni se borra nada');
let respaldo=null,ordenRespaldo=-1;
const rep1=await SM.migrar({descargar(n,o){respaldo={n,o};ordenRespaldo=M.escrituras().length;}});
ok(respaldo&&/^respaldo-avancesTurno-.*\.json$/.test(respaldo.n)&&ordenRespaldo===0&&respaldo.o.datos.items.length===3&&respaldo.o.datos.paradasOperativas.length===1,'primero se descarga el respaldo completo (antes de cualquier escritura)');
ok(rep1.estado==='migrado'&&rep1.copiados===3&&rep1.verificados===3&&rep1.quitados===3&&rep1.restantes===0,'migrados 3 de 3: copiados, verificados y quitados');
const copia=M.docs.get('avancesTurnoItems/'+itemsViejos[1].id);
const sinCtl=Object.assign({},copia);delete sinCtl.creadoPorUid;delete sinCtl.creadoEn;delete sinCtl.migrado;
ok(JSON.stringify(sinCtl)===JSON.stringify(itemsViejos[1])&&copia.creadoPorUid==='uid-Administrador','la copia es idéntica al item original (más uid y hora de quien migró)');
const leg=M.docs.get('sync/avancesTurno');
ok(leg.items.length===0&&leg.paradasOperativas.length===1&&leg.updatedAt===555,'el documento antiguo conserva paradasOperativas y updatedAt (no se rompe el control de conflicto)');
const rep2=await SM.migrar({descargar(){throw Error('no debería pedir respaldo');}});
ok(rep2.estado==='nada-que-migrar','idempotente: una segunda ejecución no hace nada');
/* conflicto: ya existe un documento distinto con ese id → no se sobrescribe ni se quita nada */
const K=nube();K.docs.set('sync/avancesTurno',{items:clon(itemsViejos),updatedAt:1});
K.docs.set('avancesTurnoItems/'+itemsViejos[0].id,Object.assign({},itemsViejos[0],{texto:'DISTINTO'}));
const rk=await dispositivo(K,'Administrador').window.glacialAvancesItems.migrar({descargar(){}});
ok(rk.estado==='con-conflictos'&&rk.conflictos.includes(itemsViejos[0].id)&&K.docs.get('sync/avancesTurno').items.length===3&&K.docs.get('avancesTurnoItems/'+itemsViejos[0].id).texto==='DISTINTO','con un conflicto no se sobrescribe y NO se quita nada del documento antiguo');
/* reanudar: ya copiados a medias (idénticos) */
const P=nube();P.docs.set('sync/avancesTurno',{items:clon(itemsViejos),updatedAt:1});
P.docs.set('avancesTurnoItems/'+itemsViejos[0].id,Object.assign({},itemsViejos[0],{creadoPorUid:'x',creadoEn:{__ts:true},migrado:true}));
const rp=await dispositivo(P,'Administrador').window.glacialAvancesItems.migrar({descargar(){}});
ok(rp.estado==='migrado'&&rp.yaExistian===1&&rp.copiados===2&&rp.restantes===0,'una migración interrumpida se reanuda sin duplicar');

/* 5) Tamaños */
const E=SM.estimarBytes;
ok(E('abc')===4&&E(5)===8&&E(true)===1&&E({a:'x'})===1+1+2&&E([1,2])===16,'estimación de tamaño según la fórmula de Firestore');
const big=nube();big.docs.set('sync/avancesTurno',{items:[{t:'x'.repeat(900000)}],updatedAt:1});big.docs.set('sync/users',{items:[{t:'x'.repeat(1000)}]});
const altos=await dispositivo(big,'Administrador').window.glacialAvancesItems.revisarTamanos();
ok(altos.length===1&&altos[0].doc==='avancesTurno'&&altos[0].porcentaje>=80,'aviso: se detecta un documento de sync por encima del 80 % del límite');
ok((await dispositivo(big,'Supervisor').window.glacialAvancesItems.revisarTamanos()).length===0,'el aviso de capacidad es solo para el Administrador');
const me=nube();me.docs.set('sync/avancesTurno',{items:[],paradasOperativas:[{id:'a',fecha:'2026-10-01',descripcion:'x'.repeat(100),minutos:5},{id:'b',fecha:'2026-10-10',descripcion:'y'.repeat(100),minutos:7}],updatedAt:1});
const med=await dispositivo(me,'Administrador').window.glacialAvancesItems.medir();
ok(med.paradas===2&&med.dias===10&&med.crecimientoBytesDia>0&&med.bytesPorParada>100&&med.diasRestantesSoloParadas>1000,'medir(): paradas, bytes por parada, crecimiento por día y plazo estimado');

/* 5b) medirSync: tamaño, filas por elemento y si la lista se parte en Supabase */
const ms=nube();
ms.docs.set('sync/programaciones',{items:[{id:'a',fecha:'2026-10-01',x:'x'.repeat(100)},{id:'b',fecha:'2026-10-10',x:'y'.repeat(100)}],updatedAt:1});
ms.docs.set('sync/paletas',{items:[{id:'p1'},{id:'p1'}]});
const med2=await dispositivo(ms,'Administrador').window.glacialAvancesItems.medirSync(['programaciones','paletas','noExiste']);
ok(med2[0].existe&&med2[0].bytes>0&&med2[0].libre>0&&med2[0].listas[0].elementos===2&&med2[0].listas[0].dias===10&&med2[0].listas[0].crecimientoBytesDia>0&&med2[0].listas[0].claveUnica==='id'&&med2[0].listas[0].seParteEnSupabase,'medirSync: bytes, % del límite, crecimiento por día y lista que se parte en filas en Supabase (clave id)');
ok(med2[1].listas[0].claveUnica===null&&med2[1].listas[0].seParteEnSupabase===false&&med2[2].existe===false,'medirSync: avisa si una lista tiene ids repetidos (quedaría como un solo documento) y si el documento no existe');
let eMs='';try{await dispositivo(ms,'Supervisor').window.glacialAvancesItems.medirSync();}catch(x){eMs=x.message;}
ok(/Administrador/.test(eMs),'medirSync es solo para el Administrador');

/* 6) Código y reglas */
const av=leer('js/produccion/29-avance-produccion.js');
ok(!/items:arr/.test(av)&&/glacialAvancesItems\.crear\(/.test(av),'29: avGuardarSnapshot ya no reescribe el documento completo: crea el documento del snapshot');
ok(/tx\.set\(avancesRef,\{paradasOperativas:operativas,updatedAt:ahora\}/.test(av),'29: guardar paradas conserva el control de conflicto por updatedAt');
ok(/S\.fijarLegado\(data\)/.test(av)&&/avAsegurarEscuchas/.test(av)&&/escucharRango\('mes'/.test(av)&&/escucharRango\('operativa'/.test(av),'29: escucha en vivo por mes y por día operativo, unida con los items antiguos');
ok(/consultarFecha/.test(leer('js/accesos/32-dashboard-perfiles.js'))&&!/doc\('avancesTurno'\)\.get\(\)/.test(leer('js/accesos/32-dashboard-perfiles.js')),'32 (Inicio): consulta por fecha a la colección');
ok(/snapshotAsync/.test(leer('js/nucleo/34-integraciones.js')),'34: los reenvíos buscan en la colección si el cierre no está en memoria');
const idx=leer('index.html');
ok(idx.indexOf('29a-avances-items.js')>0&&idx.indexOf('29a-avances-items.js')<idx.indexOf('29-avance-produccion.js'),'index: 29a se carga antes de 29');
const reglas=leer('_archivo/firebase/firestore.rules.etapa2.txt');
const bl=reglas.slice(reglas.indexOf('match /avancesTurnoItems/{id}'),reglas.indexOf('match /distribucionPersonal'));
ok(/allow read: if autenticado\(\)/.test(bl)&&/allow create: if puedeGenerarResumen\(\)/.test(bl)&&/creadoPorUid == request\.auth\.uid/.test(bl)&&/creadoEn == request\.time/.test(bl)&&/request\.resource\.data\.id == id/.test(bl),'reglas: lee quien lee sync, crea puedeGenerarResumen() con su uid y la hora del servidor');
ok(/hasOnly\(\['copiadoEn', 'copiadoPor'\]\)/.test(bl)&&/allow delete: if false/.test(bl),'reglas: solo copiadoEn/copiadoPor se actualizan; nadie borra');
ok(/'tareos', 'paletas', 'programaciones', 'avancesTurno'/.test(reglas),'reglas: sync/avancesTurno sigue escribible (paradas y migración)');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
