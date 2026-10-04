/* Pruebas del módulo único de indicadores (js/nucleo/45-indicadores.js).
   Se ejecutan con:   node tests/indicadores.test.js
   No necesitan navegador, Firebase ni librerías. Terminan con código 1 si algo falla. */
'use strict';
const I=require('../js/nucleo/45-indicadores.js');

let fallas=0,total=0;
const ok=(c,t)=>{total++;console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const cerca=(a,b,e=1e-9)=>typeof a==='number'&&Math.abs(a-b)<=e;
const congelar=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(congelar);}return o;};
const local=(y,m,d,h,mi)=>new Date(y,m-1,d,h,mi||0).getTime();

/* ============ CASO OFICIAL ============
   Programación 480 min · 60 min de parada programada · 45 min no programados ·
   14.400 unidades · velocidad estándar 2.500 UND/h */
{
  const t={transcurridoMin:480,paradasProgramadasMin:60,paradasNoProgramadasMin:45};
  const he=I.horasEfectivas(t);
  const plan=I.tiempoPlanificadoMin(480,60);
  const disp=I.disponibilidad(plan,45);
  const r=I.ratio(14400,he);
  const rend=I.rendimiento(r,2500);
  const o=I.oee(disp,rend);
  ok(cerca(he,6.25),'caso oficial: horas efectivas = 6.25');
  ok(plan===420,'caso oficial: tiempo planificado = 420 min');
  ok(cerca(disp*100,89.2857142857,1e-6)&&(disp*100).toFixed(1)==='89.3','caso oficial: disponibilidad = 89.3 %');
  ok(cerca(r,2304)&&Math.round(r)===2304,'caso oficial: ratio = 2,304 UND/h');
  ok(cerca(rend*100,92.16,1e-9)&&(rend*100).toFixed(1)==='92.2','caso oficial: rendimiento = 92.2 %');
  ok((o*100).toFixed(1)==='82.3'&&cerca(o,0.8571428571428571*0+disp*rend),'caso oficial: OEE = 82.3 %');
  ok(I.NOTA_CALIDAD==='Calidad: no se mide','caso oficial: el OEE lleva la nota «Calidad: no se mide»');
  const res=I.resumenIndicadores([{producido:14400,programado:16000,programacionVigente:true,durMin:480,progMin:60,npMin:45,mermaTotal:288,velocidad:2500,etiqueta:'Cielo 625 ml'}]);
  ok(cerca(res.horasEfectivas,6.25)&&Math.round(res.ratio)===2304&&(res.disponibilidad*100).toFixed(1)==='89.3'&&(res.rendimiento*100).toFixed(1)==='92.2'&&(res.oee*100).toFixed(1)==='82.3',
    'caso oficial por el resumen de partes: los cinco valores coinciden');
  ok(cerca(res.merma*100,2,1e-9)&&cerca(res.cumplimiento*100,90,1e-9),'caso oficial por el resumen: merma 2 % (288 ÷ 14.400) y cumplimiento 90 % (14.400 ÷ 16.000)');
}

/* ============ horas efectivas ============ */
ok(I.horasEfectivas({transcurridoMin:600,paradasProgramadasMin:0,paradasNoProgramadasMin:0})===10,'horas efectivas sin paradas = tiempo transcurrido');
ok(I.horasEfectivas({transcurridoMin:100,paradasProgramadasMin:80,paradasNoProgramadasMin:80})===0,'horas efectivas nunca es negativa');
ok(I.horasEfectivas({})===0&&I.horasEfectivas()===0&&I.horasEfectivas(null)===0,'horas efectivas sin datos = 0');
ok(cerca(I.horasEfectivas({transcurridoMin:'480',paradasProgramadasMin:'60',paradasNoProgramadasMin:'45'}),6.25),'horas efectivas acepta números escritos como texto');

/* ============ tiempo planificado ============ */
ok(I.tiempoPlanificadoMin(480,60)===420&&I.tiempoPlanificadoMin(60,480)===0&&I.tiempoPlanificadoMin(480,0)===480,'tiempo planificado = duración − paradas programadas (mínimo 0)');

