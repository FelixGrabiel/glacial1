/* Planificación · etapa 4 · motor de tiempos y capacidad (funciones puras): reglas de transición sin sumar duplicados, ventanas con unión,
   limpieza fija, refrigerio sin detención, datos faltantes, cero explícito, bloques Día y Noche, secuencia repetida, colocación entre ventanas,
   capacidad restante de un bloque iniciado. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Infinity};
vm.createContext(sb);sb.window=sb;sb.glacialPlanificacion={};
vm.runInContext(fs.readFileSync(R+'/js/produccion/65b-planificacion-motor.js','utf8'),sb);
const M=sb.glacialPlanificacion.motor;

const FECHA='2099-03-07';
const DIA={inicioMs:new Date(FECHA+'T07:00:00').getTime(),duracionMin:720};
const NOCHE={inicioMs:new Date(FECHA+'T21:00:00').getTime(),duracionMin:600};
const VEL={'Bells|625':2400,'Scala|380':3000,'Fontlife|7L':1000};
const vel=(m,p)=>VEL[m+'|'+p]||0;
const tp=raw=>M.normalizarTiempos(raw||{});
const regla=(id,tipo,minutos,extra)=>Object.assign({id,linea:'PET1',tipo,minutos,activo:true,actualizadoEn:1},extra||{});
const filas=(...x)=>x.map(([m,p,c])=>({marca:m,presentacion:p,cantidad:c}));
const entrada=(f,o)=>Object.assign({fecha:FECHA,bloqueClave:'DÍA',bloque:DIA,linea:'PET1',filas:f,tramos:[],tp:tp(),vel},o||{});
const BELLS_SCALA=filas(['Bells','625',12000],['Scala','380',6000]);       // 300 min + 120 min de producción

/* ---------- ventanas: unión, límites, noche ---------- */
{
  const u=M.union([[0,60],[30,90],[200,230]]);
  ok(u.total===120&&u.intervalos.length===2,'ventanas superpuestas: la unión descuenta 0–90 (90 min) + 200–230 (30 min) = 120 min, sin contar dos veces los 30 min comunes');
  ok(M.posicionVentana({inicio:'09:00',fin:'09:30'},DIA).z-M.posicionVentana({inicio:'09:00',fin:'09:30'},DIA).a===30,'ventana de 09:00 a 09:30 = 30 min');
  const n=M.posicionVentana({inicio:'23:30',fin:'00:30'},NOCHE);
  ok(n.a===150&&n.z===210,'Noche cruza la medianoche: 23:30–00:30 son 60 min dentro del bloque (150–210 desde las 21:00)');
  ok(M.posicionVentana({inicio:'06:30',duracionMin:30},NOCHE).z===600,'una ventana puede terminar justo al fin de Noche (07:00)');
  ok(M.posicionVentana({inicio:'06:30',duracionMin:45},NOCHE).error&&M.posicionVentana({inicio:'20:00',fin:'20:30'},NOCHE).error&&M.posicionVentana({inicio:'10:00',fin:'09:00'},DIA).error,'rechaza ventanas que salen del bloque, empiezan fuera de él o terminan antes de empezar');
  const v=M.validarVentana({id:'n',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'09:15',fin:'10:15'},DIA,[{id:'a',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'LIMPIEZA',inicio:'09:00',fin:'09:30'}]);
  ok(!v.errores.length&&v.avisos.length===1,'un solape no es un error: se avisa y se calcula la unión');
  ok(M.validarVentana({linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'OTRA',inicio:'09:00',fin:'10:00',motivo:''},DIA,[]).errores.length>0,'«Otra parada prevista» exige el motivo');
}

/* ---------- plan que cabe y plan que excede ---------- */
{
  const t=tp({reglas:[regla('r1','CAMBIO_MARCA_FORMATO',30)]});
  const c=M.capacidad(entrada(BELLS_SCALA,{tp:t}));
  ok(c.produccionMin===420&&c.cambiosMin===30&&c.preparacionMin===30&&c.requeridoMin===450&&c.disponibleMin===720&&c.holguraMin===270&&c.estado==='CABE','plan que cabe: 420 min de producción + 30 de cambio = 450 min contra 720 disponibles (sobran 270)');
  ok(Math.round(c.utilizacionPct)===63&&c.brutoMin===720&&c.saldoMin===270,'bruto, utilización y saldo de tiempo');
  const g=M.capacidad(entrada(filas(['Bells','625',30000],['Scala','380',6000]),{tp:t}));
  ok(g.estado==='EXCESO'&&g.requeridoMin===900&&g.holguraMin===-180&&/supera/.test(g.motivoExceso),'plan que excede: 750 + 120 min de producción + 30 de cambio = 900 contra 720 → «No cabe» (exceso de 3 h)');
}

