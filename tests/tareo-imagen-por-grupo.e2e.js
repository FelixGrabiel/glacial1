/* Tareo · imagen para WhatsApp: UNA imagen por grupo (Supervisores · Maquinistas · Operarios) en navegador real (Chromium + Playwright).
   Uso: GLX_LIBS=/ruta node tests/tareo-imagen-por-grupo.e2e.js   (no forma parte de las pruebas rápidas). SHOTS=carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };

(async () => {
  const H = await iniciar();
  const D = await H.abrir(1400, 900);
  const hoy = await D.page.evaluate(() => obtenerFechaHoy());
  await D.page.evaluate(([hoy]) => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window._recordsReady = true;
    let n = 0; const P = (id, nombre, cargo, extra) => Object.assign({ id, trabajadorId: id, nombre, dni: String(40000000 + (++n)), cargo, asistencia: 'Asistió', horaIngreso: '07:00', horaSalida: '15:00' }, extra || {});
    const sup = [P('s1', 'Carlos Prado', 'Supervisor de Producción'), P('s2', 'Leandro Lopez', 'Supervisor de Producción', { asistencia: 'Descanso', horaIngreso: '', horaSalida: '' })];
    const maq = ['Ana Ruiz', 'Beto Soto', 'Cesar Paz'].map((n, i) => P('m' + i, n, 'Maquinista'));
    const ope = Array.from({ length: 30 }, (_, i) => P('o' + i, 'Operario Número ' + (i + 1), i % 7 === 0 ? 'Líder de línea' : 'Operario'));
    window.__personal = sup.concat(maq, ope);
    _workersCache = [];
    _tareosCache = [{ id: 'tp1', fecha: hoy, turno: 'Día', area: 'Producción', estado: 'Abierto', jornadaNormal: 8, creadoPor: 'admin', personal: window.__personal }];
  }, [hoy]);

  const r = await D.page.evaluate(([hoy]) => {
    const x = tareoGenerarImagenesRRHH({ fecha: hoy, turno: 'Día', area: 'Producción', titulo: 'Tareo de producción' });
    return { secciones: x.secciones.map(s => ({ clave: s.clave, titulo: s.titulo, total: s.total, imgs: s.imagenes.length })), total: x.imagenes.length, items: x.items.map(i => i.seccion + ':' + i.pagina + '/' + i.paginas), todas: x.imagenes.every(u => /^data:image\/png;base64,/.test(u)) };
  }, [hoy]);
  ok(r.secciones.map(s => s.clave).join() === 'supervisores,maquinistas,operarios', 'tres secciones, en este orden: supervisores, maquinistas, operarios (' + r.secciones.map(s => s.clave).join() + ')');
  ok(r.secciones[0].total === 2 && r.secciones[0].imgs === 1, 'Supervisores: 2 personas en 1 imagen');
  ok(r.secciones[1].total === 3 && r.secciones[1].imgs === 1, 'Maquinistas: 3 personas en 1 imagen');
  ok(r.secciones[2].total === 30 && r.secciones[2].imgs === 2, 'Operarios: 30 personas → 2 páginas (25 por imagen), sin mezclarse con los otros grupos');
  ok(r.total === 4 && r.todas, 'en total 4 imágenes PNG (1 + 1 + 2)');

  await D.page.evaluate(() => exportarTareoPNG('tp1'));
  await D.page.waitForSelector('#modal-root img');
  const m = await D.page.evaluate(() => ({ h4: [...document.querySelectorAll('#modal-root h4')].map(h => h.textContent.replace(/\s+/g, ' ').trim()), imgs: document.querySelectorAll('#modal-root img').length,
    botones: [...document.querySelectorAll('#modal-root button')].map(b => b.textContent.trim()).filter(t => /Descargar imagen/.test(t)) }));
  ok(m.imgs === 4 && m.h4.length === 3 && /Supervisores/.test(m.h4[0]) && /Maquinistas/.test(m.h4[1]) && /Operarios/.test(m.h4[2]), 'la ventana muestra un bloque por grupo: ' + m.h4.join(' | '));
  ok(m.botones.length === 4 && /supervisores/.test(m.botones[0]) && /maquinistas/.test(m.botones[1]) && /operarios · página 1/.test(m.botones[2]), 'un botón de descarga por imagen: ' + m.botones.join(' | '));
  const nombres = await D.page.evaluate(() => { const nombres = []; const a0 = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { nombres.push(this.download); }; window.__tareoImgDescargarTodas(); return new Promise(res => setTimeout(() => { HTMLAnchorElement.prototype.click = a0; res(nombres); }, 2200)); });
  ok(nombres.length === 4 && /_supervisores\.png$/.test(nombres[0]) && /_maquinistas\.png$/.test(nombres[1]) && /_operarios_p1\.png$/.test(nombres[2]) && /_operarios_p2\.png$/.test(nombres[3]), 'archivos: ' + nombres.join(', '));
  if (process.env.SHOTS) {
    const imgs = await D.page.evaluate(() => [...document.querySelectorAll('#modal-root img')].map(i => i.src));
    require('fs').mkdirSync(process.env.SHOTS, { recursive: true });
    ['supervisores', 'maquinistas', 'operarios_p1', 'operarios_p2'].forEach((n, i) => require('fs').writeFileSync(process.env.SHOTS + '/tareo_' + n + '.png', Buffer.from(imgs[i].split(',')[1], 'base64')));
  }
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ': ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' fallas' : '\nTodo bien');
})();
