/* Parte 2, commit 4: cumplimiento y producido vigente (turno en curso → Paletas; turno cerrado → registro del turno). */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const s24=leer('js/produccion/24-semaforo-produccion-actual.js');
const ini=s24.indexOf('const quitarTilde='),fin=s24.indexOf('function secuenciaPlanificada');
const trozo=s24.slice(ini,fin);
function entorno({activo,fecha,turno,paletas,registros}){
  const sb={console,Math,Number,Array,Object,String};vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  sb.loadRecords=()=>registros;
  sb.resumenProgramacionCombinacionTurnos=()=>({unidadesProducidas:paletas});
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};var turnoActivo=(f,t)=>'+JSON.stringify(!!activo)+'&&f==='+JSON.stringify(fecha)+'&&GlacialIndicadores.claveBloque(t)===GlacialIndicadores.claveBloque('+JSON.stringify(turno)+');var bloqueAhora=()=>({activo:'+JSON.stringify(!!activo)+',enFranja:false,fecha:'+JSON.stringify(fecha)+',bloque:GlacialIndicadores.claveBloque('+JSON.stringify(turno)+')});'+trozo,sb);
  return sb;
}
const item={linea:'PET1',fecha:'2026-10-04',turno:'DÍA',marca:'Bells',presentacion:'625 ml',op:{produccionFinalCorregida:99999}};
const reg=(t,ef)=>({linea:'PET1',fecha:'2026-10-04',turno:t,cuadros:[{marca:'Bells',presentacion:'625 ml',produccion:{efectiva:ef}},{marca:'Scala',presentacion:'1.5 L',produccion:{efectiva:7777}}]});
let e=entorno({activo:true,fecha:'2026-10-04',turno:'DÍA',paletas:5000,registros:[reg('DÍA',4800)]});
ok(e.producidoDe(item)===5000,'turno en curso: producido = Paletas (5 000), aunque exista registro (4 800) y corrección manual (99 999)');
e=entorno({activo:true,fecha:'2026-10-04',turno:'NOCHE',paletas:5000,registros:[reg('DÍA',4800)]});
ok(e.producidoDe(item)===4800,'turno cerrado con registro: producido = registro del turno (4 800), solo de esa marca y presentación');
e=entorno({activo:true,fecha:'2026-10-04',turno:'NOCHE',paletas:5000,registros:[]});
ok(e.producidoDe(item)===0&&vm.runInContext('producidoSinRegistro',e)(item)===true,'turno cerrado sin registro: no se sustituye por Paletas → sin registro (suma 0)');
e=entorno({activo:true,fecha:'2026-10-04',turno:'NOCHE',paletas:5000,registros:[reg('NOCHE',3000)]});
ok(vm.runInContext('producidoSinRegistro',e)(item)===true,'el registro de otro bloque (Noche) no vale para el bloque Día + Intermedio');
e=entorno({activo:true,fecha:'2026-10-04',turno:'NOCHE',paletas:5000,registros:[reg('INTERMEDIO',3000)]});
ok(e.producidoDe(item)===3000,'Día e Intermedio comparten el reporte: el registro de Intermedio vale para el bloque Día + Intermedio');
const G=vm.runInContext('GlacialIndicadores',e);
ok(Math.abs(G.cumplimiento(14400,15000)-0.96)<1e-12&&G.cumplimiento(100,0)===null,'cumplimiento = producido ÷ programado; sin programado → null');
ok(G.programadoVigente([{cantidadProgramada:100},{cantidadProgramada:50,estadoOperacion:{estado:'CANCELADA'}}])===100,'programado vigente sin canceladas');
const s=f=>leer('js/produccion/'+f);
['06-registro','07-historial','09-resumen','14-exportar-general','16-paletas','24-semaforo-produccion-actual','29-avance-produccion','48-resumen-turno','49-resumen-indicadores']
  .forEach(f=>ok(/GlacialIndicadores\.cumplimiento\(/.test(s(f+'.js')),f+': usa GlacialIndicadores.cumplimiento'));
ok(!/produccionFinalCorregida/.test(s('24-semaforo-produccion-actual.js').split('function producidoDe')[0].slice(-1500)),'el producido ya no lee la corrección manual');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