/* ---------- cambios de marca / formato sin sumar duplicados ---------- */
{
  const A={marca:'Bells',presentacion:'625'},B={marca:'Scala',presentacion:'380'},B2={marca:'Scala',presentacion:'625'},B3={marca:'Bells',presentacion:'380'};
  const sola=tp({reglas:[regla('m','CAMBIO_MARCA',20),regla('f','CAMBIO_FORMATO',40)]});
  ok(M.resolverCambio(sola,'PET1',A,B2).minutos===20&&M.resolverCambio(sola,'PET1',A,B3).minutos===40,'solo cambia la marca: regla de marca; solo cambia el formato: regla de formato');
  const ambos=M.resolverCambio(sola,'PET1',A,B);
  ok(ambos.minutos===40&&ambos.advertencia&&/sin sumarlas/.test(ambos.explicacion),'cambian marca y formato sin regla combinada: se aplica la MAYOR (40), no la suma (60), y se explica');
  const comb=tp({reglas:[regla('m','CAMBIO_MARCA',20),regla('f','CAMBIO_FORMATO',40),regla('c','CAMBIO_MARCA_FORMATO',45)]});
  const rc=M.resolverCambio(comb,'PET1',A,B);
  ok(rc.minutos===45&&rc.regla.id==='c'&&/combinada/.test(rc.explicacion),'con regla combinada se aplica ella sola (45), no 20 + 40');
  const especifica=tp({reglas:[regla('g','CAMBIO_MARCA_FORMATO',45),regla('e','CAMBIO_MARCA_FORMATO',25,{origen:{marca:'Bells',presentacion:'625'},destino:{marca:'Scala',presentacion:'380'}})]});
  ok(M.resolverCambio(especifica,'PET1',A,B).minutos===25&&M.resolverCambio(especifica,'PET1',A,{marca:'Otra',presentacion:'7L'}).minutos===45,'la regla específica de la transición gana al valor general de la línea, que queda de respaldo');
  const inactiva=tp({reglas:[regla('e','CAMBIO_MARCA_FORMATO',25,{activo:false})]});
  ok(M.resolverCambio(inactiva,'PET1',A,B).faltante!==undefined,'una regla inactiva no se aplica');
  ok(M.resolverCambio(tp({reglas:[regla('x','CAMBIO_MARCA_FORMATO',25,{linea:'PET2'})]}),'PET1',A,B).faltante!==undefined,'la regla de otra línea no se aplica');
  const resp=M.resolverCambio(tp({cambioMin:35}),'PET1',A,B);
  ok(resp.minutos===35&&resp.respaldo&&/respaldo/.test(resp.explicacion),'el valor general de respaldo se usa solo si no hay regla y se identifica');
  const falta=M.resolverCambio(tp(),'PET1',A,B);
  ok(falta.minutos===null&&/Bells/.test(falta.faltante)&&/Scala/.test(falta.faltante),'sin regla ni respaldo: no se inventa el tiempo, se dice qué falta');
  const c=M.capacidad(entrada(BELLS_SCALA));
  ok(c.estado==='INCOMPLETA'&&c.faltantes.some(f=>/cambio/.test(f.dato))&&c.cargaPct===null,'plan con cambio sin tiempo configurado: «Estimación incompleta» con el dato faltante y sin carga inventada');
  const cero=M.capacidad(entrada(BELLS_SCALA,{tp:tp({reglas:[regla('z','CAMBIO_MARCA_FORMATO',0)]})}));
  ok(cero.estado==='CABE'&&cero.cambiosMin===0&&cero.faltantes.length===0,'cero explícito es válido: no hay tiempo adicional y no se considera dato faltante');
  ok(tp({reglas:[{id:'a',linea:'PET1',tipo:'CAMBIO_MARCA',minutos:null},{id:'b',linea:'PET1',tipo:'CAMBIO_MARCA',minutos:''}]}).reglas.length===0,'una duración vacía o desconocida no se convierte en cero: la regla no existe');
}