/* ============ ratio ============ */
ok(I.ratio(1000,0)===null&&I.ratio(1000,-1)===null&&I.ratio(1000,undefined)===null,'ratio sin horas efectivas = null (no 0)');
ok(I.ratio(0,5)===0,'ratio con producción 0 = 0');

/* ============ disponibilidad ============ */
ok(I.disponibilidad(0,10)===null&&I.disponibilidad(undefined,5)===null,'disponibilidad sin tiempo planificado = null');
ok(I.disponibilidad(420,0)===1&&I.disponibilidad(420,420)===0&&I.disponibilidad(420,500)===0,'disponibilidad: 100 % sin paradas, 0 % si las paradas igualan o superan el planificado');

/* ============ rendimiento ============ */
ok(I.rendimiento(2304,0)===null&&I.rendimiento(2304,undefined)===null&&I.rendimiento(null,2500)===null,'rendimiento sin velocidad estándar o sin ratio = null');
ok(cerca(I.rendimiento(3000,2500),1.2)&&I.rendimientoARevisar(1.2)&&!I.rendimientoARevisar(1)&&!I.rendimientoARevisar(null),'rendimiento sin tope: 120 % se devuelve tal cual y se marca «revisar velocidad estándar»');

/* ============ OEE ============ */
ok(I.oee(0.9,null)===null&&I.oee(null,0.9)===null&&I.oee(undefined,undefined)===null,'OEE sin disponibilidad o sin rendimiento (sin velocidad) = null');
ok(cerca(I.oee(0.9,0.8),0.72)&&I.oee(0,0.9)===0,'OEE = disponibilidad × rendimiento');

/* ============ merma ============ */
ok(I.merma(50,0)===null&&I.merma(50,undefined)===null,'merma sin producción = null');
ok(cerca(I.merma(528,14112),528/14112)&&I.merma(0,1000)===0,'merma = suma de mermas ÷ producción efectiva');
{
  const d=I.desgloseMerma([{item:'Botellas',unidades:288,peso:10},{item:'Preformas',unidades:40,peso:1},{item:'Tapa Plana',unidades:80,peso:.1},
    {item:'Tapa Sport Cap',unidades:40,peso:.05},{item:'Etiqueta',unidades:80,peso:.01},{item:'Polietileno',unidades:1.5,peso:42},{item:'Asa',unidades:7,peso:.2},{item:'',unidades:99},null]);
  ok(d.map(x=>x.componente).join()==='Botellas,Preformas,Tapas,Etiquetas,Polietileno,Asa','desglose de merma: componentes en su orden (Botellas, Preformas, Tapas, Etiquetas, Polietileno, otros)');
  ok(d[2].cantidad===120&&d[2].unidad==='unidades','desglose: «Tapa Plana» y «Tapa Sport Cap» se suman en Tapas (120 unidades)');
  ok(d[4].cantidad===42&&d[4].unidad==='kg'&&d[4].textoUnidad==='kg (1.50 rollos)','desglose: polietileno en kg (y sus rollos)');
  ok(d.every(x=>x.componente!==''),'desglose: ignora los ítems sin nombre');
  ok(I.componenteMerma('Bidones')==='Botellas'&&I.componenteMerma('Tapa')==='Tapas'&&I.componenteMerma('Polietileno 48cm')==='Polietileno'&&I.componenteMerma('Cajas')==='Cajas','componente de merma: nombres de todas las líneas');
}

/* ============ cumplimiento, programado y producido ============ */
ok(I.cumplimiento(100,0)===null&&I.cumplimiento(100,undefined)===null,'cumplimiento sin programado = null');
ok(cerca(I.cumplimiento(8000,10000),0.8)&&cerca(I.cumplimiento(11000,10000),1.1),'cumplimiento = producido ÷ programado (puede pasar de 100 %)');
ok(I.programadoVigente([{cantidadProgramada:10000},{cantidadProgramada:5000,estadoOperacion:{estado:'CANCELADA'}},{cantidadProgramada:2000,estadoOperacion:{estado:'EN_PRODUCCION'}},null,{cantidadProgramada:-5}])===12000,
  'programado vigente: suma la programación sin las canceladas (estadoOperacion.estado)');
