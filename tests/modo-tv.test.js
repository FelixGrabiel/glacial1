/* GLACIAL TV · modo televisión (js/tv/glacial-tv.js + css/tv-glacial.css): parámetros, modelos con los datos del Inicio, textos de estado,
   frescura, HTML sin nada pulsable, escape de textos y AISLAMIENTO (sin ?modo=tv no cambia nada de la aplicación). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

function cargar(extra){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,URLSearchParams,setInterval:()=>0,clearInterval:()=>0,...extra};
  vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/tv/glacial-tv.js'),sb);
  return sb;
}
const sb=cargar();const T=sb.glacialTV;
ok(!!T&&typeof T.modeloInicio==='function','el módulo se carga sin navegador y expone sus funciones puras');

/* ---------- parámetros ---------- */
const p=s=>JSON.stringify(T.leerParametros(s));
ok(p('?modo=tv&vista=lineas')===JSON.stringify({activo:true,vista:'lineas'}),'?modo=tv&vista=lineas → activo y vista «lineas»');
ok(p('?modo=tv')===JSON.stringify({activo:true,vista:'inicio'}),'sin vista → «inicio»');
ok(p('?modo=tv&vista=hackeo')===JSON.stringify({activo:true,vista:'inicio'}),'vista desconocida → «inicio» (lista cerrada)');
ok(p('?modo=tv&vista=actual')===JSON.stringify({activo:true,vista:'actual'}),'vista «actual» reconocida');
ok(!T.leerParametros('').activo&&!T.leerParametros('?vista=lineas').activo&&!T.leerParametros('?modo=otro').activo&&!T.leerParametros(null).activo,'sin modo=tv NO se activa (vacío, solo vista, otro modo, null)');

/* ---------- datos de ejemplo con la forma real de cpDatosEjecutivo() ---------- */
const fila=(linea,estado,o={})=>({linea,estado,producido:0,programado:0,avance:0,ultimoMs:0,desglose:null,...o});
const d={
  fecha:'2026-10-23',turno:'DÍA',avance:35.4,
  vigentes:[fila('PET1','PAUSA',{producido:9648,programado:27600}),fila('PET2','EN_CURSO',{producido:20250,programado:45000})],
  enCurso:2,totalLineas:5,nombresEnCurso:['PET1','PET2'],lineasAutorizadas:['PET1','PET2','B7L','C20L','B20L'],
  filas:[
    fila('PET1','PAUSA',{producido:9648,programado:27600,avance:35,ultimoMs:1,desglose:{estado:'PAUSA',actual:{marca:'Scala',presentacion:'1 L',producido:9648,programado:27600,avance:35}}}),
    fila('PET2','EN_CURSO',{producido:20250,programado:45000,avance:45,ultimoMs:2,marca:'Scala_Bus',presentacion:'625 ml'}),
    fila('B7L','COMPLETADA',{producido:7473,programado:7473,avance:100,ultimoMs:3}),
    fila('C20L','CANCELADA',{producido:56,programado:2000,avance:3,ultimoMs:4}),
    fila('B20L','PENDIENTE',{producido:0,programado:5000,avance:0})
  ],
  paradas:{prog:181,noProg:221,motivos:[
    {linea:'PET1',motivo:'Refrigerio',minutos:60,clasif:'PROGRAMADA'},{linea:'C20L',motivo:'Falla de máquina <b>x</b>',minutos:90,clasif:'NO_PROGRAMADA'},
    {linea:'PET2',motivo:'Calibración',minutos:20,clasif:'NO_PROGRAMADA'},{linea:'B7L',motivo:'Limpieza',minutos:5,clasif:'PROGRAMADA'}]}
};
const dep={
  nombreLinea:k=>({C20L:'CAJAS 20L'}[k]||k),unidad:k=>({B7L:'BID',C20L:'CAJ',B20L:'BID'}[k]||'UND'),
  fmt:n=>Number(n).toLocaleString('es-PE'),duracion:m=>m>=60?`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')} min`:`${m} min`,
  hora:ms=>'0'+ms+':00',presentacion:(k,m)=>m.presentacion,productoActual:f=>[f.marca,f.presentacion].filter(Boolean).join(' · ')||'—',
  sinProduccion:()=>({estado:'listo',filas:[{linea:'B20L',pendiente:false,causa:'INFORMADA',motivo:'Falta de personal'}]}),
  personal:()=>({error:false,sincronizado:true,hayDistribucion:true,distribuido:26,apoyo:0,disponible:45,sinAsignar:19,
    lineas:[{linea:'PET1',pendiente:false,cantidad:7,alerta:''},{linea:'C20L',pendiente:true,cantidad:null,alerta:'sinpersonal'}]})
};

