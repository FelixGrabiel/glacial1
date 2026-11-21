/* Ayuda para revisar pantallas en ancho de teléfono/tablet con la app REAL (index.html) y datos de ejemplo.
   Uso: node tests/ayuda/pantallas-movil.js  (GLX_LIBS opcional; GLX_CAPTURAS=/carpeta guarda capturas). Informa los elementos que se salen del ancho de la pantalla. */
'use strict';
const fs = require('fs'), path = require('path');
const { iniciar } = require('./graficos-e2e.js');
const ANCHOS = (process.env.GLX_ANCHOS || '360,390,768').split(',').map(Number);
/* Devuelve los elementos cuyo borde derecho pasa del ancho visible (ignora lo que está dentro de un contenedor con su propio scroll). */
const medir = () => {
  const W = document.documentElement.clientWidth, out = [], recortados = [];
  const nombre = e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''));
  document.querySelectorAll('#app-screen *').forEach(e => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (!r.width || r.right <= W + 1 || cs.position === 'fixed' || cs.display === 'none') return;
    let p = e.parentElement, tipo = '';
    while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.getBoundingClientRect().right <= W + 1) { tipo = 'scroll'; break; } if (/(hidden|clip)/.test(s.overflowX) && p.getBoundingClientRect().right <= W + 1) { tipo = 'recortado por ' + nombre(p); break; } p = p.parentElement; }
    const txt = nombre(e) + ' ancho=' + Math.round(r.width) + ' derecha=' + Math.round(r.right);
    if (!tipo) out.push(txt); else if (tipo !== 'scroll') recortados.push(txt + ' [' + tipo + ']');
  });
  return { W, scrollW: document.documentElement.scrollWidth, n: out.length, primeros: out.slice(0, 12), recortados: recortados.length, primerosRecortados: recortados.slice(0, 12) };
};
async function revisar(nombre, preparar, anchos = ANCHOS) {
  const H = await iniciar(), res = [];
  for (const w of anchos) {
    const D = await H.abrir(w, 900), P = D.page;
    await P.evaluate(() => { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block'; state.user = { rol: 'Administrador', nombre: 'Ana', username: 'ana', permisos: 'todos' }; state.showWelcome = false; });
    await P.evaluate(preparar); await P.waitForTimeout(Number(process.env.GLX_ESPERA || 600));
    const r = await P.evaluate(medir); res.push({ nombre, ancho: w, ...r });
    if (process.env.GLX_CAPTURAS) await P.screenshot({ path: path.join(process.env.GLX_CAPTURAS, nombre + '-' + w + '.png'), fullPage: false });
    await P.context().close();
  }
  await H.cerrar();
  return res;
}
module.exports = { revisar, medir };
