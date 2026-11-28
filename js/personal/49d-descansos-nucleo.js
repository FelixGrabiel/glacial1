/* =============================================================
   GLACIAL · PERSONAL · DESCANSOS AUTOMÁTICOS · NÚCLEO PURO (28/11/2026)
   -------------------------------------------------------------
   docs/personal-tareo/descansos-automaticos.md
   Antes el supervisor marcaba las «X» a mano en el Excel «DESCANSOS TURNO DÍA / NOCHE». Aquí GLACIAL hace ese cuadro con un sorteo que respeta las reglas;
   el supervisor revisa, mueve a mano lo que quiera y publica. Lógica pura (node, sin pantalla ni servidor).
   Días: 0 = lunes … 6 = domingo.
   Reglas OBLIGATORIAS:
     1. un descanso por semana para cada operario convocado
     2. cada día, en cada equipo, trabajan al menos el mínimo del equipo
     3. el domingo cada equipo trabaja con su mínimo EXACTO (el resto descansa, si es elegible)
     4. quien pasa de DÍA a NOCHE descansa el LUNES (fijo)
     5. quien pasa de NOCHE a DÍA no descansa domingo
     6. descanso médico / vacaciones / licencia en la semana: sin descanso sorteado (config.medicoParcial: puede recibirlo después del fin)
   Equidad: domingo primero a quien lleva más semanas sin descansarlo · días parejos · evitar el mismo día de la semana anterior · desempate con semilla.
   Sin solución (no alcanzan los días libres): «Programar» con el motivo, nunca se inventa.
   ============================================================= */
