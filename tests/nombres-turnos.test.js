/* Nombres visibles de los turnos: reportes DÍA / NOCHE; pantallas MAÑANA + INTERMEDIO / NOCHE. Solo presentación (la lógica no cambia). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-08';
const ms=(h,m,dia)=>new Date(2026,9,dia||8,h,m||0).getTime();

/* 1) función central */
const G=require(R+'/js/nucleo/45-indicadores.js');
const dia=['DÍA','INTERMEDIO','DIA','Día','diaInter','DIA_INTERMEDIO','MAÑANA'],noche=['NOCHE','noche','Noche'];
ok(dia.every(t=>G.nombreBloque(t,'reporte')==='DÍA'&&G.nombreBloque(t,'pantalla')==='MAÑANA + INTERMEDIO'),'bloque diurno: reportes «DÍA», pantallas «MAÑANA + INTERMEDIO» (venga como Día, Intermedio o clave interna)');
ok(noche.every(t=>G.nombreBloque(t,'reporte')==='NOCHE'&&G.nombreBloque(t,'pantalla')==='NOCHE'),'bloque nocturno: «NOCHE» en ambos contextos');
ok(G.nombreBloque('DÍA','pantalla','titulo')==='Mañana + Intermedio'&&G.nombreBloque('NOCHE','pantalla','titulo')==='Noche'&&G.nombreBloque('DÍA','reporte','titulo')==='Día','formato título para textos en minúsculas: «Mañana + Intermedio», «Noche», «Día»');
ok(G.NOMBRES_TURNO.pantalla.diurno==='MAÑANA + INTERMEDIO'&&G.NOMBRES_TURNO.reporte.diurno==='DÍA','la nomenclatura vive en una sola configuración');
ok(G.BLOQUES_INICIALES.diaInter.etiqueta==='MAÑANA + INTERMEDIO'&&G.BLOQUES_INICIALES.noche.etiqueta==='NOCHE','etiquetas del bloque (cronómetro y semáforo): MAÑANA + INTERMEDIO / NOCHE');
/* la lógica y los horarios no cambian */
const h=G.horarioBloque(FECHA,'INTERMEDIO');
ok(G.claveBloque('DÍA')==='diaInter'&&G.claveBloque('INTERMEDIO')==='diaInter'&&G.claveBloque('NOCHE')==='noche'&&h.bloque==='diaInter'&&new Date(h.inicio).getHours()===7&&new Date(h.fin).getHours()===19,'claves internas y horario (07:00–19:00) intactos: Mañana e Intermedio siguen compartiendo bloque');
ok(G.normalizarBloques().diaInter.inicio==='07:00'&&G.normalizarBloques().noche.fin==='07:00','horarios configurados sin cambios');

/* 2) reporte por línea (imagen): textos dibujados */
function lienzo(){
  const textos=[];
  const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?(s=>({width:String(s).length*8})):k==='fillText'?((s)=>{textos.push(String(s));}):(()=>{}),set:()=>true});
  return {canvas:{width:0,height:0,getContext:()=>ctx},textos};
}
const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,Infinity,isFinite,GlacialIndicadores:G};
vm.createContext(sb);sb.window=sb;
vm.runInContext(leer('js/produccion/61-reporte-linea.js'),sb);
const modelo=bloque=>({version:1,linea:'PET1',nombre:'PET1',encabezado:{fecha:FECHA,bloque,estado:'CERRADO',inicio:'07:00',corte:'19:00',fin:'19:00',supervisor:'S',tipo:'CIERRE',idSnapshot:FECHA+'|X|CIERRE'},
  resumen:{programado:100,producido:90,pendiente:10,excedente:0,cumplimiento:90,ratio:10,unidadRatio:'B/H',unidad:'botellas',minutosEfectivos:60,minutosTranscurridos:70,paradasMin:10,personal:3,personalEstado:'CONFIRMADO',horasHombre:null},
  marcas:[],indicadores:{disponibilidad:{valor:null,nivel:'gris'},rendimiento:{valor:null,nivel:'gris'},calidad:{valor:null,texto:'Sin datos suficientes'},oee:{valor:null,nivel:'gris'}},porHora:null,
  paradas:{programadas:0,noProgramadas:10,total:10,documentalMin:10,motivos:[],motivosOtros:0,difiere:false},insumos:[],acciones:[]});
