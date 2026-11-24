/* Notificaciones de PARADAS DE LÍNEA (avisos-push): qué se notifica, a quién, a la hora de Lima, sin repetir y sin desfasarse de la página. */
process.env.TZ = 'UTC';                                   // como el servidor de Supabase
const fs = require('fs'), path = require('path'), vm = require('vm');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const R = path.resolve(__dirname, '..'), leer = f => fs.readFileSync(path.join(R, f), 'utf8');

(async () => {
  const L = await import(path.join(R, 'supabase/functions/avisos-push/logica.js'));
  const { cargar: cP } = await import(path.join(R, 'supabase/functions/avisos-push/pausas.js'));
  const { cargar: cI } = await import(path.join(R, 'supabase/functions/avisos-push/indicadores.js'));
  const libs = { P: cP(), GI: cI() };

  /* Copias del servidor = módulos de la página, sin desfase */
  ok(require('../scripts/generar-copias-servidor.js').revisar().length === 0, 'las copias del servidor (pausas, indicadores) son idénticas a los archivos de la página');

  const MIN = 60000;
  const lima = (h, m) => Date.UTC(2026, 10, 24, h + 5, m);          // 24/11/2026 hh:mm hora de Lima
  const AHORA = lima(10, 0);
  const prog = (clave, linea, estado, extra) => Object.assign({ clave, linea, fecha: '2026-11-24', turno: 'DÍA', marca: 'GLACIAL', presentacion: '625 ml',
    estadoOperacion: Object.assign({ estado, paradas: [] }, extra) });
  const PROG = [
    prog('p1', 'PET1', 'DETENIDA', { detenidaDesde: AHORA - 5 * MIN, motivo: 'Falla mecánica' }),
    prog('p2', 'PET2', 'DETENIDA', { detenidaDesde: AHORA - 35 * MIN, motivo: 'Falta de insumos' }),
    prog('p3', 'B7L', 'PAUSA', { pausaDesde: AHORA - 45 * MIN, motivoPausa: 'Refrigerio' }),
    prog('p4', 'C20L', 'PAUSA', { pausaDesde: AHORA - 70 * MIN, motivoPausa: 'Refrigerio' }),
    prog('p5', 'B20L', 'DETENIDA', { detenidaDesde: AHORA - 180 * MIN, motivo: 'Falla eléctrica' }),
    prog('p6', 'B7L', 'EN_PRODUCCION', { inicio: AHORA - 120 * MIN }),
    prog('p7', 'B7L', 'PAUSA', { pausaDesde: AHORA - 50 * MIN, motivoPausa: 'Cambio temporal de producción' })
  ];
  const av = L.calcularAvisos({ programaciones: PROG, ahora: AHORA }, libs);
  const de = c => av.filter(a => a.clave.indexOf(c) >= 0);
  ok(de('det|p1|').length === 1 && de('par|p1|').length === 0, 'línea recién detenida (5 min): avisa «detenida» al instante');
  ok(de('det|p1|')[0].titulo === 'PET 1 detenida' && /Falla mecánica · desde las 09:55/.test(de('det|p1|')[0].cuerpo), 'el aviso dice la línea, el motivo y la hora de LIMA');
  ok(de('par|p2|').length === 1 && de('det|p2|').length === 0, 'detenida hace 35 min (límite 30): avisa «parada prolongada», ya no «detenida»');
  ok(/PET 2: parada de 35 min/.test(de('par|p2|')[0].titulo), 'el título dice cuánto lleva');
  ok(de('|p3|').length === 0, 'refrigerio de 45 min: no avisa (su límite es 60)');
  ok(de('par|p4|').length === 1, 'refrigerio de 70 min: avisa');
  ok(de('|p5|').length === 0, 'una parada que pasó su límite hace horas no se avisa al encender el sistema');
  ok(de('|p7|').length === 0, '«cambio temporal» mientras la línea produce otra presentación: no es parada, no avisa');

  const conConfig = L.calcularAvisos({ programaciones: PROG, ahora: AHORA, configAlertas: { paradaMin: 60 } }, libs);
  ok(conConfig.filter(a => a.clave.indexOf('par|p2|') === 0).length === 0, 'respeta el límite configurado por el Administrador (sync/configAlertas.paradaMin)');

  const franja = L.calcularAvisos({ programaciones: [prog('f1', 'PET1', 'DETENIDA', { detenidaDesde: lima(20, 0) - 2 * MIN, motivo: 'x' })], ahora: lima(20, 0) }, libs);
  ok(franja.length === 0, 'en la franja «Planta sin producción» (19:00–21:00) no se notifica, igual que el Centro de alertas');
  const noche = L.calcularAvisos({ programaciones: [Object.assign(prog('n1', 'PET1', 'DETENIDA', { detenidaDesde: lima(23, 0) - 2 * MIN, motivo: 'x' }), { turno: 'NOCHE' })], ahora: lima(23, 0) }, libs);
  ok(noche.length === 1, 'de noche (23:00 Lima) sí avisa');

  /* Quién recibe */
  const usuarios = [
    { username: 'admin', rol: 'Administrador', permisos: 'todos', authUid: 'u-admin' },
    { username: 'sup1', rol: 'Supervisor', linea: 'PET1', permisos: [] },
    { username: 'sup2', rol: 'Supervisor', linea: null, permisos: [] },
    { username: 'plan', rol: 'Planificación', permisos: [] },
    { username: 'mant', rol: 'mantenimiento_compartido', permisos: [] },
    { username: 'rrhh', rol: 'RRHH', permisos: ['moduloRRHH'] },
    { username: 'pers', rol: 'Personalizado', permisos: ['recibirAlertasProduccion'] },
    { username: 'jefe', rol: 'Jefe de Operaciones', permisos: [] },
    { username: 'mtec', rol: 'Mantenimiento', permisos: ['planificacion'] }
  ];
  const perfiles = { 'u-sup1': { username: 'sup1', rol: 'Supervisor' }, 'u-sup2': { username: 'sup2', rol: 'Supervisor' }, 'u-plan': { username: 'plan', rol: 'Planificación' },
    'u-mant': { username: 'mant', rol: 'mantenimiento_compartido' }, 'u-rrhh': { username: 'rrhh', rol: 'RRHH' }, 'u-pers': { username: 'pers', rol: 'Personalizado' },
    'u-jefe': { username: 'jefe', rol: 'Jefe de Operaciones' }, 'u-mtec': { username: 'mtec', rol: 'Mantenimiento' } };
  const subs = ['u-admin', 'u-sup1', 'u-sup2', 'u-plan', 'u-mant', 'u-rrhh', 'u-pers', 'u-jefe', 'u-mtec', 'u-nadie'].map(uid => ({ endpoint: 'https://push/' + uid, uid }));
  const { avisos, envios } = L.calcularEnvios({ programaciones: PROG, ahora: AHORA, usuarios, perfiles, suscripciones: subs }, libs);
  const recibe = uid => envios.filter(e => e.uid === uid).map(e => e.aviso.linea).sort().join(',');
  const todas = avisos.map(a => a.linea).sort().join(',');
  ok(recibe('u-admin') === todas, 'el Administrador recibe todas (se le reconoce por authUid aunque no esté en perfiles)');
  ok(recibe('u-sup1') === 'PET1', 'un Supervisor con línea asignada recibe solo las de su línea');
  ok(recibe('u-sup2') === todas, 'un Supervisor sin línea asignada recibe todas');
  ok(recibe('u-jefe') === todas && recibe('u-mant') === todas && recibe('u-pers') === todas, 'Jefatura, la cuenta compartida de Mantenimiento y quien tiene «Recibir alertas de producción» reciben todas');
  ok(recibe('u-plan') === '' && recibe('u-rrhh') === '' && recibe('u-nadie') === '', 'Planificación, RRHH y una cuenta desconocida no reciben');
  ok(recibe('u-mtec') === '', 'igual que el Centro de alertas: quien planifica recibe solo avisos de planificación, aunque sea de Mantenimiento');
  ok(L.calcularEnvios({ programaciones: [], ahora: AHORA, usuarios, perfiles, suscripciones: subs }, libs).envios.length === 0, 'sin paradas, no se envía nada');

  /* service worker: muestra la notificación y abre la app al tocarla */
  const sw = leer('sw.js'), oy = {}; let mostrada = null, abierta = null, enfocada = false;
  const self_ = { addEventListener: (t, f) => { oy[t] = f; }, skipWaiting() {}, location: { origin: 'https://glacial.test' },
    registration: { showNotification: (t, o) => { mostrada = { t, o }; return Promise.resolve(); } },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async u => { abierta = u; } } };
  new Function('self', 'caches', 'fetch', 'Response', sw)(self_, { keys: async () => [] }, async () => 'RED', function () {});
  let espera; oy.push({ data: { json: () => ({ titulo: 'PET 1 detenida', cuerpo: 'Falla · desde las 09:55', tag: 'linea-PET1', url: './' }) }, waitUntil: p => { espera = p; } });
  await espera;
  ok(mostrada && mostrada.t === 'PET 1 detenida' && mostrada.o.body === 'Falla · desde las 09:55' && mostrada.o.tag === 'linea-PET1' && /icono-192/.test(mostrada.o.icon), 'la app muestra la notificación con el texto y el ícono de GLACIAL');
  oy.push({ data: null, waitUntil: p => { espera = p; } }); await espera;
  ok(mostrada.t === 'GLACIAL', 'un aviso sin datos igual muestra algo (nunca una notificación vacía)');
  let cerrada = false;
  oy.notificationclick({ notification: { data: { url: './' }, close: () => { cerrada = true; } }, waitUntil: p => { espera = p; } }); await espera;
  ok(cerrada && abierta === './', 'al tocarla se abre GLACIAL');
  self_.clients.matchAll = async () => [{ url: 'https://glacial.test/', focus: async () => { enfocada = true; } }];
  abierta = null;
  oy.notificationclick({ notification: { data: { url: './' }, close() {} }, waitUntil: p => { espera = p; } }); await espera;
  ok(enfocada && abierta === null, 'si GLACIAL ya está abierta, la trae al frente en vez de abrir otra');

  /* página: script cargado, sin pedir permiso solo */
  const idx = leer('index.html'), cli = leer('js/nucleo/03d-notificaciones.js');
  ok(/03d-notificaciones\.js\?v=\d{8}-nt\d+/.test(idx), 'index.html carga 03d-notificaciones.js');
  ok(!/requestPermission\(\)[^;]*;[\s\S]{0,40}iniciar\(\)/.test(cli) && /data-gl-noti="si"/.test(cli), 'el permiso se pide solo al tocar «Activar» (nunca al abrir la página)');
  const N = require('../js/nucleo/03d-notificaciones.js');
  ok(N.debeOfrecer({ soporta: true, permiso: 'default', recibeParadas: true, ocultoHasta: 0, ahora: 1 }), 'ofrece activar a quien recibe paradas y aún no decidió');
  ok(!N.debeOfrecer({ soporta: true, permiso: 'granted', recibeParadas: true, ahora: 1 }) && !N.debeOfrecer({ soporta: true, permiso: 'denied', recibeParadas: true, ahora: 1 }), 'no insiste si ya aceptó o rechazó');
  ok(!N.debeOfrecer({ soporta: true, permiso: 'default', recibeParadas: false, ahora: 1 }), 'no ofrece a quien no recibe paradas (p. ej. RRHH)');
  ok(!N.debeOfrecer({ soporta: true, permiso: 'default', recibeParadas: true, ocultoHasta: 5, ahora: 1 }), '«Ahora no» la oculta un tiempo');
  ok(N.soporte({ sw: true, push: true, noti: true, ios: true, instalada: false }) === 'instalar' && N.soporte({ sw: true, push: true, noti: true, ios: true, instalada: true }) === 'si', 'iPhone: solo con la app instalada; si no, indica instalarla');
  ok(N.soporte({ sw: false, push: false, noti: false }) === 'no', 'navegador sin notificaciones: no ofrece nada');
  ok(N.claveB64(new Uint8Array([4, 255, 0])) === 'BP8A' && Array.from(N.deB64('BP8A')).join() === '4,255,0', 'convierte bien la clave pública del servidor');

  /* servidor: solo con secreto, sin pasar por el navegador */
  const mig = leer('supabase/migraciones/glacial_68_notificaciones_push.sql');
  ok(/revoke all on function public\.push_datos\(\) from public, anon, authenticated/.test(mig) && /grant execute on function public\.push_datos\(\) to service_role/.test(mig), 'los datos para notificar solo los lee el servidor (service_role)');
  ok(/create or replace function public\.push_suscribir/.test(mig) && /auth\.uid\(\)/.test(mig), 'cada equipo se suscribe a nombre de la cuenta con sesión (auth.uid)');
  ok(/'\* \* \* \* \*'/.test(mig), 'la revisión corre cada minuto');

  console.log(fallas ? ('\n' + fallas + ' FALLA(S)') : '\nTodo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
