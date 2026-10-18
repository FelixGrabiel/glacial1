/* Autollenado del registro desde Paletas y Programación (35 + 16 reales):
   Programada (bot), Efectiva (bot) y Paletas por cuadro; varias marcas en el mismo turno; claves escritas distinto
   (mayúsculas, tildes, «7L», DD/MM/YYYY); registro que recibió id del autoguardado antes de marcarse (causa del 0);
   finalizados/reabiertos no se tocan; lo escrito a mano no se pisa; refresco en tiempo real. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const s16=leer('js/produccion/16-paletas.js'),s35=leer('js/produccion/35-autollenado-registro.js'),s45=leer('js/nucleo/45-indicadores.js');
const FECHA='2026-10-14';

function entorno(paletas,programaciones,draft){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},Intl};
  vm.createContext(sb);sb.window=sb;
  sb.document={getElementById:()=>null,createElement:()=>({appendChild(){},remove(){}}),head:{appendChild(){}},body:{appendChild(){}},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},activeElement:null};
  vm.runInContext(s45,sb);
  sb.__pal=paletas;sb.__prog=programaciones;sb.__draft=draft;
  vm.runInContext(`
    var state={user:{nombre:'sup',rol:'Supervisor'},currentTab:'nuevo',currentLine:'B7L'};
    var draft=globalThis.__draft;
    function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
    function normalizarTexto(t){return String(t||'').toLowerCase();}
    function escaparHtml(t){return String(t??'');}
    function tienePermiso(){return true;}
    function loadPaletas(){return globalThis.__pal;} function loadProgramaciones(){return globalThis.__prog;}
    function obtenerUnidadesPorPalet(){return 120;}
    function normalizarCuadros(d){return d.cuadros;} function generarIdParadaProduccion(){return 'p';}
    function reporteEstaBloqueado(){return false;}
    var renders=0,guardados=0;
    function renderFormTab(){renders++;} function renderMain(){}
    function programarGuardadoAutomaticoReporte(){guardados++;}
    function onPaletasUpdated(){} function onProgramacionesUpdated(){}
  `,sb);
  vm.runInContext(s16,sb);
  vm.runInContext(s35,sb);
  return sb;
}
const cuadro=(marca,x)=>Object.assign({marca,presentacion:'7 Litros',produccion:{programada:0,efectiva:0},paradasProgramadas:[],paradasNoProgramadas:[]},x||{});
const registro=x=>Object.assign({id:'r_auto',linea:'B7L',fecha:FECHA,turno:'DÍA',estadoRegistro:'EN_REGISTRO',cuadros:[cuadro('BELLS'),cuadro('ARO')]},x||{});
const pal=(id,marca,tipo,paletas,und,hora,creadoEn,x)=>Object.assign({id,linea:'B7L',fecha:FECHA,turno:'DÍA',marca,presentacion:'7 Litros',tipoPaleta:tipo,paletas,totalUnidades:und,hora,creadoEn},x||{});
// El caso observado: BELLS 30 completas (3 600) + saldo 0; ARO 3 completas (378) + saldo 0.
const PALETAS=()=>[pal('a1','ARO','COMPLETA',3,378,'18:06',1),pal('a2','ARO','INCOMPLETA',0,0,'18:07',2),
  pal('b1','BELLS','COMPLETA',30,3600,'18:07',3),pal('b2','BELLS','INCOMPLETA',0,0,'18:08',4)];
const PROG=()=>[{clave:'B7L|'+FECHA+'|DÍA|BELLS|7 Litros',linea:'B7L',fecha:FECHA,turno:'DÍA',marca:'BELLS',presentacion:'7 Litros',cantidadProgramada:4800,unidadesPorPaleta:120}];

/* 1) Causa raíz: el autoguardado le dio id al registro antes de marcarlo → nunca se llenaba. */
{
  const sb=entorno(PALETAS(),PROG(),registro());
  vm.runInContext('renderFormTab()',sb);
  const d=sb.draft;
  ok(d.autollenadoV1===true,'un registro EN_REGISTRO que ya tiene id (autoguardado) se marca para el autollenado');
  ok(d.cuadros[0].produccion.programada===4800&&d.cuadros[0].produccion.efectiva===3600,'BELLS: Programada 4 800 desde la programación y Efectiva 3 600 desde Paletas');
  ok(d.cuadros[0].autoPaletas.paletas===30,'BELLS: Paletas = 30 (las registradas en Paletas)');
  ok(d.cuadros[1].produccion.efectiva===378&&d.cuadros[1].autoPaletas.paletas===3&&d.cuadros[1].produccion.programada===0,'ARO toma solo lo suyo (378 UND, 3 paletas) y sin programación queda en 0');
  ok(sb.guardados>0,'el llenado programa el autoguardado');
}

/* 2) El borrador se crea dentro del render original: se llena en el mismo render y se pinta otra vez. */
{
  // Simula 06-registro: el render original crea el borrador (y 35 se instala encima de ese render).
  const sb2=entorno(PALETAS(),PROG(),null);
  vm.runInContext(`renderFormTab=function(){renders++;if(!draft)draft=globalThis.__nuevo;};`,sb2);
  sb2.__nuevo=registro({id:null,estadoRegistro:undefined});
  vm.runInContext(s35,sb2);
  vm.runInContext('renderFormTab()',sb2);
  ok(sb2.draft&&sb2.draft.cuadros[0].produccion.efectiva===3600,'un borrador creado por el propio render queda lleno en ese mismo render');
  ok(vm.runInContext('renders',sb2)===2,'se vuelve a pintar una sola vez cuando el llenado cambió algo');
}

