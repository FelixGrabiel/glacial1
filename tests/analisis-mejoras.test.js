/* Mejoras de Análisis de paradas: unidades perdidas, detalle, fallas repetitivas, frecuencia vs duración, mapa de calor, calidad del dato, técnico desde la
   intervención, nombres claros, gráfico para celular y Excel. Los minutos NO cambian. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}

const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setInterval:()=>0};vm.createContext(sb);sb.window=sb;
vm.runInContext(leer('js/produccion/47b-analisis-paradas-mejoras.js'),sb);
const M=sb.glacialAnalisisMejoras;
const vel=(l,p)=>({'PET1|500 ML':6000,'PET1|1 L':4000}[l+'|'+p]||0);
const it=(x)=>Object.assign({id:'p',motivo:'m',causa:'Otro',motivoCat:'',minutos:30,clasif:'NO_PROGRAMADA',origen:'AVANCE'},x);
const T=(h,m)=>new Date(2026,9,5,h,m||0).getTime();

(async()=>{
  /* ---------- 1) unidades perdidas ---------- */
  const u={linea:'PET1',fecha:'2026-10-05',turno:'DÍA',npItems:[it({id:'a',minutos:30}),it({id:'b',minutos:60,inicio:T(14),fin:T(15)})],pItems:[]};
  const uno=[{pres:'500 ML',ini:T(7),fin:T(19),sopladas:30000}];
  const r1=M.conUnidadesPerdidas([u],vel,()=>uno)[0];
  ok(Math.round(r1.npItems[0].unidades)===3000&&Math.round(r1.npItems[1].unidades)===6000&&r1.npItems[0].minutos===30&&r1.npItems[1].minutos===60,'unidades perdidas = minutos ÷ 60 × velocidad estándar; los minutos no cambian');
  ok(u.npItems[0].unidades===undefined,'trabaja sobre copias: las paradas originales no se modifican');
  const dos=[{pres:'500 ML',ini:T(7),fin:T(13),sopladas:10000},{pres:'1 L',ini:T(13),fin:T(19),sopladas:10000}];
  const r2=M.conUnidadesPerdidas([u],vel,()=>dos)[0];
  ok(Math.round(r2.npItems[1].unidades)===4000&&r2.npItems[1].presentacion==='1 L'&&!r2.npItems[1].estimada,'con hora de inicio usa la presentación que corría a esa hora');
  ok(Math.round(r2.npItems[0].unidades)===2500&&r2.npItems[0].estimada===true,'sin hora y con varias presentaciones: promedio ponderado por lo soplado, marcado como estimado');
  const falta=M.conUnidadesPerdidas([u],()=>0,()=>uno)[0];
  ok(falta.npItems[0].unidades===null&&/falta la velocidad estándar de «500 ML»/.test(falta.npItems[0].motivoSinVel),'si falta la velocidad estándar lo dice (null y motivo), no pone 0');
  ok(M.conUnidadesPerdidas([u],vel,()=>[])[0].npItems[0].unidades===null&&/registro de producción/.test(M.conUnidadesPerdidas([u],vel,()=>[])[0].npItems[0].motivoSinVel),'sin registro de producción tampoco se inventa');

  /* ---------- Pareto con unidades (funciones reales de 47) ---------- */
  const s47=leer('js/produccion/47-analisis-paradas.js');
  const s2={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp};vm.createContext(s2);s2.window={innerWidth:360};
  vm.runInContext('const SIN_TECNICO="Sin técnico";const nombreLinea=x=>x;const num=n=>Number(n)||0;const esc=t=>String(t==null?"":t);const fmt=n=>String(Math.round(num(n)));const fmtFecha=f=>f;const dias=()=>1;'+
    extraer(s47,'equipoDeParada')+extraer(s47,'etiquetaMotivo')+extraer(s47,'causaDeParada')+extraer(s47,'motivoDeParada')+extraer(s47,'claveDe')+extraer(s47,'armarPareto')+extraer(s47,'paradasDeClave')+
    'const esAngosto=()=>window.innerWidth<=640;const unidadTxt=m=>m==="cantidad"?" paradas":m==="unidades"?" UND":" min";'+extraer(s47,'svgParetoHorizontal')+extraer(s47,'tablaPareto')+extraer(s47,'notaUnidades')+
    'this.f=armarPareto;this.d=paradasDeClave;this.h=svgParetoHorizontal;this.t=tablaPareto;this.n=notaUnidades;',s2);
  const us=M.conUnidadesPerdidas([Object.assign({ajusteNp:0,ajusteProg:0},u),Object.assign({ajusteNp:0,ajusteProg:0},u,{fecha:'2026-10-06',npItems:[it({id:'c',minutos:10,causa:'Falla de máquina',motivoCat:'Falla de máquina'})]})],vel,()=>uno);
  const pm=s2.f(us,{agrupar:'causa',metrica:'minutos'}),pu=s2.f(us,{agrupar:'causa',metrica:'unidades'});
  ok(pm.totalItemsMin===100&&pu.totalItemsMin===100&&pm.totalMin===pu.totalMin,'el total de minutos es el mismo con cualquier «Ver por»');
  ok(pu.filas[0].clave==='Otro'&&Math.round(pu.filas[0].unidades)===9000&&Math.round(pu.unidadesTotal)===10000&&pu.sinVelN===0,'«Ver por unidades perdidas» ordena por unidades');
  const sinV=s2.f(M.conUnidadesPerdidas([u],()=>0,()=>uno),{agrupar:'causa',metrica:'unidades'});
  ok(sinV.sinVelN===2&&sinV.unidadesTotal===0&&/No se pueden calcular unidades perdidas/.test(s2.n(sinV))&&/falta la velocidad/.test(s2.n(sinV)),'sin velocidad estándar la pantalla lo dice en vez de mostrar 0');
  ok(/Sin velocidad/.test(s2.t(sinV,'causa'))&&/Unidades perdidas/.test(s2.t(pu,'causa'))&&!/Unidades perdidas/.test(s2.t(pm,'causa')),'la tabla muestra la columna solo en esa vista y «Sin velocidad» donde falta');
  ok(s2.d(us,{agrupar:'causa'},'Otro').length===2&&s2.d(us,{agrupar:'causa'},'Falla de máquina').length===1,'el detalle devuelve las paradas del grupo tocado');

  /* ---------- 8) celular ---------- */
  const svg=s2.h(pu);
  ok(/viewBox="0 0 360/.test(svg)&&/font-size="13"/.test(svg)&&/data-ap-det="0"/.test(svg)&&(svg.match(/<text/g)||[]).length>=pu.filas.length*3,'a 360 px el Pareto son barras horizontales con la etiqueta encima de cada barra (texto de 13 px) y se puede tocar');
  ok(/esAngosto\(\)\)return svgParetoHorizontal/.test(s47)&&/addEventListener\('resize'/.test(s47),'el gráfico cambia de modo al cruzar el ancho de celular');

  /* ---------- 3) fallas repetitivas ---------- */
  const eqDe=x=>x.causa==='Falla de máquina'?(String(x.equipo||'').trim()||'Equipo sin indicar'):null;
  const falla=(f,eq,linea)=>({linea:linea||'PET1',fecha:f,turno:'DÍA',npItems:[it({causa:'Falla de máquina',equipo:eq,minutos:20})],pItems:[]});
  const cfg={fallasUmbral:3,fallasDias:7,otroVerde:10,otroAmbar:25,sinEquipoVerde:10,sinEquipoAmbar:25,sinHoraVerde:10,sinHoraAmbar:25};
  const a=M.fallasRepetitivas([falla('2026-10-01','Envasadora'),falla('2026-10-03','Envasadora'),falla('2026-10-07','Envasadora'),falla('2026-10-02','Rinser')],cfg,eqDe);
  ok(a.length===1&&a[0].equipo==='Envasadora'&&a[0].n===3&&a[0].minutos===60,'3 fallas del mismo equipo en 7 días → aviso');
  ok(M.fallasRepetitivas([falla('2026-10-01','Envasadora'),falla('2026-10-03','Envasadora'),falla('2026-10-08','Envasadora')],cfg,eqDe).length===0,'3 fallas en 8 días no avisan');
  ok(M.fallasRepetitivas([falla('2026-10-01','Envasadora'),falla('2026-10-03','Envasadora'),falla('2026-10-05','Envasadora','PET2')],cfg,eqDe).length===0,'el mismo nombre en otra línea es otro equipo');
  ok(M.fallasRepetitivas([falla('2026-10-01',''),falla('2026-10-02',''),falla('2026-10-03','')],cfg,eqDe).length===0,'las fallas sin equipo indicado no forman un aviso (no se sabe de qué equipo son)');
  ok(M.fallasRepetitivas([falla('2026-10-01','X'),falla('2026-10-03','X')],Object.assign({},cfg,{fallasUmbral:2}),eqDe).length===1,'el umbral viene de la configuración');

  /* ---------- 4) frecuencia frente a duración ---------- */
  const fd=M.frecuenciaDuracion([{npItems:[it({motivo:'A',minutos:5}),it({motivo:'A',minutos:10}),it({motivo:'A',minutos:5}),it({motivo:'B',minutos:90}),it({motivo:'C',minutos:5}),it({motivo:'D',minutos:20}),it({motivo:'D',minutos:30}),it({motivo:'D',minutos:25})]}],x=>x.motivo);
  const tipo=k=>fd.find(x=>x.clave===k).tipo;
  ok(tipo('A')==='FRECUENTE_CORTA'&&tipo('B')==='RARA_LARGA'&&tipo('C')==='RARA_CORTA'&&tipo('D')==='FRECUENTE_LARGA'&&Math.round(fd.find(x=>x.clave==='A').media)===7,'frecuentes y cortas (≤ 15 min) separadas de raras y largas, con cantidad, minutos y duración media');
  ok(/Frecuente y corta/.test(M.htmlFrecuencia(fd))&&/Rara y larga/.test(M.htmlFrecuencia(fd)),'la tabla las rotula');

  /* ---------- 5) mapa de calor ---------- */
  const mc=M.mapaCalor([{turno:'DÍA',npItems:[it({minutos:90,inicio:T(9,30),fin:T(11)}),it({minutos:20}),it({minutos:15,inicio:T(14,10)})]},{turno:'NOCHE',npItems:[it({minutos:30,inicio:T(22),fin:T(22,30)})]}]);
  ok(Math.round(mc.celdas.DÍA[9])===30&&Math.round(mc.celdas.DÍA[10])===60&&mc.celdas.DÍA[14]===15&&Math.round(mc.celdas.NOCHE[22])===30,'reparte los minutos entre las horas que ocupa la parada y separa día y noche');
  ok(mc.fuera===1&&mc.fueraMin===20&&mc.dentro===3,'cuenta las que quedan fuera por no tener hora de inicio');
  ok(/Quedan fuera 1 paradas \(20 min\)/.test(M.htmlMapaCalor(mc)),'la pantalla dice cuántas quedaron fuera');

  /* ---------- 6) calidad del dato ---------- */
  const dat=M.indicadoresDato([{npItems:[it({minutos:50,causa:'Otro'}),it({minutos:50,causa:'',motivoCat:''}),it({minutos:100,causa:'Falla de máquina',equipo:'Rinser',inicio:T(8)}),it({minutos:100,causa:'Falla de máquina',equipo:'',inicio:T(9)}),it({minutos:10,causa:'Falta de insumos'})]}],cfg,eqDe);
  const por=k=>dat.find(x=>x.clave===k);
  ok(Math.abs(por('otro').valor-100/310*100)<0.01&&por('otro').nivel==='rojo','% de minutos en «Otro» o sin causa');
  ok(por('sinEquipo').valor===50&&por('sinEquipo').nivel==='rojo','% de fallas sin equipo');
  ok(Math.abs(por('sinHora').valor-50)<0.01&&por('sinHora').detalle.indexOf('2 de 4')===0,'% de paradas largas (> 15 min) sin hora de inicio');
  const dat2=M.indicadoresDato([{npItems:[it({minutos:5,causa:'Falta de insumos'})]}],cfg,eqDe);
  ok(dat2.find(x=>x.clave==='otro').nivel==='verde'&&dat2.find(x=>x.clave==='sinEquipo').nivel==='gris'&&dat2.find(x=>x.clave==='sinEquipo').valor===null,'verde dentro de la meta; sin casos, «Sin datos» en gris');
  ok(M.indicadoresDato([{npItems:[it({minutos:100,causa:'Otro'}),it({minutos:900,causa:'Falta de insumos'})]}],cfg,eqDe)[0].nivel==='verde'&&M.indicadoresDato([{npItems:[it({minutos:80,causa:'Otro'}),it({minutos:920,causa:'Falta'})]}],{...cfg,otroVerde:5,otroAmbar:9},eqDe)[0].nivel==='verde'===false,'las metas verde y ámbar salen de la configuración');
  ok(/Calidad del dato/.test(leer('js/produccion/47b-analisis-paradas-mejoras.js'))&&/Sin datos/.test(M.htmlDato(dat2)),'se dibuja arriba con su explicación');

  /* ---------- 9) técnico desde la intervención ---------- */
  const ints=[{id:'i1',linea:'PET1',abiertaMs:T(14,5),participantes:[{nombre:'Luis Soto',rol:'RESPONSABLE'}],origen:{id:'x'}},{id:'i2',linea:'PET1',abiertaMs:T(2),participantes:[{nombre:'Ana Pérez',rol:'RESPONSABLE'}],origen:{id:'avp_77',paradaId:'avp_77'}}];
  const uu={linea:'PET1'};
  ok(M.intervencionDe({id:'avp_77'},uu,ints).id==='i2'&&M.tecnicoDeIntervencion(M.intervencionDe({id:'avp_77'},uu,ints))==='Ana Pérez','la intervención se liga por el id de la parada');
  ok(M.intervencionDe({id:'z',inicio:T(14),fin:T(14,40),minutos:40},uu,ints).id==='i1'&&M.intervencionDe({id:'z',inicio:T(14),fin:T(14,40),minutos:40},{linea:'PET2'},ints)===null,'o por la misma línea y la hora de apertura dentro de la parada');
  const comb=M.resolvedorTecnicoCombinado(ints,()=>'Respaldo Bitácora');
  ok(comb({id:'avp_77'},uu)==='Ana Pérez'&&comb({id:'q',inicio:T(20),minutos:10},uu)==='Respaldo Bitácora'&&M.resolvedorTecnicoCombinado([],null)({id:'q'},uu)===null,'técnico: intervención primero, bitácora de respaldo, y si no hay ninguno, nada');

  /* ---------- umbrales configurables (37e) ---------- */
  const docs=new Map();
  const oy=[];const db={collection:()=>({doc:id=>({__k:'sync/'+id,onSnapshot(cb){const f=()=>cb({exists:docs.has('sync/'+id),data:()=>clon(docs.get('sync/'+id))});oy.push(f);f();return()=>{};}})}),
    runTransaction:async fn=>{const w=[];await fn({get:async r=>({exists:docs.has(r.__k),data:()=>clon(docs.get(r.__k))}),set:(r,d,o)=>w.push([r,d,o])});w.forEach(([r,d,o])=>docs.set(r.__k,o&&o.merge?Object.assign({},docs.get(r.__k)||{},clon(d)):clon(d)));oy.slice().forEach(f=>f());}};
  function disp(usuario,sup){const s={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setInterval:()=>0,clearInterval(){},db};vm.createContext(s);s.window=s;s.state={user:usuario};s.glacialCierresSesion=[];s.tareoAhoraServidor=()=>1;
    s.esMantCompartido=x=>x.rol==='mantenimiento_compartido';s.esUsuarioSoloConsulta=()=>false;s.puedeGestionarRotacionMtto=()=>!!sup;vm.runInContext(leer('js/mantenimiento/37c-equipos-catalogo.js'),s);vm.runInContext(leer('js/mantenimiento/37e-motivos-parada.js'),s);return s.glacialMotivosParada;}
  const P=disp({rol:'Administrador',username:'adm'});
  ok(P.analisisConfig().fallasUmbral===3&&P.analisisConfig().fallasDias===7&&P.analisisConfig().otroVerde===10,'por defecto: 3 paradas en 7 días y metas 10 % / 25 %');
  docs.set('sync/configMantenimiento',{modo:'X',equipos:{PET1:['S']}});
  await P.guardarAnalisisConfig({fallasUmbral:4,fallasDias:10,otroVerde:5,otroAmbar:15,sinEquipoVerde:5,sinEquipoAmbar:20,sinHoraVerde:10,sinHoraAmbar:30});
  const dc=docs.get('sync/configMantenimiento');
  ok(dc.modo==='X'&&dc.equipos.PET1[0]==='S'&&dc.analisisParadas.fallasUmbral===4&&P.analisisConfig().fallasDias===10&&P.analisisConfig().sinHoraAmbar===30,'el supervisor guarda los umbrales con merge (no borra los otros campos) y se leen en vivo');
  const rech=async(f,re,t)=>{let m='';try{await f();}catch(e){m=e.message;}ok(re.test(m),t);};
  await rech(()=>P.guardarAnalisisConfig({fallasUmbral:1}),/entre 2 y 20/,'umbral inválido se rechaza');
  await rech(()=>P.guardarAnalisisConfig({otroVerde:30,otroAmbar:20}),/verde no puede ser mayor/,'verde mayor que ámbar se rechaza');
  await rech(()=>disp({rol:'mantenimiento_compartido',username:'m'}).guardarAnalisisConfig({}),/Solo el Supervisor de Mantenimiento/,'la cuenta compartida no los cambia');

  /* ---------- 7) nombres, 10) Excel, integración ---------- */
  const f47=s47,html=leer('index.html'),s23=leer('js/produccion/23b-tiempos-linea.js');
  ok(!/Tiempo medio de reparación/.test(f47)&&(f47.match(/Duración media de parada no programada/g)||[]).length>=4,'«Tiempo medio de reparación» pasa a «Duración media de parada no programada» (pantalla, tabla y Excel)');
  ok(/value="unidades"/.test(f47)&&/Unidades perdidas/.test(f47),'selector «Ver por»: minutos / cantidad / unidades perdidas');
  ok(['Unidades perdidas','Calidad del dato','Frecuencia vs duración','Mapa de calor','Fallas repetitivas'].every(h=>f47.indexOf("hoja('"+h+"'")>0)&&/'Hora de inicio','Unidades perdidas','Registrado por'/.test(f47),'Excel: hojas nuevas (unidades perdidas, calidad del dato, frecuencia vs duración, mapa de calor, fallas repetitivas) y columnas en Paradas');
  ok(/data-ap-det/.test(f47)&&/abrirDetalleGrupo/.test(f47)&&/verIntervenciones/.test(f47)&&/UI\.UI\.tab='intervenciones'/.test(f47)&&/Registró/.test(f47),'detalle al tocar barra o fila, con quién registró y enlace a las intervenciones del equipo');
  ok(/resolvedorTecnicoCombinado\(intervencionesLista\(\),respaldo\)/.test(f47),'el técnico sale de la intervención y la bitácora queda de respaldo');
  ok(/registradoPor/.test(s23)&&(s23.match(/registradoPor/g)||[]).length>=4,'23b entrega quién registró cada parada (informativo)');
  ok(html.indexOf('47b-analisis-paradas-mejoras.js')>html.indexOf('47-analisis-paradas.js')&&/47b-analisis-paradas-mejoras\.js\?v=\d{8}-[a-z]+\d+/.test(html),'index.html carga 47b después de 47');
  ok(!/[^.\w]alert\(|[^.\w]confirm\(|[^.\w]prompt\(/.test(leer('js/produccion/47b-analisis-paradas-mejoras.js').replace(/\/\/.*$/gm,''))&&!/arrayUnion|increment\(|array-contains|'!='/.test(leer('js/produccion/47b-analisis-paradas-mejoras.js')),'47b: sin alert/confirm/prompt y compatible con el puente de Supabase');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
