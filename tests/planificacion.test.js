/* Planificación (Partes A, B y C): permiso, programación única, validaciones, copia, Excel, catálogo, solicitudes y cumplimiento. */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error(n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}
(async()=>{
/* ---------- 1) permiso «planificacion» (02-estado.js) ---------- */
const s02=leer('js/nucleo/02-estado.js');
const sb02={state:{user:null},console};vm.createContext(sb02);
vm.runInContext(s02.slice(s02.indexOf('const ROLES_PLANIFICACION'),s02.indexOf('function tienePermiso'))+
 'function tienePermisoPlan(u){return planificacionPermitida(u);}',sb02);
const tp=u=>vm.runInContext('planificacionPermitida',sb02)(u);
ok(tp({rol:'Administrador'})&&tp({rol:'Jefe de Producción',permisos:['x']})&&tp({rol:'Planificación',permisos:[]})&&tp({rol:'Ventas y Planificación',permisos:[]}),'por defecto: Administrador, Jefe de Producción, Planificación y Ventas y Planificación');
ok(!tp({rol:'Supervisor',permisos:['paletas']})&&!tp({rol:'Ventas',permisos:['produccionActual']})&&!tp({rol:'Jefe de Operaciones',permisos:[]}),'por defecto NO: Supervisor, Ventas, Jefe de Operaciones');
ok(tp({rol:'Supervisor',permisos:['planificacion']}),'el Administrador se lo puede dar a un supervisor');
ok(!tp({rol:'Jefe de Producción',permisos:['-planificacion']})&&!tp({rol:'Planificación',permisos:['-planificacion','produccionActual']}),'el Administrador se lo puede quitar a quien lo trae por defecto');
ok(!tp(null),'sin usuario no hay permiso');

/* ---------- 2) guardarProgramacionPaleta (16-paletas.js) con Firestore falso ---------- */
const s16=leer('js/produccion/16-paletas.js');
let doc={items:[]},historial=[],permiso=true;
const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map};vm.createContext(sb);sb.window=sb;
sb.tienePermiso=p=>p==='planificacion'?permiso:false;
sb.nombreUsuarioActualPaletas=()=>'Plan Test';
sb._programacionesCache=[];
sb.db={collection:()=>({doc:()=>({__ref:true})}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>JSON.parse(JSON.stringify(doc))}),set:(r,d)=>{doc=JSON.parse(JSON.stringify(d));}})};
sb.glacialPlanificacion={registrarHistorial:async e=>{historial.push(e);}};
vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+extraer(s16,'claveProgramacionPaleta')+extraer(s16,'guardarProgramacionPaleta'),sb);
const G=s=>vm.runInContext('guardarProgramacionPaleta',sb)(...s);
await G(['PET1','2026-10-05','DÍA','Bells','625ml',10000,600,{}]);
ok(doc.items.length===1&&doc.items[0].cantidadProgramada===10000&&doc.items[0].paletasProgramadas===10000/600&&doc.items[0].estadoOperacion.estado==='PENDIENTE','crea la programación con la misma forma de siempre (cantidad, paletas, estado PENDIENTE)');
ok(historial.length===1&&historial[0].accion==='CREACION'&&historial[0].anterior===null&&historial[0].nuevo.cantidad===10000,'historial: creación sin valor anterior');
await G(['PET1','2026-10-05','DÍA','Bells','625ml',12000,600,{}]);
ok(doc.items.length===1&&doc.items[0].cantidadProgramada===12000&&historial[1].accion==='EDICION'&&historial[1].anterior.cantidad===10000&&historial[1].nuevo.cantidad===12000,'editar no duplica; el historial guarda valor anterior y nuevo');
doc.items[0].estadoOperacion={estado:'EN_PRODUCCION'};
let err='';try{await G(['PET1','2026-10-05','DÍA','Bells','625ml',9000,600,{}]);}catch(e){err=e.message;}
ok(/motivo/i.test(err)&&doc.items[0].cantidadProgramada===12000,'editar una programación en producción sin motivo se rechaza y no cambia nada');
await G(['PET1','2026-10-05','DÍA','Bells','625ml',9000,600,{motivo:'Falla de la sopladora'}]);
ok(doc.items[0].cantidadProgramada===9000&&historial[2].motivo==='Falla de la sopladora','con motivo se edita y el motivo queda en el historial');
await G(['PET1','2026-10-05','DÍA','Bells','625ml',5000,600,{accion:'COPIA',motivo:'Copia',referencia:'x'}]).catch(()=>{});
doc.items[0].estadoOperacion={estado:'PENDIENTE'};
await G(['PET1','2026-10-05','DÍA','Bells','625ml',5000,600,{accion:'APROBACION',motivo:'Solicitud',referencia:'sol1'}]);
ok(historial[historial.length-1].accion==='APROBACION'&&historial[historial.length-1].referencia==='sol1','la aprobación queda registrada con su referencia');
await G(['PET1','2026-10-05','DÍA','Bells','625ml',0,600,{}]);
ok(doc.items.length===0&&historial[historial.length-1].accion==='ELIMINACION','cantidad 0 quita la programación (como siempre) y queda en el historial');
permiso=false;err='';try{await G(['PET1','2026-10-06','DÍA','Bells','625ml',100,600,{}]);}catch(e){err=e.message;}
ok(/Planificación/.test(err)&&doc.items.length===0,'sin el permiso «planificacion» no se puede escribir (los supervisores ven en solo lectura)');
permiso=true;

