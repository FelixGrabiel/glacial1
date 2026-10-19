/* Asistente de Producción · núcleo de cálculo (js/asistente/70-asistente-nucleo.js).
   Cubre las pruebas de operación del prompt (sección 12): varias marcas por línea, una marca en varias presentaciones, cambio de
   programación sin duplicar reservas, entrega parcial, reservas de otra línea, consumo > teórico (por revisar), mermas validada y
   pendiente, devolución, cierre con pendientes, línea sin producción, presentación sin factor, turno noche, factores históricos,
   kg y UND sin sumar. Además: la migración de factores copia los valores reales de js/nucleo/05-utils.js sin perder ninguno. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map};vm.createContext(sb);sb.window=sb;
vm.runInContext(leer('js/asistente/70-asistente-nucleo.js'),sb);
const N=sb.glacialAsistenteNucleo;

/* ---------- factores ---------- */
const F=[
  {id:'a',insumo:'POLIETILENO',linea:'B7L',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:0,vigenteDesde:'2020-01-01'},
  {id:'b',insumo:'POLIETILENO',linea:'B7L',marca:'scala',presentacion:'*',base:'PALETA',cantidadBase:1,factor:2.02,vigenteDesde:'2020-01-01'},
  {id:'c',insumo:'CAJA_PREFORMA',linea:'PET1',marca:'*',presentacion:'Pack_Regular_2.5Lx6und',base:'UND',cantidadBase:7900,factor:1,vigenteDesde:'2020-01-01',vigenteHasta:'2026-09-30'},
  {id:'d',insumo:'CAJA_PREFORMA',linea:'PET1',marca:'*',presentacion:'Pack_Regular_2.5Lx6und',base:'UND',cantidadBase:8000,factor:1,vigenteDesde:'2026-10-01'},
  {id:'e',insumo:'STRETCH',linea:'PET1',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:0.33,vigenteDesde:'2020-01-01'},
  {id:'f',insumo:'STRETCH',linea:'PET1',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:0.4,vigenteDesde:'2020-01-01'}
];
ok(N.factorVigente(F,{insumo:'POLIETILENO',linea:'B7L',marca:'SCALA',presentacion:'7L',fecha:'2026-10-14'}).factor.factor===2.02,'factor: la marca específica gana a la regla general de la línea');
ok(N.factorVigente(F,{insumo:'POLIETILENO',linea:'B7L',marca:'Bells',presentacion:'7L',fecha:'2026-10-14'}).factor.factor===0,'factor: marca sin regla propia toma la general (0 = no aplica, explícito)');
ok(N.factorVigente(F,{insumo:'CAJA_PREFORMA',linea:'PET1',marca:'Scala',presentacion:'Pack_Regular_2.5Lx6und',fecha:'2026-09-15'}).factor.cantidadBase===7900
  &&N.factorVigente(F,{insumo:'CAJA_PREFORMA',linea:'PET1',marca:'Scala',presentacion:'Pack_Regular_2.5Lx6und',fecha:'2026-10-14'}).factor.cantidadBase===8000,'prueba 15: un dato histórico se calcula con el factor vigente en SU fecha');
ok(N.factorVigente(F,{insumo:'TAPA',linea:'PET1',marca:'x',presentacion:'y',fecha:'2026-10-14'}).error==='SIN_FACTOR','prueba 11: presentación sin factor → SIN_FACTOR (sin valor por defecto)');
ok(N.factorVigente(F,{insumo:'STRETCH',linea:'PET1',marca:'x',presentacion:'y',fecha:'2026-10-14'}).error==='AMBIGUO','dos factores vigentes iguales → AMBIGUO (no se elige al azar)');
ok(N.teorico(15552,324,{base:'PALETA',cantidadBase:1,factor:1.89})===90.72&&N.teorico(7900,0,{base:'UND',cantidadBase:7900,factor:1})===1,'teórico: por paleta (producido ÷ UND por paleta × factor) y por UND (÷ cantidad base)');
ok(N.teorico(100,0,{base:'PALETA',cantidadBase:1,factor:2})===null,'teórico por paleta sin UND por paleta → sin base (no 0)');
ok(N.validarFactor({insumo:'X',linea:'CAJAS 20L',base:'UND',cantidadBase:1,factor:1,vigenteDesde:'2026-01-01'}).length===0&&N.validarFactor({insumo:'X',linea:'Z',base:'KG',cantidadBase:0,factor:-1,vigenteDesde:'x'}).length===5,'validación de factores (acepta «CAJAS 20L» como C20L)');

