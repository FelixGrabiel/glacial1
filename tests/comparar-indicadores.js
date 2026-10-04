/* Compara, con los MISMOS datos de ejemplo, lo que muestra hoy cada pantalla (ejecutando el código real de la
   aplicación, tal como está en js/) con lo que daría el módulo único (js/nucleo/45-indicadores.js).
   No modifica nada. Uso:   node tests/comparar-indicadores.js            (imprime la tabla)
                            node tests/comparar-indicadores.js --guardar   (escribe docs/COMPARACION-INDICADORES.md) */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const RAIZ=path.join(__dirname,'..');
const I=require(path.join(RAIZ,'js/nucleo/45-indicadores.js'));
const leer=f=>fs.readFileSync(path.join(RAIZ,f),'utf8').replace(/\r\n/g,'\n');

/* extrae una función por nombre (emparejando llaves) */
function extraer(src,nombre){
  const m=new RegExp('(?:async\\s+)?function\\s+'+nombre+'\\s*\\(').exec(src);
  if(!m)throw new Error('No se halló '+nombre);
  let i=src.indexOf('{',m.index),d=0,j=i;
  for(;j<src.length;j++){const c=src[j];if(c==='{')d++;else if(c==='}'){d--;if(!d)break;}}
  return src.slice(m.index,j+1);
}
const s06=leer('js/produccion/06-registro.js'),s08=leer('js/produccion/08-graficos.js'),s09=leer('js/produccion/09-resumen.js'),
  s14=leer('js/produccion/14-exportar-general.js'),s23b=leer('js/produccion/23b-tiempos-linea.js'),s47=leer('js/produccion/47-analisis-paradas.js'),
  s17=leer('js/accesos/17-modo-trabajo.js'),s29=leer('js/produccion/29-avance-produccion.js'),s16=leer('js/produccion/16-paletas.js');

/* ---------- el código real de cada pantalla, en un espacio aislado ---------- */
const sb={console,Math,Number,String,Array,Object,JSON,Set,Map,Date,parseFloat,isNaN,RegExp};vm.createContext(sb);
const piezas=[
  extraer(s06,'calcDerivedLegacy'),extraer(s06,'calcDerivedCuadro'),extraer(s06,'calcDerivedMulti'),extraer(s06,'calcDerived'),
  extraer(s08,'agruparMermas'),extraer(s14,'agregadosPorLinea'),
  extraer(s09,'produccionEfectivaRecord'),extraer(s09,'calcularComponentesOEEPorLinea'),extraer(s09,'calcularMermaPorLinea'),
  extraer(s09,'rsNum'),extraer(s09,'rsCuadros'),extraer(s09,'rsProd'),extraer(s09,'rsParadas'),extraer(s09,'rsMinProduccion'),extraer(s09,'rsMerma'),
  extraer(s09,'rsPersonal'),extraer(s09,'rsProgramaciones'),extraer(s09,'rsPaletas'),extraer(s09,'rsNominalCuadro'),extraer(s09,'rsDatosIndustriales'),
  extraer(s09,'rsEstadoLineas'),extraer(s09,'fechaHoyResumen'),
  extraer(s23b,'calcularRatiosLinea'),
  extraer(s47,'construirUnidad'),extraer(s47,'datosRegistro'),extraer(s47,'calcularOee'),
  extraer(s17,'obtenerTurnoActual'),extraer(s17,'_mtFechaConHora'),extraer(s17,'_mtSumarDias'),
  extraer(s29,'avFechaHoy'),extraer(s16,'fechaHoyPaletas')
].join('\n');
const turno24=(()=>{const a=s23b.length&&leer('js/produccion/24-semaforo-produccion-actual.js');const i=a.indexOf('const turnoVigente = () => {');const j=a.indexOf('function horario(fecha,turno,compartida)',i);return a.slice(i,j);})();
sb.__registros=[];sb.__progs=[];sb.__paletas=[];sb.__ahoraMs=0;
vm.runInContext(`
var MT_TOLERANCIA_NOCHE_MIN=20;
var num=function(v){var n=parseFloat(v);return isNaN(n)?0:n;};
var normalizarCuadros=function(r){return r.cuadros||[];};
var litrosRegistro=function(){return 0;};
var normalizarCausaParada=function(d){var t=String(d||'').trim()||'Sin descripción';return {descripcion:t,clave:t.toLowerCase()};};
var loadProgramaciones=function(){return __progs;};var loadPaletas=function(){return __paletas;};
var resumenFiltroLinea='TODAS';var resumenRangoDias=1;var resumenFechaDiaria='2026-10-09';
var rsFechaEnRango=function(f){return true;};
var fechaHoyResumenViejo=fechaHoyResumen;
var ahoraServidor=function(){return __ahoraMs;};
var fechaLocal=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
var turnoCodigo=function(t){return t.key==='MANANA'?'DÍA':t.key==='TARDE'?'INTERMEDIO':'NOCHE';};
var sinTurno24=0;
${turno24}
var norm=function(t){return String(t||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ').trim();};
var nombreLinea=function(k){return k;};var loadRecords=function(){return __registros;};
`+piezas,sb);

