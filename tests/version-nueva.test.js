/* 12d-version-nueva.js: la página abierta muchas horas (bot de WhatsApp) detecta que se publicó una versión nueva comparando los ?v= de los scripts.
   Uso: node tests/version-nueva.test.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.resolve(__dirname, '..');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if(!c) fallas++; };
const sb = { console, Date, Number, String, Math, Promise };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(R, 'js/nucleo/12d-version-nueva.js'), 'utf8'), sb);
const V = sb.glacialVersionNueva;
const html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
const h = V.huellaHtml(html), n = h.split('\n').length;
ok(n > 150 && h.includes('js/nucleo/12d-version-nueva.js?v='), 'la huella de index.html trae todos los scripts locales (' + n + ')');
ok(!V.esNueva(h, V.huellaHtml(html)), 'misma publicación → no hay versión nueva');
const otra = html.replace(/29-avance-produccion\.js\?v=[^"]+/, '29-avance-produccion.js?v=20991231-x');
ok(V.esNueva(h, V.huellaHtml(otra)), 'cambia el ?v= de un script → versión nueva');
ok(!V.esNueva(h, '') && !V.esNueva(h, 'js/a.js?v=1'), 'una lectura vacía o cortada (error de red) no cuenta como versión nueva');
ok(V.huella(['https://cdn.x/y.js', 'js/b.js?v=2', 'js/a.js?v=1']) === 'js/a.js?v=1\njs/b.js?v=2', 'solo cuentan los scripts locales, en orden');
const avance = fs.readFileSync(path.join(R, 'js/produccion/29-avance-produccion.js'), 'utf8');
ok(/glacialAvancePreparar=async function\(\)\{\n  window\.__glxBotUltimoUso=Date\.now\(\)/.test(avance), 'el bot marca «ocupado» al armar un Avance/Cierre (no se recarga a la mitad)');
console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
