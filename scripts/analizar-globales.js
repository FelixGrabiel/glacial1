/* GLACIAL · análisis estático de los scripts globales (26/11/2026)
   Lee index.html y js/**.js (sin ejecutarlos) y responde:
     · en qué orden se cargan los <script> y cuáles son locales,
     · qué nombres GLOBALES define cada archivo (function / var / let / const / class / window.X = …),
     · qué nombres se vuelven a definir o reasignar desde OTRO archivo (sobrescrituras: gana el último en cargar),
     · qué globales de otros archivos usa cada archivo (dependencias implícitas por orden de carga).
   Es heurístico (no hay parser de JS en el proyecto ni se quiere un empaquetador): quita comentarios, textos y
   expresiones regulares, mide la profundidad de llaves y busca los patrones de definición. Lo usan
   scripts/validar-carga.js (chequeo antes de cada push) y scripts/generar-contratos.js (docs/00-general/contratos-js.md).
   Solo lee archivos; no modifica nada. Sin dependencias. */
'use strict';
const fs = require('fs'), path = require('path');

const RAIZ = path.resolve(__dirname, '..');

/* ---------------- limpieza: quita comentarios, textos y regex conservando posiciones y saltos de línea ---------------- */
const PALABRAS_ANTES_DE_REGEX = new Set(['return','typeof','instanceof','in','of','new','delete','void','throw','case','do','else','yield','await']);
function limpiar(src) {
  const n = src.length, out = new Array(n), prof = new Uint16Array(n + 1);
  let i = 0, d = 0, ultimo = '', palabra = '';
  const tpl = [];                       // profundidades en las que se abrió un ${ dentro de una plantilla
  const poner = (k, c) => { out[k] = (c === '\n' || c === '\r') ? c : ' '; };
  const esId = c => /[A-Za-z0-9_$]/.test(c);
  function leerPlantilla() {            // i está justo después de ` (o de un } que cierra ${ ): consume hasta ` o ${
    while (i < n) {
      const c = src[i];
      if (c === '\\') { poner(i, c); prof[i] = d; i++; if (i < n) { poner(i, src[i]); prof[i] = d; i++; } continue; }
      if (c === '`') { out[i] = '`'; prof[i] = d; i++; ultimo = '`'; palabra = ''; return; }
      if (c === '$' && src[i + 1] === '{') { out[i] = ' '; out[i + 1] = '{'; prof[i] = d; prof[i + 1] = d; i += 2; tpl.push(d); d++; ultimo = '{'; palabra = ''; return; }
      poner(i, c); prof[i] = d; i++;
    }
  }
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') { poner(i, src[i]); prof[i] = d; i++; } continue; }
    if (c === '/' && c2 === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { poner(i, src[i]); prof[i] = d; i++; }
      if (i < n) { poner(i, '*'); poner(i + 1, '/'); prof[i] = prof[i + 1] = d; i += 2; }
      continue;
    }
    if (c === '"' || c === "'") {
      out[i] = c; prof[i] = d; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') { poner(i, src[i]); prof[i] = d; i++; }
        if (i < n) { poner(i, src[i]); prof[i] = d; i++; }
      }
      if (i < n) { out[i] = src[i] === '\n' ? '\n' : c; prof[i] = d; i++; }
      ultimo = c; palabra = ''; continue;
    }
    if (c === '`') { out[i] = '`'; prof[i] = d; i++; leerPlantilla(); continue; }
    if (c === '/') {
      const regexOk = ultimo === '' || '(,=:[!&|?{};+-*%<>~^'.includes(ultimo) || PALABRAS_ANTES_DE_REGEX.has(palabra);
      if (regexOk) {
        out[i] = '/'; prof[i] = d; i++;
        let clase = false;
        while (i < n && src[i] !== '\n') {
          const k = src[i];
          if (k === '\\') { poner(i, k); prof[i] = d; i++; if (i < n) { poner(i, src[i]); prof[i] = d; i++; } continue; }
          if (k === '[') clase = true; else if (k === ']') clase = false;
          else if (k === '/' && !clase) break;
          poner(i, k); prof[i] = d; i++;
        }
        if (i < n && src[i] === '/') { out[i] = '/'; prof[i] = d; i++; while (i < n && /[a-z]/.test(src[i])) { out[i] = ' '; prof[i] = d; i++; } }
        ultimo = ')'; palabra = ''; continue;     // tras una regex, un / es división
      }
    }
    if (c === '{' || c === '(' || c === '[') { out[i] = c; prof[i] = d; d++; i++; ultimo = c; palabra = ''; continue; }
    if (c === '}' || c === ')' || c === ']') {
      d = Math.max(0, d - 1); out[i] = c; prof[i] = d; i++;
      if (c === '}' && tpl.length && tpl[tpl.length - 1] === d) { tpl.pop(); leerPlantilla(); continue; }
      ultimo = c; palabra = ''; continue;
    }
    out[i] = c; prof[i] = d; i++;
    if (esId(c)) { palabra = (esId(src[i - 2] || ' ') ? palabra : '') + c; ultimo = 'a'; }
    else if (!/\s/.test(c)) { ultimo = c; palabra = ''; }
  }
  prof[n] = d;
  return { limpio: out.join(''), prof };
}