/* ---------- datos de ejemplo ---------- */
const cuad=(marca,pres,{dur,prog,np,eff,programada,sopladas,vel,mermas,ini,fin})=>({marca,presentacion:pres,horasTurno:dur,horaInicio:ini,horaFin:fin,ratioNominal:vel,
  produccion:{efectiva:eff,programada,sopladas:sopladas||eff},paradasProgramadas:[{descripcion:'Refrigerio',tiempoMin:prog}],
  paradasNoProgramadas:np>0?[{descripcion:'Falla de máquina',tiempoMin:np}]:[],mermas});
/* S1: el caso oficial */
const S1={registros:[{id:'a',linea:'PET1',fecha:'2026-10-09',turno:'DÍA',cuadros:[cuad('Cielo','625 ml',{dur:8,prog:60,np:45,eff:14400,programada:16000,vel:2500,ini:'07:00',fin:'15:00',
  mermas:[{item:'Botellas',unidades:288}]})]}],progs:[{linea:'PET1',fecha:'2026-10-09',turno:'DÍA',cantidadProgramada:16000}],
  paletas:[{linea:'PET1',fecha:'2026-10-09',turno:'DÍA',totalUnidades:14000}],velocidades:{'625 ml':2500}};
/* S2: un día de planta con dos líneas, dos productos en PET 1, una programación cancelada en PET 2 y Paletas distinto al registro */
const S2={registros:[
  {id:'b',linea:'PET1',fecha:'2026-10-09',turno:'DÍA',cuadros:[
    cuad('Cielo','625 ml',{dur:6,prog:45,np:30,eff:9800,programada:10500,vel:2500,ini:'07:00',fin:'13:00',mermas:[{item:'Botellas',unidades:100},{item:'Preformas',unidades:20},{item:'Tapa Plana',unidades:80},{item:'Etiqueta',unidades:60}]}),
    cuad('Scala','1 L',{dur:2,prog:0,np:15,eff:3000,programada:3600,vel:1800,ini:'13:00',fin:'15:00',mermas:[{item:'Botellas',unidades:30},{item:'Etiqueta',unidades:30}]})]},
  {id:'c',linea:'PET2',fecha:'2026-10-09',turno:'NOCHE',cuadros:[
    cuad('Cielo','625 ml',{dur:8,prog:60,np:90,eff:16000,programada:20000,vel:2500,ini:'22:00',fin:'06:00',mermas:[{item:'Botellas',unidades:400}]})]}],
  progs:[{linea:'PET1',fecha:'2026-10-09',turno:'DÍA',cantidadProgramada:10500,marca:'Cielo',presentacion:'625 ml'},{linea:'PET1',fecha:'2026-10-09',turno:'DÍA',cantidadProgramada:3600,marca:'Scala',presentacion:'1 L'},
    {linea:'PET2',fecha:'2026-10-09',turno:'NOCHE',cantidadProgramada:20000},{linea:'PET2',fecha:'2026-10-09',turno:'NOCHE',cantidadProgramada:5000,estadoOperacion:{estado:'CANCELADA'}}],
  paletas:[{linea:'PET1',fecha:'2026-10-09',turno:'DÍA',totalUnidades:12600},{linea:'PET2',fecha:'2026-10-09',turno:'NOCHE',totalUnidades:16000}],
  velocidades:{'625 ml':2500,'1 L':1800}};

