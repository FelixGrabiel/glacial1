/* Catálogo de factores como fuente única (Asistente → Insumos → Factores) y causas de merma configurables.
   · Núcleo: consumoCatalogo por UND y por paleta, sin factor, sin unidades por paleta; listas de merma configurables.
   · Nuevo registro (05-utils.js): con el catálogo migrado da EXACTAMENTE lo mismo que las tablas fijas en todas las presentaciones que
     tienen valor en el código; las «Regular» que solo figuraban como «Alcalina» dejan de salir en 0; sin catálogo, sin factor o con
     error de lectura sigue el cálculo de siempre; un factor editado en el catálogo cambia el resultado.
   · Inicio (32-dashboard-perfiles.js) y el registro por cuadro (06-registro.js) consultan el catálogo antes de su cálculo fijo.
   · Datos (71-asistente-datos.js): la fachada glacialFactoresCatalogo y guardarParametrosMerma (permiso, validación, versión). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const funcion=(txt,nombre)=>{const i=txt.indexOf('function '+nombre+'(');if(i<0)throw new Error('no está '+nombre);let d=0;const j=txt.indexOf('{',txt.indexOf(')',i));
  for(let k=j;k<txt.length;k++){if(txt[k]==='{')d++;else if(txt[k]==='}'&&!--d)return txt.slice(i,k+1);}};

const sn={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp};vm.createContext(sn);sn.window=sn;
vm.runInContext(leer('js/asistente/70-asistente-nucleo.js'),sn);
const N=sn.glacialAsistenteNucleo;

/* ---------- núcleo ---------- */
const FX=[{insumo:'CARTON',linea:'PET1',marca:'*',presentacion:'*',base:'PALETA',cantidadBase:1,factor:4,vigenteDesde:'2020-01-01'},
  {insumo:'CAJA_PREFORMA',linea:'PET1',marca:'*',presentacion:'*',base:'UND',cantidadBase:14250,factor:1,vigenteDesde:'2020-01-01'}];
const q={linea:'PET1',marca:'Scala',presentacion:'x',fecha:'2026-10-15'};
ok(N.consumoCatalogo(FX,{...q,insumo:'CARTON'},{unidades:0,paletas:10}).valor===40,'consumoCatalogo: por paleta usa las paletas registradas (10 × 4)');
ok(N.consumoCatalogo(FX,{...q,insumo:'CARTON'},{unidades:3240,unidadesPorPaleta:324}).valor===40,'consumoCatalogo: sin paletas las calcula con las unidades por paleta (3240 ÷ 324 × 4)');
ok(N.consumoCatalogo(FX,{...q,insumo:'CARTON'},{unidades:3240}).error==='SIN_PALETAS','consumoCatalogo: por paleta sin paletas ni unidades por paleta → SIN_PALETAS (no 0)');
ok(N.consumoCatalogo(FX,{...q,insumo:'CAJA_PREFORMA'},{unidades:28500}).valor===2,'consumoCatalogo: por UND (28500 ÷ 14250)');
ok(N.consumoCatalogo(FX,{...q,insumo:'TAPA'},{unidades:1}).error==='SIN_FACTOR','consumoCatalogo: sin factor → SIN_FACTOR');
ok(N.listaOk(null,N.CAUSAS_MERMA)===N.CAUSAS_MERMA&&N.listaOk(['  A ','','B'],N.CAUSAS_MERMA).join()==='A,B','listas de merma: sin configurar → las de siempre; configuradas → limpias');
ok(N.validarListaMerma([],'causa').length&&N.validarListaMerma(['Arranque','arranque'],'causa').length&&N.validarListaMerma(['x'],'causa').length&&!N.validarListaMerma(['Arranque','Otros'],'causa').length,'listas de merma: vacía, repetida o muy corta → error');
const mm={linea:'PET1',cuadro:'k',categoria:'MATERIAL',insumo:'CARTON',cantidad:1,unidad:'plancha',causa:'Viento'};
ok(N.validarMerma(mm).some(e=>/causa/.test(e))&&!N.validarMerma(mm,['Viento','Otros']).length,'validarMerma: acepta una causa configurada que no está en la lista fija');

