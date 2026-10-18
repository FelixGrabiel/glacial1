/* Tareo: normalización por tareo solo si cambió (13-tareo.js) y fotos de auditoría incrementales (40-tareo-auditoria.js).
   Mismo resultado que antes, mucho menos trabajo por clic. node tests/tareo-rendimiento-inp.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const t13=leer('js/personal/13-tareo.js'),t40=leer('js/personal/40-tareo-auditoria.js'),html=leer('index.html'),indice=leer('INDICE.md');
function extraer(src,n){const m=new RegExp('(?:^|\\n)[ ]*(?:async[ ]+)?function[ ]+'+n+'[ ]*\\(').exec(src);if(!m)throw new Error('no está '+n);
  const ini=src.indexOf('function',m.index);let i=src.indexOf('{',src.indexOf(')',ini)),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(ini,j+1);}
const entre=(src,a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('marcadores '+a);return src.slice(i,j);};

/* ---- referencia: la normalización de SIEMPRE (sin memoria) ---- */
const REF=`function tareoNormalizarRegistroRef(tareo){
  if(!tareo)return tareo;
  if(!tareo.area)tareo.area='Producción';
  if(Array.isArray(tareo.personal)){
    tareo.personal.forEach(persona=>{const c=tareoEstadoCanonico(persona.asistencia);if(c!==persona.asistencia)persona.asistencia=c;if(!persona.area)persona.area=tareo.area;});
    tareo.personal=ordenarPersonalTareo(tareo.personal);
    if(window.TareoEd)window.TareoEd.asegurarFilaIds(tareo);
  }
  return tareo;
}`;
function contexto(){
  const sb={console,Math,Number,Array,Object,String,Set,Map,WeakMap,JSON,Date,Promise,Error,parseInt,isFinite,isNaN};
  vm.createContext(sb);sb.window=sb;
  sb.llamadasIds=0;sb.faltan=false;
  sb.TareoEd={asegurarFilaIds:()=>{sb.llamadasIds++;},faltanIds:()=>sb.faltan};
  const nombres=['tareoNormalizarTexto','tareoNormalizarDNI','tareoEstadoCanonico','obtenerPrioridadAsistencia','ordenarPersonalTareo','tareoNormalizarRegistro',
    '_obtenerTareosBase','obtenerTareos','tareoIdentidades','tareoClavePersona'];
  vm.runInContext(nombres.map(n=>extraer(t13,n)).join('\n')+'\n'+REF+'\nvar TAREOS=[];function loadTareos(){return TAREOS;}var _tareosReady=true;',sb);
  return sb;
}
const ev=(sb,c)=>vm.runInContext(c,sb);
let sem=5;const rnd=()=>{sem=(sem*16807)%2147483647;return sem/2147483647;};
const ESTADOS=['','Asistió','Asistió','Descanso','Falta por justificar','Falta','Permiso','asistio','Vacaciones'];
const NOMBRES=['ALEMNIS RODRIGUEZ','ANTONI CRIOLLO','BARRERO FRANCELYS','CHAGUAN YUSBELIS','GOMEZ WILCARLYS','GUERRERO MARLO','JACKSON GUERRERO','SAMAME JAN'];
const nuevoTareo=(i,n)=>({id:'t'+i,fecha:'2026-10-'+String(1+i%28).padStart(2,'0'),turno:i%2?'Noche':'Día',area:i%7===0?undefined:(i%2?'Mantenimiento':'Producción'),
  personal:Array.from({length:n||52},(_,k)=>({trabajadorId:k%13===0?'':'w'+k,nombre:NOMBRES[(k+i)%8]+' '+k,dni:k%5===0?'':String(40000000+k),cargo:'Operario',
    asistencia:ESTADOS[Math.floor(rnd()*ESTADOS.length)],horaIngreso:'07:00',area:k%4===0?'':'Producción'}))});
