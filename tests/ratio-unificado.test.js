/* Ratio unificado Avance/Cierre/semáforo: misma producción, mismo corte, snapshot congelado. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-07';
const ms=(h,m,dia)=>new Date(2026,9,dia||7,h,m||0).getTime();
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}

function entorno(o){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0,Infinity,isFinite,Boolean};
  vm.createContext(sb);sb.window=sb;sb.addEventListener=()=>{};
  sb.document={createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){}}),getElementById:()=>null,querySelector:()=>null,body:{classList:{add(){},remove(){}}},addEventListener(){}};
  sb.state={user:{username:'t',nombre:'Sup'},currentTab:''};
  sb.ahora=o.ahora||ms(12,52);sb.tareoAhoraServidor=()=>sb.ahora;
  sb.programaciones=o.programaciones||[];sb.records=o.records||[];sb.paletas=o.paletas||[];
  sb.loadProgramaciones=()=>sb.programaciones;sb.loadRecords=()=>sb.records;sb.loadPaletas=()=>sb.paletas;
  sb.normalizarCuadros=r=>r.cuadros||[];
  sb.normalizarMotivoParada=t=>String(t||'').toLowerCase().trim();sb.estandarMotivoParada=()=>0;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  vm.runInContext(leer('js/produccion/29-avance-produccion.js'),sb);
  // servicio compartido de 16 (se extrae solo lo necesario: ultimoEstado + servicio)
  const s16=leer('js/produccion/16-paletas.js');
  const i0=s16.indexOf('  function ultimoEstado(registros){'),i1=s16.indexOf('  const resumenTurnosOriginal');
  const j0=s16.indexOf('  function msRegistroPaleta'),j1=s16.indexOf('  const resumenOriginal = resumenPaletas;');
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+s16.slice(i0,i1)+s16.slice(j0,j1),sb);
  vm.runInContext(`avanceEstado.fecha='${FECHA}';avanceEstado.turno='${o.turno||'DÍA'}';`,sb);
  sb.setOperativas=l=>vm.runInContext('avanceEstado.paradasOperativas='+JSON.stringify(l),sb);
  return sb;
}
const prog=(linea,inicio,extra)=>Object.assign({linea,fecha:FECHA,turno:'DÍA',marca:'Bells',presentacion:'7 L',cantidadProgramada:100,unidadesPorPaleta:1000,estadoOperacion:{estado:'EN_PRODUCCION',inicio,paradas:[]}},extra||{});
const pal=(linea,tipo,total,hora,turno,creadoEn,extra)=>Object.assign({linea,fecha:FECHA,turno:turno||'DÍA',marca:'Bells',presentacion:'7 L',tipoPaleta:tipo,paletas:tipo==='COMPLETA'?total/1000:0,totalUnidades:total,hora,creadoEn:creadoEn||0},extra||{});
const op=(id,d,m,tipo,extra)=>Object.assign({id,descripcion:d,minutos:m,tipo:tipo||'NO_PROGRAMADA',fecha:FECHA,turno:'DÍA',linea:'B7L',origen:'AVANCE'},extra||{});

/* 1) Ejemplo B7L: 3.486 UND, 07:00–12:52, 100 min de paradas */
let sb=entorno({programaciones:[prog('B7L',ms(7))],paletas:[pal('B7L','COMPLETA',3000,'12:00',null,1),pal('B7L','INCOMPLETA',486,'12:30',null,2)]});
sb.setOperativas([op('a','Falla',100,'NO_PROGRAMADA',{horaInicio:'09:00',horaFin:'10:40'})]);
let l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
ok(l.produccionTotal===3486&&l.minutosTranscurridos===352&&l.minutosEfectivos===252,'B7L: 3.486 UND, transcurrido 352 min, efectivo 252 min (4,2 h)');
ok(Math.abs(l.ratio-830)<1e-9,'B7L: ratio = 3.486 ÷ 4,2 = 830 B/H (no 355)');
ok(l.versionCalculo===2&&l.corteMs===ms(12,52)&&l.inicioMs===ms(7)&&l.bloque==='DÍA'&&l.fechaBloque===FECHA,'el snapshot guarda versión, corteMs, inicioMs, bloque y fecha');
ok(l.minutosParadasNoProgramadasDesc===100&&l.minutosParadasProgramadasDesc===0,'y las paradas descontadas (programadas / no programadas)');
const det=sb.avDetalleRatioLinea(l);
ok(/Cómo se calculó el ratio/.test(det)&&/3\.486|3,486/.test(det)&&/352/.test(det)&&/252/.test(det)&&/830/.test(det),'el detalle desplegable muestra producción, transcurrido, efectivo, fórmula y resultado');

