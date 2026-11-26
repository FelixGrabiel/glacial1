/* Carga de scripts de index.html: archivos que existen, sobrescrituras dentro de la lista blanca y ?v= al día.
   Prueba además el analizador (scripts/analizar-globales.js) con fragmentos pequeños y la convención window.Glacial.
   Uso: node tests/carga-scripts.test.js        (la parte de ?v= usa git: si no hay base, se omite) */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.resolve(__dirname, '..');
let fallas = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };
const { analizarFuente, limpiar } = require(path.join(R, 'scripts/analizar-globales.js'));
const { validar } = require(path.join(R, 'scripts/validar-carga.js'));

/* ===== analizador: fragmentos ===== */
const nombres = (src, tipo) => analizarFuente(src).defs.filter(d => !tipo || d.tipo === tipo).map(d => d.nombre).sort().join(',');
ok(nombres('function a(){}\nasync function b(){}\nconst c=1,d=2;\nlet e;\nvar f=function(){};') === 'a,b,c,d,e,f', 'detecta function/async function/const/let/var en el nivel superior (varios declaradores)');
ok(nombres('(function(){ function interna(){} const x=1; window.pub=function(){}; })();') === 'pub', 'lo declarado dentro de un IIFE no es global; window.pub sí');
ok(nombres('(function(root){ root.expuesta=1; })(typeof window!==\'undefined\'?window:globalThis);') === 'expuesta', 'el parámetro del IIFE que recibe window cuenta como window');
ok(nombres('const s="function falsa(){}"; // function otra(){}\n/* var x */ const re=/function z(){}/; const t=`a ${ "function w(){}" } b`;') === 're,s,t', 'ignora comentarios, textos, regex y plantillas');
ok(nombres('function a(){\n  const b=`x${ {c:1}.c }y`;\n  function interna(){}\n}\nfunction d(){}') === 'a,d', 'las llaves dentro de ${…} no desordenan la profundidad');
ok(analizarFuente('if(!window.X) window.X=1; window.Y=window.Y||{}; window.Z=2;').defs.filter(d => d.blando).map(d => d.nombre).sort().join(',') === 'X,Y', 'window.X condicionado y window.Y=window.Y||… son definiciones «blandas» (no sobrescriben)');
const loc = analizarFuente('function f(){ const a=1, pct=2; let [q,r]=[1,2]; return pct; }');
ok(loc.locales.has('pct') && loc.locales.has('q') && loc.defs.map(d => d.nombre).join() === 'f', 'todos los declaradores de una lista local cuentan como locales (no globales)');
const asig = analizarFuente('const _o = goInicio; goInicio = function(){ return _o(); };');
ok(asig.asigs.some(s => s.nombre === 'goInicio'), 'detecta la reasignación goInicio = function… de un global ajeno');
const din = analizarFuente("['saveA','saveB'].forEach(nombre=>{ const o=globalThis[nombre]; globalThis[nombre]=function(){ return o(); }; });");
ok(din.dinamicas.length === 1 && din.dinamicas[0].nombres.join() === 'saveA,saveB', 'resuelve window[nombre]= con la lista de textos recorrida con forEach');
ok(limpiar('a = b / c / d;').limpio.includes('b / c / d'), 'una división no se toma como regex');

/* ===== index.html real ===== */
const r = validar();
ok(r.analisis.archivos.length > 150 && r.analisis.archivos.every(f => f.existe), 'los ' + r.analisis.archivos.length + ' scripts locales de index.html existen en disco');
for (const e of r.errores) console.log('   ✘ ' + e.replace(/\n/g, '\n     '));
ok(r.errores.length === 0, 'carga de scripts sin errores (existencia, sobrescrituras en la lista blanca, formato y actualización de ?v=)');
for (const i of r.info) console.log('   · ' + i);
for (const a of r.avisos) console.log('   ⚠ ' + a);