const m=T.modeloInicio(d,dep);
ok(m.avance.pct===35&&/29,898 de 72,600 UND/.test(m.avance.detalle),'avance: 35 % y, con una sola unidad, «producido de programado UND» (misma regla que el Inicio)');
const mixto=T.modeloInicio({...d,vigentes:[fila('PET1','PAUSA',{producido:1,programado:2}),fila('B7L','EN_CURSO',{producido:1,programado:2})]},dep);
ok(/Promedio de 2 líneas con programación/.test(mixto.avance.detalle),'avance: con unidades distintas (UND y BID) NO se suman: «Promedio de 2 líneas con programación»');
ok(m.enProduccion.n===2&&m.enProduccion.total===5&&m.enProduccion.nombres.join()==='PET1,PET2','líneas en producción: 2 / 5');
ok(m.paradas.prog==='3 h 01 min'&&m.paradas.noProg==='3 h 41 min','paradas del turno con el mismo formato de duración');
ok(m.motivos.length===3&&m.motivos.map(x=>x.min).join()==='1 h 30 min,1 h 00 min,20 min','motivos: los 3 de mayor duración, ordenados');
ok(m.motivos[0].prog===false&&m.motivos[1].prog===true,'motivos: distingue programada de no programada');
ok(m.personal.estado==='ok'&&m.personal.lineas[1].valor==='Pendiente'&&m.personal.lineas[1].alerta===true&&m.personal.disponible===45,'personal: solo cifras por línea (sin nombres de personas), «Pendiente» y alerta');
ok(m.sinProduccion.filas.length===1&&m.sinProduccion.filas[0].nombre==='B20L'&&m.sinProduccion.filas[0].texto==='Falta de personal','líneas sin producción: la causa informada');

const L=Object.fromEntries(m.lineas.map(l=>[l.linea,l]));
ok(L.PET1.estado.txt==='EN PAUSA'&&L.PET2.estado.txt==='EN CURSO'&&L.PET1.estado.cls!==L.PET2.estado.cls,'En pausa y En curso se distinguen por TEXTO y por clase (no solo por color)');
ok(L.PET1.estado.ico!==L.PET2.estado.ico,'… y por ícono');
ok(L.PET1.producto==='Scala · 1 L'&&L.PET1.producido===9648&&L.PET1.programado===27600&&L.PET1.pct===35,'PET1: usa la marca en curso (desglose.actual) y su cumplimiento');
ok(L.PET2.producto==='Scala_Bus · 625 ml'&&L.PET2.pct===45,'PET2: sin desglose usa los datos de la fila');
ok(L.B7L.estado.txt==='COMPLETADA'&&L.C20L.estado.txt==='CANCELADA','completada y cancelada');
ok(L.C20L.unidad==='CAJ'&&L.B7L.unidad==='BID'&&L.PET1.unidad==='UND'&&L.C20L.nombre==='CAJAS 20L','cada línea conserva su unidad y su nombre (no se mezclan UND, BID y CAJ)');
ok(L.B20L.estado.txt==='SIN PRODUCCIÓN'&&L.B20L.nota==='Falta de personal','línea con programación y sin producción = SIN PRODUCCIÓN con su motivo (informativo)');
ok(L.PET1.ultimo==='01:00'.replace('01','01')||L.PET1.ultimo==='01:00'||/:00$/.test(L.PET1.ultimo),'último registro de la línea');
const dSinFila={...d,filas:d.filas.filter(f=>f.linea!=='B7L')};
ok(T.modeloLineas(dSinFila,dep).find(l=>l.linea==='B7L').estado.txt==='SIN PROGRAMACIÓN','línea sin fila = SIN PROGRAMACIÓN');
const dVacio={...d,vigentes:[],avance:0};
ok(T.modeloInicio(dVacio,dep).avance.pct===null&&/Sin programación/.test(T.modeloInicio(dVacio,dep).avance.detalle),'sin líneas vigentes: «—» y «Sin programación para evaluar» (no un 0 % inventado)');
ok(T.modeloPersonal(null,dep).estado==='sin_modulo'&&T.modeloPersonal({error:true},dep).estado==='error'&&T.modeloPersonal({sincronizado:false},dep).estado==='cargando'&&T.modeloPersonal({sincronizado:true,hayDistribucion:false},dep).estado==='pendiente','personal: estados sin módulo, error, cargando y pendiente');

/* ---------- frescura ---------- */
const hora=ms=>'h'+ms;
const e1=T.estadoDatos({ahora:1000,ultimoOk:900,estadoPagina:{warn:false,texto:'Actualizado a las 10:00'},hora});
ok(!e1.warn&&e1.nivel==='ok'&&e1.texto==='Actualizado h900','con conexión y datos recientes: «Actualizado hh:mm»');
const e2=T.estadoDatos({ahora:1000,ultimoOk:900,estadoPagina:{warn:true,texto:'Sin conexión · datos de las 14:58'},hora});
ok(e2.warn&&e2.nivel==='sinconexion'&&e2.texto==='SIN CONEXIÓN · datos de las 14:58','sin conexión: SIN CONEXIÓN · datos de las hh:mm (ámbar) y nunca «Actualizado»');
const e3=T.estadoDatos({ahora:T.SIN_DATOS_MS+5000,ultimoOk:1000,estadoPagina:null,hora});
ok(e3.warn&&e3.nivel==='sindatos'&&/^SIN DATOS · última actualización h1000$/.test(e3.texto),'más de 2 min sin poder calcular: SIN DATOS con la última hora buena');
ok(T.estadoDatos({ahora:5,ultimoOk:0,estadoPagina:null,hora}).nivel==='sindatos','nunca se calculó: SIN DATOS (no se muestra «Actualizado»)');

