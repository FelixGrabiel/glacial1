/* Descansos automáticos en el navegador real (49d + 49e + 49c) con un servidor simulado con las reglas de glacial_73 y Tiempo real entre dos equipos:
   supervisor de DÍA en celular y supervisor de NOCHE en PC → cada uno sortea su turno, ve el del otro al instante y en solo lectura; un cambio a mano
   aparece en el otro equipo en vivo; sin conexión queda en cola; publicar → Tareo con «Descanso» y columna DESC. en la convocatoria.
   Nombres FICTICIOS. Uso: GLX_LIBS=/ruta node tests/descansos.e2e.js   (GLX_CAPTURAS=/carpeta guarda capturas) */
'use strict';
const path = require('path'), fs = require('fs');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const espera = ms => new Promise(r => setTimeout(r, ms));
const sumar = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- servidor simulado (glacial_72 + glacial_73) ---------- */
const EQ = [['pet-dia', 'Equipo PET', 'DÍA', 'DÍA', '07:00', '19:00', 6, 8], ['b20l-int', 'Bidones 20L', 'DÍA', 'INTERMEDIO', '13:00', '22:00', 2, 3], ['pet-noche', 'PET', 'NOCHE', 'NOCHE', '21:00', '07:00', 4, 6]]
  .map(([id, nombre, columna, turno_base, hora_inicio, hora_fin, minimo_descanso, n], i) => ({ id, nombre, columna, turno_base, hora_inicio, hora_fin, minimo: 0, minimo_descanso, minimo_por_dia: null, dias_sin_operar: [], orden: i + 1, activo: true, n }));