/* 2) misma entrada → misma salida en texto, pantalla y semáforo (23b) */
const snap={id:'x',fecha:FECHA,turno:'DÍA',tipo:'AVANCE',horaCorte:'12:52',supervisor:'S',lineas:[l]};
ok(sb.avTextoWhatsApp(snap).includes('Ratio: 830 B/H')&&sb.avRatioTexto(l.ratio,l.unidadRatio,l.ratioDisponible)==='830 B/H','texto y pantalla: 830 B/H');
const tS=sb.calcularTiemposLinea('B7L','DÍA',FECHA,{inicioMs:ms(7),finMs:ms(12,52)});
const rS=sb.calcularRatiosLinea(tS,{produccion:3486,programado:100000,ahora:ms(12,52)});
ok(Math.abs(rS.ratioEfectivo-830)<1e-9,'el semáforo (23b) al mismo corte da el mismo ratio');

/* 3) horaFin posterior al corte no amplía el denominador */
sb.setOperativas([op('a','Falla',100,'NO_PROGRAMADA',{horaInicio:'12:00',horaFin:'14:00'})]);
l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
ok(l.minutosTranscurridos===352&&Math.round(l.minutosParadasNoProgramadasDesc)===52,'una parada que termina después del corte se recorta (52 min) y el tiempo no crece');
sb.records=[{id:'r',linea:'B7L',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',cuadros:[{horaInicio:'07:00',horaFin:'15:00',estadoCuadro:'FINALIZADO',marca:'Bells',presentacion:'7 L',paradasProgramadas:[],paradasNoProgramadas:[]}]}];
sb.programaciones=[prog('B7L',ms(7))];sb.setOperativas([]);
l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
ok(l.minutosTranscurridos===352&&l.corte==='12:52','una horaFin de registro posterior al corte no amplía el tiempo (352)');
sb.records=[];

/* 4) Día + Intermedio: sin doble conteo, cada turno con su acumulado */
sb=entorno({programaciones:[prog('B7L',ms(7)),prog('B7L',ms(7),{turno:'INTERMEDIO'})],
  paletas:[pal('B7L','COMPLETA',2000,'10:00','DÍA',1),pal('B7L','COMPLETA',3000,'11:00','DÍA',2),   // Día: 3.000 acumulado (no 5.000)
           pal('B7L','COMPLETA',1000,'12:00','INTERMEDIO',3),pal('B7L','INCOMPLETA',200,'12:10','INTERMEDIO',4)]});
sb.setOperativas([]);
let r=sb.glacialProduccionPaletasAlCorte('B7L',FECHA,['DÍA','INTERMEDIO'],'Bells','7 L',ms(12,52));
ok(r.valor===4200,'Día (3.000 acumulado) + Intermedio (1.000 + saldo 200) = 4.200: cada turno aporta su último acumulado, sin duplicar');
ok(sb.avProduccionHasta('B7L','Bells','7 L','12:52','AVANCE').valor===4200,'Avance usa el mismo servicio: 4.200 (antes tomaba un solo registro para todo el bloque)');
r=sb.glacialProduccionPaletasAlCorte('B7L',FECHA,['DÍA','INTERMEDIO'],'Bells','7 L',ms(11,30));
ok(r.valor===3000,'al corte 11:30 se excluyen los registros posteriores (3.000)');
ok(sb.glacialProduccionPaletasAlCorte('B7L',FECHA,['DÍA'],'Otra','7 L',ms(12)).encontrada===false,'sin registros: «no encontrada» (distinto de cero producido)');
/* Noche cruzando medianoche */
sb=entorno({turno:'NOCHE',programaciones:[prog('B7L',ms(21),{turno:'NOCHE'})],paletas:[pal('B7L','COMPLETA',1000,'23:00','NOCHE',1),pal('B7L','COMPLETA',2500,'02:00','NOCHE',2)]});
sb.setOperativas([]);
ok(sb.glacialProduccionPaletasAlCorte('B7L',FECHA,['NOCHE'],'Bells','7 L',ms(1,0,8)).valor===1000&&sb.glacialProduccionPaletasAlCorte('B7L',FECHA,['NOCHE'],'Bells','7 L',ms(3,0,8)).valor===2500,'Noche: el registro de las 02:00 pertenece al día siguiente (corte 01:00 → 1.000; 03:00 → 2.500)');

/* 5) Snapshot congelado: cambiar fecha, turno o datos no altera sus bloques */
sb=entorno({programaciones:[prog('B7L',ms(7))],paletas:[pal('B7L','COMPLETA',3000,'12:00',null,1)]});
sb.setOperativas([op('a','Falla',60,'NO_PROGRAMADA')]);
l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
const copia=JSON.parse(JSON.stringify(l));
sb.setOperativas([op('a','Falla',60,'NO_PROGRAMADA'),op('b','Otra',200,'NO_PROGRAMADA')]);sb.paletas=[];
vm.runInContext("avanceEstado.fecha='2026-12-31';avanceEstado.turno='NOCHE';",sb);
const bl=sb.avBloquesPresentacionLinea(copia);
ok(bl[0].ratio===l.ratio&&bl[0].produccionTotal===3000,'reexportar tras cambiar fecha, turno y registros: el snapshot conserva sus datos');
ok(sb.avTextoWhatsApp({id:'x',fecha:FECHA,turno:'DÍA',tipo:'AVANCE',horaCorte:'12:52',supervisor:'S',lineas:[copia]}).includes('Ratio: '+sb.avRatioTexto(l.ratio,l.unidadRatio,true)),'el texto reexportado usa el ratio guardado');
/* snapshot antiguo (sin versión): se conserva, sin detalle inventado */
ok(sb.avDetalleCalculoLinea({ratio:100,ratioDisponible:true})==='','un snapshot antiguo no muestra un detalle que no puede explicar');

/* 6) inconsistencia, cero tiempo, inicio faltante */
sb=entorno({programaciones:[prog('B7L',ms(7))],paletas:[pal('B7L','COMPLETA',3000,'12:00',null,1)]});
sb.setOperativas([op('a','Larga',400,'NO_PROGRAMADA')]);
l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
ok(l.paradasExcedenTiempo===true&&l.ratio===null&&/Inconsistencia/.test(sb.avDetalleRatioLinea(l)),'paradas (400) mayores que el tiempo (352): ratio «—» e inconsistencia informada');
sb=entorno({programaciones:[{linea:'B7L',fecha:FECHA,turno:'DÍA',marca:'Bells',presentacion:'7 L',cantidadProgramada:100,estadoOperacion:{}}],paletas:[pal('B7L','COMPLETA',3000,'12:00',null,1)]});
sb.setOperativas([]);
l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
ok(l.ratio===null&&l.ratioDisponible===false,'inicio faltante: ratio no disponible');

/* 7) varios formatos: sin duplicar tiempo ni paradas */
const cu=(h,hf,p)=>({horaInicio:h,horaFin:hf,estadoCuadro:'FINALIZADO',marca:'Bells',presentacion:p,paradasProgramadas:[],paradasNoProgramadas:[]});
const cuSin=p=>({marca:'Bells',presentacion:p,paradasProgramadas:[],paradasNoProgramadas:[]});
sb=entorno({programaciones:[prog('B7L',ms(7)),prog('B7L',ms(7),{presentacion:'10 L'})],
  paletas:[pal('B7L','COMPLETA',2000,'12:00',null,1),pal('B7L','COMPLETA',1000,'12:30',null,2,{presentacion:'10 L'})],
  records:[{id:'r',linea:'B7L',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',cuadros:[cu('07:00','10:00','7 L'),cu('10:00','','10 L')]}]});
sb.setOperativas([op('g','General',30,'NO_PROGRAMADA')]);
l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
const [f1,f2]=l.bloques;
ok(f1.minutosTranscurridos===180&&f2.minutosTranscurridos===172,'cada formato tiene su ventana (07:00–10:00 = 180 min; 10:00–12:52 = 172 min), no el total repetido');
ok(Math.round(f1.minutosEfectivos)===150&&Math.round(f2.minutosEfectivos)===172,'la parada general de solo minutos se descuenta una sola vez (en el primer formato)');
ok(f1.ratio>0&&f2.ratio>0&&l.ratio>0,'ratio global de línea y ratios por formato conviven');
sb=entorno({programaciones:[prog('B7L',ms(7)),prog('B7L',ms(7),{presentacion:'10 L'})],
  paletas:[pal('B7L','COMPLETA',2000,'12:00',null,1),pal('B7L','COMPLETA',1000,'12:30',null,2,{presentacion:'10 L'})],
  records:[{id:'r',linea:'B7L',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',cuadros:[cuSin('7 L'),cuSin('10 L')]}]});
sb.setOperativas([]);
l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
ok(l.bloques.length===2&&l.bloques.every(b=>b.sinTiempo===true&&b.ratio===null),'formatos sin hora propia: «Sin tiempo asignado», no se repite el tiempo total');
ok(sb.avRatioBloqueTexto(l.bloques[0],'B/H')==='Sin tiempo asignado','y así se muestra en texto, imagen y pantalla');

/* 8) botones del semáforo sin efecto */
sb=entorno({programaciones:[prog('B7L',ms(7),{estadoOperacion:{estado:'DETENIDA',inicio:ms(7),paradas:[{id:'b',tipo:'DETENCION',motivo:'x',clasificacion:'NO_PROGRAMADA',inicio:ms(9),fin:ms(11),origen:'BOTON'}]}})],paletas:[pal('B7L','COMPLETA',3000,'12:00',null,1)]});
sb.setOperativas([]);
l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
ok(l.minutosEfectivos===352&&Math.abs(l.ratio-3000/(352/60))<1e-9,'DETENER/PAUSA del semáforo no cambian el ratio');

/* 9) una sola hora del servidor */
ok(/const ahoraMs=avAhoraMs\(\)/.test(leer('js/produccion/29-avance-produccion.js'))&&/avLineaSnapshot\(l,horaReal,tipo,ahoraMs\)/.test(leer('js/produccion/29-avance-produccion.js')),'el reporte captura la hora del servidor una vez y la pasa a todas las líneas');
/* 10) la pantalla del semáforo muestra el corte y compara con el último avance */
const f24=leer('js/produccion/24-semaforo-produccion-actual.js');
ok(/avisoCorteRatio\(g\)/.test(f24)&&/Último avance/.test(f24),'Producción Actual muestra el corte del ratio y la comparación con el último avance');
sb=entorno({programaciones:[prog('B7L',ms(7))],paletas:[pal('B7L','COMPLETA',3000,'12:00',null,1)]});
sb.setOperativas([]);l=sb.avLineaSnapshot('B7L','12:52','AVANCE',ms(12,52));
vm.runInContext('avanceEstado.todosSnapshots='+JSON.stringify([{id:'s1',fecha:FECHA,turno:'DÍA',tipo:'AVANCE',horaCorte:'12:52',generadoEn:5,lineas:[l]}]),sb);
const u=sb.glacialUltimoAvanceLinea('B7L',FECHA,'INTERMEDIO');
ok(u&&u.horaCorte==='12:52'&&u.produccion===3000&&u.minutosEfectivos===352,'el último avance de la línea se lee de sus datos congelados (Intermedio comparte el bloque Día)');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
