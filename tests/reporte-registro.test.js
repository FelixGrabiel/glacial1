/* «Exportar PNG» (pestaña Gráficos) usa la plantilla aprobada: cableado del botón, mapeo de los valores existentes (sin recalcular)
   y etiquetas de turno. Los valores del flujo actual se presentan tal cual. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

/* 1) cableado real: botón → función → plantilla */
const f08=leer('js/produccion/08-graficos.js'),html=leer('index.html');
ok((f08.match(/async function exportarPNG\(\)/g)||[]).length===1,'exportarPNG está definida una sola vez (sin redefiniciones por orden de carga)');
ok(/onclick="exportarPNG\(\)"/.test(f08)&&/Exportar PNG/.test(f08),'el botón «Exportar PNG» de la pestaña Gráficos sigue llamando a exportarPNG()');
ok(/async function exportarPNG\(\)\{[\s\S]{0,300}glacialReporteRegistro\.exportar\(\)/.test(f08),'exportarPNG() ahora delega en la plantilla aprobada (glacialReporteRegistro.exportar)');
ok(/async function exportarPNGDetalle\(\)/.test(f08)&&/onclick="exportarPNGDetalle\(\)"/.test(f08)&&/PNG con gráficos \(detalle\)/.test(f08),'el diseño anterior (cascada, Pareto, análisis) queda como salida secundaria, con su propio botón');
ok(/Reporte_Diario_\$\{linea\}_\$\{fecha\}\.png/.test(leer('js/produccion/62-reporte-registro.js')),'el archivo descargado conserva el nombre Reporte_Diario_<línea>_<fecha>.png');
const i08=html.indexOf('08-graficos.js'),i61=html.indexOf('61-reporte-linea.js'),i62=html.indexOf('62-reporte-registro.js');
ok(i08>0&&i61>i08&&i62>i61&&(html.match(/62-reporte-registro\.js/g)||[]).length===1,'index.html carga 62 una sola vez, después de 08 y 61');
ok(/20261009-fmt1/.test(html.match(/61-reporte-linea\.js\?v=[^"]+/)[0])&&/20261009-fmt1/.test(html.match(/62-reporte-registro\.js\?v=[^"]+/)[0]),'versión de los scripts nuevos actualizada (evita entregar archivos en caché)');
ok(/area: 'Paradas'/.test(f08)&&/area: 'Mermas'/.test(f08)&&/area: 'Pendiente de producción'/.test(f08),'las acciones existentes traen su área (solo etiqueta; la lógica del análisis no cambió)');

/* 2) adaptador con valores del flujo actual */
const FECHA='2026-10-09';
const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,Infinity,isFinite,Boolean,GlacialIndicadores:require(R+'/js/nucleo/45-indicadores.js')};
vm.createContext(sb);sb.window=sb;
sb.obtenerItemsMerma=l=>({PET1:['Botellas','Preformas','Tapa Plana','Tapa Sport Cap','Etiqueta','Polietileno'],C20L:['Cajas','Bolsas Trilaminadas','Tapa','Polietileno 54 cm']})[l]||[];
sb.normalizarCuadros=r=>r.cuadros||[];
sb.avHoraMs=(f,h,t)=>{const d=new Date(f+'T'+h+':00');if(t==='NOCHE'&&Number(h.slice(0,2))<12)d.setDate(d.getDate()+1);return d.getTime();};
sb.METAS={oee:.85,disponibilidad:.9,rendimiento:.95,calidad:.99,merma:.02};
sb.colorSegunMeta=(v,m)=>v>=m?'#3F8F5F':v>=m*.85?'#F2A93B':'#C4472B';
sb.nombrePresentacionUI=(l,m,p)=>String(p).replace(/_/g,' ');
sb.agruparParadas=rec=>({filas:[{descripcion:'Refrigerio',tipo:'Programada',minutos:60},{descripcion:'Tanque vacío',tipo:'No programada',minutos:45},{descripcion:'Calibración',tipo:'No programada',minutos:30}],total:135});
sb.construirAnalisisAccionReporte=(rec,d)=>({acciones:[{area:'Paradas',dato:'Tanque vacío: 45 min',texto:'Revisar el punto registrado.'},{area:'Pendiente de producción',dato:'Cumplimiento 75.4%',texto:'Revisar el faltante.'}],textoEditado:''});
vm.runInContext(leer('js/produccion/61-reporte-linea.js'),sb);
vm.runInContext(leer('js/produccion/62-reporte-registro.js'),sb);
// d con valores arbitrarios del flujo actual: el reporte debe mostrarlos TAL CUAL (no se recalculan ni se comparan con ejemplos)
const d={programada:21000,efectiva:15828,cumplimiento:0.754,ratioEfectivo:1583.7,horasEfectivas:10,horasTurno:12,pProg:1,pNoProg:1,produccionNominal:14720,rendimiento:1.075,calidad:0.987,disponibilidad:0.744,oee:0.8};
const rec={id:'r1',linea:'PET1',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',estadoRegistro:'FINALIZADO',registradoPor:'Yeikari',
  cuadros:[{marca:'Scala',presentacion:'Pack_Regular_2.5Lx6und',horaInicio:'07:00',horaFin:'19:00',produccion:{efectiva:15828},mermas:[{item:'Botellas',unidades:244,peso:0}],insumos:{polietilenoKg:92.3,stretchFilmKg:16.1}}]};
