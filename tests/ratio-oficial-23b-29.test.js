/* Ratio oficial: 23b (cálculo central) y 29 (Avance/Cierre) usan las mismas paradas oficiales, el mismo inicio y el mismo corte.
   Ratio = producción al corte ÷ horas efectivas; horas efectivas = (transcurrido − paradas oficiales) ÷ 60. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-05';
const ms=(h,m,dia)=>new Date(2026,9,dia||5,h,m||0).getTime();
const hhmm=t=>{const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};

function entorno(o){
  o=o||{};
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0,Infinity,isFinite,Boolean};
  vm.createContext(sb);sb.window=sb;sb.addEventListener=()=>{};sb.removeEventListener=()=>{};
  sb.document={createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){}}),getElementById:()=>null,querySelector:()=>null,body:{classList:{add(){},remove(){}}},addEventListener(){}};
  sb.state={user:{username:'t',nombre:'Supervisor'},currentTab:''};
  sb.tareoAhoraServidor=()=>o.ahora||ms(17,21);
  sb.programaciones=o.programaciones||[];sb.records=o.records||[];sb.paletas=o.paletas||[];
  sb.loadProgramaciones=()=>sb.programaciones;sb.loadRecords=()=>sb.records;sb.loadPaletas=()=>sb.paletas;
  sb.normalizarCuadros=r=>r.cuadros||[];
  sb.normalizarMotivoParada=t=>String(t||'').toLowerCase().trim();
  sb.estandarMotivoParada=t=>/refrigerio/i.test(t)?60:0;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  vm.runInContext(leer('js/produccion/29-avance-produccion.js'),sb);
  vm.runInContext(`avanceEstado.fecha='${FECHA}';avanceEstado.turno='${o.turno||'DÍA'}';`,sb);
  sb.setOperativas=l=>{sb.avanceEstado=undefined;vm.runInContext('avanceEstado.paradasOperativas='+JSON.stringify(l),sb);};
  return sb;
}
const prog=(linea,inicio,extra)=>Object.assign({linea,fecha:FECHA,turno:'DÍA',marca:'Scala',presentacion:'1.5 L',cantidadProgramada:100,unidadesPorPaleta:1000,
  estadoOperacion:{estado:'EN_PRODUCCION',inicio,paradas:[]}},extra||{});
const op=(id,descripcion,minutos,tipo,extra)=>Object.assign({id,descripcion,minutos,tipo,fecha:FECHA,turno:'DÍA',linea:'PET2',origen:'AVANCE'},extra||{});
const palet=(linea,total,hora)=>({linea,fecha:FECHA,turno:'DÍA',marca:'Scala',presentacion:'1.5 L',tipoPaleta:'COMPLETA',totalUnidades:total,hora:hora||'12:00'});

/* ===== 1) Caso de referencia PET2 ===== */
const OFICIALES=[op('p1','Refrigerio',60,'PROGRAMADA'),op('p2','Falla de máquina',87,'NO_PROGRAMADA')];   // 147 min
let sb=entorno({programaciones:[prog('PET2',ms(7))],paletas:[palet('PET2',32370)]});
sb.setOperativas(OFICIALES);
let l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l.minutosTranscurridos===621&&l.totalParadas===147,'PET2: transcurrido 621 min y paradas oficiales 147 min');
ok(l.minutosEfectivos===474&&Math.abs(l.minutosEfectivos/60-7.9)<1e-12,'PET2: tiempo efectivo 621 − 147 = 474 min = 7.9 h');
ok(l.produccionTotal===32370&&Math.abs(l.ratio-4097.468354430)<1e-6,'PET2: ratio = 32,370 ÷ 7.9 = 4,097.468354… (precisión completa)');
ok(sb.avRatioTexto(l.ratio,l.unidadRatio,l.ratioDisponible)==='4.097 B/H'||sb.avRatioTexto(l.ratio,l.unidadRatio,l.ratioDisponible)==='4,097 B/H','PET2: se muestra redondeado 4,097 B/H');
ok(l.minutosParadasDescontadas===147&&l.ratioDisponible===true,'PET2: lo descontado (147) coincide con la suma de la lista');

