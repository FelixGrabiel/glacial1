/* Modo visualización general (por usuario) y orden de Inicio. */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

/* ---------- 1. Lógica real de 23b con las funciones del sistema reemplazadas por equivalentes mínimos ---------- */
const guion=`
var state={user:null,currentTab:'centro-perfil',currentLine:'PET1',showWelcome:false};
var draft=null;
const LINES=[{key:'PET1'},{key:'PET2'},{key:'B7L'},{key:'C20L'},{key:'B20L'}];
const AVANCE_LINEAS=['PET1','PET2','B7L','C20L','B20L','HIELO'];
const ROLES_SOLO=new Set(['Jefatura','Gerente']);
function esUsuarioSoloConsulta(u){return !!u&&ROLES_SOLO.has(String(u.rol||'').trim());}
function normalizarPermisosUsuario(u){if(!u)return [];if(u.rol==='Administrador')return 'todos';if(ROLES_SOLO.has(u.rol))return ['perdidasSoles','produccionActual'];return Array.isArray(u.permisos)?u.permisos:[];}
function tienePermiso(p){if(!state.user)return false;const l=normalizarPermisosUsuario(state.user);return l==='todos'||l.includes(p);}
function puedeEntrarMantenimiento(){return tienePermiso('moduloMantenimiento');}
function puedeEntrarTareoProduccion(){return tienePermiso('tareoProduccion');}
function puedeEntrarPlanificacion(){return tienePermiso('planificacion');}
function visibleLines(){return LINES;}
function permisoNavegacion(p){return tienePermiso(p);}
function primeraVistaAutorizada(){return 'x';}
function puedeAccederPaletas(){return tienePermiso('paletas');}
function permisoPestanaLinea(p){return tienePermiso(p);}
function selectLine(){}
function ajustarVistaSegunPermisos(){}
function renderMain(){RENDERS.push(state.currentTab);}
function renderSidebar(){}
function onUsersUpdated(){}
var RENDERS=[];
var _recordsCache=[{linea:'PET1',n:1},{linea:'PET2',n:2},{linea:'B7L',n:3}];
function loadRecords(){return _recordsCache;}
function loadPaletas(){return _recordsCache;}
function loadProgramaciones(){return _recordsCache;}
function saveRecords(){return 'guardado';}
function escaparHtml(v){return String(v);}
`;
const sb={console,setTimeout,clearTimeout,Date,JSON,Promise,Error,Map,Set,Array,Object,String,Number};
sb.window=sb;sb.globalThis=sb;
sb.document={body:{classList:{toggle(){}}},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],head:{appendChild(){}},createElement:()=>({classList:{add(){},remove(){}}})};
vm.createContext(sb);
vm.runInContext(guion,sb);
vm.runInContext(leer('js/accesos/23b-modo-visualizacion.js'),sb);
const V=sb.glacialVista;
const ev=c=>vm.runInContext(c,sb);

const base={username:'sup',rol:'Supervisor',permisos:['produccionActual','paletas','eliminarRegistros','nuevo']};
const conModo=(m)=>Object.assign({},base,{modoVisualizacion:Object.assign({activo:true,modulos:[],lineas:[],exportar:false},m)});
const con=u=>{sb.state.user=u;V.sincronizar();return u;};

con(base);
ok(V.activo()===false&&ev("tienePermiso('paletas')")===true,'sin configuración: el comportamiento actual no cambia');
con(Object.assign({},base,{modoVisualizacion:{activo:false,modulos:['inicio']}}));
ok(V.activo()===false&&ev("tienePermiso('eliminarRegistros')")===true,'modo desactivado: vuelven los permisos anteriores guardados');

con(conModo({modulos:['produccion_actual','historial'],lineas:['PET1']}));
ok(V.activo()===true,'modo activo por usuario (no por el cargo)');
ok(ev("tienePermiso('produccionActual')")&&ev("tienePermiso('historial')"),'concede la vista de los módulos marcados');
ok(!ev("tienePermiso('paletas')")&&!ev("tienePermiso('eliminarRegistros')")&&!ev("tienePermiso('nuevo')"),'los permisos operativos guardados quedan bloqueados');
ok(!ev("tienePermiso('exportarExcel')")&&!V.puedeExportar(),'exportar desactivado por defecto');
ok(ev("esUsuarioSoloConsulta(state.user)")===true,'cuenta de solo consulta mientras el modo esté activo');
ok(ev("tienePermiso('planificacion')")===false&&ev("tienePermiso('distribuirPersonal')")===false,'permisos con regla propia tampoco se conceden');

