/* GLACIAL · avisos-push · LÓGICA (pura) de las notificaciones de PARADAS DE LÍNEA (24/11/2026)
   Decide QUÉ notificar y A QUIÉN con las MISMAS reglas que el Centro de alertas (js/produccion/46-proyeccion-avisos.js):
     · «det»  LÍNEA DETENIDA: una detención (DETENIDA/LISTA) que empezó hace como mucho DETENIDA_RECIENTE_MIN minutos.
     · «par»  PARADA PROLONGADA: una parada o pausa abierta que pasó su umbral (glacialPausas.analizar: refrigerio 60 min, cambio temporal
              30 min, otras pausas = mayor entre el umbral general y su estándar, detenciones = umbral general sync/configAlertas.paradaMin, 30).
              Solo si lo cruzó hace como mucho PROLONGADA_VENTANA_MIN (al encender el sistema no se avisan paradas viejas).
     · Nada durante la franja «Planta sin producción» (GlacialIndicadores.bloqueVigente), igual que el Centro de alertas.
   Cada aviso tiene una CLAVE única (tipo|programación|inicio): el servidor la marca como enviada y nunca la repite.
   Destinatarios = ambito() de 46 limitado a «parada»: Administrador, Jefatura, Supervisor (solo su línea si tiene una), cuenta compartida de
   Mantenimiento, Mantenimiento o quien tenga moduloMantenimiento / control_operativo_lineas / recibirAlertasProduccion. Quien planifica, no.
   HORA DE LIMA: el servidor corre en UTC; las funciones del navegador usan la hora local. Se les pasa todo corrido -5 h (Perú no tiene horario
   de verano) y el resultado se devuelve a la hora real. Así 45-indicadores y 24b se usan tal cual, sin copiar sus reglas.
   Uso: calcularEnvios({programaciones, configAlertas, configIndicadores, usuarios, perfiles, suscripciones, ahora}, {P, GI}) */

export const LIMA_MS = 5 * 3600000;
export const DETENIDA_RECIENTE_MIN = 15;
export const PROLONGADA_VENTANA_MIN = 30;
export const JEFATURA = ['Jefe de Producción', 'Jefe de Operaciones', 'Jefatura', 'Gerente General', 'Gerente'];
export const ROLES_PLANIFICACION = ['Jefe de Producción', 'Planificación', 'Ventas y Planificación'];
const NOMBRES = { PET1: 'PET 1', PET2: 'PET 2', B7L: 'B7L', C20L: 'C20L', B20L: 'B20L' };

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const nombreLinea = k => NOMBRES[k] || String(k || 'Línea');
const pad = n => String(n).padStart(2, '0');
/** Hora de Lima «HH:MM» de un instante real. */
export function horaLima(ms) { const d = new Date(num(ms) - LIMA_MS); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }

/* ---------- quién recibe (espejo de tienePermiso / planificacionPermitida / ambito de 46) ---------- */
function permisosDe(u) {
  if (String(u.rol || '').trim() === 'Administrador' || u.permisos === 'todos') return 'todos';
  return Array.isArray(u.permisos) ? u.permisos : [];
}
function tiene(u, p) {
  const arr = permisosDe(u);
  if (p === 'planificacion') {
    if (arr === 'todos') return true;
    if (arr.includes('-planificacion')) return false;
    if (arr.includes('planificacion')) return true;
    return ROLES_PLANIFICACION.includes(String(u.rol || '').trim());
  }
  return arr === 'todos' || arr.includes(p);
}
/** null = no recibe paradas · {lineas:null} = todas · {lineas:'PET1'} = solo esa línea. */
export function ambitoParadas(u) {
  if (!u || !u.username) return null;
  const rol = String(u.rol || '').trim();
  if (rol === 'mantenimiento_compartido') return { lineas: null };
  if (rol === 'Administrador' || JEFATURA.includes(rol)) return { lineas: null };
  if (rol === 'Supervisor' || rol === 'Supervisor de Producción') return { lineas: u.linea || null };
  if (tiene(u, 'planificacion')) return null;
  if (rol === 'Mantenimiento' || tiene(u, 'moduloMantenimiento') || tiene(u, 'control_operativo_lineas') || tiene(u, 'recibirAlertasProduccion')) return { lineas: null };
  return null;
}
/** Usuario de una cuenta (uid): perfil (sync/perfiles.map[uid]) completado con su ficha de sync/users (línea, permisos al día). */
export function usuarioDeUid(uid, perfiles, usuarios) {
  const perfil = perfiles && perfiles[uid];
  const lista = Array.isArray(usuarios) ? usuarios : [];
  const ficha = lista.find(u => u && u.authUid === uid) || (perfil && lista.find(u => u && u.username === perfil.username)) || null;
  if (!perfil && !ficha) return null;
  return Object.assign({}, perfil || {}, ficha || {}, { username: (ficha && ficha.username) || (perfil && perfil.username) || '' });
}