/* El historial del semáforo con detenciones y pausas adicionales no cambia nada. */
const botones=[{id:'b1',tipo:'DETENCION',motivo:'Falla de máquina',clasificacion:'NO_PROGRAMADA',estandarMin:0,inicio:ms(9),fin:ms(10),origen:'BOTON'},
  {id:'b2',tipo:'PAUSA',motivo:'Refrigerio',clasificacion:'PROGRAMADA',estandarMin:60,inicio:ms(12),fin:ms(13),origen:'BOTON'},{id:'b3',tipo:'DETENCION',motivo:'Otra',clasificacion:'NO_PROGRAMADA',estandarMin:0,inicio:ms(16),fin:0,origen:'BOTON'}];
sb=entorno({programaciones:[prog('PET2',ms(7),{estadoOperacion:{estado:'DETENIDA',inicio:ms(7),paradas:botones}})],paletas:[palet('PET2',32370)]});
sb.setOperativas(OFICIALES);
const l2=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l2.ratio===l.ratio&&l2.minutosEfectivos===474,'el historial del semáforo (abiertas, cerradas, pausas) deja el mismo ratio: 4,097.468…');

/* ===== 2) 23b: lista explícita ===== */
const T=(s,lista,extra)=>s.calcularTiemposLinea('PET2','DÍA',FECHA,Object.assign({inicioMs:ms(7),finMs:ms(17,21)},lista===undefined?{}:{paradasOficiales:lista},extra||{}));
sb=entorno({programaciones:[prog('PET2',ms(7))]});
sb.setOperativas([op('c1','Cache',30,'NO_PROGRAMADA')]);
let t=T(sb,[]);
ok(t.ok&&t.tiempoOperativoMin===621&&t.paradasDescontadasMin===0&&t.fuenteParadas==='EXPLICITA','paradasOficiales: [] descuenta cero minutos aunque otra caché contenga paradas');
t=T(sb,[{descripcion:'Oficial',minutos:147,tipo:'NO_PROGRAMADA'}]);
ok(Math.round(t.tiempoOperativoMin)===474,'la lista enviada (147) prevalece sobre la caché (30)');
t=T(sb);
ok(Math.round(t.tiempoOperativoMin)===591&&t.fuenteParadas==='SISTEMA','sin la opción se conserva la búsqueda compatible (caché: 30 min)');

/* ===== 3) Botón sin registro manual / mismo motivo ===== */
sb=entorno({programaciones:[prog('PET2',ms(7),{estadoOperacion:{estado:'EN_PRODUCCION',inicio:ms(7),paradas:[botones[0]]}})]});
sb.setOperativas([]);
t=T(sb);
ok(t.tiempoOperativoMin===621&&t.detalle.length===1&&Math.round(t.detalle[0].minutos)===60,'un botón sin registro manual no descuenta (queda solo como historial de 60 min)');
sb.setOperativas([op('m1','Falla de máquina',30,'NO_PROGRAMADA')]);
t=T(sb);
ok(Math.round(t.tiempoOperativoMin)===591&&Math.round(t.minParadasNoProgramadas)===30,'mismo motivo en botón y registro manual: la parada del supervisor cuenta UNA vez (30 min)');
t=T(sb,[op('m1','Falla de máquina',30,'NO_PROGRAMADA')]);
ok(Math.round(t.tiempoOperativoMin)===591,'igual con la lista explícita');

/* ===== 4) Sin duplicados ===== */
sb=entorno({programaciones:[prog('PET2',ms(7))]});
const original=op('avp_1','Falla de máquina',20,'NO_PROGRAMADA'),copia={descripcion:'Falla de máquina',minutos:20,tipo:'NO_PROGRAMADA',origenId:'avp_1',origen:'AVANCE',auto:true};
t=T(sb,[copia,original]);
ok(Math.round(t.minParadasNoProgramadas)===20,'una copia automática de una parada ya registrada no se suma otra vez (20 min)');
t=T(sb,[op('x1','Falla de máquina',10,'NO_PROGRAMADA'),op('x2','Falla de máquina',15,'NO_PROGRAMADA')]);
ok(Math.round(t.minParadasNoProgramadas)===25,'dos paradas reales con la misma descripción se conservan ambas (25 min)');
t=T(sb,[{descripcion:'Pausa programada',minutos:58,tipo:'PROGRAMADA',origen:'PAUSA',origenId:'legado:PAUSA:1:0',auto:true},{descripcion:'Refrigerio',minutos:58,tipo:'PROGRAMADA',origen:'PAUSA',auto:true},op('y1','Eliminada',40,'NO_PROGRAMADA',{eliminada:true})]);
ok(t.tiempoOperativoMin===621,'las filas del semáforo (PAUSA/DETENER) y las eliminadas no descuentan');
t=T(sb,[op('z1','Sin minutos',0,'NO_PROGRAMADA'),{descripcion:'NaN',minutos:'abc',tipo:'NO_PROGRAMADA'},null]);
ok(t.tiempoOperativoMin===621&&Number.isFinite(t.tiempoOperativoMin),'valores inválidos se ignoran');