/* ---------- 3) núcleo 51 con entorno mínimo ---------- */
const sbn={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout};vm.createContext(sbn);sbn.window=sbn;
sbn.document={addEventListener(){},getElementById:()=>null,createElement:()=>({})};
vm.runInContext(leer('js/nucleo/45-indicadores.js'),sbn);
sbn.state={user:{rol:'Planificación',nombre:'P',username:'p'},currentTab:'planificacion'};
sbn.LINES=[{key:'PET1',name:'PET 1'},{key:'PET2',name:'PET 2'},{key:'B7L',name:'B7L'}];
sbn.MARCAS_POR_LINEA={PET1:['Bells','Scala'],PET2:['Bells'],B7L:['Fontlife']};
sbn.PRESENTACIONES_POR_LINEA={PET1:['Regular_380ml','Regular_625ml'],PET2:['Regular_625ml'],B7L:['7 Litros','10 Litros']};
let progs=[];
sbn.loadProgramaciones=()=>progs;
sbn.tienePermiso=p=>p==='planificacion';
sbn.escaparHtml=t=>String(t==null?'':t);
sbn.claveProgramacionPaleta=(l,f,t,m,p)=>[l,f,t,m,p].join('|');
sbn.obtenerProgramacionPaleta=(l,f,t,m,p)=>progs.find(x=>x.clave===[l,f,t,m,p].join('|'))||null;
sbn.obtenerUnidadesPorPalet=(l,m,p)=>p==='Regular_625ml'?1200:0;
sbn.guardarProgramacionPaleta=async(l,f,t,m,p,c,u,opc)=>{progs=progs.filter(x=>x.clave!==[l,f,t,m,p].join('|'));if(c>0)progs.push({clave:[l,f,t,m,p].join('|'),linea:l,fecha:f,turno:t,marca:m,presentacion:p,cantidadProgramada:c,unidadesPorPaleta:u,estadoOperacion:{estado:'PENDIENTE'}});return {opc};};
sbn.glacialCierresSesion=[];
['51-planificacion-nucleo','52-planificacion-pantalla','53-planificacion-catalogo','54-planificacion-solicitudes'].forEach(f=>vm.runInContext(leer('js/produccion/'+f+'.js'),sbn));
const NS=sbn.glacialPlanificacion;
const P=(o)=>Object.assign({linea:'PET1',fecha:'2026-10-05',turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidad:10000,upp:1200},o||{});
ok(NS.validar(P()).errores.length===0,'validación: una fila correcta pasa');
ok(NS.validar(P({cantidad:0})).errores.some(e=>/mayor que cero/.test(e)),'validación: cantidad mayor que cero');
ok(NS.validar(P({presentacion:'10 Litros'})).errores.some(e=>/presentación/i.test(e)),'validación: la presentación debe ser válida para la línea');
ok(NS.validar(P({marca:'Fontlife'})).errores.some(e=>/marca/i.test(e)),'validación: la marca debe existir en la línea');
progs=[{clave:'PET1|2026-10-05|DÍA|Bells|Regular_625ml',linea:'PET1',fecha:'2026-10-05',turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidadProgramada:8000,unidadesPorPaleta:1200,estadoOperacion:{estado:'EN_PRODUCCION'}}];
const v=NS.validar(P());
ok(v.avisos.some(a=>/Ya existe/.test(a))&&v.avisos.some(a=>/exige motivo/.test(a)),'aviso si se repite la misma línea, turno y producto; y avisa que en producción exige motivo');
ok(NS.uppSugerida('PET1','Bells','Regular_625ml')===1200,'unidades por paleta sugeridas: tabla fija cuando el catálogo no tiene el producto');
/* catálogo */
let cat=[{linea:'PET1',marca:'Bells',presentacion:'Regular_625ml',unidadesPorPaleta:1500,activo:true,id:'a'}];
sbn.db={collection:()=>({doc:()=>({onSnapshot:fn=>{fn({exists:true,data:()=>({items:cat})});return()=>{};}})})};
NS.escuchas.forEach(f=>{try{f();}catch(_){}});
ok(NS.uppCatalogo('PET1','Bells','Regular_625ml')===1500&&NS.uppSugerida('PET1','Bells','Regular_625ml')===1500,'catálogo: sus unidades por paleta mandan sobre la tabla fija');
cat[0].activo=false;NS.escuchas.forEach(f=>{try{f();}catch(_){}});
ok(NS.uppCatalogo('PET1','Bells','Regular_625ml')===0&&NS.validar(P()).avisos.some(a=>/inactivo/.test(a)),'catálogo: un producto inactivo no aporta valor y avisa al programar');
/* copia */
progs=[
 {clave:'a',linea:'PET1',fecha:'2026-10-04',turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidadProgramada:8000,unidadesPorPaleta:1200,estadoOperacion:{estado:'FINALIZADA'}},
 {clave:'b',linea:'PET1',fecha:'2026-10-04',turno:'NOCHE',marca:'Scala',presentacion:'Regular_380ml',cantidadProgramada:5000,unidadesPorPaleta:2184,estadoOperacion:{estado:'PENDIENTE'}},
 {clave:'c',linea:'PET2',fecha:'2026-10-04',turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidadProgramada:3000,unidadesPorPaleta:1200,estadoOperacion:{estado:'CANCELADA'}}];