/* partes (turno · línea · producto) para el módulo */
function partesDe(S,linea){
  const p=[];
  S.registros.filter(r=>!linea||r.linea===linea).forEach(r=>r.cuadros.forEach(q=>{
    const prog=S.progs.filter(x=>x.linea===r.linea&&x.marca===q.marca&&x.presentacion===q.presentacion&&!(x.estadoOperacion&&x.estadoOperacion.estado==='CANCELADA'));
    const programado=prog.length?I.programadoVigente(prog):I.programadoVigente(S.progs.filter(x=>x.linea===r.linea&&!x.marca));
    p.push({producido:q.produccion.efectiva,programado,programacionVigente:programado>0,durMin:q.horasTurno*60,
      progMin:q.paradasProgramadas.reduce((s,x)=>s+x.tiempoMin,0),npMin:q.paradasNoProgramadas.reduce((s,x)=>s+x.tiempoMin,0),
      mermaTotal:q.mermas.reduce((s,m)=>s+m.unidades,0),velocidad:S.velocidades[q.presentacion]||0,etiqueta:q.marca+' '+q.presentacion});
  }));
  return p;
}

/* ---------- ejecución de las pantallas actuales ---------- */
const run=(c)=>vm.runInContext(c,sb);
const fm=(v,d)=>v==null||Number.isNaN(v)?'—':(typeof v==='number'?v.toLocaleString('es-PE',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}):String(v));
const pc=v=>v==null?'—':(v*100).toLocaleString('es-PE',{minimumFractionDigits:1,maximumFractionDigits:1})+' %';
const filas=[];
const fila=(ind,pantalla,hoy,modulo,cambia)=>filas.push({ind,pantalla,hoy,modulo,cambia});
const difiere=(a,b,tol)=>a!=null&&b!=null&&Math.abs(a-b)>(tol||1e-6);