const WORKERS = [];
EQ.forEach(e => { for (let i = 1; i <= e.n; i++) WORKERS.push({ id: 'w-' + e.id + '-' + i, nombre: 'Operario ' + e.nombre + ' ' + i, equipo: e.id }); });
WORKERS.push({ id: 'w-medico', nombre: 'Operario en descanso', equipo: '' });
function convDe(semana, anterior) {
  const asig = WORKERS.filter(w => w.equipo).map((w, i) => {
    let eq = w.equipo;
    if (anterior && w.id === 'w-pet-noche-6') eq = 'pet-dia';              // la semana pasada estaba de día → pasa a noche
    if (anterior && w.id === 'w-pet-dia-8') eq = 'pet-noche';              // la semana pasada estaba de noche → pasa a día
    return { id: i + 1, trabajador_id: w.id, nombre: w.nombre, equipo_id: eq, bloque: null, columna: EQ.find(e => e.id === eq).columna, orden: i + 1, hasta_fecha: null };
  });
  if (!anterior) asig.push({ id: 999, trabajador_id: 'w-medico', nombre: 'Operario en descanso', equipo_id: null, bloque: 'DESCANSO_MEDICO', columna: 'DÍA', orden: 1, hasta_fecha: sumar(semana, 2) });
  return asig;
}
const SRV = { semanas: new Map(), asig: [], eventos: new Map(), red: false, sec: 0 };
const paginas = [];
const notificar = () => setTimeout(() => paginas.forEach(pg => pg.evaluate(() => window.__notificar && window.__notificar()).catch(() => {})), 30);
function rpc(n, a) {
  if (SRV.red && !/obtener/.test(n)) return { error: { message: 'Failed to fetch', red: true } };
  const p = a.p || {};
  if (n === 'convocatoria_obtener') {
    const s = a.p_semana;
    return { data: { permisos: { ver: true, editar: true, jefe: false }, convocatoria: { id: 'c-' + s, semana_inicio: s, estado: 'PUBLICADA', version: 1, nuevo_semanas: 2 }, asignaciones: convDe(s, false),
      anterior: { convocatoria: { estado: 'PUBLICADA' }, asignaciones: convDe(sumar(s, -7), true) }, equipos: EQ, alias: {} }, error: null };
  }
  if (n === 'descansos_obtener') {
    const s = a.p_semana, sem = [...SRV.semanas.values()].filter(x => x.semana_inicio === s);
    return { data: { permisos: { ver: true, editar: true, jefe: false }, config: { semanas_historial: 8, medico_parcial: false }, semanas: sem.map(x => Object.assign({}, x)),
      asignaciones: SRV.asig.filter(x => sem.some(y => y.id === x.descansos_semana_id)).map(x => Object.assign({}, x, { turno: SRV.semanas.get(x.descansos_semana_id).turno })), historial: [], equipos: EQ }, error: null };
  }
  if (SRV.eventos.has(p.client_event_id)) return { data: SRV.eventos.get(p.client_event_id), error: null };
  const id = p.semana + '|' + p.turno;
  if (n === 'descansos_guardar') {
    let s = SRV.semanas.get(id);
    if (s && p.version !== undefined && p.version !== s.version) return { error: { message: 'descansos: otra persona cambió estos descansos; se recargó el cuadro', code: '40001' } };
    if (!s) { s = { id, semana_inicio: p.semana, turno: p.turno, version: 0 }; SRV.semanas.set(id, s); }
    Object.assign(s, { estado: 'PROPUESTA', semilla: p.semilla, version: s.version + 1, generado_en: new Date().toISOString(), generado_por: 'sup', publicado_por: null });
    SRV.asig = SRV.asig.filter(x => x.descansos_semana_id !== id).concat(p.asignaciones.map(x => Object.assign({ id: ++SRV.sec, descansos_semana_id: id, actualizado_por: 'sup' }, x, { dia: x.dia === null || x.dia === undefined ? null : x.dia })));
    SRV.eventos.set(p.client_event_id, s); notificar(); return { data: s, error: null };
  }
  if (n === 'descansos_mover') {
    const s = SRV.semanas.get(id), f = SRV.asig.find(x => x.descansos_semana_id === id && x.trabajador_id === p.trabajador_id);
    if (!f) return { error: { message: 'descansos: esa persona ya no está en el cuadro', code: 'P0002' } };
    SRV.movidas = (SRV.movidas || 0) + 1;
    Object.assign(f, { dia: p.dia, status: 'MANUAL', origen: 'MANUAL', motivo: p.motivo, actualizado_por: a.__quien || 'Sup Dia' }); s.version++;
    const res = { semana: s, asignacion: f }; SRV.eventos.set(p.client_event_id, res); notificar(); return { data: res, error: null };
  }
  if (n === 'descansos_estado') { const s = SRV.semanas.get(id); Object.assign(s, { estado: p.estado, publicado_por: 'Sup Dia', version: s.version + 1 }); notificar(); return { data: s, error: null }; }
  return { data: null, error: null };
}