/* ---------- cuadros ---------- */
const P=(id,l,t,m,p,q,extra)=>Object.assign({id,linea:l,fecha:'2026-10-14',turno:t,marca:m,presentacion:p,cantidadProgramada:q,unidadesPorPaleta:126,estadoOperacion:{estado:'EN_PRODUCCION'}},extra||{});
const progs=[P('p1','B7L','DÍA','Aro','7L',1000),P('p2','B7L','DÍA','Cuisine','7L',1500),P('p3','B7L','DÍA','Scala','7L',1500),P('p4','B7L','DÍA','Scala','2.5L',500),
  P('p5','PET1','NOCHE','Scala','2.5L',16000,{unidadesPorPaleta:324}),P('p6','B20L','DÍA','Glacial','20L',800,{unidadesPorPaleta:32,estadoOperacion:{estado:'PENDIENTE'}})];
const prodPal={'B7L|Aro':1000,'B7L|Cuisine':1400,'B7L|Scala|7L':1200};
const cuadros=N.cuadrosDelBloque({fecha:'2026-10-14',bloque:'DIA',programaciones:progs,records:[{id:'r1',linea:'B7L',fecha:'2026-10-14',grupoTurno:'DIA_INTERMEDIO',estadoRegistro:'EN_REGISTRO',
    cuadros:[{marca:'Aro',presentacion:'7L',lote:'287-2AR42',horaInicio:'07:20',horaFin:'09:00',produccion:{efectiva:0},paradasProgramadas:[{descripcion:'Cambio',tiempoMin:10}]},{marca:''}]}],
  produccionAlCorte:(l,f,t,m,p)=>{const v=prodPal[l+'|'+m+'|'+p]??prodPal[l+'|'+m];return v===undefined?{encontrada:false}:{valor:v,encontrada:true};}});
const b7=cuadros.filter(c=>c.linea==='B7L');
ok(b7.length===4&&new Set(b7.map(c=>c.marca)).size===3,'prueba 1: B7L con tres marcas (Aro, Cuisine, Scala) → cuadros separados');
ok(b7.filter(c=>c.marca==='Scala').map(c=>c.presentacion).sort().join()==='2.5L,7L','prueba 2: Scala en dos presentaciones → dos cuadros');
ok(b7[0].marca==='Aro'&&b7[0].codigo==='C01'&&b7[0].reporte.lote==='287-2AR42','código C01 por orden de inicio y lote tomado del reporte diario');
ok(b7.find(c=>c.marca==='Cuisine').producido===1400&&b7.find(c=>c.marca==='Cuisine').fuenteProduccion==='Paletas','producido de Paletas mientras no hay cierre');
ok(b7.find(c=>c.presentacion==='2.5L').fuenteProduccion==='Sin registro'&&b7.find(c=>c.presentacion==='2.5L').producido===0,'sin paletas ni cierre: «Sin registro» (no se inventa)');
ok(!cuadros.some(c=>c.linea==='PET1'),'el bloque DÍA no trae la programación de NOCHE');
const noche=N.cuadrosDelBloque({fecha:'2026-10-14',bloque:'NOCHE',programaciones:progs,records:[],produccionAlCorte:()=>({encontrada:false})});
ok(noche.length===1&&noche[0].linea==='PET1'&&noche[0].clave.startsWith('2026-10-14|NOCHE|'),'prueba 12: el bloque Noche conserva la fecha operativa en que empezó');
const b20=cuadros.find(c=>c.linea==='B20L');
ok(b20&&b20.producido===0&&b20.cumplimiento===0&&b20.saldo===800,'prueba 10: B20L programada y sin producción: saldo = programado, cumplimiento 0');

/* ---------- stock, reservas y faltantes ---------- */
const insumos=[{codigo:'POLIETILENO',nombre:'Polietileno',unidad:'kg'},{codigo:'TAPA',nombre:'Tapas',unidad:'UND'}];
const mov=(opId,tipo,insumo,cantidad,en,extra)=>Object.assign({opId,tipo,insumo,cantidad,en,condicion:'UTILIZABLE'},extra||{});
const movs=[mov('m1','CONTEO','POLIETILENO',20,1),mov('m2','CONTEO','POLIETILENO',1,2,{condicion:'OBSERVADO'}),mov('m3','RECEPCION','POLIETILENO',5,3),mov('m4','DEVOLUCION','POLIETILENO',2,4),
  mov('m5','RECEPCION','POLIETILENO',100,5),mov('m6','ANULACION','POLIETILENO',0,6,{anulaA:'m5'})];
