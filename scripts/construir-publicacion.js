/* GLACIAL · construir la versión publicada (12/11/2026)
   Copia la página a una carpeta de salida y comprime CADA archivo JS por separado (sin unirlos):
     · se quitan comentarios y espacios y se acortan solo los nombres INTERNOS de cada función;
     · los nombres globales (funciones, variables y clases de primer nivel que comparten los archivos) NO se tocan
       (toplevel: false), ni los nombres de funciones y clases (keep_fnames / keep_classnames);
     · no se unen archivos: el orden de carga, las redefiniciones entre archivos y el aislamiento de errores quedan igual.
   Si un archivo no se puede comprimir, se publica tal cual (y se avisa). El código fuente del repositorio no cambia.
   Uso: node scripts/construir-publicacion.js [carpeta de salida, por defecto _sitio]
   Lo usa .github/workflows/publicar.yml (GitHub Pages). Requiere el paquete «terser» (npm i terser). */
'use strict';
const fs = require('fs'), path = require('path');
const { minify } = require('terser');
const R = path.resolve(__dirname, '..');
const SALIDA = path.resolve(R, process.argv[2] || '_sitio');
const COPIAR = ['index.html', 'js', 'css', 'assets'];

function copiar(origen, destino){
  const st = fs.statSync(origen);
  if (st.isDirectory()) { fs.mkdirSync(destino, { recursive: true }); fs.readdirSync(origen).forEach(n => copiar(path.join(origen, n), path.join(destino, n))); }
  else fs.copyFileSync(origen, destino);
}
function archivos(dir, ext){
  const out = [];
  (function rec(d){ fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else if (p.endsWith(ext)) out.push(p); }); })(dir);
  return out.sort();
}
const OPCIONES = {
  ecma: 2020,
  compress: { passes: 1, toplevel: false, keep_fargs: true, keep_fnames: true, keep_classnames: true, drop_console: false, unsafe: false },
  mangle: { toplevel: false, keep_fnames: true, keep_classnames: true },
  format: { comments: false, ascii_only: false },
  toplevel: false, keep_fnames: true, keep_classnames: true, module: false
};

(async () => {
  fs.rmSync(SALIDA, { recursive: true, force: true });
  fs.mkdirSync(SALIDA, { recursive: true });
  COPIAR.forEach(n => copiar(path.join(R, n), path.join(SALIDA, n)));
  fs.writeFileSync(path.join(SALIDA, '.nojekyll'), '');
  let antes = 0, despues = 0; const fallidos = [];
  for (const f of archivos(path.join(SALIDA, 'js'), '.js')) {
    const codigo = fs.readFileSync(f, 'utf8'); antes += Buffer.byteLength(codigo);
    try {
      const r = await minify(codigo, OPCIONES);
      if (!r || typeof r.code !== 'string') throw new Error('sin resultado');
      fs.writeFileSync(f, r.code); despues += Buffer.byteLength(r.code);
    } catch (e) { fallidos.push(path.relative(SALIDA, f) + ': ' + (e && e.message || e)); despues += Buffer.byteLength(codigo); }
  }
  const mb = n => (n / 1048576).toFixed(2) + ' MB';
  console.log('JS: ' + mb(antes) + ' → ' + mb(despues) + ' (' + Math.round(100 - despues / antes * 100) + ' % menos)');
  if (fallidos.length) { console.log('Publicados sin comprimir (' + fallidos.length + '):\n  ' + fallidos.join('\n  ')); }
  console.log('Listo: ' + path.relative(R, SALIDA) + '/');
})().catch(e => { console.error('ERROR', e); process.exit(1); });
