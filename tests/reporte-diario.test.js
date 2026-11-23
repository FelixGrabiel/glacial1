/* Reporte diario de producción (62b-reporte-diario.js, 23/11/2026): formato del Excel de la planta con las reglas del sistema. */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error(n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}

function entorno(cfg){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,isFinite,Boolean,Intl};
  vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  const s06=leer('js/produccion/06-registro.js'),s08=leer('js/produccion/08-graficos.js'),s01=leer('js/nucleo/01-config.js');
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+extraer(s06,'calcDerivedCuadro')+extraer(s06,'calcDerivedLegacy')+extraer(s06,'calcDerivedMulti')+extraer(s06,'calcDerived')+
    extraer(s08,'agruparMermas')+extraer(s08,'agruparInsumos'),sb);
  vm.runInContext('var MERMA_ITEMS=["Botellas"];var MERMA_ITEMS_POR_LINEA={B7L:["Bidones","Preformas","Tapa","Asa","Etiqueta","Polietileno 54cm"],C20L:["Cajas","Bolsas Trilaminadas","Tapa","Polietileno 54 cm"]};'+extraer(s01,'obtenerItemsMerma'),sb);
  sb.glacialConfigIndicadores=()=>cfg||{};
  vm.runInContext(leer('js/produccion/62b-reporte-diario.js'),sb);
  return sb;
}
const cuadro=(o)=>Object.assign({marca:'Scala',presentacion:'7L',ratioNominal:600,lote:'CF3',fechaVencimiento:'2027-11-29',horaInicio:'07:00',horaFin:'19:00',horasTurno:12,
  paradasProgramadas:[{tiempoMin:110}],paradasNoProgramadas:[{tiempoMin:40}],
  produccion:{programada:10000,efectiva:9324,sopladas:11358,calidad:5,paletas:74},
  mermas:[{item:'Bidones',unidades:111},{item:'Tapa',unidades:138}],
  insumos:{cajasPreformas:3.22,planchasCarton:888,polietilenoKg:149.48,stretchFilmKg:0}},o||{});
const persona=n=>({posicion:'P',nombre:n,cargo:'OPERARIO'});
const reg=(fecha,turno,ef,sop,np,extra)=>Object.assign({id:fecha+turno,linea:'B7L',fecha,turno,grupoTurno:turno,estadoRegistro:'FINALIZADO',registradoPor:'Félix López',
  cuadros:[cuadro({produccion:{programada:10000,efectiva:ef,sopladas:sop,calidad:5,paletas:74}}),{marca:'',horasTurno:0,produccion:{}}],
  personal:Array.from({length:np},(_,i)=>persona('P'+i))},extra||{});

const sb=entorno({personalRequerido:{B7L:11}});
const D=sb.glacialReporteDiario;

/* 1) semana: lunes a domingo e ISO */
ok(JSON.stringify(D.semanaDe('2026-11-29'))===JSON.stringify(['2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-28','2026-11-29']),'la semana va de lunes 23/11 a domingo 29/11');
const sw=D.semanaISO('2026-11-22');
ok(sw.semana===47&&sw.juliano===326,'22/11/2026: semana ISO 47, juliano 326');

/* 2) registro de B7L como el Excel: 07:00–19:00, 110 + 40 min de paradas, 9.324 efectivos */
const hoy=reg('2026-11-29','DÍA',9324,11358,14,{observaciones:'Stretch 17 kg: 1\nStretch 2 kg: 10 rollos',personal:[...Array.from({length:13},(_,i)=>persona('P'+i)),{posicion:'Líder',nombre:'Carlos Legua',cargo:'LÍDER DE LÍNEA'}]});
const todos=[reg('2026-11-23','DÍA',6648,4302,11),reg('2026-11-24','DÍA',6796,6543,11),reg('2026-11-28','DÍA',9554,6783,12),reg('2026-11-28','NOCHE',7114,6500,12),hoy,
  reg('2026-11-22','DÍA',5000,1,9),Object.assign(reg('2026-11-25','DÍA',999,0,3),{linea:'PET1'})];
const m=D.modelo(hoy,sb.calcDerived(hoy),todos);
ok(m.columnas.length===1&&m.columnas[0].lote==='CF3'&&m.columnas[0].vencimiento==='29/11/2027','una columna por cuadro activo (el vacío no aparece), con lote y vencimiento');
const c=m.columnas[0];
ok(Math.abs(c.horasEfectivas-9.5)<1e-9&&Math.abs(c.pProg-110/60)<1e-9&&Math.abs(c.pNoProg-40/60)<1e-9,'horas efectivas 12 − 2,5 = 9,5 h; paradas 1,83 h programadas y 0,67 h no programadas');
ok(Math.abs(c.ratioReal-777)<1e-9&&Math.abs(c.ratioSin-9324/9.5)<1e-9,'ratio real (con paradas) = 9.324 ÷ 12 = 777 B/H, como el «Ratio Producción Efectiva» del Excel; sin paradas = 981 B/H');
ok(Math.abs(c.diferencia-(9324/9.5-777))<1e-9&&c.noCumplida===676&&c.secundaria===11358,'diferencia por paradas, no cumplida 676 y bidones soplados 11.358');
ok(m.turno.personas===14&&m.firmas.lider==='Carlos Legua'&&m.firmas.supervisor==='Félix López','14 personas con nombre; firma del líder (cargo «Líder») y del supervisor que registró');
ok(m.observaciones.length===2&&m.observaciones[1]==='Stretch 2 kg: 10 rollos','observaciones línea por línea');
const ind=k=>m.indicadores.find(i=>i.clave===k);
const d=sb.calcDerived(hoy);
ok(Math.abs(ind('disponibilidad').valor-d.disponibilidad*100)<1e-9&&Math.abs(ind('oee').valor-d.oee*100)<1e-9&&Math.abs(ind('cumplimiento').valor-93.24)<1e-9,'indicadores = calcDerived del registro (cumplimiento 93,24 %)');
ok(m.indicadores.every(i=>['verde','ambar','rojo','gris'].includes(i.nivel)),'cada indicador lleva su color según la meta');
ok(m.mermas[0].item==='Bidones'&&Math.abs(m.mermas[0].pct-111/9324*100)<1e-9&&m.mermas.length===6&&m.mermas.find(x=>x.item==='Asa').pct===0,'mermas: todos los componentes de la línea en % de la efectiva (Asa en 0 %)');
ok(m.insumos.length===4&&m.insumos[1][1]===888,'insumos del turno (planchas de cartón 888)');

