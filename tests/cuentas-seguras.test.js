/* Cuentas de acceso (alta y restablecer clave): si el correo interno ya existe en Authentication se prueba el siguiente sufijo (hasta 40) y, si no hay ninguno
   libre, el mensaje dice qué hacer. node tests/cuentas-seguras.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

function entorno({existentes=[],usuarios=[],errorEn}={}){
  const sb={console:{log(){},warn(){},error(){},info(){}},Math,Number,Array,Object,String,Set,Map,JSON,Date,Promise,Error,Uint32Array};
  vm.createContext(sb);sb.window=sb;
  sb.llamadas=[];sb.state={user:{rol:'Administrador'}};sb.AUTH_DOMINIO='glacial.app';sb.FIREBASE_CONFIG={};
  sb.auth={};sb.escaparHtml=t=>String(t);sb.loadUsers=()=>usuarios;
  const cuentas=new Set(existentes);
  const app={auth:()=>({
    async createUserWithEmailAndPassword(email){
      sb.llamadas.push(email);
      if(errorEn&&sb.llamadas.length>=errorEn.n)throw {code:errorEn.code};
      if(cuentas.has(email))throw {code:'auth/email-already-in-use'};
      cuentas.add(email);
      return {user:{uid:'uid-'+email,async updateProfile(){}}};
    },
    async signOut(){}
  })};
  sb.firebase={apps:[],initializeApp:()=>{const a=Object.assign({name:'secundaria'},app);sb.firebase.apps.push(a);return a;}};
  vm.runInContext(leer('js/accesos/36-seguridad-auth.js'),sb);
  return sb;
}
const con=(n,base)=>Array.from({length:n},(_,i)=>`${base}${i?'.'+i:''}@glacial.app`);

(async()=>{
  let sb=entorno();
  let r=await sb.crearCuentaSeguraLibre('yennyvertiz','Clave123x');
  ok(r.email==='yennyvertiz@glacial.app'&&r.idx===0&&sb.llamadas.length===1,'usuario nuevo sin cuenta previa: usa el correo sin sufijo (1 solo intento)');

  sb=entorno({existentes:con(10,'yennyvertiz')});
  r=await sb.crearCuentaSeguraLibre('yennyvertiz','Clave123x');
  ok(r.email==='yennyvertiz.10@glacial.app'&&r.idx===10&&sb.llamadas.length===11,'con 10 cuentas viejas del mismo nombre (antes fallaba tras 6): usa el siguiente correo libre');

  sb=entorno({existentes:con(40,'yennyvertiz')});
  let e;try{await sb.crearCuentaSeguraLibre('yennyvertiz','Clave123x');}catch(x){e=x;}
  ok(e&&e.code==='glacial/sin-correo-libre'&&/Supabase/.test(e.message)&&/yennyvertiz@glacial\.app/.test(e.message)&&/yennyvertiz\.39@glacial\.app/.test(e.message)&&sb.llamadas.length===40,'si de verdad no hay correo libre: se prueban 40 y el mensaje dice el rango y que hay que borrar cuentas sin uso en Authentication');
  ok(!/No se pudo crear una cuenta única/.test(e.message),'ya no sale el mensaje genérico');

  sb=entorno({errorEn:{n:1,code:'auth/weak-password'}});
  e=null;try{await sb.crearCuentaSeguraLibre('ana','corta');}catch(x){e=x;}
  ok(e&&e.code==='auth/weak-password'&&sb.llamadas.length===1,'cualquier otro error se informa de inmediato (sin reintentos inútiles)');

  sb=entorno({usuarios:[{username:'ana',authEmail:'ana@glacial.app'}]});
  r=await sb.crearCuentaSeguraLibre('ana','Clave123x');
  ok(r.email==='ana.1@glacial.app'&&sb.llamadas.length===1,'un correo que ya usa otro usuario de la lista se salta sin llamar al servidor');

  sb=entorno({existentes:['maria@glacial.app','maria.1@glacial.app']});
  const nums=[];
  r=await sb.crearCuentaSeguraLibre('María Pérez','Clave123x');
  ok(r.email==='maria_perez@glacial.app'||/^maria_perez/.test(r.email),'el nombre se normaliza al correo interno (sin tildes ni espacios)');

  const u10=leer('js/accesos/10-usuarios.js');
  ok(/crearCuentaSeguraLibre\(\s*username,\s*password\s*\)/.test(u10)&&/authIdx:seguro\.idx\|\|0/.test(u10),'el alta de usuarios usa el correo libre y guarda su índice (authIdx)');
  const s36=leer('js/accesos/36-seguridad-auth.js');
  ok(/INTENTOS_CUENTA=40/.test(s36)&&/crearConReintentos\(username,clave,\(u\.authIdx\|\|0\)\+1,usados\)/.test(s36),'restablecer clave sigue empezando después del índice actual y con el nuevo límite');
  console.log(fallas?fallas+' fallas':'todo correcto');
})();
