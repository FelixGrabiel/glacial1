/* Inicio: la tarjeta «Distribución de personal» reemplaza a «Estado del turno» y la tabla «Personal por línea» pasa al detalle.
   Se ejecutan las funciones reales de 32-dashboard-perfiles.js (extraídas del archivo) sobre 43-distribucion-personal.js real,
   con Firestore simulado (respuestas asíncronas, como en la app). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const s32=leer('js/accesos/32-dashboard-perfiles.js');
const fn=nombre=>{const i=s32.indexOf('function '+nombre+'(');if(i<0)throw new Error('falta '+nombre);
  let j=s32.indexOf('{',i),n=0;for(;j<s32.length;j++){if(s32[j]==='{')n++;else if(s32[j]==='}'&&--n===0)break;}return s32.slice(i,j+1);};
const seccion=s32.slice(s32.indexOf('let cpPersonalClave'),s32.indexOf('function cpEjecutivoHTML'));

const F='2026-10-13',AHORA=new Date(2026,9,13,23,30).getTime();
const h=(hh,mm)=>new Date(2026,9,13,hh,mm).getTime();
function crear(opc){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,Promise,setTimeout};vm.createContext(sb);sb.window=sb;sb.globalThis=sb;
  sb.state={user:{rol:'Gerente General'},currentTab:'centro-perfil'};
  sb.tareoAhoraServidor=()=>AHORA;
  sb.tareoAreaDe=t=>t.area==='Mantenimiento'?'Mantenimiento':'Producción';
  sb.tienePermiso=p=>(opc.permisos||['ver_inicio_ejecutivo']).includes(p);
  sb.GlacialIndicadores={horarioBloque:(f,t)=>t==='NOCHE'?{inicio:new Date(f+'T19:00:00').getTime(),fin:new Date(f+'T19:00:00').getTime()+12*3600000}:{inicio:new Date(f+'T07:00:00').getTime(),fin:new Date(f+'T19:00:00').getTime()},
    nombreBloque:t=>t};
  sb.obtenerTareos=()=>opc.tareos||[];
  sb.refrescos=0;
  sb.datosPorClave=opc.datos||{};
  const snap=d=>({exists:!!d,data:()=>d});
  sb.db={collection:()=>({doc:id=>({
    onSnapshot:(cb,err)=>{setTimeout(()=>{const x=sb.datosPorClave[id];if(x&&x.error)err({code:'unavailable'});else cb(snap(x&&x.eventos.length?{version:x.eventos.length}:null));},opc.demora&&opc.demora[id]||0);return ()=>{};},
    collection:()=>({orderBy:()=>({onSnapshot:(cb,err)=>{setTimeout(()=>{const x=sb.datosPorClave[id];if(x&&x.error)err({code:'unavailable'});else cb({docs:(x?x.eventos:[]).map(e=>({data:()=>e}))});},opc.demora&&opc.demora[id]||0);return ()=>{};}})})
  })})};
  sb.firebase={auth:()=>({currentUser:null}),firestore:{FieldValue:{serverTimestamp:()=>0}}};
  vm.runInContext(leer('js/personal/43-distribucion-personal.js'),sb);
  vm.runInContext([fn('cpEsc'),fn('cpNum'),fn('cpFmt'),fn('cpNombreLinea'),fn('cpHoraCorta'),fn('cpAhoraMs'),fn('cpPuede'),fn('cpPuedeVerInicioEjecutivo'),fn('cpFechaBonita')].join('\n')
    +'\nfunction cpIcon(){return "";}\nfunction cpEnProduccion(f){return f.producido>0;}\nfunction cpRefrescarEjecutivo(){refrescos++;}\n'+seccion,sb);
  return sb;
}
const esperar=()=>new Promise(r=>setTimeout(r,30));
const ev=(id,ver,desde,lineas,apoyo)=>({opId:id,version:ver,desdeMs:desde,lineas,apoyoCompartido:apoyo,usuario:'Luis'});
const persona=(id,a='Asistió')=>({trabajadorId:id,nombre:id,asistencia:a});
const filas=[{linea:'PET1',producido:0},{linea:'PET2',producido:2880},{linea:'B7L',producido:1338}];
const d=(fecha,turno)=>({fecha,turno,filas,lineasAutorizadas:['PET1','PET2','B7L','C20L','B20L']});
const tareos42=[{area:'Producción',fecha:F,turno:'Noche',personal:Array.from({length:42},(_,i)=>persona('t'+i)).concat([persona('t0'),persona('f','Falta por justificar')])},
  {area:'Mantenimiento',fecha:F,turno:'Noche',personal:[persona('t1'),persona('m1')]}];
const texto=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

(async()=>{
  /* 1) Datos de la captura: versión anterior + vigente; CAJAS pendiente; duplicado y Mantenimiento en el Tareo. */
  const base={[F+'_NOCHE']:{eventos:[ev('a',1,h(21,0),{PET1:5,PET2:7,B7L:9,C20L:null,B20L:2},9),ev('b',2,h(22,0),{PET1:6,PET2:7,B7L:10,C20L:null,B20L:0},9)]}};
  let sb=crear({datos:base,tareos:tareos42});
  let r=sb.cpPersonalPorLinea(d(F,'NOCHE'));
  ok(r&&!r.sincronizado&&/Consultando/.test(sb.cpDistribucionKpi(r)),'mientras llega la respuesta: «Consultando…» (no se muestra una distribución vacía)');
  await esperar();
  r=sb.cpPersonalPorLinea(d(F,'NOCHE'));
  ok(sb.refrescos>0,'al llegar la distribución, Inicio se redibuja solo (mecanismo de sincronización existente)');
  const k=sb.cpDistribucionKpi(r),kt=texto(k);
  ok(r.lineas.map(x=>x.linea).join()==='PET1,PET2,B7L,C20L,B20L','las cinco líneas aparecen, aunque B20L y CAJAS 20L no produzcan');
  ok(r.distribuido===23&&r.apoyo===9,'se toma SOLO la versión vigente (22:00): 6+7+10+0 = 23, sin sumar la versión de las 21:00');
  ok(/CAJAS 20L ?<\/span>\s*<em class="cp-ds-pend">Pendiente<\/em>/.test(k)||/CAJAS 20L\s+Pendiente/.test(kt),'línea sin confirmar: «Pendiente», nunca 0');
  ok(/B20L[^<]*(<i[^>]*>⚠<\/i>)?\s*<\/span>\s*<strong>0<\/strong>/.test(k),'cero confirmado: se muestra 0');
  ok(r.disponible===42,'total con asistencia = 42 personas distintas del Tareo (sin duplicado, sin faltas, sin Mantenimiento ni espejo)');
  ok(r.sinAsignar===42-23-9&&/Sin asignar\s+10/.test(kt),'sin asignar = 42 − 23 − 9 = 10 (el apoyo compartido no se suma a ninguna línea)');
  ok(/Asignados a líneas\*/.test(kt)&&/Incompleta: CAJAS 20L pendiente/.test(kt),'distribución incompleta: se marca y se nombra la línea pendiente');
  ok(/Vigente desde/.test(kt)&&/Ver distribución →/.test(kt),'hora de vigencia y enlace «Ver distribución →»');
  ok(r.advertencias===1&&/1 advertencia/.test(kt)&&r.lineas.find(x=>x.linea==='PET1').alerta==='parado','advertencia compacta: PET1 tiene personal y no produce');
  const det=sb.cpDistribucionDetalleHTML(d(F,'NOCHE'),r),dt=texto(det);
  ok(/Tiene personal y no produce/.test(dt)&&/En producción/.test(dt)&&/Sin producción/.test(dt)&&/Observación/.test(dt),'detalle: línea, estado de producción, personal y observación');
  ok(/Total con asistencia\s+42/.test(dt)&&/Sin asignar\s+10/.test(dt)&&/no se verifica persona por persona/.test(dt),'detalle: totales y aviso de que la distribución guarda cantidades, no nombres');
  ok(!/onclick="[^"]*(guardar|editar|eliminar|reasignar|abrirDistribucion)/i.test(k+det)&&!/<input|<select|contenteditable/i.test(k+det),'solo consulta: ni la tarjeta ni el detalle tienen acciones de edición');

  /* 2) Línea que produce sin personal confirmado. */
  sb.datosPorClave[F+'_DIA']={eventos:[ev('c',1,h(8,0),{PET1:0,PET2:null,B7L:3,C20L:0,B20L:0},0)]};
  r=sb.cpPersonalPorLinea(d(F,'DÍA'));await esperar();r=sb.cpPersonalPorLinea(d(F,'DÍA'));
  ok(r.lineas.find(x=>x.linea==='PET2').alerta==='sinpersonal'&&/Produce sin personal confirmado/.test(sb.cpDistribucionDetalleHTML(d(F,'DÍA'),r)),'PET2 produce y está pendiente: «Produce sin personal confirmado»');
  ok(r.disponible===null&&/Sin Tareo/.test(sb.cpDistribucionKpi(r))&&r.sinAsignar===null,'sin asistencia en el Tareo del bloque: «Sin Tareo» y «Sin asignar» sin cifra inventada');

  /* 3) Cambio de contexto: otra fecha no trae los datos de la seleccionada antes; una respuesta tardía no pisa la actual. */
  sb=crear({datos:{...base,'2026-10-12_NOCHE':{eventos:[ev('z',1,new Date(2026,9,12,20,0).getTime(),{PET1:1,PET2:1,B7L:1,C20L:1,B20L:1},0)]}},tareos:tareos42,demora:{[F+'_NOCHE']:60}});
  sb.cpPersonalPorLinea(d(F,'NOCHE'));                       // pide el 13 (llegará tarde)
  r=sb.cpPersonalPorLinea(d('2026-10-12','NOCHE'));          // el usuario cambia al 12
  await esperar();r=sb.cpPersonalPorLinea(d('2026-10-12','NOCHE'));
  ok(r.distribuido===5&&r.disponible===null,'fecha histórica: se usa la distribución de ESE día (5), no la de hoy; su Tareo no tiene asistencia');
  await new Promise(x=>setTimeout(x,80));
  r=sb.cpPersonalPorLinea(d('2026-10-12','NOCHE'));
  ok(r.distribuido===5,'la respuesta tardía del 13 no sobrescribe la consulta del 12');
  ok(vm.runInContext('cpPersonalClave',sb)==='2026-10-12|NOCHE','se escucha solo el contexto seleccionado');

  /* 4) Sin distribución, error de carga y reintento: estados distintos. */
  sb=crear({datos:{},tareos:tareos42});
  sb.cpPersonalPorLinea(d(F,'NOCHE'));await esperar();r=sb.cpPersonalPorLinea(d(F,'NOCHE'));
  ok(!r.hayDistribucion&&/Distribución pendiente de registrar/.test(sb.cpDistribucionKpi(r))&&!/Reintentar/.test(sb.cpDistribucionKpi(r)),'sin distribución registrada: «Distribución pendiente de registrar»');
  sb=crear({datos:{[F+'_NOCHE']:{error:true,eventos:[]}},tareos:tareos42});
  sb.cpPersonalPorLinea(d(F,'NOCHE'));await esperar();r=sb.cpPersonalPorLinea(d(F,'NOCHE'));
  const ke=sb.cpDistribucionKpi(r);
  ok(r.error&&/No se pudo consultar/.test(ke)&&/cpPersonalReintentar\(\)/.test(ke)&&!/pendiente de registrar/.test(ke),'error de carga: mensaje y «Reintentar», no una distribución vacía');
  sb.datosPorClave[F+'_NOCHE']=base[F+'_NOCHE'];sb.cpPersonalReintentar();
  ok(vm.runInContext('cpPersonalClave',sb)==='','reintentar cierra la escucha y la vuelve a abrir');
  sb.cpPersonalPorLinea(d(F,'NOCHE'));await esperar();r=sb.cpPersonalPorLinea(d(F,'NOCHE'));
  ok(!r.error&&r.distribuido===23,'tras reintentar se muestra la distribución');

  /* 5) Inconsistencia: se asignó más personal del que asistió. */
  sb=crear({datos:{[F+'_NOCHE']:{eventos:[ev('x',1,h(20,0),{PET1:30,PET2:10,B7L:10,C20L:0,B20L:0},5)]}},tareos:tareos42});
  sb.cpPersonalPorLinea(d(F,'NOCHE'));await esperar();r=sb.cpPersonalPorLinea(d(F,'NOCHE'));
  ok(r.sinAsignar===42-50-5&&/cp-ds-neg/.test(sb.cpDistribucionKpi(r))&&/Inconsistencia: se asignaron 13 más/.test(texto(sb.cpDistribucionDetalleHTML(d(F,'NOCHE'),r))),'inconsistencia visible (−13), sin forzar que cuadre');

  /* 6) Permisos: sin «ver_inicio_ejecutivo» el detalle no se abre. */
  sb=crear({datos:base,tareos:tareos42,permisos:[]});
  let pidio=false;sb.cpDatosEjecutivo=()=>{pidio=true;return null;};sb.document={getElementById:()=>null};
  sb.cpVerDistribucion();
  ok(!pidio,'sin permiso de Inicio ejecutivo, «Ver distribución» no consulta ni muestra datos');

  /* 7) Estructura de Inicio. */
  const ejec=s32.slice(s32.indexOf('function cpEjecutivoHTML'),s32.indexOf('function cpEjecutivoStyles'));
  ok(/tarjeta\('team','Distribución de personal',tDistribucion,'cp-ds'\)\}<\/div>`/.test(ejec)&&!/'Estado del turno'/.test(ejec),'la quinta tarjeta (extremo derecho) es «Distribución de personal»; «Estado del turno» ya no está');
  ok(/\$\{cabecera\}\$\{kpis\}\$\{tarjetaSP\}/.test(ejec)&&!/cpPersonalPorLineaHTML|tarjetaPersonal/.test(s32),'la tabla grande «Personal por línea» ya no se repite en Inicio');
  ok(/cpRefrescarDistribucionAbierta\(\);/.test(fn('cpRefrescarEjecutivo')),'el detalle abierto se actualiza con los cambios');
  const s43=leer('js/personal/43-distribucion-personal.js');
  ok(/c\.listo=conParent&&conEventos/.test(s43)&&/const fallo=e=>\{c\.error=/.test(s43),'43: «listo» exige versión e historial; los errores de lectura quedan registrados');

  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
