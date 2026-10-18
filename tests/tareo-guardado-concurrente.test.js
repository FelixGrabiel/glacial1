/* Tareo: guardado concurrente sin pérdidas, duplicados ni sobrescrituras (13n-tareo-nube.js + 13 + 45, funciones reales).
   La nube simulada (tareo-harness.js) reproduce el conflicto real de Firestore: una transacción cuyo documento cambió antes de confirmar
   se reintenta 5 veces y luego falla con «the stored version (…) does not match the required base version (…)». */
const {cargarCliente,crearNube,crearTareo,clonar,espera,leerDisco}=require('./tareo-harness.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const silenciar=()=>{const w=console.warn,e=console.error,i=console.info;console.warn=()=>{};console.error=()=>{};console.info=()=>{};return ()=>{console.warn=w;console.error=e;console.info=i;};};

function montar(opc){
  const nube=crearNube(Object.assign({latencia:5,latenciaSnapshot:2},opc));
  const t=crearTareo({id:'tareo-1',fecha:'2026-10-14',n:6});
  const t2=crearTareo({id:'tareo-2',fecha:'2026-10-13',n:3,area:'Mantenimiento'});
  nube.items=[clonar(t),clonar(t2)];
  const a=cargarCliente(nube,{usuario:'ana-sup',almacen:opc&&opc.almacenA});a.abrir('tareo-1');
  const b=cargarCliente(nube,{usuario:'beto-sup'});b.abrir('tareo-1');
  return {nube,a,b};
}
const persona=(cl,id,clave)=>{const t=cl.vista().find(x=>x.id===id);return t&&t.personal.find(p=>cl.sb.tareoClavePersona(p)===clave);};

(async()=>{
  const restaurar=silenciar();
  for(const porDocumento of [false,true]){
    const M=porDocumento?'[documento por tareo] ':'[sync/tareos] ';

    /* 1 y 11: dos supervisores (o dos pestañas) marcan a trabajadores distintos a la vez, con transacciones cruzadas */
    {const {nube,a,b}=montar({porDocumento,latenciaCommit:15});
     a.sb.tareoMarcarAsistio('T0');b.sb.tareoMarcarAsistio('T1');a.sb.tareoMarcarAsistio('T2');b.sb.tareoMarcarAsistio('T3');
     await espera(900);
     ok(['T0','T1','T2','T3'].every(k=>persona(a,'tareo-1',k).asistencia==='Asistió'),M+'1. A y B marcan trabajadores distintos al mismo tiempo: los cuatro quedan guardados');
     ok(nube.conflictos>0,M+'1. hubo transacciones cruzadas (conflictos de versión: '+nube.conflictos+') y aun así nada se perdió');
     ok(a.log.alertas.length===0&&b.log.alertas.length===0,M+'1. sin alertas de error');
     ok(a.sb.TareoEd.sinConfirmar().length===0&&b.sb.TareoEd.sinConfirmar().length===0,M+'1. nada queda pendiente');}

    /* 2: campos distintos del mismo trabajador */
    {const {a,b}=montar({porDocumento,latenciaCommit:10});
     a.sb.tareoMarcarAsistio('T0');await espera(300);a.abrir('tareo-1');b.abrir('tareo-1');
     a.sb.actualizarSalidaRefrigerioTareo('T0','12:10');b.sb.actualizarHoraSalidaTareo('T0','17:20');
     await espera(700);
     const p=persona(a,'tareo-1','T0');
     ok(p.salidaRefrigerio==='12:10'&&p.horaSalida==='17:20',M+'2. A cambia el refrigerio y B la salida del mismo trabajador: se conservan ambos');}

    /* 3: el MISMO campo a la vez → se detecta el conflicto, no hay sobrescritura silenciosa */
    {const {a,b}=montar({porDocumento,latenciaCommit:10});
     a.sb.tareoMarcarAsistio('T0');await espera(300);a.abrir('tareo-1');b.abrir('tareo-1');
     a.sb.actualizarHoraSalidaTareo('T0','17:00');
     b.sb.actualizarHoraSalidaTareo('T0','17:30');                    // a la vez: B no alcanzó a ver el 17:00 de A
     await espera(600);
     const opB=b.sb.TareoEd.estado().find(o=>o.campos&&o.campos.horaSalida==='17:30');
     ok(persona(a,'tareo-1','T0').horaSalida==='17:00',M+'3. la salida que llegó primero (17:00) no se pisa en silencio');
     ok(opB&&opB.estado==='conflicto'&&/Otro usuario cambió horaSalida a «17:00»/.test(opB.error),M+'3. B ve «Conflicto: revisar» con el valor del otro usuario');
     ok(b.sb.TareoEd.sinConfirmar().length===1,M+'3. el cambio de B se conserva como pendiente de revisión (no se descarta)');
     b.sb.TareoEd.reintentar();await espera(500);
     ok(persona(a,'tareo-1','T0').horaSalida==='17:30'&&b.sb.TareoEd.sinConfirmar().length===0,M+'3. Reintentar tras revisar deja el valor de B (decisión explícita)');}

    /* 3b: si B ya vio el valor de A y lo cambia, su edición vale aunque el reloj de su equipo vaya atrasado */
    {const {a,b}=montar({porDocumento});
     a.sb.tareoMarcarAsistio('T1');a.sb.actualizarHoraSalidaTareo('T1','17:00');await espera(400);
     b.sb.actualizarHoraSalidaTareo('T1','17:45');await espera(400);
     ok(persona(a,'tareo-1','T1').horaSalida==='17:45'&&b.sb.TareoEd.sinConfirmar().length===0,M+'3b. corregir lo que otro guardó (ya visto) se aplica, aun con el reloj del equipo atrasado');}

    /* 4: la salida registrada por uno aparece en tiempo real para quien consulta */
    {const {a,b}=montar({porDocumento});
     a.sb.tareoMarcarAsistio('T4');a.sb.actualizarHoraSalidaTareo('T4','18:05');
     await espera(400);
     const enB=b.sb._tareosCache.find(x=>x.id==='tareo-1').personal.find(p=>b.sb.tareoClavePersona(p)==='T4');
     ok(enB&&enB.horaSalida==='18:05',M+'4. la salida guardada por A aparece en la vista de B sin recargar');}

    /* 5, 6 y 7: sin conexión → pendiente (no «guardado»), se conserva al recargar y se confirma una sola vez */
    {const almacenA=new Map();
     const {nube,a}=montar({porDocumento,almacenA});
     nube.caida=true;nube.codigoCaida='unavailable';
     a.sb.tareoMarcarAsistio('T5');
     await espera(400);
     const e=a.sb.TareoEd.estado().find(o=>o.campos&&o.campos.asistencia==='Asistió');
     ok(e&&e.estado==='error'&&e.tipoError==='sin_conexion'&&e.error===a.sb.TareoNube.MENSAJES.sin_conexion,M+'5. sin conexión: queda «Pendiente de sincronización», nunca «guardado»');
     ok(persona(a,'tareo-1','T5').asistencia==='',M+'5. nada llegó a la nube');
     ok([...almacenA.keys()].some(k=>/glacial\.tareo\.pendientes\.ana-sup/.test(k)),M+'7. el pendiente queda guardado en este equipo (por usuario)');
     // «recarga»: otra sesión del mismo usuario en el mismo navegador, con la red de vuelta
     nube.caida=false;
     const a2=cargarCliente(nube,{usuario:'ana-sup',almacen:almacenA});a2.abrir('tareo-1');
     nube.oyentes.forEach(f=>f(clonar(nube.items)));
     await espera(500);
     const t1=a2.vista().find(x=>x.id==='tareo-1');
     ok(persona(a2,'tareo-1','T5').asistencia==='Asistió',M+'6/7. tras recargar con conexión: el pendiente se recupera y se guarda');
     ok(t1.personal.length===6&&t1.personal.filter(p=>a2.sb.tareoClavePersona(p)==='T5').length===1,M+'6. se confirma una sola vez: sin filas duplicadas');
     ok(![...almacenA.keys()].some(k=>/pendientes/.test(k)),M+'6. confirmado: el pendiente se borra del equipo');}

    /* 8: pulsar varias veces */
    {const {nube,a}=montar({porDocumento});
     for(let i=0;i<4;i++)a.sb.tareoMarcarAsistio('T1');
     await espera(500);
     const t=a.vista().find(x=>x.id==='tareo-1');
     ok(t.personal.length===6&&t.personal.filter(p=>p.asistencia==='Asistió').length===1,M+'8. pulsar ASISTIÓ varias veces: un solo registro, sin duplicados');}

    /* 9: solo lectura */
    {const nube=crearNube({porDocumento});nube.items=[crearTareo({id:'tareo-1',n:3})];
     const v=cargarCliente(nube,{usuario:'gerencia',soloConsulta:true,areas:[]});v.abrir('tareo-1');
     const antes=nube.transacciones;
     try{v.sb.tareoMarcarAsistio('T0');}catch(_){/* bloqueado */}
     await espera(200);
     ok(nube.transacciones===antes&&persona(v,'tareo-1','T0').asistencia==='',M+'9. usuario de solo consulta: la app no escribe nada');}

    /* contención extrema: Firestore agota sus 5 intentos (el error del reporte) y la capa reintenta sin perder el cambio */
    {const {nube,a}=montar({porDocumento});
     nube.forzarConflictos=7;
     a.sb.tareoMarcarAsistio('T2');
     await espera(600);
     ok(persona(a,'tareo-1','T2').asistencia==='Asistió'&&a.log.alertas.length===0,M+'«stored version does not match the required base version» tras 5 intentos: se reintenta solo y se guarda');}

    /* eliminar un tareo mientras otro supervisor marca en otro tareo */
    {const {nube,a,b}=montar({porDocumento,latenciaCommit:10});
     b.abrir('tareo-2');b.sb.tareoMarcarAsistio('T0');
     a.sb.confirmarEliminacionTareo=async()=>true;
     await a.sb.eliminarTareo('tareo-1');
     await espera(600);
     const vista=a.vista();
     ok(!vista.some(x=>x.id==='tareo-1')&&persona(a,'tareo-2','T0').asistencia==='Asistió',M+'eliminar un tareo no borra lo que otro supervisor marcó en otro tareo');
     if(porDocumento)ok(nube.docs.get('tareo-1')&&nube.docs.get('tareo-1').eliminado===true&&nube.docs.get('tareo-1').personal.length===6,M+'eliminar deja una marca con los datos (recuperable)');}
  }

  /* Fase 2: migración al guardar, sin tocar sync/tareos */
  {const {nube,a}=montar({porDocumento:true});
   const legadoAntes=JSON.stringify(nube.items);
   a.sb.tareoMarcarAsistio('T3');await espera(400);
   ok(nube.escriturasLegado===0&&JSON.stringify(nube.items)===legadoAntes,'[documento por tareo] sync/tareos no se escribe ni se borra (lectura de transición, reversible)');
   ok(nube.docs.has('tareo-1')&&!nube.docs.has('tareo-2'),'[documento por tareo] solo el tareo modificado pasa a su documento (migración al guardar)');
   ok(a.vista().find(x=>x.id==='tareo-2').personal.length===3,'[documento por tareo] los tareos aún no migrados se siguen leyendo de sync/tareos');
   const tam=JSON.stringify(nube.docs.get('tareo-1')).length;
   ok(tam<100000,'[documento por tareo] cada documento es pequeño ('+tam+' bytes, límite 1 MiB)');}
  {// un equipo con la versión anterior escribe sync/tareos después de la migración: su marca no se pierde en la lectura combinada
   const {nube,a}=montar({porDocumento:true});
   a.sb.tareoMarcarAsistio('T0');await espera(300);
   const viejo=clonar(nube.items);const p1=viejo[0].personal.find(p=>a.sb.tareoClavePersona(p)==='T1');
   p1.asistencia='Asistió';p1.actualizadoEn=9e12;viejo[0].actualizadoEn=9e12;
   nube.items=viejo;
   ok(persona(a,'tareo-1','T0').asistencia==='Asistió'&&persona(a,'tareo-1','T1').asistencia==='Asistió','[documento por tareo] transición: lo que marcó un equipo con la versión anterior se combina campo a campo, no se pierde');}

  /* mensajes según el tipo de error */
  {const {a}=montar({});const N=a.sb.TareoNube;
   const t=(e,tipo)=>N.clasificarError(e).tipo===tipo;
   ok(t({code:'failed-precondition',message:'the stored version (1) does not match the required base version (2)'},'conflicto')&&
      N.clasificarError({message:'the stored version (1791991570656154) does not match the required base version (1791991565423214)'}).mensaje===N.MENSAJES.conflicto,'mensajes: conflicto de versiones');
   ok(t({code:'permission-denied',message:'Missing or insufficient permissions.'},'permisos')&&!N.clasificarError({code:'permission-denied'}).reintentable,'mensajes: permisos (no se reintenta)');
   ok(t({code:'unavailable'},'sin_conexion')&&t({code:'deadline-exceeded'},'temporal')&&t({code:'invalid-argument',message:'Document exceeds the maximum allowed size of 1,048,576 bytes'},'tamano'),'mensajes: sin conexión, temporal y tamaño');
   ok(N.MENSAJES.ok==='Tareo guardado en la nube.'&&!/falta permiso|internet/i.test(N.MENSAJES.conflicto),'mensajes: ya no se atribuye todo a «falta permiso o internet»');}

  /* estructura */
  const reglas=leerDisco('_archivo/firebase/firestore.rules.etapa2.txt');
  ok(/match \/tareos\/\{id\}[\s\S]*?allow create, update: if autenticado\(\) && !esMantCompartido\(\) && !soloVista\(\)[\s\S]*?request\.resource\.data\.id == id[\s\S]*?allow delete: if false/.test(reglas),'reglas: tareos/{id} con los mismos permisos que sync/tareos, id coherente y sin borrado');
  ok(/TAREO_POR_DOCUMENTO_POR_ENTORNO = \{ PRODUCCION: false, PRUEBAS: false \}/.test(leerDisco('js/nucleo/01-config.js')),'la Fase 2 queda apagada hasta publicar las reglas (interruptor por entorno)');
  const s13=leerDisco('js/personal/13-tareo.js');
  ok(!/guardarTareos\(\s*obtenerTareos\(\)\.filter/.test(s13),'eliminar ya no reescribe el documento completo con la copia local');
  restaurar();
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
