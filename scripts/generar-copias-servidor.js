#!/usr/bin/env node
/* GLACIAL · copias para el servidor de los módulos puros del navegador (24/11/2026)
   La función de servidor avisos-push (notificaciones de paradas) usa EXACTAMENTE las mismas reglas que la página:
     · js/produccion/24b-pausas-sin-cerrar.js → glacialPausas.analizar (qué parada está abierta y cuándo pasa su límite)
     · js/nucleo/45-indicadores.js            → GlacialIndicadores.bloqueVigente (franja «Planta sin producción»)
   Supabase solo despliega los archivos de la carpeta de la función, así que aquí se copian envueltos como módulo:
     export function cargar(){ const window=undefined; <archivo original sin tocar>; return globalThis.<API>; }
   Uso:  node scripts/generar-copias-servidor.js          → reescribe las copias
         node scripts/generar-copias-servidor.js --check  → solo comprueba (lo usa tests/notificaciones-push.test.js)
   Si cambias 24b o 45, vuelve a correrlo y vuelve a desplegar avisos-push. */
'use strict';
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..');
const COPIAS = [
  { origen: 'js/produccion/24b-pausas-sin-cerrar.js', destino: 'supabase/functions/avisos-push/pausas.js', api: 'glacialPausas' },
  { origen: 'js/nucleo/45-indicadores.js', destino: 'supabase/functions/avisos-push/indicadores.js', api: 'GlacialIndicadores' }
];
function generar(c) {
  const src = fs.readFileSync(path.join(R, c.origen), 'utf8');
  return '/* COPIA GENERADA de ' + c.origen + ' por scripts/generar-copias-servidor.js. NO EDITAR A MANO: edita el original y vuelve a generar. */\n' +
    'export function cargar() {\n  const window = undefined; // eslint-disable-line no-unused-vars\n' + src + '\n  return globalThis.' + c.api + ';\n}\n';
}
function revisar() { return COPIAS.filter(c => { const p = path.join(R, c.destino); return !fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== generar(c); }).map(c => c.destino); }
module.exports = { COPIAS, generar, revisar };
if (require.main === module) {
  if (process.argv.includes('--check')) {
    const malas = revisar();
    if (malas.length) { console.error('Copias desactualizadas: ' + malas.join(', ') + '\nCorre: node scripts/generar-copias-servidor.js'); process.exit(1); }
    console.log('Copias al día.');
  } else {
    COPIAS.forEach(c => { fs.writeFileSync(path.join(R, c.destino), generar(c)); console.log('Escrito ' + c.destino); });
  }
}
