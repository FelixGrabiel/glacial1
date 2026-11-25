/* Planificación · «Importar de WhatsApp» en la página real (25/11/2026): botón, lectura del mensaje y vista previa; y el botón «📱 WhatsApp»
   de Gestión de usuarios. Uso: GLX_LIBS=/ruta node tests/planificacion-whatsapp.e2e.js  (GLX_CAPTURA=/ruta.png guarda la ventana) */
'use strict';
const fs=require('fs');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const msg = fs.readFileSync(__dirname + '/datos/programacion-whatsapp-24-25-11.txt', 'utf8');
(async () => {
  const H = await iniciar(); const D = await H.abrir(1300, 950); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    goPlanificacion();
  });
  await P.waitForSelector('.plan-acc-barra', { timeout: 8000 });
  await P.waitForSelector('[data-plan-wsp]', { timeout: 5000 });
  ok(true, 'Planificación muestra «📲 Importar de WhatsApp…»');
  await P.click('[data-plan-wsp]');
  await P.waitForSelector('#pw-texto');
  await P.fill('#pw-texto', msg);
  await P.click('#pw-leer');
  const v = await P.evaluate(() => ({ vista: document.getElementById('pw-vista').textContent, des: document.getElementById('pw-cargar').disabled }));
  ok(/24\/11 · Turno NOCHE/.test(v.vista) && /SCALA 7 Litros: hasta 02:00/.test(v.vista) && /1 L · PACK X 6 UND \(tapa plana, línea nueva\)/.test(v.vista) && !v.des, 'la vista previa muestra lo entendido y habilita «Cargar a Planificación»');
  if (process.env.GLX_CAPTURA) await (await P.$('.plan-dialogo')).screenshot({ path: process.env.GLX_CAPTURA });
  await P.fill('#pw-texto', '*Programación 26/11 Turno Dia\n*Bidones 7L*\n* Rara: 10');
  await P.click('#pw-leer');
  ok(await P.evaluate(() => /no conozco la marca «Rara»/.test(document.getElementById('pw-vista').textContent) && document.getElementById('pw-cargar').disabled), 'con un error, lo explica y no deja cargar');
  await P.click('#pw-cancelar');
  // Gestión de usuarios: botón WhatsApp y guardado del número
  const u = await P.evaluate(async () => {
    _usersCache = [{ username: 'admin', nombre: 'Admin', rol: 'Administrador', permisos: 'todos' }, { username: 'ana', nombre: 'Ana', rol: 'Planificación', permisos: [] }];
    let guardado = null; window.saveUsers = async l => { guardado = l; _usersCache = l; return true; };
    const host = document.createElement('div'); host.id = 'user-list'; document.body.appendChild(host);
    try { renderUserList(); } catch (e) { }
    const hay = !!document.querySelector('[onclick^="editarWhatsappUsuario"]');
    editarWhatsappUsuario('ana');
    document.querySelector('[data-wsp]').value = '987 654 321';
    document.querySelector('[data-wsp-ok]').click();
    await new Promise(r => setTimeout(r, 100));
    return { hay, num: guardado && guardado.find(x => x.username === 'ana').whatsapp };
  });
  ok(u.num === '51987654321', 'Gestión de usuarios: el Administrador guarda el WhatsApp (987 654 321 → 51987654321)' + (u.hay ? ' y la fila tiene el botón «📱 WhatsApp»' : ''));
  const errores = D.errores.filter(e => !/Guardado de|Error guardando/.test(e));
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
