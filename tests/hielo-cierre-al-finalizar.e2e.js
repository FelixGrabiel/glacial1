/* Hielo · al finalizar, «Avance y cierre» muestra el CIERRE con lo guardado aunque el aviso en tiempo real no llegue (24/11/2026),
   y a las 20:30 (turno Noche sin reporte) abre el último turno con reporte. Uso: GLX_LIBS=/ruta node tests/hielo-cierre-al-finalizar.e2e.js */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1300, 950); const P = D.page;
  await P.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false;
    window.__hoy = GlacialFecha.fechaOperativa();
    goReporteHielo('CUBOS');
  });
  await P.waitForTimeout(1200);
  await P.evaluate(() => {
    const hoy = window.__hoy, d = glacialHieloDatos;
    // Base simulada: guarda en memoria y NUNCA avisa en tiempo real (como cuando el aviso se pierde).
    const servidor = {};
    const viejo = { id: hoy + '_DÍA', fecha: hoy, turno: 'DÍA', estado: 'EN_REGISTRO', rev: 3, supervisor: 'Admin', horaInicio: '07:00', horaFin: '19:00', produccion: [{ marca: 'Glacial', presentacion: '3 kg', bolsas: 100, estacion: 'Tolva manual', horas: 4, vence: '2027-11-24' }], paradas: [], mermas: [], observaciones: '', personas: 3, personal: ['Ana', 'Luis', 'Rosa'], historial: [] };   // completo: al finalizar son obligatorios (24/11/2026)
    servidor[viejo.id] = JSON.parse(JSON.stringify(viejo));
    window.__dbOriginal = { collection: db.collection, runTransaction: db.runTransaction };
    db.collection = c => ({ doc: id => ({ _id: id, _c: c }), where: () => ({ get: async () => ({ docs: Object.values(servidor).map(x => ({ data: () => JSON.parse(JSON.stringify(x)) })) }), onSnapshot: () => () => {} }) });
    Object.assign(db, { runTransaction: async fn => fn({ get: async ref => ({ exists: !!servidor[ref._id], data: () => JSON.parse(JSON.stringify(servidor[ref._id])) }), set: (ref, doc) => { servidor[ref._id] = JSON.parse(JSON.stringify(doc)); } }) });
    window.__servidor = servidor;
    d.cache.reportes = [JSON.parse(JSON.stringify(viejo))]; d.cache.listo = { reportes: true, programacion: true, config: true };
    hlAbrir(hoy, 'DÍA');
  });
  await P.waitForSelector('.hl-ed');
  // completar la producción y finalizar
  const r = await P.evaluate(async () => {
    hlCampo('produccion', 0, 'bolsas', '4339'); hlCampo('produccion', 0, 'horas', '11');   // 27/11/2026: el tiempo suma la jornada (07:00–19:00 − 1 h = 11 h)
    await hlGuardar('FINALIZAR');
    return { serv: window.__servidor[window.__hoy + '_DÍA'], cache: glacialHieloDatos.cache.reportes.find(x => x.id === window.__hoy + '_DÍA'), msg: (document.querySelector('.hl-msg') || {}).innerText || '' };
  });
  ok(r.serv.estado === 'FINALIZADO' && r.serv.produccion[0].bolsas === 4339, 'el reporte se finaliza en el servidor con 4 339 bolsas');
  ok(r.cache.estado === 'FINALIZADO' && r.cache.produccion[0].bolsas === 4339, 'la copia de la página se actualiza al momento, sin esperar el aviso en tiempo real');
  await P.evaluate(() => hlVista('avance'));
  await P.waitForSelector('#hl-av-texto');
  const t = await P.evaluate(() => ({ texto: document.getElementById('hl-av-texto').value, etiqueta: document.querySelector('.hl-sub').innerText }));
  ok(/^Cierre de produccion HIELO/.test(t.texto) && /CIERRE · todos los reportes finalizados/.test(t.etiqueta), '«Avance y cierre» muestra CIERRE → ' + t.texto.split('\n')[0]);
  ok(/4[.,]?339/.test(t.texto), 'con lo último guardado (4 339 bolsas), no con lo anterior');
  // A las 20:30 (turno Noche sin reporte) y sin haber finalizado en esta sesión: abre el último turno con reporte.
  await P.evaluate(() => { const d = glacialHieloDatos; GlacialFecha.turnoActual = () => 'NOCHE'; hlAvSet('aFecha', ''); });
  await P.evaluate(() => { hlAvSet('aTurno', ''); });
  const t2 = await P.evaluate(() => ({ texto: document.getElementById('hl-av-texto').value, turno: document.querySelectorAll('.hl-filtros select')[0].value }));
  ok(t2.turno === 'DI' && /^Cierre de produccion HIELO D\+I/.test(t2.texto), 'en la noche sin reporte, abre el Día recién cerrado (D+I) y no un turno vacío');
  const errores = D.errores.filter(e => !/Guardado de|Error guardando/.test(e));
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