function escenario(nombre,S){
  sb.__registros=S.registros;sb.__progs=S.progs;sb.__paletas=S.paletas;
  const lineas=[...new Set(S.registros.map(r=>r.linea))];
  const E=[];
  lineas.forEach(l=>{
    const recs=S.registros.filter(r=>r.linea===l);
    sb.__recs=recs;
    const d06=recs.map(r=>run('calcDerived('+JSON.stringify(r)+')'));
    const sum06=k=>d06.reduce((a,x)=>a+x[k],0);
    const agr14=run('agregadosPorLinea(__recs,[{key:"'+l+'",name:"'+l+'"}])')[0];
    const comp09=run('calcularComponentesOEEPorLinea(__recs,[{key:"'+l+'",name:"'+l+'"}])')[0];
    const mer09=run('calcularMermaPorLinea(__recs,[{key:"'+l+'",name:"'+l+'"}])')[0];
    const ind09=run('rsDatosIndustriales(__recs)').porLinea.find(x=>x.linea===l);
    const m=I.resumenIndicadores(partesDe(S,l));
    // 23b y 47: con los tiempos del registro armados como los arma 23b
    const dur=sum06('horasEfectivas')*60+sum06('pProg')*60+sum06('pNoProg')*60;
    const t={ok:true,enCurso:false,tiempoTranscurridoMin:dur,minPausasProgramadas:sum06('pProg')*60,minParadasNoProgramadasMin:0,
      minParadasNoProgramadas:sum06('pNoProg')*60,tiempoOperativoMin:sum06('horasEfectivas')*60,paradasClasificadas:[]};
    sb.__t=t;sb.__prod=sum06('efectiva');sb.__prog=sum06('programada');
    const r23=run('calcularRatiosLinea(__t,{produccion:__prod,programado:__prog,ahora:0})');
    const u47=run('construirUnidad({linea:"'+l+'",fecha:"2026-10-09",turno:"DÍA"},__t)');
    sb.__vel=S.velocidades;
    const o47=run('calcularOee(construirUnidad({linea:"'+l+'",fecha:"2026-10-09",turno:"DÍA",bloque:"DIA_INTERMEDIO"},__t),datosRegistro2,function(li,pr){return __vel[pr]||0;})'.replace('datosRegistro2','({hay:true,sopladas:'+sum06('sopladas')+',rechazadas:'+recs.reduce((s,r)=>s+r.cuadros.reduce((a,q)=>a+q.mermas.filter(x=>x.item==='Botellas').reduce((b,x)=>b+x.unidades,0),0),0)+',porPresentacion:new Map('+JSON.stringify(recs.flatMap(r=>r.cuadros.map(q=>[q.presentacion,q.produccion.sopladas])))+')})'));
    E.push({l,d06,sum06,agr14,comp09,mer09,ind09,m,r23,u47,o47});
  });
  // por línea
  E.forEach(e=>{
    const L=nombre+' · '+e.l;
    const d=e.d06.length===1?e.d06[0]:null;
    const he=e.sum06('horasEfectivas');
    fila('Horas efectivas',L+': Nuevo registro, Historial, Gráficos (06)',fm(he,2)+' h',fm(e.m.horasEfectivas,2)+' h',difiere(he,e.m.horasEfectivas));
    fila('Horas efectivas',L+': Resumen, bloque «Planta» (09)',fm(e.ind09.minEfectivos/60,2)+' h',fm(e.m.horasEfectivas,2)+' h',difiere(e.ind09.minEfectivos/60,e.m.horasEfectivas));
    fila('Horas efectivas',L+': Semáforo, Avance, Análisis (23b/29/47)',fm(e.u47.enMarcha/60,2)+' h',fm(e.m.horasEfectivas,2)+' h',difiere(e.u47.enMarcha/60,e.m.horasEfectivas));
    const rat06=e.sum06('efectiva')/he;
    fila('Ratio (UND/h)',L+': Nuevo registro, Historial, Gráficos (06)',fm(rat06),fm(e.m.ratio),difiere(rat06,e.m.ratio,0.5));
    fila('Ratio (UND/h)',L+': Resumen, bloque «Planta» (09)',fm(e.ind09.ratio),fm(e.m.ratio),difiere(e.ind09.ratio,e.m.ratio,0.5));
    fila('Ratio (UND/h)',L+': Semáforo (23b)',fm(e.r23.ratioEfectivo),fm(e.m.ratio),difiere(e.r23.ratioEfectivo,e.m.ratio,0.5));
    const disp06=e.d06.reduce((a,x)=>a+x.disponibilidad*x.horasEfectivas,0)/he;
    fila('Disponibilidad',L+': Nuevo registro, Gráficos (06, por registro)',e.d06.length===1?pc(e.d06[0].disponibilidad):pc(disp06),pc(e.m.disponibilidad),difiere(e.d06.length===1?e.d06[0].disponibilidad:disp06,e.m.disponibilidad,1e-4));
    fila('Disponibilidad',L+': Excel general y gráficos del Resumen (14 y 09, promedio por horas)',pc(e.agr14.disponibilidad),pc(e.m.disponibilidad),difiere(e.agr14.disponibilidad,e.m.disponibilidad,1e-4));
    fila('Disponibilidad',L+': Análisis de paradas (47)',pc(e.u47.disp),pc(e.m.disponibilidad),difiere(e.u47.disp,e.m.disponibilidad,1e-4));
    fila('Rendimiento',L+': Gráficos del Resumen (09, con tope 100 %)',pc(e.comp09.rendimiento),pc(e.m.rendimiento),difiere(e.comp09.rendimiento,e.m.rendimiento,1e-4));
    fila('Rendimiento',L+': Análisis de paradas (47, con sopladas)',e.o47.estado==='OK'?pc(e.o47.rend):e.o47.estado,pc(e.m.rendimiento),e.o47.estado!=='OK'||difiere(e.o47.rend,e.m.rendimiento,1e-4));
    fila('OEE',L+': Nuevo registro, Gráficos (06, calidad 100 %)',e.d06.length===1?pc(e.d06[0].oee):pc(e.agr14.oee),e.m.oee==null?'— (falta velocidad)':pc(e.m.oee),e.m.oee==null||difiere(e.d06.length===1?e.d06[0].oee:e.agr14.oee,e.m.oee,1e-4));
    fila('OEE',L+': Excel general (14, promedio por horas)',pc(e.agr14.oee),e.m.oee==null?'— (falta velocidad)':pc(e.m.oee),e.m.oee==null||difiere(e.agr14.oee,e.m.oee,1e-4));
    fila('OEE',L+': Análisis de paradas (47, con calidad por botellas)',e.o47.estado==='OK'?pc(e.o47.oee):e.o47.estado,e.m.oee==null?'—':pc(e.m.oee),e.o47.estado!=='OK'||difiere(e.o47.oee,e.m.oee,1e-4));
    const prodRec=e.sum06('efectiva'),progReg=e.sum06('programada');
    fila('Cumplimiento',L+': Nuevo registro, Historial, Excel general (06/07/14: programada del registro)',pc(progReg>0?prodRec/progReg:null),pc(e.m.cumplimiento),difiere(prodRec/progReg,e.m.cumplimiento,1e-4));
    fila('Cumplimiento',L+': Resumen, bloque «Planta» (09: programaciones)',pc(e.ind09.cumplimiento),pc(e.m.cumplimiento),difiere(e.ind09.cumplimiento,e.m.cumplimiento,1e-4));
    const pal=S.paletas.filter(p=>p.linea===e.l).reduce((s,p)=>s+p.totalUnidades,0),prgV=I.programadoVigente(S.progs.filter(p=>p.linea===e.l));
    fila('Cumplimiento',L+': Semáforo y Paletas (turno en curso: Paletas ÷ programado)',pc(prgV>0?pal/prgV:null),pc(I.cumplimiento(I.produccionVigente({turnoEnCurso:true,paletas:pal}),prgV)),false);
    const regV=I.produccionVigente({turnoEnCurso:false,registro:prodRec});
    fila('Cumplimiento',L+': Semáforo y Paletas con el turno CERRADO (hoy sigue usando Paletas; el módulo usa el registro del turno)',pc(prgV>0?pal/prgV:null),pc(I.cumplimiento(regV,prgV)),difiere(pal/prgV,regV/prgV,1e-4));
    fila('Merma',L+': Excel general (14) y merma por línea (09)',pc(e.agr14.mermaPct),pc(e.m.merma),difiere(e.agr14.mermaPct,e.m.merma,1e-6));
    fila('Merma',L+': Resumen, bloque «Planta» (09)',pc(e.ind09.merma/(e.ind09.producido||1)),pc(e.m.merma),difiere(e.ind09.merma/(e.ind09.producido||1),e.m.merma,1e-6));
  });
  // planta
  const todas=S.registros;if(lineas.length>1){
    const recs=todas;sb.__recs=recs;
    const ags=run('agregadosPorLinea(__recs,'+JSON.stringify(lineas.map(k=>({key:k,name:k})))+')');
    const he=ags.reduce((a,l)=>a+l.horasEfectivas,0);
    const dispP=he>0?ags.reduce((a,l)=>a+l.disponibilidad*l.horasEfectivas,0)/he:0;
    const oeeP=he>0?ags.reduce((a,l)=>a+l.oee*l.horasEfectivas,0)/he:0;
    const m=I.resumenIndicadores(partesDe(S));
    fila('Disponibilidad',nombre+' · PLANTA: Excel general y gráficos (promedio ponderado por horas efectivas)',pc(dispP),pc(m.disponibilidad),difiere(dispP,m.disponibilidad,1e-4));
    fila('OEE',nombre+' · PLANTA: Excel general (promedio ponderado)',pc(oeeP),m.oee==null?'—':pc(m.oee),difiere(oeeP,m.oee,1e-4));
    const pr=ags.reduce((a,l)=>a+l.efectiva,0),pg=ags.reduce((a,l)=>a+l.programada,0);
    fila('Cumplimiento',nombre+' · PLANTA: Excel general (programada del registro)',pc(pg>0?pr/pg:null),pc(m.cumplimiento),difiere(pr/pg,m.cumplimiento,1e-4));
    fila('Merma',nombre+' · PLANTA: Resumen (tarjeta)',pc(ags.reduce((a,l)=>a+l.mermaUnidades,0)/pr),pc(m.merma),false);
  }
}
escenario('Caso oficial',S1);
escenario('Día de planta',S2);

