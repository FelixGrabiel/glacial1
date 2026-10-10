/* =============================================================
   GLACIAL · TAREO — HORAS EXTRAS, GRÁFICOS Y JORNADA LABORADA
   -------------------------------------------------------------
   Consulta (solo lectura) sobre los tareos reales: nunca guarda nada ni edita marcaciones.
   FUENTE ÚNICA de cada marcación: tareo.personal de su área (Producción u área oficial de Mantenimiento). El espejo de maquinistas en
   Mantenimiento no es otra jornada: los maquinistas se cuentan solo desde Producción (y si un tareo de Mantenimiento antiguo conserva uno, se
   ignora). Cada jornada se identifica por  área + persona (clave estable) + fecha operativa + turno; la fecha operativa es la del tareo
   (un turno Noche que cruza medianoche cuenta en la fecha en que empezó). No se fusionan turnos distintos de una persona.

   CÁLCULO (se reutiliza la lógica vigente, en minutos enteros para que tarjeta, serie, ranking y tabla sumen igual):
     programada = tareo.jornadaNormal de ESE tareo (no se asume 8 h ni se infiere del cargo)
     laborada   = calcularHorasTrabajadas(ingreso, salida, refrigerio)   (refrigerio descontado una sola vez)
     saldo      = laborada − programada → a favor (>0) y en contra (<0) SEPARADOS; nunca se compensan.
   ESTADOS de una jornada:
     válida     → Asistió con ingreso, salida y refrigerio completo (o sin refrigerio). 0 min es un resultado válido.
     pendiente  → Asistió pero falta ingreso, salida o la mitad del refrigerio: NO es 0 h ni saldo en contra; se muestra «Pendiente».
     sin registro / no laboró (falta, descanso…) / feriado y comisión externa (sin saldo en la lógica oficial) → no entran al cálculo.
   GRUPOS (no excluyentes): Producción y Mantenimiento = área del tareo; Supervisores y Maquinistas = cargo registrado en la jornada
   (histórico: un cambio de cargo posterior no borra el historial). Se filtra antes de agregar y solo dentro de las áreas visibles.
   ============================================================= */
