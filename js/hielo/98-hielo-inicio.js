/* =====================================================================================================================
   REPORTE HIELO · tarjeta «HIELO» en el Inicio (Centro de perfil) · docs/hielo/reporte-hielo.md
   Muestra lo que lleva el hielo en el turno que se está viendo en el Inicio: bolsas por presentación (3 kg y 1.5 kg siempre), kilos, cumplimiento contra lo programado,
   paradas y el estado del reporte (sin reporte / en registro / finalizado), con un botón que abre el Reporte Hielo. Solo lectura: usa los mismos datos de Hielo
   (hieloReportes y hieloProgramacion, últimos 62 días). El turno del Inicio «Día» incluye el Intermedio, igual que en la TV.
   Lógica pura y pruebas: tests/hielo-inicio.test.js
   ===================================================================================================================== */
(function(raiz){
  'use strict';
  const N=raiz.glacialHieloNucleo||(typeof require!=='undefined'?require('./97-hielo.js'):null);
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:2});
  /** Turnos de Hielo que entran en el turno del Inicio: «NOCHE» = Noche; cualquier otro = Día + Intermedio. */
  const turnosDe=turno=>String(turno||'').toUpperCase()==='NOCHE'?['NOCHE']:['DÍA','INTERMEDIO'];
  /** Resumen de Hielo para una fecha y un turno del Inicio. */
  function resumen(reportes,programas,fecha,turnoInicio,presentaciones){
    const ts=turnosDe(turnoInicio);
    const rs=(reportes||[]).filter(r=>r&&r.fecha===fecha&&ts.includes(r.turno)),ps=(programas||[]).filter(p=>p&&p.fecha===fecha&&ts.includes(p.turno));
    const t=N.totales(rs),prog=N.programado(ps);
    const pres=N.ordenPres([...new Set(['3 kg','1.5 kg'].concat(presentaciones||[],Object.keys(t.porPres)))].filter(p=>['3 kg','1.5 kg'].includes(p)||t.porPres[p]>0||ps.some(x=>(x.items||[]).some(i=>i.presentacion===p&&Number(i.bolsas)>0))));
    const estado=!rs.length?'SIN_REPORTE':rs.every(r=>r.estado==='FINALIZADO')?'FINALIZADO':'EN_REGISTRO';
    return {fecha,turnos:ts,estado,bolsas:t.bolsas,kg:t.kg,paradasMin:t.paradasMin,paradas:t.paradas,programado:prog.total,
      cumplimiento:prog.total>0?t.bolsas/prog.total:null,presentaciones:pres.map(p=>({presentacion:p,bolsas:t.porPres[p]||0})),reportes:rs.length};
  }
  const ESTADO={SIN_REPORTE:['Sin reporte','sin'],EN_REGISTRO:['En registro','curso'],FINALIZADO:['Finalizado','ok']};
  /** HTML de la tarjeta (sin el contenedor). puedeAbrir: si se muestra el botón. */
  function htmlTarjeta(r,puedeAbrir){
    const e=ESTADO[r.estado]||ESTADO.SIN_REPORTE,pct=r.cumplimiento===null?null:Math.round(r.cumplimiento*100);
    return '<div class="hli-top"><h3>HIELO · '+esc(r.turnos.length>1?'Día + Intermedio':'Noche')+'</h3><span class="hli-est hli-'+e[1]+'">'+e[0]+'</span></div>'+
      (r.reportes?'<div class="hli-grid">'+r.presentaciones.map(p=>'<div><span>Bolsas de '+esc(p.presentacion)+'</span><b>'+fmt(p.bolsas)+'</b></div>').join('')+
        '<div><span>Kilos producidos</span><b>'+fmt(r.kg)+'</b></div>'+
        '<div><span>Cumplimiento</span><b>'+(pct===null?'—':pct+' %')+'</b>'+(r.programado>0?'<small>de '+fmt(r.programado)+' bolsas programadas</small>':'<small>sin programación</small>')+'</div>'+
        '<div><span>Paradas</span><b>'+(r.paradas?fmt(r.paradasMin)+' min':'0')+'</b>'+(r.paradas?'<small>'+r.paradas+' parada'+(r.paradas===1?'':'s')+'</small>':'')+'</div></div>'
        :'<p class="hli-vacio">Todavía no hay reporte de hielo en este turno'+(r.programado>0?' (programadas '+fmt(r.programado)+' bolsas)':'')+'.</p>')+
      (puedeAbrir?'<div class="hli-acc"><button type="button" class="btn btn-ghost btn-sm" data-hli-abrir>Abrir Reporte Hielo</button></div>':'');
  }
  const API={turnosDe,resumen,htmlTarjeta};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof window==='undefined'||raiz!==window)return;

  /* ---------- Inicio (Centro de perfil): se inserta después del título del bloque, como las demás tarjetas ---------- */
  const D=()=>window.glacialHieloDatos;
  const usr=()=>(typeof state!=='undefined'&&state.user)||null;
  const puedeVer=()=>!!usr()&&String(usr().rol||'')!=='mantenimiento_compartido';
  function estilos(){
    if(document.getElementById('hli-css'))return;
    const s=document.createElement('style');s.id='hli-css';
    s.textContent='.hli-card{border:1px solid #dfe4ea;border-left:8px solid #4FC4F5;border-radius:12px;background:#fff;padding:12px 16px;margin-bottom:12px;box-shadow:0 3px 12px rgba(17,57,91,.055)}'+
      '.hli-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.hli-top h3{margin:0;font-size:14px;letter-spacing:.04em;color:#033350}'+
      '.hli-est{font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px}.hli-sin{background:#eceff2;color:#5f6f7c}.hli-curso{background:#fff0d6;color:#b86e00}.hli-ok{background:#e5f6ec;color:#13814a}'+
      '.hli-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}.hli-grid>div{background:#f7fbfe;border:1px solid #e1edf5;border-radius:10px;padding:8px 12px}'+
      '.hli-grid span{display:block;font-size:11px;font-weight:700;color:#46627a;text-transform:uppercase;letter-spacing:.03em}.hli-grid b{display:block;font-size:24px;color:#033350;margin-top:2px}.hli-grid small{color:#7a8794;font-size:11px}'+
      '.hli-vacio{margin:8px 0 0;font-size:13px;color:#5a6b7b}.hli-acc{margin-top:10px}';
    document.head.appendChild(s);
  }
  function datos(){
    const h=D();if(!h)return null;
    /* La fecha y el bloque que muestra el Inicio (el selector de arriba), no la hora del reloj. */
    let fecha='',turno='';
    try{const e=typeof cpDatosEjecutivo==='function'?cpDatosEjecutivo():null;if(e){fecha=e.fecha;turno=e.turno;}}catch(_){/* sin resumen */}
    if(!fecha){const c=(typeof cpCtx==='function'?cpCtx():null)||{};fecha=c.fechaOperativa;turno=c.turno;}
    return resumen(h.cache.reportes,h.cache.programacion,fecha,turno,(h.config&&h.config().presentaciones)||[]);
  }
  function pintar(){
    const el=document.getElementById('hli-inicio');if(!el)return;
    const r=datos();if(r)el.innerHTML=htmlTarjeta(r,typeof window.goReporteHielo==='function');
  }
  document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-hli-abrir]')&&typeof window.goReporteHielo==='function')window.goReporteHielo();});
  if(D()&&D().alCambiar)D().alCambiar(pintar);
  if(typeof renderCentroPerfil==='function'){
    const anterior=renderCentroPerfil;
    renderCentroPerfil=function(main){
      const r=anterior.apply(this,arguments);
      try{
        const m=main||document.getElementById('main');
        if(m&&puedeVer()&&D()&&state.currentTab==='centro-perfil'&&!m.querySelector('#hli-inicio')){
          const shell=m.querySelector&&m.querySelector('.cp-shell');
          if(shell){
            estilos();D().escuchar();
            const dat=datos();
            const html='<section id="hli-inicio" class="hli-card" aria-label="Hielo">'+(dat?htmlTarjeta(dat,typeof window.goReporteHielo==='function'):'')+'</section>';
            const titulo=shell.querySelector('.cp-title-row'),pry=m.querySelector('#pry-turno');
            if(pry&&pry.insertAdjacentHTML)pry.insertAdjacentHTML('afterend',html);
            else if(titulo)titulo.insertAdjacentHTML('afterend',html);
            else shell.insertAdjacentHTML('afterbegin',html);
          }
        }
      }catch(e){console.warn('Tarjeta «Hielo» del Inicio:',e&&e.message||e);}
      return r;
    };
    window.renderCentroPerfil=renderCentroPerfil;
  }
  window.glacialHieloInicio=API;
})(typeof window!=='undefined'?window:globalThis);
