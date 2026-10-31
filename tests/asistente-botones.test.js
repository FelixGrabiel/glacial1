/* Revisión de botones del Asistente (31/10/2026): «Preparar solicitud» ya no parece muerto y un conteo vacío no se guarda como 0. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const p72=leer('js/asistente/72-asistente-pantalla.js'),p71=leer('js/asistente/71-asistente-datos.js'),html=leer('index.html');

ok(/window\.apIr=\(tab,sub\)=>\{[\s\S]*?ap-sol-nueva[\s\S]*?scrollIntoView[\s\S]*?\.focus\(/.test(p72),'«Preparar solicitud» lleva al formulario y lo enfoca aunque ya se estuviera en Solicitudes');
ok(/<div id="ap-sol-nueva"><\/div><div class="ap-nueva">/.test(p72),'el formulario tiene su ancla');
ok(/motivoVacio/.test(p72)&&/Todavía no hay factores de consumo cargados/.test(p72),'si no hay faltantes, el formulario explica por qué (faltan factores, o nada falta) en vez de quedar mudo');

/* «Cuadro al que se destina» al recibir una solicitud: los cuadros son los de la FECHA y el TURNO DE LA SOLICITUD, no los de la pantalla */
ok(/function cuadrosPara\(fecha,bloque\)/.test(p72)&&/const cuadrosSol=cuadrosPara\(s\.fecha,s\.bloque\)/.test(p72)&&/\$\{cuadrosSol\.map\(c=>/.test(p72),'la lista de cuadros al recibir sale de la fecha y el turno de la solicitud (antes salía vacía si la pantalla estaba en otro día o turno)');
ok(/cuadrosPara\(solicitud\.fecha,solicitud\.bloque\)/.test(p72),'el cuadro elegido se busca con esos mismos cuadros');
ok(/No hay cuadros programados para/.test(p72),'si de verdad no hay cuadros, se explica y se puede confirmar sin cuadro');

ok(/sinCuadros/.test(p71)&&/No hay cuadros programados para esa fecha y turno: indica la línea/.test(p71),'sin cuadros programados, la recepción exige al menos la línea (antes quedaba bloqueada sin salida)');
ok(/id="ap-rec-linea"/.test(p72)&&/sinCuadros\?valor\('ap-rec-linea'\)/.test(p72.replace(/\s+/g,' ').replace('sinCuadros ? valor','sinCuadros?valor')),'la ventana ofrece «Línea a la que se destina» cuando no hay cuadros');
ok(/alert\('Elige el cuadro al que se destina lo recibido\.'\)/.test(p72)&&/return;\}\s*if\(!String\(datos\.linea/.test(p72),'se avisa antes de cerrar la ventana (no se pierde lo escrito)');

/* Resumen: «Para empezar» (configuración pendiente) y flujo del turno */
ok(/function pasosEmpezar\(ctx\)/.test(p72)&&/function tarjetaEmpezar\(ctx\)/.test(p72)&&/\$\{tarjetaEmpezar\(ctx\)\}/.test(p72),'el Resumen muestra «Para empezar»');
ok(['Catálogo de insumos','Factores de consumo','Programación de este turno','Conteo de existencias en Producción'].every(t=>p72.includes(t)),'revisa catálogo, factores, programación y conteo');
ok(['Contar','Ver faltantes','Solicitar','Recibir','Consumo y merma'].every(t=>p72.includes("'"+t+"'")),'el flujo del turno tiene sus cinco pasos con botón');
ok(/'Para empezar · '\+pend\.length/.test(p72)&&/'Flujo del turno'/.test(p72),'la tarjeta se reduce a «Flujo del turno» cuando todo está configurado');

/* Orden visual (31/10/2026) */
ok(/\.ap input\[type=checkbox\],\.ap input\[type=radio\]\{width:18px;height:18px;min-height:0/.test(p72),'las casillas dejan de heredar el tamaño de los campos de texto (en Historial salían gigantes)');
ok(/\.ap-filtros \.ap-chk\{grid-column:1\/4/.test(p72)&&/\.ap-filtros \.ap-acc\{grid-column:4\/-1/.test(p72),'los filtros del Historial quedan en dos filas ordenadas');
ok(/\.ap-btn,\.ap-btn-s\{white-space:nowrap\}/.test(p72),'los botones no parten su texto («Ver detalle»)');
ok(/<div class="ap-nueva"><div class="ap-tit-acc"><h3 class="ap-h3">Preparar solicitud a Almacén/.test(p72)&&/\.ap-nueva\{border:1px solid/.test(p72),'«Preparar solicitud a Almacén» es un bloque propio con su botón de faltantes en el título');
ok(/p\.ap-sub\{padding:0/.test(p72),'el párrafo «ap-sub» ya no hereda el relleno de la subpestaña');
ok(/\.ap-atender li\{flex-wrap:wrap\}/.test(p72)&&/\.ap-kpis-4,\.ap-kpis-3\{grid-template-columns:1fr 1fr!important/.test(p72),'en el celular, «Por atender» deja el texto a todo el ancho y los indicadores van de dos en dos');

ok(/function tarjetaEmpezar\(ctx\)\{\s*if\(!puede\('asistenteProduccion'\)&&!puede\('gestionarFactores'\)\)return ''/.test(p72),'«Para empezar» y el flujo del turno no se muestran a quien solo consulta ni a Almacén');
ok(/<option value="MATERIAL">Material o insumo<\/option>/.test(p72),'el tipo de merma ya no se corta en el desplegable');
ok(/\.ap-kpi\{gap:10px;padding:12px\}/.test(p72),'en el celular los indicadores del Resumen son más compactos');
const p86=leer('js/asistente/86-evidencias-insumos-pantalla.js');
ok(/@media\(max-width:1500px\)\{\.ie-cols\{grid-template-columns:1fr\}/.test(p86),'Evidencias: hasta 1500 px la foto va arriba y los campos ocupan todo el ancho (no se cortan)');

ok(/falt\.length>2\?pill\('Faltan '\+falt\.length\+' insumos','rojo'\)/.test(p72),'Seguimiento: con más de dos faltantes se muestra «Faltan N insumos» y los nombres debajo (antes una etiqueta por insumo en cada fila)');
ok(/\.ap \.ap-t th\{white-space:normal;line-height:1\.25\}/.test(p72),'las tablas de muchas columnas (Previsión) caben sin cortar «Estado»');

/* Accesibilidad, impresión y mensajes */
ok(/\.ap button:focus-visible[\s\S]*?outline:3px solid #7fb8d6/.test(p72),'el foco del teclado se ve en botones, pestañas, campos y filas');
ok(/querySelectorAll\('\.ap-clic'\)[\s\S]*?setAttribute\('tabindex','0'\)/.test(p72)&&/e\.key==='Enter'\|\|e\.key===' '/.test(p72),'las filas que se abren con un clic también se abren con el teclado (Enter o espacio)');
ok(/@media print\{[\s\S]*?#glacial-sidebar,\.sidebar,\.topbar/.test(p72)&&/\.ap-card:has\(\.ap-filtros\)\{display:none!important\}/.test(p72),'«Resumen imprimible» sale sin el menú ni la cabecera de la aplicación ni la tarjeta de filtros');
const p70=leer('js/asistente/70-asistente-nucleo.js');
ok(!/Unidad no válida|Tipo no válido|La base debe ser UND o PALETA|Vigente desde: fecha AAAA-MM-DD/.test(p70)&&/Elige la unidad del insumo/.test(p70)&&/Indica desde qué fecha rige el factor/.test(p70),'los mensajes de insumos y factores dicen qué hacer');
ok(!/No se puede pasar de '\+sol\.estado/.test(p71)&&/etiquetaEstadoSol\(sol\.estado\)/.test(p71),'al cambiar una solicitud ya modificada por otra persona, el mensaje usa los nombres de los estados y explica qué hacer');

/* validarMovimiento (71) con el núcleo real */
global.window=global;
require(R+'/js/asistente/70-asistente-nucleo.js');
const vm=require('vm');
const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,Promise,isFinite,window:null,document:{getElementById:()=>null},firebase:{},db:null,state:{user:null},glacialAsistenteNucleo:global.glacialAsistenteNucleo};sb.window=sb;
const cuerpo=(()=>{const i=p71.indexOf('function validarMovimiento');let d=0,j=p71.indexOf('{',i);const k=j;for(;j<p71.length;j++){if(p71[j]==='{')d++;else if(p71[j]==='}'&&!--d)break;}return p71.slice(i,j+1);})();
vm.createContext(sb);
vm.runInContext('const N=glacialAsistenteNucleo;const num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+cuerpo+';this.validar=validarMovimiento;',sb);
const base={tipo:'CONTEO',insumo:'C01',condicion:'UTILIZABLE'};
ok(sb.validar(Object.assign({},base,{cantidad:''})).length>0&&sb.validar(Object.assign({},base,{cantidad:undefined})).length>0&&sb.validar(Object.assign({},base,{cantidad:'  '})).length>0,'un conteo con la cantidad vacía no se guarda (antes se guardaba como 0)');
ok(sb.validar(Object.assign({},base,{cantidad:'0'})).length===0&&sb.validar(Object.assign({},base,{cantidad:0})).length===0,'un conteo en 0 escrito a propósito sí se guarda');
ok(sb.validar(Object.assign({},base,{cantidad:'125.5'})).length===0,'un conteo normal se guarda');
ok(sb.validar({tipo:'DEVOLUCION',insumo:'C01',cantidad:'0',cuadro:'k'}).length>0,'una devolución en 0 sigue sin guardarse');
ok(/71-asistente-datos\.js\?v=20261031-ar9/.test(html)&&/72-asistente-pantalla\.js\?v=20261031-ar9/.test(html),'index.html: versiones subidas');
console.log(fallas?'\n'+fallas+' fallas':'\nBotones del Asistente correctos');
process.exit(fallas?1:0);