/* ---------- Nuevo registro (05-utils.js) con y sin catálogo ---------- */
const u=leer('js/nucleo/05-utils.js'),c01=leer('js/nucleo/01-config.js');
const su={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp};vm.createContext(su);su.window=su;
const tomarDe=(txt,n)=>{const m=txt.match(new RegExp('const '+n+'\\s*=\\s*([\\s\\S]*?);\\s*\\n'));return m?vm.runInContext('('+m[1]+')',su):undefined;};
const NOMBRES=['CAJAS_PREFORMAS_DIVISOR','FACTOR_CARTON_PET','FACTOR_POLIETILENO_PET','FACTOR_STRETCHFILM_PET','CARTON_FIJO_B7L','CARTON_C20L_SAN_FERNANDO','CARTON_C20L_DEFAULT','CARTON_FIJO_B20L',
  'POLIETILENO_B7L_FACTOR','POLIETILENO_C20L_FACTOR','MARCAS_POLIETILENO_B7L_SI','STRETCHFILM_B7L_FACTOR','STRETCHFILM_C20L_FACTOR','STRETCHFILM_B20L_FACTOR'];
['RATIOS_PRESENTACION_PET1','RATIOS_PRESENTACION_PET2'].forEach(n=>{su[n]=tomarDe(c01,n);});
const cfg={PRESENTACIONES_POR_LINEA:tomarDe(c01,'PRESENTACIONES_POR_LINEA')};NOMBRES.forEach(n=>{cfg[n]=tomarDe(u,n);su[n]=cfg[n];});
const FUN=['num','normalizarTexto','consumoInsumoCatalogo','obtenerDivisorCajasPreformas','calcularCajasPreformas','obtenerFactorCartonPET','calcularPlanchasCarton',
  'obtenerFactorPolietileno','calcularPolietileno','obtenerFactorStretchFilm','calcularStretchFilm'];
vm.runInContext(FUN.map(f=>funcion(u,f)).join('\n')+'\nvar draft=null;',su);
const mig=N.factoresDesdeCodigo(cfg,'2020-01-01');
let catalogo=null;               // null = sin catálogo (antes de migrar, sin permiso o con error de lectura)
su.glacialFactoresCatalogo={consumo(insumo,linea,marca,presentacion,fecha,cant){
  if(!catalogo)return null;const r=N.consumoCatalogo(catalogo,{insumo,linea,marca,presentacion,fecha},cant);return r.error?null:{valor:r.valor,factor:r.factor};}};
const CALC={CAJA_PREFORMA:'calcularCajasPreformas',CARTON:'calcularPlanchasCarton',POLIETILENO:'calcularPolietileno',STRETCH:'calcularStretchFilm'};
const calc=(fn,d)=>{su.draft=d;return vm.runInContext('draft='+JSON.stringify(d)+';'+fn+'()',su);};
const casos=[];
['PET1','PET2'].forEach(l=>{
  const claves=new Set([...Object.keys(cfg.FACTOR_CARTON_PET),...Object.keys(cfg.CAJAS_PREFORMAS_DIVISOR)]);
  (cfg.PRESENTACIONES_POR_LINEA[l]||[]).forEach(p=>claves.add(p));
  claves.forEach(p=>casos.push({linea:l,marca:'Scala',presentacion:p}));
});
['Scala','Bells','Aro'].forEach(m=>casos.push({linea:'B7L',marca:m,presentacion:'7L'}));
['San Fernando','Glacial'].forEach(m=>casos.push({linea:'C20L',marca:m,presentacion:'Caja 20L'}));
casos.push({linea:'B20L',marca:'Glacial',presentacion:'20L'});
let iguales=0,distintos=[],corregidos=[];
casos.forEach(c=>Object.entries(CALC).forEach(([ins,fn])=>{
  const d={...c,fecha:'2026-10-15',produccion:{efectiva:43000,paletas:12}};
  catalogo=null;const antes=calc(fn,d);
  catalogo=mig;const despues=calc(fn,d);
  if(antes===despues)iguales++;
  else if(antes===0&&despues>0&&/regular/i.test(c.presentacion))corregidos.push(c.linea+' '+c.presentacion+' '+ins);
  else distintos.push(`${c.linea} ${c.marca} ${c.presentacion} ${ins}: código ${antes} · catálogo ${despues}`);
}));
ok(!distintos.length&&iguales>150,'Nuevo registro: con el catálogo migrado da lo mismo que las tablas fijas ('+iguales+' cálculos)'+(distintos.length?' · DIFERENCIAS: '+distintos.slice(0,5).join(' | '):''));
ok(corregidos.length>0,'Nuevo registro: las presentaciones «Regular» que salían en 0 ahora toman el valor de su equivalente ('+corregidos.length+', p. ej. '+corregidos[0]+')');
catalogo=mig.map(f=>f.linea==='B7L'&&f.insumo==='CARTON'?{...f,factor:20}:f);
ok(calc('calcularPlanchasCarton',{linea:'B7L',marca:'Aro',presentacion:'7L',fecha:'2026-10-15',produccion:{efectiva:0,paletas:3}})===60,'un factor editado en el catálogo cambia el Nuevo registro (B7L cartón 16 → 20: 3 paletas = 60)');
catalogo=[];
ok(calc('calcularPlanchasCarton',{linea:'B7L',marca:'Aro',presentacion:'7L',fecha:'2026-10-15',produccion:{efectiva:0,paletas:3}})===48,'catálogo sin ese factor → valor fijo del código (3 × 16)');
delete su.glacialFactoresCatalogo;
ok(calc('calcularPlanchasCarton',{linea:'B7L',marca:'Aro',presentacion:'7L',fecha:'2026-10-15',produccion:{efectiva:0,paletas:3}})===48,'sin el módulo del Asistente cargado → valor fijo del código');

