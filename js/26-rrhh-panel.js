/* GLACIAL · Inicio de RRHH: pendientes del tareo en tiempo real.
   Cargar después de 13-tareo.js y 20-tareo-control.js, antes de 12-init.js.
   No guarda ni modifica tareos; utiliza las vistas existentes para resolverlos. */
(function instalarInicioRRHH(){
  'use strict';
  let fechaElegida = null; // null: jornada operativa actual.
  const esc = valor => escaparHTML(String(valor ?? ''));
  const areas = ['Producción','Mantenimiento'];
  const turnos = ['Día','Noche'];

  const estilo=document.createElement('style');
  estilo.textContent=`
    .rh-inicio{display:grid;gap:16px;padding-bottom:24px}
    .rh-intro{display:flex;justify-content:space-between;align-items:flex-end;
      flex-wrap:wrap;gap:12px}
    .rh-intro h2{margin:0;color:var(--blue-deep,#003b5c)}
    .rh-intro p{margin:4px 0 0;color:var(--steel,#667784)}
    .rh-fecha{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
    .rh-fecha label{font-size:12px;font-weight:700}
    .rh-fecha input{min-height:38px;border:1px solid var(--line-strong,#b9c5cd);
      border-radius:7px;padding:6px 9px;background:#fff;color:inherit}
    .rh-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px}
    .rh-kpi{background:#fff;border:1px solid var(--line,#dce3e8);
      border-radius:9px;padding:13px;display:flex;flex-direction:column;gap:3px}
    .rh-kpi span{font-size:12px;color:var(--steel,#667784)}
    .rh-kpi strong{font-size:26px;line-height:1.2;color:var(--blue-deep,#003b5c)}
    .rh-kpi[data-rh-alerta] strong{color:#bd4232}
    .rh-panel{background:#fff;border:1px solid var(--line,#dce3e8);border-radius:10px;
      overflow:hidden}
    .rh-panel-head{padding:14px 16px;border-bottom:1px solid var(--line,#dce3e8)}
    .rh-panel-head h3{margin:0;color:var(--blue-deep,#003b5c)}
    .rh-panel-head p{margin:4px 0 0;font-size:12px;color:var(--steel,#667784)}
    .rh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(265px,1fr));gap:11px;
      padding:13px}
    .rh-turno{border:1px solid var(--line,#dce3e8);border-radius:9px;padding:13px;
      background:var(--panel-soft,#f8fafb)}
    .rh-turno[data-rh-estado="pendiente"]{border-left:4px solid #c4472b}
    .rh-turno[data-rh-estado="futuro"]{opacity:.72}
    .rh-turno-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
    .rh-turno-head strong{color:var(--blue-deep,#003b5c)}
    .rh-marca{font-size:11px;font-weight:700;color:#9c4d18}
    .rh-turno p{margin:7px 0;font-size:12px;color:#405261}
    .rh-turno small{display:block;line-height:1.5;color:#536779;overflow-wrap:anywhere}
    .rh-turno button{margin-top:10px}
    .rh-accesos{display:flex;gap:8px;flex-wrap:wrap;padding:13px}
    .rh-accesos button{min-height:38px}
    @media(max-width:550px){.rh-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
      .rh-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(estilo);

  function fechaValida(valor){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(valor))return false;
    const [a,m,d]=valor.split('-').map(Number);
    const fecha=new Date(a,m-1,d);
    return fecha.getFullYear()===a && fecha.getMonth()===m-1 && fecha.getDate()===d;
  }
  function anteriorDe(fecha){
    const [a,m,d]=fecha.split('-').map(Number);
    return tareoFechaISO(new Date(a,m-1,d-1));
  }
  function fechaOperativa(ahora){
    const hoy=tareoFechaISO(ahora);
    return ahora.getHours()<7 ? anteriorDe(hoy) : hoy;
  }
  function turnosVisibles(ahora){
    const hoy=tareoFechaISO(ahora);
    const fecha=fechaElegida || fechaOperativa(ahora);
    const claves=[];
    // Al amanecer se conserva el cierre de Noche de ayer hasta las 12:00.
    if(!fechaElegida && fecha===hoy && ahora.getHours()>=7 && ahora.getHours()<12){
      areas.forEach(area=>claves.push({area,fecha:anteriorDe(hoy),turno:'Noche',anterior:true}));
    }
    areas.forEach(area=>turnos.forEach(turno=>claves.push({area,fecha,turno})));
    return claves.map(c=>({ ...c, iniciada:c.fecha<hoy ||
      // El Tareo usa 07:00 / 19:00 por defecto (13-tareo.js).
      (c.fecha===hoy && ahora.getHours()>=(c.turno==='Día'?7:19)) }));
  }
  function pendientes(tareo){
    const personal=Array.isArray(tareo?.personal) ? tareo.personal : [];
    const sinEstado=[],porJustificar=[];
    let tardanzas=0,ausencias=0;
    personal.forEach(p=>{
      const estado=tareoEstadoCanonico(p.asistencia);
      if(!estado)sinEstado.push(p.nombre || 'Sin nombre');
      if(estado==='Falta por justificar')porJustificar.push(p.nombre || 'Sin nombre');
      if(['Falta por justificar','Falta justificada','Descanso médico'].includes(estado))ausencias++;
      if(Number(p.tardanzaMinutos)>0)tardanzas++;
    });
    return {sinEstado,porJustificar,tardanzas,ausencias,total:personal.length};
  }
  function abrirTareo(area,fecha,turno){
    if(!tienePermiso('moduloRRHH') || !areas.includes(area) ||
      !turnos.includes(turno) || !fechaValida(fecha))return;
    tareoAbrir(area,fecha,turno);
  }
  function resumenFilas(ahora){
    return turnosVisibles(ahora).map(c=>{
      const tareo=tareoBuscar(c.area,c.fecha,c.turno);
      return {...c,tareo,detalle:pendientes(tareo)};
    });
  }
  function tarjeta(x){
    const p=x.detalle;
    const sinTareo=!x.tareo && x.iniciada;
    const revisar=!!x.tareo && (p.sinEstado.length || p.porJustificar.length || !p.total);
    const estado=!x.iniciada && !x.tareo?'futuro':
      (sinTareo || revisar ? 'pendiente' : 'al-dia');
    const descripcion=!x.tareo
      ? (x.iniciada?'Aún no se registró un tareo. No se atribuyen faltas sin registro.'
          :'El turno todavía no empieza.')
      : !p.total ? 'Tareo vacío: revisar personal asignado.'
        : `${p.total} personas · ${p.sinEstado.length} sin estado · `+
          `${p.porJustificar.length} faltas por justificar · ${p.tardanzas} tardanzas`;
    const nombres=[...p.sinEstado,...p.porJustificar].filter((n,i,a)=>a.indexOf(n)===i);
    return `<article class="rh-turno" data-rh-estado="${estado}">
      <div class="rh-turno-head"><strong>${esc(x.area)} · ${esc(x.turno)}</strong>
        <span class="rh-marca">${x.anterior?'NOCHE ANTERIOR':
          !x.iniciada && !x.tareo?'PRÓXIMO':sinTareo || revisar?'REVISAR':'REGISTRADO'}</span></div>
      <small>${esc(formatearFecha(x.fecha))}</small>
      <p>${esc(descripcion)}</p>
      ${nombres.length ? `<small>Por revisar: ${esc(nombres.slice(0,3).join(', '))}${
        nombres.length>3 ? ` y ${nombres.length-3} más` : ''}</small>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-rh-tareo
        data-rh-area="${esc(x.area)}" data-rh-fecha="${esc(x.fecha)}"
        data-rh-turno="${esc(x.turno)}">${x.tareo?'Abrir tareo':'Crear tareo'}</button>
      </article>`;
  }

  const renderAnterior=renderRRHHModulo;
  renderRRHHModulo=function(){
    if(!tienePermiso('moduloRRHH'))return renderAnterior();
    const main=document.getElementById('main');
    if(!main)return;
    const ahora=new Date(),fecha=fechaElegida || fechaOperativa(ahora);
    const listo=typeof _tareosReady==='undefined' || _tareosReady;
    const filas=listo ? resumenFilas(ahora) : [];
    const sinAbrir=filas.filter(x=>x.iniciada && !x.tareo).length;
    const sinEstado=filas.reduce((n,x)=>n+x.detalle.sinEstado.length,0);
    const porJustificar=filas.reduce((n,x)=>n+x.detalle.porJustificar.length,0);
    const tardanzas=filas.reduce((n,x)=>n+x.detalle.tardanzas,0);
    const ausencias=filas.reduce((n,x)=>n+x.detalle.ausencias,0);
    const kpis=[
      ['Tareos sin registrar',sinAbrir],
      ['Personas sin estado',sinEstado],
      ['Faltas por justificar',porJustificar],
      ['Tardanzas registradas',tardanzas],
      ['Ausencias registradas',ausencias]
    ];
    main.innerHTML=`<div id="rh-inicio" class="rh-inicio">
      <div class="rh-intro"><div><h2>RRHH · Pendientes</h2>
        <p>Producción y Mantenimiento · Tareo Día desde 07:00, Noche desde 19:00</p></div>
        <div class="rh-fecha"><label for="rh-fecha">Jornada</label>
          <input id="rh-fecha" type="date" value="${esc(fecha)}"
            max="${tareoFechaISO(ahora)}">
          <button type="button" class="btn btn-ghost btn-sm" data-rh-hoy>Hoy</button></div>
      </div>
      ${tareoRenderTabs('inicio-rrhh')}
      ${!listo ? '<div class="rh-panel"><div class="rh-panel-head"><h3>Cargando tareos…</h3></div></div>' : `
        <div class="rh-kpis">${kpis.map(([etiqueta,cantidad],i)=>`
          <div class="rh-kpi" ${i<3 && cantidad?'data-rh-alerta':''}>
            <span>${esc(etiqueta)}</span><strong>${cantidad}</strong></div>`).join('')}</div>
        <section class="rh-panel"><div class="rh-panel-head"><h3>Turnos a revisar</h3>
          <p>Noche conserva la fecha en que comenzó. Los turnos futuros no cuentan como pendientes.
          Una persona sin tareo no se considera ausente.</p></div>
          <div class="rh-grid">${filas.map(tarjeta).join('')}</div></section>`}
      <section class="rh-panel"><div class="rh-panel-head"><h3>Accesos rápidos</h3></div>
        <div class="rh-accesos">
          <button type="button" class="btn btn-ghost btn-sm" data-rh-vista="general">Tareo General</button>
          <button type="button" class="btn btn-ghost btn-sm" data-rh-vista="descansos">Control de descansos</button>
          <button type="button" class="btn btn-ghost btn-sm" data-rh-vista="historial">Historial</button>
          <button type="button" class="btn btn-ghost btn-sm" data-rh-vista="resumen">Resumen mensual</button>
        </div></section></div>`;
  };
  window.renderRRHHModulo=renderRRHHModulo;

  const tabsAnterior=tareoRenderTabs;
  tareoRenderTabs=function(activa){
    const tabs=tabsAnterior.apply(this,arguments);
    if(!tienePermiso('moduloRRHH') || state.currentTab!=='rrhh')return tabs;
    return tabs.replace('<div class="tareo-tabs">',`<div class="tareo-tabs">
      <button type="button" class="tareo-tab ${activa==='inicio-rrhh'?'active':''}"
        onclick="renderRRHHModulo()">Inicio RRHH</button>`);
  };

  const tareosAnterior=onTareosUpdated;
  onTareosUpdated=function(...args){
    const resultado=tareosAnterior.apply(this,args);
    if(document.getElementById('rh-inicio') && tienePermiso('moduloRRHH'))renderRRHHModulo();
    return resultado;
  };
  document.getElementById('main')?.addEventListener('click',e=>{
    if(!e.target.closest('#rh-inicio') || !tienePermiso('moduloRRHH'))return;
    const btn=e.target.closest('[data-rh-tareo]');
    if(btn){abrirTareo(btn.dataset.rhArea,btn.dataset.rhFecha,btn.dataset.rhTurno);return;}
    if(e.target.closest('[data-rh-hoy]')){fechaElegida=null;renderRRHHModulo();return;}
    const vista=e.target.closest('[data-rh-vista]')?.dataset.rhVista;
    const acciones={general:renderTareoGeneral,descansos:renderControlDescansos,
      historial:renderHistorialTareo,resumen:renderResumenMensualTareoUI};
    if(vista && acciones[vista])acciones[vista]();
  });
  document.getElementById('main')?.addEventListener('change',e=>{
    if(e.target.id!=='rh-fecha' || !tienePermiso('moduloRRHH'))return;
    const seleccion=String(e.target.value || '');
    if(fechaValida(seleccion) && seleccion<=tareoFechaISO(new Date()))
      fechaElegida=seleccion;
    renderRRHHModulo();
  });
  setInterval(()=>{
    if(document.getElementById('rh-inicio') && tienePermiso('moduloRRHH'))renderRRHHModulo();
  },60000);
})();
