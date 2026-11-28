/* «Agregar paradas» (29): el selector «Marca (tramo)» ofrece toda marca de la secuencia que YA tiene paletas en el turno, aunque siga
   «en espera» porque nadie cerró la marca anterior; y avisa las marcas producidas fuera de programación (sin tramo).
   Caso real PET2 · 27/11/2026 · NOCHE: Scala (en curso) → Scala Gas (paletas desde 04:23, sin «Cerrar marca») + Bells sin programar.
   Antes solo salía Scala. Datos ficticios. Uso: GLX_LIBS=/ruta node tests/paradas-marcas-producidas.e2e.js */
'use strict';
const { iniciar, LIBS } = require('./ayuda/graficos-e2e.js');
if (!LIBS) { console.log('Falta GLX_LIBS. Prueba omitida.'); process.exit(0); }
let fallas = 0;
const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
(async () => {
  const H = await iniciar(); const D = await H.abrir(1280, 900), P = D.page;
  const r = await P.evaluate(() => {
    const F = '2026-11-27', T = 'NOCHE', PR = 'Pack_Regular_625mlx15und/ln';
    const tr = (id, orden) => [{ id, orden, tipoFin: 'CANTIDAD', cantidadObjetivo: 1000, creadoEn: orden }];
    _programacionesCache = [
      { id: 'p1', clave: 'k1', linea: 'PET2', fecha: F, turno: T, marca: 'Scala', presentacion: PR, cantidadProgramada: 1000, tramosSecuencia: tr('t1', 1) },
      { id: 'p2', clave: 'k2', linea: 'PET2', fecha: F, turno: T, marca: 'Scala_Gas', presentacion: PR, cantidadProgramada: 1000, tramosSecuencia: tr('t2', 2) },
      { id: 'p3', clave: 'k3', linea: 'PET2', fecha: F, turno: T, marca: 'Bells', presentacion: 'Pack_Regular_2.5Lx6und', cantidadProgramada: 500, tramosSecuencia: tr('t3', 3) }];
    window._programacionesReady = true;
    const pal = (id, marca, und, pres) => ({ id, linea: 'PET2', fecha: F, turno: T, marca, presentacion: pres || PR, tipoPaleta: 'COMPLETA', paletas: 1, totalUnidades: und, hora: '01:00', creadoEn: 1 });
    const m = { linea: 'PET2', fecha: F, turno: T, filas: [] };
    const fila = () => avTramoFilaHtml(0, { id: 'x', horaInicio: '', minutos: 42, tipo: 'NO_PROGRAMADA', descripcion: 'Faja rota', origen: 'AVANCE' }, m, true);
    _paletasCache = [pal('a', 'Scala', 1500)];
    const antes = fila();
    _paletasCache = [pal('a', 'Scala', 1500), pal('b', 'Scala_Gas', 4050), pal('c', 'Bells', 1335, PR)];
    const despues = fila();
    return { antes, despues };
  });
  const txt = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/Scala 625/i.test(txt(r.antes)) && !/Scala_Gas|Scala Gas/i.test(txt(r.antes)) && !/Bells/.test(txt(r.antes)), 'sin paletas de otras marcas: solo la marca en curso (como antes)');
  ok(/Scala_Gas|Scala Gas/i.test(txt(r.despues)) && /falta cerrar la marca anterior/.test(txt(r.despues)), 'Scala Gas con paletas aparece aunque siga en espera («falta cerrar la marca anterior»)');
  ok((r.despues.match(/<button[^>]*class="av-tramo-btn/g) || []).length === 2, 'dos botones: Scala y Scala Gas (Bells 2.5 L programada pero sin paletas no aparece)');
  ok(/fuera de programación/.test(txt(r.despues)) && /Bells/.test(txt(r.despues)), 'Bells 625 producida sin programación: aviso de cómo asignarle paradas');
  ok(!D.errores.length, 'sin errores en la página' + (D.errores.length ? ': ' + D.errores.slice(0, 3).join(' | ') : ''));
  await H.cerrar();
  console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
