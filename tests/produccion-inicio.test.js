/* Inicio de Producción: tarjetas por tareas, menú lateral reducido y botón «← Inicio de Producción». */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const html=leer('index.html'),src=leer('js/produccion/67-produccion-inicio.js'),side=leer('js/nucleo/04-sidebar.js');

const botones=[...src.matchAll(/boton:'(btn-[a-z-]+)'/g)].map(m=>m[1]);
ok(botones.length===10&&new Set(botones).size===10,'diez tarjetas con botón del menú, sin repetir (más Cierre por marca e Historial, que dependen del permiso de la línea)');
const titulos=[...src.matchAll(/titulo:'([^']+)',subtitulo/g)].map(m=>m[1]);
ok(titulos.join('|')==='Paradas|Cierre del turno|Personal y configuración','grupos en el orden del turno: Paradas, Cierre del turno, Personal y configuración');
ok(/titulo:'Paradas del turno',nuevo:true/.test(src)&&/titulo:'Cierre por marca',nuevo:true/.test(src)&&/boton:'btn-analisis-paradas'/.test(src)&&/boton:'btn-bitacora-prod'/.test(src),'el grupo Paradas junta Paradas del turno y Cierre por marca (NUEVO), Bitácora y Análisis de paradas');
const pasos=[...src.matchAll(/\{n:(\d),titulo:'([^']+)'/g)].map(m=>m[2]);
ok(pasos.join('|')==='Nuevo registro|Paletas|+ Parada|Cerrar marca|Avance y cierre|Entrega de turno','«Tu turno, paso a paso»: los 6 pasos en orden');
ok(/#ct-panel/.test(src)&&/#pu-avance/.test(src)&&/avAbrirParadas\(key,d\.fecha,d\.turno\)/.test(src),'Cerrar marca baja al panel de Paletas, Paradas del turno a su tarjeta en Avance y «+ Parada» abre el formulario único con la fecha y turno de Paletas');
ok(botones.every(b=>new RegExp('id="'+b+'"').test(html)),'cada tarjeta se apoya en un botón que existe en el menú (la visibilidad del botón decide si se ve la tarjeta)');
const panel=html.slice(html.indexOf('id="sidebar-panel-produccion"'),html.indexOf('id="sidebar-group-almacen"'));
ok(/id="btn-prod-inicio"[\s\S]*?goProduccionInicio\(\)/.test(panel)&&panel.indexOf('btn-prod-inicio')<panel.indexOf('sidebar-lines'),'«Inicio de Producción» es lo primero del grupo en el menú');
const otros=(src.match(/const OTROS=\[([^\]]*)\]/)||[])[1]||'';
ok(/pi-menu-css/.test(src)&&['btn-tareo','btn-rotacion-supervisores','btn-bitacora-prod','btn-resumenes-turno','btn-horario-produccion'].every(b=>otros.includes("'"+b+"'"))&&!otros.includes('btn-entrega-turno')&&!otros.includes('btn-paradas-turno'),'el menú oculta tareo, rotación, bitácora, resúmenes y horario (siguen en las tarjetas); Avance y cierre, Paradas del turno, Entrega de turno y las líneas se quedan');
ok(/id="btn-paradas-turno"[\s\S]*?goParadasTurno\(\)/.test(panel)&&panel.indexOf('btn-avance-produccion')<panel.indexOf('btn-paradas-turno')&&panel.indexOf('btn-paradas-turno')<panel.indexOf('btn-entrega-turno'),'menú: Avance y cierre → Paradas del turno → Entrega de turno');
ok(/PANTALLAS=\['avance-produccion','tareo','rotacion-supervisores','resumenes-turno','entrega-turno','horario-produccion'\]/.test(src)&&/← Inicio de Producción/.test(src),'las pantallas del módulo llevan el botón «← Inicio de Producción»');
ok(!/'bitacora-mtto'/.test(src.slice(src.indexOf('const PANTALLAS'),src.indexOf('function botonVolver'))),'la bitácora (compartida con Mantenimiento) no lleva el botón de Producción');
ok(/'prod-inicio'/.test(side)&&/'entrega-turno'/.test(side)&&/'resumenes-turno'/.test(side),'el menú marca el grupo Producción como activo en el inicio, la entrega y los resúmenes');
ok(html.indexOf('67-produccion-inicio.js')>html.indexOf('68-mantenimiento-inicio.js')&&html.indexOf('67-produccion-inicio.js')>html.indexOf('66-entrega-turno.js'),'index.html carga el inicio después de 66 y de 68');
ok(/estilos/.test(leer('js/mantenimiento/68-mantenimiento-inicio.js').match(/window\.glacialMantInicio=\{[^}]*\}/)[0]),'comparte los estilos del inicio de Mantenimiento');
ok(!/alert\(|confirm\(|prompt\(/.test(src.replace(/confirmarAbandonoRotacionPendiente/g,'')),'sin alert/confirm/prompt');
console.log(fallas?'\n'+fallas+' fallas':'\nInicio de Producción correcto');
process.exit(fallas?1:0);
