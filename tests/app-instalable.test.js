/* App instalable (PWA): manifiesto, íconos, service worker sin caché, registro y publicación. */
const fs=require('fs'),path=require('path');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const R=path.resolve(__dirname,'..'),leer=f=>fs.readFileSync(path.join(R,f),'utf8');
const P=require('../js/nucleo/03c-app-instalable.js');

/* Manifiesto */
const m=JSON.parse(leer('manifest.webmanifest'));
ok(m.name&&m.short_name==='GLACIAL'&&m.display==='standalone','manifiesto: nombre, nombre corto y pantalla completa');
ok(m.start_url==='./'&&m.scope==='./','manifiesto: rutas relativas (sirve en /glacial1/ y con dominio propio)');
ok(Array.isArray(m.icons)&&m.icons.every(i=>fs.existsSync(path.join(R,i.src))),'manifiesto: todos los íconos existen');
const tam=f=>{const b=fs.readFileSync(path.join(R,f));return b.readUInt32BE(16)+'x'+b.readUInt32BE(20);};   // ancho x alto del PNG
ok(m.icons.every(i=>tam(i.src)===i.sizes),'manifiesto: cada ícono mide lo que declara');
ok(['192x192','512x512'].every(s=>m.icons.some(i=>i.sizes===s&&i.purpose==='any'))&&m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'),'manifiesto: íconos 192 y 512, y uno adaptable (maskable)');

/* index.html y publicación */
const idx=leer('index.html'),con=leer('scripts/construir-publicacion.js');
ok(/<link rel="manifest" href="manifest\.webmanifest\?v=\d{8}-pw\d+">/.test(idx),'index.html enlaza el manifiesto');
ok(/03c-app-instalable\.js\?v=\d{8}-pw\d+/.test(idx),'index.html carga el registro de la app instalable');
ok(/'manifest\.webmanifest'/.test(con)&&/'sw\.js'/.test(con),'la publicación copia el manifiesto y sw.js a la raíz');
ok(fs.existsSync(path.join(R,'sw.js'))&&/register\('sw\.js'\)/.test(leer('js/nucleo/03c-app-instalable.js')),'sw.js está en la raíz y se registra con ruta relativa');

/* Service worker: no guarda nada; solo responde «Sin conexión» al abrir la página sin red */
const sw=leer('sw.js'),swCodigo=sw.replace(/\/\*[\s\S]*?\*\//g,'');
ok(!/caches\.open|cache\.put|cache\.add/.test(swCodigo),'sw.js no guarda caché (tiempo real y avisos de actualización intactos)');
const oyentes={};
const self_={addEventListener:(t,f)=>{oyentes[t]=f;},skipWaiting(){},clients:{claim:async()=>{}}};
class Resp{constructor(c,o){this.cuerpo=c;this.status=o.status;this.headers=o.headers;}}
let red=async()=>'RED';
new Function('self','caches','fetch','Response',sw)(self_,{keys:async()=>[]},(...a)=>red(...a),Resp);
const pedir=async(pedido)=>{let r;oyentes.fetch({request:pedido,respondWith:p=>{r=p;}});return r===undefined?undefined:await r;};
(async()=>{
  ok(await pedir({mode:'cors',method:'GET',url:'https://x.supabase.co/rest/v1/t'})===undefined,'sw.js no toca las llamadas de datos (Supabase)');
  ok(await pedir({mode:'no-cors',method:'GET',url:'js/nucleo/02-estado.js?v=1'})===undefined,'sw.js no toca scripts, estilos ni imágenes');
  ok(await pedir({mode:'navigate',method:'GET',url:'/'})==='RED','al abrir la página con red: responde la red');
  red=async()=>{throw new Error('sin red');};
  const r=await pedir({mode:'navigate',method:'GET',url:'/'});
  ok(r instanceof Resp&&r.status===503&&/Sin conexión/.test(r.cuerpo)&&/Reintentar/.test(r.cuerpo),'al abrir la página sin red: pantalla «Sin conexión»');

  /* Oferta de instalación */
  ok(P.yaInstalada({standalone:true})&&P.yaInstalada({displayStandalone:true})&&!P.yaInstalada({}),'detecta si ya corre instalada');
  ok(P.esIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)','iPhone',5)&&P.esIOS('Macintosh','MacIntel',5)&&!P.esIOS('Linux; Android 14','Linux armv8l',5)&&!P.esIOS('Macintosh','MacIntel',0),'detecta iPhone/iPad (y no Android ni Mac)');
  const b={instalada:false,tv:false,enLogin:true,ocultoHasta:0,ahora:1000,hayAviso:true,ios:false};
  ok(P.debeOfrecer(b),'ofrece instalar en el inicio de sesión cuando el navegador lo permite');
  ok(P.debeOfrecer({...b,hayAviso:false,ios:true}),'en iPhone ofrece la indicación de «Agregar a pantalla de inicio»');
  ok(!P.debeOfrecer({...b,instalada:true})&&!P.debeOfrecer({...b,tv:true})&&!P.debeOfrecer({...b,enLogin:false}),'no ofrece si ya está instalada, en modo TV o dentro de la aplicación');
  ok(!P.debeOfrecer({...b,ocultoHasta:2000})&&P.debeOfrecer({...b,ocultoHasta:500}),'«Ahora no» la oculta hasta la fecha guardada');
  ok(!P.debeOfrecer({...b,hayAviso:false}),'sin instalación disponible (ni iPhone): no muestra nada');
  console.log(fallas?('\n'+fallas+' FALLA(S)'):'\nTodo correcto');process.exit(fallas?1:0);
})();
