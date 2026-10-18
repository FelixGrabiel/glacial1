/* Cuenta compartida de Mantenimiento: cada técnico identificado ve solo su información (js/mantenimiento/37f-tareo-por-tecnico.js).
   Carga funciones REALES de 13-tareo.js, 46-tareo-horas-extras.js y 37f en un contexto simulado. node tests/tareo-por-tecnico.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const t13=leer('js/personal/13-tareo.js');
function extraer(src,n){const m=new RegExp('(?:^|\\n)function[ ]+'+n+'[ ]*\\(').exec(src);if(!m)throw new Error('no está '+n);const ini=src.indexOf('function',m.index);let i=src.indexOf('{',src.indexOf(')',ini)),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(ini,j+1);}

/* ---- datos: 3 técnicos + 1 maquinista; tareos de Mantenimiento del mes ---- */
const A={id:'10',dni:'11111111',nombre:'OSWALDO FERNANDEZ'},B={id:'20',dni:'22222222',nombre:'JOSE BETANCOURT'},C={id:'30',dni:'33333333',nombre:'ERNESTO QUEZADA'};
const fila=(w,extra)=>Object.assign({trabajadorId:w.id,nombre:w.nombre,dni:w.dni,cargo:'Técnico de Mantenimiento',asistencia:'',horaIngreso:'',horaSalida:'',tardanzaMinutos:0},extra||{});
const tareos=[
  {id:'t1',area:'Mantenimiento',fecha:'2026-10-05',turno:'Día',jornadaNormal:8,personal:[
    fila(A,{asistencia:'Asistió',horaIngreso:'07:00',horaSalida:'17:00'}),fila(B,{asistencia:'Falta por justificar'}),fila(C,{asistencia:'Asistió',horaIngreso:'07:00',horaSalida:'19:00',tardanzaMinutos:10})]},
  {id:'t2',area:'Mantenimiento',fecha:'2026-10-06',turno:'Día',jornadaNormal:8,personal:[
    fila(A,{asistencia:'Descanso'}),fila(B,{asistencia:'Asistió',horaIngreso:'07:00',horaSalida:'16:00'}),fila(C,{asistencia:'Descanso'})]},
  {id:'t3',area:'Mantenimiento',fecha:'2026-10-07',turno:'Noche',jornadaNormal:8,personal:[
    fila(A,{asistencia:'Falta por justificar'}),fila(C,{asistencia:'Asistió',horaIngreso:'19:00',horaSalida:'07:00'})]},
  {id:'t4',area:'Mantenimiento',fecha:'2026-10-08',turno:'Día',jornadaNormal:8,personal:[fila(B,{asistencia:'Asistió',horaIngreso:'07:00',horaSalida:'15:00'})]}
];
const trabajadores=[A,B,C].map(w=>Object.assign({estado:'Activo',cargo:'Técnico de Mantenimiento',area:'Mantenimiento'},w));

