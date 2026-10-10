/* Motivos de no producción (63) y nuevo Inicio: lógica real del módulo con una base simulada. */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

/* ---------- base simulada (una colección con transacciones) ---------- */
const almacen=new Map();let escrituras=0;
const refDe=id=>({id,_id:id});
const db={collection:()=>({doc:id=>refDe(id),where:()=>({onSnapshot:()=>()=>{}})}),
  runTransaction:async fn=>{
    const tx={get:async r=>({exists:almacen.has(r.id),data:()=>JSON.parse(JSON.stringify(almacen.get(r.id)))}),
      set:(r,d)=>{almacen.set(r.id,JSON.parse(JSON.stringify(d)));escrituras++;}};
    return fn(tx);
  }};
const sb={console,Date,JSON,Promise,Error,Map,Set,Array,Object,String,Number,Math,setTimeout};
sb.window=sb;sb.db=db;
sb.state={user:{nombre:'Ana Supervisora',username:'ana',rol:'Supervisor'}};
sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>'SERVER_TS'}},auth:()=>({currentUser:{uid:'uid-ana'}})};
sb.document={getElementById:()=>null,head:{appendChild(){}},createElement:()=>({})};
sb.glacialQuienControla=()=>'supervisor';
sb.tareoAhoraServidor=()=>sb.__ahora;sb.__ahora=1000000;
vm.createContext(sb);
vm.runInContext(leer('js/produccion/63-incidencias-no-produccion.js'),sb);
const I=sb.glacialIncidencias;

ok(JSON.stringify(I.MOTIVOS)===JSON.stringify(['Falta de personal','Falla de máquina','Falta de insumos','Mantenimiento','Limpieza','Cambio de formato','Otra causa']),'motivos iniciales según el prompt');
ok(I.idDe('2026-10-09','DIA_INTERMEDIO','B20L')==='2026-10-09_DIA_B20L'&&I.idDe('2026-10-09','NOCHE','B20L')==='2026-10-09_NOCHE_B20L','un documento por fecha + bloque + línea (sin vigentes duplicadas)');
ok(I.validar({linea:'B20L',fecha:'2026-10-09',motivo:'Otra causa',descripcion:''})!==''&&I.validar({linea:'B20L',fecha:'2026-10-09',motivo:'Otra causa',descripcion:'Corte de agua'})==='','«Otra causa» exige descripción');
ok(I.validar({linea:'XX',fecha:'2026-10-09',motivo:'Limpieza'})!==''&&I.validar({linea:'B20L',fecha:'2026-10-09',motivo:'Inventado'})!=='','línea y motivo del catálogo');

/* ---------- qué líneas se muestran ---------- */
const fila=(linea,o)=>Object.assign({linea,estado:'PENDIENTE',programado:1000,producido:0,detalle:[{estado:'PENDIENTE'}],enProduccionReal:false,detenidaReal:false,iniciadaReal:false,ultimaOperacionMs:0},o||{});
const base=filas=>({filas,lineas:['PET1','PET2','B7L','C20L','B20L'],incidencias:[],bloqueActual:true,inicioBloque:500000,ahora:1000000});
const sp=(o,extra)=>I.sinProduccion(Object.assign(base(o),extra||{}));
const lin=r=>r.map(x=>x.linea).join(',');