/* ===== 5) Cuadro posterior al corte ===== */
const cuadro=(horaInicio,paradas)=>({horaInicio,marca:'Scala',presentacion:'1.5 L',paradasNoProgramadas:paradas||[],paradasProgramadas:[]});
const rec=cuadros=>({id:'r1',linea:'PET2',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',cuadros});
sb=entorno({programaciones:[prog('PET2',ms(7))],paletas:[palet('PET2',32370)],
  records:[rec([cuadro('08:00',[{descripcion:'Falla',tiempoMin:40}]),cuadro('18:00',[{descripcion:'Futura',tiempoMin:55}])])]});
sb.setOperativas([]);
t=T(sb);
ok(Math.round(t.minParadasNoProgramadas)===40,'23b: el cuadro que empieza a las 18:00 no entra en el corte de las 17:21 (solo 40 min)');
l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l.totalParadas===40&&l.paradas.length===1&&Math.round(l.minutosEfectivos)===581,'29: el snapshot tampoco incluye el cuadro futuro');
const ratioAntes=l.ratio;
sb.records=[rec([cuadro('08:00',[{descripcion:'Falla',tiempoMin:40}]),cuadro('18:00',[{descripcion:'Futura',tiempoMin:55}]),cuadro('19:30',[{descripcion:'Otra futura',tiempoMin:10}])])];
ok(sb.avLineaSnapshot('PET2','17:21','AVANCE').ratio===ratioAntes,'añadir otro cuadro posterior al corte no cambia el ratio ni las paradas');

/* ===== 6) Parada con horas: recorte al corte ===== */
sb=entorno({programaciones:[prog('PET2',ms(7))],paletas:[palet('PET2',10000)]});
sb.setOperativas([op('h1','Falla larga',120,'NO_PROGRAMADA',{horaInicio:'16:00',horaFin:'18:00'}),op('h2','Futura',30,'NO_PROGRAMADA',{horaInicio:'17:30',horaFin:'18:00'})]);
l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l.paradas.length===1&&Math.round(l.paradas[0].minutos)===81&&l.paradas[0].horaFinOriginal==='18:00','la parada 16:00–18:00 se recorta al corte (81 min) y conserva su hora fin original; la de 17:30 no entra');
ok(Math.round(l.minutosEfectivos)===621-81&&l.minutosParadasDescontadas===81,'el tiempo efectivo descuenta 81 min, no 120');

/* ===== 7) Solapes: suma documental ≠ descontado, y se explica ===== */
sb=entorno({programaciones:[prog('PET2',ms(7))],paletas:[palet('PET2',10000)]});
sb.setOperativas([op('s1','Falla A',60,'NO_PROGRAMADA',{horaInicio:'10:00',horaFin:'11:00'}),op('s2','Falla B',60,'NO_PROGRAMADA',{horaInicio:'10:30',horaFin:'11:30'})]);
l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l.totalParadas===120&&Math.round(l.minutosParadasDescontadas)===90,'paradas solapadas: la lista suma 120 min pero se descuentan 90 (sin contar doble)');
ok(/descontados/.test(sb.avDetalleRatioLinea(l))&&/120 min/.test(sb.avDetalleRatioLinea(l)),'la pantalla explica la diferencia entre lo listado y lo descontado');