/* ---------- HTML ---------- */
const hi=T.htmlInicio(m),hl=T.htmlLineas(m);
const sinInteractivo=h=>!/<(button|a|input|select|textarea|form)\b|onclick=|href=|contenteditable|tabindex/i.test(h);
ok(sinInteractivo(hi)&&sinInteractivo(hl),'el HTML de las vistas NO tiene botones, enlaces, campos ni eventos: no hay nada que pulsar ni modificar');
ok(!/<b>x<\/b>/.test(hi)&&/Falla de máquina &lt;b&gt;x&lt;\/b&gt;/.test(hi),'los textos dinámicos se escapan (un motivo con HTML no se interpreta)');
ok(/Avance del turno/.test(hi)&&/Líneas en producción/.test(hi)&&/Paradas del turno/.test(hi)&&/Motivos registrados/.test(hi)&&/Distribución de personal/.test(hi)&&/Líneas sin producción/.test(hi)&&/Producción por línea/.test(hi),'INICIO trae las 6 tarjetas y la tabla por línea');
ok((hi.match(/<tr><th>[^<]*<\/th>\s*<td class="tv-prod"/g)||[]).length===5&&(hl.match(/<article/g)||[]).length===5,'las 5 líneas aparecen en las dos vistas');
ok(/EN PAUSA/.test(hl)&&/EN CURSO/.test(hl)&&/SIN PRODUCCIÓN/.test(hl),'PRODUCCIÓN POR LÍNEA muestra el estado en texto');
ok(/CAJ/.test(hl)&&/BID/.test(hl)&&/UND/.test(hl),'conserva las unidades por línea');
const mar=T.marco('lineas',e2,'23/10/2026 · DÍA + INTERMEDIO',hl);
ok(/PRODUCCIÓN POR LÍNEA/.test(mar)&&/SIN CONEXIÓN/.test(mar)&&/tv-chip-sinconexion/.test(mar)&&/GLACIAL/.test(mar)&&/assets\/img\/logo_glacial\.jpeg/.test(mar),'el marco trae título, estado de conexión en ámbar, marca y el logo nuevo');
ok(sinInteractivo(mar),'el marco completo tampoco tiene nada pulsable');
ok(/Vista en preparación/.test(T.htmlProximamente()),'«actual» muestra «Vista en preparación» (llega en la fase 2)');

/* ---------- aislamiento ---------- */
const clases=new Set();
const sbDom=cargar({document:{documentElement:{classList:{add:c=>clases.add(c)}},body:{appendChild(){}},createElement(){return {style:{setProperty(){}},setAttribute(){}};}},location:{search:'?pagina=1'}});
ok(clases.size===0,'sin ?modo=tv el script NO toca la página (no agrega clases)');
const clases2=new Set();
cargar({document:{documentElement:{classList:{add:c=>clases2.add(c)}},body:{appendChild(){}}},location:{search:'?modo=tv&vista=inicio'}});
ok(clases2.has('modo-tv'),'con ?modo=tv marca la página con la clase modo-tv');

const css=leer('css/tv-glacial.css');
const reglas=css.replace(/\/\*[\s\S]*?\*\//g,'').split('}').map(s=>s.split('{')[0].trim()).filter(Boolean);
const sueltas=reglas.filter(r=>r.split(',').some(sel=>!/^(html\.modo-tv|#glacial-tv)/.test(sel.trim())));
ok(reglas.length>20&&sueltas.length===0,'TODAS las reglas de css/tv-glacial.css están acotadas a #glacial-tv o html.modo-tv'+(sueltas.length?' → '+sueltas.slice(0,3).join(' | '):''));
const html=leer('index.html');
ok((html.match(/css\/tv-glacial\.css/g)||[]).length===1&&(html.match(/js\/tv\/glacial-tv\.js/g)||[]).length===1,'index.html carga la hoja y el script una sola vez');
ok(html.indexOf('js/tv/glacial-tv.js')>html.indexOf('js/nucleo/12-init.js'),'el script del modo TV se carga DESPUÉS de 12-init.js');
const js=leer('js/tv/glacial-tv.js');
ok(!/\b(set|update|delete|add)\s*\(|\.commit\(|fetch\(|XMLHttpRequest|localStorage\.setItem|sessionStorage\.setItem/.test(js.replace(/ctx\.|classList\.add|Set\(|new Set|Map\(|\.add\(/g,'')),'el módulo no escribe nada: sin guardados, sin peticiones, sin almacenamiento');
ok(/cpDatosEjecutivo\(\)/.test(js)&&/cpFilasSinProduccion/.test(js)&&/cpPersonalPorLinea/.test(js),'reutiliza las funciones del Inicio (no repite cálculos)');

if(fallas){console.log('\n'+fallas+' falla(s)');process.exit(1);}
console.log('\nmodo TV: todo correcto');
