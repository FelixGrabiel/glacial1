/* Avance/Cierre usa la Distribución de personal (fuente compartida): vigente al corte, pendiente, cero confirmado, horas hombre y snapshot congelado. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-08';
const ms=(h,m,dia)=>new Date(2026,9,dia||8,h,m||0).getTime();

function fakeDb(){
  const docs=new Map();let ts=1000;
  const snapDoc=p=>({exists:docs.has(p),data:()=>docs.has(p)?JSON.parse(JSON.stringify(docs.get(p))):undefined});
  const eventos=base=>[...docs.entries()].filter(([k])=>k.startsWith(base+'/eventos/')).map(([,v])=>({data:()=>JSON.parse(JSON.stringify(v))})).sort((a,b)=>a.data().desdeMs-b.data().desdeMs);
  const mkref=p=>({path:p,collection:n=>({doc:id=>mkref(p+'/'+n+'/'+id),orderBy:()=>({async get(){return {docs:eventos(p)};},onSnapshot(cb){cb({docs:eventos(p)});return ()=>{};}})}),
    async get(){return snapDoc(p);},onSnapshot(cb){cb(snapDoc(p));return ()=>{};}});
  return {docs,collection:n=>({doc:id=>mkref(n+'/'+id)}),
    async runTransaction(fn){const esc=[];await fn({async get(r){return snapDoc(r.path);},set(r,d){esc.push([r.path,d]);}});
      esc.forEach(([p,d])=>docs.set(p,JSON.parse(JSON.stringify(d,(k,v)=>v&&v.__ts?ts++:v))));}};
}
function entorno(o){
  o=o||{};
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0,Infinity,isFinite,Boolean};
  vm.createContext(sb);sb.window=sb;sb.addEventListener=()=>{};
  sb.document={createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){}}),getElementById:()=>null,querySelector:()=>null,body:{classList:{add(){},remove(){}}},addEventListener(){}};
  sb.state={user:o.usuario||{username:'ana',nombre:'Ana',rol:'Supervisor',uid:'u1',permisos:['avanceProduccion']},currentTab:''};
  sb.ahora=o.ahora||ms(13);sb.tareoAhoraServidor=()=>sb.ahora;sb.glacialCierresSesion=[];
  sb.db=fakeDb();
  sb.firebase={auth:()=>({currentUser:{uid:'u1'}}),firestore:{FieldValue:{serverTimestamp:()=>({__ts:true})}}};
  sb.programaciones=o.programaciones||[];sb.records=[];sb.paletas=o.paletas||[];
  sb.loadProgramaciones=()=>sb.programaciones;sb.loadRecords=()=>sb.records;sb.loadPaletas=()=>sb.paletas;
  sb.normalizarCuadros=r=>r.cuadros||[];sb.normalizarMotivoParada=t=>String(t||'').toLowerCase().trim();sb.estandarMotivoParada=()=>0;
  const s02=leer('js/nucleo/02-estado.js');
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(s02.slice(s02.indexOf('const ROLES_DISTRIBUCION_PERSONAL'),s02.indexOf('function tienePermiso(permiso)'))+"function tienePermiso(p){return p==='distribuirPersonal'?distribucionPersonalPermitida(state.user):p==='avanceProduccion';}",sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  vm.runInContext(leer('js/produccion/29-avance-produccion.js'),sb);
  vm.runInContext(leer('js/personal/43-distribucion-personal.js'),sb);
  const s16=leer('js/produccion/16-paletas.js');
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+s16.slice(s16.indexOf('  function ultimoEstado(registros){'),s16.indexOf('  const resumenTurnosOriginal'))+s16.slice(s16.indexOf('  function msRegistroPaleta'),s16.indexOf('  const resumenOriginal = resumenPaletas;')),sb);
  vm.runInContext(`avanceEstado.fecha='${FECHA}';avanceEstado.turno='${o.turno||'DÍA'}';avanceEstado.paradasOperativas=[];`,sb);
  return sb;
}
const prog=(linea,inicio,turno)=>({linea,fecha:FECHA,turno:turno||'DÍA',marca:'Bells',presentacion:'7 L',cantidadProgramada:100,unidadesPorPaleta:1000,estadoOperacion:{estado:'EN_PRODUCCION',inicio,paradas:[]}});
const pal=(linea,total,hora,turno)=>({linea,fecha:FECHA,turno:turno||'DÍA',marca:'Bells',presentacion:'7 L',tipoPaleta:'COMPLETA',paletas:total/1000,totalUnidades:total,hora,creadoEn:1});
const L=o=>Object.assign({PET1:null,PET2:null,B7L:null,C20L:null,B20L:null},o);
let n=0;
async function guardar(sb,fecha,bloque,desde,lineas,motivo,ver,extra){return sb.glacialDistribucionPersonal.guardar(fecha,bloque,Object.assign({opId:'o'+(++n),versionEsperada:ver,desdeMs:desde,lineas,motivo:motivo||''},extra||{}));}

(async()=>{
  let sb=entorno({programaciones:[prog('B7L',ms(7))],paletas:[pal('B7L',3486,'12:30')]});
  const D=()=>sb.glacialDistribucionPersonal;
  /* 1) sin confirmar */
  await sb.avCargarDistribucion();
  let l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
  ok(l.personal===null&&l.personalEstado==='PENDIENTE'&&l.personalOrigen==='DISTRIBUCION','sin confirmar: personal pendiente (null), no 0 ni otro valor');
  ok(/Personal en línea: Pendiente de confirmar/.test(sb.avTextoWhatsApp({id:'x',fecha:FECHA,turno:'DÍA',tipo:'AVANCE',horaCorte:'12:52',supervisor:'S',lineas:[l]})),'el texto dice «Personal en línea: Pendiente de confirmar»');
  ok(l.horasHombre.estado==='SIN_DATOS'&&sb.avHorasHombreTexto(l)==='—','horas-hombre sin datos: «—» (no 0)');
  /* 2) confirmado 8 desde 07:00; luego 6 desde 10:00 */
  await guardar(sb,FECHA,'DÍA',ms(7),L({B7L:8,PET1:0}),'',0);
  await guardar(sb,FECHA,'DÍA',ms(10),L({B7L:6,PET1:0}),'Se mueven 2 a PET1',1);
  await sb.avCargarDistribucion();
  const a09=sb.avLineaSnapshot('B7L','09:00','AVANCE',ms(9));
  const a11=sb.avLineaSnapshot('B7L','11:00','AVANCE',ms(11));
  ok(a09.personal===8&&a09.personalEstado==='CONFIRMADO'&&a09.personalDesdeMs===ms(7)&&a09.personalVersion===1,'avance a las 09:00: 8 personas, vigente desde 07:00, versión 1');
  ok(a11.personal===6&&a11.personalDesdeMs===ms(10)&&a11.personalVersion===2,'avance a las 11:00: 6 personas, vigente desde 10:00, versión 2 (el evento vigente a su corte)');
  ok(sb.avLineaSnapshot('B7L','09:00','AVANCE',ms(9)).personal===8,'regenerar el corte de las 09:00 después del cambio sigue dando 8 (no toma la distribución más reciente)');
  /* 3) cero confirmado */
  const pet1=sb.avLineaSnapshot('PET1','12:52','AVANCE',ms(12,52));
  sb.programaciones.push(prog('PET1',ms(7)));sb.paletas.push(pal('PET1',500,'12:00'));
  const pet1b=sb.avLineaSnapshot('PET1','12:52','AVANCE',ms(12,52));
  ok(pet1b.personal===0&&pet1b.personalEstado==='CONFIRMADO'&&/Personal en línea: 0\b/.test(sb.avTextoWhatsApp({id:'x',fecha:FECHA,turno:'DÍA',tipo:'AVANCE',horaCorte:'12:52',supervisor:'S',lineas:[pet1b]})),'cero confirmado: «Personal en línea: 0» (distinto de pendiente)');
  /* 4) 36 h-h */
  sb=entorno({programaciones:[prog('B7L',ms(7))],paletas:[pal('B7L',3486,'11:30')],ahora:ms(13)});
  await guardar(sb,FECHA,'DÍA',ms(7),L({B7L:8}),'',0);await guardar(sb,FECHA,'DÍA',ms(10),L({B7L:6}),'Cambio de línea',1);await sb.avCargarDistribucion();
  l=sb.avLineaSnapshot('B7L','12:00','AVANCE',ms(12));
  ok(Math.abs(l.horasHombre.horas-36)<1e-9&&l.horasHombre.estado==='COMPLETO','B7L al corte 12:00: 8×3 h + 6×2 h = 36 h-h');
  ok(sb.avHorasHombreTexto(l)==='36 h-h','se muestra «36 h-h»');
  /* 5) parcial */
  sb=entorno({programaciones:[prog('B7L',ms(7))],paletas:[pal('B7L',3486,'11:30')],ahora:ms(13)});
  await guardar(sb,FECHA,'DÍA',ms(8),L({B7L:5}),'',0);await sb.avCargarDistribucion();
  l=sb.avLineaSnapshot('B7L','12:00','AVANCE',ms(12));
  ok(l.horasHombre.estado==='PARCIAL'&&Math.abs(l.horasHombre.horas-20)<1e-9&&/parcial/.test(sb.avHorasHombreTexto(l)),'distribución desde las 08:00 con línea iniciada 07:00: 20 h-h PARCIAL (la hora sin dato no cuenta como cero)');
  /* 6) snapshot congelado */
  const copia=JSON.parse(JSON.stringify(l));
  await guardar(sb,FECHA,'DÍA',ms(12),L({B7L:99}),'Cambio posterior',1);await sb.avCargarDistribucion();
  ok(copia.personal===5&&sb.avPersonalTexto(copia)==='5'&&copia.personalVersion===1,'un cambio posterior no altera un snapshot ya generado');
  const bloques=sb.avBloquesPresentacionLinea(copia);
  ok(bloques.every(b=>sb.avPersonalTexto(b)==='5'),'los bloques del snapshot usan el personal congelado de la línea');
  /* 7) snapshot general: personal y pendientes en el resumen */
  sb=entorno({programaciones:[prog('B7L',ms(7)),prog('PET1',ms(7))],paletas:[pal('B7L',1000,'11:00'),pal('PET1',2000,'11:00')],ahora:ms(13)});
  await guardar(sb,FECHA,'DÍA',ms(7),L({B7L:8}),'',0);await sb.avCargarDistribucion();
  sb.avHorarioBloque=sb.avHorarioBloque;
  const snap=sb.avConstruirSnapshot('11:00','AVANCE');
  ok(snap.resumen.personal===8&&snap.resumen.personalPendientes===1&&snap.lineas.find(x=>x.linea==='PET1').personalEstado==='PENDIENTE','el resumen suma el personal confirmado (8) e indica 1 línea pendiente');
  ok(snap.versionCalculo===2&&snap.lineas.every(x=>x.personalOrigen==='DISTRIBUCION'),'el snapshot guarda el origen del personal y la versión del cálculo');
  /* 8) botón Ajustar personal solo con permiso */
  ok(/AJUSTAR PERSONAL/.test(sb.avBotonAjustarPersonal()),'el Supervisor ve «AJUSTAR PERSONAL»');
  sb=entorno({usuario:{username:'j',nombre:'J',rol:'Jefatura',uid:'j1',permisos:['avanceProduccion']}});
  ok(sb.avBotonAjustarPersonal()==='','Jefatura (consulta) no ve el botón; ver el reporte no da permiso de editar');
  /* 9) snapshot anterior (sin distribución) conserva su número */
  ok(sb.avPersonalTexto({personal:7})==='7'&&sb.avPersonalTexto({personal:null,personalEstado:'PENDIENTE'})==='Pendiente de confirmar','snapshots anteriores conservan su personal; los nuevos pendientes se rotulan');
  /* 10) Noche */
  sb=entorno({turno:'NOCHE',programaciones:[prog('B7L',ms(21),'NOCHE')],paletas:[pal('B7L',1000,'23:00','NOCHE')],ahora:ms(4,0,9)});
  await guardar(sb,FECHA,'NOCHE',ms(21),L({B7L:4}),'',0);await guardar(sb,FECHA,'NOCHE',ms(1,0,9),L({B7L:6}),'Refuerzo de madrugada',1);await sb.avCargarDistribucion();
  l=sb.avLineaSnapshot('B7L','03:00','AVANCE',ms(3,0,9));
  ok(l.personal===6&&Math.abs(l.horasHombre.horas-(4*4+6*2))<1e-9,'Noche: 4 personas 21:00–01:00 + 6 personas 01:00–03:00 = 28 h-h, cruzando la medianoche');
  ok(sb.avPersonalDistribucion('B7L',ms(23),ms(21)).cantidad===4,'a las 23:00 el vigente es 4');
  /* 11) ensamblaje */
  const f29=leer('js/produccion/29-avance-produccion.js');
  ok(/await avCargarDistribucion\(\)/.test(f29)&&/avAsegurarDistribucion\(\);/.test(f29),'se lee fresca la distribución antes de generar y la vista se mantiene en vivo');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