(async () => {
  const H = await iniciar();
  const preparar = async (D, nombre, turno) => {
    const P = D.page; paginas.push(P);
    await P.exposeFunction('__rpc', (n, a) => rpc(n, a));
    await P.evaluate(([nombre, turno, workers]) => {
      document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
      state.user = { rol: 'Supervisor', nombre, username: nombre.toLowerCase().replace(/ /g, '.'), permisos: 'todos' }; state.showWelcome = false; window.alert = () => {};
      _workersReady = true; _workersCache = workers.map(w => ({ id: w.id, nombre: w.nombre, dni: '4' + w.id.length + '000000', estado: 'Activo' }));
      const m = document.getElementById('sup-modal'); if (m) m.remove();
      const oyentes = [];
      window.__notificar = () => oyentes.forEach(f => f());
      window.glacialSupabaseCliente = { rpc: (n, a) => window.__rpc(n, a), channel: () => { const ch = { on: (_t, _f, cb) => { oyentes.push(cb); return ch; }, subscribe: () => ch }; return ch; }, removeChannel: () => {} };
      window.glacialVentanaSupervisor = Object.assign({}, window.glacialVentanaSupervisor, { estado: () => ({ aplica: true, actual: { turno } }) });
      goDescansos();
    }, [nombre, turno, WORKERS]);
    await P.waitForSelector('#ds .ds-tab', { timeout: 8000 });
  };
  const CEL = await H.abrir(390, 844), PC = await H.abrir(1280, 900);
  await preparar(CEL, 'Sup Dia', 'Día'); await preparar(PC, 'Sup Noche', 'Noche');
  const D = CEL.page, N = PC.page;
  const SEM = await D.evaluate(() => glacialDescansosPantalla.estado.semana);
  ok(await D.evaluate(() => /Sin sortear/.test(document.querySelector('#ds .ds-cab').innerText) && /Sortear descansos \(día\)/.test(document.getElementById('ds').innerText))
     && await N.evaluate(() => /Sortear descansos \(noche\)/.test(document.getElementById('ds').innerText)), 'cada supervisor abre su turno «Sin sortear» con «Sortear descansos»');

  // los dos sortean a la vez
  await Promise.all([D.click('#ds [data-ds-sortear]'), N.click('#ds [data-ds-sortear]')]); await espera(900);
  const vd = await D.evaluate(() => { const r = glacialDescansosPantalla.resultado('DÍA'); return { n: r.asignaciones.length, sinDia: r.asignaciones.filter(a => a.status !== 'MEDICO' && a.dia === null).length, reglas: r.reglas.every(x => x.ok), x: document.querySelectorAll('#ds .ds-x td.d button').length, xs: [...document.querySelectorAll('#ds .ds-x td.d button')].filter(b => b.textContent === 'X').length, tit: document.querySelector('#ds .ds-x .tit').textContent }; });
  ok(vd.n === 12 && vd.sinDia === 0 && vd.reglas && vd.xs === 11 && /^DESCANSOS TURNO DÍA · SEMANA/.test(vd.tit), 'sorteo del día: cuadro con el formato del Excel, 11 X (una por operario) y las reglas cumplidas');
  const tabsN = await N.evaluate(() => [...document.querySelectorAll('#ds [data-ds-col]')].map(b => b.textContent.trim()).join('|'));
  ok(tabsN === 'Turno día · 11/11|Turno noche · 6/6', 'TIEMPO REAL: el de noche ve al instante el sorteo del día (' + tabsN + ')');
  const pn = await N.evaluate(() => { const r = glacialDescansosPantalla.resultado('NOCHE'), a = r.asignaciones.find(x => x.trabajadorId === 'w-pet-noche-6'); return { dia: a.dia, st: a.status, txt: [...document.querySelectorAll('#ds .ds-x td.st')].map(t => t.textContent).join('|') }; });
  ok(pn.dia === 0 && pn.st === 'PASA_NOCHE' && /Asignado · pasa a noche \(lunes fijo\)/.test(pn.txt), 'quien pasa de día a noche: lunes fijo («Asignado · pasa a noche (lunes fijo)»)');
  const vn = await D.evaluate(() => glacialDescansosPantalla.resultado('DÍA').asignaciones.find(x => x.trabajadorId === 'w-pet-dia-8'));
  ok(vn.dia !== 6 && vn.status === 'VIENE_NOCHE', 'quien pasa de noche a día: nunca domingo («viene de noche»)');
  ok(await D.evaluate(() => /Descanso médico hasta/.test(document.querySelector('#ds .ds-x').innerText) && document.querySelectorAll('#ds .ds-x td.d.gris').length === 7), 'descanso médico: fila gris sin X');
  ok(await D.evaluate(() => { const t = document.querySelector('#ds .ds-tt'); return !!t && /Equipo PET/.test(t.innerText) && /PET/.test(t.innerText) && t.querySelectorAll('td.dom').length >= 3; }), '«Personas trabajando por día» por equipo, los dos turnos, domingo resaltado');

  // solo su turno
  await D.click('#ds [data-ds-col="NOCHE"]');
  ok(await D.evaluate(() => [...document.querySelectorAll('#ds .ds-x td.d button')].every(b => b.disabled) && !document.querySelector('#ds [data-ds-sortear]')), 'el supervisor de día ve la noche en SOLO LECTURA');
  await D.click('#ds [data-ds-col="DÍA"]');

  // cambio a mano que rompe el mínimo de Bidones 20L → aviso, no bloquea; el otro equipo lo ve
  const b20 = await D.evaluate(() => { const r = glacialDescansosPantalla.resultado('DÍA'), l = r.asignaciones.filter(a => a.equipoId === 'b20l-int' && a.dia !== null && a.dia < 6); return { quien: l[0].trabajadorId, a: l[1].dia }; });
  await D.click(`#ds [data-ds-cel="${b20.quien}"][data-ds-dia="${b20.a}"]`); await espera(600);
  const mv = await D.evaluate(q => { const a = glacialDescansosPantalla.resultado('DÍA').asignaciones.find(x => x.trabajadorId === q); return { dia: a.dia, st: a.status, av: (document.querySelector('#ds .ds-av') || {}).innerText || '' }; }, b20.quien);
  ok(mv.dia === b20.a && mv.st === 'MANUAL' && /Tu cambio:.*Bidones 20L.*mínimo/.test(mv.av), 'tocar una celda mueve la X; si rompe una regla avisa (Bidones 20L bajo el mínimo) sin bloquear');
  await N.click('#ds [data-ds-col="DÍA"]'); await espera(200);
  ok(await N.evaluate(q => { const a = glacialDescansosPantalla.resultado('DÍA').asignaciones.find(x => x.trabajadorId === q); return a.status === 'MANUAL' && /Cambiado a mano/.test(document.querySelector('#ds .ds-x').innerText); }, b20.quien), 'TIEMPO REAL: el otro equipo ve el cambio a mano en vivo («Cambiado a mano»)');

  // sin conexión: queda en cola y se envía una sola vez
  SRV.red = true; const antes = SRV.movidas;
  const otro = await D.evaluate(() => glacialDescansosPantalla.resultado('DÍA').asignaciones.find(a => a.equipoId === 'pet-dia' && a.dia === 6).trabajadorId);
  await D.click(`#ds [data-ds-cel="${otro}"][data-ds-dia="2"]`); await espera(300);
  ok(await D.evaluate(() => JSON.parse(localStorage.getItem('glacial:descansos:cola') || '[]').length === 1 && /Sin conexión/.test(document.getElementById('ds').innerText)), 'sin conexión: el cambio queda en la cola del equipo y lo avisa');
  SRV.red = false; await D.evaluate(() => glacialDescansosPantalla.vaciar()); await espera(400);
  await D.evaluate(() => glacialDescansosPantalla.vaciar()); await espera(300);
  ok(SRV.movidas === antes + 1 && await D.evaluate(() => JSON.parse(localStorage.getItem('glacial:descansos:cola') || '[]').length === 0), 'al volver la conexión se envía una sola vez');

  // publicar → chip, Tareo con «Descanso» y convocatoria con DESC.
  await D.click('#ds [data-ds-publicar]'); await espera(500);
  ok(await D.evaluate(() => /Publicada/.test(document.querySelector('#ds .ds-chip').textContent)) && await N.evaluate(() => /Publicada/.test(document.querySelector('#ds .ds-chip').textContent)), 'publicar: «Publicada» en los dos equipos al instante');
  const quienLun = await D.evaluate(() => glacialDescansosPantalla.resultado('DÍA').asignaciones.find(a => a.dia === 1 && a.status !== 'MEDICO').trabajadorId);
  const tar = await D.evaluate(async ([q, sem]) => {
    const mar = glacialDescansos.sumarDias(sem, 1); await glacialConvocatoriaTareo.traer(mar);
    const r = obtenerPersonalPorRotacion(mar, 'Día'), x = r.personal.find(p => p.trabajadorId === q), y = r.personal.find(p => p.trabajadorId !== q && !p.estadoBloque);
    const px = tareoNuevaPersona(x, 'Producción'), py = tareoNuevaPersona(y, 'Producción');
    const marcaTrabaja = glacialDescansosDatos.marca(Object.assign({}, px, { asistencia: 'Asistió' }));
    return { desde: r.desdeConvocatoria, ax: px.asistencia, ay: py.asistencia || '', marca: marcaTrabaja };
  }, [quienLun, SEM]);
  ok(tar.desde && tar.ax === 'Descanso' && tar.ay !== 'Descanso' && /Trabaja en su descanso/.test(tar.marca), 'Tareo: quien descansa ese día entra con «Descanso»; si trabaja en su descanso se marca «Trabaja en su descanso»');
  const conv = await N.evaluate(async () => {
    goConvocatoria(); await glacialConvocatoriaPantalla.cargar(); const cv = glacialConvocatoriaPantalla.canvasImagen();
    const S = glacialConvocatoriaPantalla.estado, d = S.datos, map = glacialDescansos.mapaDias(glacialDescansosDatos.publicados(S.semana));
    const conv = { semana: S.semana, asignaciones: d.asignaciones.map(x => ({ trabajadorId: x.trabajador_id, equipoId: x.equipo_id || '', bloque: x.bloque || '', columna: x.columna, orden: x.orden, hasta: x.hasta_fecha || '' })) };
    const eqs = glacialConvocatoria.equiposDe(d.equipos.map(e => ({ id: e.id, nombre: e.nombre, columna: e.columna, turnoBase: e.turno_base, inicio: e.hora_inicio, fin: e.hora_fin, minimo: e.minimo, orden: e.orden })));
    const mod = glacialConvocatoria.modeloImagen(conv, eqs, [], null, eqs, 2, map);
    return { w: cv.width, tit: mod.titulo, desc: mod.dia[0].filas.map(f => f.desc), noche: mod.noche[0].filas.map(f => f.desc) };
  });
  ok(conv.w === 2880 && / · CON DESCANSOS$/.test(conv.tit) && conv.desc.every(x => /^(LUN|MAR|MIÉ|JUE|VIE|SÁB|DOM)$/.test(x)) && conv.noche.every(x => x === ''), 'convocatoria: la imagen sale «CON DESCANSOS» y la columna DESC. con el día de cada persona del turno publicado (noche aún sin publicar: vacía)');
  await N.evaluate(() => goDescansos()); await N.waitForSelector('#ds .ds-tab');

  // exportar e imagen
  const png = await D.evaluate(() => { const c = glacialDescansosPantalla.canvasCuadro(glacialDescansosPantalla.resultado('DÍA')); return { w: c.width, h: c.height, url: c.toDataURL('image/png') }; });
  ok(png.w > 2400 && png.h > 900, 'imagen PNG del cuadro (mismo look del Excel) en alta resolución');
  if (process.env.GLX_CAPTURAS) {
    fs.writeFileSync(path.join(process.env.GLX_CAPTURAS, 'descansos-cuadro.png'), Buffer.from(png.url.split(',')[1], 'base64'));
    await D.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'descansos-celular.png'), fullPage: true });
    await N.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'descansos-pc.png'), fullPage: true });
  }
  ok(await D.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.getElementById('ds').getBoundingClientRect().right <= window.innerWidth + 1 && [...document.querySelectorAll('#ds .ds-b, #ds .ds-card')].every(x => x.getBoundingClientRect().right <= window.innerWidth + 1) && document.querySelector('#ds .ds-x').closest('.ds-scroll').scrollWidth > document.querySelector('#ds .ds-x').closest('.ds-scroll').clientWidth), 'celular (390 px): sin desborde lateral; el cuadro se desliza dentro de su recuadro');
  ok(!CEL.errores.length && !PC.errores.length, 'sin errores en las páginas' + (CEL.errores.concat(PC.errores).length ? ': ' + CEL.errores.concat(PC.errores).slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
