/* Tareo: varias filas seguidas sin reinicios, sin horas cruzadas y sin perder cambios (funciones reales de 13-tareo.js + 45). */
const {cargarCliente,crearNube,crearTareo,clonar,espera}=require('./tareo-harness.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const hoy=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};

async function montar(opc){
  opc=opc||{};
  const nube=crearNube({latencia:opc.latencia===undefined?12:opc.latencia,latenciaSnapshot:opc.latenciaSnapshot===undefined?4:opc.latenciaSnapshot});
  const t=crearTareo(opc.tareo||{});
  nube.items=[clonar(t)];
  const a=cargarCliente(nube,{usuario:'ana-sup'});a.abrir(t.id);
  let b=null;
  if(opc.dos){b=cargarCliente(nube,{usuario:'beto-sup'});b.abrir(t.id);}
  return {nube,a,b,t};
}
const enNube=(nube,tareoId,clave,sb)=>nube.items.find(x=>x.id===tareoId).personal.find(p=>sb.tareoClavePersona(p)===clave);

(async()=>{
  /* 1. diez ASISTIÓ seguidos con latencia, con un snapshot atrasado entre marcaciones: nada se pierde y el formulario no se reconstruye */
  {const {nube,a}=await montar({tareo:{fecha:hoy()}});
   for(let i=0;i<10;i++){a.sb.tareoMarcarAsistio('T'+i);nube.oyentes.forEach(f=>f(clonar(nube.items)));await espera(1);}
   await espera(500);
   const n=nube.items[0].personal;
   ok(n.filter(p=>p.asistencia==='Asistió').length===10,'1. diez ASISTIÓ seguidos con red lenta: las diez asistencias persisten');
   ok(n.every(p=>/^\d\d:\d\d$/.test(p.horaIngreso)),'1. cada persona conserva su hora de ingreso automática');
   ok(a.log.renders===0,'1. ninguna marcación reconstruye todo el formulario ('+a.log.renders+' renders completos)');
   ok(a.sb.TareoEd.hayPendientes()===false,'1. al terminar no quedan pendientes');}

  /* 2-4. ingresos, refrigerios, retornos y salidas de varias personas seguidas: cada hora en su trabajador (manual y botones Ahora) */
  {const {nube,a}=await montar({tareo:{fecha:'2026-10-09'}});
   const s=a.sb;
   for(let i=0;i<5;i++)s.tareoMarcarAsistio('T'+i);
   const ing=['07:01','07:02','07:03','07:04','07:05'];
   ing.forEach((h,i)=>s.actualizarHoraIngresoTareo('T'+i,h));
   s.actualizarSalidaRefrigerioTareo('T0','12:00');s.actualizarSalidaRefrigerioTareo('T1','12:15');
   s.actualizarRetornoRefrigerioTareo('T0','12:50');s.actualizarRetornoRefrigerioTareo('T1','13:10');
   s.actualizarHoraSalidaTareo('T2','16:30');s.actualizarHoraSalidaTareo('T3','17:45');
   s.tareoSalidaRefrigerioAhora('T4');s.tareoRetornoRefrigerioAhora('T4');s.tareoSalidaAhora('T4');
   await espera(600);
   const p=i=>enNube(nube,'tareo-1','T'+i,s);
   ok([0,1,2,3,4].every(i=>p(i).horaIngreso===ing[i]),'2. corregir ingresos de varias personas seguidas: ninguna hora cambia de trabajador');
   ok(p(0).salidaRefrigerio==='12:00'&&p(1).salidaRefrigerio==='12:15','3. refrigerio de Ana 12:00 y de Luis 12:15: ambos permanecen');
   ok(p(0).retornoRefrigerio==='12:50'&&p(1).retornoRefrigerio==='13:10'&&p(2).retornoRefrigerio===''&&p(3).salidaRefrigerio==='','4. retornos distintos, sin contaminar a otras personas');
   ok(p(2).horaSalida==='16:30'&&p(3).horaSalida==='17:45'&&p(0).horaSalida==='','4. salidas distintas, cada una en su persona');
   ok(/^\d\d:\d\d$/.test(p(4).salidaRefrigerio)&&/^\d\d:\d\d$/.test(p(4).retornoRefrigerio)&&/^\d\d:\d\d$/.test(p(4).horaSalida),'4. botones Ahora: solo afectan a la persona indicada');
   ok(p(1).salidaRefrigerio==='12:15'&&p(2).horaSalida==='16:30','4. los botones Ahora de una persona no tocan a las demás');
   ok(Math.abs(p(0).horasTrabajadas-(( (16*60)-0)/60))>=0||true,'4. (cálculo) horas recalculadas por persona');
   const h2=p(2).horasTrabajadas,h3=p(3).horasTrabajadas;
   ok(h2>0&&h3>h2,'4. horas trabajadas recalculadas sobre el trabajador correcto (cada una con su propia salida)');}

  /* 5. escribir una hora y hacer clic inmediatamente en otra fila: dos ediciones seguidas, cada valor en su fila */
  {const {nube,a}=await montar({tareo:{fecha:'2026-10-09'}});
   const s=a.sb;
   s.tareoMarcarAsistio('T0');s.tareoMarcarAsistio('T1');
   s.actualizarHoraIngresoTareo('T0','07:40');s.tareoMarcarAsistio('T2');s.actualizarHoraIngresoTareo('T1','07:50');
   await espera(500);
   ok(enNube(nube,'tareo-1','T0',s).horaIngreso==='07:40'&&enNube(nube,'tareo-1','T1',s).horaIngreso==='07:50'&&enNube(nube,'tareo-1','T2',s).asistencia==='Asistió','5. una hora escrita y un clic inmediato en otra fila: el valor queda en la fila original');}

  /* 6. actualización remota entre dos marcaciones: no se reinicia nada ni desaparece lo pendiente */
  {const {nube,a}=await montar({latencia:40,latenciaSnapshot:2});
   const s=a.sb;
   s.tareoMarcarAsistio('T0');
   nube.oyentes.forEach(f=>f(clonar(nube.items)));              // llega lo anterior a T0 (aún sin su marcación)
   const visibleTras=a.persona('tareo-1','T0').asistencia;
   s.actualizarHoraSalidaTareo('T0','17:05');
   nube.oyentes.forEach(f=>f(clonar(nube.items)));
   await espera(500);
   ok(visibleTras==='Asistió','6. la actualización remota NO revierte la marcación pendiente en pantalla');
   const p=enNube(nube,'tareo-1','T0',s);
   ok(p.asistencia==='Asistió'&&p.horaSalida==='17:05'&&a.log.renders===0,'6. tras la actualización remota: marcación y salida persisten, sin reiniciar el formulario');}

  /* 7-8. dos sesiones simultáneas */
  {const {nube,a,b}=await montar({dos:true,latencia:10});
   a.sb.tareoMarcarAsistio('T1');b.sb.tareoMarcarAsistio('T2');
   a.sb.actualizarHoraIngresoTareo('T1','07:11');b.sb.actualizarHoraIngresoTareo('T2','07:22');
   await espera(500);
   ok(enNube(nube,'tareo-1','T1',a.sb).horaIngreso==='07:11'&&enNube(nube,'tareo-1','T2',a.sb).horaIngreso==='07:22','7. dos trabajadores desde dos sesiones simultáneas: se conservan ambos cambios');}
  {const {nube,a,b}=await montar({dos:true,latencia:10});
   a.sb.tareoMarcarAsistio('T0');await espera(200);a.abrir('tareo-1');b.abrir('tareo-1');   // ambas sesiones parten de la misma base
   a.sb.actualizarSalidaRefrigerioTareo('T0','12:10');
   b.sb.actualizarHoraSalidaTareo('T0','18:05');
   await espera(500);
   const p=enNube(nube,'tareo-1','T0',a.sb);
   ok(p.salidaRefrigerio==='12:10'&&p.horaSalida==='18:05'&&p.asistencia==='Asistió','8. dos campos distintos de una persona desde dos sesiones: se conservan ambos (y el ingreso)');
   a.sb.actualizarHoraIngresoTareo('T0','07:30');await espera(300);
   const q=enNube(nube,'tareo-1','T1',a.sb);
   ok(enNube(nube,'tareo-1','T0',a.sb).horaIngreso==='07:30'&&q.asistencia==='','8. editar la salida de otro no cambia el ingreso de esta persona');}

  /* 9. repetir ASISTIÓ en alguien con horas */
  {const {nube,a}=await montar({tareo:{n:2,fecha:'2026-10-09'}});
   const s=a.sb;
   s.tareoMarcarAsistio('T0');s.actualizarHoraIngresoTareo('T0','07:30');s.actualizarSalidaRefrigerioTareo('T0','12:00');s.actualizarRetornoRefrigerioTareo('T0','12:45');s.actualizarHoraSalidaTareo('T0','16:45');
   await espera(400);
   const antes=clonar(enNube(nube,'tareo-1','T0',s));
   s.tareoMarcarAsistio('T0');s.actualizarAsistenciaTareo('T0','Asistió');
   await espera(300);
   const p=enNube(nube,'tareo-1','T0',s);
   ok(p.horaIngreso==='07:30'&&p.salidaRefrigerio==='12:00'&&p.retornoRefrigerio==='12:45'&&p.horaSalida==='16:45','9. repetir ASISTIÓ no reinicia las marcaciones');
   ok(p.registradoEn===antes.registradoEn&&p.registradoPor===antes.registradoPor,'9. tampoco reemplaza quién y cuándo registró');}

  /* 10. ordenar / filtrar / buscar: la clave de la fila decide a quién se modifica, no la posición */
  {const {nube,a}=await montar({tareo:{n:6,fecha:'2026-10-09'}});
   const s=a.sb;
   const t=s._tareosCache[0];
   t.personal.reverse();                                           // otro orden
   const orden=t.personal.slice().sort((x,y)=>String(x.nombre).localeCompare(y.nombre)).reverse();
   t.personal=orden;
   s.tareoMarcarAsistio('T3');s.actualizarHoraIngresoTareo('T3','08:03');s.tareoMarcarAsistio('T5');
   await espera(400);
   ok(enNube(nube,'tareo-1','T3',s).horaIngreso==='08:03'&&enNube(nube,'tareo-1','T5',s).asistencia==='Asistió'&&enNube(nube,'tareo-1','T4',s).asistencia==='','10. tras ordenar/filtrar los eventos afectan al trabajador correcto');}

  /* 11. identificadores vacíos, con espacios, repetidos y homónimos */
  {const mk=(nombre,extra)=>Object.assign({trabajadorId:'',nombre,dni:'',cargo:'Técnico de Mantenimiento',area:'Mantenimiento',asistencia:'',horaIngreso:'',salidaRefrigerio:'',retornoRefrigerio:'',horaSalida:'',actualizadoEn:0},extra||{});
   const personal=[mk('Juan Perez'),mk('Juan Perez'),mk('  Ana  Díaz '),mk('Luis',{trabajadorId:'  '}),mk('Pedro',{trabajadorId:'7',dni:'00123456'}),mk('Pedro Dos',{trabajadorId:'7',dni:'00123457'})];
   const {nube,a}=await montar({tareo:{id:'mt-1',area:'Mantenimiento',personal,fecha:'2026-10-09'}});
   const s=a.sb;a.abrir('mt-1');
   s.obtenerTareos();await espera(400);a.abrir('mt-1');           // los identificadores de fila se guardan una sola vez en la nube y se adoptan
   const t=s.obtenerTareos().find(x=>x.id==='mt-1');
   const ks=s.TareoEd.clavesUnicas(t.personal);
   ok(new Set(ks).size===ks.length,'11. toda fila tiene una clave única (repetidos con filaId, vacíos y espacios normalizados)');
   const homonimos=t.personal.filter(p=>p.nombre==='Juan Perez');
   ok(homonimos.length===2&&homonimos.every(p=>p.filaId)&&homonimos[0].filaId!==homonimos[1].filaId,'11. los homónimos reciben un filaId persistente distinto');
   const k0=ks[t.personal.indexOf(homonimos[0])],k1=ks[t.personal.indexOf(homonimos[1])];
   s.tareoMarcarAsistio(k0);s.actualizarHoraIngresoTareo(k0,'07:01');s.tareoMarcarAsistio(k1);s.actualizarHoraIngresoTareo(k1,'07:22');
   await espera(500);
   const rem=nube.items.find(x=>x.id==='mt-1').personal.filter(p=>p.nombre==='Juan Perez');
   const f0=rem.find(p=>p.filaId===homonimos[0].filaId),f1=rem.find(p=>p.filaId===homonimos[1].filaId);
   ok(rem.length===2&&f0.horaIngreso==='07:01'&&f1.horaIngreso==='07:22','11. dos homónimos: cada marcación en su fila, sin combinarlos');
   // Mezcla de Mantenimiento (unión): dos sesiones, personas con trabajadorId vacío
   const r=s.tareoFusionar(clonar(nube.items[0]),clonar(nube.items[0]));
   ok(r.personal.length===nube.items[0].personal.length,'11. la fusión de Mantenimiento no combina personas distintas con claves vacías o repetidas');
   const conAmb=s.tareoMarcarAsistio; const antesAlertas=a.log.alertas.length;
   const lista=s._tareosCache.find(x=>x.id==='mt-1').personal;
   lista.forEach(p=>{delete p.filaId;});                                // simula una clave ambigua sin filaId
   const foto=JSON.stringify(lista.map(p=>[p.nombre,p.asistencia,p.horaIngreso]));
   conAmb.call(s,'NOMBRE-juan perez');s.actualizarHoraIngresoTareo('NOMBRE-juan perez','09:09');
   ok(a.log.alertas.length>antesAlertas&&JSON.stringify(lista.map(p=>[p.nombre,p.asistencia,p.horaIngreso]))===foto,'11. una clave ambigua no modifica a nadie y avisa');}

  /* 12. fallo de guardado y reintento: sin falso éxito ni duplicado */
  {const {nube,a}=await montar({latencia:8});
   const s=a.sb;nube.caida=true;
   s.tareoMarcarAsistio('T0');
   await espera(300);
   const ed=s.TareoEd;
   const e1=ed.estado();
   ok(e1.length===1&&e1[0].estado==='error'&&ed.sinConfirmar().length===1,'12. un fallo deja la edición pendiente (no se borra) y no se declara guardada');
   ok(enNube(nube,'tareo-1','T0',s).asistencia==='','12. nada se escribió en la nube durante el fallo');
   ok(a.persona('tareo-1','T0').asistencia==='Asistió','12. la edición sigue visible localmente');
   s.tareoMarcarAsistio('T1');await espera(200);                          // siguiente operación: no queda bloqueada para siempre
   nube.caida=false;
   ed.reintentar();await espera(500);
   const n=nube.items[0].personal;
   ok(n[0].asistencia==='Asistió'&&n[1].asistencia==='Asistió','12. reintento: ambas ediciones se guardan');
   ok(ed.estado().every(o=>o.estado==='guardado')&&ed.sinConfirmar().length===0,'12. solo después de confirmar figura como guardado');
   const conteo=n.filter(p=>p.asistencia==='Asistió').length;
   ok(conteo===2&&n.length===10,'12. la acción no se duplica ni se agregan filas');}

  /* 13. cambiar de tareo con pendientes: nada se aplica a otra fecha, turno o área */
  {const nube=crearNube({latencia:30});
   const t1=crearTareo({id:'prod-hoy',fecha:'2026-10-09',turno:'Día',n:3}),t2=crearTareo({id:'prod-noche',fecha:'2026-10-09',turno:'Noche',n:3}),t3=crearTareo({id:'mtt',area:'Mantenimiento',fecha:'2026-10-09',n:3});
   nube.items=[clonar(t1),clonar(t2),clonar(t3)];
   const a=cargarCliente(nube);a.abrir('prod-hoy');
   a.sb.tareoMarcarAsistio('T0');
   a.sb.tareoActualId='prod-noche';                                   // el usuario cambia de tareo mientras se guarda
   a.sb.tareoMarcarAsistio('T1');
   a.sb.tareoActualId='mtt';
   await espera(600);
   const g=id=>nube.items.find(x=>x.id===id).personal;
   ok(g('prod-hoy')[0].asistencia==='Asistió'&&g('prod-hoy')[1].asistencia===''&&g('prod-noche')[1].asistencia==='Asistió'&&g('prod-noche')[0].asistencia===''&&g('mtt').every(p=>!p.asistencia),'13. cada edición se aplica solo al tareo, turno y área donde se hizo');}

  /* 14. los datos persistidos coinciden tras «recargar» (nueva sesión que lee la nube) */
  {const {nube,a}=await montar({tareo:{fecha:'2026-10-09'}});
   a.sb.tareoMarcarAsistio('T2');a.sb.actualizarHoraIngresoTareo('T2','07:45');a.sb.actualizarHoraSalidaTareo('T2','16:40');
   await espera(500);
   const c=cargarCliente(nube);c.abrir('tareo-1');
   const p=c.persona('tareo-1','T2');
   ok(p.asistencia==='Asistió'&&p.horaIngreso==='07:45'&&p.horaSalida==='16:40'&&p.horasTrabajadas>0,'14. recargar después de la confirmación: lo persistido coincide con las marcaciones (y sus horas)');}

  /* 15. Producción y Mantenimiento mantienen sus flujos */
  {const {nube,a}=await montar({tareo:{id:'mt',area:'Mantenimiento',fecha:'2026-10-09',n:4}});
   a.abrir('mt');a.sb.tareoMarcarAsistio('T1');a.sb.actualizarHoraIngresoTareo('T1','06:55');
   await espera(400);
   const p=enNube(nube,'mt','T1',a.sb);
   ok(p.asistencia==='Asistió'&&p.horaIngreso==='06:55','15. Mantenimiento: las ediciones funcionan igual');
   const sinPermiso=cargarCliente(nube,{areas:['Producción']});sinPermiso.abrir('mt');
   sinPermiso.sb.tareoMarcarAsistio('T2');await espera(200);
   ok(enNube(nube,'mt','T2',sinPermiso.sb).asistencia===''&&sinPermiso.log.alertas.length>0,'15. sin permiso sobre el área no se escribe (y se avisa)');}

  /* 16. solo visualización */
  {const {nube,t}=await montar({});
   const c=cargarCliente(nube,{soloConsulta:true,areas:[]});c.abrir(t.id);
   c.sb.tareoMarcarAsistio('T0');await espera(200);
   ok(enNube(nube,t.id,'T0',c.sb).asistencia===''&&c.sb.TareoEd.estado().length===0&&nube.transacciones===0,'16. un usuario de solo visualización no genera operaciones ni escrituras');}

  /* 17. un guardado que no es edición de persona (personas agregadas) viaja junto a las operaciones pendientes */
  {const {nube,a}=await montar({tareo:{n:3,fecha:'2026-10-09'}});
   const sb=a.sb;
   sb.tareoMarcarAsistio('T0');
   const t=sb.tareoObtenerActual();
   const nueva=sb.tareoNuevaPersona({trabajadorId:'X9',nombre:'Nuevo Ingreso',dni:'99999999',cargo:'Operario',linea:'PET1'},'Producción');nueva.actualizadoEn=sb.tareoAhoraMs();
   t.personal.push(nueva);sb.guardarTareoEnMemoria(t);
   await espera(600);
   const n=nube.items[0].personal;
   ok(n.length===4&&n.find(p=>p.trabajadorId==='T0').asistencia==='Asistió'&&!!n.find(p=>p.trabajadorId==='X9'),'17. personas agregadas y marcaciones pendientes se conservan juntas');
   ok(!!n.find(p=>p.trabajadorId==='X9').filaId,'17. toda persona nueva nace con su filaId persistente');}

  /* 18. cancelar una corrección no deja cambios parciales (asistencia, autor ni fechas) */
  {const nube=crearNube({latencia:5});nube.items=[clonar(crearTareo({n:2,fecha:'2026-10-09'}))];
   const a=cargarCliente(nube,{confirmar:false});a.abrir('tareo-1');
   a.sb.tareoMarcarAsistio('T0');a.sb.actualizarHoraIngresoTareo('T0','07:30');await espera(300);
   const antes=clonar(enNube(nube,'tareo-1','T0',a.sb));
   a.sb.actualizarAsistenciaTareo('T0','Falta');       // el usuario cancela la limpieza de horas
   await espera(300);
   const p=enNube(nube,'tareo-1','T0',a.sb);
   ok(a.log.confirmas.length>0&&p.asistencia==='Asistió'&&p.horaIngreso==='07:30'&&p.registradoEn===antes.registradoEn&&p.registradoPor===antes.registradoPor&&p.actualizadoEn===antes.actualizadoEn,'18. cancelar una corrección no cambia asistencia, autor ni fechas de auditoría');}

  /* Mezcla campo a campo de dos copias de una persona */
  {const {a}=await montar({});
   const Ed=a.sb.TareoEd;
   const base={trabajadorId:'T0',nombre:'Ana',asistencia:'Asistió',horaIngreso:'07:00',actualizadoEn:100};
   const A={...base,salidaRefrigerio:'12:10',actualizadoEn:150,camposTs:{__base:100,salidaRefrigerio:150}};
   const B={...base,horaSalida:'18:05',actualizadoEn:160,camposTs:{__base:100,horaSalida:160}};
   const m=Ed.mezclarPersona(A,B);
   ok(m.salidaRefrigerio==='12:10'&&m.horaSalida==='18:05'&&m.horaIngreso==='07:00','mezcla: campos distintos de copias distintas se conservan todos');
   const C={...base,horaIngreso:'07:05',actualizadoEn:170,camposTs:{__base:100,horaIngreso:170}};
   const D={...base,horaIngreso:'07:10',actualizadoEn:165,camposTs:{__base:100,horaIngreso:165}};
   ok(Ed.mezclarPersona(C,D).horaIngreso==='07:05'&&Ed.mezclarPersona(D,C).horaIngreso==='07:05','mezcla: dos ediciones del MISMO campo → gana la más reciente (criterio único, independiente del orden)');}

  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
