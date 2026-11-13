/* Aviso «HAY UNA ACTUALIZACIÓN NUEVA»: firma de index.html, comparación y sello de la publicación. Datos inventados. */
const fs=require('fs'),path=require('path');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const A=require('../js/nucleo/03-actualizacion.js'),{sellar}=require('../scripts/sello-build.js');
const leer=f=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');

const scripts=n=>Array.from({length:n},(_,i)=>'<script src="js/a/'+i+'.js?v=2026111'+(i%10)+'-x'+i+'"></script>').join('\n');
const html=(extra,meta)=>'<html><head><title>t</title>'+(meta||'')+'</head><body><!-- <script src="js/viejo.js?v=1"></script> -->'+scripts(12)+(extra||'')+'<link rel="stylesheet" href="css/s.css?v=20261107-hl1"></body></html>';
const base=A.firmaDeTexto(html());
ok(base.recursos.length===13&&!base.recursos.some(r=>/viejo/.test(r)),'firma: scripts y estilos con ?v=, sin lo comentado');
ok(!A.hayCambio(base,A.firmaDeTexto(html())),'misma publicación: no avisa');
ok(A.hayCambio(base,A.firmaDeTexto(html('<script src="js/a/3.js?v=20261113-zz"></script>'))),'una versión ?v= nueva: avisa');
ok(A.hayCambio(base,A.firmaDeTexto(html('','<meta name="glacial-build" content="abc|1">')))===false,'si solo uno trae sello, se compara por versiones (no avisa de más)');
const a1=A.firmaDeTexto(html('','<meta name="glacial-build" content="abc123|2026111301">')),a2=A.firmaDeTexto(html('','<meta name="glacial-build" content="def456|2026111302">'));
ok(A.hayCambio(a1,a2)&&!A.hayCambio(a1,a1),'otro sello de publicación: avisa aunque no cambie ninguna versión ?v=');
ok(!A.hayCambio(base,A.firmaDeTexto('<html><body>Error 503</body></html>'))&&!A.hayCambio(base,A.firmaDeTexto('')),'una respuesta incompleta o de error no cuenta como actualización');
ok(!A.hayCambio(A.firmaDeTexto(html('<script src="js/extra.js?v=1"></script>')),base),'si esta página cargó algo de más por su cuenta, no avisa');

/* sello */
const s1=sellar('<html><head><title>x</title></head><body></body></html>','a1b2c3|2026111301');
ok(/<meta name="glacial-build" content="a1b2c3\|2026111301">\s*<\/head>/.test(s1),'sellar: agrega la marca antes de </head>');
ok((sellar(s1,'z9|1').match(/glacial-build/g)||[]).length===1&&/content="z9\|1"/.test(sellar(s1,'z9|1')),'sellar dos veces no duplica la marca');
ok(!/[<>"]/.test(/content="([^"]*)"/.exec(sellar('<head></head>','a"><script>x'))[1]),'el identificador no puede romper el HTML');

/* conexión con la página y la publicación */
const idx=leer('index.html'),con=leer('scripts/construir-publicacion.js'),js=leer('js/nucleo/03-actualizacion.js');
ok(/03-actualizacion\.js\?v=\d{8}-ac\d/.test(idx),'index.html carga el aviso');
ok(/sello-build\.js/.test(con)&&/GITHUB_SHA/.test(con),'la publicación sella index.html con el commit');
ok(/HAY UNA ACTUALIZACIÓN NUEVA/.test(js)&&/Actualizar ahora/.test(js)&&/Más tarde/.test(js)&&/cache:'no-store'/.test(js)&&!/location\.reload\(\);\s*\}\s*\)\s*;\s*$/.test(js),'el aviso dice lo pedido y baja index.html sin caché');
/* Recarga automática segura (13/11/2026). */
const e0={escribiendo:false,modal:false,guardando:false,oculta:false,inactivoMs:0,tv:false,pospuestoHasta:0,ahora:1e9};
const S=x=>A.esSeguroRecargar(Object.assign({},e0,x));
ok(!S({})&&S({inactivoMs:A.INACTIVO_MS})&&S({oculta:true}),'se recarga sola solo con la pestaña en segundo plano o 2 minutos sin tocar nada');
ok(!S({oculta:true,escribiendo:true})&&!S({oculta:true,modal:true})&&!S({oculta:true,guardando:true}),'nunca mientras alguien escribe, hay una ventana abierta o se está guardando');
ok(S({tv:true})&&!S({tv:true,modal:true}),'en la TV de planta, en cuanto es seguro');
ok(!S({oculta:true,pospuestoHasta:2e9})&&S({oculta:true,pospuestoHasta:5e8}),'«Más tarde» la pospone (30 minutos)');
ok(/REINTENTO_MS/.test(js)&&/sessionStorage\.setItem\(CLAVE/.test(js)&&/setInterval\(probarRecarga,REVISAR_SEGURO_MS\)/.test(js),'revisa cada 15 s si ya es seguro y no recarga en bucle si la caché devuelve la página vieja');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