const s=N.saldoInsumo(movs,'POLIETILENO');
ok(s.utilizable===23&&s.observado===1,'stock: conteo 20 + recepción 5 − devolución 2 = 23; observado aparte (no disponible); el movimiento anulado no cuenta');
const fb7=[{insumo:'POLIETILENO',linea:'B7L',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:2,vigenteDesde:'2020-01-01'},
  {insumo:'POLIETILENO',linea:'B20L',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:0,vigenteDesde:'2020-01-01'},
  {insumo:'TAPA',linea:'B7L',marca:'*',presentacion:'*',base:'UND',cantidadBase:1,factor:1,vigenteDesde:'2020-01-01'}];
const req=N.requerimientos({cuadros,factores:fb7,insumos,movimientos:movs});
const rAro=req.find(f=>f.cuadro.marca==='Aro'&&f.insumo.codigo==='POLIETILENO');
ok(rAro.requerido===N.red(1000/126*2,4),'requerido = programado ÷ UND por paleta × factor');
const totalPend=req.filter(f=>f.insumo.codigo==='POLIETILENO'&&f.estado==='OK').reduce((a,f)=>a+f.pendiente,0);
ok(N.red(rAro.reservadoOtros+rAro.pendiente,4)===N.red(totalPend,4),'prueba 5: lo reservado por los otros cuadros + lo propio = total pendiente (cada cuadro ve la reserva de los demás)');
ok(!req.some(f=>f.cuadro.linea==='B20L'&&f.insumo.codigo==='POLIETILENO'),'factor 0 explícito («no aplica»): no genera requerimiento ni alerta');
ok(req.some(f=>f.cuadro.linea==='B20L'&&f.insumo.codigo==='TAPA')===false&&req.filter(f=>f.estado==='SIN_FACTOR').length===0,'un insumo sin ningún factor en la línea no se exige a esa línea');
// prueba 3: cambia la programación → se recalcula sin duplicar (las reservas son derivadas).
const progs2=progs.map(p=>p.id==='p2'?{...p,cantidadProgramada:3000}:p);
const req2=N.requerimientos({cuadros:N.cuadrosDelBloque({fecha:'2026-10-14',bloque:'DIA',programaciones:progs2,records:[],produccionAlCorte:()=>({encontrada:false})}),factores:fb7,insumos,movimientos:movs});
const req2b=N.requerimientos({cuadros:N.cuadrosDelBloque({fecha:'2026-10-14',bloque:'DIA',programaciones:progs2,records:[],produccionAlCorte:()=>({encontrada:false})}),factores:fb7,insumos,movimientos:movs});
ok(JSON.stringify(req2.map(f=>[f.cuadro.clave,f.insumo.codigo,f.requerido,f.reservadoOtros]))===JSON.stringify(req2b.map(f=>[f.cuadro.clave,f.insumo.codigo,f.requerido,f.reservadoOtros]))
  &&req2.find(f=>f.cuadro.marca==='Cuisine'&&f.insumo.codigo==='POLIETILENO').requerido===N.red(3000/126*2,4),'prueba 3: la programación cambia → el requerimiento se recalcula y repetirlo no duplica reservas');
const resu=N.resumenInsumos(req);
ok(resu.find(x=>x.insumo.codigo==='POLIETILENO').faltante===N.red(Math.max(totalPend-23,0),4),'faltante del bloque = pendiente − utilizable');
// Presentación con factor faltante dentro de una línea que sí tiene reglas del insumo:
const reqSin=N.requerimientos({cuadros,factores:[{insumo:'TAPA',linea:'B7L',marca:'Aro',presentacion:'*',base:'UND',cantidadBase:1,factor:1,vigenteDesde:'2020-01-01'}],insumos,movimientos:[]});
ok(reqSin.filter(f=>f.estado==='SIN_FACTOR'&&f.cuadro.linea==='B7L').length===3&&N.alertas({requerimientos:reqSin}).some(a=>/falta el factor de Tapas/.test(a.texto)),'prueba 11: cuadros sin factor quedan bloqueados con alerta «falta el factor»');

