/* GLACIAL · validación de la carga de scripts (26/11/2026)
   Revisa, sin ejecutar la app:
     1. Que todo <script src> / <link href> local de index.html exista en disco y no se cargue dos veces.
     2. Que no haya redefiniciones ni reasignaciones de funciones/variables globales entre archivos fuera de la lista blanca
        scripts/sobrescrituras-permitidas.json (nombre + archivos EN ORDEN + motivo). Un let/const/class repetido entre
        archivos es siempre un error (el navegador lo rechaza con SyntaxError y deja de cargar el segundo script).
     3. Que cada archivo de js/ o css/ modificado respecto de una base de git tenga otro ?v= en index.html (si no, celulares y
        tablets seguirían con la copia vieja en caché). Los ?v= deben tener la forma AAAAMMDD-xxx.
   Uso:  node scripts/validar-carga.js                  → compara contra origin/main (o el commit anterior)
         node scripts/validar-carga.js --base <ref>     → compara contra otra referencia de git (commit, rama, etiqueta)
         node scripts/validar-carga.js --sin-git        → solo los puntos 1 y 2
         node scripts/validar-carga.js --lista          → imprime las sobrescrituras detectadas con el formato de la lista blanca
   Variable GLACIAL_BASE equivale a --base. Sale con código 1 si hay errores. Antes de cada push: node tests/correr-todo.js */
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { RAIZ, analizarProyecto, esNativo } = require('./analizar-globales.js');

const FORMATO_V = /^\d{8}-[A-Za-z0-9-]+$/;
const LISTA = 'scripts/sobrescrituras-permitidas.json';

function git(args, raiz) {
  const r = spawnSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/* Base de comparación: --base / GLACIAL_BASE; si no, el ancestro común con origin/main (o main); si ese ya es HEAD, el commit anterior. */
function resolverBase(raiz, pedida) {
  if (pedida && !/^0+$/.test(pedida)) return git(['rev-parse', '--verify', pedida + '^{commit}'], raiz) ? pedida : null;
  const head = (git(['rev-parse', 'HEAD'], raiz) || '').trim();
  if (!head) return null;
  for (const ref of ['origin/main', 'main']) {
    const mb = (git(['merge-base', 'HEAD', ref], raiz) || '').trim();
    if (mb && mb !== head) return mb;
  }
  return git(['rev-parse', '--verify', 'HEAD~1^{commit}'], raiz) ? 'HEAD~1' : null;
}

/* ?v= por archivo según un index.html (texto) */
function versiones(html) {
  const mapa = new Map();
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)) {
    const [ruta, q = ''] = m[1].split('?');
    if (/^([a-z]+:)?\/\//i.test(ruta)) continue;
    mapa.set(ruta, (q.match(/(?:^|&)v=([^&]*)/) || [])[1] || null);
  }
  return mapa;
}

