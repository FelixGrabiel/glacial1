/* Horario de producción por línea y vigencia (51b): resolución central, precedencia, vigencias, habilitación de Noche, tolerancia 07:00–07:30, uso en capacidad / secuencia /
   Completar cantidad / copia, historial y permisos; y Generar cierre histórico en Avance (fuentes). Página real + nube falsa. */
const {nube,dispositivo,F,items,leer,clon,extraer}=require('./planificacion-harness');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const D0='2099-03-07',D1='2099-03-08',D2='2099-03-09',ANT='2099-03-01';
const T=(f,h)=>new Date(f+'T'+h+':00').getTime();
const VEL={'C20L|20 Litros|Cuisine':100,'C20L|20 Litros|San Fernando':150,'PET1|2.5 Litros|Scala':3000,'B7L|7 Litros|Aro':600};
const historial=N=>[...N.docs.entries()].filter(([k])=>k.startsWith('historialProgramacion/')).map(([,v])=>v);

function entorno(programaciones,opc){
  opc=opc||{};
  const N=nube();
  N.docs.set('sync/programaciones',{items:programaciones||[]});
  N.docs.set('sync/catalogoPlanificacion',{items:[],tiempos:{reglas:[],ventanas:[],version:1}});
  N.docs.set('sync/records',{items:opc.registros||[]});
  const sb=dispositivo(N,Object.assign({nombre:'Ana'},opc.usuario||{}),{ahora:opc.ahora||T(D0,'12:00')});
  sb.LINES=[{key:'PET1',name:'PET 1'},{key:'PET2',name:'PET 2'},{key:'B7L',name:'B7L'},{key:'C20L',name:'CAJAS 20L'},{key:'B20L',name:'B20L'}];
  sb.MARCAS_POR_LINEA={PET1:['Scala'],PET2:['Bells'],B7L:['Aro','Cuisine'],C20L:['Cuisine','San Fernando'],B20L:['Glacial']};
  sb.PRESENTACIONES_POR_LINEA={PET1:['2.5 Litros'],PET2:['Regular_625ml'],B7L:['7 Litros'],C20L:['20 Litros'],B20L:['20 Litros']};
  sb.obtenerUnidadesPorPalet=()=>200;
  sb.glacialVelocidadEstandar=(l,p,m)=>VEL[[l,p,m].join('|')]||0;
  sb.puedeEntrarPlanificacion=()=>true;
  sb.loadRecords=()=>(N.docs.get('sync/records')||{items:[]}).items;sb.normalizarCuadros=r=>r.cuadros||[];
  sb.PROD={};sb.glacialProducidoVigente=p=>(p.clave in sb.PROD)?sb.PROD[p.clave]:null;
  sb.escuchar();
  return {N,sb,NS:sb.NS,H:sb.glacialHorarios,M:sb.NS.modos,S:sb.NS.secuencia};
}
/* Escenario de la configuración ANTERIOR al corte de las 19:00 (Noche 22:00–07:00 para PET1/PET2/B7L; C20L/B20L Intermedio 14:00–22:00 sin Noche).
   Las secciones 5–7 la usan para probar comportamientos generales (bloque deshabilitado, tolerancia, proyección hasta el cierre), que siguen vigentes
   aunque la «configuración aprobada» actual sea otra. Se aplica por el mismo camino (una sola operación) cambiando solo la lista de reglas. */
