/* GLACIAL · RESPALDO de la base de Supabase a archivos en TU computadora (solo lee; no cambia nada en Supabase).
   Pensado para el plan gratis, que no trae copias de seguridad automáticas.

   QUÉ GUARDA (carpeta respaldo_AAAA-MM-DD_HHMM/):
     · fs_docs.jsonl           todos los documentos (public.fs_docs)           — una línea JSON por fila
     · fs_items.jsonl          todos los elementos de las listas (public.fs_items)
     · evidencias_entrada.jsonl  bandeja de evidencias del bot, si existe la tabla
     · storage_objetos.jsonl   LISTA de las fotos guardadas (nombre, tamaño, fecha): las fotos mismas NO se descargan aquí
     · MANIFIESTO.json         cuántas filas hay de cada tabla, huella SHA-256 de cada archivo y la hora de la copia
   Incluye las filas «borradas» (eliminado_en con fecha): así una restauración no pierde historia.

   NO guarda: contraseñas ni cuentas de acceso (esquema auth), ni las fotos (se bajan aparte desde el panel: Storage › glacial-fotos).

   USO (PowerShell, en cualquier carpeta; necesita Node.js, que ya tienes por el bot):
     1. npm init -y            (solo la primera vez, en una carpeta nueva)
        npm install pg         (solo la primera vez)
     2. En Supabase: botón «Connect» (arriba) › «Session pooler» › copia la cadena y cambia [YOUR-PASSWORD] por la clave de la base.
        (Si no la recuerdas: Project Settings › Database › Reset database password.)
     3. $env:DATABASE_URL = "postgresql://postgres.ehtbwmvwoxcdefvlxttu:TU_CLAVE@aws-0-us-east-2.pooler.supabase.com:5432/postgres"
        node respaldo-supabase.js
     La clave NO se escribe en este archivo ni se guarda: solo vive en esa ventana de PowerShell.
     Guarda la carpeta resultante en un lugar aparte (otro disco o la nube) y NO la subas a GitHub: contiene datos de la planta.

   Toma cada tabla por tandas (cursor) con un tiempo máximo largo; se puede repetir cuando se quiera. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
let Client; try { ({ Client } = require('pg')); } catch (_) { console.error('Falta el paquete «pg». Ejecuta primero:  npm install pg'); process.exit(1); }

const url = process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL (la cadena de conexión «Session pooler» de Supabase). Mira las instrucciones al inicio de este archivo.'); process.exit(1); }

const ahora = new Date(), p2 = n => String(n).padStart(2, '0');
const carpeta = path.resolve('respaldo_' + ahora.getFullYear() + '-' + p2(ahora.getMonth() + 1) + '-' + p2(ahora.getDate()) + '_' + p2(ahora.getHours()) + p2(ahora.getMinutes()));
fs.mkdirSync(carpeta, { recursive: true });

const TABLAS = [
  { archivo: 'fs_docs.jsonl', sql: 'select * from public.fs_docs order by coleccion, id', clave: 'public.fs_docs' },
  { archivo: 'fs_items.jsonl', sql: 'select * from public.fs_items order by coleccion, doc, campo, id', clave: 'public.fs_items' },
  { archivo: 'evidencias_entrada.jsonl', sql: 'select * from public.evidencias_entrada order by 1', clave: 'public.evidencias_entrada', opcional: true },
  { archivo: 'storage_objetos.jsonl', sql: "select bucket_id, name, created_at, updated_at, metadata->>'size' as bytes from storage.objects order by bucket_id, name", clave: 'storage.objects (lista)', opcional: true }
];

const huella = archivo => new Promise((ok, mal) => {
  const h = crypto.createHash('sha256'); fs.createReadStream(archivo).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', mal);
});

async function exportar(cliente, t) {
  const destino = path.join(carpeta, t.archivo), salida = fs.createWriteStream(destino);
  let filas = 0;
  await cliente.query('begin read only');
  try {
    await cliente.query('declare cur no scroll cursor for ' + t.sql);
    for (;;) {
      const r = await cliente.query('fetch 500 from cur');
      if (!r.rows.length) break;
      for (const fila of r.rows) { if (!salida.write(JSON.stringify(fila) + '\n')) await new Promise(ok => salida.once('drain', ok)); filas++; }
      process.stdout.write('\r  ' + t.clave + ': ' + filas + ' filas');
    }
    await cliente.query('close cur');
  } finally { await cliente.query('rollback').catch(() => {}); }
  await new Promise(ok => salida.end(ok));
  process.stdout.write('\r  ' + t.clave + ': ' + filas + ' filas  ✔\n');
  return { archivo: t.archivo, filas, bytes: fs.statSync(destino).size, sha256: await huella(destino) };
}

(async () => {
  const cliente = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 0, query_timeout: 0, connectionTimeoutMillis: 60000 });
  await cliente.connect();
  await cliente.query("set statement_timeout = '0'");
  console.log('Respaldo en: ' + carpeta);
  const manifiesto = { creadoEn: ahora.toISOString(), proyecto: 'GLACIAL producción (ehtbwmvwoxcdefvlxttu)', tablas: [], omitidas: [] };
  for (const t of TABLAS) {
    try { manifiesto.tablas.push(await exportar(cliente, t)); }
    catch (e) {
      if (t.opcional) { fs.rmSync(path.join(carpeta, t.archivo), { force: true }); manifiesto.omitidas.push({ tabla: t.clave, motivo: e.message }); console.log('\n  ' + t.clave + ': omitida (' + e.message + ')'); }
      else { console.error('\nNo se pudo respaldar ' + t.clave + ': ' + e.message); await cliente.end().catch(() => {}); process.exit(2); }
    }
  }
  await cliente.end();
  fs.writeFileSync(path.join(carpeta, 'MANIFIESTO.json'), JSON.stringify(manifiesto, null, 2));
  const total = manifiesto.tablas.reduce((s, t) => s + t.filas, 0);
  console.log('\nListo: ' + total + ' filas en ' + manifiesto.tablas.length + ' archivos. Guarda la carpeta en otro lugar y no la subas a GitHub.');
})().catch(e => { console.error('\nError: ' + e.message); process.exit(1); });