/* ---------- conciliación ---------- */
const con=N.conciliar({saldoInicial:2,saldoFinal:-0.5+0,entregado:10,devuelto:1,teorico:10,mermaValidada:0.3});
ok(con.real===11.5&&con.desviacion===1.5&&con.porRevisar===1.2,'prueba 6: real = 2 + 10 − 1 − (−0.5) = 11.5; desviación 1.5; por revisar = 1.5 − 0.3 merma validada = 1.2');
const c2=N.conciliar({saldoInicial:2,saldoFinal:1,entregado:10,devuelto:1,teorico:10,mermaValidada:0});
ok(c2.real===10&&c2.desviacion===0&&c2.porRevisar===0&&!Object.is(c2.porRevisar,-0),'sin residuos de coma flotante (0, no -0.00)');
ok(N.conciliar({saldoInicial:'',saldoFinal:1,teorico:5}).texto==='Pendiente de conciliación (saldo inicial)'&&N.conciliar({saldoInicial:1,saldoFinal:1,teorico:null}).pendiente,'falta un saldo o el factor → «Pendiente de conciliación», no cero');
ok(N.conciliar({saldoInicial:1,saldoFinal:0,teorico:0}).desviacionPct===null,'desviación % vacía si el teórico es 0');
const mc=N.movimientosCuadro([mov('a','RECEPCION','X',10,1,{cuadro:'k'}),mov('b','DEVOLUCION','X',1,2,{cuadro:'k'}),mov('c','RECEPCION','X',5,3,{cuadro:'otro'}),mov('d','RECEPCION','X',4,4,{cuadro:'k'}),mov('e','ANULACION','X',0,5,{anulaA:'d',cuadro:'k'})],'k','X');
ok(mc.entregado===10&&mc.devuelto===1,'prueba 8: entregado y devuelto del cuadro (otro cuadro y anulados no cuentan)');

/* ---------- mermas ---------- */
const mermas=[{cuadro:'k',insumo:'PREFORMA',unidad:'UND',cantidad:24,estado:'VALIDADA',categoria:'MATERIAL'},{cuadro:'k',insumo:'PREFORMA',unidad:'UND',cantidad:6,estado:'PENDIENTE',categoria:'MATERIAL'},
  {cuadro:'k',insumo:'POLIETILENO',unidad:'kg',cantidad:0.3,estado:'VALIDADA',categoria:'MATERIAL'},{cuadro:'k',insumo:'PREFORMA',unidad:'UND',cantidad:99,estado:'RECHAZADA',categoria:'MATERIAL'}];
ok(N.mermaValidada(mermas,'k','PREFORMA','UND')===24,'prueba 7: solo la merma VALIDADA entra en la conciliación (pendiente y rechazada no)');
const rm=N.resumenMermas(mermas);
ok(rm.length===2&&rm.find(x=>x.insumo==='PREFORMA').validada===24&&rm.find(x=>x.insumo==='PREFORMA').pendiente===6&&rm.find(x=>x.unidad==='kg').total===0.3,'prueba 20: kg y UND en filas separadas, nunca sumados');
ok(N.validarMerma({linea:'PET1',cuadro:'k',categoria:'MATERIAL',insumo:'PREFORMA',cantidad:2,unidad:'UND',causa:'Otros',observaciones:''}).some(e=>/Otros/.test(e)),'merma con causa «Otros» exige descripción');

/* ---------- solicitudes ---------- */
const sol={estado:'EN_PREPARACION',items:[{insumo:'POLIETILENO',unidad:'kg',solicitado:12,entregado:0,recibido:0},{insumo:'CARTON',unidad:'plancha',solicitado:250,entregado:0,recibido:0}]};
const e1=N.aplicarEntrega(sol,{POLIETILENO:12,CARTON:100});
ok(e1.estado==='ENTREGADA_PARCIAL'&&e1.items[1].entregado===100,'prueba 4: entrega parcial → ENTREGADA_PARCIAL');
ok(N.aplicarEntrega({...sol,items:e1.items},{CARTON:200}).errores,'no se entrega más de lo solicitado sin autorización');
const rc=N.aplicarRecepcion({...sol,estado:'ENTREGADA_PARCIAL',items:e1.items},{POLIETILENO:12,CARTON:150});
ok(rc.errores&&/más de lo entregado/.test(rc.errores[0]),'Producción no puede recibir más de lo entregado por Almacén');
const rc2=N.aplicarRecepcion({...sol,estado:'ENTREGADA_PARCIAL',items:e1.items},{POLIETILENO:12,CARTON:100});
ok(rc2.movimientos.length===2&&rc2.movimientos[0].cantidad===12,'cada recepción genera un movimiento RECEPCION (la entrega sola no suma stock)');
ok(N.puedeTransicion('SOLICITADA','EN_PREPARACION')&&!N.puedeTransicion('CERRADA','SOLICITADA')&&N.ACTOR_ESTADO.ENTREGADA==='almacen'&&N.ACTOR_ESTADO.RECIBIDA==='asistente','estados de solicitud: transiciones válidas y quién mueve cada estado');