/* 3) semana: solo B7L, solo la semana del registro, día y noche por separado */
const S=m.semana;
ok(S.prod['DÍA'][0]===6648&&S.prod['DÍA'][5]===9554&&S.prod.NOCHE[5]===7114&&S.prod['DÍA'][6]===9324&&S.prod['DÍA'][2]===null,'producción por día y turno (el 25/11 de PET1 no entra)');
ok(S.totDia[5]===16668&&S.totalSemana===6648+6796+16668+9324,'total diario 16.668 el sábado y total semanal 39.436 (el domingo 22/11 es otra semana)');
ok(S.sec['DÍA'][0]===4302&&S.sec.NOCHE[5]===6500&&S.totSec[5]===13283,'bidones soplados por día y turno (13.283 el sábado)');
ok(S.pers['DÍA'][0]===11&&S.pers.NOCHE[5]===12&&m.requerido===11,'personal por día y requerido 11 (configuración)');

/* 4) líneas sin sopladas y configuración por defecto */
const sb2=entorno({});
const rc=reg('2026-11-27','DÍA',850,0,6,{linea:'C20L'});rc.cuadros[0].presentacion='20L';
const m2=sb2.glacialReporteDiario.modelo(rc,sb2.calcDerived(rc),[rc]);
ok(m2.secundaria===null&&m2.columnas[0].secundaria===null&&m2.unidadRatio==='C/H'&&m2.unidad==='cajas','Cajas 20L: sin fila de sopladas, ratio en C/H');
ok(m2.requerido===11&&sb2.glacialReporteDiario.personalRequerido('PET1')===7&&sb2.glacialReporteDiario.personalRequerido('B20L')===5,'sin configuración: requerido inicial (PET1 7, Cajas 20L 11, B20L 5)');
ok(m2.insumos[0][0]==='Cajas (und)','Cajas 20L: el insumo se llama «Cajas (und)»');
const rb=reg('2026-07-18','DÍA',129,300,3,{linea:'B20L'});
const m3=sb2.glacialReporteDiario.modelo(rb,sb2.calcDerived(rb),[rb]);
ok(m.numeroSemana===48&&m3.secundaria==='Bidones disponibles'&&m3.columnas[0].secundaria===300&&m3.insumos.length===2,'B20L: «Bidones disponibles» y solo planchas y stretch');

/* 4b) envío por WhatsApp: resumen que acompaña al archivo */
{const txt=D.resumenTexto(m);
ok(/\*REPORTE DIARIO DE PRODUCCIÓN · BIDONES 7 L\*/.test(txt)&&/29\/11\/2026 · DOMINGO · Turno DÍA/.test(txt)&&/Producción efectiva: \*9,324 bidones\* \(93\.2% de 10,000\)/.test(txt),'resumen para WhatsApp: título, fecha, turno y producción con % del programado');
ok(/Ratio real \(con paradas\): 777 B\/H · sin paradas: 981 B\/H/.test(txt)&&/Semana 48: 39,436 bidones/.test(txt),'incluye los dos ratios y la producción de la semana');
ok(m.paradasDetalle.length===2&&m.paradasDetalle[0].tipo==='PROGRAMADA'&&m.paradasDetalle[0].minutos===110&&m.mermasDetalle[0].unidades===111&&m.personalLista.length===14,'el modelo trae el detalle para el Excel: paradas, mermas en unidades y personal');}

/* 5) conexión con la aplicación */
const f08=leer('js/produccion/08-graficos.js'),html=leer('index.html'),f47=leer('js/produccion/47-analisis-paradas.js');
ok(/glacialReporteDiario\.exportar\(\)/.test(f08)&&/glacialReporteDiario\.editarRequerido\(\)/.test(f08)&&/glacialReporteDiario\.compartir\('img'\)/.test(f08),'«Exportar PNG» usa el reporte diario; hay botones «Enviar por WhatsApp» y «Personal y vida útil»');
ok(html.indexOf('62b-reporte-diario.js?v=')>html.indexOf('62-reporte-registro.js?v='),'index.html carga 62b después de 62');
ok(/personalRequerido:Object\.assign\(\{\},remota\.personalRequerido/.test(f47),'la configuración expone personalRequerido');
ok(D.alto(m)>2000,'la imagen calcula su alto según el contenido');

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
