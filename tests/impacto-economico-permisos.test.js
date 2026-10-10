/* Impacto económico: permisos explícitos (ver / gestionar), valor unitario por línea, guardado con validaciones, reglas y pantalla. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

function crearDb(){
  const docs=new Map(),oyentes=[];
  const ref=(col,id)=>({__col:col,__id:id,get:async()=>({exists:docs.has(col+'/'+id),data:()=>docs.get(col+'/'+id)}),
    onSnapshot(cb){cb({exists:docs.has(col+'/'+id),data:()=>docs.get(col+'/'+id)});return()=>{};}});
  const lista=n=>({docs:[...docs.entries()].filter(([k])=>k.startsWith(n+'/')).map(([k,v])=>({id:k.split('/')[1],data:()=>v}))});
  const col=n=>({doc:id=>ref(n,id),onSnapshot(cb){const o={n,cb,vivo:true};oyentes.push(o);cb(lista(n));return()=>{o.vivo=false;};},get:async()=>lista(n)});
  const fus=(a,b)=>{const r=Object.assign({},a);Object.keys(b).forEach(k=>{r[k]=(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&b[k].__ts!==true&&a&&typeof a[k]==='object'&&a[k])?fus(a[k],b[k]):b[k];});return r;};
  return {docs,oyentes,db:{collection:col,runTransaction:async fn=>{const w=[];const r=await fn({get:async x=>x.get(),set:(x,d,o)=>w.push([x,d,o])});
    w.forEach(([x,d,o])=>{const k=x.__col+'/'+x.__id;docs.set(k,o&&o.merge?fus(docs.get(k)||{},d):d);});oyentes.filter(o=>o.vivo).forEach(o=>o.cb(lista(o.n)));return r;}}};
}
function entorno(usuario,extra){
  const F=crearDb();
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout};vm.createContext(sb);sb.window=sb;
  sb.db=F.db;sb.auth={currentUser:{uid:'uid-'+usuario.rol}};
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>({__ts:true})}}};
  sb.state={user:usuario};sb.glacialCierresSesion=[];sb.document={getElementById:()=>null};
  Object.assign(sb,extra||{});
  vm.runInContext(leer('js/produccion/55-valores-economicos.js'),sb);
  return {sb,F};
}
const eco=sb=>sb.window.glacialEconomico;

(async()=>{
/* 1) Matriz de permisos */
const P=entorno({rol:'Gerente'}).sb.window.glacialEcoPermisos.de;
const m=(rol,economico,extra)=>P(Object.assign({rol,economico},extra||{}));
ok(m('Gerente').ver&&m('Gerente').gestionar&&m('Gerente General').gestionar,'Gerencia sin permiso explícito conserva ver + gestionar (autorización existente)');
ok(!m('Gerente',{ver:false,gestionar:false}).ver&&!m('Gerente',{ver:false,gestionar:false}).gestionar,'Gerencia con permiso explícito revocado: ni ve ni gestiona');
ok(!m('Jefe de Producción').ver&&!m('Jefatura').gestionar,'Jefatura sin permiso explícito: no ve nada');
ok(m('Jefatura',{ver:true}).ver&&!m('Jefatura',{ver:true,gestionar:true}).gestionar,'Jefatura con ver: solo consulta; gestionar nunca se concede');
ok(!m('Administrador').ver&&!m('Administrador').gestionar&&!m('Administrador',undefined,{permisos:'todos'}).ver,'Administrador no tiene nada por defecto ni con permisos «todos»');
ok(m('Administrador',{gestionar:true}).ver&&m('Administrador',{gestionar:true}).gestionar,'Administrador con gestionar habilitado: gestiona y, por implicación, ve');
ok(!m('Supervisor',{ver:true,gestionar:true}).ver&&!m('RRHH',{ver:true}).ver&&!m('Ventas',{gestionar:true}).gestionar,'roles no elegibles no reciben acceso aunque tengan el campo');

/* 2) Niveles y revocación en vivo */
const adm=entorno({rol:'Administrador',username:'a',economico:{gestionar:true}});
adm.sb.window.glacialEconomicoEscuchas();
ok(eco(adm.sb).puedeGestionar()&&eco(adm.sb).esGerencia()&&eco(adm.sb).nivel()==='gerencia','Administrador habilitado: gestiona valores (nivel de gestión) sin ser Gerente');
adm.sb.state.user.economico={ver:false,gestionar:false};adm.sb.window.glacialEconomicoEscuchas();
ok(!eco(adm.sb).puedeGestionar()&&!eco(adm.sb).puedeVer()&&Object.keys(eco(adm.sb).docs().general).length===0,'al revocar el permiso se pierde el acceso y se vacían los valores de memoria');
ok(/permiso/i.test(eco(adm.sb).motivoSinEdicion()||''),'sin permiso hay un motivo explícito (no falla en silencio)');