/* ---------- limpieza fija, refrigerio y ventanas ---------- */
{
  const base=[regla('c','CAMBIO_MARCA_FORMATO',30),regla('l','LIMPIEZA_INICIO',40),regla('lf','LIMPIEZA_FIN',20)];
  const sinVentana=M.capacidad(entrada(BELLS_SCALA,{tp:tp({reglas:base})}));
  ok(sinVentana.preparacionMin===90&&sinVentana.requeridoMin===510,'limpieza de inicio (40) + cambio (30) + limpieza de fin (20) = 90 min de preparación');
  const conLimpiezaFija=M.capacidad(entrada(BELLS_SCALA,{tp:tp({reglas:base,ventanas:[{id:'v1',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'LIMPIEZA',inicio:'07:00',fin:'07:40'}]})}));
  ok(conLimpiezaFija.indisponibleMin===40&&conLimpiezaFija.preparacionMin===30&&conLimpiezaFija.preparacionesOmitidas.length===2&&conLimpiezaFija.requeridoMin===450,
    'limpieza fija como ventana: se descuenta del disponible UNA vez y las reglas de limpieza no se suman otra vez como preparación');
  ok(conLimpiezaFija.disponibleMin===680&&conLimpiezaFija.notas.some(n=>/no se suma otra vez/.test(n)),'el disponible baja 40 min y la nota explica por qué no se suma de nuevo');
  const refr=M.capacidad(entrada(BELLS_SCALA,{tp:tp({reglas:[base[0]]})}));
  ok(refr.indisponibleMin===0&&refr.disponibleMin===720,'el refrigerio del personal no detiene la línea: sin ventana registrada no se descuenta nada');
  const refrDet=M.capacidad(entrada(BELLS_SCALA,{tp:tp({reglas:[base[0]],ventanas:[{id:'r',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'REFRIGERIO',inicio:'12:00',fin:'12:45'}]})}));
  ok(refrDet.indisponibleMin===45&&refrDet.ventanas[0].tipo==='REFRIGERIO','el refrigerio solo se descuenta cuando se registra como ventana con detención de línea');
  const solape=M.capacidad(entrada(BELLS_SCALA,{tp:tp({reglas:[base[0]],ventanas:[
    {id:'a',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'10:00',fin:'11:00'},{id:'b',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'OTRA',inicio:'10:30',fin:'11:30',motivo:'ajuste'}]})}));
  ok(solape.indisponibleMin===90&&solape.ventanasSolapadasMin===30,'dos ventanas superpuestas (10:00–11:00 y 10:30–11:30): indisponible = unión de 90 min, no 120');
  const otraLinea=M.capacidad(entrada(BELLS_SCALA,{tp:tp({reglas:[base[0]],ventanas:[{id:'a',linea:'PET2',fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'10:00',fin:'11:00'},{id:'b',linea:'PET1',fecha:'2099-03-08',bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'10:00',fin:'11:00'},{id:'c',linea:'PET1',fecha:FECHA,bloque:'NOCHE',tipo:'MANTENIMIENTO',inicio:'22:00',fin:'23:00'}]})}));
  ok(otraLinea.indisponibleMin===0,'las ventanas de otra línea, otra fecha u otro bloque no afectan');
  const legacy=M.capacidad(entrada(BELLS_SCALA,{tp:tp({reglas:[base[0]],fijoDiaMin:90})}));
  ok(legacy.indisponibleMin===90&&legacy.ventanasSinHorarioMin===90&&legacy.notas.some(n=>/sin horario/.test(n)),'respaldo antiguo: minutos fijos del bloque solo si no hay ventanas con horario, y se dice');
  const legacyConVentana=M.capacidad(entrada(BELLS_SCALA,{tp:tp({reglas:[base[0]],fijoDiaMin:90,ventanas:[{id:'r',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'REFRIGERIO',inicio:'12:00',fin:'12:45'}]})}));
  ok(legacyConVentana.indisponibleMin===45,'con ventanas con horario, los minutos fijos antiguos NO se suman encima (cada parada una sola vez)');
}

/* ---------- disponible cero, velocidad faltante, Noche ---------- */
{
  const t=tp({reglas:[regla('c','CAMBIO_MARCA_FORMATO',30)],ventanas:[{id:'a',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'07:00',fin:'19:00'}]});
  const c=M.capacidad(entrada(BELLS_SCALA,{tp:t}));
  ok(c.disponibleMin===0&&c.estado==='EXCESO'&&c.utilizacionPct===null&&c.cargaPct===null&&/No queda tiempo/.test(c.motivoExceso),'disponible cero: «No cabe», sin utilización infinita ni porcentaje');
  const v=M.capacidad(entrada(filas(['Bells','625',12000],['Fontlife','xx',500]),{tp:tp({reglas:[regla('c','CAMBIO_MARCA_FORMATO',30)]})}));
  ok(v.estado==='INCOMPLETA'&&v.faltantes.some(f=>f.dato==='velocidad estándar'&&f.marca==='Fontlife'),'velocidad faltante: estimación incompleta que nombra el producto');
  const n=M.capacidad(entrada(filas(['Bells','625',9000]),{bloque:NOCHE,bloqueClave:'NOCHE',tp:tp({ventanas:[{id:'a',linea:'PET1',fecha:FECHA,bloque:'NOCHE',tipo:'REFRIGERIO',inicio:'01:00',fin:'01:30'}]})}));
  ok(n.brutoMin===600&&n.indisponibleMin===30&&n.disponibleMin===570&&n.produccionMin===225&&n.estado==='CABE','Noche (21:00–07:00): 600 − 30 de refrigerio con detención = 570 min; 9 000 a 2 400/h = 225 min');
  ok(M.capacidad(entrada([],{}))===null,'sin programación no hay capacidad que estimar');
}

