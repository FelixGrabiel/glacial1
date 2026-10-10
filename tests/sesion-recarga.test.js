/* Sesión al recargar: identidad por Firebase Auth, contexto local auxiliar, estados cargando/error/ausente/denegado, cierre y cancelación. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const f03=leer('js/accesos/03-auth.js');
const usuarioSinCred=(()=>{const s=leer('js/nucleo/05-utils.js');const i=s.indexOf('function usuarioSinCredenciales(u)');let d=0,j=s.indexOf('{',i);for(let k=j;k<s.length;k++){if(s[k]==='{')d++;else if(s[k]==='}'&&!--d)return s.slice(i,k+1);}})();

/* ---- entorno ---- */
function entorno(o){
  o=o||{};
  const sb={console:{log(){},warn(){},error(){},info(){}},Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map};
  vm.createContext(sb);sb.window=sb;
  // reloj controlable
  let t=0,seq=0;const cola=[];
  sb.setTimeout=(fn,ms)=>{const id=++seq;cola.push({id,at:t+(ms||0),fn});return id;};
  sb.clearTimeout=id=>{const i=cola.findIndex(x=>x.id===id);if(i>=0)cola.splice(i,1);};
  sb.avanzar=async ms=>{t+=ms;for(;;){const i=cola.findIndex(x=>x.at<=t);if(i<0)break;const [x]=cola.splice(i,1);x.fn();await Promise.resolve();}};
  // DOM mínimo
  const els={};
  const mk=(id,extra)=>els[id]=Object.assign({id,style:{display:o.visibleInicial&&o.visibleInicial[id]||''},textContent:'',value:'',_hijos:{}},extra||{});
  ['login-screen','app-screen','report-select-screen','login-user','login-pass','login-error'].forEach(id=>mk(id));
  const hijos={'[data-sesion-texto]':{style:{},textContent:''},'[data-sesion-spinner]':{style:{display:''}},'[data-sesion-acciones]':{style:{display:'none'}}};
  mk('sesion-recuperando',{querySelector:s=>hijos[s]||null});
  sb.hijos=hijos;sb.els=els;
  sb.document={getElementById:id=>els[id]||null};
  // sessionStorage
  const store=Object.assign({},o.session||{});
  sb.sessionStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];},get length(){return Object.keys(store).length;}};
  sb.store=store;
  sb.DB_SESSION='rdp_session_v1';
  // Firebase Auth simulado
  const oyentes=[];sb.llamadas={signOut:0,onAuth:0,enterApp:0,iniciarSync:0,detener:0,cierres:0,forzar:0};
  sb.authUsuario=o.authUsuario===undefined?null:o.authUsuario;
  sb.auth={
    onAuthStateChanged(ok_,err){sb.llamadas.onAuth++;const r={ok:ok_,err};oyentes.push(r);
      if(!o.authManual)Promise.resolve().then(()=>{if(o.authError)err&&err(new Error('network'));else ok_(sb.authUsuario);});
      return ()=>{const i=oyentes.indexOf(r);if(i>=0)oyentes.splice(i,1);};},
    signOut(){sb.llamadas.signOut++;sb.authUsuario=null;return o.signOutLento?new Promise(()=>{}):Promise.resolve();}
  };
  sb.emitirAuth=u=>{sb.authUsuario=u;oyentes.slice().forEach(r=>r.ok(u));};
  sb.REGLAS_ESTRICTAS=true;
  sb.iniciarSincronizacionSegura=()=>{sb.llamadas.iniciarSync++;};
  sb.detenerSincronizacion=()=>{sb.llamadas.detener++;};
  sb.glacialCerrarEscuchasDeSesion=()=>{sb.llamadas.cierres++;};
  sb.confirmarAbandonoRotacionPendiente=()=>true;
  sb.esperarUsuariosListos=o.esperar||(async()=>true);
  sb.usuarios=o.usuarios||[{username:'ana',rol:'Supervisor',linea:'PET1',authUid:'u1',permisos:['nuevo'],password:'x',passwordHash:'h',salt:'s',nombre:'Ana'},
    {username:'root',rol:'Administrador',authUid:'u2',permisos:'todos',nombre:'Root'},
    {username:'mtto',rol:'mantenimiento_compartido',authUid:'u3',permisos:['control_operativo_lineas'],nombre:'Mtto'}];
  sb.loadUsers=()=>sb.usuarios;
  sb.state={user:null,currentLine:''};
  sb.enterApp=()=>{sb.llamadas.enterApp++;els['login-screen'].style.display='none';els['report-select-screen'].style.display='flex';};
  sb.aplicarContextoRotacionSupervisor=()=>{};
  sb.debeCambiarClaveSegura=()=>!!o.temporal;
  sb.forzarCambioClave=async()=>{sb.llamadas.forzar++;return o.cambioOk!==false;};
  vm.runInContext(usuarioSinCred,sb);
  vm.runInContext(f03,sb);
  sb.__enter=()=>{sb.llamadas.enterApp++;els['login-screen'].style.display='none';els['report-select-screen'].style.display='flex';};
  vm.runInContext('enterApp=function(){__enter();};',sb);   // se sustituye enterApp (la real toca toda la interfaz)
  return sb;
}
const sesion=(extra)=>JSON.stringify(Object.assign({username:'ana',rol:'Supervisor',authUid:'u1',permisos:['nuevo']},extra||{}));
const esp=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};
const visible=(sb,id)=>sb.els[id].style.display!=='none'&&sb.els[id].style.display!=='';