(async()=>{
  const d=lienzo();await sb.glacialReporteLinea.dibujar(modelo('DÍA'),{crearCanvas:()=>d.canvas,sinLogo:true});
  const n=lienzo();await sb.glacialReporteLinea.dibujar(modelo('NOCHE'),{crearCanvas:()=>n.canvas,sinLogo:true});
  ok(d.textos.some(t=>t==='08/10/2026 · DÍA')&&!d.textos.some(t=>/INTERMEDIO|MAÑANA/i.test(t)),'imagen del reporte diurno: encabezado «DÍA» (sin «+ INTERMEDIO»)');
  ok(d.textos.some(t=>/· Día · Cierre al corte/.test(t)),'pie de la imagen diurna: «Día»');
  ok(n.textos.some(t=>t==='08/10/2026 · NOCHE')&&n.textos.some(t=>/· Noche · Cierre/.test(t)),'imagen del reporte nocturno: «NOCHE»');

  /* 3) Avance/Cierre: texto de WhatsApp, imágenes y navegación */
  const sb2={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0,Infinity,isFinite,Boolean};
  vm.createContext(sb2);sb2.window=sb2;sb2.addEventListener=()=>{};
  sb2.document={createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){}}),getElementById:()=>null,querySelector:()=>null,body:{classList:{add(){},remove(){}}},addEventListener(){}};
  sb2.state={user:{username:'a',nombre:'A',rol:'Supervisor'},currentTab:''};sb2.tareoAhoraServidor=()=>ms(15);sb2.glacialCierresSesion=[];
  sb2.loadProgramaciones=()=>[];sb2.loadRecords=()=>[];sb2.loadPaletas=()=>[];sb2.normalizarCuadros=r=>r.cuadros||[];
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb2);vm.runInContext(leer('js/produccion/29-avance-produccion.js'),sb2);
  const snap=t=>({id:'x',fecha:FECHA,turno:t,tipo:t==='NOCHE'?'CIERRE':'AVANCE',horaCorte:'12:00',supervisor:'S',relevo:false,lineas:[]});
  const tD=sb2.avTextoWhatsApp(snap('DÍA')),tN=sb2.avTextoWhatsApp(snap('NOCHE'));
  ok(/AVANCE DE PRODUCCIÓN – TURNO DÍA/.test(tD)&&!/INTERMEDIO|MAÑANA/i.test(tD),'WhatsApp: «AVANCE DE PRODUCCIÓN – TURNO DÍA» (sin Intermedio)');
  ok(/CIERRE DE PRODUCCIÓN – TURNO NOCHE/.test(tN),'WhatsApp: «CIERRE DE PRODUCCIÓN – TURNO NOCHE»');
  ok(sb2.avNombreTurnoPantalla('DÍA')==='MAÑANA + INTERMEDIO'&&sb2.avNombreTurnoPantalla('NOCHE')==='NOCHE','selectores y etiquetas de navegación del módulo: MAÑANA + INTERMEDIO / NOCHE');
  const f29=leer('js/produccion/29-avance-produccion.js');
  ok(/\$\{avNombreTurnoPantalla\(t\)\}<small>/.test(f29)&&!/DÍA \(incluye Intermedio\)/.test(f29),'el selector de turnos del módulo usa la función central');
  ok(/\$\{avEsc\(s\.turno\)\}/.test(f29)||/s\.turno/.test(f29),'los reportes y su historial usan el turno del snapshot (DÍA / NOCHE)');

  /* 4) pantallas: nada de etiquetas antiguas en los contextos modificados (fuera de comentarios) */
  // Se ignoran los comentarios (de línea completa y los que siguen al código): solo importan los textos visibles.
  const sinComentarios=t=>t.split('\n').filter(l=>!/^\s*(\/\/|\/\*|\*|!)/.test(l)).map(l=>l.replace(/\s\/\/\s.*$/,'')).join('\n');
  const viejas=/DÍA \+ INTERMEDIO|Día \+ Intermedio|Día \(incluye Intermedio\)|DÍA \(incluye Intermedio\)/;
  ['js/produccion/61-reporte-linea.js','js/personal/44-distribucion-personal-pantalla.js','js/produccion/51-planificacion-nucleo.js','js/produccion/52-planificacion-pantalla.js','js/produccion/53-planificacion-catalogo.js','js/produccion/54-planificacion-solicitudes.js',
   'js/produccion/29-avance-produccion.js','js/produccion/07-historial.js','js/produccion/21-programacion-turno.js','js/produccion/46-proyeccion-avisos.js','js/produccion/24-semaforo-produccion-actual.js','js/accesos/32-dashboard-perfiles.js','js/produccion/49-resumen-indicadores.js']
    .forEach(f=>ok(!viejas.test(sinComentarios(leer(f))),f.split('/').pop()+': sin etiquetas antiguas del bloque'));
  ok(/nombreBloque/.test(leer('js/produccion/24-semaforo-produccion-actual.js'))&&/nombreBloque/.test(leer('js/produccion/49-resumen-indicadores.js'))&&/nombreBloque/.test(leer('js/accesos/32-dashboard-perfiles.js')),'semáforo, resumen e indicadores e Inicio usan la función central');
  ok(/Mañana \+ Intermedio|Mañana e Intermedio/.test(leer('js/produccion/51-planificacion-nucleo.js'))&&/nombreBloque\('DÍA','pantalla','titulo'\)/.test(leer('js/produccion/51-planificacion-nucleo.js')),'Planificación: el bloque diurno sale de la función central');

  /* 5) lo que no debe cambiar */
  const t13=leer('js/personal/13-tareo.js');
  ok(/<option value="Día"/.test(t13)&&!/MAÑANA \+ INTERMEDIO|Mañana \+ Intermedio/.test(t13),'Tareo conserva los nombres de los turnos del personal (sin tocar)');
  ok(!/MAÑANA \+ INTERMEDIO|Mañana \+ Intermedio/.test(leer('js/mantenimiento/30-rotacion-mantenimiento.js'))&&!/MAÑANA \+ INTERMEDIO/.test(leer('js/personal/31-rotacion-supervisores.js')),'Rotaciones sin cambios');
  const sb3={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,Infinity,isFinite};vm.createContext(sb3);sb3.window=sb3;sb3.GlacialIndicadores=G;sb3.db={};sb3.firebase={};sb3.state={user:{}};
  vm.runInContext(leer('js/personal/43-distribucion-personal.js'),sb3);
  ok(sb3.glacialDistribucionPersonal.clave(FECHA,'INTERMEDIO')===FECHA+'_DIA'&&sb3.glacialDistribucionPersonal.clave(FECHA,'DÍA')===FECHA+'_DIA'&&sb3.glacialDistribucionPersonal.clave(FECHA,'NOCHE')===FECHA+'_NOCHE','las claves de base de datos no cambian (DIA / NOCHE)');
  ok(/valor:'DÍA'/.test(leer('js/produccion/51-planificacion-nucleo.js'))&&/valor:'NOCHE'/.test(leer('js/produccion/51-planificacion-nucleo.js'))&&/<option value="DÍA"/.test(leer('js/personal/44-distribucion-personal-pantalla.js')),'los valores internos de los selectores siguen siendo DÍA / NOCHE (solo cambia el texto visible)');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