/* estado de línea y día operativo */
const hoyReal=run('fechaHoyResumenViejo()');
sb.__progs=[{linea:'PET1',fecha:hoyReal,estadoOperacion:{estado:'FINALIZADA'}},{linea:'PET1',fecha:hoyReal,estadoOperacion:{estado:'PENDIENTE'}},{linea:'PET1',fecha:hoyReal,estadoOperacion:{}}];
sb.__estadoHoy=run('fechaHoyResumen=fechaHoyResumenViejo;rsEstadoLineas()');
const estado09=sb.__estadoHoy.find(x=>x.linea==='PET1');
fila('Estado de línea','PET 1 con una programación finalizada y otra pendiente: Resumen «Estado actual de planta» (09)',estado09.estado,I.estadoLineaDesdeItems(['COMPLETADA','PENDIENTE']),estado09.estado!=='PENDIENTE');
sb.__progs=[{linea:'PET1',fecha:hoyReal,estadoOperacion:{estado:'FINALIZADA'}},{linea:'PET1',fecha:hoyReal,estadoOperacion:{estado:'DETENIDA'}},{linea:'PET1',fecha:hoyReal,estadoOperacion:{estado:'PAUSA'}}];
const estado09b=run('rsEstadoLineas()').find(x=>x.linea==='PET1');
fila('Estado de línea','PET 1 detenida y otra en pausa: Resumen (09)',estado09b.estado,I.estadoLineaDesdeItems(['DETENIDA','PAUSA']),estado09b.estado!=='DETENIDA');