/* ---------- secuencia con producto repetido y colocación entre ventanas ---------- */
{
  const t0=[regla('c','CAMBIO_MARCA_FORMATO',30)];
  const f=filas(['Bells','625',12000],['Scala','380',6000]);                      // 300 y 120 min
  const tramos=[{orden:1,marca:'Scala',presentacion:'380',tipoFin:'HORA',horaFin:'08:00'},{orden:2,marca:'Bells',presentacion:'625',tipoFin:'HORA',horaFin:'14:00'},{orden:3,marca:'Scala',presentacion:'380',tipoFin:'CIERRE'}];
  const c=M.capacidad(entrada(f,{tramos,tp:tp({reglas:t0})}));
  const reparto=c.colocacion.eventos.filter(e=>e.tipo==='TRAMO').map(e=>Math.round(e.qty));
  ok(c.cambios===2&&c.cambiosMin===60,'SCALA → BELLS → SCALA genera dos cambios (60 min)');
  ok(reparto[0]===3000&&reparto[2]===3000&&reparto.reduce((a,b)=>a+b,0)===3000+reparto[1]+3000&&c.colocacion.quedan.length===0,'un producto repetido no duplica su cantidad: Scala 6 000 = 3 000 + 3 000 y BELLS lo que cabe hasta su hora');
  ok(c.productos.find(p=>p.marca==='Scala').cantidad===6000&&c.produccionMin===420,'la producción requerida cuenta cada producto una sola vez (420 min)');
  // la ventana aprieta: el tramo con hora de fin no alcanza
  const apretado=M.capacidad(entrada(filas(['Bells','625',12000]),{tramos:[{orden:1,marca:'Bells',presentacion:'625',tipoFin:'HORA',horaFin:'10:00'}],tp:tp({ventanas:[{id:'a',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'07:00',fin:'09:00'}]})}));
  ok(apretado.colocacion.quedan[0].cantidad===7200||apretado.colocacion.quedan.length===1,'tramo hasta las 10:00 con una ventana de 2 h: solo produce 1 h (2 400); el resto queda sin asignar');
  ok(apretado.estado==='EXCESO'&&/no es ejecutable|cantidad sin producir/.test(apretado.motivoExceso),'aunque las horas totales caben (300 de 600 min), la secuencia no es ejecutable y se marca «No cabe» con el motivo');
  // un cambio que no cabe antes de la ventana se coloca después (no se parte)
  const ven=tp({reglas:[regla('c','CAMBIO_MARCA_FORMATO',60)],ventanas:[{id:'a',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'12:20',fin:'13:00'}]});
  const t2=[{orden:1,marca:'Bells',presentacion:'625',tipoFin:'HORA',horaFin:'12:00'},{orden:2,marca:'Scala',presentacion:'380',tipoFin:'CIERRE'}];
  const p=M.capacidad(entrada(filas(['Bells','625',10000],['Scala','380',3000]),{tramos:t2,tp:ven}));
  const prep=p.colocacion.eventos.find(e=>e.tipo==='PREP');
  ok(prep.a===13*60-7*60&&p.colocacion.avisos.some(a=>/no se parte/.test(a)),'un cambio de 60 min que no cabe antes de la ventana (12:20) se coloca después de ella (13:00): una preparación no se parte');
  // sin secuencia
  const ss=M.capacidad(entrada(f,{tp:tp({reglas:t0})}));
  ok(ss.colocacion.verificada===false&&/Sin secuencia/.test(ss.colocacion.motivo)&&ss.notas.some(n=>/No hay secuencia/.test(n)),'sin secuencia: no se afirma que la colocación sea ejecutable y se dice');
  // secuencia incompleta si falta velocidad
  const fv=M.capacidad(entrada(filas(['Fontlife','xx',500]),{tramos:[{orden:1,marca:'Fontlife',presentacion:'xx',tipoFin:'CIERRE'}]}));
  ok(fv.estado==='INCOMPLETA','secuencia con un producto sin velocidad: estimación incompleta');
}

