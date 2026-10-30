/* Inicio de Producción: tarjetas por tareas, menú lateral reducido y botón «← Inicio de Producción». */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const html=leer('index.html'),src=leer('js/produccion/67-produccion-inicio.js'),side=leer('js/nucleo/04-sidebar.js');

const botones=[...src.matchAll(/boton:'(btn-[a-z-]+)'/g)].map(m=>m[1]);
ok(botones.length===7&&new Set(botones).size===7,'siete tarjetas, una por pantalla del grupo, sin repetir');
ok(botones.every(b=>new RegExp('id="'+b+'"').test(html)),'cada tarjeta se apoya en un botón que existe en el menú (la visibilidad del botón decide si se ve la tarjeta)');
const panel=html.slice(html.indexOf('id="sidebar-panel-produccion"'),html.indexOf('id="sidebar-group-almacen"'));
ok(/id="btn-prod-inicio"[\s\S]*?goProduccionInicio\(\)/.test(panel)&&panel.indexOf('btn-prod-inicio')<panel.indexOf('sidebar-lines'),'«Inicio de Producción» es lo primero del grupo en el menú');
ok(/pi-menu-css/.test(src)&&['btn-tareo','btn-rotacion-supervisores','btn-bitacora-prod','btn-resumenes-turno','btn-entrega-turno','btn-horario-produccion'].every(b=>src.includes("'"+b+"'"))&&!/'btn-avance-produccion','btn-tareo'.*display:none/.test(src),'el menú oculta tareo, rotación, bitácora, resúmenes, entrega y horario (siguen en las tarjetas); Avance y cierre y las líneas se quedan');
ok(/PANTALLAS=\['avance-produccion','tareo','rotacion-supervisores','resumenes-turno','entrega-turno','horario-produccion'\]/.test(src)&&/← Inicio de Producción/.test(src),'las pantallas del módulo llevan el botón «← Inicio de Producción»');
ok(!/'bitacora-mtto'/.test(src.slice(src.indexOf('const PANTALLAS'),src.indexOf('function botonVolver'))),'la bitácora (compartida con Mantenimiento) no lleva el botón de Producción');
ok(/'prod-inicio'/.test(side)&&/'entrega-turno'/.test(side)&&/'resumenes-turno'/.test(side),'el menú marca el grupo Producción como activo en el inicio, la entrega y los resúmenes');
ok(html.indexOf('67-produccion-inicio.js')>html.indexOf('68-mantenimiento-inicio.js')&&html.indexOf('67-produccion-inicio.js')>html.indexOf('66-entrega-turno.js'),'index.html carga el inicio después de 66 y de 68');
ok(/estilos/.test(leer('js/mantenimiento/68-mantenimiento-inicio.js').match(/window\.glacialMantInicio=\{[^}]*\}/)[0]),'comparte los estilos del inicio de Mantenimiento');
ok(!/alert\(|confirm\(|prompt\(/.test(src.replace(/confirmarAbandonoRotacionPendiente/g,'')),'sin alert/confirm/prompt');
console.log(fallas?'\n'+fallas+' fallas':'\nInicio de Producción correcto');
process.exit(fallas?1:0);
