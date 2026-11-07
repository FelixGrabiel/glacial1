/* Auditoría de AGUA (07/11/2026): A · reportes sin finalizar en el Inicio de Producción, B · rotación de supervisores sin publicar,
   E · la merma del Registro de producción cuenta en la conciliación del Asistente. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');

/* ---------- Inicio de Producción en un entorno simulado ---------- */
function entorno({rol='Supervisor',linea='PET1',hoy='2026-11-06',rotaciones=[],pendientes=[],botones=['btn-avance-produccion']}){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp,setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};vm.createContext(sb);sb.window=sb;
  const els={};
  sb.document={getElementById:id=>botones.includes(id)?{hidden:false,style:{}}:(els[id]||null),createElement:()=>({}),head:{appendChild(e){els[e.id]=e;}},addEventListener(){}};
  sb.state={user:{rol,username:'u',linea}};
  sb.GlacialFecha={fechaOperativa:()=>hoy,sumarDias:(f,n)=>{const [y,m,d]=f.split('-').map(Number);const x=new Date(Date.UTC(y,m-1,d+n));return x.toISOString().slice(0,10);},semanaISO:()=>45};
  sb._rotacionesReady=true;
  sb.rotSupBuscarSemanaPorFecha=(f,solo)=>rotaciones.find(r=>f>=r.desde&&f<=r.hasta&&(!solo||r.estado==='PUBLICADA'))||null;
  sb.glacialAvisos={ambito:()=>rol==='Supervisor'?{tipos:['finalizar'],lineas:linea}:{tipos:['finalizar'],lineas:null},pendientesFinalizar:()=>({items:pendientes})};
  vm.runInContext(leer('js/produccion/67-produccion-inicio.js'),sb);
  return sb.glacialProdInicio;
}
const P=[{id:'r1',linea:'PET1',fecha:'2026-11-05',turno:'NOCHE',cuadros:2,sinFinalizar:2,nivel:'roja'},{id:'r2',linea:'B7L',fecha:'2026-11-05',turno:'DÍA',cuadros:1,sinFinalizar:1,nivel:'ambar'}];
ok(entorno({pendientes:P}).pendientesFinalizar().map(x=>x.id).join()==='r1','A: el supervisor ve solo los reportes sin finalizar de su línea');
ok(entorno({rol:'Jefe de Producción',pendientes:P}).pendientesFinalizar().length===2,'A: Jefatura ve todas las líneas');
const pub={desde:'2026-11-02',hasta:'2026-11-08',estado:'PUBLICADA'};
ok(entorno({rol:'Jefe de Producción',hoy:'2026-11-06',rotaciones:[]}).avisoRotacion().nivel==='roja','B: sin rotación publicada para la semana en curso → aviso rojo');
ok(entorno({rol:'Jefe de Producción',hoy:'2026-11-06',rotaciones:[Object.assign({},pub,{estado:'BORRADOR'})]}).avisoRotacion().nivel==='roja','B: un borrador no cuenta como publicada');
ok(/próxima semana/.test(entorno({rol:'Jefe de Producción',hoy:'2026-11-06',rotaciones:[pub]}).avisoRotacion().texto),'B: desde el jueves, si falta la próxima semana → aviso ámbar');
ok(entorno({rol:'Jefe de Producción',hoy:'2026-11-03',rotaciones:[pub]}).avisoRotacion()===null,'B: martes con la semana publicada → sin aviso');
ok(entorno({rol:'Jefe de Producción',hoy:'2026-11-06',rotaciones:[pub,{desde:'2026-11-09',hasta:'2026-11-15',estado:'PUBLICADA'}]}).avisoRotacion()===null,'B: las dos semanas publicadas → sin aviso');
ok(entorno({rol:'Supervisor',rotaciones:[]}).avisoRotacion()===null,'B: el supervisor sin acceso a la rotación no recibe el aviso');
ok(entorno({rol:'Supervisor',rotaciones:[],botones:['btn-avance-produccion','btn-rotacion-supervisores']}).avisoRotacion().nivel==='roja','B: quien gestiona la rotación sí lo recibe');
const i67=leer('js/produccion/67-produccion-inicio.js');
ok(/htmlRotacion\(\)\)\+htmlSinFinalizar\(\)/.test(i67)&&/data-pi-reporte/.test(i67)&&/cargarReporteParaCorreccion/.test(i67),'Inicio: muestra los dos bloques y «Abrir» abre el reporte');

/* ---------- E · merma del Registro en la conciliación ---------- */
const sn={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp};vm.createContext(sn);sn.window=sn;
vm.runInContext(leer('js/asistente/70-asistente-nucleo.js'),sn);const N=sn.glacialAsistenteNucleo;
const q={mermas:[{item:'Tapa Plana',peso:1.34,unidades:1000},{item:'Tapa Sport Cap',peso:0,unidades:0},{item:'Etiqueta',peso:0.32,unidades:500},{item:'Polietileno',peso:2.5,unidades:0.09},{item:'Preformas',peso:5,unidades:200}]};
const tapa={codigo:'TAPA',tipo:'tapa',unidad:'UND'},etiq={codigo:'ETIQUETA',tipo:'etiqueta',unidad:'UND'},poli={codigo:'POLIETILENO',tipo:'polietileno',unidad:'kg'},caja={codigo:'CAJA_PREFORMA',tipo:'preforma',unidad:'caja'};
ok(N.mermaRegistro(q,tapa).cantidad===1000&&N.mermaRegistro(q,tapa).items.join()==='Tapa Plana','E: tapas en UND (solo las que tienen merma)');
ok(N.mermaRegistro(q,etiq).cantidad===500&&N.mermaRegistro(q,poli).cantidad===2.5,'E: etiquetas en UND y polietileno en kg (por peso)');
ok(N.mermaRegistro(q,caja)===null&&N.mermaRegistro(q,{codigo:'X',tipo:'tapa',unidad:'kg'})===null&&N.mermaRegistro(null,tapa)===null,'E: no mezcla unidades (preformas en cajas, tapa en kg) ni falla sin reporte');
const base={saldoInicial:20000,saldoFinal:3000,entregado:0,devuelto:0,transfEntrada:0,transfSalida:0,teorico:15000};
ok(N.conciliar(Object.assign({},base,{mermaValidada:0})).porRevisar===2000,'E: sin merma, 2 000 tapas por revisar');
ok(N.conciliar(Object.assign({},base,{mermaValidada:0,mermaRegistro:1000})).porRevisar===1000,'E: la merma del Registro explica parte de la desviación');
ok(N.conciliar(Object.assign({},base,{mermaValidada:500,mermaRegistro:1500})).porRevisar===0,'E: merma del Asistente + del Registro');
const p72=leer('js/asistente/72-asistente-pantalla.js');
ok(/N\.mermaRegistro\(cuadroDelReporte\(c\),i\)/.test(p72)&&/mermaRegistro:mreg\?mreg\.cantidad:0/.test(p72)&&/Merma del Registro \(supervisor\)/.test(p72)&&/revisa que no sea la misma/.test(p72),'E: el Asistente usa la merma del reporte, la muestra y avisa si también hay merma del Asistente');

console.log(fallas?`\n${fallas} falla(s)`:'\nTodo correcto');
process.exit(fallas?1:0);
