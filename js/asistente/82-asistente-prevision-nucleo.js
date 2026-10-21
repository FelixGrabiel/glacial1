/* =============================================================
   GLACIAL · ASISTENTE DE PRODUCCIÓN — PREVISIÓN, ALERTAS Y DESVIACIÓN DE CONSUMO: NÚCLEO PURO
   -------------------------------------------------------------
   Sin pantalla ni base de datos. Lo usan 72-asistente-pantalla.js y tests/asistente-prevision.test.js.
     · prevision(): insumos que harán falta en los próximos días (programación publicada × factores) frente a lo que hay en Producción,
       lo que viene en camino (pedido o entregado sin recibir) y lo que Almacén tiene según el Inventario.
     · desviacionConsumo(): consumo real confirmado (conciliaciones) frente al teórico (producido × factor) en un rango de días.
     · alertasExtra(): avisos que se calculan con lo anterior y con el tiempo de las solicitudes.
   ============================================================= */
(function (raiz) {
  'use strict';
  /* El núcleo del Asistente (70) se lee al usarlo: no depende del orden exacto de carga. */
  const N = new Proxy({}, { get: (_, k) => raiz.glacialAsistenteNucleo[k] });

  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const red = (v, d) => { const f = Math.pow(10, d === undefined ? 4 : d); return Math.round((num(v) + Number.EPSILON) * f) / f; };
  const TOLERANCIA_DEFECTO = 0.03;            // ±3 % del teórico se considera normal
  const HORAS_SOLICITUD = 4;                  // solicitud sin entregar
  const HORAS_TRANSITO = 12;                  // entregado y sin recibir

  /* 'YYYY-MM-DD' + n días, sin zona horaria (calendario local). */
  function sumarDias(fecha, n) {
    const m = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return fecha;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* Lo que aún falta producir de un cuadro (en las unidades de la programación). Cerrado o cancelado: nada. */
  function porProducir(c) {
    if (!c || !N.cuadroAbierto(c)) return null;
    if (c.completar && !(c.programado > 0)) return null;               // «completar cantidad» sin cierre previo: no hay base
    return Math.max(num(c.programado) - num(c.producido), 0);
  }

  /* e: { dias:[{fecha, cuadros:[…de N.cuadrosDelBloque, DÍA y NOCHE juntos…]}], factores, insumos,
          stockProd:{cod:número}, stockAlm:{cod:{estado,disponible}|null}, enCamino:{cod:número} }
     → { dias:[fechas], filas:[…], sinFactor:n, pendientesCierre:n } ordenado por urgencia. */
  function prevision(e) {
    const insumos = (e.insumos || []).filter(i => i.activo !== false);
    const fechas = (e.dias || []).map(d => d.fecha);
    const m = new Map();
    let sinFactor = 0, pendientesCierre = 0;
    (e.dias || []).forEach(dia => {
      (dia.cuadros || []).forEach(c => {
        const falta = porProducir(c);
        if (falta === null) { if (N.cuadroAbierto(c)) pendientesCierre++; return; }
        if (!(falta > 0)) return;
        insumos.forEach(i => {
          const fv = N.factorVigente(e.factores, { insumo: i.codigo, linea: c.linea, marca: c.marca, presentacion: c.presentacion, fecha: c.fecha });
          if (fv.error) { if ((e.factores || []).some(f => f.insumo === i.codigo && f.linea === c.linea)) sinFactor++; return; }
          if (Number(fv.factor.factor) === 0) return;
          const t = N.teorico(falta, c.unidadesPorPaleta, fv.factor);
          if (t === null) { sinFactor++; return; }
          if (!m.has(i.codigo)) m.set(i.codigo, { insumo: i, porDia: Object.fromEntries(fechas.map(f => [f, 0])) });
          m.get(i.codigo).porDia[dia.fecha] = red(m.get(i.codigo).porDia[dia.fecha] + t);
        });
      });
    });
    const filas = [...m.values()].map(x => {
      const cod = x.insumo.codigo;
      const total = red(fechas.reduce((s, f) => s + x.porDia[f], 0));
      const stockProd = red(num(e.stockProd && e.stockProd[cod]));
      const alm = e.stockAlm && e.stockAlm[cod];
      const stockAlm = alm && alm.estado === 'OK' ? red(Math.max(alm.disponible, 0)) : null;
      const enCamino = red(num(e.enCamino && e.enCamino[cod]));
      const enProduccion = red(stockProd + enCamino);
      // Hasta qué día alcanza lo que ya está en Producción (o en camino): el primer día cuyo acumulado lo supera.
      let acum = 0, alcanzaHasta = null, primerFalta = null;
      fechas.forEach(f => {
        acum = red(acum + x.porDia[f]);
        if (primerFalta === null && acum > enProduccion + 1e-9) primerFalta = f;
      });
      if (primerFalta === null) alcanzaHasta = fechas[fechas.length - 1] || null;
      else { const i = fechas.indexOf(primerFalta); alcanzaHasta = i > 0 ? fechas[i - 1] : null; }
      const faltaProd = red(Math.max(total - enProduccion, 0));                   // lo que habría que pedir a Almacén
      const faltaTotal = red(Math.max(total - enProduccion - (stockAlm === null ? 0 : stockAlm), 0)); // lo que no alcanza ni con el stock de Almacén
      const estado = faltaProd <= 0 ? 'OK' : (stockAlm !== null && faltaTotal > 0 ? 'SIN_STOCK' : 'PEDIR');
      return { insumo: x.insumo, porDia: x.porDia, total, stockProd, enCamino, stockAlm, alcanzaHasta, primerFalta, faltaProd, faltaTotal, estado };
    });
    const orden = { SIN_STOCK: 0, PEDIR: 1, OK: 2 };
    filas.sort((a, b) => orden[a.estado] - orden[b.estado] || (a.primerFalta || '9').localeCompare(b.primerFalta || '9') || a.insumo.nombre.localeCompare(b.insumo.nombre, 'es'));
    return { dias: fechas, filas, sinFactor, pendientesCierre };
  }

  /* e: { cuadros:[…cuadros de los días a revisar con producido…], factores, insumos, movimientos, tolerancia }
     Solo se compara lo que ya tiene consumo REAL confirmado (movimiento CONSUMO): teórico y real del mismo cuadro e insumo.
     → { filas:[{insumo, teorico, real, desviacion, pct, estado, cuadros}], porLinea:[{linea, insumo, teorico, real, pct, estado}] } */
  function desviacionConsumo(e) {
    const tol = e.tolerancia === undefined ? TOLERANCIA_DEFECTO : e.tolerancia;
    const insumos = (e.insumos || []).filter(i => i.activo !== false);
    const movs = e.movimientos || [];
    const anulados = new Set(movs.filter(m => m && m.tipo === 'ANULACION' && m.anulaA).map(m => m.anulaA));
    const consumos = movs.filter(m => m && m.tipo === 'CONSUMO' && !anulados.has(m.opId));
    const porInsumo = new Map(), porLinea = new Map();
    const sumar = (mapa, k, base, teo, real, n) => {
      if (!mapa.has(k)) mapa.set(k, Object.assign({}, base, { teorico: 0, real: 0, cuadros: 0 }));
      const x = mapa.get(k); x.teorico = red(x.teorico + teo); x.real = red(x.real + real); x.cuadros += n;
    };
    (e.cuadros || []).forEach(c => {
      insumos.forEach(i => {
        const real = consumos.filter(m => m.cuadro === c.clave && m.insumo === i.codigo).reduce((s, m) => s + num(m.cantidad), 0);
        if (!(real > 0)) return;
        const fv = N.factorVigente(e.factores, { insumo: i.codigo, linea: c.linea, marca: c.marca, presentacion: c.presentacion, fecha: c.fecha });
        if (fv.error || Number(fv.factor.factor) === 0) return;
        const teo = N.teorico(c.producido, c.unidadesPorPaleta, fv.factor);
        if (teo === null || !(teo > 0)) return;
        sumar(porInsumo, i.codigo, { insumo: i }, teo, real, 1);
        sumar(porLinea, c.linea + '|' + i.codigo, { insumo: i, linea: c.linea }, teo, real, 1);
      });
    });
    const cerrar = x => {
      const desviacion = red(x.real - x.teorico), pct = red(desviacion / x.teorico);
      const estado = Math.abs(pct) <= tol ? 'NORMAL' : (pct > 0 ? 'EXCESO' : 'DEFECTO');
      return Object.assign({}, x, { desviacion, pct, estado });
    };
    const ord = (a, b) => Math.abs(b.pct) - Math.abs(a.pct);
    return { tolerancia: tol, filas: [...porInsumo.values()].map(cerrar).sort(ord), porLinea: [...porLinea.values()].map(cerrar).sort(ord) };
  }

  /* e: { prevision, desviaciones, solicitudes, ahora (ms), horasSolicitud, horasTransito, stockMinimoAlmacen:[{insumo, disponible, minimo}] }
     → [{nivel:'critico'|'atencion'|'info', tipo, texto, acc?}] */
  function alertasExtra(e) {
    const a = [];
    const hs = e.horasSolicitud || HORAS_SOLICITUD, ht = e.horasTransito || HORAS_TRANSITO;
    const fh = ms => { const h = Math.floor(ms / 3600000); return h < 1 ? 'menos de 1 h' : h + ' h'; };
    ((e.prevision && e.prevision.filas) || []).forEach(f => {
      if (f.estado === 'OK') return;
      const cuando = f.primerFalta ? 'desde el ' + f.primerFalta.slice(8, 10) + '/' + f.primerFalta.slice(5, 7) : 'en los próximos días';
      if (f.estado === 'SIN_STOCK') a.push({ nivel: 'critico', tipo: 'PREVISION', insumo: f.insumo.nombre, texto: f.insumo.nombre + ': ni con el stock de Almacén alcanza ' + cuando + ' (faltan ' + N.fmt(f.faltaTotal) + ' ' + f.insumo.unidad + ').', acc: 'prevision' });
      else a.push({ nivel: 'atencion', tipo: 'PREVISION', insumo: f.insumo.nombre, texto: f.insumo.nombre + ': hay que pedir ' + N.fmt(f.faltaProd) + ' ' + f.insumo.unidad + ' a Almacén ' + cuando + '.', acc: 'prevision' });
    });
    (e.solicitudes || []).forEach(s => {
      const ult = (s.historial || []).slice(-1)[0] || {};
      const edad = num(e.ahora) - num(ult.en);
      if (['SOLICITADA', 'EN_PREPARACION'].includes(s.estado) && edad > hs * 3600000)
        a.push({ nivel: 'atencion', tipo: 'SOLICITUD_DEMORA', texto: 'La solicitud ' + s.id + ' lleva ' + fh(edad) + ' sin entregarse (' + (s.estado === 'SOLICITADA' ? 'Almacén aún no la toma' : 'en preparación') + ').', acc: 'solicitudes' });
      if (['ENTREGADA', 'ENTREGADA_PARCIAL'].includes(s.estado) && (s.items || []).some(i => num(i.entregado) > num(i.recibido)) && edad > ht * 3600000)
        a.push({ nivel: 'info', tipo: 'SIN_RECIBIR', texto: 'Almacén entregó la solicitud ' + s.id + ' hace ' + fh(edad) + ' y Producción no ha confirmado la recepción.', acc: 'solicitudes' });
    });
    ((e.desviaciones && e.desviaciones.filas) || []).filter(d => d.estado !== 'NORMAL' && d.cuadros >= 2).forEach(d => {
      a.push({ nivel: 'atencion', tipo: 'DESVIACION', texto: d.insumo.nombre + ': consumo ' + (d.pct > 0 ? 'por encima' : 'por debajo') + ' del teórico (' + (d.pct > 0 ? '+' : '') + N.fmt(d.pct * 100) + ' %).', acc: 'desviacion' });
    });
    (e.stockMinimoAlmacen || []).forEach(s => {
      if (s.minimo > 0 && s.disponible < s.minimo) a.push({ nivel: 'atencion', tipo: 'MINIMO_ALMACEN', texto: s.insumo.nombre + ': Almacén tiene ' + N.fmt(s.disponible) + ' y el mínimo es ' + N.fmt(s.minimo) + '.', acc: 'prevision' });
    });
    const orden = { critico: 0, atencion: 1, info: 2 };
    return a.sort((x, y) => orden[x.nivel] - orden[y.nivel]);
  }

  const API = { TOLERANCIA_DEFECTO, HORAS_SOLICITUD, HORAS_TRANSITO, sumarDias, porProducir, prevision, desviacionConsumo, alertasExtra };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.glacialAsistentePrevision = API;
  else if (raiz) raiz.glacialAsistentePrevision = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
