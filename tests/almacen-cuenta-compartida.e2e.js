/* Almacén › cuenta compartida en un navegador de verdad. Uso: GLX_LIBS=/ruta node tests/almacen-cuenta-compartida.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1400, 950); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none';
    try { sessionStorage.clear(); localStorage.clear(); } catch (_) { /* sin almacenamiento */ }
    // la cuenta compartida: rol almacen_compartido con permisos fijos
    state.user = { rol: 'almacen_compartido', nombre: 'Almacén (compartida)', username: 'almacen', permisos: ['moduloAlmacen'] }; state.showWelcome = false;
    const hoy = GlacialFecha.fechaOperativa(), t = Date.now();
    _paletasCache = [{ id: 'pal_1', linea: 'PET1', fecha: hoy, turno: 'DÍA', marca: 'Scala', presentacion: '2.5 L', hora: '10:20', tipoPaleta: 'COMPLETA', paletas: 2, totalUnidades: 2400, usuario: 'Yeikari M.', creadoEn: t - 360000, actualizadoEn: t - 360000 }];
    const stores = { almacenPtRecepcion: [], almaceneros: [{ id: 'a1', nombre: 'Luis Ramos', activo: true }, { id: 'a2', nombre: 'Rosa Vega', activo: true }, { id: 'a3', nombre: 'Inactivo Pérez', activo: false }] };
    const oy = { almacenPtRecepcion: [], almaceneros: [] };
    const emitir = n => oy[n].forEach(cb => cb({ docs: stores[n].map(d => ({ data: () => d })) }));
    window.__stores = stores; window.__escrituras = [];
    const orig = db.collection.bind(db);
    db.collection = nombre => stores[nombre] ? ({
      onSnapshot: cb => { oy[nombre].push(cb); cb({ docs: stores[nombre].map(d => ({ data: () => d })) }); return () => {}; },
      doc: id => ({ set: async d => { window.__escrituras.push({ nombre, id, d }); const i = stores[nombre].findIndex(x => (x.opId || x.id) === id); const g = Object.assign({}, d); if (i >= 0) stores[nombre][i] = g; else stores[nombre].push(g); emitir(nombre); } }) }) : orig(nombre);
    document.getElementById('report-select-screen').style.display = 'flex'; document.getElementById('app-screen').style.display = 'none';
    enterApp();
  });
  await P.waitForSelector('#alm-id-overlay', { timeout: 6000 });
  const menu = await P.evaluate(() => { const vis = e => e && e.style.display !== 'none' && !e.hidden; return { visibles: [...document.querySelectorAll('#glacial-sidebar .side-action')].filter(vis).map(b => b.id), grupos: [...document.querySelectorAll('#glacial-sidebar .sidebar-group')].filter(vis).map(g => g.id), seleccion: document.getElementById('report-select-screen').style.display, app: document.getElementById('app-screen').style.display, tab: state.currentTab }; });
  ok(menu.visibles.join() === 'btn-almacen-pt' && menu.grupos.join() === 'sidebar-group-almacen', 'el menú de la cuenta compartida solo tiene «Almacén › Producto terminado» (' + menu.visibles + ')');
  ok(menu.seleccion === 'none' && menu.app === 'block' && menu.tab === 'almacen-pt', 'entra directo a Producto terminado, sin la selección de reporte');
  ok(await P.evaluate(() => getComputedStyle(document.querySelector('.topbar-hielo')).display === 'none'), 'no ve el botón de Reporte Hielo');
  const lista = await P.evaluate(() => [...document.querySelectorAll('#alm-id-overlay .ai-b')].map(b => b.innerText.replace(/\s+/g, ' ')));
  ok(lista.length === 2 && /Luis Ramos/.test(lista[0]) && /Rosa Vega/.test(lista[1]) && lista.every(x => /crear PIN/.test(x)), '«¿Quién eres?» ofrece solo los 2 almaceneros activos (el desactivado no)');
  ok(await P.evaluate(() => /Identifícate con tu PIN/.test(document.querySelector('.pt').innerText) && !document.querySelector('.pt-b-v')) || await P.evaluate(() => /Identifícate/.test(document.body.innerText)), 'sin identificarse no se puede recibir');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/almacen-quien.png' });
  await P.evaluate(() => alElegir('a1'));
  await P.fill('#alm-pin', '1234'); await P.fill('#alm-pin2', '1234'); await P.evaluate(() => alConfirmar()); await P.waitForTimeout(200);
  ok(/muy fácil de adivinar/.test(await P.evaluate(() => document.querySelector('#alm-id-overlay').innerText)), 'un PIN fácil (1234) se rechaza');
  await P.fill('#alm-pin', '4827'); await P.fill('#alm-pin2', '4820'); await P.evaluate(() => alConfirmar()); await P.waitForTimeout(200);
  ok(/no coinciden/.test(await P.evaluate(() => document.querySelector('#alm-id-overlay').innerText)), 'los dos PIN deben coincidir');
  await P.fill('#alm-pin', '4827'); await P.fill('#alm-pin2', '4827'); await P.evaluate(() => alConfirmar()); await P.waitForTimeout(1200);
  const pinGuardado = await P.evaluate(() => window.__escrituras.find(e => e.nombre === 'almaceneros'));
  ok(pinGuardado && pinGuardado.id === 'a1' && pinGuardado.d.hash && pinGuardado.d.salt && !JSON.stringify(pinGuardado.d).includes('4827') && pinGuardado.d.nombre === 'Luis Ramos', 'al crear el PIN se guarda solo su hash con sal (nunca el PIN) en su ficha');
  ok(!(await P.evaluate(() => !!document.getElementById('alm-id-overlay'))) && /Luis Ramos/.test(await P.evaluate(() => document.getElementById('alm-persona') ? document.getElementById('alm-persona').innerText : '')), 'queda identificada la persona y se ve su nombre arriba');
  await P.evaluate(() => ptAccion('pal_1', 'RECIBIDA')); await P.evaluate(() => ptConfirmar('pal_1')); await P.waitForTimeout(300);
  const rec = await P.evaluate(() => window.__escrituras.find(e => e.nombre === 'almacenPtRecepcion'));
  ok(rec && rec.d.opId === 'pal_1_R1' && rec.d.almacenero && rec.d.almacenero.id === 'a1' && rec.d.almacenero.nombre === 'Luis Ramos', 'la recepción guarda qué almacenero la hizo (id y nombre)');
  ok(/Luis Ramos/.test(await P.evaluate(() => { ptTab('recibidas'); return document.querySelector('.pt-t') ? document.querySelector('.pt-t').innerText : ''; })), 'en «Recibidas» se ve quién recibió');
  ok(!(await P.evaluate(() => [...document.querySelectorAll('.pt-tab')].some(t => /Almaceneros/.test(t.innerText)))), 'la cuenta compartida no ve la administración de almaceneros');
  // cambiar de persona y probar PIN incorrecto con bloqueo
  await P.evaluate(() => { glacialAlmaceneros.cerrarIdentificacion(); glacialAlmaceneros.abrirIdentificacion(); alElegir('a1'); });
  for (let i = 0; i < 5; i++) { await P.fill('#alm-pin', '9999'); await P.evaluate(() => alConfirmar()); await P.waitForTimeout(700); }
  ok(/Espera \d+ min/.test(await P.evaluate(() => document.querySelector('#alm-id-overlay').innerText)), 'después de 5 PIN incorrectos se bloquea a esa persona unos minutos');
  await P.evaluate(() => alVolver());
  await P.evaluate(() => alElegir('a1')); ok(await P.evaluate(() => document.getElementById('alm-pin').disabled), 'durante el bloqueo no se puede escribir el PIN');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/almacen-bloqueo.png' });
  // un usuario normal con permiso de Almacén administra la lista
  await P.evaluate(() => { glacialAlmaceneros.cerrarIdentificacion(); document.getElementById('alm-id-overlay') && document.getElementById('alm-id-overlay').remove(); state.user = { rol: 'Administrador', nombre: 'Ana', username: 'admin', permisos: 'todos' }; document.body.classList.remove('alm-compartido'); state.currentTab = 'almacen-pt'; renderSidebar(); renderMain(); });
  await P.waitForSelector('.pt-tabs');
  await P.evaluate(() => ptTab('almaceneros'));
  ok(/Luis Ramos/.test(await P.evaluate(() => document.querySelector('.pt').innerText)) && /Reiniciar PIN/.test(await P.evaluate(() => document.querySelector('.pt').innerText)), 'un usuario con permiso de Almacén ve la lista de almaceneros con «Reiniciar PIN»');
  await P.evaluate(() => { alNombre('Pedro Soto'); return alAgregar(); }); await P.waitForTimeout(300);
  ok(await P.evaluate(() => window.__stores.almaceneros.some(a => a.nombre === 'Pedro Soto' && a.activo === true)), 'se puede agregar un almacenero');
  await P.evaluate(() => alReiniciar('a1')); await P.waitForTimeout(300);
  ok(await P.evaluate(() => { const a = window.__stores.almaceneros.find(x => x.id === 'a1'); return !a.hash && !a.salt && a.nombre === 'Luis Ramos'; }), 'Reiniciar PIN borra su hash y su sal para que cree uno nuevo');
  if (process.env.GLX_CAPTURAS) await P.screenshot({ path: process.env.GLX_CAPTURAS + '/almacen-almaceneros.png' });
  ok(D.errores.length === 0, 'sin errores de consola' + (D.errores.length ? ' → ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar(); console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