/* ---------- qué notificar ---------- */
const corrida = ms => (num(ms) > 0 ? num(ms) - LIMA_MS : 0);
function programacionEnLima(p) {
  const op = p && p.estadoOperacion;
  if (!op) return p;
  return Object.assign({}, p, { estadoOperacion: Object.assign({}, op, {
    inicio: corrida(op.inicio), pausaDesde: corrida(op.pausaDesde), detenidaDesde: corrida(op.detenidaDesde)
  }) });
}
export function calcularAvisos(datos, libs) {
  const { P, GI } = libs;
  const ahora = num(datos.ahora) || Date.now();
  const ahoraL = ahora - LIMA_MS;
  const cfgA = datos.configAlertas || {};
  const paradaMin = num(cfgA.paradaMin) > 0 ? num(cfgA.paradaMin) : 30;
  let bloque = null;
  try { bloque = GI.bloqueVigente(ahoraL, datos.configIndicadores && datos.configIndicadores.bloques); } catch (_) { bloque = null; }
  if (bloque && bloque.enFranja) return [];
  const prog = (Array.isArray(datos.programaciones) ? datos.programaciones : []).map(programacionEnLima);
  const { abiertas } = P.analizar(prog, ahoraL, { umbralRojoMin: paradaMin });
  const avisos = [];
  abiertas.forEach(e => {
    const desde = e.desde + LIMA_MS;                                                     // hora real
    const linea = nombreLinea(e.linea), producto = [e.marca, e.presentacion].filter(Boolean).join(' ');
    const motivo = e.motivo ? e.motivo : (e.tipo === 'PAUSA' ? 'Pausa programada' : 'Sin motivo indicado');
    if (e.tipo === 'DETENCION' && e.min <= DETENIDA_RECIENTE_MIN) {
      avisos.push({ clave: 'det|' + (e.clave || e.linea) + '|' + desde, tipo: 'det', linea: e.linea,
        titulo: linea + ' detenida', cuerpo: motivo + ' · desde las ' + horaLima(desde) + (producto ? ' · ' + producto : ''),
        tag: 'linea-' + e.linea, url: './' });
    }
    if (e.larga && e.min - num(e.umbralMin) <= PROLONGADA_VENTANA_MIN) {
      avisos.push({ clave: 'par|' + (e.clave || e.linea) + '|' + desde, tipo: 'par', linea: e.linea,
        titulo: linea + ': ' + (e.tipo === 'PAUSA' ? 'pausa' : 'parada') + ' de ' + P.fmtDuracion(e.min),
        cuerpo: motivo + ' · desde las ' + horaLima(desde) + ' · pasó su límite de ' + P.fmtDuracion(e.umbralMin),
        tag: 'linea-' + e.linea, url: './' });
    }
  });
  return avisos;
}

/** Avisos + a qué equipo va cada uno. suscripciones: [{endpoint, uid, p256dh, auth}] */
export function calcularEnvios(datos, libs) {
  const avisos = calcularAvisos(datos, libs);
  const envios = [];
  if (!avisos.length) return { avisos, envios };
  (Array.isArray(datos.suscripciones) ? datos.suscripciones : []).forEach(s => {
    const u = usuarioDeUid(s.uid, datos.perfiles, datos.usuarios);
    const a = ambitoParadas(u);
    if (!a) return;
    avisos.forEach(av => { if (!a.lineas || a.lineas === av.linea) envios.push({ endpoint: s.endpoint, uid: s.uid, aviso: av }); });
  });
  return { avisos, envios };
}