/* ===== 8) Tiempo efectivo cero y datos faltantes ===== */
sb=entorno({programaciones:[prog('PET2',ms(7))],paletas:[palet('PET2',5000)]});
sb.setOperativas([op('t1','Todo el turno',621,'NO_PROGRAMADA')]);
l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l.ratio===null&&l.ratioDisponible===false&&l.minutosEfectivos===0,'tiempo efectivo cero: ratio no disponible (null), no Infinity ni NaN');
ok(sb.avRatioTexto(l.ratio,'B/H',l.ratioDisponible)==='—','y se muestra «—»');
sb=entorno({programaciones:[prog('PET2',ms(7))],paletas:[]});
sb.setOperativas([]);
l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l&&l.ratio===0&&l.ratioDisponible===true&&sb.avRatioTexto(l.ratio,'B/H',l.ratioDisponible)==='0 B/H','producción 0 con tiempo efectivo positivo: ratio 0 (distinto de «no disponible»)');
sb=entorno({programaciones:[{linea:'PET2',fecha:FECHA,turno:'DÍA',marca:'Scala',presentacion:'1.5 L',cantidadProgramada:100,estadoOperacion:{}}],paletas:[palet('PET2',5000)]});
sb.setOperativas([]);
l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l.ratio===null&&l.ratioDisponible===false,'sin inicio válido: ratio no disponible');
ok(sb.avRatioTexto(0,'B/H',undefined)==='—'&&sb.avRatioTexto(1234.6,'B/H',undefined)==='1,235 B/H'||sb.avRatioTexto(1234.6,'B/H',undefined)==='1.235 B/H','snapshots antiguos (sin ratioDisponible) conservan «ratio 0 = —»');

/* ===== 9) Noche y medianoche ===== */
const FN='2026-10-05';
sb=entorno({turno:'NOCHE',programaciones:[{linea:'PET2',fecha:FN,turno:'NOCHE',marca:'Scala',presentacion:'1.5 L',cantidadProgramada:100,estadoOperacion:{estado:'EN_PRODUCCION',inicio:ms(21,10),paradas:[]}}],
  paletas:[{linea:'PET2',fecha:FN,turno:'NOCHE',marca:'Scala',presentacion:'1.5 L',tipoPaleta:'COMPLETA',totalUnidades:12000,hora:'02:00'}],
  records:[{id:'rn',linea:'PET2',fecha:FN,turno:'NOCHE',grupoTurno:'NOCHE',cuadros:[{horaInicio:'21:10',marca:'Scala',presentacion:'1.5 L',paradasProgramadas:[],paradasNoProgramadas:[{descripcion:'Falla',tiempoMin:30}]},
    {horaInicio:'01:00',marca:'Scala',presentacion:'1.5 L',paradasProgramadas:[],paradasNoProgramadas:[]}]}]});
vm.runInContext("avanceEstado.paradasOperativas=[]",sb);
ok(sb.avInicioLinea('PET2')==='21:10','Noche: el inicio de la línea es 21:10, no 01:00 (se ordena por instante)');
const tn=sb.calcularTiemposLinea('PET2','NOCHE',FN,{inicioMs:ms(21,10),finMs:ms(3,10,6)});
ok(tn.ok&&Math.round(tn.tiempoTranscurridoMin)===360&&Math.round(tn.minParadasNoProgramadas)===30,'Noche: 21:10 → 03:10 son 360 min y la parada de 30 min del registro se asigna al bloque');
l=sb.avLineaSnapshot('PET2','03:10','AVANCE');
ok(l&&Math.round(l.minutosTranscurridos)===360&&Math.round(l.minutosEfectivos)===330,'Noche: el snapshot cruza la medianoche sin errores (360 transcurridos, 330 efectivos)');

/* ===== 10) Día/Intermedio: bloque compartido y relevo ===== */
sb=entorno({ahora:ms(15),programaciones:[prog('PET2',ms(7)),prog('PET2',ms(7),{turno:'INTERMEDIO',marca:'Otra'})],paletas:[palet('PET2',9000,'12:00')],
  records:[{id:'ri',linea:'PET2',fecha:FECHA,turno:'INTERMEDIO',grupoTurno:'DIA_INTERMEDIO',cuadros:[{horaInicio:'13:00',marca:'Scala',presentacion:'1.5 L',paradasProgramadas:[],paradasNoProgramadas:[{descripcion:'Falla',tiempoMin:20}]}]}]});