/* 3) Claves escritas distinto: mayúsculas, tildes, «7L», fecha DD/MM/YYYY, turno «Dia». */
{
  const pals=[pal('x1','Bells','COMPLETA',10,1200,'10:00',1,{presentacion:'7L',turno:'Dia',fecha:'14/10/2026'})];
  const progs=[{clave:'B7L|'+FECHA+'|DÍA|bells|7 litros',linea:'B7L',fecha:FECHA,turno:'DÍA',marca:'bells',presentacion:'7 litros',cantidadProgramada:2400,unidadesPorPaleta:120}];
  const sb=entorno(pals,progs,registro());
  vm.runInContext('renderFormTab()',sb);
  const q=sb.draft.cuadros[0];
  ok(q.produccion.efectiva===1200&&q.autoPaletas.paletas===10,'Paletas con «Bells / 7L / Dia / 14/10/2026» se cruza con BELLS · 7 Litros · DÍA');
  ok(q.produccion.programada===2400,'la programación escrita en minúsculas se cruza igual');
  ok(sb.claveCombinacionPaletas('B7L','14/10/2026','Día','BELLS','7 Litros')===sb.claveCombinacionPaletas('B7L',FECHA,'DIA','bells','7L'),'claveCombinacionPaletas: sin tildes, minúsculas, sin espacios, 7 Litros = 7L, fecha ISO');
  ok(sb.claveCombinacionPaletas('B7L',FECHA,'DÍA','BELLS','7 Litros')!==sb.claveCombinacionPaletas('B7L',FECHA,'DÍA','BELLS','10 Litros'),'7 Litros y 10 Litros siguen siendo distintas');
}

/* 4) Finalizados y reabiertos no se tocan; lo escrito a mano no se pisa. */
{
  const fin=entorno(PALETAS(),PROG(),registro({estadoRegistro:'FINALIZADO'}));
  vm.runInContext('renderFormTab()',fin);
  ok(fin.draft.autollenadoV1===undefined&&fin.draft.cuadros[0].produccion.efectiva===0,'un registro FINALIZADO no se marca ni se llena');
  const rea=entorno(PALETAS(),PROG(),registro({estadoRegistro:'REABIERTO'}));
  vm.runInContext('renderFormTab()',rea);
  ok(rea.draft.autollenadoV1===undefined,'un registro REABIERTO (corrección de histórico) no se marca');
  const man=registro();man.cuadros[0].produccion.efectiva=3000;
  const sb=entorno(PALETAS(),PROG(),man);
  vm.runInContext('renderFormTab()',sb);
  ok(sb.draft.cuadros[0].produccion.efectiva===3000&&sb.draft.cuadros[0].autoPaletasDisponible===3600,'la Efectiva escrita a mano se conserva y se ofrece «Usar» con 3 600');
}

/* 5) Tiempo real: una paleta nueva actualiza el cuadro sin recargar; el otro no cambia. */
{
  const pals=PALETAS();
  const sb=entorno(pals,PROG(),registro());
  vm.runInContext('renderFormTab()',sb);
  pals.push(pal('b3','BELLS','COMPLETA',31,3720,'18:30',5));
  const antes=vm.runInContext('renders',sb);
  vm.runInContext('onPaletasUpdated()',sb);
  ok(sb.draft.cuadros[0].produccion.efectiva===3720&&sb.draft.cuadros[0].autoPaletas.paletas===31,'al registrar otra paleta de BELLS, Efectiva y Paletas suben solas');
  ok(sb.draft.cuadros[1].produccion.efectiva===378,'el cuadro de ARO no se ve afectado');
  ok(vm.runInContext('renders',sb)>antes,'el formulario se vuelve a pintar');
  sb.__prog.push({clave:'B7L|'+FECHA+'|DÍA|ARO|7 Litros',linea:'B7L',fecha:FECHA,turno:'DÍA',marca:'ARO',presentacion:'7 Litros',cantidadProgramada:600,unidadesPorPaleta:126});
  vm.runInContext('onProgramacionesUpdated()',sb);
  ok(sb.draft.cuadros[1].produccion.programada===600,'una Cantidad Programada nueva aparece en Programada (bot)');
}

/* 6) El campo Paletas del registro usa las paletas de Paletas cuando el cuadro se llena desde allí. */
{
  const s06=leer('js/produccion/06-registro.js');
  ok(/cuadro\.autoPaletas &&\s*Number\.isFinite\(cuadro\.autoPaletas\.paletas\)/.test(s06),'calcularPaletasCuadro prefiere autoPaletas.paletas');
  const html=leer('index.html');
  ok(['06-registro','16-paletas','35-autollenado-registro'].every(n=>{const m=new RegExp(n+'\\.js\\?v=(\\d{8})-[a-z]+\\d+').exec(html);return !!m&&Number(m[1])>=20261014;}),'versión ?v= de los scripts tocados subida (esa versión o una posterior)');
}

console.log(fallas?`\n${fallas} FALLA(S)`:'\nTodo OK');
process.exit(fallas?1:0);