(async()=>{
  let m=await sb.glacialReporteRegistro.modelo(rec,d);
  ok(m.resumen.programado===21000&&m.resumen.producido===15828&&m.resumen.cumplimiento===75.4&&m.resumen.ratio===1583.7,'resumen: programado, producido, cumplimiento y ratio son los de `d` (sin recalcular)');
  ok(m.resumen.pendiente===5172&&m.resumen.excedente===0,'pendiente = máx(0, programado − producido) y excedente aparte (misma definición del sistema)');
  ok(m.resumen.minutosEfectivos===600&&m.resumen.minutosTranscurridos===720&&m.resumen.paradasMin===120,'tiempo efectivo, transcurrido y paradas salen de las horas de `d`');
  ok(m.indicadores.disponibilidad.valor===0.744&&m.indicadores.rendimiento.valor===1.075&&m.indicadores.calidad.valor===0.987&&m.indicadores.oee.valor===0.8,'indicadores: disponibilidad, rendimiento, calidad y OEE son los valores existentes (calidad incluida; no se sustituye)');
  ok(m.indicadores.disponibilidad.nivel==='#C4472B'&&m.indicadores.calidad.nivel==='#F2A93B','los colores salen de las metas actuales del flujo (colorSegunMeta / METAS)');
  ok(m.encabezado.estado==='CERRADO'&&m.encabezado.bloque==='DÍA'&&m.encabezado.inicio==='07:00'&&m.encabezado.fin==='19:00'&&m.encabezado.supervisor==='Yeikari'&&m.encabezado.fecha===FECHA,'encabezado: cerrado (registro finalizado), día, inicio/fin y supervisor del registro');
  ok(m.marcas.length===1&&m.marcas[0].marca==='Scala'&&m.marcas[0].presentacion==='Pack Regular 2.5Lx6und'&&m.marcasTotal===15828,'producción por marca/presentación con el nombre del catálogo y el total del flujo');
  ok(m.paradas.programadas===60&&m.paradas.noProgramadas===60&&m.paradas.motivos[0].motivo==='Refrigerio'&&m.paradas.motivos.length===3,'paradas: las del flujo actual (agruparParadas) con principales motivos');
  ok(m.insumos.map(f=>f.insumo).slice(0,6).join('|')==='Botellas|Preformas|Tapa Plana|Tapa Sport Cap|Etiqueta|Polietileno'&&m.insumos[0].merma===244&&m.insumos[5].consumo===92.3&&m.insumos[5].consumoEstimado===true,'insumos y mermas con el catálogo real, consumo marcado como estimado');
  ok(m.acciones.length===2&&m.acciones.every(a=>a.responsable==='Por asignar'&&a.estado==='Por validar')&&/Tanque vacío: 45 min → Revisar/.test(m.acciones[0].accion),'acciones del análisis existente, «Por validar» y «Por asignar» (sin responsable inventado)');
  ok(m.resumen.personal===null&&m.resumen.personalEstado==='PENDIENTE'&&m.resumen.horasHombre===null,'sin distribución de personal: «Pendiente de confirmar» (no se inventa)');
  ok(!/undefined|NaN|Infinity/.test(JSON.stringify(m))&&!/ilustrativ|Ejemplo visual/i.test(JSON.stringify(m)),'modelo serializable y sin leyendas de ejemplo');
  /* personal y horas hombre desde la distribución existente */
  sb.glacialDistribucionPersonal={cargar:async()=>{},consultar:()=>({estado:'CONFIRMADO',cantidad:8}),consultarHorasHombre:()=>({horas:88,estado:'COMPLETO',cobertura:1})};
  m=await sb.glacialReporteRegistro.modelo(rec,d);
  ok(m.resumen.personal===8&&m.resumen.personalEstado==='CONFIRMADO'&&m.resumen.horasHombre.horas===88,'personal y horas hombre salen de la distribución compartida de Tareo');
  /* distribución lenta o sin conexión: no bloquea el reporte */
  sb.glacialDistribucionPersonal={cargar:()=>new Promise(()=>{}),consultar:()=>({estado:'PENDIENTE'}),consultarHorasHombre:()=>({horas:null,estado:'SIN_DATOS',cobertura:0})};
  const t0=Date.now();m=await sb.glacialReporteRegistro.modelo(rec,d,{cargarDistribucion:false});
  ok(m.resumen.personalEstado==='PENDIENTE'&&Date.now()-t0<2000,'sin conexión con la distribución, el reporte no se queda esperando');
  /* registro no finalizado → parcial; sin velocidad / sin horas → «—» */
  const m2=await sb.glacialReporteRegistro.modelo(Object.assign({},rec,{estadoRegistro:'EN_REGISTRO'}),Object.assign({},d,{produccionNominal:0,horasEfectivas:0}));
  ok(m2.encabezado.estado==='PARCIAL'&&m2.indicadores.rendimiento.valor===null&&m2.indicadores.oee.valor===null&&m2.resumen.ratio===null,'registro sin finalizar: PARCIAL (nunca cerrado); sin velocidad o sin horas efectivas: rendimiento, OEE y ratio «—»');
  /* NOCHE */
  const rn=Object.assign({},rec,{turno:'NOCHE',grupoTurno:'NOCHE',cuadros:[Object.assign({},rec.cuadros[0],{horaInicio:'21:00',horaFin:'07:00'})]});
  const mn=await sb.glacialReporteRegistro.modelo(rn,d,{cargarDistribucion:false});
  ok(mn.encabezado.bloque==='NOCHE'&&mn.encabezado.inicio==='21:00'&&mn.encabezado.fin==='07:00','NOCHE: el cierre a las 07:00 pertenece al día siguiente');
  /* faltantes frente a cero: sin registros nada se convierte en 0 */
  const mf=await sb.glacialReporteRegistro.modelo(Object.assign({},rec,{cuadros:[{marca:'Scala',presentacion:'x',horaInicio:'07:00',horaFin:'19:00',produccion:{efectiva:0},mermas:[{item:'Botellas',unidades:0,peso:0}]}]}),Object.assign({},d,{efectiva:0,programada:0}),{cargarDistribucion:false});
  ok(mf.marcas.length===0&&mf.insumos[0].merma===null&&mf.resumen.cumplimiento===null,'sin producción ni mermas registradas: «—» (null), no cero inventado');
  /* etiquetas de turno en la imagen (reporte → DÍA / NOCHE) */
  const textos=[];const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?(s=>({width:String(s).length*8})):k==='fillText'?(s=>{textos.push(String(s));}):(()=>{}),set:()=>true});
  const lienzo=()=>({width:0,height:0,getContext:()=>ctx});
  await sb.glacialReporteLinea.dibujar(m,{crearCanvas:lienzo,sinLogo:true});
  ok(textos.some(t=>t===`09/10/2026 · DÍA`)&&!textos.some(t=>/INTERMEDIO|MAÑANA|ilustrativ/i.test(t)),'la imagen dice «09/10/2026 · DÍA» (fecha DD/MM/AAAA, sin «+ INTERMEDIO» ni leyendas de ejemplo)');
  ok(textos.includes('REPORTE DE PRODUCCIÓN')&&textos.includes('RESUMEN DEL TURNO')&&textos.includes('PRODUCCIÓN POR MARCA')&&textos.includes('INDICADORES')&&textos.includes('PRODUCCIÓN POR HORA')&&textos.includes('PARADAS DEL TURNO')&&textos.includes('INSUMOS Y MERMAS')&&textos.includes('ACCIONES PARA EL SIGUIENTE TURNO'),'la imagen trae las secciones del formato aprobado, en su orden');
  const orden=['RESUMEN DEL TURNO','PRODUCCIÓN POR MARCA','INDICADORES','PRODUCCIÓN POR HORA','PARADAS DEL TURNO','INSUMOS Y MERMAS','ACCIONES PARA EL SIGUIENTE TURNO'].map(s=>textos.indexOf(s));
  ok(orden.every((v,i)=>i===0||v>orden[i-1]),'orden: resumen → marca/indicadores → hora/paradas → insumos → acciones');
  ok(['Programado','Producido','Pendiente','Cumplimiento','Ratio real','Tiempo efectivo','Disponibilidad','Rendimiento','Calidad','OEE'].every(t=>textos.includes(t)),'seis tarjetas del resumen y cuatro indicadores');
  ok(textos.some(t=>/Tiempo transcurrido/.test(t))&&textos.some(t=>/Horas hombre/.test(t))&&textos.some(t=>/Personal/.test(t)),'franja: tiempo transcurrido, paradas, personal y horas hombre');
  /* acciones largas: la altura crece (sin recortes) */
  const largo=JSON.parse(JSON.stringify(m));largo.acciones=[{area:'Paradas',accion:'palabra '.repeat(120),responsable:'Por asignar',estado:'Por validar'}];
  ok(sb.glacialReporteLinea.medidas(largo).hAcc>sb.glacialReporteLinea.medidas(m).hAcc+150,'una acción muy larga agranda la fila (no se recorta con puntos suspensivos)');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
