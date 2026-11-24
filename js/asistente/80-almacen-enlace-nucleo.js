/* =============================================================
   GLACIAL · ASISTENTE ↔ INVENTARIO DE INSUMOS — ENLACE CON ALMACÉN: NÚCLEO PURO
   -------------------------------------------------------------
   Sin pantalla ni base de datos. Lo usan 81-almacen-enlace-datos.js, 71 (entregas), 72 (pantalla) y tests/almacen-enlace.test.js.

   Idea: el Inventario guarda el stock por cortes (almacén «AP - INSUMOS Y SUMINISTROS»; contabilidad los pone a mano: el programa todavía
   NO registra nada en SAP). Cuando Almacén entrega lo que Producción pidió, o Producción devuelve material, el stock de Almacén cambia al
   instante, sin esperar al siguiente corte:
        stock de Almacén = stock del último corte (columna Insumos y Suministros) − entregas + devoluciones UTILIZABLES, todas con fecha
                           igual o posterior a la fecha del corte (el corte no incluye nada hecho en el programa)
   Un corte nuevo pasa a ser la base: lo anterior a su fecha deja de contar.
   Libro de Almacén (apAlmacenMov, inmutable, id = opId):
     { opId, tipo:'ENTREGA'|'ANULACION', insumo (código AP), itemCode (SAP), cantidad, unidad, fecha 'YYYY-MM-DD', solicitudId, anulaA,
       sinStock (true si se entregó sin stock suficiente), motivo, en, uid, usuario, guardadoEn }
   El insumo del Asistente se une al artículo del Inventario por su itemCode (SAP). Sin itemCode no hay enlace: nada se descuenta.
   ============================================================= */
