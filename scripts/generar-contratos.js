/* GLACIAL · genera docs/00-general/contratos-js.md (26/11/2026)
   Contrato de cada script global: qué expone, de qué archivos anteriores (o posteriores) depende y qué sobrescribe.
   Sale del análisis de scripts/analizar-globales.js y de la lista blanca scripts/sobrescrituras-permitidas.json
   (el MOTIVO de cada sobrescritura se edita en el JSON, no en el .md).
   Uso: node scripts/generar-contratos.js              → reescribe el documento
        node scripts/generar-contratos.js --verificar  → sale con 1 si el documento no está al día (no escribe) */
'use strict';
const fs = require('fs'), path = require('path');
const { RAIZ, analizarProyecto } = require('./analizar-globales.js');

const SALIDA = 'docs/00-general/contratos-js.md';
const AREAS = { nucleo: 'Núcleo', accesos: 'Accesos', produccion: 'Producción', personal: 'Personal / Tareo', mantenimiento: 'Mantenimiento', rrhh: 'RRHH',
  asistente: 'Asistente', calidad: 'Calidad', almacen: 'Almacén', admin: 'Administración', hielo: 'Hielo', tv: 'Modo TV' };
const corto = r => r.replace(/^js\//, '');
const base = r => path.basename(r, '.js');
const celda = t => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function propositoDe(ruta) {
  const src = fs.readFileSync(path.join(RAIZ, ruta), 'utf8');
  const m = src.match(/^\s*\/\*([\s\S]*?)\*\//) || [];
  const lineas = (m[1] || '').split('\n').map(l => l.replace(/^[\s*=\-·]+/, '').trim()).filter(l => l && !/^[=\-_ ]+$/.test(l));
  let t = lineas[0] || '';
  if (/^(GLACIAL\s*·|ASISTENTE|HIELO)/i.test(t) && lineas[1] && t.length < 60) t = (t + ' — ' + lineas[1]);
  t = t.replace(/\s*\(\d{1,2}\/\d{1,2}\/\d{4}\)/g, '').replace(/\s*·?\s*docs\/\S+/g, '');
  return t.length > 150 ? t.slice(0, 147) + '…' : t;
}

function generar() {
  const a = analizarProyecto();
  const lista = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts/sobrescrituras-permitidas.json'), 'utf8'));
  const orden = new Map(a.archivos.map(f => [f.ruta, f.orden]));
  const L = [];
  const p = t => L.push(t === undefined ? '' : t);

  p('# GLACIAL · Contratos de los scripts globales');
  p();
  p('> **Documento generado** por `node scripts/generar-contratos.js` a partir de `index.html` y de `js/**`. No se edita a mano: ' +
    'el motivo de cada sobrescritura vive en `scripts/sobrescrituras-permitidas.json`. Vuelve a generarlo cuando añadas, muevas o ' +
    'renombres funciones globales (`node scripts/generar-contratos.js --verificar` dice si está al día).');
  p();
  p('La aplicación no usa módulos ES ni empaquetador: todo `<script>` comparte el ámbito global (`window`) y **el orden de carga de ' +
    '`index.html` es parte del código**. Este documento fija, por archivo, tres cosas: **qué expone**, **de qué otros archivos depende** y ' +
    '**qué funciones de otros archivos sobrescribe a propósito**. Complementa a `INDICE.md` (qué hace cada archivo) y a `docs/00-general/auditoria-js.md` (auditoría histórica).');
  p();
  p('## Cómo se valida (antes de cada push)');
  p();
  p('```');
  p('node tests/correr-todo.js           # incluye tests/carga-scripts.test.js (existencia, sobrescrituras y ?v=)');
  p('node scripts/validar-carga.js       # solo el chequeo de carga, con el detalle; compara contra origin/main');
  p('node scripts/validar-carga.js --base <commit>   # otra base de comparación para los ?v=');
  p('node scripts/validar-carga.js --sin-git         # sin la revisión de ?v= (existencia + sobrescrituras)');
  p('```');
  p();
  p('`scripts/validar-carga.js` falla (código 1) si:');
  p();
  p('1. Un `<script src>` / `<link href>` local de `index.html` no existe en disco, o un script se carga dos veces.');
  p('2. Un nombre global se redefine o se reasigna desde **otro archivo** y no está en la lista blanca `scripts/sobrescrituras-permitidas.json` ' +
    '(o su cadena de archivos cambió de orden). Un `let`/`const`/`class` repetido entre archivos es siempre error: el navegador no carga el segundo script.');
  p('3. Un archivo de `js/` o `css/` cambió respecto de la base de git y su `?v=` en `index.html` es el mismo (los celulares y tablets seguirían con la copia en caché). Formato: `?v=AAAAMMDD-xxx`.');
  p();
  p('### Cómo añadir una sobrescritura a propósito');
  p();
  p('1. Escribe la función nueva **guardando la anterior** (`const anterior = window.nombre; window.nombre = function(){ … anterior.apply(this, arguments); … }`) y cárgala DESPUÉS del archivo que la define.');
  p('2. Agrega la entrada a `scripts/sobrescrituras-permitidas.json`: `nombre`, `archivos` (en el orden de `index.html`) y un `motivo` real.');
  p('3. Sube el `?v=` de los archivos que tocaste, corre `node scripts/generar-contratos.js` y `node tests/correr-todo.js`.');
  p();
  p('## Resumen');
  p();
  const totalDef = a.porNombre.size;
  p('- **' + a.archivos.length + '** scripts locales en `index.html` (más los de CDN) · **' + totalDef + '** nombres globales · **' + a.sobrescrituras.length + '** sobrescrituras permitidas entre archivos.');
  p('- Los números de orden de abajo son la **posición real de carga** (no el prefijo numérico del nombre: `15-` puede cargar antes que `14-`).');
  const sinLista = a.archivos.filter(f => f.dinamicas.some(d => !d.nombres)).map(f => '`' + corto(f.ruta) + '`');
  if (sinLista.length) p('- Escrituras con nombre calculado que no se pueden resolver solas (revisar a mano si se tocan): ' + sinLista.join(', ') + '.');
  p();

  /* ---------- sobrescrituras ---------- */
  p('## Sobrescrituras intencionales');
  p();
  p('Gana siempre el **último** archivo de la cadena (el que carga después). «Asignación» = reasigna un global ya declarado; «envoltura» = lo reemplaza por una función que llama a la anterior.');
  p();
  const grupos = new Map();
  for (const s of lista.sobrescrituras) { if (!grupos.has(s.motivo)) grupos.set(s.motivo, []); grupos.get(s.motivo).push(s); }
  let n = 0;
  for (const [motivo, items] of [...grupos].sort((x, y) => y[1].length - x[1].length)) {
    n++;
    p('### ' + n + '. ' + (motivo.length > 90 ? motivo.slice(0, motivo.indexOf(':') > 10 && motivo.indexOf(':') < 90 ? motivo.indexOf(':') : 87) + (motivo.indexOf(':') > 10 && motivo.indexOf(':') < 90 ? '' : '…') : motivo) + ' (' + items.length + ')');
    p();
    p(motivo);
    p();
    p('| Nombre | Cadena de carga (primero define, el resto sobrescribe) |');
    p('|---|---|');
    for (const s of items) p('| `' + s.nombre + '` | ' + s.archivos.map(f => '`' + base(f) + '`').join(' → ') + ' |');
    p();
  }

  /* ---------- hallazgos ---------- */
  p('## Hallazgos de la revisión (26/11/2026)');
  p();
  const adelantadas = [];
  for (const s of a.sobrescrituras) {
    const defs = a.porNombre.get(s.nombre).filter(e => e.evento === 'define' && !e.blando);
    const rea = a.porNombre.get(s.nombre).filter(e => e.evento === 'reasigna');
    if (defs.length && rea.some(e => e.orden < defs[0].orden)) adelantadas.push({ nombre: s.nombre, primero: rea.filter(e => e.orden < defs[0].orden)[0], decl: defs[0] });
  }
  p('1. **Declaración duplicada real**: `actualizarEstadoTodosLosPermisos` y `cambiarTodosLosPermisos` están declaradas con `function` en `02-estado.js` y otra vez en `10-usuarios.js`. Gana `10-usuarios.js` (carga después); la de `02-estado.js` nunca se ejecuta. Pendiente unificar.');
  p('2. **Reasignación antes de la declaración**: ' + (adelantadas.length ? adelantadas.map(x => '`' + x.nombre + '` se reasigna en `' + base(x.primero.ruta) + '` (carga ' + x.primero.orden + ') pero se declara en `' + base(x.decl.ruta) + '` (carga ' + x.decl.orden + ')').join('; ') : 'ninguna') + '. Funciona porque la reasignación ocurre dentro de funciones que se llaman después de cargar todo; no la muevas a código que corra al cargar.');
  p('3. **Funciones que cuelgan de muchos módulos** (cadenas largas, cada módulo se engancha al anterior): ' +
    lista.sobrescrituras.filter(s => s.archivos.length >= 8).sort((x, y) => y.archivos.length - x.archivos.length).map(s => '`' + s.nombre + '` (' + s.archivos.length + ' archivos)').join(', ') +
    '. Son los puntos más frágiles ante un cambio de orden en `index.html`.');
  p('4. **Funciones con nombre genérico declaradas globalmente** (riesgo de colisión futura): ' +
    ['inp', 'sel', 'num', 'pct', 'val', 'esc', 'fmt', 'hoy'].filter(x => a.porNombre.has(x) && a.porNombre.get(x).some(e => e.evento === 'define' && e.tipo !== 'window')).map(x => '`' + x + '` (' + corto(a.porNombre.get(x).find(e => e.evento === 'define').ruta) + ')').join(', ') + '. Las demás copias son locales y no chocan; no las promuevas a global.');
  p('5. **Reemplazos de funciones del navegador** (afectan a toda la página, están en `nativos` de la lista blanca): ' + (lista.nativos || []).map(x => '`' + x.nombre + '` en `' + base(x.archivo) + '`').join(', ') + '. Cualquier otro `window.<nombre del navegador> = …` nuevo hace fallar `validar-carga.js`.');
  p('6. **`?v=` con formato fuera de patrón**: `18-mantenimiento.js` (`20261002-tareo-permisos-1`) y `39-vista-como.js` (`20261003-vista-1`) tienen sufijos con guiones; se aceptan. `19-rrhh.js` se carga **sin `?v=`** (está en la lista de excepciones): sus cambios no invalidan la caché del celular hasta que se le ponga uno.');
  p();

  /* ---------- convención de nombres ---------- */
  p('## Espacios de nombres (`window.Glacial.<Area>`)');
  p();
  p('`js/nucleo/00c-espacios-nombres.js` (carga antes de `01-config.js`) crea `window.Glacial` con:');
  p();
  p('| Función | Para qué |');
  p('|---|---|');
  p('| `Glacial.exponer(area, miembros, {alias})` | Cuelga `miembros` de `Glacial.<Area>` y, si se pide, deja el nombre global de siempre como **alias a la misma función** (`alias:true`, `alias:[\'a\',\'b\']` o `alias:{globalViejo:\'miembroNuevo\'}`). Si el nombre global ya existe y es otro valor, no lo pisa: lo anota en `Glacial.conflictos()`. |');
  p('| `Glacial.definirArea(nombre)` | Crea el área vacía (PascalCase). |');
  p('| `Glacial.areas()` / `Glacial.conflictos()` | Diagnóstico desde la consola. |');
  p();
  p('**Estado de la migración (piloto):** `Glacial.Fecha` = `window.GlacialFecha` (`js/nucleo/01b-fecha-operativa.js`, módulo puro). El global `GlacialFecha` sigue existiendo; cualquier llamada actual funciona igual.');
  p();
  p('**Plan incremental (sin romper compatibilidad):**');
  p();
  p('1. *Hecho*: base `Glacial` + piloto `Fecha`.');
  p('2. Módulos puros que ya cuelgan de un objeto global propio (`GlacialIndicadores`, `glacialHieloDatos`, `glacialAsistenteUI`…): añadir una línea `Glacial.exponer(...)` al final de cada archivo, sin tocar el resto.');
  p('3. Funciones sueltas de un área (p. ej. `tareo*`): reunirlas en `Glacial.Tareo` con `alias:true` y, cuando se usen solo desde el área, empezar a llamarlas por el espacio de nombres en el código **nuevo**.');
  p('4. Solo cuando ningún archivo use el alias global (se comprueba con `node scripts/analizar-globales.js`) se puede retirar el alias. Nada de esto exige cambiar el orden de carga.');
  p();

  /* ---------- por archivo ---------- */
  p('## Contrato por archivo (en orden de carga)');
  p();
  p('Leyenda: **Expone** = nombres globales que define el archivo (`ƒ` función, `v` variable/constante, `w` asignada a `window`; `_x` son privados por convención y solo se cuentan). ' +
    '**Depende de** = otros archivos que definen nombres que este usa, con el número de nombres entre paréntesis; **⚠ carga después** marca los que se cargan *después* de este (válido solo si se usan dentro de funciones llamadas tras el arranque). ' +
    '**Sobrescribe** = nombres de otros archivos que reasigna a propósito (ver lista de arriba). Es un análisis estático: una dependencia puede ser un falso positivo si un nombre coincide con una variable local.');
  p();
  const sobreDe = new Map();                              // ruta → [nombres que sobrescribe]
  for (const s of a.sobrescrituras) for (const e of s.eventos.slice(1)) { if (!sobreDe.has(e.ruta)) sobreDe.set(e.ruta, new Set()); sobreDe.get(e.ruta).add(s.nombre); }
  const porArea = new Map();
  for (const f of a.archivos) { const ar = f.ruta.split('/')[1]; if (!porArea.has(ar)) porArea.set(ar, []); porArea.get(ar).push(f); }
  for (const [ar, fs2] of [...porArea].sort((x, y) => x[1][0].orden - y[1][0].orden)) {
    p('### ' + (AREAS[ar] || ar) + ' · `js/' + ar + '/`');
    p();
    p('| # | Archivo (`?v=`) | Propósito | Expone | Depende de | Sobrescribe |');
    p('|---|---|---|---|---|---|');
    for (const f of fs2) {
      const dueno = new Map();
      for (const d of f.defs) { if (d.blando && d.tipo === 'window') { /* se cuenta igual */ } if (!dueno.has(d.nombre)) dueno.set(d.nombre, d.tipo); }
      const pub = [...dueno].filter(([nn]) => !nn.startsWith('_')), priv = dueno.size - pub.length;
      const marca = t => t === 'function' ? 'ƒ' : t === 'window' ? 'w' : t === 'class' ? 'c' : 'v';
      const ex = pub.slice(0, 7).map(([nn, t]) => '`' + nn + '`' + marca(t)).join(' ') + (pub.length > 7 ? ' … +' + (pub.length - 7) : '') + (priv ? ' · ' + priv + ' _priv' : '') || '—';
      const deps = [...f.dependencias].map(([r, ns]) => ({ r, ns, o: orden.get(r) })).sort((x, y) => x.o - y.o);
      const dtxt = deps.slice(0, 8).map(d => '`' + base(d.r) + '`(' + d.ns.length + ')' + (d.o > f.orden ? ' ⚠' : '')).join(', ') + (deps.length > 8 ? ' … +' + (deps.length - 8) : '');
      const so = sobreDe.has(f.ruta) ? [...sobreDe.get(f.ruta)].sort() : [];
      const stxt = so.slice(0, 6).map(x => '`' + x + '`').join(' ') + (so.length > 6 ? ' … +' + (so.length - 6) : '');
      p('| ' + f.orden + ' | `' + base(f.ruta) + '`' + (f.v ? ' <sub>' + f.v + '</sub>' : ' <sub>sin ?v=</sub>') + ' | ' + celda(propositoDe(f.ruta)) + ' | ' + celda(ex || '—') + ' | ' + celda(dtxt || '—') + ' | ' + celda(stxt || '—') + ' |');
    }
    p();
  }
  p('## Fuera de `index.html`');
  p();
  p('- `js/nucleo/00-logo.js`: logo en base64; **no se carga** (ver `INDICE.md`).');
  p('- Librerías de CDN (`@supabase/supabase-js`) y las que pide `window.glacialCargarExcel` / `window.glacialCargarGraficos` (SheetJS, ExcelJS, ApexCharts, ECharts, canvas-gauges) se cargan aparte y no pasan por esta revisión.');
  p();
  return L.join('\n');
}

module.exports = { generar, SALIDA };

if (require.main === module) {
  const texto = generar();
  const destino = path.join(RAIZ, SALIDA);
  if (process.argv.includes('--verificar')) {
    const actual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : '';
    if (actual !== texto) { console.log('✘ ' + SALIDA + ' no está al día. Ejecuta: node scripts/generar-contratos.js'); process.exit(1); }
    console.log('✔ ' + SALIDA + ' está al día.'); process.exit(0);
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, texto);
  console.log('✔ ' + SALIDA + ' (' + texto.split('\n').length + ' líneas)');
}