/* ---------- cierre con pendientes ---------- */
const pc=N.pendientesDeCierre({solicitudes:[{estado:'ENTREGADA_PARCIAL'},{estado:'CERRADA'}],mermas,conciliaciones:[{porRevisar:1.2},{porRevisar:0},{pendiente:true,porRevisar:null}]});
ok(pc.solicitudes===1&&pc.mermas===1&&pc.porRevisar===1&&pc.sinConciliar===1,'prueba 9: el turno cierra con pendientes (solicitud abierta, merma pendiente, ítem por revisar, sin conciliar)');

/* ---------- migración de factores desde el código real ---------- */
const sc={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp};vm.createContext(sc);sc.window=sc;sc.document={addEventListener(){},getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];}};
const u=leer('js/nucleo/05-utils.js'),c01=leer('js/nucleo/01-config.js');
// Las constantes se toman del código real (bloques de objetos/arrays declarados con const) sin ejecutar el resto del archivo.
const tomarDe=(txt,n)=>{const m=txt.match(new RegExp('const '+n+'\\s*=\\s*([\\s\\S]*?);\\s*\\n'));return m?vm.runInContext('('+m[1]+')',sc):undefined;};
const codigo='';
['RATIOS_PRESENTACION_PET1','RATIOS_PRESENTACION_PET2'].forEach(n=>{sc[n]=tomarDe(c01,n);});
const cfg={PRESENTACIONES_POR_LINEA:tomarDe(c01,'PRESENTACIONES_POR_LINEA')};
const tomar=n=>tomarDe(u,n);
['CAJAS_PREFORMAS_DIVISOR','FACTOR_CARTON_PET','FACTOR_POLIETILENO_PET','FACTOR_STRETCHFILM_PET','CARTON_FIJO_B7L','CARTON_C20L_SAN_FERNANDO','CARTON_C20L_DEFAULT','CARTON_FIJO_B20L',
  'POLIETILENO_B7L_FACTOR','POLIETILENO_C20L_FACTOR','MARCAS_POLIETILENO_B7L_SI','STRETCHFILM_B7L_FACTOR','STRETCHFILM_C20L_FACTOR','STRETCHFILM_B20L_FACTOR'].forEach(n=>{cfg[n]=tomar(n);});
const mig=N.factoresDesdeCodigo(cfg,'2020-01-01');
ok(!codigo&&mig.length>40,'migración: se generan los factores del Nuevo registro ('+mig.length+')');
const tabla=cfg.FACTOR_POLIETILENO_PET;
const esperado=k=>tabla[k]!==undefined?tabla[k]:(tabla[k.replace('_regular_','_alcalina_')]??tabla[k.replace('_regular_','_alcalina(y)_')]);
const vig=['PET1','PET2'].flatMap(l=>(cfg.PRESENTACIONES_POR_LINEA[l]||[]).map(p=>({l,p})));
ok(vig.length>=15&&vig.every(({l,p})=>{const f=N.factorVigente(mig,{insumo:'POLIETILENO',linea:l,marca:'Scala',presentacion:p,fecha:'2026-10-14'});const e=esperado(p.toLowerCase());return e===undefined?f.error==='SIN_FACTOR':(f.factor&&f.factor.factor===e);}),
  'migración: las '+vig.length+' presentaciones vigentes de PET1/PET2 conservan su factor de polietileno exacto; sin valor en el código → sin factor (no se inventa)');