con(conModo({modulos:[],lineas:[]}));
ok(V.activo()&&V.primeraTab()===''&&!V.tabPermitida('centro-perfil'),'sin módulos marcados: ningún acceso (pantalla informativa)');
ok(ev("LINES.length")===0&&ev("loadRecords().length")===0,'lista vacía de líneas: ninguna línea (no equivale a todas)');

con(conModo({modulos:['inicio','paletas'],lineas:['PET1','B7L'],exportar:true}));
ok(V.tabPermitida('centro-perfil')&&V.tabPermitida('paletas')&&!V.tabPermitida('historial')&&!V.tabPermitida('nuevo')&&!V.tabPermitida('produccion-actual'),'solo abre las pestañas de los módulos marcados');
ok(!V.tabPermitida('avance-produccion')&&!V.tabPermitida('resumen')&&!V.tabPermitida('tareo')&&!V.tabPermitida('inexistente'),'navegación directa a otro módulo o pestaña desconocida: negada');
ok(ev("puedeAccederPaletas()")===true&&ev("tienePermiso('paletas')")===false,'Paletas se puede consultar pero no se concede registrar');
ok(JSON.stringify(ev("LINES.map(l=>l.key)"))==='["PET1","B7L"]','LINES queda con las líneas autorizadas');
ok(JSON.stringify(ev("AVANCE_LINEAS"))==='["PET1","B7L"]','listas propias de líneas (Avance) también');
ok(JSON.stringify(ev("loadRecords().map(r=>r.linea)"))==='["PET1","B7L"]'&&ev("loadPaletas().length")===2&&ev("loadProgramaciones().length")===2,'listados y totales solo con líneas autorizadas');
ok(V.puedeExportar()&&ev("tienePermiso('exportarExcel')&&tienePermiso('exportarJPG')"),'con la casilla, se permiten las exportaciones del alcance autorizado');
ok(V.lineaPermitida('PET1')&&!V.lineaPermitida('PET2'),'lineaPermitida');
ok(JSON.stringify(sb.glacialLineasPermitidas(['TODAS','PET1','PET2','B7L']))==='["TODAS","PET1","B7L"]','listas escritas dentro de un módulo se filtran');

// Guardados: segunda barrera
let bloqueado=false;try{ev("saveRecords()");}catch(e){bloqueado=!!e.glacialVista;}
ok(bloqueado,'saveRecords falla con el modo activo (no solo se ocultan botones)');
// Escritura de Firestore
ok(V.escrituraBloqueada({path:'sync/paletas'})&&V.escrituraBloqueada({path:'sync/users'})&&!V.escrituraBloqueada({path:'relojServidor/abc'}),'bloquea escrituras de documentos (excepto la hora del servidor)');

// Administrador y cuenta admin: nunca limitados
con({username:'otro',rol:'Administrador',modoVisualizacion:{activo:true,modulos:[],lineas:[]}});
ok(V.activo()===false,'el modo no se aplica a un Administrador');
con({username:'admin',rol:'Jefatura',modoVisualizacion:{activo:true,modulos:[],lineas:[]}});
ok(V.activo()===false,'ni a la cuenta admin');

// Cambio en vivo: se reevalúan permisos
con(conModo({modulos:['historial'],lineas:['PET1']}));
ok(ev("tienePermiso('historial')"),'antes del cambio: historial');
con(conModo({modulos:['produccion_actual'],lineas:['PET2']}));
ok(!ev("tienePermiso('historial')")&&ev("tienePermiso('produccionActual')")&&JSON.stringify(ev("LINES.map(l=>l.key)"))==='["PET2"]','un cambio del administrador se refleja en la sesión');
con(null);
ok(ev("LINES.length")===5,'al cerrar sesión (sin usuario) vuelven todas las líneas');
V.sincronizar();
ok(ev("LINES.length")===5&&ev("AVANCE_LINEAS.length")===6,'sincronizar sin usuario restaura las listas completas');

// Impacto económico conserva su autorización independiente
con(Object.assign({},conModo({modulos:['inicio']}),{rol:'Jefatura'}));
ok(ev("tienePermiso('perdidasSoles')")===true,'Impacto Económico: la autorización propia (por rol) no la concede ni la quita el modo');
con(Object.assign({},conModo({modulos:['inicio']}),{rol:'Supervisor',permisos:['paletas']}));
ok(ev("tienePermiso('perdidasSoles')")===false,'quien no la tenía antes, tampoco la recibe al marcar módulos');