sb.setOperativas([]);
const ti=sb.calcularTiemposLinea('PET2','INTERMEDIO',FECHA,{inicioMs:ms(7),finMs:ms(15)});
ok(Math.round(ti.minParadasNoProgramadas)===20,'una parada registrada en Intermedio pertenece al mismo bloque que Día');
sb.state.user={username:'t'};
const cierre=sb.avLineaSnapshot('PET2',sb.avCorteCierre(),'CIERRE');
ok(sb.avEsRelevo()===true&&cierre.fin==='15:00'&&cierre.produccionTotal===9000,'relevo a las 15:00: no cierra el bloque ni reinicia acumulados (producción 9,000 sigue)');

/* ===== 11) Fin real de línea ===== */
sb=entorno({programaciones:[prog('PET2',ms(7),{estadoOperacion:{estado:'FINALIZADA',inicio:ms(7),finalizadaEn:ms(14),paradas:[]}})],paletas:[palet('PET2',20000)]});
sb.setOperativas([op('f1','Antes',30,'NO_PROGRAMADA',{horaInicio:'10:00',horaFin:'10:30'}),op('f2','Después del fin',60,'NO_PROGRAMADA',{horaInicio:'15:00',horaFin:'16:00'})]);
l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l&&l.corte==='14:00'&&l.minutosTranscurridos===420&&l.totalParadas===30,'línea finalizada a las 14:00: el avance de las 17:21 no la deja correr (420 min) ni suma paradas posteriores');
ok(Math.abs(l.ratio-20000/((420-30)/60))<1e-9,'su ratio queda congelado al cerrar: 20,000 ÷ 6.5 h');
/* Otra presentación sigue en curso: la línea no está terminada y el corte es el del reporte. */
sb=entorno({programaciones:[prog('PET2',ms(7),{estadoOperacion:{estado:'FINALIZADA',inicio:ms(7),finalizadaEn:ms(10),paradas:[]}}),prog('PET2',ms(10),{marca:'B',estadoOperacion:{estado:'EN_PRODUCCION',inicio:ms(10),paradas:[]}})],paletas:[palet('PET2',20000)]});
sb.setOperativas([]);
l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
ok(l.corte==='17:21'&&l.minutosTranscurridos===621,'si otra presentación sigue produciendo, el corte es el del reporte (no el fin de la primera)');