(function instalarTareoHorasExtras(){
  'use strict';

  const GRUPOS = ['Producción','Mantenimiento','Supervisores','Maquinistas'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const FILTROS_JORNADA = [['todas','Todas'],['480','8 h'],['600','10 h'],['720','12 h'],['otras','Otras']];
  const estado = {grupo: 'Producción', periodo: 'mes', jornada: 'todas', trabajador: '', vista: 'extras', verTodas: false, anio: 0, mes: 0, detalle: false};
  let charts = [];

  const pad = n => String(n).padStart(2, '0');
  const esc = v => (typeof escaparHTML === 'function' ? escaparHTML(v) : String(v == null ? '' : v));
  const norm = t => (typeof tareoNormalizarTexto === 'function' ? tareoNormalizarTexto(t) : String(t || '').toLowerCase());
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const fechaLarga = s => pad(parse(s).getDate()) + '/' + pad(parse(s).getMonth() + 1) + '/' + parse(s).getFullYear();
  const fechaCorta = s => pad(parse(s).getDate()) + ' ' + MESES_CORTO[parse(s).getMonth()];

  /* Duraciones legibles: «1 h 30 min», nunca «1.30 h». */
  function dur(min){
    min = Math.round(Math.abs(Number(min) || 0));
    const h = Math.floor(min / 60), m = min % 60;
    if(h > 0) return h + ' h ' + pad(m) + ' min';
    return m + ' min';
  }
  function durCorta(min){
    min = Math.round(Math.abs(Number(min) || 0));
    const h = Math.floor(min / 60), m = min % 60;
    return m === 0 ? h + ' h' : (h > 0 ? h + ' h ' + pad(m) + ' min' : m + ' min');
  }

  /* ---------- períodos (fecha operativa de GLACIAL; sin días futuros) ---------- */
  function hoyOperativo(){
    try{
      const ms = typeof window.tareoAhoraServidor === 'function' ? window.tareoAhoraServidor() : Date.now();
      if(typeof GlacialIndicadores !== 'undefined' && GlacialIndicadores.diaOperativo) return GlacialIndicadores.diaOperativo(ms);
    }catch(_){ /* se usa el día natural */ }
    return iso(new Date());
  }
  function leerMes(){
    const a = Number(document.getElementById('tareo-resumen-año')?.value), m = Number(document.getElementById('tareo-resumen-mes')?.value);
    if(a && m){ estado.anio = a; estado.mes = m; }
    if(!estado.anio){ const h = parse(hoyOperativo()); estado.anio = h.getFullYear(); estado.mes = h.getMonth() + 1; }
  }
  function rango(){
    leerMes();
    const hoy = hoyOperativo();
    let desde, hasta, nombre;
    if(estado.periodo === 'hoy'){ desde = hasta = hoy; nombre = 'Hoy'; }
    else if(estado.periodo === 'semana'){
      const d = parse(hoy), dia = d.getDay() || 7;                   // semana de lunes a domingo (como la rotación semanal)
      desde = addDias(hoy, 1 - dia); hasta = hoy; nombre = 'Esta semana (lunes a domingo, hasta hoy)';
    }else{
      desde = estado.anio + '-' + pad(estado.mes) + '-01';
      const fin = iso(new Date(estado.anio, estado.mes, 0));
      hasta = fin > hoy ? hoy : fin;
      nombre = MESES[estado.mes - 1] + ' ' + estado.anio;
    }
    const vacio = hasta < desde;
    const etiqueta = vacio ? 'Sin días transcurridos en el período' : (desde === hasta ? fechaLarga(desde) : fechaCorta(desde) + ' – ' + fechaCorta(hasta) + ' ' + parse(hasta).getFullYear());
    return {desde, hasta, vacio, etiqueta, nombre};
  }
  function dias(r){
    const lista = [];
    if(r.vacio) return lista;
    for(let f = r.desde; f <= r.hasta; f = addDias(f, 1)) lista.push(f);
    return lista;
  }

  /* ---------- jornadas ---------- */
  const esMaq = p => (typeof tareoEsMaquinista === 'function' ? tareoEsMaquinista(p) : /\bmaquinista/.test(norm(p && p.cargo)));
  const esSup = p => /\bsupervisor/.test(norm(p && p.cargo));
  const hm = v => (typeof convertirHoraMinutos === 'function' ? convertirHoraMinutos(v) : null);
  function jornada(tareo, p){
    const area = tareoAreaDe(tareo), asist = tareoEstadoCanonico(p.asistencia);
    const prog = Math.round((Number(tareo.jornadaNormal) || 8) * 60);
    const r = {
      area, tareoId: tareo.id, fecha: tareo.fecha, turno: tareo.turno || '', clave: area + '|' + tareoClavePersona(p), persona: tareoClavePersona(p),
      nombre: p.nombre || '', dni: p.dni || '', cargo: p.cargo || '', maquinista: esMaq(p), supervisor: esSup(p), asistencia: asist,
      ingreso: p.horaIngreso || '', salidaRef: p.salidaRefrigerio || '', retornoRef: p.retornoRefrigerio || '', salida: p.horaSalida || '',
      programada: prog, laborada: null, saldo: null, estado: 'excluida', motivo: ''
    };
    if(asist !== 'Asistió') return r;                                 // sin registro, faltas, descansos, feriado y comisión: fuera del cálculo
    const ing = hm(p.horaIngreso), sal = hm(p.horaSalida);
    if(ing === null || ing === undefined){ r.estado = 'pendiente'; r.motivo = 'Falta la hora de ingreso'; return r; }
    if(sal === null || sal === undefined){ r.estado = 'pendiente'; r.motivo = 'Falta la hora de salida'; return r; }
    if(!!p.salidaRefrigerio !== !!p.retornoRefrigerio){ r.estado = 'pendiente'; r.motivo = 'Refrigerio incompleto'; return r; }
    const ref = typeof calcularMinutosRefrigerio === 'function' ? calcularMinutosRefrigerio(p.salidaRefrigerio, p.retornoRefrigerio) : 0;
    r.laborada = Math.round(calcularHorasTrabajadas(p.horaIngreso, p.horaSalida, ref / 60) * 60);
    r.saldo = r.laborada - prog;
    r.estado = 'valida';
    return r;
  }
  /* Todas las jornadas de las áreas visibles (una sola fuente, sin espejos ni duplicados). */
  function todas(){
    const areas = typeof tareoAreasVisibles === 'function' ? tareoAreasVisibles() : [];
    const mapa = new Map();
    obtenerTareos().forEach(t => {
      if(!t || !areas.includes(tareoAreaDe(t))) return;
      (t.personal || []).forEach(p => {
        if(!p) return;
        if(tareoAreaDe(t) === 'Mantenimiento' && esMaq(p)) return;     // el maquinista oficial está en Producción: el espejo no es otra jornada
        const r = jornada(t, p);
        if(r.estado === 'excluida') return;
        const k = r.clave + '|' + r.fecha + '|' + r.turno;
        const previo = mapa.get(k);
        if(!previo || (previo.estado !== 'valida' && r.estado === 'valida')) mapa.set(k, r);
      });
    });
    return [...mapa.values()];
  }
  const enGrupo = (r, g) => g === 'Producción' ? r.area === 'Producción' : g === 'Mantenimiento' ? r.area === 'Mantenimiento' : g === 'Supervisores' ? r.supervisor : r.maquinista;
  function gruposDisponibles(){
    const areas = typeof tareoAreasVisibles === 'function' ? tareoAreasVisibles() : [];
    return GRUPOS.filter(g => g === 'Producción' ? areas.includes('Producción') : g === 'Mantenimiento' ? areas.includes('Mantenimiento') : areas.length > 0);
  }
  function asegurarGrupo(){
    const ok = gruposDisponibles();
    if(!ok.includes(estado.grupo)) estado.grupo = ok[0] || 'Producción';
  }

  /* Datos del período y grupo: ÚNICA preparación; tarjeta, series, ranking y tabla salen de aquí (mismos minutos). */
  function datos(opc){
    opc = opc || {};
    asegurarGrupo();
    const r = rango();
    const lista = r.vacio ? [] : todas().filter(x => enGrupo(x, estado.grupo) && x.fecha >= r.desde && x.fecha <= r.hasta && (!opc.trabajador || x.clave === opc.trabajador));
    const validos = lista.filter(x => x.estado === 'valida'), pendientes = lista.filter(x => x.estado === 'pendiente');
    const favor = validos.reduce((s, x) => s + Math.max(0, x.saldo), 0), contra = validos.reduce((s, x) => s + Math.max(0, -x.saldo), 0);
    const porDia = new Map(dias(r).map(f => [f, {fecha: f, favor: 0, contra: 0, validos: 0, pendientes: 0, programada: 0, laborada: 0}]));
    lista.forEach(x => {
      const d = porDia.get(x.fecha); if(!d) return;
      if(x.estado === 'valida'){ d.validos++; d.favor += Math.max(0, x.saldo); d.contra += Math.max(0, -x.saldo); d.programada += x.programada; d.laborada += x.laborada; }
      else d.pendientes++;
    });
    const porTrab = new Map();
    validos.forEach(x => {
      if(!porTrab.has(x.clave)) porTrab.set(x.clave, {clave: x.clave, nombre: x.nombre, dni: x.dni, favor: 0, contra: 0});
      const t = porTrab.get(x.clave); t.favor += Math.max(0, x.saldo); t.contra += Math.max(0, -x.saldo);
    });
    return {rango: r, lista, validos, pendientes, favor, contra, porDia: [...porDia.values()], porTrab: [...porTrab.values()].sort((a, b) => b.favor - a.favor || String(a.nombre).localeCompare(String(b.nombre), 'es'))};
  }

  /* ---------- estilos ---------- */
  function estilos(){
    if(document.getElementById('tareo-he-css')) return;
    const s = document.createElement('style'); s.id = 'tareo-he-css';
    s.textContent =
      '.he-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}.he-kpis3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px}' +
      '.he-kpis .tareo-kpi,.he-kpis3 .tareo-kpi{min-height:112px}' +
      '.he-card-extras .he-sel{margin-left:8px;border:1px solid #cfdbe3;border-radius:8px;padding:2px 6px;font-size:12px;background:#fff;max-width:130px}' +
      '.he-card-extras strong{font-size:30px;display:block;margin:4px 0}.he-favor{color:#1e7f4e;font-weight:700;display:block}.he-enlace{background:none;border:0;color:#0b67d8;font-weight:700;cursor:pointer;padding:4px 0;font:inherit;font-size:13px}' +
      '.he-periodo{display:inline-flex;border:1px solid #cfdbe3;border-radius:10px;overflow:hidden;background:#fff}.he-periodo button{border:0;background:#fff;padding:9px 14px;font:inherit;font-size:13px;cursor:pointer;color:#33475b}.he-periodo button.activo{background:#0b67d8;color:#fff;font-weight:700}' +
      '.he-banner{display:flex;gap:10px;align-items:center;margin:0 0 12px;padding:10px 14px;border:1px solid #cfe0f2;background:#eaf3fd;border-radius:10px;color:#0b3a73}.he-banner b{font-weight:700}' +
      '.he-chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.he-chip{border:1px solid #cfdbe3;background:#fff;border-radius:8px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer;color:#33475b}.he-chip.activo{background:#0b67d8;border-color:#0b67d8;color:#fff;font-weight:700}' +
      '.he-estado{margin-left:auto;display:inline-flex;gap:6px;align-items:center;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:700}.he-estado.ok{background:#e6f4ea;color:#1e7f4e}.he-estado.pend{background:#fff4d9;color:#8a5a00}' +
      '.he-ind{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:12px 0}.he-ind>div{border:1px solid #e1e8ed;border-radius:12px;padding:14px 16px;background:#fff}.he-ind small{display:block;color:#5a6b78}.he-ind strong{font-size:26px;display:block;margin-top:4px}' +
      '.he-ind .favor strong{color:#10265f}.he-ind .contra strong{color:#c62828}.he-ind .pend strong{color:#8a5a00}' +
      '.he-graf{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:12px;margin-bottom:12px}.he-graf .panel-body{position:relative}.he-lienzo{position:relative;height:300px}' +
      '.he-vacio{padding:26px;text-align:center;color:#667784}.he-nota{font-size:12px;color:#667784}' +
      '.he-aviso{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:12px 0;padding:12px 16px;border:1px solid #f0d98c;background:#fff8e1;border-radius:10px;color:#6b4a00;flex-wrap:wrap}' +
      '.he-tabla td,.he-tabla th{white-space:nowrap}.he-pend{color:#8a5a00;font-weight:700}.he-neg{color:#c62828;font-weight:700}.he-link{background:none;border:0;padding:0;color:#005B96;cursor:pointer;font:inherit;text-decoration:underline;text-decoration-color:rgba(0,91,150,.35)}' +
      '.he-cab{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}.he-cab .field-sm{min-width:150px}' +
      '@media(max-width:1000px){.he-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.he-kpis3{grid-template-columns:repeat(2,minmax(0,1fr))}.he-graf{grid-template-columns:1fr}.he-ind{grid-template-columns:1fr}.he-estado{margin-left:0}}' +
      '@media(max-width:560px){.he-kpis,.he-kpis3{grid-template-columns:1fr}.he-periodo button{padding:9px 10px}}';
    document.head.appendChild(s);
  }

  /* ---------- gráficos (Chart.js ya incluido; las instancias se destruyen antes de volver a dibujar) ---------- */
  function destruir(){
    charts.forEach(c => { try{ c.destroy(); }catch(_){ /* ya destruido */ } });
    charts = [];
  }
  const etiquetasBarras = {
    id: 'heEtiquetas',
    afterDatasetsDraw(chart){
      const ctx = chart.ctx, horizontal = chart.options.indexAxis === 'y';
      ctx.save(); ctx.font = '600 11px sans-serif'; ctx.fillStyle = '#10265f'; ctx.textBaseline = 'middle';
      chart.data.datasets.forEach((ds, i) => {
        if(ds.sinEtiquetas) return;
        chart.getDatasetMeta(i).data.forEach((barra, j) => {
          const v = ds.data[j];
          if(v === null || v === undefined || Number.isNaN(v)) return;
          const t = durCorta(v * 60);
          if(horizontal){ ctx.textAlign = 'left'; ctx.fillText(t, barra.x + 6, barra.y); }
          else{ ctx.textAlign = 'center'; ctx.fillText(t, barra.x, barra.y - 9); }
        });
      });
      ctx.restore();
    }
  };
  function crearGrafico(id, config){
    const el = document.getElementById(id);
    if(!el || typeof Chart === 'undefined'){ if(el) el.parentNode.innerHTML = '<div class="he-vacio">No se cargó la biblioteca de gráficos. Los datos siguen disponibles en la tabla.</div>'; return null; }
    const c = new Chart(el.getContext('2d'), config);
    charts.push(c);
    return c;
  }
  const ejeHoras = {beginAtZero: true, title: {display: true, text: 'Horas'}, ticks: {callback: v => v + ' h'}};

  function graficoDias(d){
    const hayDatos = d.porDia.some(x => x.validos > 0);
    if(!hayDatos) return;
    crearGrafico('he-g-dias', {
      type: 'bar', plugins: [etiquetasBarras],
      data: {labels: d.porDia.map(x => fechaCorta(x.fecha)), datasets: [{
        label: 'Horas extras a favor', backgroundColor: '#0b72e0', borderRadius: 3, maxBarThickness: 38,
        data: d.porDia.map(x => x.validos > 0 ? x.favor / 60 : null)           // sin información suficiente = ausencia, no cero
      }]},
      options: {
        responsive: true, maintainAspectRatio: false, layout: {padding: {top: 18}},
        plugins: {legend: {display: false}, tooltip: {callbacks: {
          title: it => fechaLarga(d.porDia[it[0].dataIndex].fecha),
          label: it => { const x = d.porDia[it.dataIndex]; return 'Horas extras: ' + dur(x.favor) + (x.pendientes ? ' · ' + x.pendientes + ' pendiente(s)' : ''); }
        }}},
        scales: {y: ejeHoras, x: {grid: {display: false}}},
        onClick: (e, els) => { if(els.length) abrirDia(d.porDia[els[0].index].fecha); }
      }
    });
  }
  function graficoRanking(top){
    if(!top.length) return;
    crearGrafico('he-g-rank', {
      type: 'bar', plugins: [etiquetasBarras],
      data: {labels: top.map(x => x.nombre), datasets: [{label: 'Horas extras a favor', data: top.map(x => x.favor / 60), backgroundColor: top.map(x => x.otros ? '#9fb3c8' : '#0b72e0'), borderRadius: 3, maxBarThickness: 22}]},
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: {padding: {right: 70}},
        plugins: {legend: {display: false}, tooltip: {callbacks: {label: it => 'Horas extras a favor: ' + dur(top[it.dataIndex].favor)}}},
        scales: {x: {beginAtZero: true, ticks: {callback: v => v + ' h'}}, y: {grid: {display: false}}},
        onClick: (e, els) => { if(els.length && !top[els[0].index].otros) abrirDetalle(top[els[0].index].clave); }
      }
    });
  }

  /* ---------- tarjeta HORAS EXTRAS y panel (resumen) ---------- */
  function selectorGrupo(id){
    return '<select class="he-sel" id="' + id + '" aria-label="Grupo de horas extras" onchange="TareoHE.cambiarGrupo(this.value)">' +
      gruposDisponibles().map(g => '<option' + (g === estado.grupo ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select>';
  }
  function htmlTarjeta(d){
    return '<div class="tareo-kpi he-card-extras"><span class="tareo-kpi-label">HORAS EXTRAS ' + selectorGrupo('he-sel-tarjeta') + '</span>' +
      '<strong>' + dur(d.favor) + '</strong><span class="he-favor">A favor</span><small>Del período seleccionado</small>' +
      '<button type="button" class="he-enlace" onclick="TareoHE.abrirDetalle()">Ver detalle →</button></div>';
  }
  function topRanking(d, n){
    const top = d.porTrab.filter(x => x.favor > 0);
    const visibles = top.slice(0, n), resto = top.slice(n);
    const lista = visibles.map(x => Object.assign({}, x));
    if(resto.length) lista.push({nombre: 'Otros (' + resto.length + ')', favor: resto.reduce((s, x) => s + x.favor, 0), otros: true});
    return {lista, total: top.length};
  }
  function filtrarJornadas(lista){
    return lista.filter(x => {
      if(estado.jornada === 'todas') return true;
      if(x.estado !== 'valida') return false;
      if(estado.jornada === 'otras') return ![480, 600, 720].includes(x.laborada);
      return x.laborada === Number(estado.jornada);
    });
  }
  function celdaTrab(x){ return '<button type="button" class="he-link" onclick="TareoHE.abrirDetalle(' + esc(JSON.stringify(x.clave)) + ')">' + esc(x.nombre) + '</button>'; }
  function htmlTablaJornadas(d, lista, conTrabajador){
    const orden = lista.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
    const limite = estado.verTodas ? orden.length : 60;
    const filas = orden.slice(0, limite).map(x => {
      const val = x.estado === 'valida';
      return '<tr><td><button type="button" class="he-link" onclick="TareoHE.abrirJornada(' + esc(JSON.stringify(x.tareoId + '||' + x.persona)) + ')">' + fechaLarga(x.fecha) + '</button>' +
        (x.turno ? ' <small class="small-muted">' + esc(x.turno) + '</small>' : '') + '</td>' +
        '<td>' + celdaTrab(x) + '</td><td>' + dur(x.programada) + '</td>' +
        '<td>' + (val ? '<strong>' + dur(x.laborada) + '</strong>' : '<span class="he-pend" title="' + esc(x.motivo) + '">Pendiente</span>') + '</td>' +
        '<td>' + (val ? dur(Math.max(0, x.saldo)) : '<span class="he-pend">Pendiente</span>') + '</td>' +
        '<td>' + (val ? (x.saldo < 0 ? '<span class="he-neg">' + dur(-x.saldo) + '</span>' : '—') : '<span class="he-pend">Pendiente</span>') + '</td></tr>';
    }).join('');
    return {html: filas, total: orden.length, mostrados: Math.min(limite, orden.length)};
  }
  function htmlPanel(d){
    const r = d.rango;
    const top = topRanking(d, 5);
    const jor = filtrarJornadas(d.lista), tabla = htmlTablaJornadas(d, jor);
    const completo = d.pendientes.length === 0;
    return '<div class="he-banner" role="status"><span aria-hidden="true">ⓘ</span><span>Período seleccionado: <b>' + esc(r.etiqueta) + '</b>' +
        (estado.periodo === 'mes' ? ' · ' + esc(r.nombre) : '') + '</span></div>' +
      '<div class="panel"><div class="panel-body"><div class="he-chips" role="group" aria-label="Grupo de horas extras"><strong style="margin-right:6px">Horas extras</strong>' +
        gruposDisponibles().map(g => '<button type="button" class="he-chip' + (g === estado.grupo ? ' activo' : '') + '" aria-pressed="' + (g === estado.grupo) + '" onclick="TareoHE.cambiarGrupo(' + esc(JSON.stringify(g)) + ')">' + esc(g) + '</button>').join('') +
        '<span class="he-estado ' + (completo ? 'ok' : 'pend') + '">' + (completo ? '✔ Registros completos' : '⚠ ' + d.pendientes.length + ' registro(s) pendiente(s)') + '</span></div>' +
      '<div class="he-nota" style="margin-top:6px">Los grupos no son excluyentes: Supervisores y Maquinistas pueden pertenecer a Producción o a Mantenimiento. No se suman entre sí.</div>' +
      '<div class="he-ind"><div class="favor"><small>Horas extras a favor</small><strong>' + dur(d.favor) + '</strong></div>' +
        '<div class="contra"><small>Saldo en contra</small><strong>' + dur(d.contra) + '</strong></div>' +
        '<div class="pend"><small>Registros pendientes</small><strong>' + d.pendientes.length + '</strong></div></div></div></div>' +
      '<div class="he-graf"><div class="panel"><div class="panel-head"><div><h3>Horas extras por día</h3><div class="small-muted">' + esc(estado.grupo) + ' · ' + esc(r.nombre) + '</div></div></div>' +
        '<div class="panel-body">' + (d.porDia.some(x => x.validos > 0) ? '<div class="he-lienzo"><canvas id="he-g-dias" role="img" aria-label="Horas extras a favor por día"></canvas></div>' : '<div class="he-vacio">Sin jornadas completas para graficar en este período.' + (d.pendientes.length ? ' Hay ' + d.pendientes.length + ' pendiente(s) de cálculo.' : '') + '</div>') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><div><h3>Trabajadores con más horas extras</h3><div class="small-muted">' + esc(estado.grupo) + ' · Período seleccionado</div></div></div><div class="panel-body">' +
        (top.lista.length ? '<div class="he-lienzo" style="height:' + Math.max(180, top.lista.length * 40 + 30) + 'px"><canvas id="he-g-rank" role="img" aria-label="Trabajadores con más horas extras"></canvas></div>' : '<div class="he-vacio">Nadie con horas extras a favor en este período.</div>') +
        '<div style="text-align:right"><button type="button" class="he-enlace" onclick="TareoHE.abrirDetalle()">Ver por trabajador →</button></div></div></div></div>' +
      '<div class="panel"><div class="panel-head"><div><h3>Jornadas laboradas</h3><div class="small-muted">Horas efectivamente trabajadas según el tareo</div></div>' +
        '<div class="field-sm" style="min-width:150px"><label for="he-jor">Jornada laborada</label><select id="he-jor" onchange="TareoHE.cambiarJornada(this.value)">' +
        FILTROS_JORNADA.map(([v, t]) => '<option value="' + v + '"' + (estado.jornada === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div></div>' +
        '<div class="panel-body"><div class="tareo-table-scroll"><table class="tareo-table he-tabla"><thead><tr><th>Fecha</th><th>Trabajador</th><th>Jornada programada</th><th>Jornada laborada</th><th>Horas extras</th><th>Saldo en contra</th></tr></thead><tbody>' +
        (tabla.html || '<tr><td colspan="6" class="small-muted">Sin jornadas para este filtro.</td></tr>') + '</tbody></table></div>' +
        '<div class="he-nota" style="margin-top:6px">' + (estado.jornada !== 'todas' ? 'El filtro de jornada (duración exacta) solo afecta a esta tabla; los totales de arriba no cambian. Los pendientes se ven en «Todas». ' : '') +
        (tabla.total > tabla.mostrados ? 'Mostrando ' + tabla.mostrados + ' de ' + tabla.total + '. <button type="button" class="he-enlace" onclick="TareoHE.verTodas()">Ver todas</button>' : tabla.total + ' jornada(s).') + '</div></div></div>' +
      (d.pendientes.length ? '<div class="he-aviso"><span><b>Registros incompletos:</b> pendientes de cálculo (' + d.pendientes.length + ')</span><button type="button" class="he-enlace" onclick="TareoHE.revisar()">Revisar →</button></div>' : '');
  }

  /* Dibuja la tarjeta y el panel dentro del resumen; también se llama cuando llegan cambios de otros equipos. */
  function refrescar(){
    const slot = document.getElementById('tareo-he-tarjeta'), raiz = document.getElementById('tareo-he-raiz');
    if(!slot && !raiz){ destruir(); return; }
    try{
      estilos(); destruir();
      const d = datos();
      if(slot) slot.innerHTML = htmlTarjeta(d);
      if(raiz){
        raiz.innerHTML = htmlPanel(d);
        graficoDias(d);
        const top = topRanking(d, 5);
        graficoRanking(top.lista);
      }
      document.querySelectorAll('.he-periodo button').forEach(b => { b.classList.toggle('activo', b.getAttribute('data-p') === estado.periodo); b.setAttribute('aria-pressed', b.getAttribute('data-p') === estado.periodo); });
    }catch(e){ console.warn('Horas extras:', e && e.message || e); }
  }
  function htmlControlesPeriodo(){
    estilos();
    return '<div class="he-periodo" role="group" aria-label="Período de horas extras">' +
      [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Mes']].map(([v, t]) => '<button type="button" data-p="' + v + '" class="' + (estado.periodo === v ? 'activo' : '') + '" aria-pressed="' + (estado.periodo === v) + '" onclick="TareoHE.cambiarPeriodo(\'' + v + '\')">' + t + '</button>').join('') + '</div>';
  }
  const cambiarGrupo = g => { estado.grupo = g; estado.trabajador = estado.detalle ? '' : estado.trabajador; if(estado.detalle) renderDetalle(); else refrescar(); };
  const cambiarPeriodo = p => { estado.periodo = p; estado.verTodas = false; if(estado.detalle) renderDetalle(); else refrescar(); };
  const cambiarJornada = v => { estado.jornada = v; estado.verTodas = false; refrescar(); };
  const verTodas = () => { estado.verTodas = true; refrescar(); };

  /* ---------- modales de consulta: marcaciones de un día / pendientes ---------- */
  function abrirModal(titulo, cuerpo){
    const raiz = document.getElementById('modal-root');
    if(!raiz) return;
    raiz.innerHTML = '<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal" style="max-width:860px;width:96vw" role="dialog" aria-modal="true"><div class="modal-head"><h3>' + esc(titulo) +
      '</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button></div><div class="modal-body">' + cuerpo + '</div></div></div>';
  }
  function filaMarcaciones(x){
    const val = x.estado === 'valida';
    return '<tr><td>' + fechaLarga(x.fecha) + (x.turno ? ' <small class="small-muted">' + esc(x.turno) + '</small>' : '') + '</td><td>' + celdaTrab(x) + '</td><td>' + esc(x.ingreso || '—') + '</td>' +
      '<td>' + (x.salidaRef || x.retornoRef ? esc(x.salidaRef || '—') + ' – ' + esc(x.retornoRef || '—') : 'Sin refrigerio') + '</td><td>' + esc(x.salida || '—') + '</td>' +
      '<td>' + dur(x.programada) + '</td><td>' + (val ? '<strong>' + dur(x.laborada) + '</strong>' : '<span class="he-pend" title="' + esc(x.motivo) + '">Pendiente</span>') + '</td>' +
      '<td>' + (val ? dur(Math.max(0, x.saldo)) : '<span class="he-pend">Pendiente</span>') + '</td><td>' + (val ? (x.saldo < 0 ? '<span class="he-neg">' + dur(-x.saldo) + '</span>' : '—') : '<span class="he-pend">Pendiente</span>') + '</td></tr>';
  }
  const cabeceraMarcaciones = '<thead><tr><th>Fecha</th><th>Trabajador</th><th>Ingreso</th><th>Refrigerio</th><th>Salida</th><th>Programada</th><th>Laborada</th><th>Extras</th><th>Saldo en contra</th></tr></thead>';
  function abrirDia(fecha){
    const d = datos({});
    const lista = d.lista.filter(x => x.fecha === fecha && (!estado.trabajador || x.clave === estado.trabajador));
    abrirModal('Jornadas del ' + fechaLarga(fecha) + ' · ' + estado.grupo,
      '<div class="tareo-table-scroll"><table class="tareo-table he-tabla">' + cabeceraMarcaciones + '<tbody>' + (lista.map(filaMarcaciones).join('') || '<tr><td colspan="9">Sin jornadas.</td></tr>') + '</tbody></table></div>' +
      '<p class="he-nota">Consulta: las correcciones de marcaciones se hacen en el tareo original, por quien tiene permiso.</p>');
  }
  function abrirJornada(id){
    const [tareoId, persona] = String(id).split('||');
    const d = datos({});
    const x = d.lista.find(j => j.tareoId === tareoId && j.persona === persona);
    if(!x) return;
    abrirModal('Marcaciones de ' + x.nombre, '<div class="tareo-table-scroll"><table class="tareo-table he-tabla">' + cabeceraMarcaciones + '<tbody>' + filaMarcaciones(x) + '</tbody></table></div>' +
      (x.estado !== 'valida' ? '<p class="he-pend">' + esc(x.motivo) + '</p>' : ''));
  }
  function revisar(){
    const d = datos({});
    abrirModal('Registros pendientes de cálculo · ' + estado.grupo + ' · ' + d.rango.etiqueta,
      '<div class="tareo-table-scroll"><table class="tareo-table he-tabla"><thead><tr><th>Fecha</th><th>Trabajador</th><th>Turno</th><th>Qué falta</th></tr></thead><tbody>' +
      (d.pendientes.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(x => '<tr><td>' + fechaLarga(x.fecha) + '</td><td>' + celdaTrab(x) + '</td><td>' + esc(x.turno) + '</td><td class="he-pend">' + esc(x.motivo) + '</td></tr>').join('') || '<tr><td colspan="4">Nada pendiente.</td></tr>') +
      '</tbody></table></div><p class="he-nota">No se calcula un saldo hasta completar las marcaciones. Corrígelas en el tareo original.</p>');
  }

  /* ---------- detalle por trabajador ---------- */
  function trabajadoresDelGrupo(){
    const r = rango();
    const mapa = new Map();
    todas().forEach(x => { if(enGrupo(x, estado.grupo) && !r.vacio && x.fecha >= r.desde && x.fecha <= r.hasta && !mapa.has(x.clave)) mapa.set(x.clave, x); });
    if(estado.trabajador && !mapa.has(estado.trabajador)){
      const x = todas().find(j => j.clave === estado.trabajador); if(x) mapa.set(x.clave, x);
    }
    return [...mapa.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  }
  function abrirDetalle(clave){
    if(clave) estado.trabajador = clave;
    estado.detalle = true;
    if(typeof closeModal === 'function') closeModal();
    renderDetalle();
  }
  function volver(){
    estado.detalle = false;
    destruir();
    if(typeof renderResumenMensualTareoUI === 'function') renderResumenMensualTareoUI();
  }
  function cambiarTrabajador(c){ estado.trabajador = c; renderDetalle(); }
  function cambiarVista(v){ estado.vista = v; renderDetalle(); }
  function cambiarMesDetalle(){
    const a = Number(document.getElementById('he-d-anio')?.value), m = Number(document.getElementById('he-d-mes')?.value);
    if(a && m){ estado.anio = a; estado.mes = m; }
    renderDetalle();
  }
  function renderDetalle(){
    const main = document.getElementById('main'); if(!main) return;
    estilos(); destruir();
    asegurarGrupo(); leerMes();
    const lista = trabajadoresDelGrupo();
    if(!estado.trabajador || !lista.some(x => x.clave === estado.trabajador)) estado.trabajador = lista[0] ? lista[0].clave : '';
    const d = datos({trabajador: estado.trabajador});
    const persona = lista.find(x => x.clave === estado.trabajador);
    // Indicadores: fechas operativas distintas (no filas duplicadas); jornada máxima con su fecha.
    const fechasConExtras = new Set(d.validos.filter(x => x.saldo > 0).map(x => x.fecha));
    const maxima = d.validos.reduce((m, x) => (!m || x.laborada > m.laborada) ? x : m, null);
    const filas = d.lista.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.turno).localeCompare(String(b.turno)));
    const homonimo = x => lista.filter(y => y.nombre === x.nombre).length > 1;
    main.innerHTML =
      '<div class="main-head"><div><h2>HORAS EXTRAS POR TRABAJADOR</h2><div class="sub">Consulta de jornadas según el tareo</div></div>' +
      '<button class="btn btn-ghost" onclick="TareoHE.volver()">← Volver al resumen</button></div>' +
      (typeof tareoRenderTabs === 'function' ? tareoRenderTabs('resumen') : '') +
      '<div class="panel"><div class="panel-body"><div class="he-cab">' +
        '<div class="field-sm"><label for="he-d-grupo">Grupo</label><select id="he-d-grupo" onchange="TareoHE.cambiarGrupo(this.value)">' + gruposDisponibles().map(g => '<option' + (g === estado.grupo ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select></div>' +
        '<div class="field-sm" style="min-width:260px"><label for="he-d-trab">Trabajador</label><select id="he-d-trab" onchange="TareoHE.cambiarTrabajador(this.value)">' +
          (lista.map(x => '<option value="' + esc(x.clave) + '"' + (x.clave === estado.trabajador ? ' selected' : '') + '>' + esc(x.nombre) + (homonimo(x) && x.dni ? ' · DNI ' + esc(x.dni) : '') + ' (' + esc(x.area) + ')</option>').join('') || '<option value="">Sin trabajadores en el período</option>') + '</select></div>' +
        '<div>' + htmlControlesPeriodo() + '</div>' +
        (estado.periodo === 'mes' ? '<div class="field-sm"><label for="he-d-mes">Mes</label><select id="he-d-mes" onchange="TareoHE.cambiarMesDetalle()">' + MESES.map((n, i) => '<option value="' + (i + 1) + '"' + (i + 1 === estado.mes ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
          '<div class="field-sm" style="min-width:100px"><label for="he-d-anio">Año</label><input id="he-d-anio" type="number" min="2020" max="2100" value="' + estado.anio + '" onchange="TareoHE.cambiarMesDetalle()"></div>' : '') +
      '</div></div></div>' +
      '<div class="he-banner" role="status"><span aria-hidden="true">ⓘ</span><span>Período seleccionado: <b>' + esc(d.rango.etiqueta) + '</b>' + (persona ? ' · ' + esc(persona.nombre) : '') + '</span></div>' +
      '<div class="he-kpis">' +
        '<div class="tareo-kpi"><span class="tareo-kpi-label">HORAS EXTRAS A FAVOR</span><strong class="tareo-good">' + dur(d.favor) + '</strong></div>' +
        '<div class="tareo-kpi"><span class="tareo-kpi-label">SALDO EN CONTRA</span><strong class="tareo-bad">' + dur(d.contra) + '</strong></div>' +
        '<div class="tareo-kpi"><span class="tareo-kpi-label">DÍAS CON HORAS EXTRAS</span><strong>' + fechasConExtras.size + '</strong></div>' +
        '<div class="tareo-kpi"><span class="tareo-kpi-label">JORNADA MÁXIMA LABORADA</span><strong>' + (maxima ? dur(maxima.laborada) : '—') + '</strong><small>' + (maxima ? fechaLarga(maxima.fecha) : 'Sin jornadas completas') + '</small></div></div>' +
      '<div class="panel"><div class="panel-head"><div><h3>' + (estado.vista === 'extras' ? 'Horas extras por día' : 'Jornada programada y laborada') + '</h3><div class="small-muted">' + esc(persona ? persona.nombre : '—') + ' · ' + esc(d.rango.nombre) + '</div></div>' +
        '<div class="field-sm" style="min-width:200px"><label for="he-d-vista">Vista</label><select id="he-d-vista" onchange="TareoHE.cambiarVista(this.value)"><option value="extras"' + (estado.vista === 'extras' ? ' selected' : '') + '>Horas extras</option><option value="jornada"' + (estado.vista === 'jornada' ? ' selected' : '') + '>Jornada laborada</option></select></div></div>' +
        '<div class="panel-body">' + (d.porDia.some(x => x.validos > 0) ? '<div class="he-lienzo"><canvas id="he-g-det" role="img" aria-label="Gráfico del trabajador"></canvas></div>' : '<div class="he-vacio">Sin jornadas completas para graficar en este período.</div>') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><h3>Detalle diario</h3></div><div class="panel-body"><div class="tareo-table-scroll"><table class="tareo-table he-tabla"><thead><tr><th>Fecha</th><th>Ingreso</th><th>Refrigerio</th><th>Salida</th><th>Programada</th><th>Laborada</th><th>Extras</th><th>Saldo en contra</th></tr></thead><tbody>' +
        (filas.map(x => { const val = x.estado === 'valida';
          return '<tr><td><button type="button" class="he-link" onclick="TareoHE.abrirDiaPersona(' + esc(JSON.stringify(x.fecha)) + ')">' + fechaLarga(x.fecha) + '</button>' + (x.turno ? ' <small class="small-muted">' + esc(x.turno) + '</small>' : '') + '</td><td>' + esc(x.ingreso || '—') + '</td>' +
            '<td>' + (x.salidaRef || x.retornoRef ? esc(x.salidaRef || '—') + ' – ' + esc(x.retornoRef || '—') : 'Sin refrigerio') + '</td><td>' + esc(x.salida || '—') + '</td><td>' + dur(x.programada) + '</td>' +
            '<td>' + (val ? '<strong>' + dur(x.laborada) + '</strong>' : '<span class="he-pend" title="' + esc(x.motivo) + '">Pendiente</span>') + '</td><td>' + (val ? dur(Math.max(0, x.saldo)) : '<span class="he-pend">Pendiente</span>') + '</td>' +
            '<td>' + (val ? (x.saldo < 0 ? '<span class="he-neg">' + dur(-x.saldo) + '</span>' : '—') : '<span class="he-pend">Pendiente</span>') + '</td></tr>'; }).join('') || '<tr><td colspan="8" class="small-muted">Sin jornadas en este período.</td></tr>') +
        '</tbody></table></div></div></div>';
    if(d.porDia.some(x => x.validos > 0)){
      if(estado.vista === 'extras'){
        crearGrafico('he-g-det', {
          type: 'bar', plugins: [etiquetasBarras],
          data: {labels: d.porDia.map(x => fechaCorta(x.fecha)), datasets: [{label: 'Horas extras a favor', backgroundColor: '#0b72e0', borderRadius: 3, maxBarThickness: 38, data: d.porDia.map(x => x.validos > 0 ? x.favor / 60 : null)}]},
          options: {responsive: true, maintainAspectRatio: false, layout: {padding: {top: 18}}, plugins: {legend: {display: false}, tooltip: {callbacks: {title: it => fechaLarga(d.porDia[it[0].dataIndex].fecha), label: it => 'Horas extras: ' + dur(d.porDia[it.dataIndex].favor)}}},
            scales: {y: ejeHoras, x: {grid: {display: false}}}, onClick: (e, els) => { if(els.length) abrirDiaPersona(d.porDia[els[0].index].fecha); }}
        });
      }else{
        crearGrafico('he-g-det', {
          type: 'bar',
          data: {labels: d.porDia.map(x => fechaCorta(x.fecha)), datasets: [
            {label: 'Jornada programada', backgroundColor: '#9aa8b1', borderRadius: 3, maxBarThickness: 26, data: d.porDia.map(x => x.validos > 0 ? x.programada / 60 : null)},
            {label: 'Jornada laborada', backgroundColor: '#0b72e0', borderRadius: 3, maxBarThickness: 26, data: d.porDia.map(x => x.validos > 0 ? x.laborada / 60 : null)}]},
          options: {responsive: true, maintainAspectRatio: false, plugins: {legend: {display: true, position: 'bottom'}, tooltip: {callbacks: {
              title: it => fechaLarga(d.porDia[it[0].dataIndex].fecha),
              label: it => { const x = d.porDia[it.dataIndex]; return it.dataset.label + ': ' + dur(it.datasetIndex === 0 ? x.programada : x.laborada); },
              afterBody: it => { const x = d.porDia[it[0].dataIndex]; return 'Horas extras: ' + dur(x.favor); }}}},
            scales: {y: ejeHoras, x: {grid: {display: false}}}, onClick: (e, els) => { if(els.length) abrirDiaPersona(d.porDia[els[0].index].fecha); }}
        });
      }
    }
  }
  function abrirDiaPersona(fecha){
    const d = datos({trabajador: estado.trabajador});
    const lista = d.lista.filter(x => x.fecha === fecha);
    abrirModal('Marcaciones del ' + fechaLarga(fecha),
      '<div class="tareo-table-scroll"><table class="tareo-table he-tabla">' + cabeceraMarcaciones + '<tbody>' + (lista.map(filaMarcaciones).join('') || '<tr><td colspan="9">Sin jornadas.</td></tr>') + '</tbody></table></div>');
  }

  /* Los cambios que llegan de otros equipos actualizan estas consultas sin reconstruir el formulario de edición. */
  if(typeof window.onTareosUpdated === 'function'){
    const anterior = window.onTareosUpdated;
    const nueva = function(){
      const r = anterior.apply(this, arguments);
      try{
        if(document.getElementById('tareo-he-raiz') || document.getElementById('tareo-he-tarjeta')) refrescar();
        else if(estado.detalle && document.getElementById('he-d-trab')) renderDetalle();
        else if(!document.getElementById('he-g-det')) destruir();
      }catch(_){ /* informativo */ }
      return r;
    };
    window.onTareosUpdated = nueva;
    try{ onTareosUpdated = nueva; }catch(_){ /* ya en window */ }
  }

  window.TareoHE = {
    estado, GRUPOS, datos, rango, jornada, todas, enGrupo, dur, durCorta, filtrarJornadas, topRanking, gruposDisponibles,
    refrescar, htmlControlesPeriodo, cambiarGrupo, cambiarPeriodo, cambiarJornada, verTodas, abrirDetalle, abrirDia, abrirJornada, revisar, volver,
    cambiarTrabajador, cambiarVista, cambiarMesDetalle, abrirDiaPersona, renderDetalle, destruir, charts: () => charts.length
  };
})();
