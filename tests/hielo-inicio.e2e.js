/* Hielo · tarjeta del Inicio en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/hielo-inicio.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1500, 950); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto'; document.body.style.height = 'auto';
    state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    const hoy = GlacialFecha.fechaOperativa();
    const H = glacialHieloDatos; H.escuchar = () => {};
    const T = ['DÍA', 'NOCHE'], f = GlacialFecha.sumarDias(hoy, -1);
    H.cache.reportes = [].concat(...[hoy, f].map(fe => T.map(tu => ({ id: fe + '_' + tu, fecha: fe, turno: tu, estado: 'EN_REGISTRO', produccion: [{ marca: 'Glacial', presentacion: '3 kg', bolsas: 800 }, { marca: 'Glacial', presentacion: '1.5 kg', bolsas: 400 }], paradas: [{ minutos: 20, motivo: 'Falla' }], mermas: [] }))));
    H.cache.programacion = [].concat(...[hoy, f].map(fe => T.map(tu => ({ id: fe + '_' + tu, fecha: fe, turno: tu, items: [{ marca: 'Glacial', presentacion: '3 kg', bolsas: 1500 }] }))));
    window.__hoy = hoy;
    state.currentTab = 'centro-perfil'; renderMain();
  });
  await P.waitForSelector('.cp-shell', { timeout: 8000 });
  const hay = await P.evaluate(() => { const c = document.getElementById('hli-inicio'); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
  ok(/HIELO/.test(hay) && /800/.test(hay) && /400/.test(hay) && /80 %/.test(hay), 'el Inicio muestra la tarjeta HIELO del turno que se está viendo → ' + hay.slice(0, 160));
  if (process.env.GLX_CAPTURAS) { await P.locator('#hli-inicio').scrollIntoViewIfNeeded(); await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-inicio.png' }); };
  ok(await P.evaluate(() => /Abrir Reporte Hielo/.test(document.getElementById('hli-inicio').innerText)), 'con botón «Abrir Reporte Hielo»');
  await P.evaluate(() => { const H = glacialHieloDatos; H.cache.reportes[0].estado = 'FINALIZADO'; H.cache.reportes[0].produccion[0].bolsas = 1000; document.dispatchEvent(new Event('x')); });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
