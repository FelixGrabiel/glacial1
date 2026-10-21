/* =============================================================
   GLACIAL · ASISTENTE ↔ INVENTARIO DE INSUMOS — ENLACE CON ALMACÉN: NÚCLEO PURO
   -------------------------------------------------------------
   Sin pantalla ni base de datos. Lo usan 81-almacen-enlace-datos.js, 71 (entregas), 72 (pantalla) y tests/almacen-enlace.test.js.

   Idea: el Inventario guarda el stock de SAP por cortes (almacén «AP - INSUMOS Y SUMINISTROS»). Cuando Almacén entrega lo que
   Producción pidió, el stock de Almacén baja SIN esperar al siguiente corte de SAP:
        stock de Almacén = stock del último corte (columna Insumos y Suministros) − entregas posteriores a la fecha del corte
   Un corte nuevo de SAP pasa a ser la base y las entregas anteriores a su fecha dejan de restar (SAP ya las trae).
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

  /* Entregas netas (ENTREGA menos las anuladas) de un insumo con fecha POSTERIOR a la del corte. */
  function entregasPosteriores(movs, insumo, fechaCorte) {
    const anulados = new Set((movs || []).filter(m => m && m.tipo === 'ANULACION' && m.anulaA).map(m => m.anulaA));
    return red((movs || []).filter(m => m && m.tipo === 'ENTREGA' && m.insumo === insumo && !anulados.has(m.opId) && texto(m.fecha) > texto(fechaCorte))
      .reduce((s, m) => s + num(m.cantidad), 0));
  }

  /* Stock de Almacén de un insumo.
     → { estado:'OK'|'SIN_ENLACE'|'SIN_ARTICULO'|'SIN_CORTE'|'SIN_FILA', base, entregado, disponible, fechaCorte, articulo } */
  function stockAlmacen({ insumo, catalogo, corte, corteMeta, movs }) {
    if (!insumo || !texto(insumo.itemCode)) return { estado: 'SIN_ENLACE', base: 0, entregado: 0, disponible: 0, fechaCorte: '', articulo: null };
    const articulo = resolverArticulo(insumo, catalogo);
    if (!articulo) return { estado: 'SIN_ARTICULO', base: 0, entregado: 0, disponible: 0, fechaCorte: '', articulo: null };
    if (!corte || !corteMeta) return { estado: 'SIN_CORTE', base: 0, entregado: 0, disponible: 0, fechaCorte: '', articulo };
    const fila = filaDelCorte(articulo, corte);
    const fechaCorte = corteMeta.fechaCorte || corte.fechaCorte || '';
    if (!fila) return { estado: 'SIN_FILA', base: 0, entregado: 0, disponible: 0, fechaCorte, articulo };
    const base = red(num(fila.w && fila.w[IDX_INSUMOS]));
    const entregado = entregasPosteriores(movs, insumo.codigo, fechaCorte);
    return { estado: 'OK', base, entregado, disponible: red(base - entregado), fechaCorte, articulo };
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

  const API = { IDX_INSUMOS, MIN_MOTIVO, TXT_ESTADO, resolverArticulo, filaDelCorte, entregasPosteriores, stockAlmacen, revisarPedido,
    validarEntregaContraStock, movimientosEntrega, transitoYComprometido, resumenEntrega };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.glacialAlmacenEnlace = API;
  else if (raiz) raiz.glacialAlmacenEnlace = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