let plan=NS.planCopia({modo:'DIA_ANTERIOR',fecha:'2026-10-05'});
ok(plan.candidatos.length===2&&plan.candidatos.every(c=>c.fecha==='2026-10-05')&&!plan.candidatos.some(c=>c.linea==='PET2'),'copiar del día anterior: 2 programaciones (la cancelada no se copia), con la fecha nueva');
plan=NS.planCopia({modo:'DIA_ANTERIOR',fecha:'2026-10-05',soloTurno:'NOCHE'});
ok(plan.candidatos.length===1&&plan.candidatos[0].turno==='NOCHE','copiar solo el turno seleccionado');
plan=NS.planCopia({modo:'SEMANA_PASADA',fecha:'2026-10-11'});
ok(plan.candidatos.length===2&&plan.candidatos[0].fecha==='2026-10-11','mismo día de la semana pasada: 4 oct → 11 oct');
plan=NS.planCopia({modo:'SEMANA_COMPLETA',fecha:'2026-10-07'});
ok(plan.candidatos.length===2&&plan.candidatos.every(c=>c.fecha==='2026-10-11'),'semana completa: lo del 28 sep al 4 oct (domingo 4 oct) pasa a la semana del 5 al 11 oct (domingo 11 oct)');
progs.push({clave:'PET1|2026-10-05|DÍA|Bells|Regular_625ml',linea:'PET1',fecha:'2026-10-05',turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidadProgramada:100,unidadesPorPaleta:1200,estadoOperacion:{estado:'PENDIENTE'}});
plan=NS.planCopia({modo:'DIA_ANTERIOR',fecha:'2026-10-05'});
ok(plan.candidatos.length===1&&plan.omitidos.some(o=>/ya existe/.test(o.texto)),'copiar no pisa lo que ya existe (lo informa como omitido)');
plan=NS.planCopia({modo:'DIA_ANTERIOR',fecha:'2026-10-05',reemplazar:true});
ok(plan.candidatos.length===2,'con «reemplazar» sí lo reemplaza');
progs[3].estadoOperacion={estado:'EN_PRODUCCION'};
plan=NS.planCopia({modo:'DIA_ANTERIOR',fecha:'2026-10-05',reemplazar:true});
ok(plan.candidatos.length===1&&plan.omitidos.some(o=>/en producción/.test(o.texto)),'lo que ya está en producción nunca se reemplaza al copiar');
/* Excel */
sbn.XLSX={read:()=>({SheetNames:['H'],Sheets:{H:{}}}),utils:{sheet_to_json:()=>[
  {Fecha:'2026-10-05',Turno:'Día',Línea:'PET1',Marca:'Bells',Presentación:'Regular_625ml',Cantidad:9000,'Unidades por paleta':''},
  {Fecha:'06/10/2026',Turno:'noche',Línea:'PET 1',Marca:'Scala',Presentación:'Regular_380ml',Cantidad:'abc'},
  {Fecha:'2026-10-07',Turno:'DÍA',Línea:'B7L',Marca:'Fontlife',Presentación:'10 Litros',Cantidad:500,'Unidades por paleta':50}]}};
