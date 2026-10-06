/* Proyección de cierre del bloque (45-indicadores.js): los tres casos de comprobación y los casos especiales. */
const G=require('../js/nucleo/45-indicadores.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const cerca=(a,b,d)=>a!=null&&Math.abs(a-b)<=(d==null?0.01:d);
const ms=(h,m)=>new Date(2026,9,5,h,m||0).getTime();
const hhmm=t=>{const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
const limpio=p=>!/NaN|Infinity/.test(JSON.stringify(p))&&['ritmoNecesario','restanteMin','pendiente','efectivoMin','transcurridoMin'].every(k=>p[k]==null||p[k]>=0);

/* ---------- CASO 1 ---------- */
const base={ahoraMs:ms(16),inicioMs:ms(7),finObjetivoMs:ms(19),programado:20000,producido:14400,progMin:60,npMin:30,velocidad:2500,
  programadasOficiales:[{motivo:'Refrigerio',minutos:60}],pausasPrevistas:[{nombre:'Refrigerio',min:60}]};
let p=G.proyeccionCierre(base);
ok(cerca(p.efectivoMin/60,7.5),'Caso 1: tiempo efectivo 7.5 h');
ok(cerca(p.ritmoReal,1920),'Caso 1: ritmo real 1,920 UND/h');
ok(cerca(p.rendimiento,1800),'Caso 1: rendimiento del bloque 1,800 UND/h (producido ÷ (transcurrido − programadas ocurridas))');
ok(cerca(p.siguenIgual,19800)&&cerca(p.pct,99.0)&&cerca(p.diferencia,-200),'Caso 1: «si las paradas siguen igual» 19,800 (99.0 %), faltarían 200');
ok(cerca(p.sinNuevas,20160)&&cerca(p.pctSinNuevas,100.8),'Caso 1: «sin nuevas paradas» 20,160 (100.8 %)');
ok(p.pendiente===5600&&cerca(p.ritmoNecesario,1866.67),'Caso 1: pendiente 5,600 y ritmo necesario 1,867 UND/h');
ok(cerca(p.requerimientoPct,74.7,0.05)&&p.capacidadNominal===2500,'Caso 1: requerimiento 74.7 % de la capacidad nominal (2,500)');
ok(hhmm(p.finalEstimadoMs)==='19:07'&&p.retrasoMin===7,'Caso 1: final estimado 19:07, retraso 7 min');
ok(p.veredicto==='EN_RIESGO'&&p.nivel==='ambar'&&p.etiqueta==='EN RIESGO','Caso 1: estado EN RIESGO');
ok(p.pausaPendienteMin===0,'Caso 1: el refrigerio ya registrado no se vuelve a descontar');
ok(limpio(p),'Caso 1: sin NaN, Infinity ni negativos');

/* ---------- CASO 2 ---------- */
p=G.proyeccionCierre({ahoraMs:ms(17),inicioMs:ms(7),finObjetivoMs:ms(19),programado:20000,producido:12000,progMin:0,npMin:0,velocidad:2500});
ok(p.pendiente===8000&&cerca(p.ritmoNecesario,4000)&&cerca(p.requerimientoPct,160),'Caso 2: pendiente 8,000; ritmo necesario 4,000 UND/h; requerimiento 160 %');
ok(p.veredicto==='NO_ALCANZABLE'&&p.nivel==='roja','Caso 2: NO ALCANZABLE');
ok(/META NO ALCANZABLE EN EL TIEMPO RESTANTE/.test(G.analisisProyeccion(p)),'Caso 2: el análisis explica por qué (no solo el número)');
ok(limpio(p),'Caso 2: sin NaN ni Infinity');

/* ---------- CASO 3 ---------- */
p=G.proyeccionCierre({ahoraMs:ms(18,44),inicioMs:ms(7),finObjetivoMs:ms(19),programado:20000,producido:0,progMin:0,npMin:0,velocidad:2500});
ok(p.estado==='NO_PROYECTABLE'&&p.etiqueta==='NO ES POSIBLE PROYECTAR TODAVÍA'&&/producción/.test(p.motivo),'Caso 3: «No es posible proyectar todavía» con el motivo');
ok(p.veredicto==='NO_ALCANZABLE'&&p.cabeNominal===false,'Caso 3: meta no alcanzable a capacidad nominal');
ok(p.siguenIgual==null&&p.finalEstimadoMs==null&&p.pct==null,'Caso 3: no se muestra ninguna proyección');
const t3=G.analisisProyeccion(p);
ok(/No es posible proyectar todavía/.test(t3)&&/META NO ALCANZABLE/.test(t3)&&!/73[.,]?600/.test(t3),'Caso 3: el texto no usa el ritmo necesario (73,600) como dato principal');
ok(limpio(p),'Caso 3: sin NaN ni Infinity');

/* ---------- casos especiales ---------- */
p=G.proyeccionCierre({ahoraMs:ms(12),inicioMs:0,finObjetivoMs:ms(19),programado:5000,producido:0,velocidad:2500});
ok(p.estado==='NO_PROYECTABLE'&&/inicio real/.test(p.motivo)&&p.cabeNominal===true&&p.veredicto===null,'sin inicio real: no se proyecta, pero informa que la meta cabe a capacidad nominal');
p=G.proyeccionCierre({ahoraMs:ms(7,20),inicioMs:ms(7),finObjetivoMs:ms(19),programado:20000,producido:900,velocidad:2500});
ok(p.estado==='NO_PROYECTABLE'&&/30 minutos efectivos/.test(p.motivo),'menos de 30 min efectivos: no se proyecta');
p=G.proyeccionCierre({ahoraMs:ms(15),inicioMs:ms(7),finObjetivoMs:ms(19),programado:10000,producido:10000,velocidad:2500,ultimoRegistroMs:ms(14,40)});
ok(p.estado==='CUMPLIDA'&&hhmm(p.horaCumplidaMs)==='14:40'&&/14:40/.test(G.analisisProyeccion(p)),'pendiente 0: «Meta cumplida a las 14:40»');
p=G.proyeccionCierre({ahoraMs:ms(19,30),inicioMs:ms(7),finObjetivoMs:ms(19),programado:20000,producido:19000,velocidad:2500});
ok(p.estado==='TERMINADO'&&p.ritmoNecesario==null&&p.pendiente===1000&&p.nivel==='roja','bloque terminado: resultado y faltante, sin ritmo necesario');
p=G.proyeccionCierre({ahoraMs:ms(12),inicioMs:ms(7),finObjetivoMs:ms(19),programado:6000,producido:2000,productos:[
  {etiqueta:'A',programado:3000,producido:2000,velocidad:2500,estado:'EN_CURSO'},{etiqueta:'B',programado:3000,producido:0,velocidad:0,estado:'PENDIENTE'}]});
ok(p.estado==='FALTA_VELOCIDAD'&&/Falta velocidad estándar/.test(p.motivo)&&p.faltaVelocidad[0]==='B','producto sin velocidad estándar: «Falta velocidad estándar»');
/* varios productos: total y capacidad ponderada; el cancelado no cuenta */
p=G.proyeccionCierre({ahoraMs:ms(13),inicioMs:ms(7),finObjetivoMs:ms(19),programado:9000,producido:3000,progMin:0,npMin:0,productos:[
  {etiqueta:'A',programado:3000,producido:3000,velocidad:3000,estado:'COMPLETADO'},
  {etiqueta:'B',programado:6000,producido:0,velocidad:2000,estado:'EN_CURSO'},
  {etiqueta:'C',programado:5000,producido:0,velocidad:0,estado:'CANCELADO'}]});
ok(p.estado==='NO_PROYECTABLE'||p.estado==='OK','varios productos: el cancelado no exige velocidad');
ok(cerca(p.tiempoNominalMin,6000/2000*60)&&p.productos.length===3,'varios productos: tiempo nominal = Σ pendiente ÷ velocidad (solo vigentes) y detalle por producto');
/* pausas previstas aún no registradas */
p=G.proyeccionCierre(Object.assign({},base,{programadasOficiales:[],progMin:0,npMin:30,producido:14400}));
ok(p.pausaPendienteMin===60&&cerca(p.restanteMin,120),'pausa prevista no registrada: se descuenta del tiempo restante (180 − 60 = 120)');
p=G.proyeccionCierre(Object.assign({},base,{programadasOficiales:[{motivo:'REFRIGERIO',minutos:30}]}));
ok(p.pausaPendienteMin===30,'refrigerio registrado a medias: solo se descuenta lo que falta (30 min); se reconoce por el nombre sin distinguir mayúsculas');
/* avisos informativos: no alteran el cálculo */
const sinAv=G.proyeccionCierre(base);
const conAv=G.proyeccionCierre(Object.assign({},base,{detencionSinRegistrarMin:20,ultimoRegistroMs:ms(14,30)}));
ok(conAv.avisos.length===2&&/20 min sin registrar en Avance/.test(conAv.avisos[0].texto)&&/desde las 14:30/.test(conAv.avisos[1].texto),'avisos: detención sin registrar y dato desactualizado');
ok(conAv.siguenIgual===sinAv.siguenIgual&&conAv.ritmoReal===sinAv.ritmoReal&&conAv.finalEstimadoMs===sinAv.finalEstimadoMs,'los avisos no cambian ningún número');
/* programación dinámica: el programado cambia y todo se recalcula */
const a=G.proyeccionCierre(base),b=G.proyeccionCierre(Object.assign({},base,{programado:18000}));
ok(b.veredicto==='CUMPLIBLE'&&b.pendiente===3600&&a.veredicto==='EN_RIESGO','cambiar la cantidad programada recalcula estado y pendiente');
/* final posterior al cierre */
ok(a.retrasoMin===7&&a.finalEstimadoMs>a.finObjetivoMs,'final posterior al fin objetivo: hora y retraso proyectado');
/* nunca NaN/Infinity con entradas vacías o raras */
[{},null,{programado:100},{programado:100,ahoraMs:1,inicioMs:5,finObjetivoMs:2},{programado:-5,producido:'x'}].forEach((e,i)=>ok(limpio(G.proyeccionCierre(e)),'entrada rara #'+(i+1)+': sin NaN ni Infinity'));

/* ---------- bloques ---------- */
const h=G.horarioBloque('2026-10-05','DÍA'),hi=G.horarioBloque('2026-10-05','INTERMEDIO'),hn=G.horarioBloque('2026-10-05','NOCHE');
ok(hhmm(h.inicio)==='07:00'&&hhmm(h.fin)==='19:00'&&h.inicio===hi.inicio&&h.fin===hi.fin,'bloque Día + Intermedio: 07:00–19:00 (el mismo para Día e Intermedio)');
ok(hhmm(hn.inicio)==='21:00'&&hhmm(hn.fin)==='07:00'&&new Date(hn.fin).getDate()===6,'bloque Noche: 21:00 → 07:00 del día siguiente (fecha de producción = día en que empieza)');
const cfg=G.horarioBloque('2026-10-05','DÍA',{diaInter:{inicio:'06:30',fin:'18:00'}});
ok(hhmm(cfg.inicio)==='06:30'&&hhmm(cfg.fin)==='18:00','los horarios salen de la configuración, no del código');
ok(G.horarioBloque('2026-10-05','DÍA',{diaInter:{inicio:'basura',fin:'25:99'}}).fin===h.fin,'configuración inválida: se usan los valores iniciales');
ok(G.pausasPrevistas('DÍA')[0].nombre==='Refrigerio'&&G.pausasPrevistas('DÍA')[0].min===60,'pausa prevista inicial: refrigerio de 60 min');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
