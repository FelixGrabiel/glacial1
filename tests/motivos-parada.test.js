/* Motivos de parada en dos niveles (causa › motivo): catálogo editable (37e), validaciones, hora de inicio, equipo según la causa,
   agrupación en Análisis de paradas y compatibilidad (descripcion = motivo — detalle; paradas antiguas intactas). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}

const docs=new Map();const oyentes=[];let escrituras=0;
const db={collection:()=>({doc:id=>({__k:'sync/'+id,get:async()=>({exists:docs.has('sync/'+id),data:()=>clon(docs.get('sync/'+id))}),
    onSnapshot(cb){const f=()=>cb({exists:docs.has('sync/'+id),data:()=>clon(docs.get('sync/'+id))});oyentes.push(f);f();return()=>{};}})}),
  runTransaction:async fn=>{const w=[];const tx={get:async r=>({exists:docs.has(r.__k),data:()=>clon(docs.get(r.__k))}),set:(r,d,o)=>w.push([r,d,o])};
    const res=await fn(tx);w.forEach(([r,d,o])=>{escrituras++;docs.set(r.__k,o&&o.merge?Object.assign({},docs.get(r.__k)||{},clon(d)):clon(d));});oyentes.slice().forEach(f=>f());return res;}};
function dispositivo(usuario,opc){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setInterval:()=>0,clearInterval(){},db};
  vm.createContext(sb);sb.window=sb;sb.state={user:usuario};sb.glacialCierresSesion=[];sb.tareoAhoraServidor=()=>Date.now();
  sb.esMantCompartido=u=>String(u.rol)==='mantenimiento_compartido';sb.esUsuarioSoloConsulta=u=>['Gerente General'].includes(u.rol);
  sb.puedeGestionarRotacionMtto=()=>!!(opc&&opc.supervisor);
  vm.runInContext(leer('js/mantenimiento/37c-equipos-catalogo.js'),sb);
  vm.runInContext(leer('js/mantenimiento/37e-motivos-parada.js'),sb);
  return sb;
}
(async()=>{
  const adm=dispositivo({rol:'Administrador',username:'adm',nombre:'Admin'});
  const M=adm.glacialMotivosParada,G=adm.glacialEquipos;

  /* ---------- catálogo inicial ---------- */
  const nombres=M.causas().map(c=>c.nombre);
  ok(JSON.stringify(nombres)===JSON.stringify(['Falla de máquina','Ajuste o calibración','Servicios (agua, aire comprimido, energía)','Falta de insumos','Falta de personal o apoyo a otra línea','Calidad / producto no conforme','Otro']),'causas iniciales del catálogo');
  ok(M.motivosDe('Ajuste o calibración').join('|')==='Calibración|Llenado lento|Atasco de preforma|Carril o guía de tapas'&&M.motivosDe('Falla de máquina').join('|')==='Falla de máquina'&&M.motivosDe('Otro').join('|')==='Otro','motivos iniciales; las causas simples empiezan con un motivo igual a su nombre');
  ok(escrituras===0&&!docs.has('sync/configMantenimiento'),'el catálogo inicial se usa SIN escribir nada');
  ok(M.pideEquipo('Falla de máquina')&&M.pideEquipo('Ajuste o calibración')&&!M.pideEquipo('Falta de insumos')&&!M.pideEquipo('Otro')&&!M.pideEquipo('')&&M.pideEquipo('falla de maquina — algo'),'pide equipo: Falla de máquina y Ajuste o calibración');
  ok(G.esFalla('Ajuste o calibración')&&G.esFalla('Falla de máquina')&&!G.esFalla('Servicios (agua, aire comprimido, energía)'),'37c delega en el catálogo: «esFalla» generalizada a las causas que piden equipo');
  const solo37c={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setInterval:()=>0,clearInterval(){},db};vm.createContext(solo37c);solo37c.window=solo37c;solo37c.state={user:{rol:'Administrador'}};solo37c.glacialCierresSesion=[];
  vm.runInContext(leer('js/mantenimiento/37c-equipos-catalogo.js'),solo37c);
  ok(solo37c.glacialEquipos.esFalla('Falla de máquina')&&!solo37c.glacialEquipos.esFalla('Ajuste o calibración'),'sin el catálogo de motivos cargado, solo «Falla de máquina» pide equipo (como antes)');

  /* ---------- validaciones ---------- */
  ok(M.validar('','','')!==''&&M.validar('Falta de insumos','','')!==''&&M.validar('Falta de insumos','Falta de paletas','')===''&&M.validar('Falta de insumos','Falta de paletas','otro detalle')==='','causa y motivo obligatorios; el detalle es opcional');
  ok(M.validar('Otro','Otro','')!==''&&M.validar('Otro','Otro','corto')!==''&&M.validar('Otro','Otro','123456789')!==''&&M.validar('Otro','Otro','1234567890')==='','«Otro» exige un detalle de al menos 10 caracteres');
  ok(M.componerDescripcion('Calibración','llenado lento')==='Calibración — llenado lento'&&M.componerDescripcion('Calibración','')==='Calibración'&&M.componerDescripcion('','x')==='','descripcion = motivo — detalle (solo motivo si no hay detalle)');
  ok(/value="Servicios/.test(M.opcionesCausa(''))&&/Causa vieja/.test(M.opcionesCausa('Causa vieja'))&&/Calibración/.test(M.opcionesMotivo('Ajuste o calibración',''))&&/Motivo viejo/.test(M.opcionesMotivo('Ajuste o calibración','Motivo viejo')),'los selectores conservan un valor antiguo que ya no está en el catálogo');

  /* ---------- edición: transacción + merge, nada se borra ---------- */
  docs.set('sync/configMantenimiento',{modo:'X',equipos:{PET1:['Sopladora']},equiposMaestro:[{id:'eq_1'}]});
  const c1=await M.agregarCausa('Cambio de sabor',false);
  const d1=docs.get('sync/configMantenimiento');
  ok(d1.modo==='X'&&d1.equipos.PET1[0]==='Sopladora'&&d1.equiposMaestro.length===1&&d1.motivosParada.length===8,'agregar una causa escribe con merge: no borra los demás campos del documento (37b, 37c, 37d)');
  const nueva=d1.motivosParada.find(c=>c.nombre==='Cambio de sabor');
  ok(nueva&&nueva.activa&&nueva.motivos.length===1&&nueva.motivos[0].nombre==='Cambio de sabor'&&/^ca_/.test(nueva.id)&&/^mo_/.test(nueva.motivos[0].id),'la causa nueva nace con un motivo igual a su nombre e ids propios');
  ok(M.causas().some(c=>c.nombre==='Cambio de sabor'),'el cambio se ve al instante (onSnapshot)');
  await M.agregarMotivo(nueva.id,'Limpieza de jarabe');
  await M.renombrarMotivo(nueva.id,nueva.motivos[0].id,'Cambio de sabor completo');
  await M.activarMotivo(nueva.id,nueva.motivos[0].id,false);
  ok(M.motivosDe('Cambio de sabor').join('|')==='Limpieza de jarabe'&&M.motivosDe('Cambio de sabor',true).length===2,'agregar, renombrar y desactivar motivos (el desactivado ya no se ofrece pero existe)');
  let msg='';try{await M.activarMotivo(nueva.id,d1.motivosParada.find(c=>c.nombre==='Cambio de sabor').motivos[0].id,false);await M.activarMotivo(nueva.id,docs.get('sync/configMantenimiento').motivosParada.find(c=>c.nombre==='Cambio de sabor').motivos.find(m=>m.activo).id,false);}catch(e){msg=e.message;}
  ok(/al menos un motivo activo/.test(msg),'cada causa conserva al menos un motivo activo');
  const rechaza=async(f,re,t)=>{let m='';try{await f();}catch(e){m=e.message;}ok(re.test(m),t);};
  const idFalla=M.causaPorNombre('Falla de máquina').id,idCal=M.causaPorNombre('Calidad / producto no conforme').id;
  await rechaza(()=>M.renombrarCausa(idFalla,'Falla'),/no se puede renombrar/,'«Falla de máquina» no se renombra (otras partes la buscan por nombre)');
  await rechaza(()=>M.activarCausa(idCal,false),/no se puede desactivar/,'«Calidad / producto no conforme» no se desactiva');
  await rechaza(()=>M.agregarCausa('falta de INSUMOS',false),/Ya existe/,'no repite causas');
  await rechaza(()=>M.agregarMotivo(M.causaPorNombre('Otro').id,'otro'),/Ya existe/,'no repite motivos dentro de una causa');
  await rechaza(()=>M.agregarCausa('x',false),/mínimo 2/,'nombre mínimo');
  await M.activarCausa(M.causaPorNombre('Cambio de sabor').id,false);
  ok(!M.causas().some(c=>c.nombre==='Cambio de sabor')&&M.todas().some(c=>c.nombre==='Cambio de sabor'),'una causa desactivada no se ofrece pero se conserva');
  ok(M.opcionesCausa('Cambio de sabor').indexOf('Cambio de sabor')>0,'y una parada que ya la usaba la sigue mostrando');
  await M.cambiarPideEquipo(M.causaPorNombre('Servicios (agua, aire comprimido, energía)').id,true);
  ok(M.pideEquipo('Servicios (agua, aire comprimido, energía)')&&G.esFalla('Servicios (agua, aire comprimido, energía)'),'el supervisor decide qué causas piden equipo');
  const op=dispositivo({rol:'Supervisor',username:'op'});
  await rechaza(()=>op.glacialMotivosParada.agregarCausa('Intruso',false),/Solo el Supervisor de Mantenimiento/,'quien no es Supervisor de Mantenimiento ni Administrador no cambia el catálogo');
  ok(op.glacialMotivosParada.causas().some(c=>c.nombre==='Servicios (agua, aire comprimido, energía)')&&dispositivo({rol:'mantenimiento_compartido',username:'m'}).glacialMotivosParada.puedeConfigurar()===false,'todos leen el catálogo; la cuenta compartida no lo cambia');
  ok(dispositivo({rol:'Supervisor',username:'sm'},{supervisor:true}).glacialMotivosParada.puedeConfigurar(),'el Supervisor de Mantenimiento sí');
  docs.set('sync/configMantenimiento',{motivosParada:'basura'});
  oyentes.forEach(f=>f());
  ok(M.causas().length===7,'un catálogo guardado inválido vuelve al inicial');

  /* ---------- Avance/Cierre (29): hora de inicio y validaciones ---------- */
  const s29=leer('js/produccion/29-avance-produccion.js');
  const sb29={console,Math,Number,Array,Object,String,Date,JSON,window:{glacialMotivosParada:M}};vm.createContext(sb29);
  vm.runInContext('function avNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}function avFmt(v){return Math.round(avNum(v)).toLocaleString("es-PE");}'+
    'function avBloquesCfg(){return {diaInter:{inicio:"07:00",fin:"19:00"},noche:{inicio:"21:00",fin:"07:00"}};}'+
    extraer(s29,'avHoraMs')+extraer(s29,'avCat')+extraer(s29,'avUsaCatalogo')+extraer(s29,'avHoraTxt')+extraer(s29,'avVentanaTurno')+extraer(s29,'avVentanaParadas')+extraer(s29,'avHoraFinCalculada')+extraer(s29,'avValidarCatalogoParada')+
    'this.v=avValidarCatalogoParada;this.f=avHoraFinCalculada;this.u=avUsaCatalogo;',sb29);
  docs.set('sync/configMantenimiento',{});oyentes.forEach(f=>f());
  const mDia={fecha:'2026-10-12',turno:'DÍA'},mNoche={fecha:'2026-10-12',turno:'NOCHE'};
  const fila=(x)=>Object.assign({tipo:'NO_PROGRAMADA',origen:'AVANCE',causa:'Ajuste o calibración',motivoCat:'Calibración',detalle:'',minutos:10,horaInicio:'',nueva:true},x);
  ok(sb29.v(mDia,fila({minutos:10}))==='','hasta 15 minutos: la hora de inicio es opcional');
  ok(sb29.v(mDia,fila({minutos:16}))===''&&sb29.v(mDia,fila({minutos:15}))===''&&sb29.v(mDia,fila({minutos:120}))==='','la hora de inicio es opcional para cualquier duración (15, 16 y 120 min se validan sin hora)');
  ok(sb29.v(mDia,fila({minutos:30,horaInicio:'08:00'}))==='','con hora de inicio dentro del turno se guarda');
  ok(/fuera del turno/.test(sb29.v(mDia,fila({minutos:30,horaInicio:'06:50'})))&&sb29.v(mDia,fila({minutos:30,horaInicio:'18:30'}))==='','no puede empezar antes del turno de día (07:00)');
  ok(sb29.v(mDia,fila({minutos:30,horaInicio:'18:45'}))===''&&sb29.v(mDia,fila({minutos:30,horaInicio:'19:30'}))===''&&sb29.v(mDia,fila({minutos:60,horaInicio:'20:00'}))==='','pasadas las 19:00 todavía se pueden ingresar paradas (cruzar las 19:00 o registrarse después), hasta que arranca la Noche (21:00)');
  ok(/fuera del turno \(07:00 - 21:00\)/.test(sb29.v(mDia,fila({minutos:45,horaInicio:'20:30'})))&&/fuera del turno/.test(sb29.v(mDia,fila({minutos:30,horaInicio:'21:10'}))),'después del inicio de la Noche (21:00) ya no corresponde al turno de día');
  ok(sb29.v(mNoche,fila({minutos:30,horaInicio:'23:50'}))===''&&sb29.v(mNoche,fila({minutos:30,horaInicio:'02:10'}))===''&&/fuera del turno/.test(sb29.v(mNoche,fila({minutos:30,horaInicio:'06:45'})))&&/fuera del turno/.test(sb29.v(mNoche,fila({minutos:30,horaInicio:'20:30'}))),'turno de noche (21:00–07:00): cruza la medianoche');
  ok(sb29.f(mDia,{horaInicio:'08:10',minutos:35})==='08:45'&&sb29.f(mNoche,{horaInicio:'23:50',minutos:30})==='00:20'&&sb29.f(mDia,{horaInicio:'08:10',minutos:0})==='','hora de fin = hora de inicio + minutos');
  ok(/mínimo 10/.test(sb29.v(mDia,fila({causa:'Otro',motivoCat:'Otro',detalle:'corto'})))&&sb29.v(mDia,fila({causa:'Otro',motivoCat:'Otro',detalle:'detalle suficiente'}))==='','«Otro» sin detalle suficiente no se guarda');
  ok(sb29.v(mDia,fila({origen:'REGISTRO',minutos:40}))==='','las paradas de Nuevo registro no piden hora de inicio en este modal');
  ok(sb29.u(fila({}))===true&&sb29.u({tipo:'NO_PROGRAMADA',origen:'AVANCE',causa:'Otro',descripcion:'texto viejo'})===false&&sb29.u({tipo:'PROGRAMADA',nueva:true})===false,'solo las paradas no programadas nuevas o con motivo de catálogo usan el catálogo; las antiguas conservan su texto libre');

  /* ---------- Análisis de paradas (47) ---------- */
  const s47=leer('js/produccion/47-analisis-paradas.js');
  const sb2={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp};vm.createContext(sb2);sb2.window={glacialEquipos:{esFalla:x=>M.pideEquipo(x)}};
  vm.runInContext('const SIN_TECNICO="Sin técnico";const nombreLinea=x=>x;'+extraer(s47,'equipoDeParada')+extraer(s47,'etiquetaMotivo')+extraer(s47,'causaDeParada')+extraer(s47,'motivoDeParada')+extraer(s47,'claveDe')+extraer(s47,'armarPareto')+'this.f=armarPareto;',sb2);
  const it=(causa,motivoCat,mot,min,eq)=>({motivo:mot,motivoCat,causa,minutos:min,clasif:'NO_PROGRAMADA',equipo:eq||''});
  const us=[{linea:'PET1',turno:'DÍA',ajusteNp:0,ajusteProg:0,pItems:[],npItems:[
    it('Ajuste o calibración','Calibración','Calibración — a',20,'Envasadora'),it('Ajuste o calibración','Llenado lento','Llenado lento',10),it('Ajuste o calibración','Calibración','Calibración',5,'Envasadora'),
    it('Otro','','parada por env',40),it('Otro','','parad por env',15),it('','','Detención de línea',7)]}];
  const pc=sb2.f(us,{agrupar:'causa',metrica:'minutos'});
  ok(pc.filas.length===3&&pc.filas[0].clave==='Otro'&&pc.filas[0].minutos===55&&pc.filas[1].clave==='Ajuste o calibración'&&pc.filas[1].minutos===35&&pc.filas[2].clave==='Sin causa','agrupar por Causa (las antiguas sin causa salen como «Sin causa»)');
  const pm=sb2.f(us,{agrupar:'motivo',metrica:'minutos'});
  const k=pm.filas.map(f=>f.clave);
  ok(k.includes('Ajuste o calibración › Calibración')&&k.includes('Ajuste o calibración › Llenado lento')&&pm.filas.find(f=>f.clave==='Ajuste o calibración › Calibración').minutos===25,'agrupar por Motivo: causa › motivo del catálogo (unifica «Calibración — a» y «Calibración»)');
  ok(k.includes('parada por env')&&k.includes('parad por env')&&k.includes('Detención de línea'),'las paradas antiguas sin motivo de catálogo se agrupan por su descripción, como hoy');
  ok(pm.totalItemsMin===97&&pc.totalItemsMin===97,'los minutos totales no cambian al agrupar de otra forma');
  const pe=sb2.f(us,{agrupar:'equipo',metrica:'minutos'});
  ok(pe.filas.length===2&&pe.filas.find(f=>f.clave==='Envasadora').minutos===25&&pe.filas.find(f=>f.clave==='Equipo sin indicar').minutos===10,'agrupar por Equipo cubre también las causas que piden equipo (Ajuste o calibración); sin equipo, «Equipo sin indicar»');

  /* ---------- integración (fuentes) ---------- */
  const s24=leer('js/produccion/24-semaforo-produccion-actual.js'),s23=leer('js/produccion/23b-tiempos-linea.js'),s06=leer('js/produccion/06-registro.js'),s43=leer('js/mantenimiento/43-bitacora-mantenimiento.js'),
        html=leer('index.html'),s37e=leer('js/mantenimiento/37e-motivos-parada.js');
  ok(/avBloqueMotivoHtml/.test(s29)&&/avValidarCatalogoParada/.test(s29)&&/delete obj\.catTocada/.test(s29)&&/item\.motivoCat=p\.motivoCat/.test(s29),'Avance/Cierre: causa › motivo › detalle, validación y guardado (también en las paradas de Nuevo registro)');
  ok(/pedirCausaMotivo/.test(s24)&&/op\.causa=causaElegida/.test(s24)&&/datosEvento\.causa=causaElegida/.test(s24)&&/esFalla\(op\.causa\|\|op\.motivo\)/.test(s24),'DETENER LÍNEA: misma causa y motivo del catálogo; la causa queda en la parada y en la bitácora');
  ok(/registroMotivoHtml/.test(s06)&&/paradaCatCampos/.test(s06)&&/causasParadaOpciones/.test(s06)&&/registroCatalogoActivo\(p\)/.test(s06),'Nuevo registro: motivo y detalle del catálogo; las filas antiguas conservan el texto libre');
  ok((s23.match(/motivoCat:/g)||[]).length>=3&&/e.motivoCat=p.motivoCat/.test(s23),'23b pasa causa, motivo y detalle a paradasClasificadas sin tocar minutos');
  ok(/esFallaMotivo\(e\.causa\|\|e\.motivo\)/.test(s43)&&/esFallaMotivo\(p\.causa\|\|p\.motivo\)/.test(s43),'Bitácora: el equipo se pide según la causa');
  ok(html.indexOf('37e-motivos-parada.js')>html.indexOf('37c-equipos-catalogo.js')&&html.indexOf('37e-motivos-parada.js')>html.indexOf('37d-equipos-maestro.js')&&/37e-motivos-parada\.js\?v=20261012-(pm|am)1/.test(html),'index.html carga 37e después de 37c y 37d');
  ok(['06-registro','08-graficos','23b-tiempos-linea','24-semaforo-produccion-actual','29-avance-produccion','37c-equipos-catalogo','43-bitacora-mantenimiento','47-analisis-paradas'].every(n=>new RegExp(n+'\\.js\\?v=2026(10(1[2-9]|[23]\\d)|1[12]\\d\\d)-(pm|rc|am|gm|cp|ev|fp|av|in|pp|tt|fo|pz|fe|ord|gx|met|pa|ico|ca|pt)\\d+').test(html)),'versión ?v= de los scripts tocados subida');
  ok(/Falla de máquina/.test(s37e)&&/Calidad \/ producto no conforme/.test(s37e)&&/CAUSAS_PARADA_NO_PROGRAMADA/.test(s06)&&/CAUSAS_PARADA_NO_PROGRAMADA/.test(leer('js/nucleo/01-config.js')),'las listas fijas quedan como respaldo');
  ok(!/[^.\w]alert\(|[^.\w]confirm\(|[^.\w]prompt\(/.test(s37e.replace(/\/\/.*$/gm,''))&&!/arrayUnion|increment\(|array-contains|'!='/.test(s37e.replace(/\/\*[^]*?\*\//g,'')),'37e: sin alert/confirm/prompt y compatible con el puente de Supabase');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