const lect=await NS.leerExcel({arrayBuffer:async()=>new ArrayBuffer(1)});
ok(lect.filas.length===3&&lect.filas[0].errores.length===0&&lect.filas[0].fila.turno==='DÍA'&&lect.filas[0].fila.upp===1200,'Excel: fila correcta, turno «Día» → DÍA y unidades por paleta tomadas del catálogo/tabla');
ok(lect.filas[1].fila.fecha==='2026-10-06'&&lect.filas[1].fila.linea==='PET1'&&lect.filas[1].errores.some(e=>/cantidad/i.test(e)),'Excel: fecha dd/mm/aaaa y nombre de línea se entienden; la cantidad inválida se marca como error');
ok(lect.filas[2].errores.length===0,'Excel: otra línea con sus propias presentaciones');
/* lote */
const lote=await NS.aplicarLote([P({cantidad:7000}),P({marca:'Inexistente'})],{accion:'IMPORTACION',motivo:'x'});
ok(lote.ok.length===1&&lote.fallos.length===1,'aplicar un lote: la fila válida se guarda, la inválida se informa y no detiene el resto');
/* ---------- 4) solicitudes y avisos (54) ---------- */
const sol=[
 {id:'s1',uid:'u1',estado:'PENDIENTE',tipo:'CAMBIO_CANTIDAD',linea:'PET1',fecha:'2026-10-05',turno:'DÍA',creadoEn:1000},
 {id:'s2',uid:'u2',estado:'APROBADA',tipo:'NUEVA_PROGRAMACION',linea:'PET2',fecha:'2026-10-05',turno:'NOCHE',creadoEn:900,resueltaEn:sbn.Date.now(),comentario:'Listo'}];
sbn.firebase={auth:()=>({currentUser:{uid:'u1'}}),firestore:{FieldValue:{serverTimestamp:()=>'TS'}}};
const snapSol=fn=>{fn({docChanges:()=>sol.map(d=>({type:'added',doc:{id:d.id,data:()=>d}}))});return()=>{};};
sbn.db={collection:()=>({where:()=>({onSnapshot:snapSol}),orderBy:()=>({limit:()=>({onSnapshot:snapSol})})})};
NS.escuchas.slice(-1)[0]();
const av=NS.avisos();
ok(av.some(a=>a.id==='sol|pendientes'&&/1 solicitud/.test(a.texto)),'aviso para quien planifica: solicitudes pendientes');
sbn.tienePermiso=()=>false;sbn.state.user={rol:'Supervisor',nombre:'S',username:'s'};
sbn.firebase.auth=()=>({currentUser:{uid:'u2'}});
const av2=NS.avisos();
ok(av2.length===1&&/aprobada/.test(av2[0].texto)&&/Listo/.test(av2[0].texto)&&av2[0].id.startsWith('sol|s2'),'aviso para el supervisor: el resultado de SU solicitud (no las de otros)');
ok(NS.solicitudes().length>=2,'las solicitudes se leen de las escuchas ya abiertas (en vivo)');
/* ---------- 5) cierre de sesión ---------- */
ok(sbn.glacialCierresSesion.length>=1&&typeof sbn.glacialPlanificacionEscuchas==='function','las escuchas de Planificación se registran en la lista de cierre de sesión');
/* ---------- 6) código: sin envolturas nuevas y lecturas existentes intactas ---------- */
const fuentes=['51-planificacion-nucleo','52-planificacion-pantalla','53-planificacion-catalogo','54-planificacion-solicitudes'].map(f=>leer('js/produccion/'+f+'.js')).join('\n');
ok(!/(onProgramacionesUpdated|renderMain)\s*=\s*function/.test(fuentes)&&!/const anterior\s*=\s*(onProgramacionesUpdated|renderMain)/.test(fuentes),'los archivos nuevos no envuelven onProgramacionesUpdated ni renderMain');
ok(/glacialPlanificacionRefrescar/.test(s02)&&/glacialPlanificacionEscuchas/.test(s02),'02-estado.js llama directamente al refresco y a las escuchas');
ok(/renderPlanificacion\(main\)/.test(leer('js/produccion/06-registro.js')),'renderMain llama directamente a renderPlanificacion');
ok(!/paleta-programada-input|btn-guardar-programacion/.test(s16.slice(s16.indexOf('function renderPaletasTab'))),'Paletas ya no tiene cantidad programada, unidades por paleta ni «Guardar programación»');
ok(/Ver en Planificación/.test(leer('js/produccion/51-planificacion-nucleo.js'))&&/Solicitar programación/.test(leer('js/produccion/51-planificacion-nucleo.js')),'Paletas: enlace «Ver en Planificación» y botón «Solicitar programación»');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