ok(I.programadoVigente()===0&&I.programadoVigente([])===0,'programado vigente sin datos = 0');
ok(I.produccionVigente({turnoEnCurso:true,paletas:4200,registro:9999})===4200,'producido en el turno en curso = lo registrado en Paletas');
ok(I.produccionVigente({turnoEnCurso:false,paletas:4200,registro:9999})===9999,'producido en un turno cerrado = el registro del turno');
ok(I.produccionVigente({turnoEnCurso:false,paletas:4200})===null&&I.produccionVigente({turnoEnCurso:true,registro:5})===null,'si falta la fuente que corresponde, el producido es null (no se sustituye por la otra)');
ok(I.produccionVigente({turnoEnCurso:true,paletas:0})===0,'un producido de 0 es un dato válido');

/* ============ color según la meta ============ */
ok(I.colorSegunMeta(96,{verde:95,ambar:85})==='verde'&&I.colorSegunMeta(95,{verde:95,ambar:85})==='verde','color: en la meta = verde');
ok(I.colorSegunMeta(90,{verde:95,ambar:85})==='ambar'&&I.colorSegunMeta(85,{verde:95,ambar:85})==='ambar','color: entre ámbar y verde = ámbar');
ok(I.colorSegunMeta(70,{verde:95,ambar:85})==='roja','color: bajo el ámbar = rojo');
ok(I.colorSegunMeta(1.5,{verde:2,ambar:3},'menor')==='verde'&&I.colorSegunMeta(2.5,{verde:2,ambar:3},'menor')==='ambar'&&I.colorSegunMeta(4,{verde:2,ambar:3},'menor')==='roja','color en la merma (meta máxima): verde ≤ 2, ámbar ≤ 3, rojo más');
ok(I.colorSegunMeta(null,{verde:1,ambar:1})==='gris'&&I.colorSegunMeta(90,null)==='gris'&&I.colorSegunMeta(90,{verde:95})==='gris'&&I.colorSegunMeta(NaN,{verde:1,ambar:1})==='gris','color sin valor o sin meta = gris');
{
  const tabla=I.normalizarMetas({cumplimiento:{verde:98,ambar:92},merma:{verde:1.5}});
  ok(tabla.cumplimiento.verde===98&&tabla.cumplimiento.ambar===92,'metas: toma lo guardado en Firestore');
  ok(tabla.merma.verde===1.5&&tabla.merma.ambar===3,'metas: completa lo que falta con los valores iniciales');
  ok(tabla.disponibilidad.verde===90&&tabla.oee.verde===85&&tabla.ratio.verde===95,'metas: sin nada guardado usa los valores iniciales');
  ok(I.normalizarMetas(null).cumplimiento.verde===95&&I.normalizarMetas({oee:{verde:70,ambar:90}}).oee.ambar===70,'metas: sin tabla usa lo inicial, y el ámbar nunca supera al verde');
  ok(I.colorIndicador('cumplimiento',0.96,I.METAS_INICIALES)==='verde'&&I.colorIndicador('merma',0.035,I.METAS_INICIALES)==='roja'&&I.colorIndicador('oee',null)==='gris','color de un indicador con la tabla (valor como fracción)');
  ok(I.colorIndicador('cumplimiento',0.96,tabla)==='ambar'&&I.colorIndicador('cumplimiento',0.99,tabla)==='verde','al cambiar la tabla de metas cambia el color');
}