/* ---------- agrupación: Día + Intermedio y cancelados ---------- */
{
  const c=M.capacidad(entrada(filas(['Bells','625',6000],['Bells','625',6000]),{tp:tp()}));
  ok(c.productos.length===1&&c.productos[0].cantidad===12000&&c.cambios===0,'Mañana + Intermedio del mismo producto suman en un solo producto (sin cambio entre ellos)');
  ok(M.capacidad(entrada(filas(['Bells','625',0])))===null,'cantidad cero no cuenta (los cancelados ya se excluyen al armar las filas)');
}

/* ---------- capacidad restante de un bloque iniciado ---------- */
{
  const f=filas(['Bells','625',12000],['Scala','380',6000]);
  const t=tp({reglas:[regla('c','CAMBIO_MARCA_FORMATO',30)]});
  const ahora=DIA.inicioMs+4*3600000;                                              // 11:00, 4 h transcurridas
  const estados={'Bells':'EN_PRODUCCION','Scala':'PENDIENTE'};
  const prod={'Bells':4800,'Scala':0};
  const base={ahora,tp:t,estado:(m)=>estados[m],producido:(m)=>prod[m]};
  const r=M.restante(entrada(f,base));
  ok(r.aplica&&r.estado==='CABE'&&r.disponibleMin===480&&r.produccionMin===(7200/2400+6000/3000)*60&&r.preparacionMin===30&&r.requeridoMin===330,'bloque iniciado: quedan 480 min (08:00 a 19:00 menos nada), saldo 7 200 + 6 000 UND = 300 min + 30 de cambio pendiente');
  ok(/11:00/.test(r.fuente),'la propuesta identifica la hora del cálculo y los datos usados');
  const yaCambiado={Bells:'FINALIZADA',Scala:'EN_PRODUCCION'};
  const r2=M.restante(entrada(f,{ahora,tp:t,estado:(m)=>yaCambiado[m],producido:(m)=>({Bells:12000,Scala:1000})[m]}));
  ok(r2.preparacionMin===0&&r2.produccionMin===(5000/3000)*60,'si el cambio ya se hizo (Scala ya está en producción), no se vuelve a sumar');
  const ven=tp({reglas:[regla('c','CAMBIO_MARCA_FORMATO',30)],ventanas:[{id:'p',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'MANTENIMIENTO',inicio:'08:00',fin:'09:00'},{id:'f',linea:'PET1',fecha:FECHA,bloque:'DÍA',tipo:'REFRIGERIO',inicio:'12:00',fin:'12:45'}]});
  const r3=M.restante(entrada(f,Object.assign({},base,{tp:ven})));
  ok(r3.disponibleMin===480-45,'ventanas: la de 08:00–09:00 ya pasó (no se descuenta otra vez) y solo se resta la futura de 45 min');
  const sinReg=M.restante(entrada(f,{ahora,tp:t,estado:(m)=>estados[m],producido:(m)=>m==='Scala'?null:4800}));
  ok(sinReg.estado==='SIN_DATOS'&&sinReg.sugerenciaAplicable===false&&/registro de producción de Scala/.test(sinReg.motivo),'sin registro de producción de un producto: no se calcula ni se aplica una sugerencia automática');
  ok(M.restante(entrada(f,{ahora:DIA.inicioMs-3600000,tp:t,estado:()=>'PENDIENTE',producido:()=>0})).aplica===false,'antes de empezar el bloque no hay capacidad restante');
  ok(M.restante(entrada(f,{ahora,tp:t,estado:()=>'PENDIENTE',producido:()=>0})).aplica===false,'bloque que no se inició en Producción Actual: vale la capacidad del plan, no se vuelve a hablar de restante');
  const exceso=M.restante(entrada(filas(['Bells','625',60000]),{ahora,tp:t,estado:()=>'EN_PRODUCCION',producido:()=>10000}));
  ok(exceso.estado==='EXCESO'&&exceso.holguraMin<0,'restante con exceso: quedan 50 000 UND (1 250 min) contra 480 min');
}

/* ---------- huella del plan ---------- */
{
  ok(M.huella(filas(['Bells','625',100]))===M.huella(filas(['Bells','625',60],['Bells','625',40]))&&M.huella(filas(['Bells','625',100]))!==M.huella(filas(['Bells','625',101])),'la huella no cambia si el plan es el mismo y cambia si cambia una cantidad');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
