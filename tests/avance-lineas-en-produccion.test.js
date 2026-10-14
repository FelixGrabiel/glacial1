/* Avance de Producción: solo aparecen las líneas que PRODUJERON en el turno del reporte (producción > 0 dentro de su fecha y su ventana).
   Caso real: Noche 13/10/2026, corte 23:19, ventana 21:00–07:00. Datos inventados, aislados. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-13';
const ms=(h,m,dia)=>new Date(2026,9,dia||13,h,m||0).getTime();

function entorno(o){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0,Infinity,isFinite,Boolean};
  vm.createContext(sb);sb.window=sb;sb.addEventListener=()=>{};
  sb.document={createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){}}),getElementById:()=>null,querySelector:()=>null,body:{classList:{add(){},remove(){}}},addEventListener(){}};
  sb.state={user:{username:'ana',nombre:'Ana',rol:'Supervisor',uid:'u1',permisos:['avanceProduccion']},currentTab:''};
  sb.ahora=o.ahora||ms(23,19);sb.tareoAhoraServidor=()=>sb.ahora;
  sb.programaciones=o.programaciones||[];sb.records=o.records||[];sb.paletas=o.paletas||[];
  sb.loadProgramaciones=()=>sb.programaciones;sb.loadRecords=()=>sb.records;sb.loadPaletas=()=>sb.paletas;
  sb.normalizarCuadros=r=>r.cuadros||[];sb.normalizarMotivoParada=t=>String(t||'').toLowerCase().trim();sb.estandarMotivoParada=()=>0;
  sb.tienePermiso=p=>p==='avanceProduccion';
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  vm.runInContext(leer('js/produccion/29-avance-produccion.js'),sb);
  const s16=leer('js/produccion/16-paletas.js');
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+s16.slice(s16.indexOf('  function ultimoEstado(registros){'),s16.indexOf('  const resumenTurnosOriginal'))+s16.slice(s16.indexOf('  function msRegistroPaleta'),s16.indexOf('  const resumenOriginal = resumenPaletas;')),sb);
  vm.runInContext(`avanceEstado.fecha='${FECHA}';avanceEstado.turno='${o.turno||'NOCHE'}';avanceEstado.paradasOperativas=[];`,sb);
  return sb;
}
const prog=(linea,marca,pres,inicio,extra)=>({linea,fecha:FECHA,turno:'NOCHE',marca,presentacion:pres,cantidadProgramada:45000,unidadesPorPaleta:1200,
  estadoOperacion:Object.assign({estado:inicio?'EN_PRODUCCION':'PENDIENTE',inicio:inicio||0,paradas:[]},extra||{})});
const pal=(linea,marca,pres,total,hora,creadoEn)=>({linea,fecha:FECHA,turno:'NOCHE',marca,presentacion:pres,tipoPaleta:'COMPLETA',paletas:total/1200,totalUnidades:total,hora,creadoEn:creadoEn||1});
const reg=(linea,cuadros)=>({linea,fecha:FECHA,turno:'NOCHE',cuadros});

/* 1) Caso real */
let sb=entorno({
  programaciones:[prog('PET1','Scala','2.5 L',ms(7)),prog('PET2','Fontlife','1 L',ms(21)),prog('B7L','Bells','7 L',0)],
  paletas:[
    pal('PET1','Scala','2.5 L',17766,'15:00'),                      // de la mañana, guardada como NOCHE
    pal('PET1','Scala','2.5 L',1200,'',ms(11)),                     // sin hora: su creación es de la mañana
    pal('PET2','Fontlife','1 L',2880,'22:40')
  ],
  records:[reg('B7L',[{marca:'Bells',presentacion:'7 L',horaInicio:'13:15',produccion:{efectiva:1338}}])]   // cuadro que empieza fuera del turno
});
let snap=sb.avConstruirSnapshot('23:19','AVANCE');
ok(snap.lineas.map(l=>l.linea).join(',')==='PET2','1 · Noche 13/10 23:19: solo aparece PET2 (PET1 de la mañana y B7L 13:15 no)');
ok(snap.lineas[0].produccionTotal===2880&&snap.lineas[0].inicio==='21:00','1 · PET2: 2 880 UND e inicio 21:00 (dentro del turno)');
ok(sb.avInicioLinea('PET1')==='','1 · un inicio a las 07:00 no es inicio de la Noche');
ok(sb.avProduccionHasta('PET1','Scala','2.5 L','23:19','AVANCE').valor===0,'1 · las paletas anteriores a las 21:00 (con hora o por su creación) no cuentan para la Noche');
ok(sb.avProduccionEfectiva('B7L','Bells','7 L').valor===0,'1 · un cuadro que empieza a las 13:15 no cuenta como producción de la Noche');