const horas=[[3,0],[6,59],[7,10],[14,0],[22,30],[0,15]];
horas.forEach(([h,mi])=>{
  const ms=new Date(2026,9,10,h,mi).getTime();sb.__ahoraMs=ms;
  const t24=run('turnoVigente()'),mod=I.turnoVigente(ms),ra=run('obtenerTurnoActual(new Date('+ms+'))');
  const cal=run('(function(){var d=new Date('+ms+');return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");})()');
  const hh=String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0');
  fila('Día operativo y turno','10/10 a las '+hh+': semáforo (24)',t24.fecha+' '+t24.turno,mod.fecha+' '+mod.turno,t24.fecha!==mod.fecha||t24.turno!==mod.turno);
  fila('Día operativo y turno','10/10 a las '+hh+': Avance y Paletas (fecha de calendario: 29 y 16)',cal,mod.fecha,cal!==mod.fecha);
  fila('Día operativo y turno','10/10 a las '+hh+': cronómetro de turno (17)',ra.key+(ra.enTolerancia?' (tolerancia)':''),mod.turno,(ra.key==='MANANA'?'DÍA':ra.key==='TARDE'?'INTERMEDIO':'NOCHE')!==mod.turno);
});

/* ---------- salida ---------- */
const filasCambian=filas.filter(f=>f.cambia);
let md='# Comparación de indicadores: lo que muestra hoy cada pantalla y lo que daría el módulo único\n\n'+
  'Generado por `node tests/comparar-indicadores.js --guardar`. Ejecuta el **código real** de cada pantalla (tal como está en `js/`) sobre datos de ejemplo y lo compara con `js/nucleo/45-indicadores.js`.\n\n'+
  '**Datos de ejemplo** (no son datos reales de planta; el repositorio no los trae):\n'+
  '- *Caso oficial*: PET 1, un producto, 480 min, 60 min de parada programada, 45 min no programados, 14.400 UND producidas, 16.000 programadas, velocidad 2.500 UND/h, merma de 288 botellas.\n'+
  '- *Día de planta*: PET 1 (Día) con dos productos (9.800 y 3.000 UND), PET 2 (Noche) con 16.000 UND y una programación cancelada de 5.000; Paletas de PET 1 = 12.600 UND frente a 12.800 del registro.\n\n'+
  'Columna **¿Cambia?**: «**SÍ**» si el valor que muestra hoy es distinto del que daría el módulo.\n\n'+
  '| Indicador | Pantalla | Hoy | Con el módulo | ¿Cambia? |\n|---|---|---|---|---|\n'+
  filas.map(f=>'| '+f.ind+' | '+f.pantalla+' | '+f.hoy+' | '+f.modulo+' | '+(f.cambia?'**SÍ**':'no')+' |').join('\n')+
  '\n\n**'+filasCambian.length+' de '+filas.length+' combinaciones cambian.**\n'+
  '\n## Pantallas que ya dan el mismo número (no cambian)\n\n'+
  '- Cabecera del Resumen general, sus tarjetas y el Impacto económico: ya usan las mismas definiciones (49 y 50).\n'+
  '- Semáforo, Avance, proyección y alertas: ya usan el ratio de 23b (horas efectivas y ratio).\n'+
  '- Merma: todas las pantallas ya usan suma de mermas ÷ producción efectiva.\n'+
  '- Asistencia: no se toca (A1).\n'+
  '\n## Dónde cambia y por qué\n\n'+
  '1. **OEE y rendimiento en Análisis de paradas (47):** hoy usa las sopladas y una calidad calculada con las botellas de merma; el módulo no tiene calidad («Calidad: no se mide») y usa el ratio sobre la producción efectiva.\n'+
  '2. **OEE, rendimiento y disponibilidad de PLANTA en el Excel general y los gráficos del Resumen:** hoy promedian por horas efectivas y topan el rendimiento en 100 %; el módulo suma los tiempos de todas las partes y no topa (si pasa de 100 % avisa «revisar velocidad estándar»).\n'+
  '3. **Cumplimiento de un turno cerrado en el semáforo y Paletas:** hoy sigue usando Paletas; la definición pide el registro del turno.\n'+
  '4. **Estado de línea en el Resumen:** hoy toma el primer estado que encuentra (una programación finalizada hace que se vea FINALIZADA aunque haya otra pendiente); el semáforo da prioridad a la pendiente.\n'+
  '5. **Fecha en Avance y Paletas (29 y 16):** hoy usan la fecha de calendario del equipo; entre 00:00 y 07:00 el día operativo sigue siendo el anterior.\n'+
  '6. **Cronómetro de turno (17):** mantiene NOCHE hasta las 07:20 (tolerancia); el módulo cambia a DÍA a las 07:00, como el semáforo.\n';
if(process.argv.includes('--guardar')){fs.writeFileSync(path.join(RAIZ,'docs','COMPARACION-INDICADORES.md'),md);console.log('Guardado docs/COMPARACION-INDICADORES.md ('+filas.length+' filas, '+filasCambian.length+' cambian)');}
else console.log(md);
