/* Planificación · cargar la programación de WhatsApp (66w) con el guardado real de la secuencia (66b) en una nube falsa (25/11/2026).
   Mensaje real: tests/datos/programacion-whatsapp-24-25-11.txt. node tests/planificacion-whatsapp-cargar.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const {nube,dispositivo,items}=require('./planificacion-harness');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const c=fs.readFileSync(R+'/js/nucleo/01-config.js','utf8');
const bloque=n=>{const i=c.indexOf('const '+n);return c.slice(i,c.indexOf('};',i)+2);};
const ctx={};vm.createContext(ctx);
vm.runInContext(['RATIOS_PRESENTACION_PET1','RATIOS_PRESENTACION_PET2','MARCAS_POR_LINEA','PRESENTACIONES_POR_LINEA'].map(bloque).join('\n')+';__c={MARCAS_POR_LINEA,PRESENTACIONES_POR_LINEA};',ctx);
const T=(f,h)=>new Date(f+'T'+h+':00').getTime();
const msg=fs.readFileSync(__dirname+'/datos/programacion-whatsapp-24-25-11.txt','utf8');

function entorno(prog,usuario){
  const N=nube();
  N.docs.set('sync/programaciones',{items:prog||[]});
  N.docs.set('sync/catalogoPlanificacion',{items:[],tiempos:{reglas:[],ventanas:[],version:1}});
  N.docs.set('sync/records',{items:[]});
  const sb=dispositivo(N,Object.assign({nombre:'Bot'},usuario||{}),{ahora:T('2026-11-24','12:00')});
  sb.LINES=['PET1','PET2','B7L','C20L','B20L'].map(k=>({key:k,name:k}));
  sb.MARCAS_POR_LINEA=JSON.parse(JSON.stringify(ctx.__c.MARCAS_POR_LINEA));sb.PRESENTACIONES_POR_LINEA=JSON.parse(JSON.stringify(ctx.__c.PRESENTACIONES_POR_LINEA));
  sb.obtenerUnidadesPorPalet=()=>200;
  sb.glacialVelocidadEstandar=(l,p,m)=>({PET1:1920,PET2:4500,B7L:600,C20L:100,B20L:80})[l]||0;
  sb.puedeEntrarPlanificacion=()=>true;
  sb.loadRecords=()=>[];sb.normalizarCuadros=r=>r.cuadros||[];sb.PROD={};sb.glacialProducidoVigente=()=>null;
  sb.loadUsers=()=>[{username:'ana',nombre:'Ana Planificación',whatsapp:'51987654321',rol:'Planificación'},{username:'luis',nombre:'Luis',whatsapp:'51911222333',rol:'Supervisor'}];
  sb.planificacionPermitida=u=>u.rol==='Planificación';
  vm.runInContext(fs.readFileSync(R+'/js/produccion/66w-planificacion-whatsapp.js','utf8'),sb);
  sb.escuchar();
  return {N,sb,W:sb.glacialProgramacionWhatsApp};
}
(async()=>{
  // Ya había un plan en B7L del 24/11 Noche (Glacial 1,000): la programación de WhatsApp lo reemplaza.
  const previo={id:'x1',clave:'B7L|2026-11-24|NOCHE|GLACIAL|7 Litros',linea:'B7L',fecha:'2026-11-24',turno:'NOCHE',marca:'GLACIAL',presentacion:'7 Litros',cantidadProgramada:1000,unidadesPorPaleta:200,paletasProgramadas:5,version:1};
  const {N,sb,W}=entorno([previo]);
  ok(W&&sb.NS.whatsapp===W,'el módulo se conecta a Planificación');
  ok(W.remitente('+51 987 654 321').ok&&W.remitente('+51 987 654 321').usuario==='Ana Planificación','remitente: el número de Ana es de un usuario con permiso de Planificación');
  ok(!W.remitente('911222333').ok&&/no tiene permiso/.test(W.remitente('911222333').motivo)&&!W.remitente('900000000').ok&&/no está registrado/.test(W.remitente('900000000').motivo),'remitente: Luis (sin permiso) y un número desconocido no pueden cargar');
  const lect=W.leer(msg,{hoy:'2026-11-24'});
  ok(lect.errores.length===0,'el mensaje se lee con los catálogos de la página'+(lect.errores.length?': '+lect.errores.join(' | '):''));
  let rechazo='';try{await W.cargar(lect,{numero:'911222333'});}catch(e){rechazo=e.message;}
  ok(/no tiene permiso/.test(rechazo)&&items(N).length===1,'si quien envía no tiene permiso, no se carga nada');
  const r=await W.cargar(lect,{numero:'+51987654321',enviadoEn:T('2026-11-24','18:42')});
  ok(r.ok&&r.resultados.length===10&&r.resultados.every(x=>x.ok),'se cargan 10 líneas-turno (5 el 24/11 Noche y 5 el 25/11 Día)'+(r.ok?'':': '+JSON.stringify(r.resultados.filter(x=>!x.ok))));
  const its=items(N);
  const de=(f,t,l)=>its.filter(p=>p.fecha===f&&p.turno===t&&p.linea===l&&p.cantidadProgramada!==0||p.fecha===f&&p.turno===t&&p.linea===l&&p.estimado);
  const b7=de('2026-11-24','NOCHE','B7L');
  ok(!b7.some(p=>p.marca==='GLACIAL'),'B7L 24/11 Noche: el Glacial 1,000 anterior se reemplazó');
  const sc=b7.find(p=>p.marca==='SCALA');
  ok(sc&&sc.tramosSecuencia.length===2&&sc.tramosSecuencia[0].tipoFin==='HORA'&&sc.tramosSecuencia[0].horaFin==='02:00'&&sc.tramosSecuencia[0].orden===1&&sc.tramosSecuencia[1].tipoFin==='CIERRE'&&sc.tramosSecuencia[1].orden===4,'B7L Scala: tramo 1 hasta 02:00 y tramo 4 hasta el cierre (retoma)');
  ok(b7.find(p=>p.marca==='CUISINE').tramosSecuencia[0].orden===2&&b7.find(p=>p.marca==='CUISINE').cantidadProgramada===2600&&b7.find(p=>p.marca==='ARO').tramosSecuencia[0].orden===3,'B7L: Cuisine 2,600 en el paso 2 y Aro 600 en el paso 3');
  const pet2=de('2026-11-24','NOCHE','PET2');
  ok(pet2.length===3&&pet2.every(p=>p.presentacion==='Pack_Regular_TP_1Lx6und/ln'),'PET2: las tres marcas en TP 1L x6 línea nueva (/ln)');
  ok(sc.origen&&sc.origen.tipo==='WHATSAPP'&&sc.origen.enviadoPor==='Ana Planificación'&&sc.origen.notas.includes('NO PARA')&&sc.origen.notasPlan.some(n=>/Hielo/.test(n)),'cada fila guarda el origen: WhatsApp, quién la envió, notas (NO PARA) y la nota de Hielo');
  const h=[...N.docs.entries()].filter(([k])=>k.startsWith('historialProgramacion/')).map(([,v])=>v);
  ok(h.length>=17&&h.some(x=>/Programación por WhatsApp · enviada por Ana Planificación/.test(x.motivo||'')),'el historial registra cada cambio con «Programación por WhatsApp · enviada por …»');
  ok(/✅ Cargada en Planificación: 24\/11 Noche PET1/.test(r.texto)&&/Confirmado por Ana Planificación/.test(r.texto),'texto de respuesta para el privado');
  // Una edición a mano de la secuencia quita la marca de WhatsApp
  const filas=sb.NS.secuencia.filasDe('C20L','2026-11-24','NOCHE');
  await sb.NS.secuencia.guardar('C20L','2026-11-24','NOCHE',filas,{});
  ok(items(N).find(p=>p.linea==='C20L'&&p.fecha==='2026-11-24').origen===null,'al editar a mano la secuencia, la fila deja de decir «Cargada desde WhatsApp»');
  // con errores no se carga
  let e2='';try{await W.cargar(W.leer('*Programación 26/11 Turno Dia\n*Bidones 7L*\n* Rara: 10',{hoy:'2026-11-24'}),{numero:'51987654321'});}catch(e){e2=e.message;}
  ok(/tiene errores/.test(e2),'una programación con errores no se carga');
  console.log(fallas?fallas+' falla(s)':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
