/* Hielo · Programación (rediseño 26/11/2026): agrupada por presentación con kg y paletas, total del turno, turnos en botones, próximos en tarjetas,
   y la tabla se vuelve a leer sola cuando cambia la programación (p. ej. carga por WhatsApp) si no la estás editando.
   Uso: GLX_LIBS=/ruta node tests/hielo-programacion-vista.e2e.js  (GLX_CAPTURAS=/carpeta guarda capturas) */
'use strict';
const path = require('path');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1300, 1000); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    goReporteHielo('CUBOS');
  });
  await P.waitForTimeout(1000);
  const txt = () => P.evaluate(() => document.querySelector('.hl-main').innerText);
  await P.evaluate(() => {
    const d = glacialHieloDatos, hoy = GlacialFecha.fechaOperativa(), man = GlacialFecha.sumarDias(hoy, 1);
    window.__hoy = hoy;
    d.cache.programacion = [];
    d.cache.reportes = [{ id: hoy + '_NOCHE', fecha: hoy, turno: 'NOCHE', estado: 'EN_REGISTRO', produccion: [{ marca: "Bell's", presentacion: '3 kg', bolsas: 1200 }], paradas: [], mermas: [] }];
    d.cache.listo = { reportes: true, programacion: true, config: true };
    hlPSel(hoy, 'NOCHE');
  });
  await P.waitForSelector('.hl-pg-turnos');
  let t = await txt();
  ok(/Sin programación para este turno/.test(t) && /Copiar del día anterior/.test(t), 'turno sin programación: lo dice y ofrece copiar del día anterior');
  // llega la programación (como la carga por WhatsApp) mientras la pantalla está abierta y SIN cambios propios → se ve sola
  await P.evaluate(() => {
    const d = glacialHieloDatos, hoy = window.__hoy;
    d.cache.programacion = [{ id: hoy + '_NOCHE', fecha: hoy, turno: 'NOCHE', rev: 1, actualizadoPor: 'Yenny Vertiz', historial: [{ por: 'Yenny Vertiz', origen: 'WHATSAPP', enviadoPor: 'Yenny Vertiz' }],
      items: [{ marca: 'Glacial', presentacion: '1.5 kg', bolsas: 600 }, { marca: "Bell's", presentacion: '3 kg', bolsas: 2400 }, { marca: 'Listo', presentacion: '1.5 kg', bolsas: 600 }, { marca: 'Molitalia', presentacion: '3 kg', bolsas: 600 }, { marca: 'Glacial', presentacion: '3 kg', bolsas: 600 }, { marca: 'Rappi', presentacion: '3 kg', bolsas: 600 }] },
      { id: GlacialFecha.sumarDias(hoy, 1) + '_DÍA', fecha: GlacialFecha.sumarDias(hoy, 1), turno: 'DÍA', rev: 1, items: [{ marca: 'Tottus CD', presentacion: '3 kg', bolsas: 2640 }, { marca: 'Glacial', presentacion: '1.5 kg', bolsas: 600 }] }];
    hlVista('programacion');
  });
  await P.waitForTimeout(300);
  t = await txt();
  const g3 = await P.evaluate(() => document.querySelector('.hl-pg-grupo').innerText.replace(/\s+/g, ' '));
  ok(/Presentación 3 kg 4 200 bolsas · 13 650 kg · 14 paletas/.test(g3), 'grupo 3 kg con su subtotal (4 200 bolsas · 13 650 kg · 14 paletas) → ' + g3);
  ok(/5\s?400/.test(t) && /📲 WhatsApp · Yenny Vertiz/.test(t), 'total del turno (5 400 bolsas) y origen WhatsApp');
  const orden = await P.evaluate(() => [...document.querySelectorAll('.hl-pg-grupo span')].map(x => x.textContent));
  ok(orden[0] === 'Presentación 3 kg' && orden[1] === 'Presentación 1.5 kg', 'grupos en orden: 3 kg y luego 1.5 kg');
  const prodBells = await P.evaluate(() => { const tr = [...document.querySelectorAll('.hl-pg-t tbody tr')].find(x => x.querySelector('select') && x.querySelector('select').value === "Bell's"); return tr ? tr.querySelector('td[data-label="Producido"]').innerText.replace(/\s+/g, ' ') : ''; });
  ok(prodBells === '1 200 50%', "con reporte del turno: columna «Producido» (Bell's 1 200 de 2 400 = 50 %) → " + prodBells);
  ok(await P.evaluate(() => document.querySelectorAll('.hl-pg-card').length === 2 && document.querySelector('.hl-pg-card.sel') !== null), 'próximos turnos en tarjetas, con el elegido resaltado');
  ok(await P.evaluate(() => document.querySelector('.hl-pg-acc .hl-btn:not(.o)').disabled), '«Guardar» desactivado mientras no hay cambios');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'hielo-programacion.png'), fullPage: true });
  // editar: no se pierde si llega otra versión
  await P.evaluate(() => { hlPItem(0, 'bolsas', '700'); const d = glacialHieloDatos; const p = d.cache.programacion[0]; p.rev = 2; p.items = p.items.concat([{ marca: 'Listo', presentacion: '3 kg', bolsas: 100 }]); hlPItem(1, 'bolsas', '600'); });
  t = await txt();
  ok(/cambió mientras la editabas/.test(t) && /Tienes cambios sin guardar/.test(t) && await P.evaluate(() => [...document.querySelectorAll('.hl-pg-t input')].some(i => i.value === '700')), 'con cambios propios: no se pisa lo que editas y avisa que hay una versión nueva');
  // celular
  await P.setViewportSize({ width: 390, height: 800 }); await P.waitForTimeout(300);
  ok(await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular: sin desborde lateral');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'hielo-programacion-movil.png'), fullPage: true });
  const errores = D.errores.filter(e => !/Guardado de|Error guardando/.test(e));
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