/* ---------- 2. Fuentes: reglas de Firestore, perfiles, formulario y orden de Inicio ---------- */
const reglas=leer('firestore.rules.etapa2.txt');
ok(/function soloVista\(\)/.test(reglas)&&/get\('soloVista', false\)/.test(reglas),'reglas: función soloVista() desde sync/perfiles');
const operativo=reglas.slice(reglas.indexOf("(autenticado() && !soloVista() && doc in ["),reglas.indexOf("(autenticado() && !soloVista() && doc in [")+300);
ok(/'records', 'workers', 'rotaciones'/.test(operativo)&&/'programaciones', 'avancesTurno'/.test(operativo),'reglas: los documentos operativos exigen !soloVista()');
['puedeOperarProduccion','puedePlanificar','puedeDistribuirPersonal','esRRHH','esSupervisorMtto'].forEach(n=>{
  const i=reglas.indexOf('function '+n+'()');ok(i>0&&/!soloVista\(\)/.test(reglas.slice(i,i+260)),'reglas: '+n+' excluye soloVista');});
ok(/allow create: if autenticado\(\) && !soloVista\(\)\s*&& request\.resource\.data\.uid[^]*?'tecnicoNombre'/.test(reglas),'reglas: la bitácora no admite eventos de una cuenta soloVista');
ok(/esGerencia\(\) && !soloVista\(\)\s*&& request\.resource\.data\.keys\(\)\.hasOnly\(\['tipo'/.test(reglas),'reglas: valores unitarios (precios) no se modifican en modo visualización');
const seg=leer('js/accesos/36-seguridad-auth.js');
ok(/glacialVista\.activoDe\(u\)\)mapa\[u\.authUid\]\.soloVista=true/.test(seg),'perfiles: se publica soloVista:true para las reglas');

const form=leer('js/accesos/10b-modo-visualizacion-form.js');
ok(/MODO VISUALIZACIÓN GENERAL/.test(form)&&/Este usuario solo podrá consultar\. No podrá crear, editar, eliminar ni cambiar estados\./.test(form)&&/El administrador selecciona qué puede visualizar\./.test(form),'formulario: textos aprobados');
ok(/Marcar \/ quitar todos/.test(form)&&/Permitir descargar \/ exportar reportes/.test(form)&&/Líneas que puede consultar/.test(form)&&/Módulos que puede visualizar/.test(form),'formulario: módulos, líneas, descargas y marcar todos');
ok(/propio/.test(form)&&/Administrador/.test(form)&&/modoVisualizacionHistorial/.test(form),'formulario: no sobre la propia cuenta, solo Administrador, con historial de cambios');
ok(!/permisos\s*=\s*modo/.test(form),'formulario: no reemplaza los permisos operativos con la selección del modo');

const cat=V.MODULOS.map(m=>m.etq).join('|');
ok(!/Nuevo registro|Crear y editar|Eliminar registros|Reabrir producción|Confirmar y cambiar/.test(cat),'catálogo: etiquetas de consulta, no de modificación');
ok(V.MODULOS.length>=14&&!V.MODULOS.some(m=>/perdidas|econ/i.test(m.clave)),'catálogo: módulos reales y sin Impacto Económico');

const inicio=leer('js/accesos/32-dashboard-perfiles.js');
const cuerpo=inicio.slice(inicio.indexOf('function cpEjecutivoHTML'),inicio.indexOf('function cpEjecutivoStyles'));
const pos=n=>cuerpo.indexOf(n,cuerpo.indexOf('return `<div class="cp-ex-kpis">'));
ok(pos('class="cp-ex-kpis"')<pos('<h3>Producción por línea</h3>')&&pos('<h3>Producción por línea</h3>')<pos('<h3>Alertas importantes</h3>')&&pos('<h3>Alertas importantes</h3>')<pos('<h2>RESUMEN DE PRODUCCIÓN</h2>'),'Inicio: indicadores → producción por línea → alertas → RESUMEN DE PRODUCCIÓN al final');
ok(cuerpo.split('<h2>RESUMEN DE PRODUCCIÓN</h2>').length===2,'Inicio: el encabezado del resumen no se duplica');
const idx=leer('index.html');
ok(idx.indexOf('23-gerente-solo-lecutra.js')<idx.indexOf('23b-modo-visualizacion.js')&&idx.indexOf('10-usuarios.js')<idx.indexOf('10b-modo-visualizacion-form.js'),'index: orden de carga');

console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