/* ---------------- index.html: orden de carga ---------------- */
function leerIndice(raiz = RAIZ, archivo = 'index.html') {
  const html = fs.readFileSync(path.join(raiz, archivo), 'utf8');
  const recursos = [];                                   // scripts y hojas de estilo, en orden de aparición
  const lineaDe = pos => html.slice(0, pos).split('\n').length;
  const re = /<(script|link)\b([^>]*)>/gi;
  let m, orden = 0;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase(), attrs = m[2];
    let url = null;
    if (tag === 'script') { const s = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i); url = s ? s[1] : null; if (!s) { recursos.push({ tag, inline: true, linea: lineaDe(m.index) }); continue; } }
    else { const h = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i); url = h ? h[1] : null; if (!/rel\s*=\s*["'](stylesheet)/i.test(attrs)) { if (!url || !/\.css(\?|$)/i.test(url)) continue; } }
    if (!url) continue;
    const externo = /^([a-z]+:)?\/\//i.test(url) || /^data:/i.test(url);
    const [ruta, query = ''] = url.split('#')[0].split('?');
    const v = (query.match(/(?:^|&)v=([^&]*)/) || [])[1] || null;
    recursos.push({ tag, url, ruta, v, externo, linea: lineaDe(m.index), orden: tag === 'script' ? ++orden : null });
  }
  return { html, recursos };
}

/* ---------------- análisis de un archivo ---------------- */
const ID = '[A-Za-z_$][\\w$]*';
/* Nombres que ya existen en el navegador o en Node: reasignarlos (window.Date = …, window.fetch = …) cambia el comportamiento de TODA la página */
const NATIVOS = new Set([...Object.getOwnPropertyNames(globalThis), 'alert', 'confirm', 'prompt', 'open', 'print', 'close', 'name', 'status', 'event', 'history', 'location',
  'document', 'navigator', 'screen', 'top', 'parent', 'frames', 'length', 'focus', 'blur', 'stop', 'find', 'scroll', 'scrollTo', 'closed', 'opener', 'origin', 'performance',
  'crypto', 'localStorage', 'sessionStorage', 'indexedDB', 'Image', 'Audio', 'Option', 'XMLHttpRequest', 'FileReader', 'URL', 'Blob', 'File', 'Notification']);
const esNativo = n => NATIVOS.has(n);
const INTERNOS = new Set(['undefined','NaN','Infinity','arguments','this','window','document','globalThis','self']);