const clon=v=>JSON.parse(JSON.stringify(v));
const ref=(sb,t)=>{const c=clon(t);ev(sb,'tareoNormalizarRegistroRef')(c);return JSON.stringify(c);};

/* ---- 1) mismo resultado que la normalización de siempre ---- */
{
  const sb=contexto();
  const base=Array.from({length:60},(_,i)=>nuevoTareo(i,i%5===0?3:52));
  sb.TAREOS=clon(base);const T=sb.TAREOS;
  const esperado=()=>JSON.stringify(T.map(t=>JSON.parse(ref(sb,t))));
  const real=()=>JSON.stringify(ev(sb,'obtenerTareos()'));
  ok(real()===esperado(),'primera lectura: igual a la normalización de siempre (60 tareos)');
  ok(real()===esperado(),'segunda lectura (sin cambios, camino rápido): igual');
  /* cambios en el mismo objeto */
  const t3=T[3];
  t3.personal[10].asistencia='Descanso';                      // asistencia en el lugar → cambia el orden
  ok(real()===esperado(),'asistencia cambiada en el lugar: se reordena igual que siempre');
  t3.personal[2].nombre='ZZZ NUEVO NOMBRE';
  ok(real()===esperado(),'nombre cambiado en el lugar: igual');
  t3.personal.push({trabajadorId:'nuevo1',nombre:'AAA AGREGADO',dni:'1',asistencia:'Asistió'});
  ok(real()===esperado(),'persona agregada a la misma lista: igual');
  t3.personal[0]={trabajadorId:'otro',nombre:'REEMPLAZO',dni:'2',asistencia:'Falta'};
  ok(real()===esperado(),'persona reemplazada en su lugar (y «Falta» → canónico): igual');
  T[4].personal=T[4].personal.slice(5);
  ok(real()===esperado(),'lista nueva de personas: igual');
  T[5].personal[1].asistencia='Permiso';
  T[5].personal[1].area='';
  ok(real()===esperado(),'área de persona vaciada y estado antiguo «Permiso»: igual');
  delete T[6].area;
  ok(real()===esperado(),'tareo sin área vuelve a «Producción»: igual');
  T.push(nuevoTareo(99));
  ok(real()===esperado(),'tareo nuevo en el historial: igual');
  const antes=JSON.stringify(T);
  ev(sb,'obtenerTareos()');
  ok(JSON.stringify(T)===antes,'la lectura repetida no modifica los datos (nada extra dentro del tareo)');
  ok(!Object.keys(T[0]).some(k=>/memo|firma|norm/i.test(k)),'no se agregan propiedades al tareo (la memoria vive aparte)');
}

/* ---- 2) filaId: solo se vuelve a comprobar cuando faltaban ---- */
{
  const sb=contexto();sb.TAREOS=[nuevoTareo(1,10)];
  ev(sb,'obtenerTareos()');const base=sb.llamadasIds;
  ev(sb,'obtenerTareos()');ev(sb,'obtenerTareos()');
  ok(sb.llamadasIds===base,'sin filas repetidas: la comprobación de filaId no se repite en el camino rápido');
  const sb2=contexto();sb2.faltan=true;sb2.TAREOS=[nuevoTareo(1,10)];
  ev(sb2,'obtenerTareos()');const b2=sb2.llamadasIds;ev(sb2,'obtenerTareos()');ev(sb2,'obtenerTareos()');
  ok(sb2.llamadasIds===b2+2,'con filas pendientes de filaId: se sigue comprobando en cada lectura (reintento de siempre)');
}

