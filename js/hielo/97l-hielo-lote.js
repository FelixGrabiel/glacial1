/* =============================================================
   GLACIAL · HIELO · LOTE AUTOMÁTICO (27/11/2026)
   -------------------------------------------------------------
   LOTE = TURNO + MARCA + MÁQUINA + SEMANA + DÍA JULIANO, todo junto (sin separadores).
     · TURNO: Día e Intermedio = 2 · Noche = 1 (como el lote de Agua).
     · MARCA (código de la planta):
         Cubos:   1 = Glacial (3 y 1.5 kg), Rappi, Hoteles, Molitalia, Nutra, Certificado · 2 = Cuisine · 3 = Scala · 4 = Tottus
                  6 = Bell's y Aro · 7 = Listo · 9 = Austral · 13 = Precio Uno
         Vasos:   10 = Oxxo · 1 = Glacial
         Premium: 1 = Glacial · 2 = Cuisine · 6 = Bell's
     · MÁQUINA: Cubos → Tolva manual = 1 · Env. automática = 3 · Vasos = 2 · Premium = 0.
     · SEMANA: 2 dígitos (la misma semana que el lote de Agua, 05-utils obtenerSemana) · DÍA JULIANO: 3 dígitos (día del año).
     Ej.: Glacial 3 kg · Tolva manual · Día · 26/11/2026 (semana 48, día 330) → 21148330.
     TURNO NOCHE: semana y día juliano del día SIGUIENTE (Noche del 26/11/2026 → 11148331), como el vencimiento.
   El lote sale solo cuando la fila tiene producción. Molitalia, Certificado y Hoteles (y las marcas sin código, p. ej. San Fernando) llevan
   el lote A MANO y es obligatorio para finalizar si se produjo.
   VENCIMIENTO automático: fecha + vida útil (12 meses, editable); el turno Noche cuenta desde el día siguiente. Molitalia, Hoteles y Certificado: a mano.
   Lógica pura (node): loteHielo, vencimientoHielo, codigoMarca, codigoMaquina, codigoTurno, semana, juliano.
   ============================================================= */