(async()=>{
  /* 1) login válido seguido de F5 */
  let sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()}});
  sb.tryResumeSession();await esp();
  ok(sb.llamadas.enterApp===1&&sb.state.user&&sb.state.user.username==='ana'&&sb.state.currentLine==='PET1','F5 con sesión vigente: se recupera la sesión y se entra (sin pedir contraseña)');
  ok(sb.els['login-screen'].style.display==='none'&&sb.els['sesion-recuperando'].style.display==='none','el login no queda visible y la pantalla de recuperación se oculta');
  ok(!('password' in sb.state.user)&&!('passwordHash' in sb.state.user)&&!('salt' in sb.state.user),'state.user se reconstruye sin contraseña, hash ni salt');
  ok(!/token|accessToken|password/i.test(sb.store.rdp_session_v1||''),'el contexto guardado no incluye contraseñas ni tokens');
  /* varias recargas consecutivas */
  let n=0;for(let i=0;i<4;i++){const s2=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sb.store.rdp_session_v1}});s2.tryResumeSession();await esp();n+=s2.llamadas.enterApp;sb=s2;}
  ok(n===4&&sb.llamadas.signOut===0,'varias recargas consecutivas: entra siempre y nunca cierra la sesión de Firebase');
  /* 2) Firebase vigente con DB_SESSION ausente */
  sb=entorno({authUsuario:{uid:'u1'},session:{}});sb.tryResumeSession();await esp();
  ok(sb.llamadas.enterApp===1&&sb.state.user.username==='ana','sesión de Firebase vigente con el contexto local ausente: se recupera igual');
  /* 3) JSON inválido */
  sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:'{no es json'}});sb.tryResumeSession();await esp();
  ok(sb.llamadas.enterApp===1&&sb.state.user.username==='ana'&&JSON.parse(sb.store.rdp_session_v1).username==='ana','JSON local inválido: se ignora y se reemplaza por un contexto nuevo');
  /* 4) contexto de otra cuenta */
  sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion({username:'root',rol:'Administrador',authUid:'u2',permisos:'todos'})}});sb.tryResumeSession();await esp();
  ok(sb.state.user.username==='ana'&&sb.state.user.rol==='Supervisor'&&sb.state.user.permisos[0]==='nuevo'&&JSON.parse(sb.store.rdp_session_v1).authUid==='u1','el contexto de OTRA cuenta no se restaura: ni su identidad ni sus permisos (manda el perfil del UID autenticado)');
  /* permisos vigentes: el perfil actual, no los guardados */
  sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion({permisos:'todos',rol:'Administrador'})}});sb.tryResumeSession();await esp();
  ok(sb.state.user.rol==='Supervisor'&&Array.isArray(sb.state.user.permisos),'se aplican los permisos VIGENTES del perfil, no los que tenía el contexto local');
  /* 5) perfil que tarda */
  let liberar;sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()},esperar:()=>new Promise(r=>{liberar=r;})});
  sb.tryResumeSession();await esp();
  ok(sb.llamadas.enterApp===0&&sb.els['sesion-recuperando'].style.display==='flex'&&sb.els['login-screen'].style.display==='none'&&/Recuperando sesión/.test(sb.hijos['[data-sesion-texto]'].textContent),'mientras el perfil carga se muestra «Recuperando sesión…» y NO el login');
  liberar(true);await esp();
  ok(sb.llamadas.enterApp===1,'el perfil que tarda más de lo normal termina entrando');
  /* 6) perfil que no llega (tiempo agotado) y error de red con Reintentar */
  sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()},esperar:async()=>false});sb.tryResumeSession();await esp();
  ok(sb.llamadas.enterApp===0&&sb.llamadas.signOut===0&&sb.store.rdp_session_v1&&sb.els['sesion-recuperando'].style.display==='flex'&&sb.hijos['[data-sesion-acciones]'].style.display==='flex'&&/perfil/.test(sb.hijos['[data-sesion-texto]'].textContent),'perfil que no llega: mensaje y «Reintentar»; NO se cierra la sesión ni se borra el contexto');
  ok(sb.els['login-screen'].style.display==='none','el error de carga no muestra el login');
  sb.esperarUsuariosListos=async()=>true;sb.reintentarRecuperarSesion();await esp(8);
  ok(sb.llamadas.detener===1&&sb.llamadas.enterApp===1,'Reintentar reinicia las escuchas una vez y entra cuando la carga se recupera');
  sb=entorno({authError:true,session:{rdp_session_v1:sesion()}});sb.tryResumeSession();await esp();
  ok(sb.llamadas.enterApp===0&&sb.llamadas.signOut===0&&sb.hijos['[data-sesion-acciones]'].style.display==='flex'&&/conexión/.test(sb.hijos['[data-sesion-texto]'].textContent)&&sb.store.rdp_session_v1,'error de red al comprobar la sesión: mensaje y Reintentar, sin cerrar sesión');
  sb=entorno({authManual:true,session:{rdp_session_v1:sesion()}});sb.tryResumeSession();await esp();await sb.avanzar(15001);await esp();
  ok(sb.llamadas.enterApp===0&&sb.hijos['[data-sesion-acciones]'].style.display==='flex'&&sb.els['login-screen'].style.display==='none','Auth que nunca responde: tras el tope aparece el error con Reintentar (no el login)');
  /* 7) sesión realmente cerrada */
  sb=entorno({authUsuario:null,session:{rdp_session_v1:sesion()}});sb.tryResumeSession();await esp();
  ok(sb.els['login-screen'].style.display==='flex'&&sb.els['sesion-recuperando'].style.display==='none'&&sb.llamadas.enterApp===0&&sb.store.rdp_session_v1===undefined,'Firebase confirma que no hay sesión: aparece el login y el contexto local sin valor se limpia');
  sb=entorno({authUsuario:null,session:{}});sb.tryResumeSession();await esp();
  ok(sb.els['login-screen'].style.display==='flex','sin sesión ni contexto: login');
  /* 8) cierre explícito seguido de recarga */
  sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()}});sb.tryResumeSession();await esp();
  const alt=sb.handleLogout();await esp(8);await alt;
  ok(sb.llamadas.signOut===1&&sb.llamadas.cierres===1&&sb.store.rdp_session_v1===undefined&&sb.state.user===null&&sb.els['login-screen'].style.display==='flex','cierre explícito: cierra escuchas y la sesión de Firebase, limpia el contexto y muestra el login');
  const tras=entorno({authUsuario:sb.authUsuario,session:Object.assign({},sb.store)});tras.tryResumeSession();await esp();
  ok(tras.llamadas.enterApp===0&&tras.els['login-screen'].style.display==='flex','recarga después del cierre: no se reingresa');
  /* logout sin red: no se queda colgado */
  sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()},signOutLento:true});sb.tryResumeSession();await esp();
  const p=sb.handleLogout();await esp();ok(sb.els['sesion-recuperando'].style.display==='flex','mientras Firebase cierra se muestra «Cerrando sesión…»');
  await sb.avanzar(4001);await esp(8);await p;ok(sb.els['login-screen'].style.display==='flex','si el cierre tarda demasiado, el login aparece igualmente (tope controlado)');
  /* 9) logout durante la recuperación */
  let lib2;sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()},esperar:()=>new Promise(r=>{lib2=r;})});
  sb.tryResumeSession();await esp();const lo=sb.handleLogout();await esp(8);await lo;lib2(true);await esp(8);
  ok(sb.llamadas.enterApp===0&&sb.state.user===null&&sb.els['login-screen'].style.display==='flex','cierre durante la recuperación: la respuesta tardía NO vuelve a ingresar al usuario');
  /* dos recuperaciones simultáneas: solo vale la última */
  let l1,l2;let k=0;sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()},esperar:()=>new Promise(r=>{(k++===0?(()=>{l1=r;}):(()=>{l2=r;}))();})});
  sb.tryResumeSession();await esp();sb.tryResumeSession(true);await esp();l1(true);await esp();l2(true);await esp(8);
  ok(sb.llamadas.enterApp===1,'dos recuperaciones solapadas: se entra una sola vez');
  ok(sb.llamadas.iniciarSync===2&&sb.llamadas.detener===1,'las escuchas se inician por recuperación (idempotente en 36) y el reintento cierra las anteriores antes de reabrir');
  /* 10) cuenta compartida de Mantenimiento: conserva su identificación de técnico */
  sb=entorno({authUsuario:{uid:'u3'},session:{rdp_session_v1:sesion({username:'mtto',rol:'mantenimiento_compartido',authUid:'u3'}),mant_tecnico_ident:'TEC-7'}});sb.tryResumeSession();await esp();
  ok(sb.state.user.rol==='mantenimiento_compartido'&&sb.store.mant_tecnico_ident==='TEC-7','cuenta compartida de Mantenimiento: se recupera y no se toca su identificación de técnico');
  /* 11) Ver como: al recargar vuelve a la identidad real */
  sb=entorno({authUsuario:{uid:'u2'},session:{rdp_session_v1:JSON.stringify({username:'__vista__',nombre:'Supervisor',rol:'Supervisor',__vista:true,permisos:['nuevo']})}});sb.tryResumeSession();await esp();
  ok(sb.state.user.username==='root'&&sb.state.user.rol==='Administrador'&&!sb.state.user.__vista,'«Ver como»: al recargar vuelve a la identidad REAL; el perfil simulado no se recupera');
  /* 12) perfil inexistente (acceso denegado) */
  sb=entorno({authUsuario:{uid:'u9'},session:{rdp_session_v1:sesion()}});sb.tryResumeSession();await esp(8);
  ok(sb.llamadas.enterApp===0&&sb.llamadas.signOut===1&&sb.els['login-screen'].style.display==='flex'&&/no tiene acceso/.test(sb.els['login-error'].textContent)&&sb.store.rdp_session_v1===undefined,'sesión sin perfil autorizado: acceso denegado (no se inventa perfil) y se vuelve al login con el motivo');
  /* 13) contraseña temporal obligatoria */
  sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()},temporal:true});sb.tryResumeSession();await esp(8);
  ok(sb.llamadas.forzar===1&&sb.llamadas.enterApp===1,'clave temporal: la restauración exige el cambio antes de entrar');
  sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()},temporal:true,cambioOk:false});sb.tryResumeSession();await esp(8);
  ok(sb.llamadas.enterApp===0&&sb.llamadas.signOut===1&&sb.els['login-screen'].style.display==='flex'&&/contraseña nueva/.test(sb.els['login-error'].textContent),'si cancela el cambio obligatorio: no entra, se cierra la sesión y vuelve al login');
  /* 14) login ≠ selección de reporte */
  sb=entorno({authUsuario:{uid:'u1'},session:{rdp_session_v1:sesion()}});sb.tryResumeSession();await esp();
  ok(sb.els['report-select-screen'].style.display==='flex'&&sb.els['login-screen'].style.display==='none','tras recuperar, el usuario ve la selección de reporte (no el login)');
  /* 15) sin Firebase Auth: comportamiento anterior */
  sb=entorno({session:{rdp_session_v1:sesion()}});sb.auth=null;sb.tryResumeSession();await esp();
  ok(sb.llamadas.enterApp===1,'sin Firebase Auth disponible se conserva el comportamiento anterior (contexto local)');
  /* persistencia visible en el login */
  sb=entorno({authUsuario:null});sb.__authPersistenciaError=new Error('storage');sb.tryResumeSession();await esp();
  ok(/no permite recordar la sesión/.test(sb.els['login-error'].textContent),'si no se pudo fijar la persistencia, el login avisa que la sesión no se recordará al recargar');

  /* 16) configuración y ciclo de vida (estático) */
  const cfg=leer('js/nucleo/01-config.js'),seg=leer('js/accesos/36-seguridad-auth.js'),html=leer('index.html');
  ok(/Persistence\.SESSION/.test(cfg)&&!/Persistence\.LOCAL/.test(cfg),'la persistencia sigue siendo SESSION (no se cambió a LOCAL)');
  ok(!/setPersistence\([^)]*\)\.catch\(\(\)\s*=>\s*\{\}\)/.test(cfg)&&/__authPersistenciaError/.test(cfg)&&/console\.error\('GLACIAL · no se pudo fijar la persistencia/.test(cfg),'el error de persistencia ya no se silencia (consola + __authPersistenciaError)');
  ok(/await \(window\.__authPersistenciaLista\|\|Promise\.resolve\(\)\)/.test(seg),'el login espera a que la persistencia quede fijada antes de iniciar sesión');
  const sinUnload=['js/accesos/03-auth.js','js/personal/13-tareo.js'].every(f=>{const s=leer(f);const m=s.match(/addEventListener\('(beforeunload|unload|pagehide)'[\s\S]{0,400}?\}\);/g)||[];return m.every(b=>!/signOut|DB_SESSION|sessionStorage\.removeItem|\.clear\(/.test(b));});
  ok(sinUnload,'ningún manejador de recarga/unload/beforeunload cierra la sesión ni borra el contexto');
  ok(!/sessionStorage\.clear|localStorage\.clear/.test(f03),'no se borra todo localStorage ni sessionStorage');
  ok((html.match(/id="sesion-recuperando"/g)||[]).length===1&&/Recuperando sesión…/.test(html)&&/firebase:authUser:/.test(html),'index.html trae una sola pantalla «Recuperando sesión…» y evita el parpadeo del login');
  ok(!/currentUser/.test(f03.slice(f03.indexOf('function tryResumeSession'),f03.indexOf('function tryResumeSessionVerificada'))),'la recuperación no decide a partir de auth.currentUser: usa onAuthStateChanged');
  ok((f03.match(/(\+\+_recuperacionSesion\.n|_recuperacionSesion\.n\+\+)/g)||[]).length>=3,'cada recuperación y el cierre de sesión invalidan las anteriores');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