/* ---- 2b) tareoObtenerPorId / tareoObtenerActual ---- */
{
  const sb=contexto();
  vm.runInContext(extraer(t13,'tareoObtenerPorId')+'\n'+extraer(t13,'tareoObtenerActual'),sb);
  sb.TAREOS=Array.from({length:30},(_,i)=>nuevoTareo(i));
  vm.runInContext('var loadTareos=function(){return TAREOS;};var tareoActualId="t7";',sb);
  const viaLista=ev(sb,'obtenerTareos().find(x=>x.id==="t7")');
  ok(ev(sb,'tareoObtenerPorId("t7")')===viaLista&&ev(sb,'tareoObtenerActual()')===viaLista,'tareoObtenerPorId / tareoObtenerActual devuelven el mismo objeto que obtenerTareos().find()');
  ok(ev(sb,'tareoObtenerPorId("no-existe")')===undefined&&ev(sb,'tareoActualId="x";tareoObtenerActual()')===null,'tareo inexistente: undefined / null como antes');
  sb.TAREOS[9].personal[4].asistencia='Descanso';
  const t9=ev(sb,'tareoObtenerPorId("t9")');
  ok(JSON.stringify(t9)===ref(sb,sb.TAREOS[9])&&JSON.stringify(t9)===JSON.stringify(ev(sb,'obtenerTareos().find(x=>x.id==="t9")')),'el tareo pedido por id sale normalizado igual que con obtenerTareos()');
  /* cuenta compartida (filtro por técnico): se usa el camino de siempre */
  sb.esMantCompartido=()=>true;let llamadas=0;
  vm.runInContext('var _viejo=obtenerTareos;obtenerTareos=function(){contador++;return _viejo();};var contador=0;',sb);
  ev(sb,'tareoObtenerPorId("t3")');
  ok(ev(sb,'contador')===1,'con la cuenta compartida no se usa el atajo: pasa por obtenerTareos() (y su filtro por técnico)');
  ok(/tareoObtenerPorId\(tareoId\)/.test(t13)&&!/obtenerTareos\(\)\.find\(t => t\.id === tareoId\) \|\| \{\}\)\.jornadaNormal/.test(t13),'renderFilaPersonalTareo ya no llama a obtenerTareos() por fila');
}

/* ---- 3) rendimiento ---- */
{
  const sb=contexto();sb.TAREOS=Array.from({length:1000},(_,i)=>nuevoTareo(i));
  const calentar=contexto();calentar.TAREOS=Array.from({length:300},(_,i)=>nuevoTareo(i));ev(calentar,'obtenerTareos()');calentar.TAREOS.forEach(x=>ev(calentar,'tareoNormalizarRegistroRef')(x));
  let t=Date.now();ev(sb,'obtenerTareos()');const primera=Date.now()-t;
  t=Date.now();for(let i=0;i<10;i++)ev(sb,'obtenerTareos()');const rapida=(Date.now()-t)/10;
  t=Date.now();ev(sb,'obtenerTareos().find(x=>x.id==="t5")');
  const sbRef=contexto();sbRef.TAREOS=Array.from({length:1000},(_,i)=>nuevoTareo(i));
  t=Date.now();for(let i=0;i<3;i++)sbRef.TAREOS.forEach(x=>ev(sbRef,'tareoNormalizarRegistroRef')(x));const antes=(Date.now()-t)/3;
  console.log('  1.000 tareos × 52 personas: primera lectura '+primera+' ms · lecturas siguientes '+rapida.toFixed(1)+' ms · antes (cada lectura) '+antes.toFixed(0)+' ms');
  ok(rapida<antes/5&&rapida<150,'las lecturas siguientes son al menos 5 veces más rápidas que la normalización de siempre');
}

