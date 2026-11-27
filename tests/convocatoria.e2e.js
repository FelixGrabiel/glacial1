/* Convocatoria semanal en el navegador real (49b + 49c) con un servidor simulado con las reglas de glacial_72 y Tiempo real entre dos equipos:
   supervisor de DÍA en celular y supervisor de NOCHE en PC editando a la vez → cada uno ve los cambios del otro sin recargar y nada se pierde.
   También: solo edita su turno, mover con ⋮, cola sin conexión, publicar e imagen de WhatsApp, Tareo prellenado con equipo y horario.
   Uso: GLX_LIBS=/ruta node tests/convocatoria.e2e.js   (GLX_CAPTURAS=/carpeta guarda capturas) */
'use strict';
const path = require('path'), fs = require('fs');
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const espera = ms => new Promise(r => setTimeout(r, ms));

/* ---------- servidor simulado (glacial_72) ---------- */
const EQ = [['pet-dia', 'Equipo PET', 'DÍA', 'DÍA', '07:00', '19:00', 3], ['b20l-int', 'Bidones 20L', 'DÍA', 'INTERMEDIO', '13:00', '22:00', 4], ['pet-noche', 'PET', 'NOCHE', 'NOCHE', '21:00', '07:00', 2]]
  .map(([id, nombre, columna, turno_base, hora_inicio, hora_fin, minimo], i) => ({ id, nombre, columna, turno_base, hora_inicio, hora_fin, minimo, orden: i + 1, activo: true }));
const SRV = { conv: new Map(), asig: [], eventos: new Map(), sec: 0, red: false };
const paginas = [];
function rpc(n, a) {
  if (SRV.red && n !== 'convocatoria_obtener') return { error: { message: 'Failed to fetch', red: true } };
  const p = a.p || {};
  const conv = s => { if (!SRV.conv.has(s)) SRV.conv.set(s, { id: 'c-' + s, semana_inicio: s, estado: 'BORRADOR', version: 0, nuevo_semanas: 2 }); return SRV.conv.get(s); };
  const toca = c => { c.version++; setTimeout(() => paginas.forEach(pg => pg.evaluate(() => window.__notificar && window.__notificar()).catch(() => {})), 30); };
  if (n === 'convocatoria_obtener') {
    const c = SRV.conv.get(a.p_semana) || null;
    return { data: { permisos: { ver: true, editar: true, jefe: false }, convocatoria: c, asignaciones: c ? SRV.asig.filter(x => x.convocatoria_id === c.id) : [], anterior: null, equipos: EQ, alias: {} }, error: null };
  }
  if (n === 'convocatoria_asignar') {
    if (SRV.eventos.has(p.client_event_id)) return { data: SRV.eventos.get(p.client_event_id), error: null };
    const c = conv(p.semana); let fila = null;
    const eq = EQ.find(e => e.id === p.equipo_id);
    if (p.accion === 'poner') {
      if (SRV.asig.some(x => x.convocatoria_id === c.id && x.trabajador_id === p.trabajador_id && (x.equipo_id || x.bloque) === (p.equipo_id || p.bloque))) return { error: { message: 'convocatoria: esa persona ya está en ese equipo', code: '23505' } };
      fila = { id: ++SRV.sec, convocatoria_id: c.id, trabajador_id: p.trabajador_id, nombre: p.nombre, equipo_id: p.equipo_id || null, bloque: p.bloque || null, columna: eq ? eq.columna : (p.columna || 'DÍA'), orden: SRV.asig.filter(x => x.convocatoria_id === c.id && x.equipo_id === p.equipo_id).length + 1, hasta_fecha: p.hasta_fecha || null };
      SRV.asig.push(fila);
    } else if (p.accion === 'mover') {
      fila = SRV.asig.find(x => x.id === p.id); if (!fila) return { error: { message: 'convocatoria: esa persona ya no está ahí', code: 'P0002' } };
      Object.assign(fila, { equipo_id: p.equipo_id || null, bloque: p.bloque || null, columna: eq ? eq.columna : (p.columna || 'DÍA'), hasta_fecha: p.hasta_fecha || null });
    } else if (p.accion === 'quitar') { SRV.asig = SRV.asig.filter(x => x.id !== p.id); }
    toca(c); const res = { convocatoria: c, asignacion: fila }; SRV.eventos.set(p.client_event_id, res); return { data: res, error: null };
  }
  if (n === 'convocatoria_estado') { const c = conv(p.semana); c.estado = p.estado; c.publicada_por = 'sup.dia'; c.publicada_en = new Date().toISOString(); toca(c); return { data: c, error: null }; }
  if (n === 'trabajador_alias_guardar') return { data: p, error: null };
  return { data: null, error: null };
}