function validar(opciones = {}) {
  const raiz = opciones.raiz || RAIZ;
  const errores = [], avisos = [], info = [];
  const a = analizarProyecto(raiz);
  const lista = JSON.parse(fs.readFileSync(path.join(raiz, LISTA), 'utf8'));

  /* 1 · existencia y repetidos */
  const vistos = new Map();
  for (const r of a.recursos) {
    if (!r.url || r.externo) continue;
    if (!fs.existsSync(path.join(raiz, r.ruta))) errores.push(`No existe «${r.ruta}» (index.html:${r.linea}).`);
    if (r.tag === 'script') {
      if (vistos.has(r.ruta)) errores.push(`«${r.ruta}» se carga dos veces (index.html:${vistos.get(r.ruta)} y :${r.linea}).`);
      vistos.set(r.ruta, r.linea);
    }
  }

  /* 2 · colisiones y sobrescrituras */
  const permitidas = new Map(lista.sobrescrituras.map(s => [s.nombre, s]));
  const detectadas = new Map(a.sobrescrituras.map(s => [s.nombre, s]));
  for (const [nombre, lista2] of a.porNombre) {                // let / const / class repetidos entre archivos: SyntaxError seguro
    const lex = lista2.filter(e => e.evento === 'define' && ['let', 'const', 'class'].includes(e.tipo));
    const otros = lista2.filter(e => e.evento === 'define' && e.tipo !== 'window');
    if (lex.length && new Set(otros.map(e => e.ruta)).size > 1)
      errores.push(`«${nombre}» se declara con let/const/class en un archivo y otra vez en otro (${[...new Set(otros.map(e => e.ruta + ':' + e.linea))].join(', ')}): el segundo script falla con SyntaxError.`);
  }
  for (const [nombre, s] of detectadas) {
    const p = permitidas.get(nombre);
    const orden = s.archivos.join(' → ');
    if (!p) { errores.push(`Sobrescritura no permitida de «${nombre}»: ${s.eventos.map(e => `${e.ruta}:${e.linea} (${e.tipo})`).join(' → ')}.\n    Si es a propósito, agrégala a ${LISTA} con su motivo y documéntala en docs/00-general/contratos-js.md; si no, cambia el nombre.`); continue; }
    if (p.archivos.join(' → ') !== orden) errores.push(`«${nombre}»: cambió la cadena de archivos que lo sobrescriben.\n    Permitida: ${p.archivos.join(' → ')}\n    Ahora:     ${orden}\n    Actualiza ${LISTA} (con motivo) si el cambio es intencional.`);
  }
  for (const nombre of permitidas.keys()) if (!detectadas.has(nombre)) avisos.push(`La lista blanca trae «${nombre}» pero ya no hay sobrescritura: quítala de ${LISTA}.`);
  const nativosOk = new Set((lista.nativos || []).map(x => x.nombre + '@' + x.archivo));
  for (const [nombre, eventos] of a.porNombre) {                // window.Date = …, window.fetch = …: cambian el navegador entero
    if (!esNativo(nombre)) continue;
    for (const e of eventos) if (e.evento === 'define' && e.tipo === 'window' && !e.blando && !nativosOk.has(nombre + '@' + e.ruta))
      errores.push(`«${e.ruta}:${e.linea}» reemplaza «${nombre}», que ya existe en el navegador (afecta a TODA la página). Si es a propósito, agrégalo a «nativos» en ${LISTA} con su motivo.`);
  }
  const dinOk = new Set(lista.dinamicasSinLista.map(d => d.archivo));
  for (const f of a.archivos) {
    if (f.dinamicas.some(d => !d.nombres) && !dinOk.has(f.ruta))
      errores.push(`«${f.ruta}» escribe un global con nombre calculado (window[x] = …) sin una lista literal de nombres: no se puede revisar. Agrégalo a «dinamicasSinLista» en ${LISTA} o escribe los nombres como lista de textos.`);
    const dup = new Map();
    for (const d of f.defs) if (d.tipo !== 'window') dup.set(d.nombre, (dup.get(d.nombre) || 0) + 1);
    for (const [n, c] of dup) if (c > 1) avisos.push(`«${n}» se declara ${c} veces dentro de «${f.ruta}» (gana la última).`);
  }

  /* 3 · ?v= */
  const sinV = new Set(lista.sinVersion.map(x => x.archivo));
  for (const r of a.recursos) {
    if (!r.url || r.externo || !/^(js|css)\//.test(r.ruta)) continue;
    if (!r.v) { if (!sinV.has(r.ruta)) errores.push(`«${r.ruta}» no tiene ?v= en index.html:${r.linea} (formato AAAAMMDD-xxx).`); continue; }
    if (!FORMATO_V.test(r.v)) errores.push(`«${r.ruta}» tiene un ?v= con formato raro («${r.v}») en index.html:${r.linea}; usa AAAAMMDD-xxx.`);
  }
  let base = null;
  if (opciones.git !== false) {
    const dentro = git(['rev-parse', '--is-inside-work-tree'], raiz);
    base = dentro ? resolverBase(raiz, opciones.base || process.env.GLACIAL_BASE) : null;
    if (!base) info.push('No pude resolver una base de git: se omite la revisión de ?v= de archivos modificados (usa --base <ref>).');
    else {
      const htmlBase = git(['show', base + ':index.html'], raiz);
      const cambiados = new Set((git(['diff', '--name-only', '--diff-filter=AMR', base, '--', 'js', 'css'], raiz) || '').split('\n').filter(Boolean));
      for (const f of (git(['ls-files', '--others', '--exclude-standard', '--', 'js', 'css'], raiz) || '').split('\n').filter(Boolean)) cambiados.add(f);
      const antes = htmlBase ? versiones(htmlBase) : new Map(), ahora = versiones(a.html || fs.readFileSync(path.join(raiz, 'index.html'), 'utf8'));
      let revisados = 0;
      for (const f of [...cambiados].sort()) {
        if (!ahora.has(f)) { info.push(`«${f}» cambió pero index.html no lo carga (¿se usa de otra forma?).`); continue; }
        revisados++;
        if (!antes.has(f)) continue;                                      // archivo nuevo en index.html: basta con que tenga ?v=
        if (antes.get(f) === ahora.get(f)) errores.push(`«${f}» cambió respecto de ${base} pero su ?v= sigue igual (${ahora.get(f) || 'sin ?v='}). Súbelo en index.html (AAAAMMDD-xxx).`);
        else if (antes.get(f) && ahora.get(f) && ahora.get(f) < antes.get(f)) avisos.push(`«${f}»: el ?v= bajó (${antes.get(f)} → ${ahora.get(f)}).`);
      }
      info.push(`?v= revisados: ${revisados} archivo(s) de js/ y css/ modificados respecto de ${base}.`);
    }
  }
  return { errores, avisos, info, analisis: a, lista, base };
}

module.exports = { validar, resolverBase, versiones };

if (require.main === module) {
  const arg = process.argv.slice(2);
  if (arg.includes('--lista')) {
    const a = analizarProyecto();
    console.log(JSON.stringify(a.sobrescrituras.map(s => ({ nombre: s.nombre, archivos: s.archivos })), null, 1));
    process.exit(0);
  }
  const i = arg.indexOf('--base');
  const r = validar({ git: !arg.includes('--sin-git'), base: i >= 0 ? arg[i + 1] : undefined });
  const n = r.analisis;
  console.log(`GLACIAL · carga de scripts: ${n.archivos.length} scripts locales, ${n.porNombre.size} nombres globales, ${n.sobrescrituras.length} sobrescrituras (todas en la lista blanca: ${r.errores.some(e => e.startsWith('Sobrescritura no permitida')) ? 'NO' : 'sí'}).`);
  for (const t of r.info) console.log('· ' + t);
  for (const t of r.avisos) console.log('⚠ ' + t);
  for (const t of r.errores) console.log('✘ ' + t);
  console.log(r.errores.length ? `\n✘ ${r.errores.length} error(es). No hagas push hasta corregirlos.` : '\n✔ Carga de scripts correcta.');
  process.exit(r.errores.length ? 1 : 0);
}