/* ---- 4) auditoría: fotos incrementales ---- */
{
  const sb=contexto();
  const codigo=extraer(t40,'foto')+'\n'+extraer(t40,'clavePersona')+'\n'+entre(t40,'  const fotosPrevias=new WeakMap();','  function sembrar(){')+'\n'+extraer(t40,'sembrar');
  vm.runInContext(`var base=new Map();var llamadasFoto=0;
    const norm=t=>tareoNormalizarTexto(t);const canonico=v=>tareoEstadoCanonico(v)||'';
    ${codigo.replace('function foto(t){','function foto(t){llamadasFoto++;')}
    this.sembrar=sembrar;this.foto=foto;this.base=base;`,sb);
  sb.TAREOS=Array.from({length:200},(_,i)=>nuevoTareo(i,20));
  ev(sb,'sembrar()');
  ok(ev(sb,'llamadasFoto')===200&&ev(sb,'base.size')===200,'primer sembrar: una foto por tareo');
  ev(sb,'llamadasFoto=0');ev(sb,'sembrar()');
  ok(ev(sb,'llamadasFoto')===0,'sembrar sin cambios (snapshot, eco propio): 0 fotos nuevas');
  const T=sb.TAREOS;T[7].personal[3].horaIngreso='08:15';
  ev(sb,'sembrar()');
  ok(ev(sb,'llamadasFoto')===1&&ev(sb,'base.get("t7")').personal&&Object.values(ev(sb,'base.get("t7")').personal).some(p=>p.horaIngreso==='08:15'),'una hora cambiada en un tareo: solo se rehace la foto de ese tareo y refleja el cambio');
  T[9].personal[0].asistencia='Falta';T[11].personalPorDia=[{id:'d1',nombre:'X',dni:'1',horaIngreso:'07:00'}];T[12].estado='CERRADO';
  ev(sb,'llamadasFoto=0');ev(sb,'sembrar()');
  ok(ev(sb,'llamadasFoto')===3,'asistencia, personal por día y estado cambiados: se rehacen exactamente esos tres');
  /* igualdad con la foto de siempre para todos */
  let iguales=0;T.forEach(t=>{if(JSON.stringify(ev(sb,'base.get("'+t.id+'")'))===JSON.stringify(sb.foto(t)))iguales++;});
  ok(iguales===T.length,'la foto guardada es idéntica a la foto completa en los '+T.length+' tareos');
  T[20].personal[1].edicionesSalida=[{vista:false,motivo:'x'}];ev(sb,'llamadasFoto=0');ev(sb,'sembrar()');
  T[20].personal[1].edicionesSalida[0].vista=true;ev(sb,'sembrar()');
  ok(ev(sb,'base.get("t20")').personal[Object.keys(ev(sb,'base.get("t20")').personal)[1]]!==undefined&&ev(sb,'llamadasFoto')===2,'ediciones de salida (cantidad y vista) también se detectan');
  const t0=Date.now();for(let i=0;i<20;i++)ev(sb,'sembrar()');
  console.log('  sembrar() con 200 tareos sin cambios: '+((Date.now()-t0)/20).toFixed(1)+' ms por snapshot');
}

/* ---- 5) versiones, documentación y reglas ---- */
{
  const v=n=>{const m=new RegExp(n+'\\.js\\?v=(\\d{8})-[a-z]+\\d+').exec(html);return m?Number(m[1]):0;};
  ok(v('personal/13-tareo')>=20261018&&v('personal/40-tareo-auditoria')>=20261018,'index.html: ?v= de 13-tareo.js y 40-tareo-auditoria.js subidos');
  ok(/PERF:/.test(t13)&&/PERF:/.test(t40),'cambios comentados con // PERF');
  ok(/tareoNormalizarRegistro\._memo/.test(t13)&&/fotosPrevias/.test(t40),'las memorias viven en las propias funciones / el módulo de auditoría');
  ok(!/\balert\(|\bconfirm\(|\bprompt\(/.test(extraer(t13,'tareoNormalizarRegistro')+entre(t40,'  const fotosPrevias','  /* ---------- eventos')),'sin alert/confirm/prompt nuevos');
  ok(/rendimiento|INP/i.test(indice)&&/tareo-rendimiento-inp/.test(indice),'INDICE.md documenta los índices de rendimiento del Tareo');
}
console.log(fallas?fallas+' fallas':'todo correcto');