(async () => {
  const H = await iniciar();
  const preparar = async (D, nombre, turno) => {
    const P = D.page; paginas.push(P);
    await P.exposeFunction('__rpc', (n, a) => rpc(n, a));
    await P.evaluate(([nombre, turno]) => {
      document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
      state.user = { rol: 'Supervisor', nombre, username: nombre.toLowerCase().replace(/ /g, '.'), permisos: 'todos' }; state.showWelcome = false; window.alert = () => {};
      _workersCache = Array.from({ length: 12 }, (_, i) => ({ id: 'w' + (i + 1), nombre: 'Operario ' + (i + 1), dni: i === 4 ? '' : String(41000000 + i), estado: 'Activo', fechaIngreso: i === 2 ? '2026-11-20' : '2024-03-01', area: 'Producción' }));
      const oyentes = [];
      window.__notificar = () => oyentes.forEach(f => f());
      window.glacialSupabaseCliente = { rpc: (n, a) => window.__rpc(n, a), channel: () => { const ch = { on: (_t, _f, cb) => { oyentes.push(cb); return ch; }, subscribe: () => ch }; return ch; }, removeChannel: () => {} };
      window.glacialVentanaSupervisor = Object.assign({}, window.glacialVentanaSupervisor, { estado: () => ({ aplica: true, actual: { turno } }) });
      goConvocatoria();
    }, [nombre, turno]);
    await P.waitForSelector('#cv .cv-eq', { timeout: 8000 });
  };
  const CEL = await H.abrir(390, 844), PC = await H.abrir(1280, 900);
  await preparar(CEL, 'Sup Dia', 'Día'); await preparar(PC, 'Sup Noche', 'Noche');
  const D = CEL.page, N = PC.page;
  const tabs = P => P.evaluate(() => [...document.querySelectorAll('#cv [data-cv-col]')].map(b => b.textContent.trim()));
  ok((await tabs(D)).join('|') === 'Turno día · 0|Turno noche · 0', 'las dos pantallas abren la semana vacía (pestañas Turno día / Turno noche con su total)');
  ok(await D.evaluate(() => /Editas el turno día/.test(document.querySelector('#cv .cv-cab').innerText)) && await N.evaluate(() => /Editas el turno noche/.test(document.querySelector('#cv .cv-cab').innerText)), 'cada supervisor edita su turno (según la rotación de supervisores)');

  // supervisor de DÍA (celular) agrega dos personas a PET
  const agregar = async (P, eq, quien) => { await P.click(`#cv [data-cv-agregar="${eq}"]`); await P.waitForSelector('#cv-modal #cv-q'); await P.fill('#cv-modal #cv-q', quien); await P.click(`#cv-modal [data-cv-elige]`); await espera(250); };
  await agregar(D, 'pet-dia', 'Operario 1'); await agregar(D, 'pet-dia', 'Operario 3');
  // a la vez, supervisor de NOCHE (PC) agrega en PET noche
  await N.click('#cv [data-cv-col="NOCHE"]'); await agregar(N, 'pet-noche', 'Operario 7');
  await espera(600);
  ok((await tabs(N)).join('|') === 'Turno día · 2|Turno noche · 1' && (await tabs(D)).join('|') === 'Turno día · 2|Turno noche · 1', 'TIEMPO REAL: el de noche ve al instante las 2 personas que agregó el de día y viceversa (nada se pierde)');
  const pet = await D.evaluate(() => document.querySelector('#cv [data-cv-equipo="pet-dia"]').innerText);
  ok(/2 \/ 3/.test(pet) && /Operario 3\s*NUEVO/.test(pet), 'tarjeta del equipo con «actual / mínimo» (2 / 3) y NUEVO automático (ingreso reciente)');
  ok(await D.evaluate(() => /Bidones 20L \(día\): 0 de 4 mínimos/.test(document.querySelector('#cv .cv-avisos').innerText)), 'aviso amarillo: equipo por debajo del mínimo');
  // el de día no puede editar la noche
  await D.click('#cv [data-cv-col="NOCHE"]');
  ok(await D.evaluate(() => !document.querySelector('#cv [data-cv-agregar]') && !document.querySelector('#cv [data-cv-menu]')), 'el supervisor de día ve la noche en SOLO LECTURA');
  await D.click('#cv [data-cv-col="DÍA"]');
  // mover con ⋮ → Bidones 20L
  await D.click('#cv [data-cv-equipo="pet-dia"] [data-cv-menu]'); await D.click('#cv [data-cv-mover][data-cv-a="b20l-int"]'); await espera(500);
  ok(await N.evaluate(() => { const a = glacialConvocatoriaPantalla.estado.datos.asignaciones; return a.filter(x => x.equipo_id === 'b20l-int').length === 1; }), '⋮ → «Mover a…» Bidones 20L: el otro equipo lo ve movido');
  // sin conexión: queda en cola y se envía al volver
  SRV.red = true; await agregar(D, 'pet-dia', 'Operario 5'); await espera(300);
  const enCola = await D.evaluate(() => JSON.parse(localStorage.getItem('glacial:convocatoria:cola') || '[]').length);
  ok(enCola === 1 && await D.evaluate(() => /Sin conexión|por enviar/.test(document.getElementById('cv').innerText)), 'sin conexión: el cambio queda en la cola del equipo y lo avisa');
  SRV.red = false; await D.evaluate(() => glacialConvocatoriaPantalla.vaciar()); await espera(500);
  ok(await D.evaluate(() => JSON.parse(localStorage.getItem('glacial:convocatoria:cola') || '[]').length === 0) && (await tabs(N))[0] === 'Turno día · 3', 'al volver la conexión se envía una sola vez y el otro equipo lo ve (sin duplicar)');
  ok(await D.evaluate(() => /no tiene DNI/.test(document.querySelector('#cv .cv-avisos').innerText)), 'aviso: persona sin DNI');
  // publicar → imagen
  await D.click('#cv [data-cv-estado="PUBLICADA"]'); await D.waitForSelector('#cv-modal img', { timeout: 6000 });
  const img = await D.evaluate(() => { const c = glacialConvocatoriaPantalla.estado.imagen; return { w: c.width, h: c.height, url: c.toDataURL('image/png') }; });
  ok(img.w === 2880 && img.h > 600, 'al publicar sale la imagen de WhatsApp (formato de la planta, alta resolución)');
  if (process.env.GLX_CAPTURAS) { fs.writeFileSync(path.join(process.env.GLX_CAPTURAS, 'convocatoria-imagen.png'), Buffer.from(img.url.split(',')[1], 'base64')); }
  await D.click('#cv-modal [data-cv-cerrar]'); await espera(400);
  ok(await N.evaluate(() => /Publicada/.test(document.querySelector('#cv .cv-chip').textContent)), 'el otro equipo ve «Publicada» al instante');
  if (process.env.GLX_CAPTURAS) { await D.screenshot({ path: path.join(process.env.GLX_CAPTURAS, 'convocatoria-celular.png'), fullPage: true }); }
  // Tareo prellenado desde la convocatoria publicada
  const tareo = await N.evaluate(() => { const r = obtenerPersonalPorRotacion('2026-11-27', 'Día'); const p = tareoNuevaPersona(r.personal.find(x => x.equipoId === 'b20l-int'), 'Producción');
    return { desde: r.desdeConvocatoria, n: r.personal.length, hora: p.horaProgramadaIngreso, horario: p.horarioRotacion, equipo: p.equipo, linea: p.linea, salida: p.horaProgramadaSalida, noche: obtenerPersonalPorRotacion('2026-11-27', 'Noche').personal.length }; });
  ok(tareo.desde && tareo.n === 3 && tareo.noche === 1 && tareo.hora === '13:00' && tareo.horario === 'Intermedio' && tareo.equipo === 'Bidones 20L' && tareo.salida === '22:00', 'Tareo prellenado: el turno Día trae a los 3 con su equipo; Bidones 20L con hora 13:00–22:00 (tardanza por el horario del equipo)');
  ok(await D.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular (390 px): sin desborde lateral');
  ok(!CEL.errores.length && !PC.errores.length, 'sin errores en las páginas' + (CEL.errores.concat(PC.errores).length ? ': ' + CEL.errores.concat(PC.errores).slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
