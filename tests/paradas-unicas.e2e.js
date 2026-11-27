/* Una sola parada, vista por marca (35p-paradas-unicas.js) en el navegador real: el cuadro de Nuevo registro ya no tiene tablas propias,
   muestra las paradas de su marca y «+ Parada» abre el formulario único con esa marca; lo guardado aparece en el cuadro y en
   «Paradas del turno» de Avance y Cierre. Uso: GLX_LIBS=/ruta node tests/paradas-unicas.e2e.js  (GLX_CAPTURAS=/carpeta guarda capturas) */
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
    state.user = { rol: 'Administrador', nombre: 'Admin', username: 'admin', permisos: 'todos' }; state.showWelcome = false; window._recordsReady = true;
    window.alert = () => {}; window.confirm = () => true;
    state.currentLine = 'B7L'; state.currentTab = 'nuevo'; state.viewingRecordId = null;
    draft = null; renderMain();
  });
  await P.waitForTimeout(300);
  await P.evaluate(() => {
    const q = draft.cuadros[0], marcas = (MARCAS_POR_LINEA && MARCAS_POR_LINEA.B7L) || ['Scala'], pres = (PRESENTACIONES_POR_LINEA && PRESENTACIONES_POR_LINEA.B7L || ['7L'])[0];
    q.marca = marcas[0]; q.presentacion = pres; window.__m = { marca: q.marca, pres }; if (!draft.id) draft.id = 'rec_prueba';
    // una parada escrita antes en el cuadro (sigue en la lista única) y una fila vacía (no se muestra)
    q.paradasNoProgramadas = [{ id: 'pr_viejo', descripcion: 'Falla de etiquetadora', tiempoMin: 12, causa: 'Mecánica' }, { id: 'pr_vacio', descripcion: '', tiempoMin: 0, causa: '' }];
    q.paradasProgramadas = [];
    // servidor falso: sync/avancesTurno y sync/records
    window.__av = { paradasOperativas: [], updatedAt: 1000 };
    avRef = () => ({ id: 'avancesTurno', get: async () => ({ exists: true, data: () => JSON.parse(JSON.stringify(window.__av)) }), onSnapshot(){ return () => {}; } });
    avanceEstado.avancesUpdatedAt = 1000;
    db.runTransaction = async fn => { let nuevo = null; const tx = { get: async ref => ({ exists: true, data: () => (ref.id === 'avancesTurno' || ref._id === 'avancesTurno' ? JSON.parse(JSON.stringify(window.__av)) : { items: [JSON.parse(JSON.stringify(draft))], updatedAt: avanceEstado.recordsUpdatedAt || 0 }) }), set: (ref, d) => { if ((ref.id || ref._id) === 'avancesTurno') nuevo = d; } };
      const r = await fn(tx); if (nuevo) window.__av = Object.assign({}, window.__av, JSON.parse(JSON.stringify(nuevo))); return r; };
    // el borrador abierto es el registro guardado de este turno (en planta se guarda solo a los segundos)
    loadRecordsOficiales = () => [draft]; loadRecords = () => [draft];
    renderFormTab();
  });
  await P.waitForTimeout(200);
  const c0 = await P.evaluate(() => { const e = document.querySelector('#reg-cuadro-0 .pu') || document.querySelector('.pu[data-pu-cuadro="0"]'); return { t: e ? e.innerText.replace(/\s+/g, ' ') : '', viejas: document.querySelectorAll('#reg-cuadro-0 [onclick*="addParadaCuadro"]').length }; });
  ok(/Paradas de/.test(c0.t) && /Falla de etiquetadora/.test(c0.t) && /escrita en el registro/.test(c0.t) && /1 · 12 min/.test(c0.t), 'el cuadro muestra sus paradas (la escrita antes sigue en la lista; la fila vacía no): ' + c0.t.slice(0, 120));
  ok(c0.viejas === 0 && /\+ Parada/.test(c0.t) && /Editar/.test(c0.t), 'ya no hay tablas de paradas propias en el cuadro: solo «+ Parada» y «Editar»');
  if (process.env.GLX_CAPTURAS) { const el = await P.$('.pu[data-pu-cuadro="0"]'); if (el) await el.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'registro-paradas.png') }); }
  // «+ Parada» → formulario único con la marca del cuadro
  await P.click('.pu[data-pu-cuadro="0"] button:has-text("+ Parada")');
  await P.waitForSelector('#av-paradas-modal.open', { timeout: 5000 });
  const fila = await P.evaluate(() => { const f = avanceEstado.paradasModal.filas; return { n: f.length, ult: f[f.length - 1], reg: f.some(x => x.origen === 'REGISTRO' && /etiquetadora/.test(x.descripcion)) }; });
  ok(fila.ult && fila.ult.nueva && fila.ult.marca === (await P.evaluate(() => window.__m.marca)), '«+ Parada» abre el formulario único con una fila nueva de la marca del cuadro');
  ok(fila.reg, 'en el formulario único también está la parada escrita antes en el cuadro (una sola lista)');
  // se completa y se guarda (programada: Refrigerio 30 min)
  await P.evaluate(() => { const m = avanceEstado.paradasModal, i = m.filas.length - 1; avParadaCampo(i, 'tipo', 'PROGRAMADA'); m.filas[i].descripcion = 'Refrigerio'; m.filas[i].minutos = 30; avParadaHora(i, 'horaInicio', '12:30'); });
  await P.click('#av-paradas-modal footer button:has-text("Guardar paradas")');
  await P.waitForFunction(() => !document.querySelector('#av-paradas-modal.open'), null, { timeout: 6000 }).catch(() => {});
  ok(await P.evaluate(() => window.__av.paradasOperativas.some(p => p.descripcion === 'Refrigerio' && p.marca === window.__m.marca && p.presentacion === window.__m.pres)), 'se guarda UNA vez (en la lista única) con su marca y presentación');
  await P.waitForTimeout(300);
  if (process.env.GLX_DEPURAR) console.log(await P.evaluate(() => JSON.stringify({ v1: draft.autollenadoV1, ops: (paradasOperativasActuales() || []).length, av: __autollenadoInternos.paradasAvance().length, cu: __autollenadoInternos.paradasAvance().map(p => __autollenadoInternos.cuadroDeAvance(p)), t: draft.turno, f: draft.fecha, pt: __autollenadoInternos.paradasAvance().map(p => [p.turno, p.fecha]) })));
  const c1 = await P.evaluate(() => (document.querySelector('.pu[data-pu-cuadro="0"]') || {}).innerText || '');
  ok(/Refrigerio/.test(c1) && /2 · 42 min/.test(c1.replace(/\s+/g, ' ')) && await P.evaluate(() => draft.cuadros[0].paradasProgramadas.some(r => r.auto && r.descripcion === 'Refrigerio' && r.tiempoMin === 30)), 'aparece sola en el cuadro de su marca (y cuenta en sus horas efectivas)');
  // Avance y Cierre: «Paradas del turno», todas juntas con su marca
  await P.evaluate(() => { avanceEstado.fecha = draft.fecha; avanceEstado.turno = avTurnoCanon(draft.turno); avanceEstado.paradasOperativas = window.__av.paradasOperativas; state.currentTab = 'avance-produccion'; renderMain(); setTimeout(() => { try{ avDibujar(); }catch(_){ } }, 50); });
  await P.waitForSelector('#pu-avance', { timeout: 6000 }).catch(() => {});
  const av = await P.evaluate(() => (document.getElementById('pu-avance') || {}).innerText || '');
  ok(/Paradas del turno/.test(av) && /12:30 Refrigerio/.test(av) && /Falla de etiquetadora/.test(av) && /Total 42 min/.test(av), 'Avance y Cierre: «Paradas del turno» con todas (la del registro y la nueva), por hora y con total');
  if (process.env.GLX_CAPTURAS) { const el = await P.$('#pu-avance'); if (el) await el.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'avance-paradas.png') }); }
  const errores = D.errores.filter(e => !/Guardado de "reportes" bloqueado|Error guardando avance|reportes/.test(e));
  ok(errores.length === 0, 'sin errores en la página' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
