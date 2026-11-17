/* Sesión guardada en el equipo: almacén con vencimiento a los 7 días sin uso (crearAlmacenSesion, 00b-puente-supabase.js). */
const fs=require('fs'),path=require('path'),vm=require('vm');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');
const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,Error,setTimeout,clearTimeout};sb.window=sb;sb.globalThis=sb;
vm.createContext(sb);vm.runInContext(leer('js/nucleo/00b-puente-supabase.js'),sb);
const {crearAlmacenSesion,SESION_DIAS_SIN_USO}=sb.__GLACIAL_PUENTE__;
const almacen=(ini)=>{const m=new Map(Object.entries(ini||{}));return {m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v));},removeItem:k=>{m.delete(k);}};};
const roto=()=>({getItem(){throw new Error('x');},setItem(){throw new Error('bloqueado');},removeItem(){}});
const K='firebase:authUser:glacial:proyecto',U=K+':ultimo-uso',DIA=24*60*60*1000,HORA=60*60*1000;
let t=1e12;const reloj=()=>t;

ok(SESION_DIAS_SIN_USO===7,'la sesión vence a los 7 días sin uso');

/* guardar y leer */
let L=almacen(),S=almacen(),a=crearAlmacenSesion(L,S,K,reloj);
a.setItem(K,'SESION');
ok(L.m.get(K)==='SESION'&&!S.m.has(K)&&Number(L.m.get(U))===t,'la sesión se guarda en el equipo (no en la pestaña) con su marca de uso');
ok(crearAlmacenSesion(L,almacen(),K,reloj).getItem(K)==='SESION','al cerrar y volver a abrir la app (pestaña nueva), la sesión sigue ahí');

/* uso y vencimiento */
t+=6*DIA;ok(a.getItem(K)==='SESION'&&Number(L.m.get(U))===t,'a los 6 días sin uso sigue vigente, y abrirla renueva la marca');
t+=6*DIA;ok(a.getItem(K)==='SESION','otros 6 días después (se usó en medio) sigue vigente');
t+=30*60*1000;const marca=L.m.get(U);a.getItem(K);ok(L.m.get(U)===marca,'la marca no se reescribe en cada lectura (como mucho una vez por hora)');
t+=7*DIA+HORA;
ok(a.getItem(K)===null&&!L.m.has(K)&&!L.m.has(U)&&a.vencida===true,'7 días sin uso: la sesión se borra del equipo y se pide entrar de nuevo');
a.setItem(K,'NUEVA');ok(a.getItem(K)==='NUEVA'&&a.vencida===false,'tras volver a entrar, la sesión nueva queda guardada');

/* cerrar sesión */
a.removeItem(K);ok(!L.m.has(K)&&!L.m.has(U),'cerrar sesión borra la sesión y su marca');

/* otras claves no se tocan */
a.setItem('otra','1');t+=30*DIA;ok(a.getItem('otra')==='1'&&!L.m.has('otra:ultimo-uso'),'las demás claves no vencen ni llevan marca');

/* paso desde la pestaña (quien ya estaba dentro no vuelve a entrar) */
L=almacen();S=almacen({[K]:'ABIERTA',rdp_session_v1:'{}'});a=crearAlmacenSesion(L,S,K,reloj);
ok(a.getItem(K)==='ABIERTA'&&!S.m.has(K)&&S.m.has('rdp_session_v1'),'la sesión abierta en la pestaña pasa al equipo; el contexto de la pestaña no se toca');
L=almacen({[K]:'DEL-EQUIPO',[U]:String(t)});S=almacen({[K]:'VIEJA'});a=crearAlmacenSesion(L,S,K,reloj);
ok(a.getItem(K)==='DEL-EQUIPO'&&!S.m.has(K),'si el equipo ya tiene sesión, manda la del equipo');

/* sesión sin marca (p. ej. se borró a medias): no se expulsa, se marca */
L=almacen({[K]:'SIN-MARCA'});a=crearAlmacenSesion(L,almacen(),K,reloj);
ok(a.getItem(K)==='SIN-MARCA'&&Number(L.m.get(U))===t,'una sesión sin marca de uso no se expulsa: empieza a contar desde ahora');

/* navegadores que bloquean el almacenamiento */
S=almacen();ok(crearAlmacenSesion(roto(),S,K,reloj)===S,'sin almacenamiento del equipo: se usa la pestaña, como antes');
ok(crearAlmacenSesion(null,null,K,reloj)===undefined&&crearAlmacenSesion(roto(),roto(),K,reloj)===undefined,'sin ningún almacenamiento: no se guarda (el login lo avisa)');

/* página */
const html=leer('index.html'),cfg=leer('js/nucleo/01-config.js'),puente=leer('js/nucleo/00b-puente-supabase.js');
ok(/\[sessionStorage,localStorage\]/.test(html),'«Recuperando sesión…» también aparece cuando la sesión está guardada en el equipo');
ok(/Persistence\.LOCAL/.test(cfg)&&/crearAlmacenSesion\(tomar\('localStorage'\), tomar\('sessionStorage'\)/.test(puente),'la página usa el almacén del equipo');
ok(/sessionStorage/.test(leer('js/mantenimiento/37b-mantenimiento-identificacion.js'))&&!/localStorage\.setItem\(CLAVE/.test(leer('js/mantenimiento/37b-mantenimiento-identificacion.js')),'cuenta compartida de Mantenimiento: el técnico se sigue identificando con su PIN en cada apertura');
console.log(fallas?('\n'+fallas+' FALLA(S)'):'\nTodo correcto');process.exit(fallas?1:0);
