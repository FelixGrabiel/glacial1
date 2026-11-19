/* Calidad › Lotes leídos en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/calidad-lecturas.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
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
    const sha1 = 'a'.repeat(64), sha2 = 'b'.repeat(64), sha3 = 'c'.repeat(64);
    const ruido = ['Este revisor utiliza la transcripcion anterior; NO relee la fotografia.', 'PENDIENTE DE VALIDACION: prohibido modificar inventarios automaticamente.'];
    window.__llamadas = []; window.__firmadas = [];
    const lecturas = [
      { sha256: sha1, foto_ruta: 'asistente/evidencias/' + sha1 + '.jpg', mime: 'image/jpeg', recibido_en: hace(5), importada: false, estado: 'pendiente_validacion', campos_en_duda: ['peso_neto_kg'], cambios_sugeridos: ['peso_neto_kg: la etiqueta dice PESO, no PESO NETO'],
        extraccion: { lote: '11102', marca: 'CONSORCIO FRAP', proveedor: 'Competencia Ash', producto: 'PRODUCTO CONFORME', presentacion: 'BOBINA HIELO EN CUBO 1.5 KG', fecha_impresa: '10/04/2026', cantidad_valor: 1.5, cantidad_unidad: 'KG', peso_declarado_kg: 8.3, advertencias: ['La etiqueta está girada.'].concat(ruido), texto_relevante: 'CONSORCIO FRAP; Lote: 11102' } },
      { sha256: sha2, foto_ruta: 'asistente/evidencias/' + sha2 + '.jpg', mime: 'image/jpeg', recibido_en: hace(90), importada: true, estado: 'pendiente_validacion', extraccion: { lote: 'P-5521', proveedor: 'Propack', producto: 'Polietileno 56 cm', fecha_vencimiento: '01/2028', advertencias: ruido } },
      { sha256: sha3, foto_ruta: null, mime: 'image/jpeg', recibido_en: hace(400), importada: false, estado: 'pendiente_validacion', extraccion: { advertencias: ['No se ve la etiqueta.'] } }
    ];
    const validaciones = [{ clave: 'wa-1111111@AAA', lote: '11102', resultado: 'OBSERVADO', insumo: 'Hielo', proveedor: 'Competencia Ash', linea: 'B7L', motivo: 'Peso dudoso', controles: [], evidencia_sha256: sha1, validada_en: hace(4), revision_estado: 'PENDIENTE' }];
    const PIX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
    window.glacialSupabaseCliente = {
      storage: { from: () => ({ createSignedUrls: async rutas => { window.__firmadas.push(...rutas); return { data: rutas.map(p => ({ path: p, signedUrl: PIX, error: null })), error: null }; } }) },
      rpc: async (n) => { window.__llamadas.push(n); if (n === 'calidad_lecturas_listar') return { data: lecturas, error: null }; if (n === 'validaciones_lotes_listar') return { data: validaciones, error: null }; return { data: null, error: null }; }
    };
    state.currentTab = 'calidad'; renderSidebar(); renderMain();
  });
  await P.waitForSelector('.lc-card', { timeout: 8000 });
  const t = await P.evaluate(() => document.querySelector('.lc').innerText.replace(/\s+/g, ' '));
  ok(/Lotes leídos/.test(await P.evaluate(() => document.querySelector('.cal-tabs').innerText)) && /Validación de lotes/.test(await P.evaluate(() => document.querySelector('.cal-tabs').innerText)), 'Calidad tiene las pestañas «Lotes leídos» y «Validación de lotes»');
  ok(await P.evaluate(() => document.querySelector('.cal-tab[aria-selected="true"]').innerText.trim()) === 'Lotes leídos', '«Lotes leídos» es la pantalla inicial');
  const menu = await P.evaluate(() => ['btn-calidad-lecturas', 'btn-calidad-validacion'].map(i => { const b = document.getElementById(i); return b && b.style.display !== 'none'; }));
  ok(menu[0] && menu[1], 'el menú lateral muestra los dos accesos');
  ok(await P.evaluate(() => document.getElementById('btn-calidad-lecturas').classList.contains('active')), 'el acceso «Lotes leídos» queda marcado como activo');
  ok(/11102/.test(t) && /P-5521/.test(t) && /Sin lote legible/.test(t), 'lista las tres lecturas del bot, incluida la que no tiene lote legible');
  ok(await P.evaluate(() => [...document.querySelectorAll('.lc-k')].map(k => k.querySelector('b').innerText).join()) === '3,2,1,2', 'tarjetas: 3 lecturas, 2 con advertencias, 1 sin lote, 2 con foto');
  await P.waitForFunction(() => document.querySelectorAll('.lc-foto[data-foto-lista="1"]').length === 2, null, { timeout: 5000 }).catch(() => {});
  ok(await P.evaluate(() => [...document.querySelectorAll('.lc-foto')].filter(i => i.src.startsWith('data:image')).length) === 2, 'las 2 fotos se muestran con enlace firmado');
  ok(await P.evaluate(() => window.__firmadas.every(r => /^asistente\/evidencias\/[a-f]{64}\.jpg$/.test(r))), 'solo se firman rutas de asistente/evidencias/');
  ok(await P.evaluate(() => window.__llamadas.includes('calidad_lecturas_listar')), 'usa la función del servidor (no la tabla)');
  await P.evaluate(() => lcSet('estado', 'SINLOTE'));
  ok(await P.evaluate(() => document.querySelectorAll('.lc-card').length) === 1, 'el filtro «Sin lote legible» deja una');
  await P.evaluate(() => lcSet('estado', 'LIMPIA'));
  ok(await P.evaluate(() => document.querySelectorAll('.lc-card').length) === 1, 'el filtro «Sin advertencias» deja la lectura limpia (las advertencias fijas del procesador no cuentan)');
  await P.evaluate(() => lcSet('estado', ''));
  await P.evaluate(() => lcBuscar('competencia'));
  ok(await P.evaluate(() => document.querySelectorAll('.lc-card').length) === 1, 'buscar por proveedor encuentra la lectura');
  await P.evaluate(() => { lcBuscar(''); lcAbrir('a'.repeat(64)); });
  const d = await P.evaluate(() => document.querySelector('.lc-det').innerText.replace(/\s+/g, ' '));
  ok(/Lote 11102/i.test(d) && /Marca CONSORCIO FRAP/i.test(d) && /Cantidad 1.5 KG/i.test(d) && /Peso declarado \(kg\) 8.3/i.test(d) && /Campos en duda Peso neto \(kg\)/i.test(d), 'el detalle muestra los datos leídos de la etiqueta');
  ok(/La etiqueta está girada/.test(d) && !/Este revisor/.test(d) && !/PENDIENTE DE VALIDACION/.test(d), 'el detalle muestra las advertencias útiles y no las fijas del procesador');
  ok(/Correcciones sugeridas/i.test(d) && /Texto leído de la etiqueta/i.test(d), 'el detalle muestra correcciones sugeridas y el texto leído');
  ok(await P.evaluate(() => !!document.querySelector('.lc-det a.lc-grande[data-foto-ref]')), 'el detalle ofrece abrir la foto en tamaño completo');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/calidad-lotes-leidos.png', fullPage: false });
  await P.evaluate(() => goCalidad('validacion')); await P.waitForSelector('.vl-t', { timeout: 5000 });
  await P.evaluate(() => vlAbrir('wa-1111111@AAA'));
  await P.waitForSelector('.vl-evid img', { timeout: 5000 });
  const v = await P.evaluate(() => document.querySelector('.vl-det').innerText.replace(/\s+/g, ' '));
  ok(await P.evaluate(() => !!document.querySelector('.vl-evid img.vl-foto')) && /Lectura de la etiqueta: lote 11102/.test(v), 'en «Validación de lotes» la evidencia muestra la foto y el lote leído');
  ok(await P.evaluate(() => document.getElementById('btn-calidad-validacion').classList.contains('active') && !document.getElementById('btn-calidad-lecturas').classList.contains('active')), 'el menú marca la pantalla activa');
  await P.setViewportSize({ width: 390, height: 800 }); await P.evaluate(() => goCalidad('lecturas')); await P.waitForSelector('.lc-card');
  ok(await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'en el teléfono no hay desplazamiento horizontal');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/calidad-lotes-leidos-movil.png', fullPage: false });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
