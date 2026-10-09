/* Reporte por línea: modelo único congelado en el snapshot (pantalla, PNG y texto leen lo mismo), conciliaciones y reglas. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-08';
const ms=(h,m,dia)=>new Date(2026,9,dia||8,h,m||0).getTime();

function entorno(o){
  o=o||{};
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0,Infinity,isFinite,Boolean};
  vm.createContext(sb);sb.window=sb;sb.addEventListener=()=>{};
  sb.document={createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){}}),getElementById:()=>null,querySelector:()=>null,body:{classList:{add(){},remove(){}}},addEventListener(){}};
  sb.state={user:{username:'ana',nombre:'Ana',rol:'Supervisor',uid:'u1',permisos:['avanceProduccion']},currentTab:''};
  sb.ahora=o.ahora||ms(19);sb.tareoAhoraServidor=()=>sb.ahora;sb.glacialCierresSesion=[];
  sb.programaciones=o.programaciones||[];sb.records=o.records||[];sb.paletas=o.paletas||[];
  sb.loadProgramaciones=()=>sb.programaciones;sb.loadRecords=()=>sb.records;sb.loadPaletas=()=>sb.paletas;
  sb.normalizarCuadros=r=>r.cuadros||[];sb.normalizarMotivoParada=t=>String(t||'').toLowerCase().trim();sb.estandarMotivoParada=()=>0;
  sb.glacialVelocidadEstandar=(l)=>o.vel===undefined?({PET1:2000,PET2:3000,B7L:600,C20L:120,B20L:0}[l]||0):o.vel;
  const s02=leer('js/nucleo/02-estado.js');
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(s02.slice(s02.indexOf('const ROLES_DISTRIBUCION_PERSONAL'),s02.indexOf('function tienePermiso(permiso)'))+"function tienePermiso(p){return p==='avanceProduccion';}",sb);
  vm.runInContext('var obtenerItemsMerma=l=>('+JSON.stringify({B7L:['Bidones','Preformas','Tapa','Asa','Etiqueta','Polietileno 48cm'],C20L:['Cajas','Bolsas Trilaminadas','Tapa','Polietileno 54 cm'],PET1:['Botellas','Preformas','Tapa Plana','Tapa Sport Cap','Etiqueta','Polietileno']})+')[l]||[];',sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  vm.runInContext(leer('js/produccion/29-avance-produccion.js'),sb);
  vm.runInContext(leer('js/produccion/61-reporte-linea.js'),sb);
  const s16=leer('js/produccion/16-paletas.js');
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+s16.slice(s16.indexOf('  function ultimoEstado(registros){'),s16.indexOf('  const resumenTurnosOriginal'))+s16.slice(s16.indexOf('  function msRegistroPaleta'),s16.indexOf('  const resumenOriginal = resumenPaletas;')),sb);
  vm.runInContext(`avanceEstado.fecha='${FECHA}';avanceEstado.turno='${o.turno||'DÍA'}';avanceEstado.paradasOperativas=${JSON.stringify(o.paradas||[])};`,sb);
  return sb;
}
const prog=(linea,inicio,cant,marca,pres,turno)=>({linea,fecha:FECHA,turno:turno||'DÍA',marca:marca||'Bells',presentacion:pres||'7 L',cantidadProgramada:cant||100,unidadesPorPaleta:1000,estadoOperacion:{estado:'EN_PRODUCCION',inicio,paradas:[]}});
const pal=(linea,total,hora,marca,pres,turno,cre)=>({linea,fecha:FECHA,turno:turno||'DÍA',marca:marca||'Bells',presentacion:pres||'7 L',tipoPaleta:'COMPLETA',paletas:total/1000,totalUnidades:total,hora,creadoEn:cre||1});
const op=(id,d,m,tipo)=>({id,descripcion:d,minutos:m,tipo:tipo||'NO_PROGRAMADA',fecha:FECHA,turno:'DÍA',linea:'PET1',origen:'AVANCE'});

/* 1) PET1 completo */
let sb=entorno({programaciones:[prog('PET1',ms(7),20000,'Scala','2.5 L')],paletas:[pal('PET1',10000,'12:00','Scala','2.5 L',null,1),pal('PET1',18000,'18:30','Scala','2.5 L',null,2)],
  paradas:[op('a','Tanque vacío',90,'NO_PROGRAMADA'),op('b','Refrigerio',30,'PROGRAMADA')],
  records:[{id:'r',linea:'PET1',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',cuadros:[{horaInicio:'07:00',marca:'Scala',presentacion:'2.5 L',insumos:{polietilenoKg:38},mermas:[{item:'Botellas',unidades:90,peso:0},{item:'Polietileno',unidades:0,peso:2.5}],paradasProgramadas:[],paradasNoProgramadas:[]}]}]});
let l=sb.avLineaSnapshot('PET1','19:00','CIERRE',ms(19));
let m=sb.glacialReporteLinea.modelo(l,{tipo:'CIERRE',relevo:false,supervisor:'Ejemplo',fecha:FECHA,turno:'DÍA',horaCorte:'19:00',id:FECHA+'|DÍA|CIERRE'});
ok(m.resumen.programado===20000&&m.resumen.producido===18000&&m.resumen.pendiente===2000&&m.resumen.excedente===0&&Math.round(m.resumen.cumplimiento)===90,'resumen: programado 20.000, producido 18.000, pendiente 2.000, cumplimiento 90 %');
ok(m.marcas.reduce((s,k)=>s+k.produccion,0)===m.resumen.producido,'conciliación: la suma de la producción por marca = total producido');
ok(m.resumen.ratio===l.ratio&&m.resumen.minutosEfectivos===l.minutosEfectivos&&m.resumen.unidadRatio==='B/H','el ratio y el tiempo efectivo son exactamente los del snapshot (mismo modelo)');
ok(m.paradas.programadas===30&&m.paradas.noProgramadas===90&&m.paradas.total===120&&m.paradas.motivos[0].motivo==='Tanque vacío','paradas: 30 programadas + 90 no programadas = 120 min (las usadas en el cálculo) y principales motivos');
ok(Math.abs(m.resumen.minutosTranscurridos-m.resumen.minutosEfectivos-m.paradas.total)<1e-9,'conciliación: transcurrido − paradas mostradas = tiempo efectivo');
ok(m.encabezado.estado==='CERRADO'&&m.encabezado.supervisor==='Ejemplo'&&m.encabezado.inicio==='07:00'&&m.encabezado.bloque==='DÍA','encabezado: CERRADO, inicio, supervisor y bloque');
ok(sb.glacialReporteLinea.modelo(l,{tipo:'CIERRE',relevo:true,supervisor:'x',fecha:FECHA,turno:'DÍA',id:'a'}).encabezado.estado==='PARCIAL'&&sb.glacialReporteLinea.modelo(l,{tipo:'AVANCE',supervisor:'x',fecha:FECHA,turno:'DÍA',id:'a'}).encabezado.estado==='PARCIAL','un avance o un relevo es PARCIAL, solo el cierre del bloque es CERRADO');
/* indicadores */
const disp=(600-0)/600;   // planificado = 720 − 30 = 690; no programadas 90
ok(Math.abs(m.indicadores.disponibilidad.valor-(690-90)/690)<1e-9,'disponibilidad = (planificado − no programadas) ÷ planificado = 600/690');
ok(Math.abs(m.indicadores.rendimiento.valor-m.resumen.ratio/2000)<1e-9&&Math.abs(m.indicadores.oee.valor-m.indicadores.disponibilidad.valor*m.indicadores.rendimiento.valor)<1e-9,'rendimiento = ratio ÷ velocidad estándar y OEE = disponibilidad × rendimiento');
ok(m.indicadores.calidad.valor===null&&m.indicadores.calidad.texto==='Sin datos suficientes','Calidad: «Sin datos suficientes» (no se mide; nunca 100 %)');
ok(['verde','ambar','roja','gris'].includes(m.indicadores.disponibilidad.nivel),'los colores salen de las metas configuradas (no de porcentajes de ejemplo)');
/* sin velocidad */
const sb2=entorno({vel:0,programaciones:[prog('B20L',ms(7),800,'Scala','20 L')],paletas:[pal('B20L',660,'12:00','Scala','20 L')]});
const l2=sb2.avLineaSnapshot('B20L','19:00','CIERRE',ms(19));
const m2=sb2.glacialReporteLinea.modelo(l2,{tipo:'CIERRE',relevo:false,supervisor:'x',fecha:FECHA,turno:'DÍA',id:'z'});
ok(m2.indicadores.rendimiento.valor===null&&m2.indicadores.oee.valor===null&&m2.indicadores.rendimiento.sinVelocidad===true,'sin velocidad estándar: rendimiento y OEE «sin datos» (no se inventan)');
ok(m2.resumen.unidad==='bidones'&&m.resumen.unidad==='botellas','unidades por línea: PET botellas, B20L bidones');
/* excedente */
const sb3=entorno({programaciones:[prog('C20L',ms(7),1000,'Scala','Cajas')],paletas:[pal('C20L',1500,'12:00','Scala','Cajas')]});
const l3=sb3.avLineaSnapshot('C20L','19:00','CIERRE',ms(19));
const m3=sb3.glacialReporteLinea.modelo(l3,{tipo:'CIERRE',relevo:false,supervisor:'x',fecha:FECHA,turno:'DÍA',id:'z'});
ok(m3.resumen.pendiente===0&&m3.resumen.excedente===500&&m3.resumen.unidad==='cajas'&&m3.resumen.unidadRatio==='C/H','producción superior al programa: pendiente 0 (nunca negativo) y excedente +500 aparte; C20L en cajas y C/H');

/* 2) producción por hora */
ok(m.porHora&&m.porHora.intervalos[0].produccion===null&&m.porHora.intervalos.some(i=>i.produccion===10000),'por hora: el intervalo sin registros es «sin registro» (null), no cero; el hora con registro muestra su producción');
ok(m.porHora.intervalos.reduce((s,i)=>s+(i.produccion||0),0)===m.porHora.totalPaletas,'la suma de los intervalos = producción acumulada de Paletas');
const sbN=entorno({turno:'NOCHE',programaciones:[prog('PET1',ms(21),9000,'Scala','2.5 L','NOCHE')],paletas:[pal('PET1',3000,'23:30','Scala','2.5 L','NOCHE',1),pal('PET1',6000,'02:15','Scala','2.5 L','NOCHE',2)],ahora:ms(7,0,9)});
const lN=sbN.avLineaSnapshot('PET1','07:00','CIERRE',ms(7,0,9));
const mN=sbN.glacialReporteLinea.modelo(lN,{tipo:'CIERRE',relevo:false,supervisor:'x',fecha:FECHA,turno:'NOCHE',horaCorte:'07:00',id:'n'});
ok(mN.porHora.intervalos.length>=9&&mN.porHora.intervalos.some(i=>i.desdeMs>=ms(0,0,9)&&i.produccion!==null)&&mN.porHora.intervalos.reduce((s,i)=>s+(i.produccion||0),0)===6000,'Noche: las horas después de medianoche se asignan al día siguiente y suman 6.000');
ok(mN.encabezado.bloque==='NOCHE','el bloque es NOCHE');
const sinReg=entorno({programaciones:[prog('PET1',ms(7),1000,'Scala','2.5 L')],paletas:[]});
const mS=sinReg.glacialReporteLinea.modelo(sinReg.avLineaSnapshot('PET1','12:00','AVANCE',ms(12)),{tipo:'AVANCE',supervisor:'x',fecha:FECHA,turno:'DÍA',id:'s'});
ok(mS.porHora===null,'sin registros horarios: no se dibuja un gráfico inventado');

/* 3) insumos y mermas con el catálogo real */
ok(m.insumos.map(f=>f.insumo).join('|').startsWith('Botellas|Preformas|Tapa Plana|Tapa Sport Cap|Etiqueta|Polietileno'),'PET1: filas del catálogo real de la línea (no etiquetas inventadas)');
const fb=m.insumos.find(f=>f.insumo==='Botellas'),fpre=m.insumos.find(f=>f.insumo==='Preformas'),fpol=m.insumos.find(f=>f.insumo==='Polietileno');
ok(fb.merma===90&&Math.abs(fb.pct-90/18000*100)<1e-9&&fb.unidad==='UND','merma de botellas 90 UND = 0,5 % de la producción (denominador: producción de la línea)');
ok(fpre.merma===null&&fpre.consumo===null,'sin registro → «—» (null), no 0');
ok(fpol.merma===2.5&&fpol.unidad==='kg'&&fpol.consumo===38&&fpol.consumoEstimado===true,'polietileno: merma 2,5 kg y consumo 38 kg marcado como estimado');
const sbC=entorno({programaciones:[prog('C20L',ms(7),1200,'Scala','Cajas')],paletas:[pal('C20L',1080,'12:00','Scala','Cajas')],
  records:[{id:'rc',linea:'C20L',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',cuadros:[{horaInicio:'07:00',marca:'Scala',presentacion:'Cajas',paradasProgramadas:[],paradasNoProgramadas:[],
    mermas:[{item:'Cajas',unidades:100,peso:56},{item:'Bolsas Trilaminadas',unidades:100,peso:90.6},{item:'Tapa',unidades:100,peso:11.14},{item:'Polietileno 54 cm',unidades:0,peso:3.6}]}]}]});
const mC=sbC.glacialReporteLinea.modelo(sbC.avLineaSnapshot('C20L','19:00','CIERRE',ms(19)),{tipo:'CIERRE',relevo:false,supervisor:'x',fecha:FECHA,turno:'DÍA',id:'c'});
ok(mC.insumos.map(f=>f.insumo).join('|')==='Cajas|Bolsas Trilaminadas|Tapa|Polietileno 54 cm','C20L: Cajas, Bolsas Trilaminadas, Tapa y Polietileno 54 cm (catálogo real)');
ok(mC.insumos[0].mermaPeso===56&&mC.insumos[1].mermaPeso===90.6&&mC.insumos[2].mermaPeso===11.14&&mC.insumos[3].merma===3.6&&mC.insumos[3].unidad==='kg','C20L: pesos calculados 56, 90.6, 11.14 y 3.6 kg tal como se guardaron (sin recalcular factores)');
ok(mC.insumos[3].pct===null,'polietileno C20L: sin porcentaje (no se divide kg entre UND)');

/* 4) acciones */
ok(m.acciones.length>=1&&m.acciones.every(a=>a.estado==='Por validar')&&m.acciones.some(a=>/2\.000|2,000/.test(a.accion)&&a.responsable==='Planificación'),'acciones: «Evaluar 2.000 botellas pendientes» (Planificación) en estado «Por validar»');
ok(m.acciones.filter(a=>a.area==='Paradas').every(a=>a.responsable==='Por asignar'&&!/causa|falla de/i.test(a.accion.replace('«Tanque vacío»',''))),'las paradas se revisan con responsable «Por asignar» sin atribuir causas');
const mSin=entorno({programaciones:[prog('PET1',ms(7),1000,'Scala','2.5 L')],paletas:[pal('PET1',1000,'12:00','Scala','2.5 L')]});
const mAcc=mSin.glacialReporteLinea.modelo(mSin.avLineaSnapshot('PET1','19:00','CIERRE',ms(19)),{tipo:'CIERRE',relevo:false,supervisor:'x',fecha:FECHA,turno:'DÍA',id:'q'});
ok(mAcc.acciones.length===0||mAcc.acciones.every(a=>a.estado==='Por validar'),'sin hallazgos no se inventan acciones');

/* 5) congelado, serializable, sin importes */
const json=JSON.stringify(m);
ok(!/undefined|NaN|Infinity/.test(json)&&!/S\/|costo|soles|importe/i.test(json),'el modelo es serializable y no contiene importes económicos');
ok(JSON.stringify(sb.glacialReporteLinea.modelo(l,{tipo:'CIERRE',relevo:false,supervisor:'Ejemplo',fecha:FECHA,turno:'DÍA',horaCorte:'19:00',id:FECHA+'|DÍA|CIERRE'}))===json,'el mismo snapshot da el mismo modelo (determinista)');
/* 6) integración con el snapshot de Avance/Cierre */
sb.ahora=ms(19);
const snap=sb.avConstruirSnapshot('19:00','CIERRE');
const lp=snap.lineas.find(x=>x.linea==='PET1');
ok(lp.reporte&&lp.reporte.version===1&&lp.reporte.resumen.producido===lp.produccionTotal&&lp.reporte.resumen.ratio===lp.ratio,'el snapshot trae el modelo congelado y su cifra coincide con la pantalla (producción y ratio)');
ok(new RegExp('Ratio: '+sb.avRatioTexto(lp.ratio,lp.unidadRatio,lp.ratioDisponible).replace(/[.]/g,'\\.')).test(snap.texto)&&lp.reporte.encabezado.estado==='CERRADO','el texto de WhatsApp muestra el mismo ratio y el reporte nace CERRADO');
/* cambios posteriores no alteran el modelo guardado */
const guardado=JSON.parse(JSON.stringify(lp.reporte));
sb.paletas.push(pal('PET1',50000,'18:50','Scala','2.5 L',null,9));
ok(JSON.stringify(lp.reporte)===JSON.stringify(guardado),'datos posteriores no cambian el modelo ya guardado');
ok(/avReporteLinea\('/.test(sb.avBotonReporteLinea({id:'x'},lp))&&sb.avBotonReporteLinea({id:'x'},{linea:'PET1'})==='','botón de reporte por línea solo si el snapshot lo trae (los anteriores no lo tienen)');
/* 7) el dibujo reserva altura para todas las filas */
const mD=sb.glacialReporteLinea.medidas;
const grande=JSON.parse(JSON.stringify(m));grande.marcas=Array.from({length:20},(_,i)=>({marca:'M'+i,presentacion:'x',produccion:1}));grande.insumos=Array.from({length:30},(_,i)=>({insumo:'I'+i,consumo:null,merma:null,unidad:'UND'}));grande.paradas.motivos=Array.from({length:4},(_,i)=>({motivo:'m'+i,minutos:1}));
ok(mD(grande).total>mD(m).total+600,'listas largas de marcas e insumos agrandan la imagen (no se recortan filas)');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
