/* =============================================================
   GLACIAL · CLOUD FUNCTIONS PARA EL PIN DE TÉCNICOS DE MANTENIMIENTO
   -------------------------------------------------------------
   NO se despliega solo: requiere plan Blaze y `firebase init functions`.
   Pasos:
     1) Copiar este archivo a functions/ y exportarlo desde functions/index.js:
          Object.assign(exports, require('./mantenimiento-pin'));
     2) npm i firebase-admin firebase-functions   (dentro de functions/)
     3) firebase deploy --only functions
     4) En js/nucleo/01-config.js:  window.MANT_PIN_MODO='functions';
     5) Reglas de Firestore: sin acceso de clientes a la colección
        `mantPines` (match /mantPines/{id} { allow read, write: if false; }).

   El PIN (PBKDF2 + sal) vive en la colección privada `mantPines`, solo
   accesible por el servidor. El navegador nunca ve el hash. Cada función
   exige que quien llama sea la cuenta compartida (perfil en sync/perfiles).
   Devuelve un token firmado de corta duración que la app guarda como
   identificación del técnico (las fases C/D pueden exigirlo en las reglas).
   ============================================================= */
const functions=require('firebase-functions');
const admin=require('firebase-admin');
const crypto=require('crypto');

if(!admin.apps.length)admin.initializeApp();
const db=admin.firestore();

const MAX_INTENTOS=5;
const BLOQUEO_MS=10*60*1000;
const ROL='mantenimiento_compartido';

async function exigirCuentaMantenimiento(context){
  if(!context.auth)throw new functions.https.HttpsError('unauthenticated','Inicia sesión.');
  const snap=await db.doc('sync/perfiles').get();
  const mapa=(snap.exists&&snap.data().map)||{};
  const rol=mapa[context.auth.uid]&&mapa[context.auth.uid].rol;
  if(rol!==ROL&&rol!=='Administrador')
    throw new functions.https.HttpsError('permission-denied','Sin permiso.');
}
function pinOk(pin){return typeof pin==='string'&&/^\d{4,6}$/.test(pin);}
function derivar(pin,salt){
  return crypto.pbkdf2Sync(pin,Buffer.from(salt,'base64'),100000,32,'sha256').toString('base64');
}

exports.mantEstadoPin=functions.https.onCall(async(data,context)=>{
  await exigirCuentaMantenimiento(context);
  const d=await db.doc('mantPines/'+String(data.workerId)).get();
  const v=d.exists?d.data():{};
  return {tienePin:!!v.hash,bloqueadoHasta:v.bloqueadoHasta||0};
});

exports.mantCrearPin=functions.https.onCall(async(data,context)=>{
  await exigirCuentaMantenimiento(context);
  if(!pinOk(data.pin))return {ok:false,error:'PIN inválido.'};
  const ref=db.doc('mantPines/'+String(data.workerId));
  return db.runTransaction(async tx=>{
    const d=await tx.get(ref);
    if(d.exists&&d.data().hash)return {ok:false,error:'Este técnico ya tiene PIN.'};
    const salt=crypto.randomBytes(16).toString('base64');
    tx.set(ref,{salt,hash:derivar(data.pin,salt),intentos:0,bloqueadoHasta:0,creadoEn:Date.now()});
    return {ok:true};
  });
});

exports.mantVerificarPin=functions.https.onCall(async(data,context)=>{
  await exigirCuentaMantenimiento(context);
  const ref=db.doc('mantPines/'+String(data.workerId));
  return db.runTransaction(async tx=>{
    const d=await tx.get(ref);
    const v=d.exists?d.data():null;
    if(!v||!v.hash)return {ok:false,sinPin:true,error:'Este técnico aún no tiene PIN.'};
    if((v.bloqueadoHasta||0)>Date.now())
      return {ok:false,bloqueadoHasta:v.bloqueadoHasta,error:'Bloqueado por intentos fallidos.'};
    const bueno=crypto.timingSafeEqual(
      Buffer.from(derivar(String(data.pin||''),v.salt)),Buffer.from(v.hash));
    if(bueno){
      tx.update(ref,{intentos:0,bloqueadoHasta:0,ultimoAcceso:Date.now()});
      // Token de identificación (válido 12 h) para validarlo en reglas/funciones posteriores.
      return {ok:true,token:crypto.createHmac('sha256',process.env.MANT_TOKEN_SECRET||'cambiar-este-secreto')
        .update(String(data.workerId)+'.'+Math.floor(Date.now()/43200000)).digest('hex')};
    }
    const intentos=(v.intentos||0)+1;
    if(intentos>=MAX_INTENTOS){
      const hasta=Date.now()+BLOQUEO_MS;
      tx.update(ref,{intentos:0,bloqueadoHasta:hasta});
      return {ok:false,bloqueadoHasta:hasta,error:'Demasiados intentos. Técnico bloqueado.'};
    }
    tx.update(ref,{intentos});
    return {ok:false,restantes:MAX_INTENTOS-intentos,error:'PIN incorrecto.'};
  });
});