(function(raiz){
  'use strict';
  const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  /* [palabras que identifican la marca, código]. Se revisan en orden: la primera que coincide manda. */
  const CODIGOS = {
    CUBOS: [['precio uno', '13'], ['glacial', '1'], ['rappi', '1'], ['hoteles', '1'], ['hotel', '1'], ['molitalia', '1'], ['nutra', '1'], ['certificado', '1'],
      ['cuisine', '2'], ['cusine', '2'], ['scala', '3'], ['tottus', '4'], ['bell', '6'], ['aro', '6'], ['listo', '7'], ['austral', '9']],
    VASOS: [['oxxo', '10'], ['glacial', '1']],
    PREMIUM: [['glacial', '1'], ['cuisine', '2'], ['cusine', '2'], ['bell', '6']]
  };
  /* Lote a mano (obligatorio si se produce). */
  const MANUALES = ['molitalia', 'certificado', 'hoteles', 'hotel'];
  const palabra = (n, p) => (' ' + n + ' ').indexOf(' ' + p + ' ') >= 0 || (p.length > 4 && n.indexOf(p) >= 0);
  function codigoMarca(producto, marca){
    const n = norm(marca), l = CODIGOS[producto] || CODIGOS.CUBOS;
    if(!n) return '';
    const x = l.find(([p]) => palabra(n, p));
    return x ? x[1] : '';
  }
  const esManual = marca => { const n = norm(marca); return !!n && MANUALES.some(p => palabra(n, p)); };
  function codigoMaquina(producto, estacion){
    if(producto === 'VASOS') return '2';
    if(producto === 'PREMIUM') return '0';
    const e = norm(estacion);
    if(/tolva|manual/.test(e)) return '1';
    if(/autom|envasadora/.test(e)) return '3';
    return '';
  }
  const codigoTurno = t => { const x = norm(t); return x.indexOf('noche') >= 0 ? '1' : (x.indexOf('dia') >= 0 || x.indexOf('intermedio') >= 0 ? '2' : ''); };
  function partes(fecha){ const m = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; }
  /** Día del año (1–366), 3 dígitos. */
  function juliano(fecha){
    const p = partes(fecha); if(!p) return '';
    const d = Math.floor((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(p[0], 0, 1)) / 86400000) + 1;
    return String(d).padStart(3, '0');
  }
  /** Semana del lote de Agua (05-utils obtenerSemana: semanas desde el 1 de enero, el domingo empieza semana), 2 dígitos. */
  function semana(fecha){
    if(typeof raiz.obtenerSemana === 'function'){ const s = raiz.obtenerSemana(fecha); if(s !== '' && s !== null && s !== undefined) return String(s).padStart(2, '0'); }
    const p = partes(fecha); if(!p) return '';
    const dia = Math.floor((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(p[0], 0, 1)) / 86400000) + 1;
    const ini = new Date(Date.UTC(p[0], 0, 1)).getUTCDay();
    return String(Math.floor((dia + ini - 1) / 7) + 1).padStart(2, '0');
  }
  /** Fecha que va en el lote (27/11/2026): el turno NOCHE (desde las 19:00) cuenta desde el día SIGUIENTE, igual que el vencimiento.
   *  Ej.: Noche del 26/11/2026 → día juliano 331 (27/11), no 330. Día e Intermedio: la misma fecha. */
  function fechaLote(fecha, turno){
    const p = partes(fecha); if(!p) return '';
    if(codigoTurno(turno) !== '1') return fecha;
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)), z = n => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate());
  }
  /** Lote de una fila de producción → { lote, manual, motivo }.
   *  manual = true: la marca lleva lote a mano (obligatorio si hay producción). lote = '' con motivo si falta un dato (estación, fecha, turno). */
  function loteHielo(o){
    o = o || {};
    const producto = String(o.producto || 'CUBOS').toUpperCase();
    const hay = Number(o.bolsas) > 0;
    if(esManual(o.marca)) return { lote: '', manual: true, motivo: 'Lote a mano (obligatorio)' };
    const cm = codigoMarca(producto, o.marca);
    if(!cm) return { lote: '', manual: !!String(o.marca || '').trim(), motivo: o.marca ? 'Marca sin código de lote: escríbelo a mano' : 'Elige la marca' };
    if(!hay) return { lote: '', manual: false, motivo: 'Sale solo al registrar producción' };
    const mq = codigoMaquina(producto, o.estacion);
    if(!mq) return { lote: '', manual: false, motivo: 'Elige la estación (tolva manual o envasadora automática)' };
    const t = codigoTurno(o.turno), f = fechaLote(o.fecha, o.turno), s = semana(f), j = juliano(f);
    if(!t || !s || !j) return { lote: '', manual: false, motivo: 'Falta la fecha o el turno' };
    return { lote: t + cm + mq + s + j, manual: false, motivo: '' };
  }
  /** VENCIMIENTO (27/11/2026): fecha de producción + vida útil (12 meses por defecto, en Configuración de Hielo). El turno NOCHE (desde las 19:00)
   *  cuenta desde el día SIGUIENTE. Molitalia, Hoteles y Certificado: a mano (manual = true). Si el día no existe en el mes final (31 → 30), el último día. */
  function vencimientoHielo(o){
    o = o || {};
    if(esManual(o.marca)) return { vence: '', manual: true };
    const p = partes(o.fecha); if(!p) return { vence: '', manual: false };
    const meses = Math.max(1, Math.round(Number(o.meses) || 12));
    let base = Date.UTC(p[0], p[1] - 1, p[2]);
    if(codigoTurno(o.turno) === '1') base += 86400000;          // Noche → día siguiente
    const b = new Date(base), dia = b.getUTCDate();
    const fin = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + meses, 1));
    const ultimo = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 0)).getUTCDate();
    fin.setUTCDate(Math.min(dia, ultimo));
    const z = n => String(n).padStart(2, '0');
    return { vence: fin.getUTCFullYear() + '-' + z(fin.getUTCMonth() + 1) + '-' + z(fin.getUTCDate()), manual: false };
  }
  const API = { loteHielo, vencimientoHielo, fechaLote, codigoMarca, codigoMaquina, codigoTurno, semana, juliano, esManual };
  if(typeof module !== 'undefined' && module.exports) module.exports = API;
  raiz.glacialLoteHielo = API;
})(typeof window !== 'undefined' ? window : globalThis);