/* ===== 12) Cinco líneas: unidades y fuentes ===== */
const unidades={PET1:'B/H',PET2:'B/H',B7L:'B/H',C20L:'C/H',B20L:'B/H'};
sb=entorno({programaciones:Object.keys(unidades).map(x=>prog(x,ms(7))),paletas:Object.keys(unidades).map(x=>palet(x,1000))});
sb.setOperativas([]);
ok(Object.keys(unidades).every(x=>sb.avUnidadRatio(x)===unidades[x]),'unidades por línea: C/H para C20L y B/H para PET1, PET2, B7L y B20L');
ok(Object.keys(unidades).every(x=>{const s=sb.avLineaSnapshot(x,'17:21','AVANCE');return s&&s.ratio>0&&s.unidadRatio===unidades[x];}),'las cinco líneas generan su ratio con su unidad');
/* fuentes: avance prefiere Paletas, cierre Producción Efectiva; nunca se suman */
sb=entorno({programaciones:[prog('PET1',ms(7))],paletas:[palet('PET1',1000)],
  records:[{id:'rp',linea:'PET1',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',cuadros:[{horaInicio:'07:00',marca:'Scala',presentacion:'1.5 L',produccion:{efectiva:1500},paradasProgramadas:[],paradasNoProgramadas:[]}]}]});
sb.setOperativas([]);
const av=sb.avProduccionHasta('PET1','Scala','1.5 L','17:21','AVANCE'),ci=sb.avProduccionHasta('PET1','Scala','1.5 L','17:21','CIERRE');
ok(av.valor===1000&&av.fuente==='PALETAS'&&ci.valor===1500&&ci.fuente==='PRODUCCION_EFECTIVA','avance: Paletas (1,000); cierre: Producción Efectiva (1,500); nunca 2,500');

/* ===== 13) Salidas coherentes y snapshot congelado ===== */
sb=entorno({programaciones:[prog('PET2',ms(7))],paletas:[palet('PET2',32370)]});
sb.setOperativas(OFICIALES);
l=sb.avLineaSnapshot('PET2','17:21','AVANCE');
const snap={id:'x',fecha:FECHA,turno:'DÍA',tipo:'AVANCE',horaCorte:'17:21',supervisor:'S',lineas:[l]};
const texto=sb.avTextoWhatsApp(snap);
const esperado=sb.avRatioTexto(l.ratio,l.unidadRatio,l.ratioDisponible);
ok(texto.includes('Ratio: '+esperado)&&/4[.,]097 B\/H/.test(texto),'el texto de WhatsApp muestra el mismo ratio que la pantalla: '+esperado);
ok(sb.avBloquesPresentacionLinea(l)===l.bloques&&l.bloques.length===1&&l.bloques[0].ratio===l.ratio&&l.bloques[0].inicio===l.inicio,'la imagen y el texto leen el bloque guardado con el snapshot (mismo ratio e inicio que la pantalla)');
const f29=leer('js/produccion/29-avance-produccion.js');
ok(/avRatioTexto\(b\.ratio,l\.unidadRatio,b\.ratioDisponible\)/.test(f29)&&/ratioTxt/.test(f29),'texto, imagen y pantalla usan el mismo formateo de ratio');
/* los datos actuales no cambian un snapshot ya generado */
const ratioGuardado=l.bloques[0].ratio;
sb.setOperativas([...OFICIALES,op('p3','Nueva',100,'NO_PROGRAMADA')]);
ok(sb.avBloquesPresentacionLinea(JSON.parse(JSON.stringify(l)))[0].ratio===ratioGuardado,'reabrir el snapshot no recalcula con datos posteriores');
ok(JSON.stringify(l).indexOf('undefined')<0&&!JSON.stringify(l,(k,v)=>v===undefined?'U':v).includes('"U"'),'el snapshot es serializable (sin undefined para Firestore)');

/* ===== 14) Varias presentaciones: cada una en su ventana ===== */
const cu=(h,hf,m,p,paradas)=>({horaInicio:h,horaFin:hf,estadoCuadro:'FINALIZADO',marca:m,presentacion:p,paradasProgramadas:[],paradasNoProgramadas:paradas||[]});
sb=entorno({programaciones:[prog('PET2',ms(7)),prog('PET2',ms(12),{marca:'B',presentacion:'1 L'})],
  paletas:[palet('PET2',6000),{linea:'PET2',fecha:FECHA,turno:'DÍA',marca:'B',presentacion:'1 L',tipoPaleta:'COMPLETA',totalUnidades:6000,hora:'16:00'}],
  records:[{id:'rm',linea:'PET2',fecha:FECHA,turno:'DÍA',grupoTurno:'DIA_INTERMEDIO',cuadros:[cu('07:00','12:00','Scala','1.5 L',[{descripcion:'Falla',tiempoMin:60}]),cu('12:00','17:00','B','1 L')]}]});
sb.setOperativas([op('m1','Falla en B',30,'NO_PROGRAMADA',{horaInicio:'14:00',horaFin:'14:30'})]);
l=sb.avLineaSnapshot('PET2','17:00','AVANCE');
ok(l.bloques.length===2,'dos formatos → dos bloques');
const [b1,b2]=l.bloques;
ok(b1.inicio==='07:00'&&Math.round(b1.minutosTranscurridos)===300&&Math.round(b1.minutosEfectivos)===240&&Math.abs(b1.ratio-6000/4)<1e-9,'formato 1 (07:00–12:00): 300 − 60 = 240 min → 1,500/h');
ok(b2.inicio==='12:00'&&Math.round(b2.minutosTranscurridos)===300&&Math.round(b2.minutosEfectivos)===270&&Math.abs(b2.ratio-6000/4.5)<1e-9,'formato 2 (12:00–17:00): la parada de Avance de 14:00–14:30 se descuenta solo aquí → 270 min');

/* ===== 15) Ordenamiento y comentarios ===== */
const f23=leer('js/produccion/23b-tiempos-linea.js');
ok(!/salvo que el MOTIVO ya exista registrado/.test(f23)&&/paradasOficiales/.test(f23),'23b: el comentario obsoleto de duplicado por motivo fue reemplazado');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
