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

/* Regla vigente (Inicio · «Líneas sin producción»): EN PRODUCCIÓN = unidades > 0 en la fecha y el bloque. Cada línea autorizada sin unidades aparece
   una vez: motivo informado, «Sin programación» automático, programación cancelada, bloque aún no iniciado o «Motivo pendiente». */
const de=(r,l)=>r.find(x=>x.linea===l);
let r=sp([fila('B20L')]);
ok(de(r,'B20L').pendiente&&de(r,'B20L').causa==='SIN_PRODUCCION','línea con programación y sin unidades: «Motivo pendiente» (no se inventa una causa)');
ok(r.length===5&&r.filter(x=>x.causa==='SIN_PROGRAMACION'&&!x.pendiente).length===4,'las líneas sin programación aparecen con «Sin programación» automático y no exigen motivo');
r=sp([],{incidencias:[{id:'x',linea:'B20L',estado:'VIGENTE',motivo:'Falta de personal',descripcion:'',registradoPor:'Ana',registradoEn:900000}]});
ok(!de(r,'B20L').pendiente&&de(r,'B20L').motivo==='Falta de personal'&&de(r,'B20L').por==='Ana'&&de(r,'B20L').en===900000,'B20L muestra «Falta de personal», quién y cuándo, aun sin paletas, avance ni programación');
r=sp([fila('B7L',{estado:'DETENIDA',detenidaReal:true,iniciadaReal:true,producido:0,detalle:[{estado:'DETENIDA'}]})]);
ok(de(r,'B7L').pendiente&&de(r,'B7L').causa==='DETENIDA','línea detenida sin unidades y sin motivo: pendiente (causa DETENIDA)');
r=sp([fila('B7L',{estado:'DETENIDA',detenidaReal:true,iniciadaReal:true,producido:300,detalle:[{estado:'DETENIDA'}]})]);
ok(!de(r,'B7L'),'una línea que ya produjo en el bloque no figura «sin producción» aunque ahora esté detenida');
ok(!de(sp([fila('PET2',{producido:0,producidoFisico:500})]),'PET2'),'la producción fuera de programación también cuenta como producción (criterio físico)');
r=sp([fila('PET1',{estado:'PENDIENTE'})],{ahora:400000});
ok(de(r,'PET1').causa==='BLOQUE_NO_INICIA'&&!de(r,'PET1').pendiente,'el bloque aún no inicia: aparece sin exigir motivo');
r=sp([fila('PET1',{estado:'COMPLETADA',producido:1000,iniciadaReal:true,detalle:[{estado:'COMPLETADA'}]}),fila('PET2',{estado:'CANCELADA',detalle:[{estado:'CANCELADA'}]}),fila('C20L',{estado:'EN_CURSO',enProduccionReal:true,iniciadaReal:true,producido:20,detalle:[{estado:'EN_CURSO'}]})]);
ok(!de(r,'PET1')&&!de(r,'C20L')&&de(r,'PET2').causa==='CANCELADA'&&!de(r,'PET2').pendiente,'con unidades: no aparecen; programación toda cancelada: «Programación cancelada» sin exigir motivo');
ok(sp([]).length===5&&sp([]).every(x=>!x.pendiente),'turno sin programación: todas «Sin programación», ninguna pendiente');
r=sp([fila('PET1')],{bloqueActual:false});
ok(de(r,'PET1').pendiente,'un bloque pasado también se evalúa (Inicio muestra el turno seleccionado)');
ok(de(sp([],{incidencias:[{linea:'PET1',estado:'RESUELTA',motivo:'Limpieza',registradoEn:1}]}),'PET1').causa==='SIN_PROGRAMACION','una incidencia resuelta ya no aparece como vigente');
const inc={linea:'PET1',estado:'VIGENTE',motivo:'Mantenimiento',registradoPor:'Ana',registradoEn:900000};
ok(!de(sp([fila('PET1',{estado:'EN_CURSO',enProduccionReal:true,iniciadaReal:true,producido:50,detalle:[{estado:'EN_CURSO'}]})],{incidencias:[inc]}),'PET1'),'si la línea ya produce, deja de figurar sin producción aunque su motivo siga vigente');
ok(lin(I.sinProduccion(Object.assign(base([]),{lineas:['PET1','B20L'],incidencias:[{linea:'PET2',estado:'VIGENTE',motivo:'Limpieza',registradoEn:1}]})))==='PET1,B20L','líneas no autorizadas no se muestran');
ok(I.enProduccion({producido:1})&&!I.enProduccion({producido:0})&&!I.enProduccion(null),'enProduccion: unidades > 0 (mismo criterio para la tarjeta «Líneas en producción»)');

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
  ok(['Avance del turno','Líneas en producción','Paradas del turno','Motivos registrados','Distribución de personal'].every(t=>s32.includes("'"+t+"'")),'Inicio: las cinco tarjetas aprobadas');
  ok(/Motivo pendiente de registrar/.test(s32)&&/Sin programación para evaluar/.test(s32)&&/Todas las líneas están en producción\./.test(s32),'Inicio: textos de motivo pendiente, sin programación y todas en producción');
  ok(!/Líneas detenidas/.test(s32.slice(s32.indexOf('function cpEjecutivoHTML'),s32.indexOf('function cpEjecutivoStyles'))),'Inicio: ya no hay tarjeta superior «Líneas detenidas»');
  ok(/lineasAutorizadas/.test(s32)&&/totalLineas/.test(s32),'Inicio: el denominador usa las líneas autorizadas (no fija cinco)');
  const idx=leer('index.html');
  ok(idx.indexOf('62-reporte-registro.js')<idx.indexOf('63-incidencias-no-produccion.js')&&idx.indexOf('63-incidencias-no-produccion.js')<idx.indexOf('32-dashboard-perfiles.js'),'index: 63 se carga antes del Inicio');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
