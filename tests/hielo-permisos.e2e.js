/* Permisos de Hielo en navegador real: el Administrador tiene todo y los demás ven solo lo que se les permite; la pantalla de usuarios muestra y guarda los permisos.
   Uso: GLX_LIBS=/ruta node tests/hielo-permisos.e2e.js (no forma parte de las pruebas rápidas). */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const FIJO = () => {
  const R = glacialHieloDatos.cache;
  R.reportes = [{ id: '2026-11-18_NOCHE', fecha: '2026-11-18', turno: 'NOCHE', estado: 'FINALIZADO', produccion: [{ marca: 'Rappi', presentacion: '3 kg', bolsas: 100, lote: '1' }], paradas: [], mermas: [], rev: 2 },
    { id: '2026-11-19_DÍA', fecha: '2026-11-19', turno: 'DÍA', estado: 'EN_REGISTRO', produccion: [{ marca: 'Rappi', presentacion: '3 kg', bolsas: 50, lote: '2' }], paradas: [], mermas: [], rev: 1 }];
  R.listo = { reportes: true, programacion: true, config: true };
};
(async () => {
  const H = await iniciar(), D = await H.abrir(1300, 1000), P = D.page;
  const entrar = async (usuario) => {
    await P.evaluate((u) => { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block'; state.user = u; state.showWelcome = false; goReporteHielo(); }, usuario);
    await P.waitForTimeout(300); await P.evaluate(FIJO);
  };
  const botones = async (vista, fecha, turno) => P.evaluate(([v, f, t]) => {
    if (f) { hlAbrir(f, t); }
    hlVista(v); const txt = [...document.querySelectorAll('.hl-main button')].map(b => b.innerText.trim());
    return txt;
  }, [vista, fecha, turno]);
  const U = (rol, permisos, extra) => Object.assign({ rol, nombre: 'Prueba', username: 'p', permisos: permisos || [] }, extra || {});

  // Administrador
  await entrar(U('Administrador', 'todos'));
  let b = await botones('registro', '2026-11-19', 'DÍA');
  ok(b.includes('Guardar') && b.includes('Finalizar reporte'), 'Administrador: guarda y finaliza un reporte');
  b = await botones('registro', '2026-11-18', 'NOCHE');
  ok(b.some(x => /Reabrir/.test(x)), 'Administrador: puede reabrir un reporte finalizado');
  b = await botones('reporte'); ok(b.some(x => /Descargar Excel/.test(x)) && b.some(x => /Compartir imagen por WhatsApp/.test(x)), 'Administrador: descarga y comparte el Reporte diario');
  ok(await P.evaluate(() => { const d = glacialHieloDatos; return ['puedeVer', 'puedeRegistrar', 'puedeCerrar', 'puedeReabrir', 'puedeProgramar', 'puedeConfigurar', 'puedeExportar'].every(k => d[k] && d[k]() === true); }), 'Administrador: los 7 permisos de Hielo en verdadero');

  // Supervisor (valores de su rol): registra, cierra, descarga; no reabre, no programa, no configura
  await entrar(U('Supervisor', ['produccionActual']));
  ok(await P.evaluate(() => { const d = glacialHieloDatos; return d.puedeVer() && d.puedeRegistrar() && d.puedeCerrar() && d.puedeExportar() && !d.puedeReabrir() && !d.puedeProgramar() && !d.puedeConfigurar(); }), 'Supervisor: lo de siempre (registra, cierra y descarga; no reabre, programa ni configura)');
  b = await botones('registro', '2026-11-18', 'NOCHE'); ok(!b.some(x => /Reabrir/.test(x)), 'Supervisor: no ve «Reabrir» en un reporte finalizado');

  // Supervisor sin cerrar: guarda pero no finaliza
  await entrar(U('Supervisor', ['-hieloCerrar']));
  b = await botones('registro', '2026-11-19', 'DÍA');
  ok(b.includes('Guardar') && !b.includes('Finalizar reporte'), 'Supervisor con «-hieloCerrar»: guarda pero no ve «Finalizar reporte»');
  ok(await P.evaluate(async () => { try { await glacialHieloDatos.guardarReporte(JSON.parse(JSON.stringify(glacialHieloDatos.cache.reportes[1])), 'FINALIZAR'); return false; } catch (e) { return /No tienes permiso para finalizar/.test(e.message); } }), 'y el intento de finalizar por código también se rechaza');

  // Con permiso de reabrir (sin ser Administrador)
  await entrar(U('Supervisor', ['hieloReabrir']));
  b = await botones('registro', '2026-11-18', 'NOCHE'); ok(b.some(x => /^Reabrir reporte/.test(x)), 'Supervisor con «hieloReabrir»: ve «Reabrir reporte»');

  // Quitado «registrar»: solo consulta
  await entrar(U('Supervisor', ['-hielo']));
  b = await botones('registro', '2026-11-19', 'DÍA'); ok(!b.includes('Guardar') && !b.includes('Finalizar reporte'), 'Supervisor con «-hielo»: solo consulta (sin Guardar ni Finalizar)');

  // Quitado «descargar»
  await entrar(U('Supervisor', ['-hieloExportar']));
  b = await botones('reporte'); ok(!b.some(x => /Descargar|Compartir/.test(x)), 'Supervisor con «-hieloExportar»: el Reporte diario no tiene botones de descargar ni compartir');
  b = await botones('historial'); ok(!b.some(x => /Descargar Excel/.test(x)), 'y el Historial tampoco tiene «Descargar Excel»');

  // Un rol sin permisos de Hielo y al que se le dan
  await entrar(U('Operador', ['programarHielo', 'configurarHielo']));
  ok(await P.evaluate(() => { const d = glacialHieloDatos; return d.puedeVer() && !d.puedeRegistrar() && d.puedeProgramar() && d.puedeConfigurar(); }), 'un rol sin Hielo al que se le da programar y configurar: puede esas dos y no registra');

  // Sin «ver»: no entra
  await P.evaluate((u) => { state.user = u; document.querySelector('.hl-app') && (document.getElementById('hielo-root') || {}); }, U('Operador', ['-hieloVer']));
  const aviso = await P.evaluate(() => { let m = ''; const o = window.alert; window.alert = t => { m = String(t); }; goReporteHielo(); window.alert = o; return m; });
  ok(/No tienes permiso para ver Hielo/.test(aviso), 'sin «ver»: al abrir Hielo avisa que no tiene permiso');

  // Pantalla de usuarios: muestra lo que puede hacer y guarda -permiso al quitar lo que su rol traía
  await P.evaluate(() => { state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; document.getElementById('app-screen').style.display = 'block'; document.getElementById('modal-root').innerHTML = ''; });
  const r = await P.evaluate(() => {
    const base = { username: 'sup1', nombre: 'Sup Uno', rol: 'Supervisor', permisos: ['produccionActual'], passwordHash: 'x', salt: 'x' };
    _usersCache.push(base); editarPermisosUsuario('sup1');
    const marcado = k => { const c = document.querySelector('.permiso-edit-check[value="' + k + '"]'); return !!(c && c.checked); };
    const antes = { ver: marcado('hieloVer'), hielo: marcado('hielo'), cerrar: marcado('hieloCerrar'), reabrir: marcado('hieloReabrir'), prog: marcado('programarHielo') };
    const c = document.querySelector('.permiso-edit-check[value="hielo"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
    const c2 = document.querySelector('.permiso-edit-check[value="hieloReabrir"]'); c2.checked = true; c2.dispatchEvent(new Event('change', { bubbles: true }));
    window.alert = () => {}; guardarPermisosUsuario('sup1');
    const u = loadUsers().find(x => x.username === 'sup1');
    return { antes, permisos: u.permisos };
  });
  ok(r.antes.ver && r.antes.hielo && r.antes.cerrar && !r.antes.reabrir && !r.antes.prog, 'Usuarios: un Supervisor muestra marcados «ver», «registrar» y «cerrar» (lo que su rol trae) y sin «reabrir» ni «programar»');
  console.log('  permisos guardados:', JSON.stringify(r.permisos));
  ok(r.permisos.includes('-hielo') && r.permisos.includes('hieloReabrir') && !r.permisos.includes('hielo') && r.permisos.includes('produccionActual'), 'Usuarios: al desmarcar «registrar» y marcar «reabrir» se guarda -hielo y hieloReabrir, y se conserva el resto');
  await H.cerrar();
  console.log(D.errores.length ? '\nErrores de página: ' + D.errores.slice(0, 3).join(' | ') : '');
  console.log(fallas ? '\n' + fallas + ' falla(s)' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