function analizarFuente(src) {
  const { limpio, prof } = limpiar(src);
  const lineas = [0];
  for (let k = 0; k < src.length; k++) if (src.charCodeAt(k) === 10) lineas.push(k + 1);
  const linea = pos => { let a = 0, b = lineas.length - 1; while (a < b) { const mid = (a + b + 1) >> 1; if (lineas[mid] <= pos) a = mid; else b = mid - 1; } return a + 1; };
  const antes = pos => { let k = pos - 1; while (k >= 0 && /\s/.test(limpio[k])) k--; return k >= 0 ? limpio[k] : ''; };

  /* alias de window: (function(root){ … })(window|globalThis|typeof window…) y const w = window */
  const alias = new Set(['window', 'globalThis']);
  if (/\}\)\s*\(\s*(?:typeof\s+(?:window|globalThis)[^)]*\?\s*)?(?:window|globalThis|this)\b/.test(limpio) || /\}\)\s*\(\s*typeof/.test(limpio)) {
    for (const m of limpio.matchAll(/\(\s*(?:async\s+)?function\s*\w*\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:,[^)]*)?\)\s*\{/g)) if (prof[m.index] === 0 || prof[m.index] === 1) alias.add(m[1]);
  }
  for (const m of limpio.matchAll(new RegExp('\\b(?:const|let|var)\\s+(' + ID + ')\\s*=\\s*(?:window|globalThis)\\s*[;,\\n]', 'g'))) alias.add(m[1]);
  const aliasRe = [...alias].map(a => a.replace(/\$/g, '\\$')).join('|');

  const defs = [];                                       // definiciones globales de este archivo
  const agregar = (nombre, tipo, pos, extra) => defs.push(Object.assign({ nombre, tipo, linea: linea(pos) }, extra || {}));

  /* function / class a profundidad 0 */
  for (const m of limpio.matchAll(new RegExp('(?:^|[^\\w$.])((?:async\\s+)?function\\s*\\*?|class)\\s+(' + ID + ')', 'g'))) {
    const pos = m.index + m[0].length - m[2].length - (m[1].length - m[1].trimStart().length);
    const kw = m.index + m[0].indexOf(m[1].trim());
    if (prof[kw] !== 0) continue;
    const p = antes(kw);
    if (p && '=(,:?&|!+-*/%<>[.'.includes(p)) continue;
    agregar(m[2], m[1].startsWith('class') ? 'class' : 'function', kw);
  }
  /* var / let / const: a profundidad 0 son globales de este archivo; más adentro son locales (todos los declaradores de la lista) */
  const locales = new Set();
  for (const m of limpio.matchAll(/(?:^|[^\w$.])(var|let|const)\s+/g)) {
    const kw = m.index + m[0].indexOf(m[1]);
    const global = prof[kw] === 0;
    if (global) { const p = antes(kw); if (p && '=(,:?&|!+-*/%<>[.'.includes(p) && p !== ';') continue; }
    const anotar = (nombre, pos) => { if (global) agregar(nombre, m[1], pos); else locales.add(nombre); };
    let k = kw + m[1].length, nivel = 0, esperaNombre = true;
    while (k < limpio.length) {
      const c = limpio[k];
      if (esperaNombre) {
        if (/\s/.test(c)) { k++; continue; }
        if (c === '{' || c === '[') {                    // desestructuración: nombres simples dentro
          let n2 = 0, j = k; const ini = k;
          for (; j < limpio.length; j++) { if ('{['.includes(limpio[j])) n2++; else if ('}]'.includes(limpio[j])) { n2--; if (!n2) break; } }
          const cuerpo = limpio.slice(ini + 1, j);
          for (const q of cuerpo.matchAll(new RegExp('(?:^|[,{:\\s])(' + ID + ')\\s*(?=[,}\\]=]|$)', 'g'))) if (!INTERNOS.has(q[1])) anotar(q[1], ini);
          k = j + 1; esperaNombre = false; continue;
        }
        const t = limpio.slice(k).match(new RegExp('^(' + ID + ')'));
        if (!t) break;
        anotar(t[1], k); k += t[1].length; esperaNombre = false; continue;
      }
      if ('([{'.includes(c)) nivel++;
      else if (')]}'.includes(c)) { if (nivel === 0) break; nivel--; }
      else if (nivel === 0 && c === ';') break;
      else if (nivel === 0 && c === ',') { esperaNombre = true; k++; continue; }
      else if (nivel === 0 && c === '\n') {              // salto de línea: sigue solo si la línea termina en operador o coma
        const prev = antes(k);
        let j = k + 1; while (j < limpio.length && /\s/.test(limpio[j])) j++;
        const sig = limpio[j];
        if (!(prev && '=,+-*/%&|?:<>(!^~'.includes(prev)) && !(sig && '=,*/%&|?:.<>'.includes(sig))) break;
      }
      k++;
    }
  }
  /* window.X = …  /  alias.X = …  /  window['X'] = … */
  const reW = new RegExp('(?<![\\w$.])(?:' + aliasRe + ')\\s*\\.\\s*(' + ID + ')\\s*(\\|\\|=|\\?\\?=|=(?![=>]))', 'g');
  for (const m of limpio.matchAll(reW)) {
    const resto = limpio.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const lineaIni = limpio.lastIndexOf('\n', m.index) + 1, previo = limpio.slice(lineaIni, m.index);
    const nom = m[1].replace(/\$/g, '\\$');
    const guarda = new RegExp('(?:\\bif\\s*\\(\\s*!\\s*|typeof\\s+)(?:' + aliasRe + ')\\s*\\.\\s*' + nom + '(?![\\w$])').test(previo);   // if(!window.X) window.X = … / typeof window.X === 'undefined' && …
    const blando = m[2] !== '=' || guarda || new RegExp('^\\s*(?:' + aliasRe + ')\\s*\\.\\s*' + nom + '\\s*(\\|\\||\\?\\?)').test(resto);
    agregar(m[1], 'window', m.index, { blando });
  }
  for (const m of src.matchAll(new RegExp('(?<![\\w$.])(?:' + aliasRe + ')\\s*\\[\\s*([\'"])([\\w$]+)\\1\\s*\\]\\s*=(?![=>])', 'g'))) {
    if (limpio[m.index] === ' ') continue;               // estaba dentro de un comentario o texto
    agregar(m[2], 'window', m.index, { blando: false });
  }

  /* escrituras con nombre calculado (window[n] = …): no se pueden resolver estáticamente; se listan para revisarlas a mano */
  const dinamicas = [];
  const reArr = /\[\s*((?:(['"])[\w$]+\2\s*,?\s*)+)\]\s*\.\s*(?:forEach|map)\s*\(/g;
  const arrays = [];                                     // listas de nombres de texto que se recorren con forEach/map
  for (const m of src.matchAll(reArr)) if (limpio[m.index] === '[') arrays.push({ fin: m.index + m[0].length, nombres: [...m[1].matchAll(/['"]([\w$]+)['"]/g)].map(q => q[1]) });
  for (const m of limpio.matchAll(new RegExp('(?<![\\w$.])(?:' + aliasRe + ')\\s*\\[\\s*(' + ID + ')\\s*\\]\\s*=(?![=>])', 'g'))) {
    let lista = null;                                    // la lista más cercana, antes de la escritura, que no esté más de 3000 caracteres atrás
    for (const a of arrays) if (a.fin <= m.index && m.index - a.fin < 3000) lista = a;
    dinamicas.push({ variable: m[1], linea: linea(m.index), nombres: lista ? lista.nombres : null });
  }

  /* nombres declarados localmente en cualquier profundidad (para no confundir una variable local con un global) */
  for (const m of limpio.matchAll(new RegExp('\\b(?:function|class)\\s*\\*?\\s*(' + ID + ')', 'g'))) if (prof[m.index] > 0) locales.add(m[1]);
  for (const m of limpio.matchAll(/\bfunction\s*[\w$]*\s*\(([^)]*)\)|\(([^()]*)\)\s*=>|(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>|\bcatch\s*\(\s*([\w$]+)/g)) {
    const ps = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3] || m[4] || '';
    for (const q of ps.matchAll(new RegExp(ID, 'g'))) locales.add(q[0]);
  }
  for (const m of limpio.matchAll(/\bfor\s*\(\s*(?:var|let|const)\s*([{[][^}\]]*[}\]]|[\w$]+)/g)) for (const q of m[1].matchAll(new RegExp(ID, 'g'))) locales.add(q[0]);
  /* los nombres declarados a profundidad 0 de ESTE archivo no son «locales»: son sus globales */
  const propios = new Set(defs.filter(d => d.tipo !== 'window').map(d => d.nombre));

  /* asignaciones a un nombre sin declarar en el archivo: candidatos a reasignación de un global ajeno */
  const asigs = [];
  for (const m of limpio.matchAll(new RegExp('(?<![\\w$.\\]\\)])(' + ID + ')\\s*=(?![=>])', 'g'))) {
    const nombre = m[1];
    if (INTERNOS.has(nombre) || locales.has(nombre) && !propios.has(nombre)) continue;
    if (/^(var|let|const|function|class|return|typeof|case|new|delete|void|in|of|if|else|for|while|do|switch|try|catch|finally|throw|break|continue|default|import|export|async|await|yield|static|get|set)$/.test(nombre)) continue;
    const p = antes(m.index);
    if (p === '.' ) continue;
    asigs.push({ nombre, linea: linea(m.index), pos: m.index });
  }
  /* parches de método: OBJ.metodo = function… / () => … sobre un objeto declarado en otro archivo; X.prototype.m = … */
  const parches = [];
  const reP = new RegExp('(?<![\\w$.])(?:(?:' + aliasRe + ')\\s*\\.\\s*)?(' + ID + ')\\s*\\.\\s*(' + ID + ')\\s*=(?![=>])\\s*(function\\b|async\\b|\\([^()]*\\)\\s*=>|' + ID + '\\s*=>)?', 'g');
  for (const m of limpio.matchAll(reP)) parches.push({ obj: m[1], metodo: m[2], linea: linea(m.index), funcion: !!m[3] });
  const protos = [];
  for (const m of limpio.matchAll(new RegExp('(?<![\\w$.])([A-Z][\\w$]*)\\s*\\.\\s*prototype\\s*\\.\\s*(' + ID + ')\\s*=(?![=>])', 'g'))) protos.push({ clase: m[1], metodo: m[2], linea: linea(m.index) });

  /* identificadores usados (dependencias): todo identificador que no sea propiedad (.x), salvo window.x que sí cuenta */
  const usos = new Set();
  for (const m of limpio.matchAll(new RegExp('(?<![\\w$])(' + ID + ')', 'g'))) {
    const p = antes(m.index);
    if (p === '.') continue;
    usos.add(m[1]);
  }
  for (const m of limpio.matchAll(new RegExp('(?<![\\w$.])(?:' + aliasRe + ')\\s*\\.\\s*(' + ID + ')', 'g'))) usos.add(m[1]);

  return { defs, asigs, parches, protos, dinamicas, locales, propios, usos, lineas: lineas.length };
}

/* ---------------- proyecto completo ---------------- */
function analizarProyecto(raiz = RAIZ, opciones = {}) {
  const { recursos } = leerIndice(raiz, opciones.indice || 'index.html');
  const locales = recursos.filter(r => r.tag === 'script' && r.ruta && !r.externo);
  const archivos = [];
  for (const r of locales) {
    const abs = path.join(raiz, r.ruta);
    const existe = fs.existsSync(abs);
    const info = { ruta: r.ruta, orden: archivos.length + 1, v: r.v, linea: r.linea, existe };
    if (existe) { const src = fs.readFileSync(abs, 'utf8'); Object.assign(info, analizarFuente(src)); }
    else Object.assign(info, { defs: [], asigs: [], parches: [], protos: [], dinamicas: [], locales: new Set(), propios: new Set(), usos: new Set(), lineas: 0 });
    archivos.push(info);
  }
  /* mapa de definiciones duras por nombre (primer archivo + todos los que lo redefinen) */
  const porNombre = new Map();                           // nombre → [{ruta, orden, tipo, linea, blando}]
  for (const a of archivos) {
    const vistos = new Set();
    for (const d of a.defs) {
      const k = d.nombre + '|' + d.tipo;
      if (vistos.has(k)) continue; vistos.add(k);
      if (!porNombre.has(d.nombre)) porNombre.set(d.nombre, []);
      porNombre.get(d.nombre).push({ ruta: a.ruta, orden: a.orden, tipo: d.tipo, linea: d.linea, blando: !!d.blando, evento: 'define' });
    }
  }
  /* reasignaciones a un global definido en OTRO archivo (sin declaración local en el archivo que asigna) */
  for (const a of archivos) {
    const vistos = new Set();
    for (const s of a.asigs) {
      const defs = porNombre.get(s.nombre);
      if (!defs || a.propios.has(s.nombre) || a.locales.has(s.nombre)) continue;
      if (!defs.some(d => d.ruta !== a.ruta && d.evento === 'define')) continue;
      if (vistos.has(s.nombre)) continue; vistos.add(s.nombre);
      porNombre.get(s.nombre).push({ ruta: a.ruta, orden: a.orden, tipo: 'asignación', linea: s.linea, blando: false, evento: 'reasigna' });
    }
  }
  for (const a of archivos) {                            // escrituras window[n] = … con la lista de nombres resuelta
    const vistos = new Set();
    for (const dn of a.dinamicas) for (const nombre of dn.nombres || []) {
      const defs = porNombre.get(nombre);
      if (!defs || vistos.has(nombre) || !defs.some(d => d.ruta !== a.ruta && d.evento === 'define')) continue;
      vistos.add(nombre);
      defs.push({ ruta: a.ruta, orden: a.orden, tipo: 'envoltura', linea: dn.linea, blando: false, evento: 'reasigna' });
    }
  }
  for (const lista of porNombre.values()) lista.sort((x, y) => x.orden - y.orden || x.linea - y.linea);

  /* sobrescrituras: nombre con eventos «duros» en 2 o más archivos distintos */
  const sobrescrituras = [];
  for (const [nombre, lista] of porNombre) {
    const duras = lista.filter(e => !(e.blando && e.evento === 'define'));
    const rutas = [...new Set(duras.map(e => e.ruta))];
    if (rutas.length < 2) continue;
    sobrescrituras.push({ nombre, eventos: duras, archivos: rutas, blandas: lista.filter(e => e.blando) });
  }
  sobrescrituras.sort((x, y) => x.nombre.localeCompare(y.nombre));

  /* parches de método sobre objetos de otros archivos (solo cuando el valor es una función) */
  const parchesMetodo = [];
  for (const a of archivos) {
    const vistos = new Set();
    for (const p of a.parches) {
      if (!p.funcion) continue;
      const defs = porNombre.get(p.obj);
      if (!defs || a.propios.has(p.obj) || a.locales.has(p.obj)) continue;
      if (!defs.some(d => d.ruta !== a.ruta && d.evento === 'define')) continue;
      const k = p.obj + '.' + p.metodo; if (vistos.has(k)) continue; vistos.add(k);
      parchesMetodo.push({ clave: k, objeto: p.obj, metodo: p.metodo, ruta: a.ruta, orden: a.orden, linea: p.linea, definidoEn: defs.filter(d => d.evento === 'define').map(d => d.ruta) });
    }
  }
  const parchesPrototipo = [];
  for (const a of archivos) for (const p of a.protos) parchesPrototipo.push({ clave: p.clase + '.prototype.' + p.metodo, ruta: a.ruta, orden: a.orden, linea: p.linea });

  /* dependencias: por cada archivo, qué otros archivos definen nombres que él usa */
  const definidoPor = new Map();                         // nombre → primer archivo (y último) que lo define
  for (const [nombre, lista] of porNombre) definidoPor.set(nombre, lista.filter(e => e.evento === 'define' && !e.blando).map(e => e.ruta));
  for (const a of archivos) {
    const dep = new Map();                               // ruta → nombres
    for (const u of a.usos) {
      if (a.propios.has(u) || a.locales.has(u)) continue;
      const rutas = definidoPor.get(u);
      if (!rutas || !rutas.length || esNativo(u)) continue;
      for (const r of new Set(rutas)) { if (r === a.ruta) continue; if (!dep.has(r)) dep.set(r, []); dep.get(r).push(u); }
    }
    a.dependencias = dep;
  }
  return { recursos, archivos, porNombre, sobrescrituras, parchesMetodo, parchesPrototipo };
}

module.exports = { RAIZ, esNativo, limpiar, leerIndice, analizarFuente, analizarProyecto };

if (require.main === module) {
  const r = analizarProyecto();
  console.log(r.archivos.length + ' scripts locales · ' + r.porNombre.size + ' nombres globales · ' + r.sobrescrituras.length + ' sobrescrituras · ' +
    r.parchesMetodo.length + ' parches de método · ' + r.parchesPrototipo.length + ' parches de prototipo');
  if (process.argv.includes('--sobrescrituras')) for (const s of r.sobrescrituras) console.log(s.nombre + ' ← ' + s.eventos.map(e => path.basename(e.ruta) + ':' + e.linea + '(' + e.tipo + ')').join(' → '));
}