ok(N.factorVigente(mig,{insumo:'POLIETILENO',linea:'PET2',marca:'x',presentacion:'Pack_Regular_380mlx24und/la',fecha:'2026-10-14'}).error==='SIN_FACTOR','380 ml «/la» no tiene factor en el código: queda pendiente de configurar');
const st=N.factorVigente(mig,{insumo:'CAJA_PREFORMA',linea:'PET1',marca:'Scala',presentacion:'Pack c/Sticker_Regular_2.5Lx6und',fecha:'2026-10-14'}).factor;
ok(st&&st.cantidadBase===7900&&/equivalente de «pack c\/sticker_alcalina_2.5lx6und»/.test(st.nota),'migración: presentación «Regular» sin clave propia toma su equivalente «Alcalina» del código y lo anota');
ok(Object.keys(tabla).every(k=>N.factorVigente(mig,{insumo:'POLIETILENO',linea:'PET2',marca:'x',presentacion:k,fecha:'2026-10-14'}).factor.factor===tabla[k]),'migración: las claves históricas («Alcalina») también se conservan');
ok(N.factorVigente(mig,{insumo:'POLIETILENO',linea:'B7L',marca:'Bells',presentacion:'7L',fecha:'2026-10-14'}).factor.factor===0&&N.factorVigente(mig,{insumo:'POLIETILENO',linea:'B7L',marca:'Scala',presentacion:'7L',fecha:'2026-10-14'}).factor.factor===2.02,'migración: B7L polietileno 2.02 solo para las marcas de la lista; Bells «no aplica»');
ok(N.factorVigente(mig,{insumo:'CARTON',linea:'C20L',marca:'San Fernando',presentacion:'20L',fecha:'2026-10-14'}).factor.factor===2&&N.factorVigente(mig,{insumo:'CARTON',linea:'C20L',marca:'Aro',presentacion:'20L',fecha:'2026-10-14'}).factor.factor===1,'migración: cartón C20L San Fernando 2, resto 1');
ok(new Set(mig.map(f=>f.id)).size===mig.length&&JSON.stringify(N.factoresDesdeCodigo(cfg,'2020-01-01').map(f=>f.id))===JSON.stringify(mig.map(f=>f.id)),'migración idempotente: ids únicos y deterministas');
ok(N.codigoLinea('CAJAS 20L')==='C20L'&&N.codigoLinea('Cajas 20 L')==='C20L'&&N.codigoLinea('pet1')==='PET1'&&N.lineaInfo('C20L').nombre==='CAJAS 20L','líneas: código interno C20L y nombre visible «CAJAS 20L» unificados');

/* Pantalla del Asistente reordenada: sin textos fijos repetidos */
{
  const fs2=require('fs'),t=fs2.readFileSync(require('path').resolve(__dirname,'..','js/asistente/72-asistente-pantalla.js'),'utf8');
  ok(t.indexOf("tarjeta('Por atender'")<t.indexOf("tarjeta('Producción y seguimiento'")&&!/tarjeta\('Existencias en Producción'/.test(t),'Resumen: «Por atender» primero y sin la tarjeta «Existencias en Producción» (su dato va en una línea)');
  ok(!/Recalcular requerimientos/.test(t)&&/tarjeta\('Coordinaciones del turno',coord\)/.test(t),'Seguimiento: sin la tarjeta de frases fijas; Coordinaciones a ancho completo');
  ok(!/ap-reservas"/.test(t)&&/Una reserva no es consumo/.test(t),'Consumo: «Control de reservas» pasa a una línea');
  ok(!/tarjeta\('Material observado'/.test(t)&&/Material observado<\/h4>/.test(t),'Merma: el material observado va dentro de «Registro del turno»');
  ok((t.match(/\$\{pie\(/g)||[]).length<=4,'quedan solo los avisos de reglas de negocio (no las notas informativas repetidas)');
}

/* Choque de clases: Análisis de paradas (47) usaba .ap-kpi / .ap-kpis / .ap-vacio / .ap-modal, igual que el Asistente (72) y le descuadraba los iconos */
{
  const fs3=require('fs'),R3=require('path').resolve(__dirname,'..'),a47=fs3.readFileSync(R3+'/js/produccion/47-analisis-paradas.js','utf8')+fs3.readFileSync(R3+'/js/produccion/47b-analisis-paradas-mejoras.js','utf8');
  ok(!/(?<![\w-])ap-(kpis|kpi|vacio|modal)(?![\w-])/.test(a47)&&/apar-kpi/.test(a47),'Análisis de paradas ya no usa las clases ap-kpi/ap-kpis/ap-vacio/ap-modal del Asistente (ahora apar-*)');
}

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
