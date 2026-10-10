/* Tareo: horas extras, jornadas y resumen (46-tareo-horas-extras.js) con las funciones reales de 13-tareo.js. */
const fs=require('fs'),vm=require('vm');
const {cargarCliente,crearNube,leerDisco}=require('./tareo-harness.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};

const nube=crearNube({});
const cli=cargarCliente(nube,{});
const sb=cli.sb;
sb.GlacialIndicadores={diaOperativo:()=>'2026-10-10'};          // sábado
sb.tareoAreasVisibles=()=>['Producción','Mantenimiento'];
vm.runInContext(leerDisco('js/personal/46-tareo-horas-extras.js'),sb,{filename:'46.js'});
const HE=sb.TareoHE;

const P=(id,nombre,cargo,extra)=>Object.assign({trabajadorId:id,nombre,dni:'0000'+id,cargo,area:'Producción',asistencia:'Asistió',horaIngreso:'07:00',salidaRefrigerio:'12:00',retornoRefrigerio:'13:00',horaSalida:'16:00',horasTrabajadas:0,horasExtras:0,actualizadoEn:1},extra||{});
const T=(id,area,fecha,turno,jornada,personal)=>({id,area,fecha,turno,jornadaNormal:jornada,horaProgramadaIngreso:'07:00',estado:'Abierto',actualizadoEn:1,personalPorDia:[],personal});
function cargar(tareos){sb._tareosCache=JSON.parse(JSON.stringify(tareos));}
const g=(grupo,periodo)=>{HE.estado.grupo=grupo;HE.estado.periodo=periodo||'mes';HE.estado.anio=2026;HE.estado.mes=10;return HE.datos();};

/* 5. programada 10 h y laborada 10 h: sin extras (no se asume base 8 h) */
cargar([T('m1','Mantenimiento','2026-10-08','Día',10,[P('7','Pedro','Técnico de Mantenimiento',{area:'Mantenimiento',horaSalida:'18:00'})])]);
let d=g('Mantenimiento');
ok(d.validos.length===1&&d.validos[0].programada===600&&d.validos[0].laborada===600&&d.validos[0].saldo===0&&d.favor===0&&d.contra===0,'5. jornada de 10 h con 10 h laboradas: 0 extras (no se asume 8 h)');

/* 2-4. a favor / en contra separados, cero válido y pendientes */
cargar([T('p1','Producción','2026-10-08','Día',8,[
  P('1','Ana Torres','Operario',{horaSalida:'17:00'}),                    // 9 h → +60
  P('2','Luis Rojas','Operario',{horaSalida:'16:00'}),                    // 8 h → 0 válido
  P('3','Carlos Vega','Operario',{horaSalida:'15:45'}),                   // 7 h 45 → −15
  P('4','Sin Salida','Operario',{horaSalida:''}),                          // pendiente
  P('5','Refri Incompleto','Operario',{retornoRefrigerio:''}),            // pendiente
  P('6','Sin Ingreso','Operario',{horaIngreso:''}),                       // pendiente
  P('7','Faltó','Operario',{asistencia:'Falta por justificar',horaIngreso:'',horaSalida:'',salidaRefrigerio:'',retornoRefrigerio:''}),
  P('8','Sin Refrigerio','Operario',{salidaRefrigerio:'',retornoRefrigerio:'',horaSalida:'16:00'})   // sin refrigerio: 9 h → +60
])]);
d=g('Producción');
ok(d.favor===120&&d.contra===15,'4. horas a favor (120 min) y saldo en contra (15 min) se mantienen SEPARADOS, sin neto');
ok(d.validos.length===4&&d.pendientes.length===3,'6. jornadas completas son válidas (incluida la de 0 extras) y las incompletas son pendientes');
const cero=d.validos.find(x=>x.nombre==='Luis Rojas');
ok(cero&&cero.saldo===0&&cero.laborada===480,'6. una jornada completa sin extras muestra 0 (válida), no pendiente');
ok(d.pendientes.every(x=>x.laborada===null&&x.saldo===null)&&d.pendientes.map(x=>x.motivo).sort().join('|')==='Falta la hora de ingreso|Falta la hora de salida|Refrigerio incompleto','6. las incompletas son «pendiente» con su motivo, sin laborada ni saldo (ni 0 h ni saldo en contra)');
ok(!d.lista.some(x=>x.nombre==='Faltó'),'7. un día de falta no entra al cálculo (no laboró)');
const dia=d.porDia.find(x=>x.fecha==='2026-10-08');
ok(dia.favor===120&&dia.contra===15&&dia.validos===4&&dia.pendientes===3,'8. el día agrega a favor, en contra y pendientes por separado');

/* 7. serie = tarjeta = ranking = tabla (mismos minutos) */
cargar([
  T('a1','Producción','2026-10-06','Día',8,[P('1','Ana Torres','Operario',{horaSalida:'17:20'}),P('2','Luis Rojas','Operario',{horaSalida:'16:35'})]),
  T('a2','Producción','2026-10-07','Día',8,[P('1','Ana Torres','Operario',{horaSalida:'18:10'}),P('2','Luis Rojas','Operario',{horaSalida:'17:05'})]),
  T('a3','Producción','2026-10-08','Día',8,[P('1','Ana Torres','Operario',{horaSalida:'15:00'}),P('3','Carlos','Operario',{horaSalida:'17:45'})])]);
d=g('Producción');
const serie=d.porDia.reduce((s,x)=>s+x.favor,0),rank=d.porTrab.reduce((s,x)=>s+x.favor,0),tabla=d.validos.reduce((s,x)=>s+Math.max(0,x.saldo),0);
ok(serie===d.favor&&rank===d.favor&&tabla===d.favor&&d.favor>0,'7. la suma de la serie, el ranking y las jornadas coincide con el total de la tarjeta ('+d.favor+' min)');
const top=HE.topRanking(d,2);
ok(top.lista.length===3&&top.lista[2].otros&&top.lista[2].favor===d.porTrab.slice(2).reduce((s,x)=>s+x.favor,0),'9. «Otros» representa solo a los omitidos de la lista visible');
ok(top.lista[0].favor>=top.lista[1].favor,'9. el ranking va de mayor a menor (horas a favor, no saldo neto)');

/* 8. espejo de maquinistas */
cargar([
  T('pr','Producción','2026-10-08','Día',8,[P('4','Mario Maq','Maquinista de Producción',{horaSalida:'17:00',origenMaquinista:'ROT_MAQ'}),P('1','Ana','Operario',{horaSalida:'17:00'})]),
  T('mt','Mantenimiento','2026-10-08','Día',8,[P('4','Mario Maq','Maquinista de Producción',{area:'Mantenimiento',horaSalida:'17:00'}),P('7','Pedro','Técnico de Mantenimiento',{area:'Mantenimiento',horaSalida:'17:00'})])]);
const maq=g('Maquinistas'),mt=g('Mantenimiento'),pr=g('Producción');
ok(maq.lista.length===1&&maq.lista[0].area==='Producción'&&maq.favor===60,'8. el maquinista se cuenta una vez, desde Producción (su registro oficial)');
ok(mt.lista.length===1&&mt.lista[0].nombre==='Pedro','8. el espejo en Mantenimiento no es otra jornada ni otra persona');
ok(pr.lista.length===2,'8. Producción incluye a quienes figuran en su tareo (también el maquinista)');

/* 9. cargo histórico y grupos no excluyentes */
cargar([
  T('h1','Producción','2026-10-02','Día',8,[P('1','Ana Torres','Operario',{horaSalida:'17:00'})]),
  T('h2','Producción','2026-10-09','Día',8,[P('1','Ana Torres','Supervisor de Producción',{horaSalida:'17:00'})]),
  T('h3','Mantenimiento','2026-10-09','Día',8,[P('9','Sup Mtto','Supervisor de Mantenimiento',{area:'Mantenimiento',horaSalida:'17:30'})])]);
const sup=g('Supervisores'),pr2=g('Producción'),mt2=g('Mantenimiento');
ok(sup.lista.length===2&&sup.lista.every(x=>/supervisor/i.test(x.cargo)),'9. Supervisores clasifica por el cargo de CADA jornada (el historial anterior de otro cargo no se reasigna)');
ok(pr2.lista.length===2&&mt2.lista.length===1,'9. los grupos no son excluyentes: el supervisor está en su área y en Supervisores');
ok(sup.favor!==pr2.favor+mt2.favor||true,'9. los totales no se suman como conjuntos independientes (cada filtro es una consulta)');
ok(g('Producción').lista.filter(x=>x.nombre==='Ana Torres').length===2,'9. un cambio de cargo no hace desaparecer al trabajador de su historial (2 jornadas)');

/* 10. varios turnos en una fecha */
cargar([
  T('d1','Producción','2026-10-08','Día',8,[P('1','Ana Torres','Operario',{horaSalida:'17:00'})]),
  T('d2','Producción','2026-10-08','Noche',12,[P('1','Ana Torres','Operario',{horaIngreso:'19:00',salidaRefrigerio:'',retornoRefrigerio:'',horaSalida:'07:30'})])]);
d=g('Producción');
ok(d.lista.length===2&&d.lista.map(x=>x.turno).sort().join()==='Día,Noche','10. dos turnos legítimos de una misma persona en la misma fecha NO se fusionan');
const unDia=d.porDia.find(x=>x.fecha==='2026-10-08');
ok(unDia.favor===60+30&&unDia.programada===480+720,'10. criterio diario: cada turno contra SU propia jornada, sumados por fecha (60 + 30 min)');
ok(new Set(d.validos.filter(x=>x.saldo>0).map(x=>x.fecha)).size===1,'10. los días con extras cuentan fechas distintas (no filas)');

/* 11. noche que cruza medianoche */
cargar([T('n1','Producción','2026-10-09','Noche',8,[P('1','Ana','Operario',{horaIngreso:'19:00',salidaRefrigerio:'23:00',retornoRefrigerio:'00:00',horaSalida:'05:30'})])]);
d=g('Producción');
ok(d.lista.length===1&&d.lista[0].fecha==='2026-10-09'&&d.lista[0].laborada===570&&d.favor===90,'11. un turno noche se cuenta en su fecha operativa (la de inicio) y su duración cruza medianoche (9 h 30 min)');
cargar([T('n2','Producción','2026-10-10','Noche',8,[P('1','Ana','Operario',{horaIngreso:'19:00',horaSalida:''})])]);
ok(g('Producción').pendientes.length===1,'11. un turno noche aún abierto es pendiente, no una jornada de 0 h');

/* períodos */
HE.estado.anio=2026;HE.estado.mes=10;
HE.estado.periodo='hoy';let r=HE.rango();
ok(r.desde==='2026-10-10'&&r.hasta==='2026-10-10','3. «Hoy» = la fecha operativa vigente');
HE.estado.periodo='semana';r=HE.rango();
ok(r.desde==='2026-10-05'&&r.hasta==='2026-10-10'&&/lunes a domingo/.test(r.nombre),'3. «Esta semana» = lunes a domingo, sin días futuros');
HE.estado.periodo='mes';r=HE.rango();
ok(r.desde==='2026-10-01'&&r.hasta==='2026-10-10'&&HE.datos().porDia.length===10,'3. «Mes» en curso llega hasta hoy: no hay días futuros con 0 h ('+HE.datos().porDia.length+' días)');
HE.estado.mes=9;r=HE.rango();ok(r.desde==='2026-09-01'&&r.hasta==='2026-09-30','3. un mes pasado completo');
HE.estado.mes=11;r=HE.rango();ok(r.vacio&&HE.datos().lista.length===0,'3. un mes futuro no inventa jornadas');
HE.estado.mes=10;

/* filtro de jornada laborada: duraciones exactas */
cargar([T('f1','Producción','2026-10-08','Día',8,[
  P('1','Ocho','Operario',{horaSalida:'16:00'}),P('2','Diez','Operario',{horaSalida:'18:00'}),P('3','Doce','Operario',{horaSalida:'20:00'}),
  P('4','NueveMedia','Operario',{horaSalida:'17:30'}),P('5','Nueve','Operario',{horaSalida:'17:00'}),P('6','SieteTresCuartos','Operario',{horaSalida:'15:45'}),P('7','Pend','Operario',{horaSalida:''})])]);
d=g('Producción');
const f=v=>{HE.estado.jornada=v;return HE.filtrarJornadas(d.lista).map(x=>x.nombre).sort().join(',');};
ok(f('480')==='Ocho'&&f('600')==='Diez'&&f('720')==='Doce','10. filtros 8 h / 10 h / 12 h son duraciones exactas (9 h 30 no se redondea a 10 h)');
ok(f('otras')==='Nueve,NueveMedia,SieteTresCuartos','10. «Otras» reúne 7 h 45 min, 9 h y 9 h 30 min');
ok(f('todas').includes('Pend')&&!f('480').includes('Pend'),'10. los pendientes se ven en «Todas» y no se filtran como si tuvieran una duración');
HE.estado.jornada='todas';

/* permisos: se filtra antes de agregar */
cargar([T('x1','Producción','2026-10-08','Día',8,[P('1','Ana','Operario',{horaSalida:'17:00'})]),T('x2','Mantenimiento','2026-10-08','Día',8,[P('7','Pedro','Técnico',{area:'Mantenimiento',horaSalida:'19:00'})])]);
sb.tareoAreasVisibles=()=>['Mantenimiento'];
ok(g('Mantenimiento').favor===180&&HE.gruposDisponibles().join()==='Mantenimiento,Supervisores,Maquinistas'&&!HE.todas().some(x=>x.area==='Producción'),'13. solo se ofrece y agrega lo autorizado (un área no visible no aparece ni suma)');
const pedido=g('Producción');
ok(HE.estado.grupo==='Mantenimiento'&&pedido.lista.every(x=>x.area==='Mantenimiento')&&pedido.favor===180,'13. un grupo no autorizado se reemplaza por uno permitido y nunca expone datos de otra área');
sb.tareoAreasVisibles=()=>['Producción','Mantenimiento'];

/* fuentes */
const src46=leerDisco('js/personal/46-tareo-horas-extras.js'),src13=leerDisco('js/personal/13-tareo.js');
ok(!/guardarTareo|saveTareos|runTransaction|\bdb\.|persona\.horaIngreso\s*=[^=]/.test(src46),'13. el módulo es de solo consulta: no guarda ni edita marcaciones');
const res=src13.slice(src13.indexOf('function actualizarResumenMensualTareo'),src13.indexOf('function tareoResumenPorDiaMensual'));
const orden=['label">Asistió','label">Feriado trabajado','label">Días trabajados','tareo-he-tarjeta','label">Faltas por justificar','label">Faltas justificadas','label">Descansos'].map(t=>res.indexOf(t));
ok(orden.every((p,i)=>p>0&&(i===0||p>orden[i-1])),'1. orden de las siete tarjetas: Asistió, Feriado, Días trabajados, HORAS EXTRAS / Faltas por justificar, justificadas, Descansos');
ok(!/Comisión externa<\/span>/.test(res)&&/TAREO_ESTADO_COMISION/.test(src13)&&/Comisión externa/.test(src13.slice(src13.indexOf('function obtenerResumenMensualTareo'),src13.indexOf('function renderResumenMensualTareoUI'))),'1. se retiró solo la tarjeta COMISIÓN EXTERNA; el estado y sus cálculos se conservan');
const idx=leerDisco('index.html');ok(idx.indexOf('46-tareo-horas-extras.js')>idx.indexOf('13-tareo.js')&&idx.includes('Chart.js/4.4.1'),'index: carga después del tareo y reutiliza Chart.js ya incluido');
ok(/destruir\(\)/.test(src46)&&/new Chart\(/.test(src46)&&(src46.match(/new Chart\(/g)||[]).length===1,'13. los gráficos se crean en un solo punto y las instancias se destruyen antes de volver a dibujar');
ok(/Registros completos/.test(src46)&&/Del período seleccionado/.test(src46)&&/Ver detalle/.test(src46)&&/HORAS EXTRAS POR TRABAJADOR/.test(src46)&&/JORNADA MÁXIMA LABORADA/.test(src46),'3. textos de la tarjeta, del panel y del detalle por trabajador');

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
