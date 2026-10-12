/* Equipo que falló en paradas por «Falla de máquina»: catálogo, validación, Pareto por equipo, bitácora, Excel y datos antiguos. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}

/* ---------- 1) catálogo y validación (37c en un entorno falso con nube que guarda con merge) ---------- */
const nube={doc:{modo:'X',equipos:undefined}};
const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,Promise,RegExp,Error,setInterval:()=>0,clearInterval(){},setTimeout};
vm.createContext(sb);sb.window=sb;
sb.document={getElementById:()=>null,addEventListener(){},createElement:()=>({style:{}}),head:{appendChild(){}},body:{appendChild(){}}};
sb.state={user:{username:'sm',rol:'Administrador'}};
sb.puedeGestionarRotacionMtto=()=>true;
sb.db={collection:()=>({doc:()=>({onSnapshot(){return()=>{};}})}),
  async runTransaction(fn){const tx={async get(){return {exists:true,data:()=>JSON.parse(JSON.stringify(nube.doc))};},set(ref,d,o){nube.doc=o&&o.merge?Object.assign({},nube.doc,JSON.parse(JSON.stringify(d))):d;}};await fn(tx);}};
vm.runInContext(leer('js/mantenimiento/37c-equipos-catalogo.js'),sb);
const G=sb.window.glacialEquipos;
ok(!!G&&G.esFalla('Falla de máquina')&&G.esFalla('falla de maquina — otra')&&!G.esFalla('Cambio de formato')&&!G.esFalla(''),'solo «Falla de máquina» pide equipo');
ok(G.lista('PET1').length>0&&G.lista('B20L').length>0&&G.lista('NOEXISTE').length===0,'lista inicial por línea sin escribir nada');
ok(G.validar('','')!==''&&G.validar('Sopladora','')===''&&G.validar('__otro__','abc')!==''&&G.validar('__otro__','Compresor aire')==='','el equipo es obligatorio; «Otro equipo» exige detalle de 5 caracteres o más');
ok(G.componer('__otro__','Compresor')==='Otro equipo — Compresor'&&G.componer('Sopladora','')==='Sopladora'&&G.componer('__otro__','ab')==='','texto final guardado: nombre del catálogo u «Otro equipo — detalle»');
const d=G.descomponer('Otro equipo — Compresor');ok(d.sel==='__otro__'&&d.detalle==='Compresor'&&G.descomponer('Rinser').sel==='Rinser'&&G.descomponer('').sel==='','descomponer es inverso de componer');
ok(G.validarTexto('')!==''&&G.validarTexto('Rinser')==='','una parada antigua sin equipo se detecta como pendiente');
ok(/Equipo sin indicar/.test(G.SIN_INDICAR),'texto «Equipo sin indicar» para paradas antiguas');
(async()=>{
  await G.agregar('PET1','Sellador');
  ok(nube.doc.modo==='X'&&nube.doc.equipos.PET1.includes('Sellador'),'agregar un equipo usa transacción con merge: no borra los demás campos del documento');
  await G.renombrar('PET1','Sellador','Selladora');
  ok(nube.doc.equipos.PET1.includes('Selladora')&&!nube.doc.equipos.PET1.includes('Sellador'),'renombrar equipo');
  let err='';try{await G.agregar('PET1','selladora');}catch(e){err=e.message;}
  ok(err!=='','no permite nombres repetidos');
  err='';try{await G.agregar('PET1','Otro equipo');}catch(e){err=e.message;}
  ok(err!=='','«Otro equipo» no se puede crear como equipo');
  const o=G.opciones('PET1','Equipo viejo');ok(/Equipo viejo/.test(o)&&/value="__otro__"/.test(o),'un equipo que ya no está en el catálogo se conserva en el selector');
  sb.state.user={username:'op',rol:'Supervisor'};sb.puedeGestionarRotacionMtto=()=>false;
  err='';try{await G.agregar('PET1','Nuevo');}catch(e){err=e.message;}
  ok(err!=='','quien no es Supervisor de Mantenimiento ni Administrador no puede cambiar el catálogo');

  /* ---------- 2) Pareto por equipo (47) ---------- */
  const s47=leer('js/produccion/47-analisis-paradas.js');
  const sb2={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp};vm.createContext(sb2);
  vm.runInContext('const SIN_TECNICO="Sin técnico";const nombreLinea=x=>x;'+extraer(s47,'equipoDeParada')+extraer(s47,'etiquetaMotivo')+extraer(s47,'causaDeParada')+extraer(s47,'motivoDeParada')+extraer(s47,'armarPareto')+'this.f=armarPareto;this.e=equipoDeParada;',sb2);
  const it=(m,min,causa,eq)=>({motivo:m,minutos:min,clasif:'NO_PROGRAMADA',causa,equipo:eq});
  const us=[{linea:'PET1',turno:'DÍA',ajusteNp:0,ajusteProg:0,pItems:[],npItems:[it('x',30,'Falla de máquina','Rinser'),it('x',20,'Falla de máquina','Rinser'),it('y',15,'Falla de máquina',''),it('z',40,'Cambio de formato','')]}];
  const p=sb2.f(us,{agrupar:'equipo',metrica:'minutos'});
  ok(p.filas.length===2&&p.filas[0].clave==='Rinser'&&p.filas[0].minutos===50&&p.filas[1].clave==='Equipo sin indicar'&&p.filas[1].minutos===15,'Pareto por equipo: solo fallas de máquina; las antiguas salen como «Equipo sin indicar»');
  const pm=sb2.f(us,{agrupar:'motivo',metrica:'minutos'});
  ok(pm.totalItemsMin===105&&p.totalItemsMin===65,'agrupar por motivo conserva los 105 min totales; por equipo solo suma las fallas (65)');
  ok(sb2.e(it('x',1,'Cambio de formato','Rinser'))===null,'el equipo no cuenta si la causa no es falla de máquina');

  /* ---------- 3) integración (fuentes) ---------- */
  const s29=leer('js/produccion/29-avance-produccion.js'),s24=leer('js/produccion/24-semaforo-produccion-actual.js'),s23=leer('js/produccion/23b-tiempos-linea.js'),
        s43=leer('js/mantenimiento/43-bitacora-mantenimiento.js'),s06=leer('js/produccion/06-registro.js'),s08=leer('js/produccion/08-graficos.js'),
        s48=leer('js/produccion/48-resumen-turno.js'),html=leer('index.html'),s37c=leer('js/mantenimiento/37c-equipos-catalogo.js');
  ok(/avEsFalla\(/.test(s29)&&/equipo/.test(s29),'Avance / Cierre: selector de equipo en paradas por falla de máquina');
  ok(/pedirEquipo/.test(s24)&&/indicarEquipo/.test(s24),'Producción Actual: pide el equipo al detener y permite indicarlo después');
  ok(/equipo:s\.equipo\|\|''/.test(s23)&&/e\.equipo=p\.equipo\|\|''/.test(s23),'23b: el equipo pasa a paradasClasificadas sin tocar minutos ni totales');
  ok(/registroEquipoHtml/.test(s06)&&/equipo de una parada por Falla de máquina/.test(s06),'Registro: selector de equipo y validación al finalizar');
  ok(/data-bm-equipo/.test(s43)&&/bm-equipo/.test(s43)&&/Por equipo/.test(s43)&&/COMPLETAR_MOTIVO/.test(s43),'Bitácora: columna, filtro, «Indicar equipo» (evento nuevo) y tabla por equipo');
  ok(/column:15/.test(s43)&&/'Equipo'/.test(s43),'Bitácora: Excel con columna Equipo');
  ok(/\['equipo','Equipo'\]/.test(s47)&&/equipoDeParada\(it\)/.test(s47),'Análisis de paradas: Pareto por equipo y columna en el Excel');
  ok(/equipoTop/.test(s48),'Resumen de turno: equipo con más minutos de falla');
  ok(/Equipo \(falla de máquina\)/.test(s08),'Excel de la línea: columna Equipo en la hoja de paradas');
  ok(html.indexOf('37c-equipos-catalogo.js')>html.indexOf('37b-mantenimiento-identificacion.js')&&html.indexOf('37b-mantenimiento-identificacion.js')>0,'index.html carga 37c después de 37b');
  ok(['06-registro','08-graficos','23b-tiempos-linea','24-semaforo-produccion-actual','29-avance-produccion','37b-mantenimiento-identificacion','37c-equipos-catalogo','43-bitacora-mantenimiento','47-analisis-paradas','48-resumen-turno'].every(n=>new RegExp(n+'\\.js\\?v=2026101[12]-(eq|mt|pm)1').test(html)),'versión ?v= de los scripts tocados subida');
  ok(!/[^.\w]alert\(|[^.\w]confirm\(|[^.\w]prompt\(/.test(s37c.replace(/\/\/.*$/gm,''))&&!/[^.\w]confirm\(|[^.\w]prompt\(/.test(s43.slice(s43.indexOf('async function indicarEquipoDesdeBitacora'),s43.indexOf('bitacoraMttoEquipoDe'))),'sin alert/confirm/prompt nuevos');
  ok(!/arrayUnion|increment\(|array-contains|'!='/.test(s37c+s43.slice(s43.indexOf('async function indicarEquipoDesdeBitacora'),s43.indexOf('bitacoraMttoEquipoDe'))),'compatible con el puente Supabase (sin arrayUnion, increment ni consultas array-contains / !=)');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})();
