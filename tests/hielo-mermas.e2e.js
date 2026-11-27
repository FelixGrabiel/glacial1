/* Hielo · ítems de merma por producto en la pantalla (27/11/2026). Uso: GLX_LIBS=/ruta node tests/hielo-mermas.e2e.js */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1300, 950); const P = D.page;
  await P.evaluate(() => { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window.__hoy = GlacialFecha.fechaOperativa(); goReporteHielo('CUBOS'); });
  await P.waitForTimeout(1200);
  const items = async (prod, config, viejo) => P.evaluate(([prod, config, viejo]) => {
    const d = glacialHieloDatos; d.cache.reportes = viejo ? [{ id: window.__hoy + '_DÍA' + (prod === 'CUBOS' ? '' : '_' + prod), producto: prod === 'CUBOS' ? undefined : prod, fecha: window.__hoy, turno: 'DÍA', estado: 'EN_REGISTRO', rev: 1, produccion: [], paradas: [], mermas: [{ item: viejo, marca: '', cantidad: 2, unidad: 'UND' }], personal: [] }] : [];
    d.cache.config = config; d.cache.listo = { reportes: true, programacion: true, config: true };
    goReporteHielo(prod); hlAbrir(window.__hoy, 'DÍA'); if (!viejo) hlAgregar('mermas');
    const sel = document.querySelector('select[onchange*="\'mermas\'"][onchange*="\'item\'"]');
    return sel ? [...sel.options].map(o => o.value).filter(Boolean) : null;
  }, [prod, config, viejo || '']);
  const viejaComun = { id: 'config', rev: 4, mermas: ['Bolsas', 'Bobina', 'Hielo (producto)'] };   // lo que hay hoy en producción
  ok((await items('CUBOS', viejaComun)).join() === 'Bolsas,Bobinas,Precintos,Bolsones', 'Cubos: Bolsas, Bobinas, Precintos, Bolsones (aunque la configuración guardada tenga la lista vieja común)');
  ok((await items('PREMIUM', viejaComun)).join() === 'Bolsas,Bolsones', 'Premium: Bolsas y Bolsones');
  ok((await items('VASOS', viejaComun)).join() === 'Vasos,Tapas,Stickers', 'Vasos: Vasos, Tapas y Stickers');
  ok((await items('VASOS', Object.assign({}, viejaComun, { productos: { VASOS: { mermas: ['Vasos', 'Tapas'] } } }))).join() === 'Vasos,Tapas', 'lo que se guarde en Configuración de Vasos manda');
  const v = await items('CUBOS', viejaComun, 'Hielo (producto)');
  ok(v.includes('Hielo (producto)') && v.includes('Precintos'), 'un reporte con un ítem viejo lo sigue mostrando (no se pierde) junto a la lista nueva');
  ok(!D.errores.length, 'sin errores en la página' + (D.errores.length ? ': ' + D.errores.join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
