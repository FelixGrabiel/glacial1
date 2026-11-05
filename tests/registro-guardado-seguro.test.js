/* Registro de producción · guardado seguro (auditoría 2026-11-05, punto 2): dos supervisores en el mismo reporte no se pisan (mezcla
   por campo), un reporte eliminado no resucita, uno finalizado por otro no se reabre, dos reportes creados a la vez se unen, el modo
   VISUALIZAR no guarda, reabrir solo si quedó guardado, borradores que no traen versiones viejas y eliminar con motivo y constancia. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',src.indexOf(')',m.index)),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const s06=leer('js/produccion/06-registro.js'),s17=leer('js/accesos/17-modo-trabajo.js'),s07=leer('js/produccion/07-historial.js');
const bloque=s06.slice(s06.indexOf('let _autosaveReporteTimer = null;'),s06.indexOf('function sincronizarDraftReporteRemoto(){'));

function entorno(records){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setTimeout:()=>0,clearTimeout(){}};
  vm.createContext(sb);sb.window=sb;
  sb.__records=JSON.parse(JSON.stringify(records||[]));sb.__ok=true;sb.__guardados=0;sb.__toasts=[];
  vm.runInContext(`
    var state={user:{nombre:'Ana'},currentTab:'nuevo',currentLine:'PET1',workMode:'trabajar'};
    var draft=null;
    function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
    function loadRecords(){return globalThis.__records;}
    async function saveRecords(l){if(!globalThis.__ok)return false;globalThis.__records=JSON.parse(JSON.stringify(l));globalThis.__guardados++;return true;}
    function normalizarCuadros(d){return d.cuadros||[];}
    function actualizarTodosCuadros(){} function actualizarMermasAutomaticas(){} function actualizarLotesCuadros(){} function syncLegacyFromCuadro1(){}
    function obtenerDiaDelAño(){return 1;} function obtenerSemana(){return 1;}
    var indicador='';function actualizarIndicadorGuardado(e){indicador=e;}
    function mostrarToastReporte(t){globalThis.__toasts.push(t);} function renderFormTab(){} function renderMain(){}
    function alert(){} function confirm(){return true;}
    function esModoSoloLectura(){return state.workMode==='visualizar';}
    function grupoTurnoReporte(t){return ['DÍA','INTERMEDIO'].includes(t)?'DIA_INTERMEDIO':'NOCHE';}
    function blankRecord(l){return {id:null,linea:l,fecha:'2026-11-05',turno:'DÍA',estadoRegistro:'EN_REGISTRO',observaciones:'',cuadros:[{numero:1,marca:'',produccion:{efectiva:0},paradasNoProgramadas:[]},{numero:2,marca:'',produccion:{efectiva:0},paradasNoProgramadas:[]}],auditoria:[]};}
  `,sb);
  vm.runInContext(bloque+['usuarioPuedeReabrirReporte','reporteEstaBloqueado','copiaReporteParaFirestore','asegurarIdReporte','puedeEscribirRegistro','reporteHermanoAbierto','guardarAvanceReporte','sincronizarDraftReporteRemoto'].map(n=>extraer(s06,n)).join(''),sb);
  return sb;
}
const rep=x=>Object.assign({id:'r1',linea:'PET1',fecha:'2026-11-05',turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',estadoRegistro:'EN_REGISTRO',observaciones:'',versionReporte:3,actualizadoEn:100,
  cuadros:[{numero:1,marca:'Bells',produccion:{efectiva:1000},paradasNoProgramadas:[{id:'p1',descripcion:'Falla',tiempoMin:10}]},{numero:2,marca:'',produccion:{efectiva:0},paradasNoProgramadas:[]}],auditoria:[{accion:'CREADO'}]},x||{});
const J=v=>JSON.parse(JSON.stringify(v));

(async()=>{
  /* ---------- mezcla de tres versiones ---------- */
  {
    const sb=entorno([]),M=(b,l,r)=>sb.mezclarVersionesReporte(J(b),J(l),J(r));
    const base=rep();
    const a=J(base);a.cuadros[0].produccion.efectiva=1500;                                       // A cambió la efectiva
    const b=J(base);b.observaciones='Faltó personal';b.cuadros[0].paradasNoProgramadas.push({id:'p2',descripcion:'Calibración',tiempoMin:5});b.auditoria.push({accion:'X'});  // B otras cosas
    const m=M(base,a,b);
    ok(m.cuadros[0].produccion.efectiva===1500&&m.observaciones==='Faltó personal','cada supervisor conserva lo suyo: la efectiva de A y la observación de B');
    ok(m.cuadros[0].paradasNoProgramadas.map(p=>p.id).join()==='p1,p2'&&m.auditoria.length===2,'las paradas se mezclan por id y la auditoría se une');
    const sinP1=J(base);sinP1.cuadros[0].paradasNoProgramadas=[];
    ok(M(base,sinP1,b).cuadros[0].paradasNoProgramadas.map(p=>p.id).join()==='p2','una parada que A quitó queda quitada; la nueva de B se conserva');
    const c1=J(base);c1.observaciones='A';const c2=J(base);c2.observaciones='B';
    ok(M(base,c1,c2).observaciones==='A','el mismo dato cambiado por los dos: gana el que guarda');
    ok(M(base,J(base),b).observaciones==='Faltó personal','sin cambios propios se toma la versión del servidor');
  }

  /* ---------- guardar: otro supervisor guardó mientras tanto ---------- */
  {
    const base=rep();
    const remoto=J(base);remoto.observaciones='Faltó personal';remoto.versionReporte=4;remoto.actualizadoEn=200;
    const sb=entorno([remoto]);
    sb.draft=J(base);sb.draft.cuadros[0].produccion.efectiva=1500;
    vm.runInContext('fijarBaseReporte(globalThis.__base)',Object.assign(sb,{__base:base}));
    const r=await sb.guardarAvanceReporte({silencioso:true});
    const g=sb.__records[0];
    ok(r===true&&g.observaciones==='Faltó personal'&&g.cuadros[0].produccion.efectiva===1500,'al guardar se mezcla: no se borra la observación del otro supervisor (antes ganaba el último)');
    ok(g.versionReporte===5&&vm.runInContext('indicador',sb)==='guardado','sube la versión del reporte y recién entonces dice «Guardado»');
  }
  /* ---------- eliminado desde el Historial: no resucita ---------- */
  {
    const sb=entorno([]);sb.draft=rep();vm.runInContext('fijarBaseReporte(draft)',sb);
    const r=await sb.guardarAvanceReporte({silencioso:true});
    ok(r===false&&sb.__records.length===0&&sb.__guardados===0&&/eliminado/.test(sb.__toasts.join()),'un reporte eliminado mientras estaba abierto no se vuelve a crear');
  }
  /* ---------- finalizado por otra persona: no se reabre ---------- */
  {
    const fin=rep({estadoRegistro:'FINALIZADO',finalizadoPor:'Luis'});
    const sb=entorno([fin]);sb.draft=rep();vm.runInContext('fijarBaseReporte(draft)',sb);
    const r=await sb.guardarAvanceReporte({silencioso:true});
    ok(r===null&&sb.__guardados===0&&sb.draft.estadoRegistro==='FINALIZADO'&&/Luis/.test(sb.__toasts.join()),'si otro lo finalizó, este equipo no lo devuelve a «En registro»: muestra la versión final');
  }
  /* ---------- dos reportes nuevos a la vez: se unen ---------- */
  {
    const otro=rep({id:'r_otro',observaciones:'Inicio de turno'});
    const sb=entorno([otro]);
    vm.runInContext('draft=blankRecord("PET1");draft.cuadros[0].marca="Aro";draft.cuadros[0].produccion.efectiva=300;',sb);
    await sb.guardarAvanceReporte({silencioso:true});
    ok(sb.__records.length===1&&sb.__records[0].id==='r_otro'&&sb.__records[0].observaciones==='Inicio de turno'&&sb.__records[0].cuadros[0].marca==='Aro','dos supervisores abren el formulario vacío a la vez: el segundo se une al reporte del primero (no se crea un duplicado)');
  }
  /* ---------- modo VISUALIZAR: no guarda ---------- */
  {
    const sb=entorno([rep()]);sb.draft=rep();vm.runInContext('fijarBaseReporte(draft);state.workMode="visualizar";draft.observaciones="copia vieja";',sb);
    const r=await sb.guardarAvanceReporte({silencioso:true});
    ok(r===null&&sb.__guardados===0&&sb.__records[0].observaciones==='','en VISUALIZAR (o con el turno cerrado) no se guarda nada, ni por el autollenado');
  }
  /* ---------- servidor rechaza: no dice «Guardado» ---------- */
  {
    const sb=entorno([rep()]);sb.draft=rep();vm.runInContext('fijarBaseReporte(draft);draft.observaciones="x";',sb);sb.__ok=false;
    const r=await sb.guardarAvanceReporte({silencioso:true});
    ok(r===false&&vm.runInContext('indicador',sb)==='error','si el servidor rechaza, el indicador dice error (no «Guardado»)');
  }
  /* ---------- cambios remotos con el formulario quieto ---------- */
  {
    const base=rep();const remoto=J(base);remoto.observaciones='Del otro';remoto.versionReporte=4;
    const sb=entorno([remoto]);sb.draft=J(base);vm.runInContext('fijarBaseReporte(draft)',sb);
    sb.sincronizarDraftReporteRemoto();
    ok(sb.draft.observaciones==='Del otro','sin cambios propios, el formulario muestra lo que guardó el otro supervisor');
    ok(/sincronizarDraftReporteRemoto\(\)/.test(s06.slice(s06.indexOf('(function escucharCambiosDelReporteAbierto(){'))),'al llegar la lista de reportes se aplican los cambios del reporte abierto (antes solo tras el guardado propio)');
  }

  /* ---------- reabrir solo si quedó guardado ---------- */
  ok(/if\(await saveRecords\(records\)===false\)\{\s*alert\('No se pudo reabrir el reporte/.test(extraer(s06,'reabrirReporteProduccion'))&&/const r=JSON\.parse\(JSON\.stringify\(records\[idx\]\)\)/.test(extraer(s06,'reabrirReporteProduccion')),
    'reabrir: copia del reporte y solo se abre si el servidor lo guardó');
  ok(/if\(guardado!==true\)\{[\s\S]*q\.estadoCuadro='FINALIZADO'/.test(extraer(s06,'reabrirCuadroProduccion')),'reabrir una producción: si no se guardó, sigue finalizada');
  ok(/guardarAvanceReporte\(\{silencioso:true\}\)[\s\S]*eliminarBorradorNuevoRegistro\(draft\.linea/.test(extraer(s06,'finalizarReporteProduccion')),'finalizar: guarda antes con la mezcla y borra el borrador del turno');

  /* ---------- borradores ---------- */
  {
    const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise};vm.createContext(sb);
    sb.__escrito=0;sb.__records=[rep({estadoRegistro:'FINALIZADO'})];
    vm.runInContext(`var state={user:{nombre:'Ana'}};var _borradoresNuevoRegistroReady=false;var _borradoresNuevoRegistroCache=[];
      function loadRecords(){return globalThis.__records;} function loadBorradoresNuevoRegistro(){return _borradoresNuevoRegistroCache;}
      var db={collection:()=>({doc:()=>({set:async()=>{globalThis.__escrito++;}})})};
      function _mtGrupoBorrador(t){return String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DIA_INTERMEDIO';}
      function _mtMismoBorrador(b,l,f,t){return b&&b.linea===l&&b.fecha===f&&_mtGrupoBorrador(b.turno)===_mtGrupoBorrador(t);}
      function obtenerBorradorNuevoRegistro(l,f,t){return _borradoresNuevoRegistroCache.find(b=>_mtMismoBorrador(b,l,f,t))||null;}
      function _mtFechaHoyISO(){return '2026-11-05';}
      `+s17.slice(s17.indexOf('let _mtUltimaFirmaBorrador'),s17.indexOf('function eliminarBorradorNuevoRegistro'))+extraer(s17,'eliminarBorradorNuevoRegistro')+extraer(s17,'intentarRestaurarBorrador'),sb);
    await sb.guardarBorradorNuevoRegistro('PET1',{linea:'PET1',fecha:'2026-11-05',turno:'DÍA',observaciones:'x'});
    ok(sb.__escrito===0,'sin la lista de borradores cargada no se guarda (antes reemplazaba la de todas las líneas)');
    vm.runInContext('_borradoresNuevoRegistroReady=true',sb);
    const nuevo={linea:'PET1',fecha:'2026-11-05',turno:'DÍA',observaciones:'x'};
    await sb.guardarBorradorNuevoRegistro('PET1',nuevo);await sb.guardarBorradorNuevoRegistro('PET1',nuevo);
    ok(sb.__escrito===1,'el mismo borrador sin cambios no se vuelve a escribir cada 30 s');
    await sb.guardarBorradorNuevoRegistro('PET1',rep({estadoRegistro:'EN_REGISTRO'}));
    ok(sb.__escrito===1,'un reporte que ya está en la lista no necesita borrador');
    vm.runInContext(`_borradoresNuevoRegistroCache=[{linea:'PET1',fecha:'2026-11-05',turno:'DÍA',draft:${JSON.stringify(rep({estadoRegistro:'EN_REGISTRO',observaciones:'vieja'}))}}]`,sb);
    ok(sb.intentarRestaurarBorrador('PET1')===null,'el borrador de un reporte ya FINALIZADO no se restaura (antes lo volvía a dejar «En registro»)');
    sb.__records=[rep({observaciones:'nueva'})];
    vm.runInContext(`_borradoresNuevoRegistroCache=[{linea:'PET1',fecha:'2026-11-05',turno:'DÍA',draft:${JSON.stringify(rep({observaciones:'vieja'}))}}]`,sb);
    ok(sb.intentarRestaurarBorrador('PET1').observaciones==='nueva','si el reporte ya está en la lista, se abre la versión de la lista y no la del borrador');
  }

  /* ---------- eliminar con motivo y constancia ---------- */
  {
    const del=extraer(s07,'deleteRecord');
    ok(/prompt\(/.test(del)&&/length<5/.test(del),'eliminar pide el motivo (mínimo 5 caracteres)');
    ok(del.indexOf("collection('auditoriaRegistros')")>-1&&del.indexOf("collection('auditoriaRegistros')")<del.indexOf('saveRecords(')&&/copia:JSON\.parse/.test(del),'primero deja la constancia con la copia del reporte; si no puede, no elimina');
    ok(/if\(ok===false\)/.test(del)&&/eliminarBorradorNuevoRegistro\(r\.linea/.test(del),'espera la respuesta del servidor y borra el borrador de ese turno');
  }
  /* ---------- migración ---------- */
  const m42=leer('supabase/migraciones/glacial_42_protege_reportes_registro.sql');
  ok(/eliminarRegistros/.test(m42)&&/reabrirReporteProduccion/.test(m42)&&/before update on public\.fs_items/.test(m42)&&/auditoriaRegistros/.test(m42),'glacial_42: permisos de eliminar y reabrir en el servidor y colección de constancias');

  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