/* 3) Guardado: validaciones */
const g=entorno({rol:'Gerente',username:'g'});g.sb.window.glacialEconomicoEscuchas();
const err=async d=>{try{await eco(g.sb).guardar(d);return '';}catch(e){return e.message;}};
ok(/campo vacío/.test(await err({tipo:'linea',linea:'PET1',valor:''})),'valor vacío se rechaza (no se guarda como cero)');
ok(/mayor o igual/.test(await err({tipo:'linea',linea:'PET1',valor:'abc'}))&&/mayor o igual/.test(await err({tipo:'linea',linea:'PET1',valor:-1})),'valor no numérico o negativo se rechaza');
ok(/fecha/i.test(await err({tipo:'linea',linea:'PET1',valor:1,fecha:'2026-13-45'})),'fecha de vigencia inválida se rechaza');
ok(/Línea no válida/.test(await err({tipo:'linea',linea:'XX',valor:1})),'línea desconocida se rechaza');
ok((await err({tipo:'linea',linea:'PET1',valor:'0,12',fecha:'2026-01-01'}))==='','valor con coma decimal se acepta');
const dl=g.F.docs.get('valoresUnitarios/L__pet1');
ok(dl&&dl.tipo==='linea'&&dl.unidad==='Botella'&&dl.valorUnitario===0.12&&dl.version===1&&dl.actualizadoPorUid==='uid-Gerente'&&dl.actualizadoPorNombre==='g','valor por línea: tipo linea, unidad Botella, versión, UID y nombre');
ok(g.F.docs.has('valoresUnitariosHistorial/L__pet1_1'),'el valor por línea deja su historial en la misma transacción');
ok((await err({tipo:'linea',linea:'B20L',valor:0,fecha:'2026-01-01'}))===''&&g.F.docs.get('valoresUnitarios/L__b20l').valorUnitario===0,'cero explícito es un valor válido');
ok(g.F.docs.get('valoresUnitarios/L__b20l').unidad==='Bidón'&&(await err({tipo:'linea',linea:'C20L',valor:1}))===''&&g.F.docs.get('valoresUnitarios/L__c20l').unidad==='Caja','unidades por línea: Bidón (B20L) y Caja (C20L)');
const sinPerm=entorno({rol:'Jefatura',username:'j',economico:{ver:true}});sinPerm.sb.window.glacialEconomicoEscuchas();
let e2='';try{await eco(sinPerm.sb).guardar({tipo:'linea',linea:'PET1',valor:1});}catch(e){e2=e.message;}
ok(e2&&![...sinPerm.F.docs.keys()].some(k=>k.startsWith('valoresUnitarios')),'Jefatura con solo consulta no puede guardar valores');
const vis=entorno({rol:'Gerente',username:'g'},{glacialVista:{activo:()=>true}});vis.sb.window.glacialEconomicoEscuchas();
let e3='';try{await eco(vis.sb).guardar({tipo:'linea',linea:'PET1',valor:1});}catch(e){e3=e.message;}
ok(![...vis.F.docs.keys()].some(k=>k.startsWith('valoresUnitarios')),'Modo visualización general no deja guardar valores (mensaje: «'+e3+'»)');

/* 4) Resolución: específico → línea → pendiente */
try{vm.runInContext(leer('js/produccion/50-impacto-economico.js'),g.sb);}catch(e){console.log('(50 no cargó en el entorno mínimo: '+e.message+')');}
const IE=g.sb.window.glacialImpactoEconomico;
if(IE){
  await eco(g.sb).guardar({tipo:'producto',linea:'PET1',marca:'Scala',presentacion:'2.5 L',valor:0.3,fecha:'2026-01-01'});
  const prov=IE.provDefecto();
  const p=(marca,pres,fecha,linea)=>({linea:linea||'PET1',marcaN:marca,cat:pres,marca,pres,fecha});
  const r1=prov.margenDe(p('Scala','2.5 L','2026-06-01')),r2=prov.margenDe(p('Otra','500 ml','2026-06-01')),r3=prov.margenDe(p('Otra','500 ml','2025-06-01'));
  ok(r1&&r1.valor===0.3,'con valor específico se usa el específico');
  ok(r2&&r2.valor===0.12,'sin específico se usa el valor general de la línea');
  ok(!r3,'una vigencia futura no se aplica a eventos anteriores (queda sin valor unitario configurado)');
  const p2=prov.margenDe(p('X','20 L','2026-06-01','B20L'));
  ok(p2&&p2.valor===0,'valor cero explícito de la línea se respeta (no se confunde con vacío)');
  ok(!prov.margenDe(p('X','7 L','2026-06-01','B7L')),'línea sin valor y sin específico: pendiente («Sin valor unitario configurado»)');
}else ok(false,'50-impacto-economico.js carga en el entorno de prueba');