/* B7L sí produce en la Noche */
sb.paletas.push(pal('B7L','Bells','7 L',1338,'22:10'));
snap=sb.avConstruirSnapshot('23:19','AVANCE');
ok(snap.lineas.map(l=>l.linea).join(',')==='PET2,B7L','1 · B7L aparece si tiene producción registrada dentro de 21:00–07:00');

/* 2) programación sin unidades */
sb=entorno({programaciones:[prog('PET2','Fontlife','1 L',ms(21))],paletas:[]});
ok(sb.avLineaSnapshot('PET2','23:19','AVANCE',ms(23,19))===null,'2 · línea con programación (incluso iniciada) y 0 unidades: no aparece');

/* 3) produjo y ahora está detenida, con paradas */
sb=entorno({programaciones:[prog('PET2','Fontlife','1 L',ms(21),{estado:'DETENIDA',detenidaDesde:ms(23)})],
  paletas:[pal('PET2','Fontlife','1 L',2400,'22:30')],
  records:[reg('PET2',[{marca:'Fontlife',presentacion:'1 L',horaInicio:'21:00',paradasNoProgramadas:[{descripcion:'Falla de máquina',tiempoMin:15,horaInicio:'23:00'}]}])]});
let l=sb.avLineaSnapshot('PET2','23:19','AVANCE',ms(23,19));
ok(l&&l.produccionTotal===2400,'3 · la línea que produjo y ahora está detenida sigue apareciendo');

/* 4) ninguna línea produciendo */
sb=entorno({programaciones:[prog('PET1','Scala','2.5 L',0),prog('B7L','Bells','7 L',ms(21))],
  records:[reg('B7L',[{marca:'Bells',presentacion:'7 L',horaInicio:'21:00',paradasProgramadas:[{descripcion:'Charla de ingreso',tiempoMin:10}]}])]});
snap=sb.avConstruirSnapshot('23:19','AVANCE');
ok(snap.lineas.length===0&&snap.resumen.produccionTotal===0&&snap.resumen.lineasTrabajadas===0&&snap.resumen.totalParadas===0,
  '4 · nadie produce (solo programación o «Charla de ingreso»): sin tarjetas y resumen en 0');
ok(snap.texto.includes('No hay líneas en producción en este turno.'),'4 · el texto dice «No hay líneas en producción en este turno.»');
let lanza=false;try{sb.avConstruirSnapshot('CIERRE','CIERRE');}catch(_){lanza=true;}
ok(!lanza,'el CIERRE conserva su criterio (líneas iniciadas o programadas siguen en el cierre)');

/* 5) el resumen sale solo de las líneas mostradas */
sb=entorno({programaciones:[prog('PET1','Scala','2.5 L',ms(7)),prog('PET2','Fontlife','1 L',ms(21)),prog('B7L','Bells','7 L',ms(21))],
  paletas:[pal('PET1','Scala','2.5 L',17766,'15:00'),pal('PET2','Fontlife','1 L',2880,'22:40'),pal('B7L','Bells','7 L',600,'22:00')]});
snap=sb.avConstruirSnapshot('23:19','AVANCE');
ok(snap.resumen.lineasTrabajadas===snap.lineas.length&&snap.lineas.length===2,'5 · «Líneas» = tarjetas mostradas (2)');
ok(snap.resumen.produccionTotal===snap.lineas.reduce((s,x)=>s+x.produccionTotal,0)&&snap.resumen.produccionTotal===3480,'5 · «Producción planta» = suma de las líneas mostradas (3 480, sin los 17 766 de PET1)');

/* Día: la ventana 07:00–19:00 no descarta lo propio */
sb=entorno({turno:'DÍA',ahora:ms(12),programaciones:[Object.assign(prog('PET1','Scala','2.5 L',ms(7)),{turno:'DÍA'})],
  paletas:[Object.assign(pal('PET1','Scala','2.5 L',6000,'11:30'),{turno:'DÍA'})]});
l=sb.avLineaSnapshot('PET1','12:00','AVANCE',ms(12));
ok(l&&l.produccionTotal===6000&&l.inicio==='07:00','Día: la producción y el inicio del propio turno se conservan');

/* 6) maquetación: la altura de cada tarjeta sale de los mismos pasos del dibujo */
const f29=leer('js/produccion/29-avance-produccion.js');
const canvas=f29.slice(f29.indexOf('function avCanvasSnapshot'),f29.indexOf('async function avGenerarImagen'));
ok(/const altoParada=p=>/.test(canvas)&&/cy\+=altoParada\(p\)/.test(canvas)&&!/fit\(p\.descripcion/.test(canvas),'6 · cada parada reserva su alto (descripciones largas en varias filas) y el dibujo avanza lo mismo');
ok(/measureText\(t\)\.width\+GAP_RESUMEN/.test(canvas)&&!/i\*245/.test(canvas),'6 · las columnas del resumen se ubican por el ancho real del texto');

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