(function (raiz) {
  'use strict';

  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const red = (v, d) => { const f = Math.pow(10, d === undefined ? 4 : d); return Math.round((num(v) + Number.EPSILON) * f) / f; };
  const texto = v => String(v == null ? '' : v).trim();
  const clave = v => texto(v).toUpperCase();
  const IDX_INSUMOS = 0;            // columna «AP - INSUMOS Y SUMINISTROS» de cada fila del corte (ALMACENES[0] del Inventario)
  const MIN_MOTIVO = 5;
  const ESTADOS_ABIERTOS = ['SOLICITADA', 'EN_PREPARACION', 'ENTREGADA_PARCIAL'];
  const ESTADOS_TRANSITO = ['ENTREGADA', 'ENTREGADA_PARCIAL', 'OBSERVADA', 'RECIBIDA'];

  /* Artículo del catálogo del Inventario para un insumo del Asistente (por itemCode SAP; también por id o alias del catálogo). */
  function resolverArticulo(insumo, catalogo) {
    const k = clave(insumo && insumo.itemCode);
    if (!k) return null;
    return (catalogo || []).find(c => clave(c.itemCode) === k || clave(c.id) === k || (c.alias || []).some(a => clave(a) === k)) || null;
  }

  /* Fila del corte para un artículo del catálogo. */
  function filaDelCorte(art, corte) {
    if (!art || !corte || !Array.isArray(corte.items)) return null;
    const ids = [art.id].concat(art.alias || []);
    return corte.items.find(i => ids.includes(i.id)) || null;
  }

  const anuladosDe = movs => new Set((movs || []).filter(m => m && m.tipo === 'ANULACION' && m.anulaA).map(m => m.anulaA));
  /* Entregas netas (ENTREGA menos las anuladas) de un insumo con fecha IGUAL O POSTERIOR a la del corte. */
  function entregasPosteriores(movs, insumo, fechaCorte) {
    const anulados = anuladosDe(movs);
    return red((movs || []).filter(m => m && m.tipo === 'ENTREGA' && m.insumo === insumo && !anulados.has(m.opId) && texto(m.fecha) >= texto(fechaCorte))
      .reduce((s, m) => s + num(m.cantidad), 0));
  }
  /* Devoluciones de Producción a Almacén (libro apMovimientos, tipo DEVOLUCION, condición UTILIZABLE; lo observado o dañado no vuelve al stock). */
  function devolucionesPosteriores(devs, insumo, fechaCorte) {
    const anulados = anuladosDe(devs);
    return red((devs || []).filter(m => m && m.tipo === 'DEVOLUCION' && m.insumo === insumo && (m.condicion || 'UTILIZABLE') === 'UTILIZABLE' && !anulados.has(m.opId) && texto(m.fecha) >= texto(fechaCorte))
      .reduce((s, m) => s + num(m.cantidad), 0));
  }

  /* Stock de Almacén de un insumo.
     → { estado:'OK'|'SIN_ENLACE'|'SIN_ARTICULO'|'SIN_CORTE'|'SIN_FILA', base, entregado, disponible, fechaCorte, articulo } */
  function stockAlmacen({ insumo, catalogo, corte, corteMeta, movs, devs }) {
    if (!insumo || !texto(insumo.itemCode)) return { estado: 'SIN_ENLACE', base: 0, entregado: 0, disponible: 0, fechaCorte: '', articulo: null };
    const articulo = resolverArticulo(insumo, catalogo);
    if (!articulo) return { estado: 'SIN_ARTICULO', base: 0, entregado: 0, disponible: 0, fechaCorte: '', articulo: null };
    if (!corte || !corteMeta) return { estado: 'SIN_CORTE', base: 0, entregado: 0, disponible: 0, fechaCorte: '', articulo };
    const fila = filaDelCorte(articulo, corte);
    const fechaCorte = corteMeta.fechaCorte || corte.fechaCorte || '';
    if (!fila) return { estado: 'SIN_FILA', base: 0, entregado: 0, disponible: 0, fechaCorte, articulo };
    const base = red(num(fila.w && fila.w[IDX_INSUMOS]));
    const entregado = entregasPosteriores(movs, insumo.codigo, fechaCorte);
    const devuelto = devolucionesPosteriores(devs, insumo.codigo, fechaCorte);
    return { estado: 'OK', base, entregado, devuelto, disponible: red(base - entregado + devuelto), fechaCorte, articulo };
  }

  /* Movimiento neto por artículo (clave = código SAP en mayúsculas): { entregado, devuelto, neto, n }. Sirve para mostrar el «Almacén hoy» en el Inventario. */
  function ajustes({ insumos, movs, devs, fechaCorte }) {
    const out = {};
    (insumos || []).forEach(i => {
      const k = clave(i.itemCode);
      if (!k) return;
      const e = entregasPosteriores(movs, i.codigo, fechaCorte), d = devolucionesPosteriores(devs, i.codigo, fechaCorte);
      if (!e && !d) return;
      const x = out[k] || (out[k] = { entregado: 0, devuelto: 0, neto: 0, n: 0 });
      x.entregado = red(x.entregado + e); x.devuelto = red(x.devuelto + d); x.neto = red(x.devuelto - x.entregado); x.n++;
    });
    return out;
  }

  /* Kardex de un insumo desde el último corte: saldo inicial (corte) y cada movimiento con su saldo corrido.
     Entrega = salida · Devolución utilizable = entrada · Anulación = reversa de lo anulado (queda a la vista, no se borra).
     La devolución observada/dañada se muestra sin mover el saldo. El saldo final coincide con stockAlmacen().disponible.
     → { estado, base, fechaCorte, filas:[{en,fecha,tipo,entrada,salida,saldo,solicitudId,usuario,nota,opId}], totalEntradas, totalSalidas, saldo } */
  function kardex({ insumo, catalogo, corte, corteMeta, movs, devs }) {
    const st = stockAlmacen({ insumo, catalogo, corte, corteMeta, movs, devs });
    if (st.estado !== 'OK') return { estado: st.estado, base: 0, fechaCorte: st.fechaCorte, filas: [], totalEntradas: 0, totalSalidas: 0, saldo: 0 };
    const cod = insumo.codigo, fc = texto(st.fechaCorte);
    const todos = [].concat((movs || []).map(m => ({ m, libro: 'A' })), (devs || []).map(m => ({ m, libro: 'D' })));
    const porId = {}; todos.forEach(x => { if (x.m && x.m.opId) porId[x.m.opId] = x.m; });
    const filas = [];
    todos.forEach(({ m }) => {
      if (!m || texto(m.fecha) < fc) return;
      if (m.tipo === 'ENTREGA' && m.insumo === cod) filas.push({ en: num(m.en), fecha: texto(m.fecha), tipo: 'ENTREGA', entrada: 0, salida: num(m.cantidad), solicitudId: texto(m.solicitudId), usuario: texto(m.usuario), nota: m.sinStock ? 'Sin stock autorizado' : '', opId: m.opId });
      else if (m.tipo === 'DEVOLUCION' && m.insumo === cod) {
        const util = (m.condicion || 'UTILIZABLE') === 'UTILIZABLE';
        filas.push({ en: num(m.en), fecha: texto(m.fecha), tipo: 'DEVOLUCION', entrada: util ? num(m.cantidad) : 0, salida: 0, solicitudId: texto(m.solicitudId), usuario: texto(m.usuario), nota: util ? '' : 'No vuelve al stock (' + texto(m.condicion).toLowerCase() + ')', opId: m.opId, informativo: !util ? num(m.cantidad) : 0 });
      } else if (m.tipo === 'ANULACION' && m.anulaA) {
        const o = porId[m.anulaA];
        if (!o || o.insumo !== cod) return;
        const util = o.tipo === 'ENTREGA' || (o.condicion || 'UTILIZABLE') === 'UTILIZABLE';
        if (!util) return;
        const esEntrega = o.tipo === 'ENTREGA';
        filas.push({ en: num(m.en), fecha: texto(m.fecha) || texto(o.fecha), tipo: 'ANULACION', entrada: esEntrega ? num(o.cantidad) : 0, salida: esEntrega ? 0 : num(o.cantidad), solicitudId: texto(o.solicitudId), usuario: texto(m.usuario), nota: 'Anula ' + (esEntrega ? 'entrega' : 'devolución') + ' ' + texto(m.anulaA), opId: m.opId });
      }
    });
    filas.sort((a, b) => (a.en - b.en) || (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    let saldo = st.base, te = 0, ts = 0;
    filas.forEach(f => { saldo = red(saldo + f.entrada - f.salida); f.saldo = saldo; te = red(te + f.entrada); ts = red(ts + f.salida); });
    return { estado: 'OK', base: st.base, fechaCorte: st.fechaCorte, filas, totalEntradas: te, totalSalidas: ts, saldo };
  }

  /* CSV del kardex (separador «;», decimales con coma, para abrir directo en Excel en español). */
  function kardexCsv(k, nombre) {
    const n = v => String(red(v)).replace('.', ',');
    const q = v => '"' + texto(v).replace(/"/g, '""') + '"';
    const L = [['Insumo', nombre || ''], ['Corte', k.fechaCorte], [], ['Fecha', 'Movimiento', 'Solicitud', 'Entrada', 'Salida', 'Saldo', 'Responsable', 'Nota']].map(r => r.map(q).join(';'));
    L.push(['', 'Saldo inicial (corte)', '', '', '', n(k.base), '', ''].map((v, i) => i === 5 ? v : q(v)).join(';'));
    k.filas.forEach(f => L.push([q(f.fecha), q(f.tipo), q(f.solicitudId), f.entrada ? n(f.entrada) : '', f.salida ? n(f.salida) : '', n(f.saldo), q(f.usuario), q(f.nota)].join(';')));
    return '\ufeff' + L.join('\r\n');
  }

  /* Texto corto del estado del enlace para mostrar en pantalla. */
  const TXT_ESTADO = {
    SIN_ENLACE: 'Sin enlace con el Inventario',
    SIN_ARTICULO: 'El código SAP no está en el catálogo del Inventario',
    SIN_CORTE: 'Aún no hay un corte de stock importado',
    SIN_FILA: 'El artículo no viene en el último corte'
  };

  /* Cuánto falta de lo pedido (lo ya entregado ya salió del stock). Insumos sin stock calculable no se marcan. */
  function revisarPedido(items, stockPorInsumo) {
    return (items || []).map(i => {
      const st = stockPorInsumo && stockPorInsumo[i.insumo];
      const pend = red(Math.max(num(i.solicitado) - num(i.entregado), 0));
      if (!st || st.estado !== 'OK') return { insumo: i.insumo, pendiente: pend, disponible: null, falta: 0, estado: st ? st.estado : 'SIN_ENLACE' };
      return { insumo: i.insumo, pendiente: pend, disponible: st.disponible, falta: red(Math.max(pend - Math.max(st.disponible, 0), 0)), estado: 'OK' };
    });
  }

  /* Valida una entrega de Almacén contra el stock. entregas: {insumo: cantidad}. opc: {autorizarSinStock, motivo}.
     → { errores:[], sinStock:[insumos] }. Sin autorización, entregar más de lo que hay es un error. */
  function validarEntregaContraStock(entregas, stockPorInsumo, opc) {
    const o = opc || {}, errores = [], sinStock = [];
    Object.keys(entregas || {}).forEach(ins => {
      const q = num(entregas[ins]);
      const st = stockPorInsumo && stockPorInsumo[ins];
      if (!(q > 0) || !st || st.estado !== 'OK') return;
      if (q > Math.max(st.disponible, 0) + 1e-9) sinStock.push({ insumo: ins, entrega: q, disponible: st.disponible });
    });
    if (sinStock.length && !o.autorizarSinStock) {
      sinStock.forEach(s => errores.push(s.insumo + ': Almacén tiene ' + red(Math.max(s.disponible, 0), 2) + ' y se entregarían ' + red(s.entrega, 2) + '. Ajusta la cantidad o autoriza la entrega sin stock con un motivo.'));
    } else if (sinStock.length && texto(o.motivo).length < MIN_MOTIVO) {
      errores.push('Para entregar sin stock suficiente escribe el motivo (mínimo ' + MIN_MOTIVO + ' caracteres).');
    }
    return { errores, sinStock: sinStock.map(s => s.insumo) };
  }

  /* Movimientos ENTREGA de una entrega. nEntrega: número de esta entrega dentro de la solicitud (1, 2…): el id es determinista,
     un reintento no descuenta dos veces. insumos: lista de apInsumos para tomar el itemCode. Solo los insumos con enlace restan. */
  function movimientosEntrega(sol, entregas, nEntrega, insumos, ctx) {
    const c = ctx || {}, out = [];
    Object.keys(entregas || {}).forEach((ins, j) => {
      const q = red(num(entregas[ins]));
      if (!(q > 0)) return;
      const reg = (insumos || []).find(i => i.codigo === ins);
      if (!reg || !texto(reg.itemCode)) return;
      const opId = sol.id + '_ENT' + nEntrega + '_' + ins;
      out.push({ opId, tipo: 'ENTREGA', insumo: ins, itemCode: texto(reg.itemCode), cantidad: q,
        unidad: reg.unidad || ((sol.items || []).find(i => i.insumo === ins) || {}).unidad || '', fecha: c.fecha || sol.fecha, solicitudId: sol.id,
        sinStock: !!(c.sinStock && c.sinStock.includes(ins)), motivo: texto(c.motivo), en: num(c.en) + j });
    });
    return out;
  }

  /* Por insumo: lo entregado por Almacén que Producción aún no confirmó (en tránsito) y lo pedido que Almacén aún no entregó (comprometido). */
  function transitoYComprometido(solicitudes) {
    const m = {};
    const f = ins => (m[ins] = m[ins] || { transito: 0, comprometido: 0 });
    (solicitudes || []).forEach(s => (s.items || []).forEach(i => {
      if (ESTADOS_TRANSITO.includes(s.estado)) f(i.insumo).transito = red(f(i.insumo).transito + Math.max(num(i.entregado) - num(i.recibido), 0));
      if (ESTADOS_ABIERTOS.includes(s.estado)) f(i.insumo).comprometido = red(f(i.insumo).comprometido + Math.max(num(i.solicitado) - num(i.entregado), 0));
    }));
    return m;
  }

  /* Resumen de lo que descuenta una entrega (para confirmarla antes de guardar). */
  function resumenEntrega(entregas, stockPorInsumo) {
    return Object.keys(entregas || {}).filter(k => num(entregas[k]) > 0).map(k => {
      const st = stockPorInsumo && stockPorInsumo[k];
      const antes = st && st.estado === 'OK' ? st.disponible : null;
      return { insumo: k, cantidad: red(num(entregas[k])), antes, despues: antes === null ? null : red(antes - num(entregas[k])) };
    });
  }

  /* ---------- Bandeja «Por atender» de Almacén (prioridad por espera) ---------- */
  const EN_ESPERA = ['SOLICITADA', 'EN_PREPARACION', 'ENTREGADA_PARCIAL'];
  const MIN_ATENCION = 120, MIN_URGENTE = 360;
  const ultimoEn = s => { const h = (s && s.historial) || []; const x = h.length ? h[h.length - 1] : null; return x ? num(x.en) : 0; };
  /** Solicitud que Almacén aún tiene que atender: cuánto espera y qué tan urgente es (≥ 2 h atención, ≥ 6 h urgente). */
  function prioridadSolicitud(s, ahoraMs) {
    if (!s || !EN_ESPERA.includes(s.estado)) return { atender: false, nivel: 'normal', esperaMin: 0 };
    const ult = ultimoEn(s), min = ult ? Math.max(0, Math.round((ahoraMs - ult) / 60000)) : 0;
    return { atender: true, nivel: min >= MIN_URGENTE ? 'urgente' : min >= MIN_ATENCION ? 'atencion' : 'normal', esperaMin: min };
  }
  /** Primero lo que Almacén debe atender (la que más espera arriba); el resto como siempre (por estado y número). */
  function ordenarPorAtender(lista, ahoraMs, orden) {
    return (lista || []).slice().sort((a, b) => {
      const pa = prioridadSolicitud(a, ahoraMs), pb = prioridadSolicitud(b, ahoraMs);
      if (pa.atender !== pb.atender) return pa.atender ? -1 : 1;
      if (pa.atender) return pb.esperaMin - pa.esperaMin;
      return ((orden || {})[a.estado] ?? 9) - ((orden || {})[b.estado] ?? 9) || String(b.id).localeCompare(String(a.id));
    });
  }
  function resumenPorAtender(lista, ahoraMs) {
    const l = (lista || []).map(s => prioridadSolicitud(s, ahoraMs)).filter(p => p.atender);
    return { total: l.length, urgentes: l.filter(p => p.nivel === 'urgente').length, atencion: l.filter(p => p.nivel === 'atencion').length, masAntiguaMin: l.reduce((m, p) => Math.max(m, p.esperaMin), 0) };
  }
  const txtEspera = min => min < 60 ? min + ' min' : min < 1440 ? Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '') : Math.floor(min / 1440) + ' d';

  /* ---------- Vale de entrega (comprobante imprimible de una entrega a Producción) ---------- */
  /** sol: solicitud; n: n.º de entrega (1…); insumoDe(codigo) → {nombre, unidad}. null si esa entrega no existe, no tiene detalle o está anulada. */
  function armarVale(sol, n, insumoDe) {
    const ent = ((sol && sol.historial) || []).filter(h => h && h.entrega), h = ent[n - 1];
    if (!h || !h.entregas) return null;
    if (((sol && sol.historial) || []).some(x => x && x.anulaEntrega === n)) return null;
    const lineas = Object.keys(h.entregas).filter(k => num(h.entregas[k]) > 0).map(k => {
      const i = (insumoDe && insumoDe(k)) || {}, it = (sol.items || []).find(x => x.insumo === k) || {};
      return { codigo: k, nombre: i.nombre || k, cantidad: red(num(h.entregas[k])), unidad: it.unidad || i.unidad || '' };
    });
    return { numero: sol.id + '-E' + n, solicitud: sol.id, entrega: n, fecha: sol.fecha, bloque: sol.bloque === 'NOCHE' ? 'Noche' : 'Mañana + Intermedio', en: num(h.en), entrego: h.por || '', solicito: sol.creadoPor || '', observaciones: sol.observaciones || '', nota: h.nota || '', lineas };
  }
  const escH = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Documento HTML autónomo del vale (para imprimir o guardar como PDF). */
  function valeHtml(v, cuando) {
    const f = v.en ? new Date(v.en).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short', hour12: false }) : '';
    const filas = v.lineas.map((l, i) => '<tr><td>' + (i + 1) + '</td><td>' + escH(l.nombre) + '<small>' + escH(l.codigo) + '</small></td><td class="n">' + escH(l.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })) + '</td><td>' + escH(l.unidad) + '</td></tr>').join('');
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vale de entrega ' + escH(v.numero) + '</title>'
      + '<style>body{font:14px/1.4 system-ui,Arial,sans-serif;color:#14263a;margin:24px;max-width:760px}h1{font-size:20px;margin:0}h2{font-size:12px;letter-spacing:.08em;color:#587087;margin:0 0 14px;font-weight:700}.c{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:12px 0}.c b{display:block;font-size:11px;letter-spacing:.06em;color:#587087;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #cfdbe6;padding:7px 9px;text-align:left}th{background:#f1f6fa;font-size:12px}td.n{text-align:right;font-variant-numeric:tabular-nums}td small{display:block;color:#587087;font-size:11px}.f{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}.f div{border-top:1px solid #14263a;padding-top:6px;text-align:center;font-size:12px}.p{margin-top:24px;color:#587087;font-size:11px}@media print{body{margin:10mm}}</style></head><body>'
      + '<h1>VALE DE ENTREGA</h1><h2>GLACIAL · Almacén → Producción</h2>'
      + '<div class="c"><div><b>N.º de vale</b>' + escH(v.numero) + '</div><div><b>Fecha y hora</b>' + escH(f) + '</div><div><b>Solicitud</b>' + escH(v.solicitud) + ' · entrega n.º ' + v.entrega + '</div><div><b>Turno solicitado</b>' + escH(v.fecha) + ' · ' + escH(v.bloque) + '</div><div><b>Entregó (Almacén)</b>' + escH(v.entrego) + '</div><div><b>Solicitó (Producción)</b>' + escH(v.solicito) + '</div></div>'
      + '<table><thead><tr><th>#</th><th>Insumo</th><th>Cantidad</th><th>Unidad</th></tr></thead><tbody>' + filas + '</tbody></table>'
      + (v.nota || v.observaciones ? '<p><b>Observaciones:</b> ' + escH([v.observaciones, v.nota].filter(Boolean).join(' · ')) + '</p>' : '')
      + '<div class="f"><div>Entregó · Almacén</div><div>Recibió · Producción</div></div><p class="p">Documento generado por GLACIAL' + (cuando ? ' el ' + escH(cuando) : '') + '. La recepción se confirma en el sistema por Producción.</p></body></html>';
  }

  const API = { IDX_INSUMOS, MIN_MOTIVO, TXT_ESTADO, resolverArticulo, filaDelCorte, entregasPosteriores, devolucionesPosteriores, ajustes, stockAlmacen, revisarPedido,
    validarEntregaContraStock, movimientosEntrega, transitoYComprometido, resumenEntrega,
    kardex, kardexCsv, prioridadSolicitud, ordenarPorAtender, resumenPorAtender, txtEspera, armarVale, valeHtml, MIN_ATENCION, MIN_URGENTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.glacialAlmacenEnlace = API;
  else if (raiz) raiz.glacialAlmacenEnlace = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
