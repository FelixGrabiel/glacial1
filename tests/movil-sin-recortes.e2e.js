/* Teléfono y tablet: ninguna pantalla debe quedar recortada por la derecha (la página oculta lo que se sale y no se puede deslizar).
   Abre la app REAL en 360, 390 y 768 px con datos de ejemplo y revisa Evidencias (lista + detalle) y las demás pantallas del menú.
   Uso: GLX_LIBS=/ruta node tests/movil-sin-recortes.e2e.js (no forma parte de las pruebas rápidas). GLX_CAPTURAS=/carpeta guarda capturas. */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
const { medir } = require('./ayuda/pantallas-movil.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const PANTALLAS = [
  ['produccion-actual', 'goProduccionActual()'], ['planificacion', 'goPlanificacion()'], ['asistente', 'goAsistente()'], ['asistente-lotes', "goAsistente('lotes')"], ['asistente-proveedores', "goAsistente('proveedores')"],
  ['asistente-conversiones', "goAsistente('conversiones')"], ['avance', 'goAvanceProduccion()'], ['tareo', 'goTareo()'], ['rotacion-supervisores', 'goRotacionSupervisores()'], ['inventario', 'goInventarioInsumos()'],
  ['almacen-pt', 'goAlmacenPT()'], ['calidad', "goCalidad('validacion')"], ['intervenciones', 'goIntervenciones()'], ['plan-anual', 'goPlanAnualMtto()'], ['velocidades', 'goVelocidadesEstandar()'],
  ['historial-mtto', 'goHistorialMtto()'], ['rrhh', 'goRRHH()'], ['resumen', 'goResumen()'], ['admin', 'goAdminPanel()'], ['hielo-inicio', 'goReporteHielo()'], ['hielo-registro', "goReporteHielo();hlVista('registro')"],
  ['hielo-reporte', "goReporteHielo();hlVista('reporte')"], ['hielo-config', "goReporteHielo();hlVista('config')"]
];
/* Tres evidencias de ejemplo con el primer dato seleccionado (lista + detalle como en el teléfono de Nayeli). */
const EVIDENCIAS = () => {
  const N = window.glacialEvidenciasNucleo, E = window.glacialEvidenciasDatos, H = c => c.repeat(64).slice(0, 64);
  const mk = (sha, arch, cat, prod, prov, lote, rem) => {
    const campos = {}; N.CAMPOS.forEach(d => { campos[d.campo] = { literal: null, valor: null, estado: 'ausente', origen: 'imagen', historial: [] }; });
    const set = (k, v) => { campos[k] = { literal: v, valor: v, estado: 'legible', origen: 'imagen', historial: [] }; };
    set('producto', prod); set('proveedor', prov); set('lote', lote); set('cantidad_valor', 24682); set('cantidad_unidad', 'UND');
    const d = N.construirDocumento({ sha256: sha, archivo_original: arch, version_procesador: 'vision-v2', analizado_en: '2026-11-19T18:55:43.756Z', modelo: 'x', extraccion: { tipo_documento: 'etiqueta_insumo', categoria: cat, texto_relevante: '', advertencias: [] }, campos, revision_local: { version: 'validador-v3', reglas_aplicadas: [], campos_en_duda: [] } },
      { sha256: sha, foto: { url: 'supabase:glacial-fotos/asistente/evidencias/' + sha + '.jpg', mimetype: 'image/jpeg', bytes: 1 }, usuario: 'Ana', uid: 'u1', ahora: Date.now() });
    d.remitente = rem; return d;
  };
  const poner = () => { E.cache.lista = [mk(H('a'), 'a.jpg', 'bolsas', 'BOBINAS PEBD LAMINA', 'corporacionask', '12158', 'Yeikari Márquez'), mk(H('b'), 'b.jpg', 'bolsas', 'A-8M-EI-063 ETIQ. FUNDA 8 CALA 7 LT', 'FIBRAPRINT S.A.C.', '1551-26', 'Nayeli'), mk(H('c'), 'c.jpg', 'bolsas', 'A-8M-ET-063 ETIQ. FUNDA 8CALA 7 LT', 'FIBRAPRINT S.A.C.', '1551-26', 'Nayeli')]; E.cache.listo = true; };
  state.currentTab = 'asistente'; goAsistente('evidencias');
  setTimeout(() => { poner(); try { window.iiEvidenciasUI.repintar(); } catch (e) { /* sin pantalla */ } }, 500);
  setTimeout(() => { poner(); try { ieSel(E.cache.lista[0].id); } catch (e) { /* sin selección */ } }, 900);
};
(async () => {
  const H = await iniciar();
  for (const w of [360, 390, 768]) {
    const D = await H.abrir(w, 900), P = D.page;
    await P.evaluate(() => { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-screen').style.display = 'block'; state.user = { rol: 'Administrador', nombre: 'Ana', username: 'ana', permisos: 'todos' }; state.showWelcome = false; });
    await P.evaluate(EVIDENCIAS); await P.waitForTimeout(2200);
    let r = await P.evaluate(medir);
    ok(r.n === 0 && r.recortados === 0 && r.scrollW <= w, 'Evidencias (lista y detalle) a ' + w + ' px: nada recortado' + (r.n + r.recortados ? ' · ' + [...r.primeros, ...r.primerosRecortados].slice(0, 3).join(' | ') : ''));
    const malas = [];
    for (const [n, cod] of PANTALLAS) {
      try { await P.evaluate(c => { try { (0, eval)(c); } catch (e) { /* pantalla sin datos */ } }, cod); await P.waitForTimeout(400); r = await P.evaluate(medir); if (r.n || r.recortados || r.scrollW > w) malas.push(n + ' (' + [...r.primeros, ...r.primerosRecortados][0] + ')'); }
      catch (e) { malas.push(n + ' (error)'); }
    }
    ok(malas.length === 0, PANTALLAS.length + ' pantallas del menú a ' + w + ' px sin recortes' + (malas.length ? ': ' + malas.join(', ') : ''));
    await P.context().close();
  }
  await H.cerrar();
  console.log(fallas ? '\n' + fallas + ' falla(s)' : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
