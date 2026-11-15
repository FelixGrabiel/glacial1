/* Calidad › Validación de lotes en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/validacion-lotes.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 950); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('report-select-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    const hace = m => new Date(Date.now() - m * 60000).toISOString();
    window.__llamadas = [];
    const filas = [
      { clave: 'wa-1111111@AAA', lote: 'L2411-07', resultado: 'OBSERVADO', insumo: 'Cajas de preformas 15.7 g', proveedor: 'Plastipak', linea: 'PET1', motivo: 'La fecha de vencimiento es dentro de 3 días', controles: [{ nombre: 'Lote legible', resultado: 'OK' }, { nombre: 'Fecha de vencimiento', resultado: 'FALLA', detalle: 'vence en 3 días' }], validada_en: hace(25), revision_estado: 'PENDIENTE' },
      { clave: 'wa-2222222@BBB', lote: 'P-5521', resultado: 'OK', insumo: 'Polietileno 56 cm', proveedor: 'Propack', linea: 'B7L', controles: [{ nombre: 'Lote legible', resultado: 'OK' }, { nombre: 'Proveedor registrado', resultado: 'OK' }], validada_en: hace(90), revision_estado: 'PENDIENTE' },
      { clave: 'wa-3333333@CCC', lote: 'E-0098', resultado: 'RECHAZADO', insumo: 'Etiqueta roll feed 625 ml', proveedor: 'Etiflex', linea: 'PET2', motivo: 'Etiqueta ilegible', validada_en: hace(300), revision_estado: 'REVISADA', revisada_por: 'ana@glacial.pe', revisada_en: hace(200), revision_nota: 'Se devolvió al proveedor' },
    ];
    window.glacialSupabaseCliente = { rpc: async (n, a) => { window.__llamadas.push(n); if (n === 'validaciones_lotes_listar') return { data: filas, error: null }; if (n === 'validaciones_lotes_revisar') { filas[0].revision_estado = 'REVISADA'; filas[0].revisada_por = 'ana@glacial.pe'; filas[0].revisada_en = new Date().toISOString(); return { data: true, error: null }; } return { data: null, error: null }; } };
    state.currentTab = 'calidad'; renderSidebar(); renderMain();
  });
  await P.waitForSelector('.cal-tabs', { timeout: 8000 });
  await P.waitForSelector('.vl-t', { timeout: 6000 });
  const t = await P.evaluate(() => document.querySelector('.vl').innerText.replace(/\s+/g, ' '));
  ok(/CALIDAD/.test(await P.evaluate(() => document.querySelector('.cal-cab').innerText)) && /Validación de lotes/.test(await P.evaluate(() => document.querySelector('.cal-tabs').innerText)), 'el módulo CALIDAD muestra la pantalla «Validación de lotes»');
  const menu = await P.evaluate(() => { const g = document.getElementById('sidebar-group-calidad'), b = document.getElementById('btn-calidad-validacion'); return { grupo: g && g.style.display !== 'none', boton: b && b.style.display !== 'none' && b.classList.contains('active') }; });
  ok(menu.grupo && menu.boton, 'el menú lateral muestra el grupo «Calidad» y su acceso marcado como activo');
  ok(/L2411-07/.test(t) && /P-5521/.test(t) && /E-0098/.test(t), 'lista las tres validaciones que llegaron');
  ok(await P.evaluate(() => [...document.querySelectorAll('.vl-k')].map(k => k.querySelector('b').innerText).join()) === '3,1,1,1,1', 'tarjetas: 3 validaciones, 1 validada, 1 con observación, 1 rechazada y 1 por revisar (la rechazada ya está revisada)');
  ok(await P.evaluate(() => window.__llamadas.includes('validaciones_lotes_listar')), 'usa la función del servidor (no la tabla)');
  await P.evaluate(() => vlSet('revision', 'PIDE'));
  ok(await P.evaluate(() => document.querySelectorAll('.vl-fila').length) === 1, 'el filtro «Por revisar» deja solo la observada');
  await P.evaluate(() => vlAbrir('wa-1111111@AAA'));
  ok(/Fecha de vencimiento.*vence en 3 días/.test(await P.evaluate(() => document.querySelector('.vl-det').innerText.replace(/\s+/g, ' '))), 'el detalle muestra el motivo y los controles con su falla');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/validacion-lotes.png', fullPage: false });
  await P.evaluate(() => vlRevisar('wa-1111111@AAA')); await P.waitForTimeout(500);
  ok(await P.evaluate(() => window.__llamadas.includes('validaciones_lotes_revisar')) && /Marcada como revisada/.test(await P.evaluate(() => document.querySelector('.vl').innerText)), 'marcar como revisada llama al servidor y lo avisa');
  await P.evaluate(() => vlSet('revision', ''));
  ok(await P.evaluate(() => [...document.querySelectorAll('.vl-k')].map(k => k.querySelector('b').innerText)[4]) === '0', 'después de revisar, «Por revisar» baja a 0');
  const cat = await P.evaluate(() => { const h = htmlPermisosPorArea({}); return { area: /CALIDAD/.test(h), ver: /value="calidadVer"/.test(h), rev: /value="calidadRevisar"/.test(h), enArea: /value="calidadVer"[^>]*data-area="calidad"|data-area="calidad"[^>]*>|value="calidadVer" data-area="calidad"/.test(h) }; });
  ok(cat.area && cat.ver && cat.rev, 'Gestión de usuarios muestra el área «Calidad» con «VER» y «REVISAR»');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