let r=sp([fila('B20L')]);
ok(lin(r)==='B20L'&&r[0].pendiente&&r[0].causa==='NO_INICIADA','línea que debía iniciar y no ha iniciado, sin causa: «motivo pendiente» (no se inventa una causa)');
r=sp([],{incidencias:[{id:'x',linea:'B20L',estado:'VIGENTE',motivo:'Falta de personal',descripcion:'',registradoPor:'Ana',registradoEn:900000}]});
ok(lin(r)==='B20L'&&!r[0].pendiente&&r[0].motivo==='Falta de personal'&&r[0].por==='Ana','B20L muestra «Falta de personal» aun sin paletas, avance ni programación');
r=sp([fila('B7L',{estado:'DETENIDA',detenidaReal:true,iniciadaReal:true,producido:300,detalle:[{estado:'DETENIDA'}]})],{incidencias:[{linea:'B7L',estado:'VIGENTE',motivo:'Falla de máquina',registradoPor:'Luis',registradoEn:960000}]});
ok(lin(r)==='B7L'&&r[0].motivo==='Falla de máquina','otra línea muestra «Falla de máquina» con responsable y hora');
r=sp([fila('B7L',{estado:'DETENIDA',detenidaReal:true,iniciadaReal:true,producido:300})]);
ok(lin(r)==='B7L'&&r[0].pendiente&&r[0].causa==='DETENIDA','línea que inició y luego se detuvo, sin motivo: pendiente');
r=sp([fila('PET1',{estado:'PENDIENTE'})],{ahora:400000});
ok(r.length===0,'inicio previsto todavía no llegado: no es incidencia');
ok(sp([fila('PET1',{estado:'COMPLETADA',producido:1000,iniciadaReal:true,detalle:[{estado:'COMPLETADA'}]}),fila('PET2',{estado:'CANCELADA',detalle:[{estado:'CANCELADA'}]}),fila('B7L',{estado:'PAUSA',iniciadaReal:true,detalle:[{estado:'PAUSA'}]}),fila('C20L',{estado:'EN_CURSO',enProduccionReal:true,iniciadaReal:true,detalle:[{estado:'EN_CURSO'}]})]).length===0,'finalizada, cancelada, en pausa programada o en curso: no se marcan');
ok(sp([fila('PET1',{programado:0})]).length===0&&sp([]).length===0,'turno vacío / sin programación: no se marcan todas las líneas');
r=sp([fila('PET1')],{bloqueActual:false});
ok(r.length===0,'un bloque que no es el vigente no deduce incidencias (solo muestra lo informado)');
ok(lin(sp([],{bloqueActual:false,incidencias:[{linea:'PET2',estado:'VIGENTE',motivo:'Limpieza',registradoEn:1}]}))==='PET2','una incidencia informada se puede consultar en su fecha y bloque');
ok(sp([],{incidencias:[{linea:'PET1',estado:'RESUELTA',motivo:'Limpieza',registradoEn:1}]}).length===0,'una incidencia resuelta ya no aparece como vigente');
// evento anterior / posterior al registro
const inc={linea:'PET1',estado:'VIGENTE',motivo:'Mantenimiento',registradoPor:'Ana',registradoEn:900000};
ok(lin(sp([fila('PET1',{estado:'EN_CURSO',enProduccionReal:true,iniciadaReal:true,ultimaOperacionMs:800000,producido:50,detalle:[{estado:'EN_CURSO'}]})],{incidencias:[inc]}))==='PET1','un inicio ANTERIOR al motivo (o producción previa) no lo cierra');
ok(sp([fila('PET1',{estado:'EN_CURSO',enProduccionReal:true,iniciadaReal:true,ultimaOperacionMs:950000,producido:50,detalle:[{estado:'EN_CURSO'}]})],{incidencias:[inc]}).length===0,'un inicio/reanudación POSTERIOR al registro la deja de mostrar como vigente');
ok(lin(I.sinProduccion(Object.assign(base([]),{lineas:['PET1','B20L'],incidencias:[{linea:'PET2',estado:'VIGENTE',motivo:'Limpieza',registradoEn:1}]})))==='','líneas no autorizadas no se muestran');

