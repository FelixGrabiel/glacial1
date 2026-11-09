/* Hielo · Avance y cierre en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/hielo-avance-cierre.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
const fs = require('fs');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 950); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Supervisor', nombre: 'Ana', username: 'ana', permisos: {} }; state.showWelcome = false;
    const hoy = GlacialFecha.fechaOperativa(); window.__hoy = hoy;
    const d = glacialHieloDatos;
    goReporteHielo();                                    // abre la página (su escucha real no trae nada en esta prueba)
  });
  await P.waitForTimeout(1200);                          // deja pasar la primera lectura (vacía) antes de sembrar los datos
  await P.evaluate(() => {
    const hoy = window.__hoy, d = glacialHieloDatos;
    const R = (turno, estado, prod, extra) => Object.assign({ id: hoy + '_' + turno, fecha: hoy, turno, estado, supervisor: 'Ana', horaInicio: '07:00', horaFin: estado === 'FINALIZADO' ? '14:00' : '', produccion: prod, paradas: [], mermas: [], observaciones: '', rev: 1 }, extra || {});
    d.cache.reportes = [R('DÍA', 'FINALIZADO', [{ marca: 'Glacial', presentacion: '3 kg', bolsas: 800 }, { marca: 'Glacial', presentacion: '1.5 kg', bolsas: 400 }], { paradas: [{ inicio: '09:10', equipo: 'Compresor', motivo: 'Falla de equipo', minutos: 20, nota: '' }] }),
      R('INTERMEDIO', 'EN_REGISTRO', [{ marca: 'Glacial', presentacion: '3 kg', bolsas: 200 }]), R('NOCHE', 'FINALIZADO', [{ marca: 'Glacial', presentacion: '3 kg', bolsas: 500 }])];
    d.cache.programacion = [{ id: hoy + '_DÍA', fecha: hoy, turno: 'DÍA', items: [{ marca: 'Glacial', presentacion: '3 kg', bolsas: 1500 }, { marca: 'Glacial', presentacion: '1.5 kg', bolsas: 500 }] }];
    d.cache.listo = { reportes: true, programacion: true, config: true };
    window.__copiado = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copiado = t; } }, configurable: true });
    window.__wsp = ''; window.open = (u) => { window.__wsp = u; return null; };
    hlVista('avance');
  });
  await P.waitForSelector('#hl-av-texto');
  const txt = () => P.evaluate(() => document.getElementById('hl-av-texto').value);
  const t1 = await txt();
  ok(/^\*(AVANCE|CIERRE) DE PRODUCCIÓN HIELO – TURNO /.test(t1) && /Bolsas de 3 kg/.test(t1), 'la pantalla arma el texto del turno actual → ' + t1.split('\n')[0]);
  await P.selectOption('select', 'DI');
  const t2 = await txt();
  ok(/^\*AVANCE DE PRODUCCIÓN HIELO – TURNO DÍA \+ INTERMEDIO\*/.test(t2) && /Bolsas de 3 kg: 1[.,]000/.test(t2) && /1[.,]400 bolsas/.test(t2), 'Día + Intermedio: AVANCE (el Intermedio sigue en registro) con 1 400 bolsas');
  await P.selectOption('select', 'DÍA');
  const t3 = await txt();
  ok(/^\*CIERRE DE PRODUCCIÓN HIELO – TURNO DÍA\*/.test(t3) && /Término: 14:00/.test(t3) && /09:10 · Compresor – Falla de equipo – 20 min/.test(t3), 'solo el Día (finalizado): CIERRE, con término y la parada');
  ok(/CIERRE · todos los reportes finalizados/.test(await P.evaluate(() => document.querySelector('.hl-sub').innerText)), 'la etiqueta dice CIERRE');
  await P.selectOption('select', 'TODOS');
  ok(/AVANCE/.test((await txt()).split('\n')[0]) && /1[.,]900 bolsas/.test(await txt()), 'todo el día: 1 900 bolsas');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/hielo-avance.png' });
  await P.click('text=Copiar texto');
  ok(await P.evaluate(() => window.__copiado === document.getElementById('hl-av-texto').value && window.__copiado.length > 100), 'Copiar texto deja el mensaje en el portapapeles');
  await P.click('text=Abrir en WhatsApp');
  ok(await P.evaluate(() => /^https:\/\/wa\.me\/\?text=/.test(window.__wsp) && decodeURIComponent(window.__wsp).includes('PRODUCCIÓN HIELO')), 'WhatsApp se abre con el texto ya escrito');
  const [descarga] = await Promise.all([P.waitForEvent('download', { timeout: 8000 }), P.click('text=Descargar imagen')]);
  const ruta = (process.env.GLX_CAPTURAS || '/tmp') + '/hielo-avance-imagen.png'; await descarga.saveAs(ruta);
  ok(/^hielo-avance-\d{4}-\d{2}-\d{2}\.png$/.test(descarga.suggestedFilename()) && fs.statSync(ruta).size > 5000, 'Descargar imagen baja un PNG (' + descarga.suggestedFilename() + ')');
  await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(200);
  ok(await P.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'celular: sin desborde lateral');
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
