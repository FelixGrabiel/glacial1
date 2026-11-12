/* GLACIAL · Guía del supervisor: arma el guion de voz (guion-voz.md) a partir de escenas.js (12/11/2026).
   Uso: node scripts/guia-supervisor/armar-guion.js [salida] */
'use strict';
const fs = require('fs'), path = require('path');
const { SECCIONES } = require('./escenas.js');
const SALIDA = path.resolve(process.argv[2] || 'guia-supervisor-salida');
const dos = n => String(n).padStart(2, '0');
const L = [];
L.push('# Guion de voz · Guía del supervisor de producción GLACIAL', '');
L.push('## Instrucciones para la IA de voz', '');
L.push('Genera la narración de estos ' + SECCIONES.length + ' videos cortos con estas condiciones:', '');
L.push('- **Idioma y acento:** español de Latinoamérica, neutro. Si la herramienta lo permite, con acento peruano.');
L.push('- **Voz:** una sola voz para todos los videos, adulta, cálida y clara. Que suene como una compañera de trabajo que explica, no como un anuncio.');
L.push('- **Velocidad:** un poco más lenta de lo normal (0,95). Haz una pausa breve después de cada punto.');
L.push('- **Texto:** lee cada línea tal como está escrita. No agregues saludos, música, efectos ni frases nuevas.');
L.push('- **Pronunciación:**');
L.push('  - «GLACIAL» como la palabra glacial.');
L.push('  - «PET 1» como «pet uno» y «PET 2» como «pet dos».');
L.push('  - «B7L» como «be siete ele» y «C20L» como «ce veinte ele».');
L.push('- **Entrega:** un archivo de audio **por cada línea**, en MP3 (o WAV), nombrado exactamente con el código que aparece entre corchetes, por ejemplo `01-01.mp3`, `01-02.mp3`… Sin silencios largos al inicio ni al final.');
L.push('- Si la herramienta solo permite un audio por video, nómbralo `01.mp3`, `02.mp3`… y deja **un segundo de silencio** entre línea y línea.', '');
L.push('---', '');
let total = 0;
for (const s of SECCIONES) {
  L.push('## Video ' + dos(s.n) + ' · ' + s.titulo, '');
  s.escenas.forEach((e, i) => { L.push('[' + dos(s.n) + '-' + dos(i + 1) + '] ' + e.texto, ''); total += e.texto.split(/\s+/).length; });
}
L.push('---', '', '_' + SECCIONES.reduce((a, s) => a + s.escenas.length, 0) + ' líneas · ' + total + ' palabras (unos ' + Math.round(total / 150) + ' minutos de voz en total)._', '');
fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, 'guion-voz.md'), L.join('\n'));
console.log('✔ guion-voz.md · ' + total + ' palabras');