/* ---------- persistencia: registrar, corregir, resolver ---------- */
(async()=>{
  const ctx={linea:'B20L',fecha:'2026-10-09',bloque:'NOCHE',motivo:'Falta de personal',descripcion:''};
  const a1=await I.registrar(ctx);
  const d1=almacen.get('2026-10-09_NOCHE_B20L');
  ok(a1==='REGISTRO'&&d1&&d1.estado==='VIGENTE'&&d1.registradoPor==='Ana Supervisora'&&d1.registradoEn===1000000&&d1.historial.length===1,'registrar: guarda motivo, responsable, hora e historial');
  ok(d1.actualizadoUid==='uid-ana'&&d1.actualizadoEn==='SERVER_TS','registrar: uid propio y hora del servidor');
  sb.__ahora=1100000;
  const a2=await I.registrar(Object.assign({},ctx,{motivo:'Falla de máquina'}));
  const d2=almacen.get('2026-10-09_NOCHE_B20L');
  ok(a2==='CORRECCION'&&d2.motivo==='Falla de máquina'&&d2.historial.length===2&&d2.historial[1].anterior.motivo==='Falta de personal','corregir: solo la incidencia vigente, conservando el valor anterior en el historial');
  ok(almacen.size===1,'sin duplicados: sigue habiendo un solo documento');
  await I.registrar({linea:'PET1',fecha:'2026-10-09',bloque:'DIA_INTERMEDIO',motivo:'Limpieza'});
  ok(almacen.size===2&&almacen.get('2026-10-09_NOCHE_B20L').motivo==='Falla de máquina','otra línea/bloque no sobrescribe esta incidencia');
  await I.registrar({linea:'B20L',fecha:'2026-10-08',bloque:'NOCHE',motivo:'Limpieza'});
  ok(almacen.get('2026-10-09_NOCHE_B20L').motivo==='Falla de máquina'&&almacen.size===3,'el motivo de otro día no se reutiliza ni se pisa');

  // resolución
  const antes=escrituras;
  let res=await I.resolverPorEvento('B20L','2026-10-09','NOCHE',1050000,'REANUDAR');
  ok(res===false&&escrituras===antes&&almacen.get('2026-10-09_NOCHE_B20L').estado==='VIGENTE','un evento ANTERIOR al registro no cierra la incidencia');
  res=await I.resolverPorEvento('B20L','2026-10-09','NOCHE',1200000,'INICIAR');
  const d3=almacen.get('2026-10-09_NOCHE_B20L');
  ok(res===true&&d3.estado==='RESUELTA'&&d3.resueltoEn===1200000&&d3.resueltoPorEvento==='INICIAR'&&d3.historial.length===3&&d3.historial[2].accion==='RESOLUCION','un inicio posterior la resuelve y el historial se conserva');
  res=await I.resolverPorEvento('B20L','2026-10-09','NOCHE',1300000,'REANUDAR');
  ok(res===false,'una incidencia ya resuelta no se vuelve a cerrar');
  sb.__ahora=1400000;
  const a3=await I.registrar(ctx);
  const d4=almacen.get('2026-10-09_NOCHE_B20L');
  ok(a3==='REGISTRO'&&d4.estado==='VIGENTE'&&d4.historial.length===4&&d4.resueltoEn===0,'un nuevo motivo reabre el mismo registro y conserva lo anterior como historial');

  // permisos
  sb.glacialQuienControla=()=>'control';
  let rechazo='';try{await I.registrar(ctx);}catch(e){rechazo=e.message;}
  ok(/permiso/i.test(rechazo),'quien no controla la línea como Producción no puede informar');
  sb.glacialQuienControla=()=>'supervisor';
  sb.glacialVista={activo:()=>true,lineaPermitida:()=>true};
  rechazo='';try{await I.registrar(ctx);}catch(e){rechazo=e.message;}
  const e0=escrituras;const r0=await I.resolverPorEvento('B20L','2026-10-09','NOCHE',9999999,'INICIAR');
  ok(/permiso/i.test(rechazo)&&r0===false&&escrituras===e0,'en Modo visualización no se registra ni se resuelve (sin escrituras)');
  sb.glacialVista=null;
  sb.state.user=null;
  ok(I.puedeVer()===false,'sin sesión no hay acceso');
  sb.state.user={nombre:'Mtto',rol:'mantenimiento_compartido'};sb.esMantCompartido=()=>true;
  ok(I.puedeVer()===false,'la cuenta compartida de Mantenimiento no lee ni informa');

  /* ---------- fuentes ---------- */
  const reglas=leer('firestore.rules.etapa2.txt');
  const bloque=reglas.slice(reglas.indexOf('match /incidenciasNoProduccion/{id}'),reglas.indexOf('match /{document=**}'));
  ok(/allow read: if autenticado\(\) && !esMantCompartido\(\)/.test(bloque)&&/allow create, update: if puedeOperarProduccion\(\)/.test(bloque)&&/allow delete: if false/.test(bloque),'reglas: leen los autenticados; escribe solo quien opera Producción; no se borra');
  ok(/actualizadoUid == request\.auth\.uid/.test(bloque)&&/actualizadoEn == request\.time/.test(bloque)&&/historial\.size\(\) >= resource\.data\.historial\.size\(\)/.test(bloque),'reglas: uid y hora del servidor; el historial solo crece');
  ok(/Falta de personal/.test(bloque)&&/id == request\.resource\.data\.fecha/.test(bloque),'reglas: motivos del catálogo e id = fecha + bloque + línea');
  const s24=leer('js/produccion/24-semaforo-produccion-actual.js');
  ok(/resolverPorEvento\(x\.linea,x\.fecha,x\.turnoPlan \|\| x\.turno,ahoraServidor\(\),accion==='iniciar'/.test(s24)&&/\['iniciar','reanudar'\]\.includes\(accion\)/.test(s24),'24: solo Iniciar / Reanudar resuelven, después de confirmarse la acción');
  ok(/data-pa-np/.test(s24)&&/Informar motivo de no producción/.test(s24)&&/Corregir motivo/.test(s24),'24: «Informar motivo de no producción» en Producción Actual');
  ok(/fila\.enProduccionReal=/.test(s24)&&/fila\.detenidaReal=/.test(s24)&&/fila\.ultimaOperacionMs=/.test(s24),'24: el resumen ejecutivo expone el estado operativo real');
  const s63=leer('js/produccion/63-incidencias-no-produccion.js');
  ok(!/Avance|paradasOperativas|avancesTurno|minPausas|minParadas/.test(s63.replace(/\/\*[\s\S]*?\*\//,'')),'63: no toca paradas de Avance/Cierre, tiempos ni ratio');
  const s32=leer('js/accesos/32-dashboard-perfiles.js');
  ok(['Avance del turno','Líneas en producción','Paradas del turno','Motivos registrados','Estado del turno'].every(t=>s32.includes("'"+t+"'")),'Inicio: las cinco tarjetas aprobadas');
  ok(/Motivo pendiente de registrar/.test(s32)&&/Sin programación para evaluar/.test(s32)&&/SIN PROGRAMACIÓN/.test(s32)&&/SIN DATOS PARA EVALUAR/.test(s32)&&/Sin incidencias de no producción registradas/.test(s32),'Inicio: textos de motivo pendiente, sin programación y sin datos');
  ok(!/Líneas detenidas/.test(s32.slice(s32.indexOf('function cpEjecutivoHTML'),s32.indexOf('function cpEjecutivoStyles'))),'Inicio: ya no hay tarjeta superior «Líneas detenidas»');
  ok(/lineasAutorizadas/.test(s32)&&/totalLineas/.test(s32),'Inicio: el denominador usa las líneas autorizadas (no fija cinco)');
  const idx=leer('index.html');
  ok(idx.indexOf('62-reporte-registro.js')<idx.indexOf('63-incidencias-no-produccion.js')&&idx.indexOf('63-incidencias-no-produccion.js')<idx.indexOf('32-dashboard-perfiles.js'),'index: 63 se carga antes del Inicio');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