/* ---------- registro por cuadro (06) e Inicio (32): consultan el catálogo antes del cálculo fijo ---------- */
const s06=leer('js/produccion/06-registro.js');
ok(['calcularCajasPreformasCuadro','calcularPlanchasCartonCuadro','calcularPolietilenoCuadro','calcularStretchFilmCuadro'].every((f,i)=>{const b=funcion(s06,f);
  return new RegExp("consumoInsumoCatalogo\\(\\s*'"+['CAJA_PREFORMA','CARTON','POLIETILENO','STRETCH'][i]+"'").test(b)&&b.indexOf('consumoInsumoCatalogo')<b.indexOf('draft.linea === ')&&/cuadro\.produccion/.test(b);}),
  'Nuevo registro por cuadro: los 4 cálculos consultan el catálogo con la marca, presentación y producción del cuadro');
const s32=leer('js/accesos/32-dashboard-perfiles.js');
const sc={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp};vm.createContext(sc);sc.window=sc;
vm.runInContext(['cpNum','cpFmt','cpFmtInsumo','cpDatoInsumo','cpNoAplicaInsumo','cpUnidadPlural','cpInsumoDesdeCatalogo'].map(f=>{try{return funcion(s32,f);}catch(_){return '';}}).join('\n')
  +'\nconst CP_INSUMO_CATALOGO='+s32.match(/const CP_INSUMO_CATALOGO=(\{[^}]*\})/)[1]+';',sc);
if(typeof sc.cpNum!=='function')vm.runInContext('function cpNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}',sc);
if(typeof sc.cpFmt!=='function')vm.runInContext('function cpFmt(v){return String(Math.round(Number(v)||0));}',sc);
sc.obtenerUnidadesPorPalet=()=>324;
catalogo=mig;
sc.glacialFactoresCatalogo={consumo(insumo,linea,marca,presentacion,fecha,cant){const r=N.consumoCatalogo(catalogo,{insumo,linea,marca,presentacion,fecha},cant);
  return r.error?null:{valor:r.valor,factor:r.factor,paletas:r.paletas,unidad:{CARTON:'plancha',POLIETILENO:'kg',STRETCH:'kg',CAJA_PREFORMA:'caja'}[insumo]||''};}};
