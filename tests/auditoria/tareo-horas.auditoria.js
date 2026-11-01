/* AUDITORÍA de las horas del tareo: reproduce con las funciones reales (13-tareo.js y 46-tareo-horas-extras.js) los casos que hoy salen mal
   en los datos de producción (octubre 2026). Cada ✘ es una falla confirmada; cuando se corrija, todas deben salir ✔.
   Uso: node tests/auditoria/tareo-horas.auditoria.js  (no forma parte de la suite rápida: hoy FALLA a propósito) */
const vm=require('vm');
const {cargarCliente,crearNube,leerDisco}=require('../tareo-harness.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};

const cli=cargarCliente(crearNube({}),{});const sb=cli.sb;
sb.GlacialIndicadores={diaOperativo:()=>'2026-10-10'};sb.tareoAreasVisibles=()=>['Producción','Mantenimiento'];
vm.runInContext(leerDisco('js/personal/46-tareo-horas-extras.js'),sb,{filename:'46.js'});
const HE=sb.TareoHE;
const ev=c=>vm.runInContext(c,sb);
const persona=(extra)=>Object.assign({nombre:'Prueba',dni:'1',asistencia:'Asistió',horaIngreso:'07:00',horaSalida:'17:00',salidaRefrigerio:'12:00',retornoRefrigerio:'13:00',refrigerio:1,horasTrabajadas:0,horasExtras:0,tardanzaMinutos:0},extra||{});
const tareo=(turno,prog)=>({jornadaNormal:8,turno,horaProgramadaIngreso:prog||(turno==='Noche'?'22:00':'07:00')});
const calc=(p,t)=>{sb.__p=p;sb.__t=t;ev('recalcularPersonaTareo(__p,__t)');return p;};

/* ---- controles: lo que ya funciona ---- */
let p=calc(persona(),tareo('Día'));
ok(p.horasTrabajadas===9&&p.horasExtras===1,'control: 07:00–17:00 con 1 h de refrigerio = 9 h y 1 h extra');
p=calc(persona({horaIngreso:'22:00',horaSalida:'07:00',salidaRefrigerio:'01:00',retornoRefrigerio:'02:00'}),tareo('Noche'));
ok(p.horasTrabajadas===8&&p.horasExtras===0,'control: turno noche que cruza la medianoche (22:00–07:00, 1 h refrigerio) = 8 h');

/* ---- FALLA 1: horas imposibles aceptadas (casos reales: 21,5 h y 22 h en un solo turno) ---- */
p=calc(persona({horaIngreso:'10:00',horaSalida:'07:30',salidaRefrigerio:'',retornoRefrigerio:''}),tareo('Noche'));
ok(!(p.horasTrabajadas>16)||p.alerta||p.horasSospechosas,'1. ingreso 10:00 y salida 07:30 en turno Noche NO debe dar 21,5 h como si fuera normal (hoy lo acepta sin avisar)');
p=calc(persona({horaIngreso:'00:00',horaSalida:'22:00',salidaRefrigerio:'',retornoRefrigerio:''}),tareo('Día'));
ok(!(p.horasTrabajadas>16)||p.alerta||p.horasSospechosas,'1b. ingreso 00:00 y salida 22:00 (22 h, hora de ingreso puesta por defecto) debe marcarse como sospechoso');

/* ---- FALLA 2: refrigerio absurdo (caso real: 5 horas) ---- */
p=calc(persona({horaIngreso:'07:00',horaSalida:'19:00',salidaRefrigerio:'07:00',retornoRefrigerio:'12:00'}),tareo('Día'));
ok(p.refrigerio<=2||p.alerta||p.horasSospechosas,'2. un refrigerio de 5 horas (07:00–12:00) no debe aceptarse en silencio (hoy resta 5 h)');

/* ---- FALLA 3: salida sin ingreso (caso real: 3 personas «Asistió» con salida y sin ingreso) ---- */
p=calc(persona({horaIngreso:'',horaSalida:'09:00',salidaRefrigerio:'',retornoRefrigerio:''}),tareo('Noche'));
ok(p.alerta||p.horasSospechosas||p.pendiente,'3. salida registrada sin hora de ingreso debe quedar marcada (hoy da 0 h sin aviso)');

/* ---- FALLA 4: dos cálculos distintos deben dar lo mismo ---- */
{const t=Object.assign(tareo('Día'),{id:'t1',area:'Producción',fecha:'2026-10-08',estado:'Abierto',actualizadoEn:1,personalPorDia:[]});
 const pr=persona({horaIngreso:'07:00',horaSalida:'18:04',trabajadorId:'9',cargo:'Operario',area:'Producción'});calc(pr,t);t.personal=[pr];
 sb._tareosCache=JSON.parse(JSON.stringify([t]));HE.estado.grupo='Producción';HE.estado.periodo='mes';HE.estado.anio=2026;HE.estado.mes=10;
 const d=HE.datos(),f=(d.validos||[])[0];
 ok(f&&Math.abs(f.laborada/60-pr.horasTrabajadas)<0.01,'4. Horas laboradas del módulo de horas extras = horas trabajadas del tareo (07:00–18:04 con 1 h: 10,07 h)');
 ok(f&&Math.abs(f.saldo/60-pr.horasExtras)<0.01,'4b. Saldo de horas extras del módulo = horas extras del tareo ('+(f?f.saldo/60:'—')+' h contra '+pr.horasExtras.toFixed(2)+' h)');
}

/* ---- FALLA 5: ingreso sin salida no puede contar como 0 h «normal» en el resumen ---- */
{const t=Object.assign(tareo('Día'),{id:'t2',area:'Producción',fecha:'2026-10-09',estado:'Abierto',actualizadoEn:1,personalPorDia:[]});
 const pr=persona({horaIngreso:'07:00',horaSalida:'',salidaRefrigerio:'',retornoRefrigerio:'',trabajadorId:'8',cargo:'Operario',area:'Producción'});calc(pr,t);t.personal=[pr];
 sb._tareosCache=JSON.parse(JSON.stringify([t]));HE.estado.grupo='Producción';
 const d=HE.datos();
 ok((d.pendientes||[]).length===1&&/salida/i.test(((d.pendientes||[])[0]||{}).motivo||''),'5. quien tiene ingreso y no salida aparece como PENDIENTE «Falta la hora de salida» (no como 0 h)');
}

console.log(fallas?'\n'+fallas+' fallas confirmadas':'\ntodo correcto');
process.exit(fallas?1:0);
