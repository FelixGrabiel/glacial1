/* Panel «PARADAS DE HOY»: pausas olvidadas, umbrales, «Cerrar pausa» y cierres automáticos (js/produccion/24b-pausas-sin-cerrar.js).
   Uso: node tests/pausas-sin-cerrar.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,m)=>{console.log((c?'✔ ':'✘ FALLA ')+m);if(!c)fallas++;};
const leer=f=>fs.readFileSync(path.join(R,f),'utf8').replace(/\r\n/g,'\n');
const ms=(f,h,m)=>{const [y,mo,d]=f.split('-').map(Number);return new Date(y,mo-1,d,h||0,m||0,0,0).getTime();};

function entorno(rol,programaciones,ahora){
  const sb={console,Date,Promise,Map,Set,Array,Object,String,Number,JSON,Error,RegExp,Math,setTimeout,clearTimeout};
  vm.createContext(sb);sb.window=sb;
  sb.state={user:{rol,nombre:'Ana',username:'ana'},currentTab:'inicio'};
  let doc={items:JSON.parse(JSON.stringify(programaciones))};let escrituras=0;
  sb.db={collection:()=>({doc:()=>({k:'sync/programaciones'})}),runTransaction:async fn=>{
    const w=[];const r=await fn({get:async()=>({exists:true,data:()=>JSON.parse(JSON.stringify(doc))}),set:(ref,d)=>w.push(d)});
    w.forEach(d=>{doc=JSON.parse(JSON.stringify(d));escrituras++;});return r;}};
  sb.ahoraServidor=()=>ahora;
  sb._programacionesCache=[];
  sb.loadProgramaciones=()=>doc.items;
  vm.runInContext(leer('js/produccion/24b-pausas-sin-cerrar.js'),sb);
  return {P:sb.glacialPausas,sb,doc:()=>doc,escrituras:()=>escrituras};
}
const prog=(linea,fecha,turno,marca,estado,extra)=>({clave:[linea,fecha,turno,marca].join('|'),linea,fecha,turno,marca,presentacion:'7 Litros',cantidadProgramada:100,
  estadoOperacion:{estado,inicio:ms(fecha,7,0),paradas:[],...extra}});
const AHORA=ms('2026-10-18',12,5);                       // «hoy» de la captura: 18/10/2026 12:05

(async()=>{
  /* ===== los datos reales de producción del 18/10 ===== */
  const cambio=(linea,f,t,marca,desde)=>prog(linea,f,t,marca,'PAUSA',{pausaDesde:desde,motivoPausa:'Cambio temporal de producción'});
  const real=[
    cambio('PET2','2026-10-12','DÍA','Merkat',ms('2026-10-12',12,19)),cambio('PET2','2026-10-12','DÍA','Aro',ms('2026-10-12',13,20)),
    cambio('PET2','2026-10-12','DÍA','Cuisine',ms('2026-10-12',15,2)),cambio('PET2','2026-10-12','DÍA','Scala',ms('2026-10-12',15,33)),
    cambio('B7L','2026-10-13','DÍA','ARO',ms('2026-10-13',13,17)),cambio('B7L','2026-10-13','NOCHE','BELLS',ms('2026-10-13',23,18)),
    cambio('PET1','2026-10-15','DÍA','Cuisine',ms('2026-10-15',11,8)),
    prog('B7L','2026-10-17','DÍA','BELLS','PAUSA',{pausaDesde:ms('2026-10-17',13,30),motivoPausa:'Refrigerio',paradas:[{id:'x',tipo:'PAUSA',motivo:'Refrigerio',clasificacion:'PROGRAMADA',estandarMin:60,inicio:ms('2026-10-17',13,30),fin:0}]}),
    prog('PET2','2026-10-12','DÍA','Bells','EN_PRODUCCION'),prog('B7L','2026-10-13','DÍA','BELLS','EN_PRODUCCION'),prog('PET1','2026-10-15','DÍA','Scala','EN_PRODUCCION'),
    prog('PET2','2026-10-18','DÍA','Hoy','EN_PRODUCCION'),prog('B7L','2026-10-18','DÍA','Hoy','EN_PRODUCCION')];
  let e=entorno('Administrador',real,AHORA);const P=e.P;
  let a=P.analizar(real,AHORA,{umbralRojoMin:30});
  ok(a.abiertas.length===0,'con los datos reales de hoy: NINGUNA fila de «PARADA PROLONGADA» (antes eran 8)');
  ok(a.sinCerrar.filter(x=>x.tipo==='PAUSA').length===8,'las 8 pausas viejas van a «Pausas sin cerrar (revisar)»');
  ok(a.sinCerrar.filter(x=>x.tipo==='PRODUCCION').length===3&&a.sinCerrar.every(x=>x.fecha!=='2026-10-18'),'también las presentaciones que siguen EN PRODUCCIÓN de días anteriores (y no las de hoy)');
  const ref=a.sinCerrar.find(x=>x.motivo==='Refrigerio');ok(ref&&ref.linea==='B7L'&&ref.min===1355&&ref.marca==='BELLS','trae línea, fecha, turno, marca/presentación, motivo e inicio');

  /* ===== umbrales ===== */
  const refrig=(min)=>prog('B7L','2026-10-18','DÍA','R','PAUSA',{pausaDesde:AHORA-min*60000,motivoPausa:'Refrigerio'});
  const hoyProd=prog('B7L','2026-10-18','DÍA','Otra','EN_PRODUCCION');
  a=P.analizar([refrig(40),hoyProd],AHORA);ok(a.abiertas.length===1&&a.abiertas[0].larga===false&&a.abiertas[0].umbralMin===60,'Refrigerio de 40 min: se lista pero NO alerta');
  a=P.analizar([refrig(70),hoyProd],AHORA);ok(a.abiertas[0].larga===true,'Refrigerio de 70 min: alerta (PARADA PROLONGADA)');
  a=P.analizar([refrig(60),hoyProd],AHORA);ok(a.abiertas[0].larga===false,'justo 60 min: aún no alerta (solo si SUPERA 60)');
  const ct=(min)=>prog('PET1','2026-10-18','DÍA','C','PAUSA',{pausaDesde:AHORA-min*60000,motivoPausa:'Cambio temporal de producción'});
  a=P.analizar([ct(120),prog('PET1','2026-10-18','DÍA','Otra','EN_PRODUCCION')],AHORA);ok(a.abiertas.length===0&&a.sinCerrar.length===0,'cambio temporal mientras la línea produce otra presentación: NO es parada');
  a=P.analizar([ct(20)],AHORA);ok(a.abiertas.length===1&&a.abiertas[0].larga===false,'cambio temporal con la línea sin producir: 20 min no alerta');
  a=P.analizar([ct(45)],AHORA);ok(a.abiertas[0].larga===true&&a.abiertas[0].umbralMin===30,'…y a los 45 min sí (umbral 30)');
  const det=(min)=>prog('PET2','2026-10-18','DÍA','D','DETENIDA',{detenidaDesde:AHORA-min*60000,motivo:'Falla de máquina'});
  a=P.analizar([det(45)],AHORA,{umbralRojoMin:30});ok(a.abiertas[0].tipo==='DETENCION'&&a.abiertas[0].larga===true,'paradas no programadas: criterio anterior (umbral general)');
  a=P.analizar([det(20)],AHORA,{umbralRojoMin:30});ok(a.abiertas[0].larga===false,'detención de 20 min: abierta pero no prolongada');
  a=P.analizar([refrig(14*60),hoyProd],AHORA);ok(a.abiertas.length===1&&a.sinCerrar.length===0,'abierta desde las 22:05 de ayer (turno anterior): todavía se muestra');
  a=P.analizar([refrig(18*60),hoyProd],AHORA);ok(a.abiertas.length===0&&a.sinCerrar.length===1,'abierta desde las 18:05 de ayer (antes del turno anterior): no es de hoy → «sin cerrar»');
  a=P.analizar([refrig(25*60),hoyProd],AHORA);ok(a.abiertas.length===0&&a.sinCerrar.length===1,'a las 25 h pasa a «sin cerrar» (no a PARADA PROLONGADA)');
  a=P.analizar([refrig(14*60),hoyProd],AHORA,{iniDia:ms('2026-10-18',7,0)});ok(a.abiertas.length===1,'el inicio del día operativo también puede indicarse (43 usa el del semáforo)');
  ok(P.CONFIG.refrigerioMin===60&&P.CONFIG.cambioTemporalMin===30&&P.CONFIG.horasSinCerrar===24,'los umbrales están en una constante fácil de cambiar (CONFIG)');
  ok(P.fmtDuracion(45)==='45 min'&&P.fmtDuracion(135)==='2 h 15 min'&&P.fmtDuracion(120)==='2 h'&&P.fmtDuracion(8626)==='143 h 46 min'&&P.fmtDuracion(60)==='1 h','tiempo legible a partir de 60 min («2 h 15 min»)');

  /* ===== permisos del botón ===== */
  ok(['Supervisor','Supervisor de Producción','Jefe de Operaciones','Administrador'].every(r=>entorno(r,[],AHORA).P.puedeCerrar()),'Supervisor, Jefe de Operaciones y Administrador ven «Cerrar pausa»');
  ok(!['Operador','Asistente de Producción','Mantenimiento','mantenimiento_compartido','Jefe de Producción'].some(r=>entorno(r,[],AHORA).P.puedeCerrar()),'los demás usuarios no');
  const solo=entorno('Administrador',[],AHORA);solo.sb.state.user.soloVista=true;ok(!solo.P.puedeCerrar(),'ni un usuario de solo vista');

  /* ===== cerrar pausa a mano ===== */
  e=entorno('Supervisor',real,AHORA);
  const claveRef='B7L|2026-10-17|DÍA|BELLS';
  const finElegido=ms('2026-10-17',14,10);
  const def=e.P.finPorDefecto(real.find(p=>p.clave===claveRef),AHORA);
  ok(def===ms('2026-10-17',19,0),'hora de fin sugerida: el fin de su turno (sin hora de finalización registrada)');
  const conFin=prog('B7L','2026-10-17','DÍA','F','PAUSA',{pausaDesde:ms('2026-10-17',13,0),motivoPausa:'Refrigerio',finalizadaEn:ms('2026-10-17',15,30)});
  ok(e.P.finPorDefecto(conFin,AHORA)===ms('2026-10-17',15,30),'…o la hora de finalización de la programación si existe');
  const r=await e.P.cerrar(claveRef,{finMs:finElegido,nota:'duró 40 min'});
  const p=e.doc().items.find(x=>x.clave===claveRef),op=p.estadoOperacion;
  ok(r.estadoAnterior==='PAUSA'&&r.minutos===40&&op.estado==='FINALIZADA'&&op.finalizadaEn===finElegido&&op.pausaDesde===0&&op.paradas[0].fin===finElegido&&op.pausaAcumuladaMs===40*60000,'cierra con la hora indicada: parada con fin real, 40 min acumulados y presentación FINALIZADA');
  ok(op.cierreManual.por==='Ana'&&op.cierreManual.en===AHORA&&op.cierreManual.finMs===finElegido&&op.cierreManual.estadoAnterior==='PAUSA'&&op.cierreManual.nota==='duró 40 min','queda quién, cuándo, la hora indicada y el estado anterior');
  ok(p.historialAlertas.some(h=>h.tipo==='cierre_manual_pausa'&&h.operador==='Ana'&&h.momento===AHORA&&h.finMs===finElegido)&&p.historialAlertas.some(h=>h.tipo==='cierre_parada'&&h.momento===finElegido),'registro en el historial de la programación (el mismo patrón de auditoría) y cierre_parada para 23b');
  ok(e.doc().items.length===real.length&&e.doc().items.filter(x=>x.clave!==claveRef).every(x=>JSON.stringify(x)===JSON.stringify(real.find(y=>y.clave===x.clave))),'no toca ninguna otra programación');
  let err=null;try{await e.P.cerrar(claveRef,{finMs:finElegido});}catch(x){err=x;}ok(err&&/ya no está abierta/.test(err.message),'cerrar dos veces avisa y no duplica');
  err=null;try{await e.P.cerrar('PET1|2026-10-15|DÍA|Cuisine',{finMs:ms('2026-10-15',9,0)});}catch(x){err=x;}ok(err&&/anterior al inicio/.test(err.message),'una hora de fin anterior al inicio se rechaza');
  err=null;try{await entorno('Operador',real,AHORA).P.cerrar(claveRef,{finMs:finElegido});}catch(x){err=x;}ok(err&&/Supervisor/.test(err.message),'sin permiso no se puede cerrar');
  a=e.P.analizar(e.doc().items,AHORA);ok(a.sinCerrar.length===real.length-1-5+3-3+0||a.sinCerrar.every(x=>x.clave!==claveRef),'tras cerrarla desaparece de «sin cerrar»');
  /* presentación estacionada que sigue EN PRODUCCIÓN de otro día → también se puede finalizar */
  const rp=await e.P.cerrar('PET2|2026-10-12|DÍA|Bells',{});
  const pb=e.doc().items.find(x=>x.clave==='PET2|2026-10-12|DÍA|Bells');ok(pb.estadoOperacion.estado==='FINALIZADA'&&pb.estadoOperacion.finalizadaEn===ms('2026-10-12',19,0),'una presentación que sigue EN PRODUCCIÓN de otro día se finaliza al fin de su turno por defecto');
  /* cada «cambio temporal» viejo se cierra igual */
  await e.P.cerrar('PET2|2026-10-12|DÍA|Merkat',{});ok(e.doc().items.find(x=>x.clave==='PET2|2026-10-12|DÍA|Merkat').estadoOperacion.estado==='FINALIZADA','una presentación estacionada vieja también se cierra (queda FINALIZADA)');

  /* ===== cierres automáticos ===== */
  const refAbierto=prog('B7L','2026-10-18','DÍA','R','PAUSA',{pausaDesde:ms('2026-10-18',10,0),motivoPausa:'Refrigerio',paradas:[{id:'p1',tipo:'PAUSA',motivo:'Refrigerio',clasificacion:'PROGRAMADA',estandarMin:60,inicio:ms('2026-10-18',10,0),fin:0}]});
  const est=e.P.estacionarProgramacion(refAbierto,ms('2026-10-18',10,50),'Luis');
  ok(est.estadoOperacion.estado==='PAUSA'&&est.estadoOperacion.motivoPausa==='Cambio temporal de producción'&&est.estadoOperacion.paradas[0].fin===ms('2026-10-18',10,50)&&est.estadoOperacion.pausaAcumuladaMs===50*60000&&est.historialAlertas.some(h=>h.tipo==='cierre_pausa_auto'),
    'al INICIAR otra presentación: la pausa real se cierra con esa hora (50 min) y la presentación queda estacionada, con registro');
  const igual=prog('B7L','2026-10-18','DÍA','C','PAUSA',{pausaDesde:1,motivoPausa:'Cambio temporal de producción'});ok(e.P.estacionarProgramacion(igual,5,'x')===igual,'un cambio temporal no se toca al iniciar otra');
  const ctx=entorno('Supervisor',[refAbierto,prog('B7L','2026-10-18','DÍA','Otra','EN_PRODUCCION'),prog('B7L','2026-10-18','NOCHE','N','PAUSA',{pausaDesde:ms('2026-10-18',2,0),motivoPausa:'Refrigerio'}),prog('PET1','2026-10-18','DÍA','P','PAUSA',{pausaDesde:ms('2026-10-18',9,0),motivoPausa:'Refrigerio'})],AHORA);
  const n=await ctx.P.cerrarAlCerrarTurno({linea:'B7L',fecha:'2026-10-18',turno:'DÍA'});
  const it=ctx.doc().items;
  ok(n===1&&it[0].estadoOperacion.motivoPausa==='Cambio temporal de producción'&&it[0].estadoOperacion.paradas[0].fin>0&&it[2].estadoOperacion.motivoPausa==='Refrigerio'&&it[3].estadoOperacion.motivoPausa==='Refrigerio','al FINALIZAR el reporte del turno: se cierran las pausas reales de ESE plan (no las de otro turno ni otra línea)');
  ok(it[0].estadoOperacion.paradas[0].fin===Math.min(AHORA,ctx.P.finDeTurno('2026-10-18','DÍA','B7L')),'…con la hora del fin del turno (o ahora, lo que ocurra antes)');
  ok(await ctx.P.cerrarAlCerrarTurno({linea:'B7L',fecha:'2026-10-18',turno:'DÍA'})===0&&ctx.escrituras()===1,'repetirlo no escribe nada');

  /* ===== integración ===== */
  const s24=leer('js/produccion/24-semaforo-produccion-actual.js'),s43=leer('js/mantenimiento/43-bitacora-mantenimiento.js'),s46=leer('js/produccion/46-proyeccion-avisos.js'),s06=leer('js/produccion/06-registro.js'),html=leer('index.html');
  ok(/estadoOtro==='PAUSA'\s*&&\s*window\.glacialPausas/.test(s24)&&/estacionarProgramacion\(p,ahora,nombreOperador\(\)\)/.test(s24),'24: iniciar otra presentación cierra la pausa real de las demás del plan');
  ok(/glacialPausas\.analizar\(prog,ahora,\{umbralRojoMin:umbral,iniDia:ventanaDia\(\)\.ini\}\)/.test(s43)&&/Pausas sin cerrar \(revisar\)/.test(s43)&&/data-pp-cerrar/.test(s43)&&/\.pp-sin-cerrar\{[^}]*#fff7e6/.test(s43)&&/fmtMin\(a\.min\)/.test(s43),'43: panel con «Pausas sin cerrar (revisar)» en ámbar, botón «Cerrar pausa» y tiempo legible');
  ok(/d\.abiertas\.length\|\|\(d\.sinCerrar&&d\.sinCerrar\.length\)\)\?'':'<div class="pp-vacio">Sin paradas registradas/.test(s43),'43: «Sin paradas registradas…» solo cuando no hay paradas abiertas ni pausas por revisar');
  ok(/abiertasEnVivo\(\)/.test(s43)&&/function abiertasEnVivo/.test(s43),'43: la función anterior se conserva (respaldo)');
  ok(/glacialPausas\.analizar\(prog,ahora\(\)/.test(s46)&&/paradasAbiertas\(cfg\.paradaMin\)/.test(s46),'46: los avisos usan el mismo criterio');
  ok(/glacialPausas\.cerrarAlCerrarTurno\(/.test(s06),'06: al finalizar el reporte del turno se cierran las pausas abiertas');
  const pos=n=>html.indexOf(n);
  ok(pos('24-semaforo-produccion-actual.js')<pos('24b-pausas-sin-cerrar.js')&&pos('24b-pausas-sin-cerrar.js')<pos('43-bitacora-mantenimiento.js')&&pos('24b-pausas-sin-cerrar.js')<pos('46-proyeccion-avisos.js'),'index.html: 24b carga después de 24 y antes de 43 y 46');
  const src24b=leer('js/produccion/24b-pausas-sin-cerrar.js');
  ok(!/\balert\(|\bconfirm\(|\bprompt\(/.test(src24b),'sin alert/confirm/prompt nuevos');
  ok(!/arrayUnion|increment\(|array-contains/.test(src24b),'compatible con el puente de Supabase');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})();