const pi={linea:'PET1',marca:'Scala',presentacion:'Pack_Regular_2.5Lx6und',fecha:'2026-10-15'};
const car=sc.cpInsumoDesdeCatalogo(pi,3240,'CARTON');
ok(car&&car.principal==='30 planchas'&&/10 pal/.test(car.detalle)&&/catálogo/.test(car.subdetalle),'Inicio: cartón desde el catálogo (3240 und ÷ 324 = 10 pal. × 3 = 30 planchas)');
ok(sc.cpInsumoDesdeCatalogo({...pi,linea:'B20L'},3240,'POLIETILENO').estado==='NO_APLICA','Inicio: factor 0 del catálogo → «No aplica»');
ok(sc.cpInsumoDesdeCatalogo(pi,3240,'TAPA')===null,'Inicio: sin factor en el catálogo → queda su cálculo de siempre');
ok(/function cpInsumosFilas\(\)\{return cpProgramaciones\(\)\.map\(cpInsumosFilaCatalogo\);\}/.test(s32),'Inicio: la tabla de insumos usa el catálogo');
ok(/glacialFactoresCatalogoEscuchas/.test(leer('js/nucleo/02-estado.js')),'el catálogo se escucha al iniciar la sesión (no solo al abrir el Asistente)');

/* ---------- datos: fachada y parámetros de merma ---------- */
function entorno(usuario,datos){
  const docs=new Map();
  const SERVER={__s:1};
  const snapCol=col=>({docs:[...docs.entries()].filter(([k])=>k.startsWith(col+'/')).map(([k,d])=>({id:k.slice(col.length+1),data:()=>JSON.parse(JSON.stringify(d))}))});
  const db={collection:col=>({doc:id=>({path:col+'/'+id,onSnapshot(cb){const d=docs.get(col+'/'+id);cb({exists:!!d,data:()=>d});return ()=>{};}}),
      onSnapshot(cb){cb(snapCol(col));return ()=>{};},where(){return this;}}),
    async runTransaction(fn){const w=[];await fn({get:async r=>({exists:docs.has(r.path),data:()=>JSON.parse(JSON.stringify(docs.get(r.path)))}),set:(r,d)=>w.push([r.path||'apAuditoria/'+Math.random(),d])});
      w.forEach(([p,d])=>docs.set(p,JSON.parse(JSON.stringify(d,(k,v)=>v===SERVER?1:v))));}};
  Object.entries(datos||{}).forEach(([k,v])=>docs.set(k,v));
  const s={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,Promise,Error,RegExp};vm.createContext(s);s.window=s;
  s.db=db;s.firebase={firestore:{FieldValue:{serverTimestamp:()=>SERVER}},auth:()=>({currentUser:{uid:usuario.uid}})};
  s.state={user:usuario};s.PERMISOS_APP=[];s.tienePermiso=()=>false;s.tareoAhoraServidor=()=>Date.parse('2026-10-15T15:00:00Z');
  vm.runInContext(leer('js/asistente/70-asistente-nucleo.js'),s);vm.runInContext(leer('js/asistente/71-asistente-datos.js'),s);
  return {s,D:s.glacialAsistenteDatos,docs};
}
(async()=>{
  const datos={};mig.forEach(f=>{datos['apFactores/'+f.id]=f;});datos['apInsumos/CARTON']={codigo:'CARTON',nombre:'Planchas de cartón',unidad:'plancha'};
  const a=entorno({uid:'s1',rol:'Supervisor',permisos:[]},datos);
  a.s.glacialAsistenteDatos.cache.listo.factores=false;
  ok(a.s.glacialFactoresCatalogo.listo()===false,'fachada: antes de cargar el catálogo no está lista');
  // Si la sesión empezó antes de cargar el archivo, la primera consulta activa la escucha (aquí la base simulada responde al instante).
  const r=a.s.glacialFactoresCatalogo.consumo('CARTON','B7L','Aro','7L','2026-10-15',{paletas:2});
  ok(r&&r.valor===32&&r.unidad==='plancha','fachada: con el catálogo cargado calcula con el factor vigente (2 × 16) y su unidad');
  ok(a.s.glacialFactoresCatalogo.consumo('TAPA','B7L','Aro','7L','2026-10-15',{paletas:2})===null,'fachada: sin factor → null');
  const m=entorno({uid:'m1',rol:'mantenimiento_compartido',permisos:[]},datos);m.s.glacialFactoresCatalogoEscuchas();
  ok(m.s.glacialFactoresCatalogo.consumo('CARTON','B7L','Aro','7L','2026-10-15',{paletas:2})===null,'cuenta compartida de Mantenimiento: no escucha el catálogo (las reglas no le dan lectura) y usa el código');

  ok(a.D.causasMerma().join()===N.CAUSAS_MERMA.join(),'sin configurar: causas de siempre');
  const err=await a.D.guardarParametrosMerma({causas:['Viento'],etapas:['Llenado']},0).catch(e=>e);
  ok(err&&err.codigo==='PERMISO','el Supervisor NO configura las causas de merma');
  const j=entorno({uid:'j1',rol:'Jefe de Producción',permisos:[],nombre:'Jefe'},datos);j.s.glacialFactoresCatalogoEscuchas();
  const e2=await j.D.guardarParametrosMerma({causas:['Viento','viento'],etapas:['Llenado']},0).catch(e=>e);
  ok(e2&&e2.codigo==='VALIDACION','causas repetidas → no se guarda');
  await j.D.guardarParametrosMerma({causas:[' Viento ','Otros'],etapas:['Llenado']},0);
  const doc=j.docs.get('apParametros/merma');
  ok(doc&&doc.causas.join()==='Viento,Otros'&&doc.version===1&&doc.historial.length===1&&[...j.docs.keys()].some(k=>k.startsWith('apAuditoria/')),'el Jefe guarda las causas: versión 1, historial y auditoría');
  const e3=await j.D.guardarParametrosMerma({causas:['A1','Otros'],etapas:['Llenado']},0).catch(e=>e);
  ok(e3&&e3.codigo==='CONFLICTO','versión vieja → CONFLICTO (no pisa el cambio de otra persona)');
  j.s.glacialAsistenteDatos.cache.parametrosMerma=doc;
  ok(j.D.causasMerma().join()==='Viento,Otros'&&j.D.etapasMerma().join()==='Llenado','la pantalla de Merma usa las causas y etapas configuradas');
  const s72=leer('js/asistente/72-asistente-pantalla.js');
  ok(/D\.causasMerma\(\)\.map/.test(s72)&&/D\.etapasMerma\(\)\.map/.test(s72)&&!/N\.CAUSAS_MERMA\.map/.test(s72)&&/N\.validarMerma\(m,D\.causasMerma\(\)\)/.test(s72),'el formulario de merma lista y valida con las causas configuradas');
  ok(/const sinInsumos=!a&&!D\.cache\.insumos\.some\(i=>i\.activo!==false\)/.test(s72)&&/No hay insumos en el catálogo/.test(s72)&&/\$\{sinInsumos\?'disabled':''\}>Guardar/.test(s72),'Nuevo factor sin insumos en el catálogo: avisa cómo cargarlos y no deja guardar');
  {const sb={console,Set,String,Object,Array,MARCAS_POR_LINEA:{PET1:['Bells','Scala','Bells',' Aro ']},PRESENTACIONES_POR_LINEA:{PET1:['Pack_Regular_2.5Lx6und']}};vm.createContext(sb);
    vm.runInContext('var esc=x=>String(x);'+s72.match(/const listaDeLinea=[\s\S]*?\n  const opcionesProducto=[^\n]*\n/)[0]+';this.L=listaDeLinea;this.O=opcionesProducto;',sb);
    const html=sb.O(sb.L('MARCAS_POR_LINEA','PET1'),'Scala');
    ok(JSON.stringify(sb.L('MARCAS_POR_LINEA','PET1'))==='["Bells","Scala","Aro"]'&&sb.L('MARCAS_POR_LINEA','B7L').length===0&&/^<option value="\*">\* Todas<\/option>/.test(html)&&/value="Scala" selected/.test(html),'Nuevo factor: marca y presentación se eligen de las listas de la línea (sin duplicados), con «* Todas» primero');
    ok(/<select id="ap-f-mar">/.test(s72)&&/<select id="ap-f-pre">/.test(s72)&&/onchange="apFactorLinea\(\)"/.test(s72),'Nuevo factor: marca y presentación son listas que cambian con la línea');}
  ok(/match \/apParametros\/\{doc\}/.test(leer('firestore.rules.etapa2.txt')),'reglas: bloque apParametros');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