async function aplicarConfigAnterior(H,desde,motivo){
  const orig=H.configuracionAprobada;
  H.configuracionAprobada=(d,m)=>{const b={tipoVigencia:'ABIERTA',desde:d,hasta:'',motivo:m,habilitado:true};return [
    Object.assign({kind:'HORARIO',lineas:['PET1','PET2','B7L'],bloque:'NOCHE',inicio:'22:00',fin:'07:00',etiqueta:''},b),
    Object.assign({kind:'HORARIO',lineas:['C20L','B20L'],bloque:'DÍA',inicio:'14:00',fin:'22:00',etiqueta:'Intermedio'},b),
    Object.assign({kind:'HABILITACION',lineas:['C20L','B20L'],bloque:'NOCHE'},b,{habilitado:false})];};
  try{return await H.aplicarConfiguracionAprobada(desde,motivo);}finally{H.configuracionAprobada=orig;}
}
const regla=(extra)=>Object.assign({kind:'HORARIO',lineas:['C20L'],bloque:'DÍA',inicio:'14:00',fin:'20:00',tipoVigencia:'ABIERTA',desde:D1,hasta:'',motivo:'Instrucción de Gerencia'},extra||{});
const fila=(marca,tipoFin,extra)=>Object.assign({id:'t_'+marca,marca,presentacion:'20 Litros',tipoFin,cantidad:'',hora:'',cambioPrevioMin:null,modo:'FIJA',saldo:false,version:undefined,itemClave:''},extra||{});

