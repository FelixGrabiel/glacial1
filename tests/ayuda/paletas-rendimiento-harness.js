/* Carga las funciones REALES de js/produccion/16-paletas.js (combinaciones, programación, resumen y servicio al corte) en un contexto
   simulado con listas de paletas y programaciones en memoria. Sin DOM ni Firebase.
   cargar16(src16) → contexto {paletas, programaciones} listo para llamar a las funciones. */
'use strict';
const vm=require('vm');
function extraer(src,n){
  const m=new RegExp('(?:^|\\n)function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);
  const ini=src.indexOf('function',m.index);let i=src.indexOf('{',src.indexOf(')',ini)),d=0,j=i;
  for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}
  return src.slice(ini,j+1);
}
const entre=(src,a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('marcadores: '+a);return src.slice(i,j);};
const TURNOS=['DÍA','INTERMEDIO','NOCHE'];
function cargar16(src){
  const sb={console,Math,Number,Array,Object,String,Set,Map,JSON,Date,Promise,Error,parseInt,parseFloat,isFinite,isNaN,RegExp};
  vm.createContext(sb);sb.window=sb;
  sb._paletasCache=[];sb._programacionesCache=[];
  sb.LINES=[{key:'PET1',name:'PET 1'},{key:'PET2',name:'PET 2'},{key:'B7L',name:'B7L'},{key:'C20L',name:'C20L'},{key:'B20L',name:'B20L'}];
  sb.TURNOS_PALETAS=TURNOS;
  vm.runInContext(`
    function loadPaletas(){return _paletasCache;}
    function loadProgramaciones(){return _programacionesCache;}
    function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
    function obtenerUnidadesPorPalet(){return 0;}
    var GlacialIndicadores={cumplimiento:(a,b)=>b>0?a/b:null};
  `,sb);
  const nombres=['normalizarClavePaletas','claveCombinacionPaletas','esCombinacionPaletas','paletasDeCombinacionPaletas','claveProgramacionPaleta',
    'obtenerProgramacionPaleta','datosProgramacionCombinacion','resumenProgramacionCombinacionTurnos','combinacionesConDatosPaletas','productosProduccionActual'];
  const codigo=nombres.map(n=>{try{return extraer(src,n);}catch(e){return '';}}).join('\n');
  vm.runInContext(codigo,sb);
  /* Envoltorio de instalarSaldoYConteoAcumulado y servicio al corte (texto real del archivo) */
  const seg1=entre(src,'  function ultimoEstado(registros){','    /* SERVICIO COMPARTIDO');
  const seg2=entre(src,'  function msRegistroPaleta(','  const resumenOriginal = resumenPaletas;');
  vm.runInContext('(function(){'+seg1+'\n'+seg2+'\n})();',sb);
  return sb;
}
module.exports={cargar16,extraer,TURNOS};
