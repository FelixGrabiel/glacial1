/* Verificación de firestore.rules.etapa2.txt en el EMULADOR de Firestore (no toca ningún proyecto real).
   No forma parte de «node tests/correr-todo.js» porque necesita Java y dependencias de npm:
     cd <carpeta temporal> && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
     npx firebase emulators:exec --only firestore --project demo-glacial "node <repo>/tests/reglas/etapa2-emulador.js"
   (FIRESTORE_EMULATOR_HOST lo define emulators:exec; las reglas se leen del archivo del repositorio.)
   Datos de prueba inventados. */
const fs=require('fs'),path=require('path');
const req=m=>require(require.resolve(m,{paths:[process.cwd()]}));
const {initializeTestEnvironment,assertSucceeds,assertFails}=req('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,updateDoc,deleteDoc,serverTimestamp}=req('firebase/firestore');

const REGLAS=fs.readFileSync(path.resolve(__dirname,'..','..','firestore.rules.etapa2.txt'),'utf8');
const [host,port]=(process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080').split(':');
// Como los publica js/accesos/36-seguridad-auth.js: cada entrada lleva SIEMPRE permisos (lista, aunque esté vacía, o 'todos').
const PERFILES={
  admin:{rol:'Administrador',permisos:'todos'},
  sup:{rol:'Supervisor',permisos:['paletas']},
  jefe:{rol:'Jefe de Producción',permisos:[]},
  plan:{rol:'Planificación',permisos:[]},
  mant:{rol:'mantenimiento_compartido',permisos:[]},
  supMtto:{rol:'Mantenimiento',permisos:['moduloMantenimiento']},
  vista:{rol:'Supervisor',permisos:['paletas'],soloVista:true},
  corrige:{rol:'Supervisor',permisos:['paletas','corregir_paradas']},
  gerente:{rol:'Gerente General',permisos:[],eco:{ver:true,gestionar:true}}
};
let fallas=0,total=0;
async function caso(texto,promesa){
  total++;
  try{await promesa;console.log('✔ '+texto);}
  catch(e){fallas++;console.log('✘ FALLA '+texto+' — '+(e&&e.message||e).split('\n')[0]);}
}
(async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-glacial',firestore:{rules:REGLAS,host,port:Number(port)}});
  await env.withSecurityRulesDisabled(async c=>{
    const db=c.firestore();
    await setDoc(doc(db,'sync/perfiles'),{map:PERFILES});
    await setDoc(doc(db,'sync/accesos'),{map:{}});
    await setDoc(doc(db,'sync/records'),{items:[]});
    await setDoc(doc(db,'sync/precios'),{x:1});
    await setDoc(doc(db,'sync/rotaciones'),{items:[]});
    await setDoc(doc(db,'sync/programaciones'),{items:[{clave:'a'},{clave:'b'}],updatedAt:1});
    await setDoc(doc(db,'sync/cuentasAntiguas'),{items:[]});
  });
  const como=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();

  // Login y perfiles
  await caso('sin sesión: lee sync/accesos (lo necesita el login)',assertSucceeds(getDoc(doc(como(null),'sync/accesos'))));
  await caso('sin sesión: NO lee sync/records',assertFails(getDoc(doc(como(null),'sync/records'))));
  await caso('con sesión pero sin perfil: NO lee sync/records',assertFails(getDoc(doc(como('desconocido'),'sync/records'))));
  await caso('Supervisor: lee sync/records',assertSucceeds(getDoc(doc(como('sup'),'sync/records'))));
  await caso('Supervisor: NO escribe sync/perfiles',assertFails(setDoc(doc(como('sup'),'sync/perfiles'),{map:{}})));
  await caso('Administrador: escribe sync/users',assertSucceeds(setDoc(doc(como('admin'),'sync/users'),{items:[]})));
  await caso('cuentasAntiguas: solo el Administrador la lee',Promise.all([assertSucceeds(getDoc(doc(como('admin'),'sync/cuentasAntiguas'))),assertFails(getDoc(doc(como('sup'),'sync/cuentasAntiguas')))]));

  // Datos operativos
  await caso('Supervisor: escribe sync/paletas',assertSucceeds(setDoc(doc(como('sup'),'sync/paletas'),{items:[],updatedAt:2})));
  await caso('cuenta de solo consulta: NO escribe sync/paletas',assertFails(setDoc(doc(como('vista'),'sync/paletas'),{items:[],updatedAt:3})));
  await caso('precios: solo Gerencia con permiso económico',Promise.all([assertSucceeds(getDoc(doc(como('gerente'),'sync/precios'))),assertFails(getDoc(doc(como('jefe'),'sync/precios')))]));

  // Cuenta compartida de Mantenimiento
  await caso('Mantenimiento compartido: lee programaciones',assertSucceeds(getDoc(doc(como('mant'),'sync/programaciones'))));
  await caso('Mantenimiento compartido: NO lee rotaciones de Producción',assertFails(getDoc(doc(como('mant'),'sync/rotaciones'))));
  await caso('Mantenimiento compartido: actualiza programaciones sin altas ni bajas',assertSucceeds(setDoc(doc(como('mant'),'sync/programaciones'),{items:[{clave:'a',x:1},{clave:'b'}],updatedAt:4})));
  await caso('Mantenimiento compartido: NO agrega programaciones',assertFails(setDoc(doc(como('mant'),'sync/programaciones'),{items:[{clave:'a'},{clave:'b'},{clave:'c'}],updatedAt:5})));
  await caso('Mantenimiento compartido: escribe sync/tecnicosMant (PIN)',assertSucceeds(setDoc(doc(como('mant'),'sync/tecnicosMant'),{items:[]})));
  await caso('Mantenimiento compartido: NO escribe sync/records',assertFails(setDoc(doc(como('mant'),'sync/records'),{items:[]})));

  // Bitácora y reloj
  const ev=(uid,extra)=>Object.assign({uid,timestamp:serverTimestamp(),accion:'DETENER',linea:'PET1',tecnicoNombre:'T'},extra||{});
  await caso('bitácora: evento propio con hora del servidor',assertSucceeds(setDoc(doc(como('mant'),'bitacoraMantenimiento/e1'),ev('mant'))));
  await caso('bitácora: NO con uid ajeno',assertFails(setDoc(doc(como('mant'),'bitacoraMantenimiento/e2'),ev('sup'))));
  await caso('bitácora: INICIAR solo quien opera Producción (no la cuenta compartida)',assertFails(setDoc(doc(como('mant'),'bitacoraMantenimiento/e3'),ev('mant',{accion:'INICIAR',origen:'PRODUCCION'}))));
  await caso('bitácora: Supervisor registra INICIAR con origen PRODUCCION',assertSucceeds(setDoc(doc(como('sup'),'bitacoraMantenimiento/e4'),ev('sup',{accion:'INICIAR',origen:'PRODUCCION'}))));
  await caso('bitácora: nadie la edita',assertFails(updateDoc(doc(como('admin'),'bitacoraMantenimiento/e1'),{linea:'PET2'})));
  await caso('reloj del servidor: cada uno escribe el suyo con request.time',assertSucceeds(setDoc(doc(como('sup'),'relojServidor/sup'),{t:serverTimestamp()})));
  await caso('reloj del servidor: NO el de otro usuario',assertFails(setDoc(doc(como('sup'),'relojServidor/jefe'),{t:serverTimestamp()})));

  // Planificación
  const hist=uid=>({uid,timestamp:serverTimestamp(),accion:'EDICION',linea:'PET2',fecha:'2026-10-13',turno:'NOCHE'});
  await caso('historialProgramacion: Planificación crea su evento',assertSucceeds(setDoc(doc(como('plan'),'historialProgramacion/h1'),hist('plan'))));
  await caso('historialProgramacion: Planificación lo lee; Supervisor no',Promise.all([assertSucceeds(getDoc(doc(como('plan'),'historialProgramacion/h1'))),assertFails(getDoc(doc(como('sup'),'historialProgramacion/h1')))]));
  await caso('compromisosProgramacion: Planificación crea el del bloque',assertSucceeds(setDoc(doc(como('plan'),'compromisosProgramacion/2026-10-13_NOCHE'),
    {fecha:'2026-10-13',bloque:'NOCHE',filas:[],inicioMs:1,creadoEn:serverTimestamp(),uid:'plan'})));
  await caso('compromisosProgramacion: Supervisor NO',assertFails(setDoc(doc(como('sup'),'compromisosProgramacion/2026-10-14_DÍA'),
    {fecha:'2026-10-14',bloque:'DÍA',filas:[],inicioMs:1,creadoEn:serverTimestamp(),uid:'sup'})));

  // Corrección y reclasificación de paradas (lo más reciente del archivo)
  const corr=uid=>({id:'op1',accion:'QUITAR_MARCA',linea:'PET2',fecha:'2026-10-13',turno:'NOCHE',paradas:[{id:'p1',minutos:10}],desde:{},hacia:{},minutos:10,
    motivo:'Parada mal asignada',cerrado:false,version:1,actualizadaUid:uid,actualizadaPor:'X',actualizadaEn:serverTimestamp()});
  await caso('correccionesParada: con permiso corregir_paradas, documento como lo arma 29b',assertSucceeds(setDoc(doc(como('corrige'),'correccionesParada/op1'),corr('corrige'))));
  await caso('correccionesParada: sin el permiso NO',assertFails(setDoc(doc(como('sup'),'correccionesParada/op2'),Object.assign(corr('sup'),{id:'op2'}))));
  await caso('correccionesParada: nunca se edita',assertFails(updateDoc(doc(como('corrige'),'correccionesParada/op1'),{motivo:'Otro motivo cualquiera'})));
  const recl=uid=>({id:'r1',paradaId:'p1',origen:'AVANCE',linea:'PET2',fecha:'2026-10-13',turno:'NOCHE',descripcionOriginal:'X',minutos:10,causa:'Mecánica',motivo:'Rodamiento',
    version:1,historial:[{v:1}],actualizadaUid:uid,actualizadaEn:serverTimestamp()});
  await caso('reclasificacionesParada: Supervisor de Mantenimiento crea',assertSucceeds(setDoc(doc(como('supMtto'),'reclasificacionesParada/r1'),recl('supMtto'))));
  await caso('reclasificacionesParada: la cuenta compartida NO',assertFails(setDoc(doc(como('mant'),'reclasificacionesParada/r2'),Object.assign(recl('mant'),{id:'r2'}))));

  // Tareo por documento (Fase 2: TAREO_POR_DOCUMENTO)
  const tar=id=>({id,area:'Producción',fecha:'2026-10-14',turno:'Día',personal:[{trabajadorId:'T1',asistencia:'Asistió'}],actualizadoEn:1});
  await caso('tareos/{id}: el Supervisor crea su tareo con id coherente',assertSucceeds(setDoc(doc(como('sup'),'tareos/t1'),tar('t1'))));
  await caso('tareos/{id}: NO con un id distinto al del documento',assertFails(setDoc(doc(como('sup'),'tareos/t2'),tar('otro'))));
  await caso('tareos/{id}: la cuenta de solo consulta NO escribe',assertFails(setDoc(doc(como('vista'),'tareos/t3'),tar('t3'))));
  await caso('tareos/{id}: la cuenta compartida de Mantenimiento lee pero NO escribe',Promise.all([assertSucceeds(getDoc(doc(como('mant'),'tareos/t1'))),assertFails(setDoc(doc(como('mant'),'tareos/t1'),tar('t1')))]));
  await caso('tareos/{id}: sin sesión no se lee',assertFails(getDoc(doc(como(null),'tareos/t1'))));
  await caso('tareos/{id}: nadie lo borra (eliminar deja eliminado:true)',assertFails(deleteDoc(doc(como('admin'),'tareos/t1'))));

  // Economía y cierre general
  await caso('configEconomica (versión anterior): nadie la escribe',assertFails(setDoc(doc(como('gerente'),'configEconomica/margenes'),{x:1})));
  await caso('valoresUnitarios: Jefe de Producción NO lee',assertFails(getDoc(doc(como('jefe'),'valoresUnitarios/x'))));
  await caso('colección no listada (p. ej. mantPines): denegada a todos',Promise.all([assertFails(getDoc(doc(como('admin'),'mantPines/w1'))),assertFails(setDoc(doc(como('admin'),'otraColeccion/x'),{a:1}))]));

  await env.cleanup();
  console.log('\n'+(total-fallas)+' de '+total+' casos correctos'+(fallas?' · '+fallas+' con fallas':''));
  process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