(function(raiz){
  'use strict';
  const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
  const LETRAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const DOM = 6, LUN = 0;
  const CONFIG_FABRICA = { semanasHistorial: 8, medicoParcial: false };
  const STATUS = { ASIGNADO: 'Asignado', VIENE_NOCHE: 'Asignado · viene de noche', PASA_NOCHE: 'Asignado · pasa a noche (lunes fijo)', MANUAL: 'Cambiado a mano', MEDICO: 'Descanso médico', PROGRAMAR: 'Programar' };
  const BLOQUES = { DESCANSO_MEDICO: 'Descanso médico', VACACIONES: 'Vacaciones', LICENCIA: 'Licencia' };
  /* Mínimos de PRUEBA para los descansos (personas trabajando por día). El dueño carga los reales en «Mínimos y días». */
  const MINIMOS_PRUEBA = { 'pet-dia': 6, 'b7l-dia': 12, 'c20l-int': 8, 'hielo-dia': 8, 'b20l-int': 2, 'b7l-noche': 8, 'hielo-noche': 9, 'pet-noche': 10 };

  /* ---------- utilidades ---------- */
  const texto = v => v === undefined || v === null ? '' : String(v).trim();
  const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
  const diaUTC = f => { const p = String(f).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  const iso = ms => { const d = new Date(ms), z = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate()); };
  const sumarDias = (f, n) => esFecha(f) ? iso(diaUTC(f) + n * 86400000) : '';
  const ddmm = f => esFecha(f) ? f.slice(8, 10) + '/' + f.slice(5, 7) : '';
  function lunesDe(f){ if(!esFecha(f)) return ''; const d = new Date(diaUTC(f)).getUTCDay(); return sumarDias(f, -((d + 6) % 7)); }
  /** Día de la semana (0 = lunes … 6 = domingo) de una fecha. */
  const diaSemana = f => esFecha(f) ? (new Date(diaUTC(f)).getUTCDay() + 6) % 7 : -1;
  const fechasSemana = semana => DIAS.map((_, i) => sumarDias(semana, i));

  /* Generador con semilla (mulberry32): misma semilla ⇒ mismo sorteo. */
  function azar(semilla){
    let a = (Number(semilla) >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const nuevaSemilla = () => 1000 + Math.floor(Math.random() * 9000);

  /* ---------- mínimos del equipo ---------- */
  const diasSinOperar = e => (Array.isArray(e && e.diasSinOperar) ? e.diasSinOperar : []).map(Number).filter(d => d >= 0 && d <= 6);
  const opera = (e, d) => !diasSinOperar(e).includes(d);
  /** Personas que deben trabajar ese día (mínimo por día; si no hay, el mínimo de descansos del equipo; si tampoco, el de la convocatoria). null = no opera. */
  function minimoDia(e, d){
    if(!opera(e, d)) return null;
    const pd = Array.isArray(e && e.minimoPorDia) ? Number(e.minimoPorDia[d]) : NaN;
    if(Number.isFinite(pd)) return Math.max(0, Math.round(pd));
    const md = Number(e && e.minimoDescanso);
    if(e && e.minimoDescanso !== null && e.minimoDescanso !== undefined && e.minimoDescanso !== '' && Number.isFinite(md)) return Math.max(0, Math.round(md));
    return Math.max(0, Math.round(Number(e && e.minimo) || 0));
  }

  /* ---------- quiénes entran al cuadro ---------- */
  /** Bloque (descanso médico / vacaciones / licencia) que toca la semana. */
  function bloqueEnSemana(conv, trabajadorId, semana){
    return (conv && conv.asignaciones || []).find(a => a.bloque && a.trabajadorId === trabajadorId && (!a.hasta || !semana || a.hasta >= semana)) || null;
  }
  const columnaEquipo = (eqs, id) => (eqs.get(id) || {}).columna || '';
  function columnaDe(trabajadorId, conv, eqs){
    const a = (conv && conv.asignaciones || []).find(x => x.trabajadorId === trabajadorId && !x.bloque && eqs.has(x.equipoId));
    return a ? columnaEquipo(eqs, a.equipoId) : '';
  }
  /** Personas de una columna (DÍA | NOCHE) de la convocatoria, en el orden de la convocatoria: { trabajadorId, equipoId, cambio: 'A_NOCHE'|'A_DIA'|'', bloque, hasta } */
  function personasDe(conv, anterior, equipos, columna, semana){
    const eqs = new Map((equipos || []).map(e => [e.id, e])), eqsAnt = eqs, out = [], vistos = new Set();
    (equipos || []).filter(e => e.columna === columna && e.activo !== false).forEach(e => {
      (conv && conv.asignaciones || []).filter(a => !a.bloque && a.equipoId === e.id).sort((x, y) => (Number(x.orden) || 0) - (Number(y.orden) || 0)).forEach(a => {
        if(vistos.has(a.trabajadorId)) return; vistos.add(a.trabajadorId);
        const antes = anterior ? columnaDe(a.trabajadorId, anterior, eqsAnt) : '';
        const b = bloqueEnSemana(conv, a.trabajadorId, semana);
        out.push({ trabajadorId: a.trabajadorId, nombre: a.nombre || '', equipoId: e.id,
          cambio: antes === 'DÍA' && columna === 'NOCHE' ? 'A_NOCHE' : antes === 'NOCHE' && columna === 'DÍA' ? 'A_DIA' : '',
          bloque: b ? b.bloque : '', hasta: b ? (b.hasta || '') : '' });
      });
    });
    // solo en un bloque (descanso médico sin equipo): fila al final, sin X
    (conv && conv.asignaciones || []).filter(a => a.bloque && (a.columna || 'DÍA') === columna && (!a.hasta || a.hasta >= semana)).forEach(a => {
      if(vistos.has(a.trabajadorId)) return; vistos.add(a.trabajadorId);
      out.push({ trabajadorId: a.trabajadorId, nombre: a.nombre || '', equipoId: '', cambio: '', bloque: a.bloque, hasta: a.hasta || '' });
    });
    return out;
  }

  /* ---------- equidad desde el historial ---------- */
  /** semanasPrevias: [{ semana, asignaciones: [{ trabajadorId, dia }] }] publicadas. → Map trabajadorId → { semanasSinDomingo, diaAnterior } */
  function equidad(semanasPrevias, semana, n){
    const N = Math.max(1, Number(n) || CONFIG_FABRICA.semanasHistorial), porSemana = new Map();
    (semanasPrevias || []).forEach(s => { if(!s || !esFecha(s.semana)) return; const m = porSemana.get(s.semana) || new Map(); (s.asignaciones || []).forEach(a => { if(a.dia !== null && a.dia !== undefined && a.dia !== '') m.set(a.trabajadorId, Number(a.dia)); }); porSemana.set(s.semana, m); });
    const ids = new Set(); porSemana.forEach(m => m.forEach((_, id) => ids.add(id)));
    const out = new Map();
    ids.forEach(id => {
      let sin = N;
      for(let k = 1; k <= N; k++){ const m = porSemana.get(sumarDias(semana, -7 * k)); if(m && m.get(id) === DOM){ sin = k - 1; break; } }
      const ant = porSemana.get(sumarDias(semana, -7)), dA = ant && ant.has(id) ? ant.get(id) : null;
      out.set(id, { semanasSinDomingo: sin, diaAnterior: dA });
    });
    return out;
  }

  /* ---------- sorteo ---------- */
  /** Días de la semana en que la persona está en su bloque (no trabaja ni cuenta). */
  function diasEnBloque(p, semana){
    if(!p.bloque) return [];
    if(!p.hasta) return [0, 1, 2, 3, 4, 5, 6];
    return fechasSemana(semana).map((f, d) => f <= p.hasta ? d : -1).filter(d => d >= 0);
  }
  /**
   * generarDescansos({ semana, columna, equipos, conv, anterior, historial (Map | objeto), config, semilla })
   * → { semana, columna, semilla, asignaciones: [{ trabajadorId, equipoId, dia, status, origen, motivo, bloque, hasta }], ...evaluar() }
   */
  function generarDescansos(o){
    o = o || {};
    const semana = o.semana, columna = o.columna === 'NOCHE' ? 'NOCHE' : 'DÍA', cfg = Object.assign({}, CONFIG_FABRICA, o.config || {});
    const semilla = Number(o.semilla) || nuevaSemilla(), rnd = azar(semilla);
    const equipos = (o.equipos || []).filter(e => e.activo !== false && e.columna === columna).sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    const hist = o.historial instanceof Map ? o.historial : new Map(Object.entries(o.historial || {}));
    const H = id => hist.get(id) || { semanasSinDomingo: cfg.semanasHistorial, diaAnterior: null };
    const personas = personasDe(o.conv, o.anterior, o.equipos || [], columna, semana);
    const asig = new Map(), global = [0, 0, 0, 0, 0, 0, 0];
    const poner = (p, dia, status, origen, motivo) => { asig.set(p.trabajadorId, { trabajadorId: p.trabajadorId, nombre: p.nombre, equipoId: p.equipoId, dia, status, origen, motivo: motivo || '', bloque: p.bloque || '', hasta: p.hasta || '' }); if(dia !== null && dia >= 0) global[dia]++; };

    // fuera del sorteo: descanso médico / vacaciones / licencia (y los que solo están en un bloque)
    personas.forEach(p => {
      if(!p.bloque) return;
      const enBloque = diasEnBloque(p, semana);
      if(!p.equipoId || !cfg.medicoParcial || enBloque.length === 7) poner(p, null, 'MEDICO', 'EXCLUIDO', (BLOQUES[p.bloque] || 'Descanso médico') + (p.hasta ? ' hasta ' + ddmm(p.hasta) : ''));
    });

    equipos.forEach(e => {
      const mi = personas.filter(p => p.equipoId === e.id);
      const dispo = [0, 1, 2, 3, 4, 5, 6].map(d => mi.filter(p => !diasEnBloque(p, semana).includes(d)).length);
      const cupo = d => opera(e, d) ? dispo[d] - minimoDia(e, d) : Infinity;
      const desc = [0, 0, 0, 0, 0, 0, 0];
      const tomar = (p, d, status, origen, motivo) => { poner(p, d, status, origen, motivo); desc[d]++; };
      const pendientes = mi.filter(p => !asig.has(p.trabajadorId));
      // diasPermitidos: médico parcial solo después del fin del bloque
      const permitido = (p, d) => !diasEnBloque(p, semana).includes(d) && !(p.cambio === 'A_DIA' && d === DOM && opera(e, DOM));
      // 1) pasa de día a noche: lunes fijo
      pendientes.filter(p => p.cambio === 'A_NOCHE' && permitido(p, LUN)).forEach(p => tomar(p, LUN, 'PASA_NOCHE', 'FIJO', 'Pasa de día a noche: descansa el lunes'));
      // 2) días en que el equipo no opera: es el descanso de quien aún no tiene
      diasSinOperar(e).sort().slice(0, 1).forEach(d => pendientes.filter(p => !asig.has(p.trabajadorId) && !(p.cambio === 'A_DIA' && d === DOM) && !diasEnBloque(p, semana).includes(d)).forEach(p => tomar(p, d, p.cambio === 'A_DIA' ? 'VIENE_NOCHE' : 'ASIGNADO', 'AUTO', 'El equipo no opera ese día')));
      // 3) domingo con el mínimo exacto: primero quien lleva más semanas sin domingo
      if(opera(e, DOM)){
        const llave = new Map(pendientes.map(p => [p.trabajadorId, rnd()]));
        const cand = pendientes.filter(p => !asig.has(p.trabajadorId) && permitido(p, DOM))
          .sort((a, b) => H(b.trabajadorId).semanasSinDomingo - H(a.trabajadorId).semanasSinDomingo || (H(a.trabajadorId).diaAnterior === DOM) - (H(b.trabajadorId).diaAnterior === DOM) || llave.get(a.trabajadorId) - llave.get(b.trabajadorId));
        cand.slice(0, Math.max(0, cupo(DOM) - desc[DOM])).forEach(p => tomar(p, DOM, 'ASIGNADO', 'AUTO', ''));
      }
      // 4) lunes a sábado: el día con menos descansos del equipo que tenga cupo, evitando el día de la semana anterior
      const resto = pendientes.filter(p => !asig.has(p.trabajadorId));
      for(let i = resto.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [resto[i], resto[j]] = [resto[j], resto[i]]; }
      resto.forEach(p => {
        const opciones = [0, 1, 2, 3, 4, 5].filter(d => opera(e, d) && permitido(p, d) && desc[d] < cupo(d));
        if(!opciones.length){
          const min = minimoDia(e, 0);
          poner(p, null, 'PROGRAMAR', 'AUTO', e.nombre + ': ' + mi.length + ' personas y mínimo ' + min + ', no hay días libres');
          return;
        }
        const ant = H(p.trabajadorId).diaAnterior, puntos = d => (d === ant ? 1000 : 0) + desc[d] * 20 + global[d] + rnd();
        const d = opciones.reduce((m, x) => puntos(x) < puntos(m) ? x : m, opciones[0]);
        tomar(p, d, p.cambio === 'A_DIA' ? 'VIENE_NOCHE' : 'ASIGNADO', 'AUTO', '');
      });
    });
    const asignaciones = personas.map(p => asig.get(p.trabajadorId) || { trabajadorId: p.trabajadorId, nombre: p.nombre, equipoId: p.equipoId, dia: null, status: 'PROGRAMAR', origen: 'AUTO', motivo: 'Sin equipo de esta columna', bloque: p.bloque, hasta: p.hasta });
    return Object.assign({ semana, columna, semilla, asignaciones }, evaluar(asignaciones, o.equipos || [], columna, semana, personas));
  }

  /* ---------- evaluar (después del sorteo o de un cambio a mano) ---------- */
  /** → { totalesPorDia[7], trabajando: { equipoId: [7] }, minimos: { equipoId: [7|null] }, reglas: [{ ok, texto }], avisos: [{ texto, equipoId?, dia?, trabajadorId? }], asignados, porProgramar, conDescanso } */
  function evaluar(asignaciones, equipos, columna, semana, personas){
    const eqs = (equipos || []).filter(e => e.activo !== false && e.columna === columna).sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    const L = asignaciones || [], P = new Map((personas || []).map(p => [p.trabajadorId, p]));
    const totalesPorDia = [0, 0, 0, 0, 0, 0, 0], trabajando = {}, minimos = {}, avisos = [];
    L.forEach(a => { if(a.dia !== null && a.dia !== undefined && a.dia >= 0) totalesPorDia[a.dia]++; });
    eqs.forEach(e => {
      const mi = L.filter(a => a.equipoId === e.id);
      trabajando[e.id] = [0, 1, 2, 3, 4, 5, 6].map(d => opera(e, d) ? mi.filter(a => a.dia !== d && !diasEnBloque(P.get(a.trabajadorId) || a, semana).includes(d)).length : 0);
      minimos[e.id] = [0, 1, 2, 3, 4, 5, 6].map(d => minimoDia(e, d));
    });
    const bajo = [], domNoExacto = [];
    eqs.forEach(e => [0, 1, 2, 3, 4, 5, 6].forEach(d => {
      const m = minimos[e.id][d]; if(m === null) return;
      if(trabajando[e.id][d] < m){ bajo.push(e.nombre + ' ' + DIAS[d]); avisos.push({ tipo: 'minimo', equipoId: e.id, dia: d, texto: e.nombre + ' el ' + DIAS[d] + ': trabajan ' + trabajando[e.id][d] + ' de ' + m + ' mínimo' }); }
      if(d === DOM && trabajando[e.id][d] > m && L.some(a => a.equipoId === e.id && a.status !== 'MEDICO')) domNoExacto.push(e.nombre + ' (' + trabajando[e.id][d] + ' de ' + m + ')');
    }));
    eqs.forEach(e => { const libres = [0, 1, 2, 3, 4, 5].filter(d => minimos[e.id][d] !== null).map(d => trabajando[e.id][d] + (L.filter(a => a.equipoId === e.id && a.dia === d).length) - minimos[e.id][d]);
      if(libres.length && Math.max(...libres) === 1) avisos.push({ tipo: 'info', equipoId: e.id, texto: e.nombre + ': solo 1 puede descansar por día' }); });
    const conDia = L.filter(a => a.status !== 'MEDICO'), sinDia = conDia.filter(a => a.dia === null || a.dia === undefined);
    sinDia.forEach(a => avisos.push({ tipo: 'programar', trabajadorId: a.trabajadorId, equipoId: a.equipoId, texto: (a.nombre || a.trabajadorId) + ': por programar' + (a.motivo ? ' · ' + a.motivo : '') }));
    const pasaNoche = L.filter(a => (P.get(a.trabajadorId) || {}).cambio === 'A_NOCHE' || a.status === 'PASA_NOCHE');
    const vieneNoche = L.filter(a => (P.get(a.trabajadorId) || {}).cambio === 'A_DIA' || a.status === 'VIENE_NOCHE');
    pasaNoche.filter(a => a.dia !== LUN && a.status !== 'MEDICO').forEach(a => avisos.push({ tipo: 'regla', trabajadorId: a.trabajadorId, texto: (a.nombre || a.trabajadorId) + ' pasa a noche y no descansa el lunes' }));
    vieneNoche.filter(a => a.dia === DOM).forEach(a => avisos.push({ tipo: 'regla', trabajadorId: a.trabajadorId, texto: (a.nombre || a.trabajadorId) + ' viene de noche y descansa domingo' }));
    const domingo = totalesPorDia[DOM];
    const reglas = [
      { ok: !sinDia.length, texto: '1 descanso por semana para los ' + conDia.length + (sinDia.length ? ' (' + sinDia.length + ' por programar)' : '') },
      { ok: !bajo.length, texto: bajo.length ? 'Bajo el mínimo: ' + bajo.join(', ') : 'Ningún equipo baja de su mínimo' },
      { ok: !domNoExacto.length, texto: domNoExacto.length ? 'Domingo sobre el mínimo: ' + domNoExacto.join(', ') : 'Domingo con el mínimo exacto (' + domingo + ' descansan)' },
      { ok: true, texto: 'Domingo: prioridad a quien lleva más semanas sin descansarlo' },
      { ok: pasaNoche.every(a => a.dia === LUN || a.status === 'MEDICO'), texto: 'Pasan a noche (' + pasaNoche.length + ') → descansan lunes' },
      { ok: vieneNoche.every(a => a.dia !== DOM), texto: 'Pasan a día (' + vieneNoche.length + ') → cualquier día menos domingo' }
    ];
    return { totalesPorDia, trabajando, minimos, reglas, avisos, asignados: conDia.length - sinDia.length, porProgramar: sinDia.length, conDescanso: conDia.length };
  }

  /* ---------- cambio a mano ---------- */
  /** Mueve la X de una persona a otro día (o la quita con dia = null). No bloquea: devuelve los avisos de reglas que rompe ese cambio. */
  function mover(asignaciones, trabajadorId, dia, usuario, equipos, columna, semana, personas){
    const antes = evaluar(asignaciones, equipos, columna, semana, personas);
    const L = (asignaciones || []).map(a => a.trabajadorId === trabajadorId ? Object.assign({}, a, { dia: dia === null || dia === undefined || dia === '' ? null : Number(dia), status: 'MANUAL', origen: 'MANUAL', actualizadoPor: usuario || '', motivo: 'Cambiado a mano' }) : a);
    const despues = evaluar(L, equipos, columna, semana, personas), viejos = new Set(antes.avisos.map(x => x.texto));
    return { asignaciones: L, avisos: despues.avisos.filter(x => !viejos.has(x.texto) && x.tipo !== 'info'), evaluacion: despues };
  }

  /* ---------- textos y cuadro ---------- */
  function statusTexto(a){
    if(!a) return '';
    if(a.status === 'MANUAL') return 'Cambiado a mano' + (a.actualizadoPor ? ' (' + a.actualizadoPor + ')' : '');
    if(a.status === 'MEDICO') return (BLOQUES[a.bloque] || 'Descanso médico') + (a.hasta ? ' hasta ' + ddmm(a.hasta) : '');
    return STATUS[a.status] || a.status || '';
  }
  /** Modelo del cuadro «DESCANSOS TURNO DÍA / NOCHE» (mismo formato del Excel): filas, días con su número, totales y trabajando por equipo. */
  function modeloCuadro(r, equipos, trabajadores, extra){
    extra = extra || {};
    const T = new Map((trabajadores || []).map(t => [t.id, t])), E = new Map((equipos || []).map(e => [e.id, e]));
    const eqs = (equipos || []).filter(e => e.activo !== false && e.columna === r.columna).sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    const nombre = a => (T.get(a.trabajadorId) && T.get(a.trabajadorId).nombre) || a.nombre || a.trabajadorId;
    const filas = (r.asignaciones || []).map((a, i) => ({ n: i + 1, trabajadorId: a.trabajadorId, nombre: nombre(a), equipo: a.equipoId ? ((E.get(a.equipoId) || {}).nombre || a.equipoId) : '—', equipoId: a.equipoId,
      dia: a.dia, status: a.status, statusTexto: statusTexto(a), motivo: a.motivo || '' }));
    const corto = n => String(n || '').replace(/^Equipo (de )?/i, '').replace(/Bidones /i, 'B').replace(/Cajas /i, 'C');
    return {
      titulo: 'DESCANSOS TURNO ' + (r.columna === 'NOCHE' ? 'NOCHE' : 'DÍA') + ' · SEMANA ' + ddmm(r.semana) + ' AL ' + ddmm(sumarDias(r.semana, 6)) + ' · GENERADO POR GLACIAL',
      columna: r.columna, dias: fechasSemana(r.semana).map((f, d) => ({ letra: LETRAS[d], corto: DIAS[d], num: f.slice(8, 10), fecha: f })),
      filas, totalesPorDia: r.totalesPorDia, resumen: r.asignados + ' de ' + r.conDescanso + ' · ' + r.porProgramar + ' por programar',
      trabajando: { etiqueta: 'Trabajando ' + eqs.map(e => corto(e.nombre)).join(' / '), equipos: eqs.map(e => ({ id: e.id, nombre: e.nombre, corto: corto(e.nombre), dias: r.trabajando[e.id] || [], minimos: r.minimos[e.id] || [] })),
        minimos: 'mínimos ' + eqs.map(e => { const m = (r.minimos[e.id] || []).filter(x => x !== null); return m.length && m.every(x => x === m[0]) ? m[0] : m.join('-'); }).join(' / '), ok: r.reglas ? r.reglas[1].ok : true },
      pie: 'Sorteo n.º ' + r.semilla + ' · X = descansa' + (extra.horario ? ' · horario ' + extra.horario : '') + (r.columna === 'NOCHE' ? ' · quienes pasan de día a noche descansan lunes' : ' · Status «Programar» solo aparece si el sistema no encontró un día válido')
    };
  }

  /* ---------- Tareo y convocatoria ---------- */
  /** ¿La persona descansa en esa fecha según los descansos publicados? descansos: [{ semana, asignaciones }] */
  function descansaEn(descansos, trabajadorId, fecha){
    const sem = lunesDe(fecha), d = diaSemana(fecha);
    return (descansos || []).some(x => x && x.semana === sem && (x.asignaciones || []).some(a => a.trabajadorId === trabajadorId && a.dia === d));
  }
  /** Mapa trabajadorId → día de descanso (0–6) para la columna DESC. de la imagen de la convocatoria. */
  const mapaDias = descansos => { const m = new Map(); (descansos || []).forEach(x => (x && x.asignaciones || []).forEach(a => { if(a.dia !== null && a.dia !== undefined) m.set(a.trabajadorId, a.dia); })); return m; };

  const API = { DIAS, LETRAS, DOM, LUN, CONFIG_FABRICA, STATUS, MINIMOS_PRUEBA, azar, nuevaSemilla, lunesDe, sumarDias, ddmm, diaSemana, fechasSemana, opera, minimoDia, diasSinOperar,
    bloqueEnSemana, personasDe, equidad, diasEnBloque, generarDescansos, evaluar, mover, statusTexto, modeloCuadro, descansaEn, mapaDias };
  if(typeof module !== 'undefined' && module.exports) module.exports = API;
  raiz.glacialDescansos = API;
})(typeof window !== 'undefined' ? window : globalThis);