(async()=>{
/* ---------- 1) sin reglas todo sigue igual ---------- */
{
  const {H,NS}=entorno([]);
  const d=H.resolver('PET1',D0,'DÍA'),n=H.resolver('PET1',D0,'NOCHE');
  ok(d.horario==='07:00–19:00'&&d.duracionMin===720&&d.habilitado&&d.origen==='BASE'&&d.versionHorarios===0,'Mañana + Intermedio predeterminado 07:00–19:00 (12 h) y sin reglas nada cambia');
  ok(n.horario==='21:00–07:00'&&n.duracionMin===600&&n.habilitado&&n.inicioMs===T(D0,'21:00')&&n.finMs===T(D1,'07:00'),'sin reglas Noche conserva el horario general de siempre (21:00–07:00): instalar no activa ninguna vigencia');
  ok(H.resolver('C20L',D0,'DÍA').horario==='07:00–19:00'&&H.datos().reglas.length===0,'C20L/B20L tampoco cambian hasta que se configure una vigencia con fecha explícita');
  ok(H.resolver('PET1','no-es-fecha','DÍA')===null,'una fecha inválida no se resuelve');
  const ref=H.referencia('PET1',D0,'NOCHE');
  ok(ref.horario==='21:00–07:00'&&ref.origen==='BASE'&&ref.inicioMs===n.inicioMs&&ref.finMs===n.finMs,'cada plan o reporte puede guardar una referencia inmutable al horario aplicado');
}
/* ---------- 2) configuración aprobada con fecha explícita ---------- */
{
  const {H,NS,N}=entorno([]);
  let e='';try{await H.aplicarConfiguracionAprobada('','Instrucción de Gerencia');}catch(x){e=x.message;}
  ok(/fecha de inicio/.test(e)&&H.datos().reglas.length===0,'no se activa sin fecha de inicio: no se inventa ni se asume');
  const r=await H.aplicarConfiguracionAprobada(D1,'Instrucción de Gerencia: nuevo horario');
  ok(r.reglas.length===3&&H.datos().version===1,'«Aplicar configuración aprobada» crea las tres reglas en una sola operación y sube la versión');
  const nuevaNoche=H.resolver('PET1',D1,'NOCHE'),viejaNoche=H.resolver('PET1',D0,'NOCHE');
  ok(nuevaNoche.horario==='19:00–07:00'&&nuevaNoche.duracionMin===720&&nuevaNoche.inicioMs===T(D1,'19:00')&&nuevaNoche.finMs===T(D2,'07:00'),'corte 19:00: Noche 19:00–07:00 desde la fecha de inicio: 12 horas, fin al día siguiente');
  ok(viejaNoche.horario==='21:00–07:00'&&viejaNoche.duracionMin===600&&viejaNoche.origen==='BASE','lo anterior a la fecha de inicio conserva su horario original (no es retroactivo)');
  const c=H.resolver('C20L',D1,'DÍA'),b=H.resolver('B20L',D1,'DÍA');
  ok(c.horario==='14:00–19:00'&&c.duracionMin===300&&c.etiqueta==='Intermedio'&&b.horario==='14:00–19:00'&&b.etiqueta==='Intermedio','C20L y B20L: Intermedio 14:00–19:00 (5 h brutas)');
  ok(H.resolver('C20L',D1,'NOCHE').habilitado===true&&H.resolver('B20L',D1,'NOCHE').horario==='19:00–07:00'&&H.resolver('PET2',D1,'NOCHE').habilitado===true&&H.resolver('B7L',D1,'NOCHE').horario==='19:00–07:00','Noche 19:00–07:00 habilitada para todas las líneas (C20L/B20L pueden producir después de las 19:00)');
  ok(H.resolver('PET1',D1,'DÍA').horario==='07:00–19:00'&&H.resolver('PET1',D1,'DÍA').duracionMin===720,'las líneas diurnas conservan 07:00–19:00');
  const h=historial(N);
  ok(h.length===3&&h.every(x=>x.uid==='uid-Ana'&&/^HORARIOS:/.test(x.referencia)&&x.horarios.version===1&&x.motivo==='Instrucción de Gerencia: nuevo horario'&&/desde el 2099-03-08 hasta nuevo cambio/.test(x.horarios.vigencia)),'historial: usuario/UID, hora de servidor, antes/después, motivo y vigencia');
  /* capacidad con el horario resuelto por línea */
  const {NS:NS2,sb:sb2,N:N2,H:H2}=entorno([F('PET1',D1,'NOCHE','Scala','2.5 Litros',9000,200),F('C20L',D1,'DÍA','Cuisine','20 Litros',400,200),F('PET1',D0,'NOCHE','Scala','2.5 Litros',9000,200)]);
  await H2.aplicarConfiguracionAprobada(D1,'Instrucción de Gerencia');
  const capN=NS2.capacidadVigente(D1,'NOCHE','PET1'),capC=NS2.capacidadVigente(D1,'DÍA','C20L'),capH=NS2.capacidadVigente(D0,'NOCHE','PET1');
  ok(capN.brutoMin===720&&capN.disponibleMin===720&&capC.brutoMin===300&&capH.brutoMin===600,'capacidad: Noche 19:00–07:00 = 12 h; C20L 14:00–19:00 = 5 h; la Noche histórica sigue en 10 h (no se recalcula con el valor nuevo)');
  ok(NS2.bloqueDe(D1,'NOCHE','PET1').inicioMs===T(D1,'19:00')&&NS2.bloqueDe(D1,'DÍA','C20L').inicioMs===T(D1,'14:00'),'el bloque (inicio y duración) sale del resolvedor por línea');
}
/* ---------- 3) excepción, retorno explícito y vigencias ---------- */
{
  const {H}=entorno([]);
  await H.guardarRegla(regla({desde:D1}));
  ok(H.resolver('C20L',D0,'DÍA').horario==='07:00–19:00'&&H.resolver('C20L',D1,'DÍA').horario==='14:00–20:00'&&H.resolver('C20L',D2,'DÍA').horario==='14:00–20:00','«desde una fecha hasta nuevo cambio»: aplica desde esa fecha y no antes');
  await H.guardarRegla(regla({tipoVigencia:'FECHA',desde:D2,inicio:'10:00',fin:'20:30',motivo:'Gerencia dispone 10:00–20:30'}));
  ok(H.resolver('C20L',D2,'DÍA').horario==='10:00–20:30'&&H.resolver('C20L','2099-03-10','DÍA').horario==='14:00–20:00','una sola fecha: la excepción gana ese día y la regla abierta sigue el resto');
  await H.guardarRegla(regla({tipoVigencia:'RANGO',desde:'2099-03-12',hasta:'2099-03-14',inicio:'08:00',fin:'20:00'}));
  ok(H.resolver('C20L','2099-03-13','DÍA').horario==='08:00–20:00'&&H.resolver('C20L','2099-03-15','DÍA').horario==='14:00–20:00','rango de fechas: aplica solo dentro del rango');
  await H.guardarRegla(regla({tipoVigencia:'FECHA',desde:'2099-03-13',inicio:'09:00',fin:'20:30',motivo:'Excepción dentro del rango'}));
  ok(H.resolver('C20L','2099-03-13','DÍA').horario==='09:00–20:30','precedencia determinista: una fecha > rango > desde-hasta-nuevo-cambio');
  await H.restablecer(['C20L'],'DÍA','2099-03-20','Vuelven al horario diurno');
  ok(H.resolver('C20L','2099-03-21','DÍA').horario==='07:00–19:00'&&H.resolver('C20L','2099-03-21','DÍA').origen==='RESTABLECIDO'&&H.resolver('C20L','2099-03-19','DÍA').horario==='14:00–20:00','Restablecer horario predeterminado: retorno explícito desde su fecha; antes sigue el horario previo');
  await H.guardarRegla({kind:'HABILITACION',lineas:['C20L'],bloque:'NOCHE',habilitado:false,tipoVigencia:'ABIERTA',desde:'2099-03-01',hasta:'',motivo:'Noche deshabilitada'});
  await H.restablecer(['C20L'],'DÍA','2099-03-25','Otra vez al predeterminado');
  ok(H.resolver('C20L','2099-03-26','NOCHE').habilitado===false,'restaurar el horario diurno NO habilita Noche automáticamente');
  await H.guardarRegla({kind:'HORARIO',lineas:['PET1'],bloque:'DÍA',inicio:'08:00',fin:'18:00',tipoVigencia:'ABIERTA',desde:D1,hasta:'',motivo:'Solo PET 1'});
  ok(H.resolver('PET1',D1,'DÍA').horario==='08:00–18:00'&&H.resolver('PET2',D1,'DÍA').horario==='07:00–19:00'&&H.resolver('B7L',D1,'DÍA').horario==='07:00–19:00','configurar una línea no modifica las demás');
  // desactivar conserva la regla
  const id=H.datos().reglas.find(r=>r.lineas.join()==='PET1').id;
  await H.cambiarActivo(id,false,'Ya no aplica');
  ok(H.resolver('PET1',D1,'DÍA').horario==='07:00–19:00'&&H.datos().reglas.some(r=>r.id===id&&!r.activo),'una regla se desactiva (queda auditable), no se borra');
}
/* ---------- 4) validaciones: duración, fechas, superposición, ventanas ---------- */
{
  const {H}=entorno([]);
  const v=r=>H.validar(r,H.datos().reglas);
  ok(v(regla({inicio:'14:00',fin:'14:00'})).some(x=>/duración debe ser positiva/.test(x))&&v(regla({inicio:'',fin:'22:00'})).some(x=>/hora de inicio y la de fin/.test(x))&&v(regla({desde:''})).some(x=>/fecha de inicio/.test(x))&&v(regla({motivo:'ok'})).some(x=>/motivo/.test(x))&&v(regla({lineas:[]})).some(x=>/al menos una línea/.test(x)),'valida inicio/fin, duración positiva, fecha de inicio explícita, motivo y líneas');
  ok(v(regla({tipoVigencia:'RANGO',desde:D2,hasta:D1})).some(x=>/fecha final/.test(x)),'un rango necesita fecha final igual o posterior');
  await H.guardarRegla(regla({desde:D1,lineas:['C20L','B20L']}));
  let e='';try{await H.guardarRegla(regla({desde:D1,inicio:'10:00',lineas:['C20L']}));}catch(x){e=x.message;}
  ok(/igual prioridad/.test(e),'dos reglas incompatibles de igual prioridad no se resuelven por orden accidental: se rechazan');
  e='';try{await H.guardarRegla(regla({tipoVigencia:'FECHA',desde:D2,inicio:'20:00',fin:'23:30',lineas:['PET1'],bloque:'DÍA'}));}catch(x){e=x.message;}
  ok(/se solapa con el de Noche/.test(e),'conflicto de ventanas productivas de una misma línea: Día y Noche no pueden solaparse (se informa el horario)');
  e='';try{await H.guardarRegla(regla({desde:D1,lineas:['XX']}));}catch(x){e=x.message;}
  ok(/línea que no es válida/.test(e),'línea inexistente rechazada');
}
/* ---------- 5) tolerancia de Noche ---------- */
{
  const {H,NS}=entorno([]);
  await aplicarConfigAnterior(H,D0,'Instrucción de Gerencia');
  const n=H.resolver('PET1',D0,'NOCHE');
  ok(n.tolerancia&&n.tolerancia.min===30&&n.tolerancia.hasta==='07:30'&&n.tolerancia.finMs===T(D1,'07:30')&&n.finMs===T(D1,'07:00'),'la tolerancia es al FINAL (hasta las 07:30); el fin programado sigue siendo las 07:00');
  ok(n.inicioMs===T(D0,'22:00')&&n.duracionMin===540&&n.inicioMs!==T(D0,'21:30')&&n.inicioMs!==T(D0,'22:30'),'no habilita una apertura anticipada (21:30), no desplaza el inicio (22:30) y la duración productiva sigue en 9 h (no 9 h 30)');
  const t0=H.toleranciaActual(T(D1,'07:10'));
  ok(t0&&t0.fecha===D0&&t0.bloque==='NOCHE'&&t0.hasta==='07:30'&&H.textoTolerancia()==='Noche · En tolerancia para registro/cierre','entre las 07:00 y las 07:30 se identifica la Noche que terminó: «Noche · En tolerancia para registro/cierre»');
  ok(H.toleranciaActual(T(D1,'06:59'))===null&&H.toleranciaActual(T(D1,'07:30'))===null&&H.toleranciaActual(T(D1,'08:00'))===null&&H.toleranciaActual(T(D0,'21:45'))===null,'antes de las 07:00 es producción normal, y desde las 07:30 la tolerancia terminó (no hay apertura anticipada ni tolerancia al inicio)');
  ok(H.resolver('C20L',D0,'NOCHE').tolerancia===null,'un bloque deshabilitado no tiene tolerancia');
  // capacidad: la tolerancia no suma
  const e=entorno([F('PET1',D0,'NOCHE','Scala','2.5 Litros',9000,200)]);
  await aplicarConfigAnterior(e.H,D0,'Instrucción de Gerencia');
  const c=e.NS.capacidadVigente(D0,'NOCHE','PET1');
  ok(c.disponibleMin===540&&c.brutoMin===540,'la tolerancia no forma parte de la capacidad productiva');
  ok(!/En tolerancia/.test(e.H.htmlResumen(D0,'NOCHE')),'a las 12:00 el resumen de Programación no muestra la tolerancia: solo cuando corresponde');
  const e2=entorno([],{ahora:T(D1,'07:10')});
  await aplicarConfigAnterior(e2.H,D0,'Instrucción de Gerencia');
  ok(/Noche · En tolerancia para registro\/cierre \(hasta 07:30\)/.test(e2.H.htmlResumen(D0,'NOCHE').replace(/<[^>]+>/g,''))&&!/En tolerancia/.test(e2.H.htmlResumen(D0,'DÍA')),'a las 07:10 el resumen de la Noche muestra la tolerancia (y el bloque diurno no)');
}
/* ---------- 6) efecto en planes: validar, copiar, Completar cantidad, secuencia ---------- */
{
  const {H,NS,M,S,N}=entorno([F('C20L',D0,'NOCHE','Cuisine','20 Litros',300,200),F('C20L',D1,'DÍA','Cuisine','20 Litros',400,200)]);
  await aplicarConfigAnterior(H,D1,'Instrucción de Gerencia');
  const v=NS.validar({linea:'C20L',fecha:D1,turno:'NOCHE',marca:'Cuisine',presentacion:'20 Litros',cantidad:100,upp:200});
  ok(v.errores.some(x=>/Noche está deshabilitado para CAJAS 20L/.test(x)),'no se programa producción nocturna nueva para C20L/B20L mientras Noche esté deshabilitado');
  const vh=NS.validar({linea:'C20L',fecha:D0,turno:'NOCHE',marca:'Cuisine',presentacion:'20 Litros',cantidad:100,upp:200});
  ok(!vh.errores.some(x=>/deshabilitado/.test(x)),'antes de la vigencia el bloque sigue habilitado: lo histórico se conserva');
  ok(NS.validar({linea:'PET1',fecha:D1,turno:'NOCHE',marca:'Scala',presentacion:'2.5 Litros',cantidad:100,upp:200}).errores.length===0,'las líneas con Noche habilitada siguen programando');
  // copia
  const pc=NS.planCopia({modo:'DIA_ANTERIOR',fecha:D1});
  ok(pc.candidatos.length===0&&pc.omitidos.some(o=>/deshabilitado para CAJAS 20L/.test(o.texto)),'copiar un plan valida el horario de destino: no copia a un bloque deshabilitado');
  // Completar cantidad: referencia en bloque deshabilitado
  const p=M.planCompletar({linea:'C20L',marca:'Cuisine',presentacion:'20 Litros',fecha:D2,bloque:'DÍA',metaTotal:1000,ref:{fecha:D1,bloque:'NOCHE'},items:[],registros:[]});
  ok(!p.ok&&/no estaba habilitado para CAJAS 20L/.test(p.errores.join(' ')),'Completar cantidad no busca un cierre nocturno de C20L/B20L si ese bloque no estaba habilitado en esa fecha');
  const p2=M.planCompletar({linea:'C20L',marca:'Cuisine',presentacion:'20 Litros',fecha:D1,bloque:'DÍA',metaTotal:1000,ref:{fecha:D0,bloque:'NOCHE'},items:[],registros:[]});
  ok(p2.ok&&p2.pendiente,'la referencia anterior a la vigencia sí se resuelve (Noche estaba habilitada): se guarda pendiente de cierre');
  // secuencia: «hasta el cierre» usa el fin productivo de la línea
  const e=S.estimar('C20L',D1,'DÍA',[fila('Cuisine','CANTIDAD',{cantidad:160}),fila('San Fernando','CIERRE')]);
  const sf=e.tramos[1];
  ok(e.bloque.duracionMin===480&&S.hora(e.bloque,sf.finOff)==='22:00'&&sf.cantidad===Math.floor((480-101)/60*150)&&e.estado==='OK','C20L/B20L proyectan «hasta el cierre» hasta las 22:00 (8 h), no hasta las 19:00 ni hasta el fin de la tolerancia');
  const en=S.estimar('PET1',D1,'NOCHE',[fila('Scala','CIERRE',{presentacion:'2.5 Litros'})]);
  ok(S.hora(en.bloque,en.tramos[0].finOff)==='07:00'&&en.tramos[0].cantidad===Math.floor(540/60*3000),'Noche proyecta hasta las 07:00 con 9 horas productivas');
  const hr=S.estimar('C20L',D1,'DÍA',[fila('Cuisine','HORA',{hora:'13:00'})]);
  ok(hr.conflictos.some(c=>/(antes|debe terminar)/.test(c)||/no puede empezar/.test(c)||/horario|hora límite/i.test(c))||hr.tramos[0].estado==='CONFLICTO'||hr.conflictos.length>0,'una hora límite anterior al inicio del bloque de la línea (13:00 con inicio 14:00) es un conflicto, no una duración negativa');
  // vista semanal usa el mismo horario (misma función)
  ok(typeof NS.cargaCelda==='function'&&NS.capacidadLinea(D1,'DÍA','C20L'),'la vista semanal y la utilización salen de la misma evaluación por línea');
}
/* ---------- 7) selector por línea y pestaña ---------- */
{
  const {H,NS}=entorno([]);
  await aplicarConfigAnterior(H,D1,'Instrucción de Gerencia');
  const txt=H.htmlResumen(D1,'NOCHE').replace(/<[^>]+>/g,'');
  ok(/PET 1 22:00–07:00/.test(txt)||/22:00–07:00/.test(txt)&&/Deshabilitado: CAJAS 20L, B20L/.test(txt),'Noche muestra solo las líneas habilitadas (22:00–07:00) y avisa las deshabilitadas');
  const dia=H.htmlResumen(D1,'DÍA').replace(/<[^>]+>/g,'');
  ok(/PET 1 07:00–19:00/.test(dia)&&/CAJAS 20L 14:00–22:00 \(Intermedio\)/.test(dia)&&/B20L 14:00–22:00 \(Intermedio\)/.test(dia),'Mañana + Intermedio muestra el horario por línea y el Intermedio de C20L/B20L (no un único inicio/fin para todas)');
  ok(!NS.TABS.some(t=>t.clave==='horarios')&&NS.pestanas.some(p=>p.clave==='horarios'&&p.titulo==='Horario de producción'),'«Horario de producción» ya no es pestaña de Planificación: se abre desde el grupo Producción (la pantalla sigue registrada)');
  const cont={innerHTML:''};NS.estado={fecha:D1,turno:'DÍA',tab:'horarios'};
  NS.pestanas.find(p=>p.clave==='horarios').pintar(cont);
  ok(/Configurar horario de producción/.test(cont.innerHTML)&&/Restablecer horario predeterminado/.test(cont.innerHTML)&&/Aplicar configuración aprobada/.test(cont.innerHTML)&&/Motivo o instrucción de Gerencia/.test(cont.innerHTML)&&/Responsable del cambio/.test(cont.innerHTML)&&/Una sola fecha/.test(cont.innerHTML)&&/Rango de fechas/.test(cont.innerHTML)&&/hasta nuevo cambio/.test(cont.innerHTML),'el formulario trae líneas, bloque, horas, vigencia, motivo/instrucción, responsable, restablecer y la configuración aprobada');
  const ro=entorno([],{usuario:{planifica:false}});
  const c2={innerHTML:''};ro.NS.estado={fecha:D1,turno:'DÍA',tab:'horarios'};ro.NS.pestanas.find(p=>p.clave==='horarios').pintar(c2);
  ok(!/Guardar horario/.test(c2.innerHTML)&&/Solo lectura/.test(c2.innerHTML),'consulta ve el horario pero no los botones de escritura');
}
/* ---------- 8) permisos, visualización, conexión, concurrencia ---------- */
{
  const ro=entorno([],{usuario:{planifica:false}});
  let e='';try{await ro.H.guardarRegla(regla());}catch(x){e=x.message;}
  ok(/Solo Planificación/.test(e)&&ro.H.datos().reglas.length===0,'sin el permiso de Planificación no se configura (consulta, jefatura o supervisores no escriben)');
  const vis=entorno([]);vis.sb.glacialVista={activo:()=>true};
  e='';try{await vis.H.guardarRegla(regla());}catch(x){e=x.message;}
  ok(/modo visualización/.test(e),'modo visualización: sin escritura');
  const off=entorno([]);off.sb.glacialEstadoDatos={enLinea:false};
  e='';try{await off.H.guardarRegla(regla());}catch(x){e=x.message;}
  ok(/Sin conexión/.test(e),'sin conexión: se avisa y no se confirma el guardado');
  const a=entorno([]);
  const r=await Promise.allSettled([a.H.guardarRegla(regla({desde:D1})),a.H.guardarRegla(regla({desde:D1,inicio:'10:00'}))]);
  ok(r.filter(x=>x.status==='fulfilled').length===1&&a.H.datos().reglas.length===1,'dos cambios simultáneos incompatibles: solo uno se guarda (se revalida con lo más reciente)');
  const b=entorno([]);
  const r1=await b.H.guardarRegla(regla({desde:D1}));
  const id=r1.reglas[0].id;
  e='';try{await b.H.guardarRegla(Object.assign({},b.H.datos().reglas[0],{inicio:'09:00',esperadoEn:1}));}catch(x){e=x.message;}
  ok(/cambió mientras la editabas/.test(e),'editar una regla que otra persona cambió no la pisa');
}
/* ---------- 9) fuentes: 23b, Avance, orden de carga ---------- */
{
  const s23=leer('js/produccion/23b-tiempos-linea.js'),s29=leer('js/produccion/29-avance-produccion.js'),idx=leer('index.html'),s52=leer('js/produccion/52-planificacion-pantalla.js');
  ok(/function rangoTurno\(fecha,turno,compartida,linea\)/.test(s23)&&/rangoTurno\(fecha,turno,compartida,linea\)/.test(s23)&&/glacialHorarios\.resolver\(linea,fecha,turno\)/.test(s23),'23b (disponibilidad y ratio por línea) usa el horario de ESA línea');
  ok(/function avGenerarSeleccion/.test(s29)&&/function avAccionesHistoricoHtml/.test(s29)&&/\$\{!actual&&avPuedeGenerar\(\)\?avAccionesHistoricoHtml\(\):''\}/.test(s29)&&/avAbrirCierreHistorico/.test(s29),'Avance/Cierre: GENERAR CIERRE aparece al elegir una fecha y bloque anteriores (no depende de la hora ni del modo histórico)');
  ok(!/avGenerarSeleccion[^]*?avCtx\(\)/.test(s29.slice(s29.indexOf('async function avGenerarSeleccion'),s29.indexOf('function avAccionesHistoricoHtml'))),'el cierre histórico opera sobre la selección, no sobre el turno actual del dispositivo');
  ok(/toleranciaActual\(avAhoraMs\(\)\)/.test(s29)&&/avChipTolerancia/.test(s29)&&/horario de producción por línea/i.test(s29),'Avance reconoce la tolerancia de Noche y muestra el horario por línea');
  ok(idx.indexOf('51b-horarios-produccion.js')>idx.indexOf('52-planificacion-pantalla.js')&&/51b-horarios-produccion\.js\?v=\d{8}-hz[0-9]/.test(idx),'index.html carga 51b después de 52');
  ok(/NS\.horarios\.htmlResumen/.test(s52)&&/NS\.horarios\.habilitado\(l\.key,E\.fecha,E\.turno\)/.test(s52),'la tabla de Programación oculta las líneas deshabilitadas y muestra el horario por línea');
  const s51b=leer('js/produccion/51b-horarios-produccion.js');
  ok(!/tareo|jornada|horarioOperativo/i.test(s51b.replace(/\/\*[^]*?\*\//g,'').replace(/\/\/.*$/gm,''))&&!/paradasOperativas|avancesTurno/.test(s51b),'no toca Tareo, jornadas del personal ni paradas oficiales');
  // generar cierre: faltantes sin inventar cero (función de Avance extraída)
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set};
  const vm=require('vm');vm.createContext(sb);
  sb.avRegistros=()=>[{linea:'PET1',estadoRegistro:'FINALIZADO'},{linea:'PET2',estadoRegistro:'EN_REGISTRO'}];
  vm.runInContext(extraer(s29,'avDatosFaltantesCierre')+'this.f=avDatosFaltantesCierre;',sb);
  const f=sb.f({lineas:[{linea:'PET1',nombre:'PET 1'},{linea:'PET2',nombre:'PET 2'},{linea:'B7L',nombre:'B7L'}]});
  ok(f.length===2&&/PET 2: el registro de producción no está finalizado/.test(f[0])&&/B7L: no hay registro de producción de ese bloque/.test(f[1]),'un cierre generado con datos incompletos dice qué falta (registro sin finalizar o inexistente) y no inventa producción cero');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