/* ============ día operativo y turno ============ */
{
  const caso=(h,mi,fecha,turno)=>{
    const t=I.turnoVigente(local(2026,10,10,h,mi));
    return t&&t.fecha===fecha&&t.turno===turno;
  };
  ok(caso(3,0,'2026-10-09','NOCHE')&&caso(6,59,'2026-10-09','NOCHE'),'turno: de 00:00 a 06:59 sigue siendo la NOCHE del día operativo anterior');
  ok(caso(7,0,'2026-10-10','DÍA')&&caso(7,10,'2026-10-10','DÍA')&&caso(14,59,'2026-10-10','DÍA'),'turno: DÍA de 07:00 a 14:59 (el día operativo empieza a las 07:00)');
  ok(caso(15,0,'2026-10-10','INTERMEDIO')&&caso(21,59,'2026-10-10','INTERMEDIO'),'turno: INTERMEDIO de 15:00 a 21:59');
  ok(caso(22,0,'2026-10-10','NOCHE')&&caso(23,59,'2026-10-10','NOCHE'),'turno: NOCHE desde las 22:00 (con la fecha del día en que empezó)');
  ok(I.turnoVigente(local(2026,10,11,0,30)).fecha==='2026-10-10','turno: pasada la medianoche la fecha sigue siendo la del día que empezó');
  const n=I.turnoVigente(local(2026,10,10,23,0));
  ok(n.fin===local(2026,10,11,7,0)&&n.inicio===local(2026,10,10,22,0)&&n.activo===true,'turno NOCHE: inicia a las 22:00 y termina a las 07:00 del día siguiente');
  ok(I.diaOperativo(local(2026,10,10,5,0))==='2026-10-09'&&I.diaOperativo(local(2026,10,10,9,0))==='2026-10-10','día operativo: 05:00 → día anterior; 09:00 → hoy');
  ok(I.turnoVigente(NaN)===null&&I.turnoVigente(undefined)===null&&I.diaOperativo('x')===null,'turno sin hora válida = null (no usa el reloj del equipo)');
  const h=I.horarioTurno('2026-10-10','NOCHE');
  ok(h.inicio===local(2026,10,10,22,0)&&h.fin===local(2026,10,11,7,0),'horario NOCHE de una fecha: 22:00 a 07:00 del día siguiente');
  ok(I.horarioTurno('2026-10-10','INTERMEDIO',true).inicio===local(2026,10,10,7,0)&&I.horarioTurno('2026-10-10','INTERMEDIO',false).inicio===local(2026,10,10,15,0),'horario INTERMEDIO: 15:00 solo, o 07:00 si comparte el reporte con DÍA');
  ok(I.horarioTurno('x','DÍA')===null&&I.horarioTurno('2026-10-10','TARDE')===null,'horario con fecha o turno inválido = null');
}

/* ============ estado de línea ============ */
ok(I.estadoLineaDesdeItems(['EN_CURSO','PENDIENTE'])==='EN_CURSO','estado de línea: en curso gana a pendiente');
ok(I.estadoLineaDesdeItems(['PAUSA','EN_CURSO','DETENIDA'])==='DETENIDA'&&I.estadoLineaDesdeItems(['PAUSA','EN_CURSO'])==='EN_CURSO','estado de línea: prioridad detenida > en curso > pausa');
ok(I.estadoLineaDesdeItems(['COMPLETADA','CANCELADA'])==='COMPLETADA'&&I.estadoLineaDesdeItems(['CANCELADA','CANCELADA'])==='CANCELADA','estado de línea: todo cerrado = completada; todo cancelado = cancelada');
ok(I.estadoLineaDesdeItems(['COMPLETADA','PENDIENTE'])==='PENDIENTE'&&I.estadoLineaDesdeItems([])===null&&I.estadoLineaDesdeItems()===null,'estado de línea: con algo pendiente = pendiente; sin programaciones = null');