/* 5) Usuarios: aplicarCambio (10c) */
const sbU=entorno({rol:'Administrador',username:'adm'}).sb;
sbU.loadUsers=()=>[];sbU.saveUsers=()=>{};
vm.runInContext(leer('js/accesos/10c-impacto-economico-permisos.js'),sbU);
const U=sbU.window.glacialEcoUsuarios;
const L=[{username:'ger',rol:'Gerente'},{username:'jef',rol:'Jefatura'},{username:'ad2',rol:'Administrador'},{username:'sup',rol:'Supervisor'}];
ok(U.aplicarCambio(L,'jef',true,true,'adm').ok===false,'Jefatura: no se puede conceder gestionar');
ok(U.aplicarCambio(L,'sup',true,false,'adm').ok===false,'rol no elegible: se rechaza');
ok(U.aplicarCambio(L,'zzz',true,false,'adm').ok===false,'usuario inexistente: se rechaza');
let r=U.aplicarCambio(L,'jef',true,false,'adm');
ok(r.ok&&r.cambio&&L[1].economico.ver===true&&L[1].economico.gestionar===false&&L[1].economicoHistorial.length===1&&L[1].economico.actualizadoPor==='adm','Jefatura con ver: queda guardado con quién y cuándo, más historial');
r=U.aplicarCambio(L,'ad2',false,true,'adm');
ok(r.ok&&L[2].economico.gestionar&&L[2].economico.ver&&L[2].economico.temporal===true,'Administrador habilitado: gestionar implica ver y queda marcado como temporal');
r=U.aplicarCambio(L,'ad2',false,false,'adm');
ok(r.ok&&!L[2].economico.ver&&!L[2].economico.gestionar&&L[2].economico.temporal===false&&L[2].economicoHistorial.length===2,'revocar: sin acceso y con historial');
ok(U.aplicarCambio(L,'jef',true,false,'adm').cambio===false,'sin cambios reales no se escribe nada');
r=U.aplicarCambio(L,'ger',true,true,'adm');
ok(r.ok&&r.cambio===false,'Gerencia sin campo con ver+gestionar ya es el estado vigente: sin cambios');

/* 6) Perfiles, reglas, pantalla */
const seg=leer('js/accesos/36-seguridad-auth.js');
ok(/glacialEcoPermisos/.test(seg)&&/eco/.test(seg),'publicarPerfiles publica el campo eco {ver, gestionar}');
const reglas=leer('firestore.rules.etapa2.txt');
ok(!/esGerencia\(\)|esJefaturaEco\(\)/.test(reglas.replace(/\/\/[^\n]*/g,'')),'las reglas ya no usan esGerencia()/esJefaturaEco() para lo económico');
ok(/valoresUnitarios[^]*?'linea'/.test(reglas),'las reglas aceptan valores de tipo línea');
const dash=leer('js/produccion/58-impacto-dashboard.js');
ok((dash.match(/data-id-valores/g)||[]).length>=4,'el botón CONFIGURAR VALORES UNITARIOS aparece en el encabezado, en la pestaña y en los estados de carga');
ok(/CONFIGURAR VALORES UNITARIOS/.test(dash)&&/accesoGestion/.test(dash),'el formulario es alcanzable aunque no haya datos, producción ni gráficos');
ok(!/if\(eco\(\)&&eco\(\)\.esGerencia\(\)\)eco\(\)\.abrirPantalla/.test(dash),'el clic ya no depende del rol: el formulario explica el motivo si no hay permiso');
ok(/tienePermiso\('exportarExcel'\)/.test(dash)&&/puedeVer\(\)/.test(dash),'exportar en soles exige exportación y permiso de consulta vigente');
const idx=leer('index.html');
ok(idx.indexOf('55-valores-economicos.js')<idx.indexOf('10c-impacto-economico-permisos.js')&&idx.indexOf('10b-modo-visualizacion-form.js')<idx.indexOf('10c-impacto-economico-permisos.js'),'index: 10c se carga después de 10b y de 55');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