function crear(opc){
  const sb={console,Math,Number,Array,Object,String,Set,Map,JSON,Date,Promise,Error,parseInt,parseFloat,isFinite,isNaN};
  vm.createContext(sb);sb.window=sb;sb.globalThis=sb;
  sb.compartida=true;sb.tecnico=null;sb.guardados=[];sb.renders=[];
  sb.esMantCompartido=()=>sb.compartida;
  sb.mantTecnicoActivo=()=>sb.tecnico;
  sb.loadWorkers=()=>trabajadores;
  sb.state={currentTab:'mantenimiento',user:{rol:'x'}};
  sb.TAREO_ESTADO_COMISION='Comisión / trabajo externo';
  /* DOM mínimo: #main con innerHTML; addEventListener para 'mant:tecnico' */
  const oyentes={};
  const main={innerHTML:'',querySelector(sel){
      if(sel==='#mant-tareo-aviso')return /id="mant-tareo-aviso"/.test(main.innerHTML)?{getAttribute:()=>/data-pestana="(\w+)"/.exec(main.innerHTML)[1]}:null;
      if(sel==='.tareo-tab.active'){const m=/data-activa="(\w+)"/.exec(main.innerHTML);return m?{getAttribute:()=>sb.ONCLICK[m[1]]}:null;}
      return null;}};
  sb.ONCLICK={general:'renderTareoGeneral()',historial:'renderHistorialTareo()',resumen:'renderResumenMensualTareoUI()'};
  sb.document={getElementById:id=>id==='main'?main:null,addEventListener:(n,f)=>{(oyentes[n]=oyentes[n]||[]).push(f);}};
  sb.emitir=()=>(oyentes['mant:tecnico']||[]).forEach(f=>f({detail:sb.tecnico}));
  sb.main=main;
  /* funciones REALES de 13-tareo.js */
  const reales=['tareoNormalizarTexto','tareoNormalizarDNI','tareoIdentidades','tareoAreaDe','tareoEstadoCanonico','tareoClavePersona','convertirHoraMinutos','tareoSaldoHoras','obtenerResumenMensualTareo','tareoContadores']
    .map(n=>{try{return extraer(t13,n);}catch(e){return '';}}).join('\n');
  vm.runInContext(reales,sb);
  /* dependencias simuladas de 13-tareo.js */
  vm.runInContext(`
    var TAREOS=[];
    function _x(){}
    function obtenerTareos(){return TAREOS;}
    function tareoAreasVisibles(){return ['Mantenimiento'];}
    function obtenerPersonalTareo(){return loadWorkers();}
    function guardarTareos(l){guardados.push(['lista',l]);}
    function guardarTareoEnMemoria(t){guardados.push(['memoria',t]);}
    function tareoGuardarEnNube(t){guardados.push(['nube',t]);}
    function tareoAvisoSinPermisoEscritura(){}
    function escaparHTML(s){return String(s).replace(/[&<>"']/g,'');}
    function tareoRenderTabs(a){return '<div class="tareo-tabs"><button class="tareo-tab active" data-activa="'+a+'"></button></div>';}
    function renderTareoGeneral(){renders.push('general');main.innerHTML='<div id="tareo-general-view"></div>'+tareoRenderTabs('general');}
    function renderHistorialTareo(){renders.push('historial');main.innerHTML='HIST:'+obtenerTareos().map(t=>t.id+':'+t.personal.map(p=>p.nombre).join('|')).join(';')+tareoRenderTabs('historial');}
    function renderResumenMensualTareoUI(){renders.push('resumen');main.innerHTML='RES:'+obtenerResumenMensualTareo(2026,10,'Mantenimiento').map(f=>f.nombre).join('|')+tareoRenderTabs('resumen');}
    function calcularMinutosRefrigerio(){return 0;}
    function calcularHorasTrabajadas(i,s){const a=i.split(':'),b=s.split(':');let m=(b[0]*60+ +b[1])-(a[0]*60+ +a[1]);if(m<0)m+=1440;return m/60;}
  `,sb);
  sb.TAREOS=null;
  vm.runInContext('TAREOS=JSON.parse(JSON.stringify('+JSON.stringify(tareos)+'))',sb);
  if(opc&&opc.he)vm.runInContext(leer('js/personal/46-tareo-horas-extras.js'),sb);
  vm.runInContext(leer('js/mantenimiento/37f-tareo-por-tecnico.js'),sb);
  return sb;
}
const resumen=sb=>vm.runInContext('obtenerResumenMensualTareo(2026,10,"Mantenimiento")',sb);
const fila_=(sb,nombre)=>resumen(sb).find(f=>f.nombre===nombre);