/* ============ resumen de partes ============ */
{
  const partes=[
    {producido:9800,programado:10500,programacionVigente:true,durMin:360,progMin:45,npMin:30,mermaTotal:300,velocidad:2500,etiqueta:'A'},
    {producido:3000,programado:3600,programacionVigente:true,durMin:120,progMin:0,npMin:15,mermaTotal:60,velocidad:0,etiqueta:'B sin velocidad'},
    {producido:500,programado:0,programacionVigente:false,durMin:0,progMin:0,npMin:0,mermaTotal:0,velocidad:2500,etiqueta:'C sin horas'}];
  const r=I.resumenIndicadores(partes);
  ok(r.produccion===13300&&r.programado===14100&&r.producidoConProgramacion===12800,'resumen: producción total, programado y producido con programación vigente');
  ok(cerca(r.cumplimiento,12800/14100),'resumen: cumplimiento solo con lo que tiene programación vigente');
  ok(cerca(r.horasEfectivas,(360-45-30+120-15)/60),'resumen: horas efectivas = suma de las partes con tiempo');
  ok(cerca(r.ratio,12800/((360-45-30+120-15)/60)),'resumen: ratio = producción de las partes con tiempo ÷ horas efectivas');
  ok(cerca(r.disponibilidad,((315-30)+(120-15))/(315+120)),'resumen: disponibilidad = Σ(planificado − no programadas) ÷ Σ planificado');
  ok(r.rendimiento!==null&&cerca(r.rendimiento,9800/(285/60*2500)),'resumen: rendimiento solo con los productos que tienen velocidad estándar');
  ok(r.oee!==null&&cerca(r.oee,(285/315)*r.rendimiento),'resumen: OEE con la disponibilidad de esos mismos productos');
  ok(r.faltantesVelocidad.length===1&&r.faltantesVelocidad[0]==='B sin velocidad'&&r.coberturaVelocidad<1,'resumen: lista los productos sin velocidad y la cobertura');
  ok(cerca(r.merma,360/13300),'resumen: merma = suma de mermas ÷ producción');
  const sinVel=I.resumenIndicadores([{producido:100,durMin:60,progMin:0,npMin:0}]);
  ok(sinVel.oee===null&&sinVel.rendimiento===null&&sinVel.ratio===100&&sinVel.disponibilidad===1,'resumen sin velocidad: OEE y rendimiento null; ratio y disponibilidad sí se calculan');
  const vacio=I.resumenIndicadores([]);
  ok(vacio.ratio===null&&vacio.disponibilidad===null&&vacio.merma===null&&vacio.cumplimiento===null&&vacio.oee===null&&vacio.produccion===0,'resumen sin partes: todo null (no 0 inventado)');
  ok(I.resumenIndicadores(undefined).produccion===0,'resumen sin argumento no falla');
  const alias=I.resumenIndicadores([{producido:14400,transcurridoMin:480,paradasProgramadasMin:60,paradasNoProgramadasMin:45,velocidad:2500}]);
  ok((alias.oee*100).toFixed(1)==='82.3','resumen acepta los nombres largos (transcurridoMin, paradasProgramadasMin, paradasNoProgramadasMin)');
}

/* ============ funciones puras: no modifican lo que reciben ============ */
{
  const entrada=congelar({partes:[{producido:100,programado:200,programacionVigente:true,durMin:60,progMin:5,npMin:5,mermaTotal:1,velocidad:100,etiqueta:'x'}],
    mermas:[{item:'Botellas',unidades:1,peso:1}],progs:[{cantidadProgramada:5,estadoOperacion:{estado:'CANCELADA'}}],claves:['EN_CURSO'],metas:{verde:1,ambar:0.5}});
  let error=null;
  try{
    I.resumenIndicadores(entrada.partes);I.desgloseMerma(entrada.mermas);I.programadoVigente(entrada.progs);
    I.estadoLineaDesdeItems(entrada.claves);I.colorSegunMeta(1,entrada.metas);I.normalizarMetas(entrada.metas);
    I.horasEfectivas(entrada.partes[0]);
  }catch(e){error=e;}
  ok(error===null,'las funciones no modifican sus argumentos (entradas congeladas: no falla)');
  ok(JSON.stringify(I.resumenIndicadores(entrada.partes))===JSON.stringify(I.resumenIndicadores(entrada.partes)),'mismos datos → mismo resultado (determinista)');
  ok(I.turnoVigente(local(2026,10,10,9,0)).turno===I.turnoVigente(local(2026,10,10,9,0)).turno,'el turno depende solo de la hora recibida');
}

/* ============ definiciones para «¿Cómo se calcula?» ============ */
ok(I.DEFINICIONES.length===11&&I.DEFINICIONES.every(d=>d.length===2&&d[0]&&d[1]),'las definiciones para «¿Cómo se calcula?» están completas (11)');
ok(I.DEFINICIONES.some(d=>d[0]==='OEE'&&/Calidad: no se mide/.test(d[1]))&&I.DEFINICIONES.some(d=>d[0]==='Disponibilidad'&&/planificado/.test(d[1])),'las definiciones dicen lo mismo que las funciones');

console.log('\n'+(total-fallas)+' de '+total+' pruebas correctas'+(fallas?' · '+fallas+' FALLAN':''));
