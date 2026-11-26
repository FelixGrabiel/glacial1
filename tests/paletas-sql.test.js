/* Migración glacial_68 (integridad e idempotencia de paletas) contra un PostgreSQL local y desechable, con una copia mínima de public.fs_docs / public.fs_items.
   Ejecuta la migración DOS veces (debe poder repetirse) y luego supabase/pruebas/paletas_integridad.sql (que termina en ROLLBACK).
   Si en esta máquina no hay PostgreSQL (initdb/postgres/psql) la prueba se omite sin fallar: el SQL se prueba entonces a mano en PRUEBAS (ver docs/produccion/paletas-rapido.md).
   Uso: node tests/paletas-sql.test.js */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const R = path.resolve(__dirname, '..');
let fallas = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };

function buscar(nombre){
  const w = spawnSync('which', [nombre], { encoding: 'utf8' }); if (w.status === 0) return w.stdout.trim();
  for (const base of ['/usr/lib/postgresql', '/usr/pgsql', '/opt/homebrew/opt/postgresql@16/bin']) {
    try { for (const v of fs.readdirSync(base).sort().reverse()) { const p = path.join(base, v, 'bin', nombre); if (fs.existsSync(p)) return p; } } catch (_) { /* no existe */ }
    const directo = path.join(base, nombre); if (fs.existsSync(directo)) return directo;
  }
  return null;
}
const initdb = buscar('initdb'), pgctl = buscar('pg_ctl'), psql = buscar('psql');
if (!initdb || !pgctl || !psql) { console.log('✔ PostgreSQL no está instalado aquí: prueba SQL omitida (se prueba a mano en PRUEBAS)'); process.exit(0); }

const esRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glacial-pg-'));
const puerto = String(56000 + Math.floor(Math.random() * 3000));
const como = (cmd, args) => {                       // PostgreSQL no arranca como root: se usa el usuario «postgres» si existe
  if (esRoot) { fs.chownSync(dir, Number(spawnSync('id', ['-u', 'postgres'], { encoding: 'utf8' }).stdout) || 0, 0); return spawnSync('su', ['postgres', '-s', '/bin/sh', '-c', [cmd].concat(args).map(a => "'" + String(a).replace(/'/g, "'\\''") + "'").join(' ')], { encoding: 'utf8' }); }
  return spawnSync(cmd, args, { encoding: 'utf8' });
};
const q = (archivoOSql, extra) => spawnSync(psql, ['-h', dir, '-p', puerto, '-U', esRoot ? 'postgres' : os.userInfo().username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'].concat(extra || ['-f', archivoOSql]), { encoding: 'utf8' });
function limpiar(){ try { como(pgctl, ['-D', path.join(dir, 'data'), '-m', 'immediate', 'stop']); } catch (_) { /* ya parado */ } try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* queda en tmp */ } }

try {
  if (esRoot && spawnSync('id', ['postgres']).status !== 0) { console.log('✔ no hay usuario «postgres» para arrancar PostgreSQL como root: prueba SQL omitida'); process.exit(0); }
  let r = como(initdb, ['-D', path.join(dir, 'data'), '-A', 'trust', '-E', 'UTF8']);
  if (r.status !== 0) { console.log('✔ no se pudo crear un PostgreSQL de prueba (' + String(r.stderr).split('\n')[0] + '): prueba SQL omitida'); limpiar(); process.exit(0); }
  r = como(pgctl, ['-D', path.join(dir, 'data'), '-o', '-p ' + puerto + ' -k ' + dir + ' -c listen_addresses=', '-l', path.join(dir, 'log'), '-w', 'start']);
  if (r.status !== 0) { console.log('✔ no se pudo arrancar el PostgreSQL de prueba: prueba SQL omitida'); limpiar(); process.exit(0); }

  const mock = path.join(dir, 'mock.sql');
  fs.writeFileSync(mock, `create schema glacial_fs;
    create table public.fs_docs(coleccion text not null, id text not null, datos jsonb not null default '{}', primary key(coleccion,id));
    create table public.fs_items(coleccion text not null, doc text not null, campo text not null, id text not null, pos double precision not null default 0,
      datos jsonb not null, eliminado_en timestamptz, actualizado_en timestamptz not null default now(), raiz text, v bigint not null default 0,
      primary key(coleccion,doc,campo,id), foreign key(coleccion,doc) references public.fs_docs(coleccion,id));
    insert into public.fs_docs(coleccion,id) values ('sync','paletas'),('sync','programaciones');
    do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;`);
  const mig = path.join(R, 'supabase/migraciones/glacial_68_paletas_integridad.sql'), prueba = path.join(R, 'supabase/pruebas/paletas_integridad.sql');
  r = q(mock); ok(r.status === 0, 'esquema mínimo de fs_docs / fs_items creado' + (r.status ? ': ' + r.stderr : ''));
  r = q(mig); ok(r.status === 0, 'glacial_68 se aplica sin errores' + (r.status ? ': ' + r.stderr : ''));
  r = q(mig); ok(r.status === 0, 'glacial_68 se puede ejecutar por segunda vez (idempotente)' + (r.status ? ': ' + r.stderr : ''));
  r = q(prueba);
  const salida = String(r.stderr) + String(r.stdout);
  ok(r.status === 0 && /OK glacial_68: \d+ comprobaciones/.test(salida), 'supabase/pruebas/paletas_integridad.sql: ' + ((salida.match(/OK glacial_68: \d+ comprobaciones/) || [salida.split('\n').find(l => /ERROR|FALLA/.test(l)) || 'sin resultado'])[0]));
  r = q(null, ['-c', "select count(*) from pg_trigger where tgname like 'fs\\_paletas\\_%' and not tgisinternal"]);
  ok(/4/.test(r.stdout), 'quedan instalados los 4 triggers de paletas');
} finally { limpiar(); }
process.exit(fallas ? 1 : 0);