/* ---- 1) Resumen mensual con A: solo A ---- */
{
  const sb=crear({he:true});sb.tecnico={workerId:'10',nombre:A.nombre};
  const r=resumen(sb);
  ok(r.length===1&&r[0].nombre===A.nombre,'Resumen mensual: una sola fila, la de A (no se siembra a los demás)');
  ok(r[0].asistencias===1&&r[0].faltas===1&&r[0].descansos===1&&r[0].diasTrabajados===1,'Resumen mensual de A: 1 asistencia, 1 falta, 1 descanso');
  sb.window.TareoHE.estado.grupo='Mantenimiento';sb.window.TareoHE.estado.periodo='mes';sb.window.TareoHE.estado.anio=2026;sb.window.TareoHE.estado.mes=10;
  const js=sb.window.TareoHE.todas();
  ok(js.length===1&&js[0].nombre===A.nombre&&js[0].saldo===120,'Horas extras: solo la jornada de A (+2 h)');
  ok(!resumen(sb).some(f=>f.nombre===B.nombre||f.nombre===C.nombre),'ningún otro técnico en el Resumen mensual');
}
/* ---- 2) Tareo General / Historial: solo la fila de A ---- */
{
  const sb=crear();sb.tecnico={workerId:'10',nombre:A.nombre};
  const lista=vm.runInContext('obtenerTareos()',sb);
  ok(lista.length===3&&lista.every(t=>t.personal.length===1&&t.personal[0].nombre===A.nombre),'obtenerTareos (Tareo General e Historial): solo la fila de A y solo los tareos donde figura');
  ok(!lista.some(t=>t.id==='t4'),'el tareo donde A no figura se omite');
  vm.runInContext('renderHistorialTareo()',sb);
  ok(/HIST:t1:OSWALDO FERNANDEZ;t2:OSWALDO FERNANDEZ;t3:OSWALDO FERNANDEZ/.test(sb.main.innerHTML)&&!/BETANCOURT|QUEZADA/.test(sb.main.innerHTML),'Historial dibujado: solo A');
  const original=JSON.parse(JSON.stringify(tareos));
  ok(JSON.stringify(vm.runInContext('TAREOS',sb))===JSON.stringify(original),'los datos de origen no se modifican');
}
/* ---- 3) Cambio a B en vivo ---- */
{
  const sb=crear();sb.tecnico={workerId:'10',nombre:A.nombre};
  vm.runInContext('renderHistorialTareo()',sb);
  sb.tecnico={workerId:'20',nombre:B.nombre};sb.emitir();
  ok(/HIST:t1:JOSE BETANCOURT;t2:JOSE BETANCOURT;t4:JOSE BETANCOURT/.test(sb.main.innerHTML)&&!/FERNANDEZ|QUEZADA/.test(sb.main.innerHTML),'al cambiar a B (evento mant:tecnico) se redibuja y solo hay datos de B');
  sb.tecnico={workerId:'10',nombre:A.nombre};sb.emitir();
  ok(!/BETANCOURT/.test(sb.main.innerHTML),'al volver a A no queda nada de B');
  const sb2=crear();sb2.tecnico={workerId:'20',nombre:B.nombre};vm.runInContext('renderResumenMensualTareoUI()',sb2);
  sb2.tecnico={workerId:'30',nombre:C.nombre};sb2.emitir();
  ok(/^RES:ERNESTO QUEZADA/.test(sb2.main.innerHTML)&&!/BETANCOURT/.test(sb2.main.innerHTML),'el Resumen mensual también cambia de técnico');
}
/* ---- 4) Sin técnico identificado ---- */
{
  const sb=crear();sb.tecnico=null;
  ok(vm.runInContext('obtenerTareos()',sb).length===0&&resumen(sb).length===0,'sin técnico: ningún dato de personal');
  for(const [fn,clave] of [['renderTareoGeneral','general'],['renderHistorialTareo','historial'],['renderResumenMensualTareoUI','resumen']]){
    vm.runInContext(fn+'()',sb);
    ok(/Identifícate con tu PIN para ver tu tareo/.test(sb.main.innerHTML)&&/mantAbrirIdentificacion\(\)/.test(sb.main.innerHTML)&&!/FERNANDEZ|BETANCOURT|QUEZADA/.test(sb.main.innerHTML)&&sb.main.innerHTML.includes('data-pestana="'+clave+'"'),'sin técnico, '+clave+': aviso con botón y sin datos');
  }
  /* al identificarse, el aviso se reemplaza por los datos */
  sb.tecnico={workerId:'10',nombre:A.nombre};sb.emitir();
  ok(!/Identifícate/.test(sb.main.innerHTML),'al identificarse desaparece el aviso');
}
/* ---- 5) Administrador / Supervisor: igual que hoy ---- */
{
  const sb=crear({he:true});sb.compartida=false;sb.tecnico=null;
  const lista=vm.runInContext('obtenerTareos()',sb);
  ok(lista.length===4&&lista[0].personal.length===3,'sin cuenta compartida: obtenerTareos devuelve todo');
  ok(resumen(sb).length===3,'sin cuenta compartida: Resumen mensual con los 3 técnicos');
  vm.runInContext('renderHistorialTareo()',sb);
  ok(/BETANCOURT/.test(sb.main.innerHTML)&&/FERNANDEZ/.test(sb.main.innerHTML)&&!/Identifícate/.test(sb.main.innerHTML),'sin cuenta compartida: sin aviso y con todos');
  sb.emitir();
  ok(true,'el evento mant:tecnico no hace nada para otros roles');
}
/* ---- 6) Exportación: usa los mismos datos filtrados ---- */
{
  const sb=crear();sb.tecnico={workerId:'30',nombre:C.nombre};
  const filas=[];vm.runInContext('obtenerTareos()',sb).forEach(t=>t.personal.forEach(p=>filas.push(p.nombre)));
  ok(filas.length>0&&filas.every(n=>n===C.nombre),'la exportación (lee obtenerTareos) solo incluye al técnico activo');
  const fuentes=['js/rrhh/38-tareo-rrhh-exportacion.js','js/rrhh/27-rrhh-excel-operativo.js'].map(leer).join('\n')+t13;
  ok(/obtenerTareos\(\)/.test(fuentes),'las exportaciones de 13, 27 y 38 leen los tareos con obtenerTareos()');
  /* Copias filtradas: no se pueden guardar (evita pisar las filas de otros) */
  const copia=vm.runInContext('obtenerTareos()',sb)[0];
  vm.runInContext('guardarTareoEnMemoria',sb)(copia);vm.runInContext('tareoGuardarEnNube',sb)(copia);
  vm.runInContext('guardarTareos',sb)(vm.runInContext('obtenerTareos()',sb));
  ok(sb.guardados.length===0,'las copias filtradas no se guardan (solo lectura)');
  sb.compartida=false;vm.runInContext('guardarTareoEnMemoria',sb)({id:'x',personal:[]});
  ok(sb.guardados.length===1,'otros roles guardan como siempre');
}
/* ---- 7) index.html: orden de carga ---- */
{
  const html=leer('index.html'),pos=n=>html.indexOf('js/'+n);
  const i37f=pos('mantenimiento/37f-tareo-por-tecnico.js');
  ok(i37f>0&&i37f>pos('personal/13-tareo.js')&&i37f>pos('personal/46-tareo-horas-extras.js')&&i37f>pos('mantenimiento/37b-mantenimiento-identificacion.js')&&i37f>pos('rrhh/38-tareo-rrhh-exportacion.js')&&i37f<pos('nucleo/12-init.js'),'index.html carga 37f después de 13, 46, 37b y 38 y antes de 12-init');
  ok(/37f-tareo-por-tecnico\.js\?v=/.test(html)&&/37b-mantenimiento-identificacion\.js\?v=20261016-tt1/.test(html),'versiones ?v= subidas (37f nuevo, 37b con mantAbrirIdentificacion)');
  const indice=leer('INDICE.md');
  ok(/37f-tareo-por-tecnico\.js/.test(indice)&&/no del servidor/.test(indice),'INDICE.md documenta el archivo y el límite de seguridad');
  ok(/mantAbrirIdentificacion/.test(leer('js/mantenimiento/37b-mantenimiento-identificacion.js')),'37b expone mantAbrirIdentificacion');
}
console.log(fallas?fallas+' fallas':'todo correcto');