/* La lista blanca es coherente: cada entrada con motivo, archivos que existen y en el mismo orden de index.html */
const orden = new Map(r.analisis.archivos.map(f => [f.ruta, f.orden]));
ok(r.lista.sobrescrituras.every(s => s.motivo && s.motivo.length > 20 && !/PENDIENTE/.test(s.motivo)), 'toda sobrescritura permitida trae su motivo');
ok(r.lista.sobrescrituras.every(s => s.archivos.length > 1 && s.archivos.every(f => orden.has(f)) && s.archivos.every((f, i) => !i || orden.get(f) >= orden.get(s.archivos[i - 1]))),
  'las cadenas de la lista blanca siguen el orden de carga de index.html');

/* ===== convención window.Glacial (espacios de nombres ligeros) ===== */
const sb = { console }; vm.createContext(sb); sb.window = sb;
vm.runInContext(fs.readFileSync(path.join(R, 'js/nucleo/00c-espacios-nombres.js'), 'utf8'), sb);
const G = sb.Glacial;
ok(G && typeof G.definirArea === 'function' && typeof G.exponer === 'function', 'window.Glacial expone definirArea y exponer');
G.exponer('Prueba', { sumar: (a, b) => a + b }, { alias: { sumarPrueba: 'sumar' } });
ok(G.Prueba.sumar(2, 3) === 5 && sb.sumarPrueba(2, 3) === 5 && sb.sumarPrueba === G.Prueba.sumar, 'exponer(): la función vive en window.Glacial.Area y el alias global apunta a la MISMA función');
sb.existente = function () { return 1; };
G.exponer('Prueba', { existente() { return 2; } }, { alias: ['existente'] });
ok(sb.existente() === 1 && G.conflictos().some(c => c.nombre === 'existente'), 'exponer() no pisa un global que ya existe: lo deja intacto y lo anota en conflictos()');
ok(G.Prueba.existente() === 2 && G.areas().includes('Prueba'), 'el área guarda su versión y areas() la lista');

/* Piloto: Glacial.Fecha es la MISMA API que GlacialFecha (js/nucleo/01b-fecha-operativa.js), que sigue existiendo */
const pil = { console, Date, Intl, Math, Number, String, Object, Array, JSON, RegExp, Promise, Map, Set, Error, setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams };
vm.createContext(pil); pil.window = pil; pil.document = { addEventListener() {}, body: { appendChild() {} } };
pil.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} }; pil.location = { hostname: 'x', search: '', protocol: 'https:' };
vm.runInContext(fs.readFileSync(path.join(R, 'js/nucleo/00c-espacios-nombres.js'), 'utf8'), pil);
vm.runInContext(fs.readFileSync(path.join(R, 'js/nucleo/01b-fecha-operativa.js'), 'utf8'), pil);
ok(pil.GlacialFecha && pil.Glacial.Fecha === pil.GlacialFecha, 'piloto: Glacial.Fecha y el global GlacialFecha son el mismo objeto');
ok(pil.Glacial.conflictos().length === 0, 'piloto: sin conflictos de alias');
const solo = { console, Date, Intl, Math, Number, String, Object, Array, JSON, RegExp, Promise, Map, Set, Error, setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams };
vm.createContext(solo); solo.window = solo; solo.document = pil.document; solo.sessionStorage = pil.sessionStorage; solo.location = pil.location;
vm.runInContext(fs.readFileSync(path.join(R, 'js/nucleo/01b-fecha-operativa.js'), 'utf8'), solo);
ok(solo.GlacialFecha && !solo.Glacial, 'piloto: 01b-fecha-operativa.js sigue funcionando solo (páginas de prueba sin 00c)');
const html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
ok(html.indexOf('00c-espacios-nombres.js') > 0 && html.indexOf('00c-espacios-nombres.js') < html.indexOf('01-config.js'), '00c-espacios-nombres.js carga antes de 01-config.js');

process.exit(fallas ? 1 : 0);
