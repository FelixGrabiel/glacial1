/* Menú por áreas (28/11/2026, 04-sidebar.js · grupoDelArea): cada usuario ve solo los grupos de su área.
   Antes Mantenimiento, RRHH y Ventas veían «Producción» (Entrega de turno, Horario de producción…) y todos veían «Mantenimiento» (Velocidades…).
   Permisos de Mantenimiento: los que tienen hoy los usuarios con rol Mantenimiento. Uso: GLX_LIBS=/ruta node tests/menu-areas.e2e.js */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const MANT = ['produccionActual', 'horasExtras', 'gestionar_rotacion_mantenimiento', 'control_operativo_lineas', 'moduloMantenimiento', 'gestionar_tareo_mantenimiento', 'ver_tareo_mantenimiento', 'ver_bitacora_mantenimiento', 'ver_banco_paradas', 'completar_motivo_parada', 'editar_salida_maquinistas'];
(async () => {
  const H = await iniciar(); const D = await H.abrir(1280, 900), P = D.page;
  const grupos = (rol, permisos) => P.evaluate(([rol, permisos]) => {
    document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block';
    const m = document.getElementById('sup-modal'); if (m) m.remove();
    state.user = Object.assign({ rol, nombre: 'Prueba', username: 'prueba' }, permisos ? { permisos } : {}); state.user.permisos = normalizarPermisosUsuario(state.user); state.showWelcome = false; state.currentTab = 'inicio';
    renderSidebar();
    const vis = el => el && !el.hidden && getComputedStyle(el).display !== 'none';
    const out = {}; [...document.querySelectorAll('.sidebar-group[data-sidebar-group]')].filter(vis).forEach(g => { out[g.dataset.sidebarGroup] = [...g.querySelectorAll('.side-action')].filter(vis).map(b => b.id.replace('btn-', '')); });
    return out;
  }, [rol, permisos]);
  const mt = await grupos('Mantenimiento', MANT);
  ok(!mt.produccion && !!mt.mantenimiento && !mt.rrhh, 'Mantenimiento: ve su grupo Mantenimiento y ya NO el de Producción (ni RRHH) · ' + Object.keys(mt).join(', '));
  const sup = await grupos('Supervisor', ['inicioOperativo', 'verLineasProduccion', 'nuevo', 'historial', 'paletas', 'avanceProduccion', 'tareoProduccion']);
  ok(!!sup.produccion && !sup.mantenimiento && !sup.rrhh, 'Supervisor de Producción: ve Producción, no Mantenimiento ni el grupo de RRHH · ' + Object.keys(sup).join(', '));
  const rh = await grupos('RRHH', ['moduloRRHH', 'tareoGeneral']);
  ok(!rh.produccion && !rh.mantenimiento && (rh.rrhh || []).includes('convocatoria-rrhh') && rh.rrhh.includes('descansos-rrhh'), 'RRHH: ve su grupo con Convocatoria y Descansos, no Producción ni Mantenimiento · ' + Object.keys(rh).join(', '));
  const ve = await grupos('Ventas', null);
  ok(!ve.produccion && !ve.mantenimiento, 'Ventas: sin Producción ni Mantenimiento');
  const sm = await grupos('Supervisor', ['inicioOperativo', 'avanceProduccion', 'moduloMantenimiento']);
  ok(!!sm.produccion && !!sm.mantenimiento, 'si Administración le da un permiso de Mantenimiento a un supervisor, ve también ese grupo');
  const ge = await grupos('Gerente General', null), ad = await grupos('Administrador', 'todos');
  ok(!!ge.produccion && !!ge.mantenimiento && !!ad.produccion && !!ad.mantenimiento, 'Gerencia y Administrador ven todas las áreas');
  const tarjetas = await P.evaluate(() => { state.user = { rol: 'Supervisor', nombre: 'S', username: 's', permisos: 'todos' }; renderSidebar(); goProduccionInicio(); return [...document.querySelectorAll('#pi-inicio .mi-tit')].map(t => t.textContent).join('|'); });
  ok(/Análisis de paradas/.test(tarjetas) && /Bitácora de producción/.test(tarjetas), 'las pantallas no cambian: el supervisor sigue abriendo «Análisis de paradas» y la Bitácora desde su Inicio');
  ok(!D.errores.length, 'sin errores en la página' + (D.errores.length ? ': ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
