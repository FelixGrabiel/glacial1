/* =============================================================
   BANCO DE PARADAS POR CLASIFICAR (Mantenimiento › Intervenciones y equipos › Banco de paradas)
   -------------------------------------------------------------
   Lista, en una sola tabla, las paradas no programadas con causa «Otro», vacía o antigua (sin motivo de catálogo) y, junto a ellas, las que ya se
   reclasificaron (con quién y cuándo). Es el «banco»: nada se borra, una parada reclasificada sigue en la lista marcada como tal.
   Solo lectura: lo ven el Supervisor de Mantenimiento, Jefatura, el Administrador y quien tenga el permiso «ver_banco_paradas» (o la bitácora de Mantenimiento).
   Reclasificar sigue siendo del Supervisor de Mantenimiento y del Administrador (pestaña «Reclasificar paradas», 67h).
   Usa los mismos datos que Análisis de paradas (listarUnidades) y las reclasificaciones de 67g; no escribe nada.
   ============================================================= */
(function(){
  'use strict';
  if(typeof document==='undefined'||!window.glacialMantPestanas||!window.glacialReclasificaciones)return;
  const R=window.glacialReclasificaciones;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const iso=ms=>{const d=new Date(ms),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
  const hoyOp=()=>{try{if(window.GlacialIndicadores&&window.GlacialIndicadores.diaOperativo)return window.GlacialIndicadores.diaOperativo(ahora());}catch(_){/* fecha local */}return iso(ahora());};
  const restarDias=(f,n)=>{const d=new Date(f+'T12:00:00');d.setDate(d.getDate()-n);return iso(d.getTime());};
  const fmtF=f=>String(f||'').split('-').reverse().join('/');
  const fmtMin=m=>Math.round(m).toLocaleString('es-PE');
  const fmtFH=ms=>{const n=Number(ms)||(ms&&typeof ms.toMillis==='function'?ms.toMillis():0);return n?new Date(n).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';};
  const nombreLinea=k=>{try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}};
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const MAX_FILAS=300;

  const hoy=hoyOp();
  const UI={desde:restarDias(hoy,30),hasta:hoy,linea:'',turno:'',estado:'todas',texto:''};
  let datos=null;

  const etiquetaCausa=x=>[x&&x.causa,x&&(x.motivo||x.motivoCat)].filter(Boolean).join(' › ');

  /* Todas las paradas candidatas del rango (pendientes y ya reclasificadas), más recientes primero. */
  function calcular(){
    const A=window.glacialAnalisisParadas;
    const sal={filas:[],pendN:0,pendMin:0,reclN:0,reclMin:0,sinDatos:false};
    if(!A||typeof A.listarUnidades!=='function'){sal.sinDatos=true;return sal;}
    let r;try{r=A.listarUnidades(UI.desde,UI.hasta,{linea:UI.linea,turno:UI.turno});}catch(_){sal.sinDatos=true;return sal;}
    (r.unidades||[]).forEach(u=>(u.npItems||[]).forEach(it=>{
      if(!it||!it.id)return;
      const min=Number(it.minutos)||0,reclasificada=!!it.reclasificada;
      const original=reclasificada?Object.assign({},it,it.original,{motivoCat:it.original&&it.original.motivoCat}):it;
      if(!R.esCandidata(original))return;
      const d=reclasificada?R.de(it.id):null;
      sal.filas.push({id:it.id,fecha:u.fecha,linea:u.linea,turno:u.turno,minutos:min,descripcion:it.motivo||'',
        origen:etiquetaCausa(reclasificada?it.original:it)||'sin causa',actual:reclasificada?etiquetaCausa(it):'',equipo:reclasificada?(it.equipo||''):'',
        estado:reclasificada?'RECLASIFICADA':'PENDIENTE',por:d?d.actualizadaPor||'':'',cuando:d?d.actualizadaEn:null});
      if(reclasificada){sal.reclN++;sal.reclMin+=min;}else{sal.pendN++;sal.pendMin+=min;}
    }));
    sal.filas.sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.linea.localeCompare(b.linea)||b.minutos-a.minutos);
    return sal;
  }
  function visibles(d){
    const q=norm(UI.texto).trim();
    return d.filas.filter(f=>(UI.estado==='todas'||(UI.estado==='pendientes'?f.estado==='PENDIENTE':f.estado==='RECLASIFICADA'))&&
      (!q||norm([f.descripcion,f.origen,f.actual,f.equipo,f.por].join(' ')).includes(q)));
  }

  const lineasOpc=()=>(typeof LINES!=='undefined'?LINES:[]).map(l=>'<option value="'+esc(l.key)+'"'+(UI.linea===l.key?' selected':'')+'>'+esc(l.name)+'</option>').join('');
  function fila(f){
    const rec=f.estado==='RECLASIFICADA';
    return '<tr><td>'+esc(fmtF(f.fecha))+'</td><td>'+esc(nombreLinea(f.linea))+'</td><td>'+esc(f.turno)+'</td><td style="text-align:right">'+fmtMin(f.minutos)+'</td>'+
      '<td>'+esc(f.descripcion||'(sin descripción)')+'<div class="mi-meta">'+esc(f.origen)+'</div></td>'+
      '<td>'+(rec?esc(f.actual)+(f.equipo?'<div class="mi-meta">'+esc(f.equipo)+'</div>':''):'<span class="mi-meta">—</span>')+'</td>'+
      '<td>'+(rec?'<span class="mi-chip r-OPERATIVO_VERIFICADO">Reclasificada</span><div class="mi-meta">'+esc(f.por)+' · '+esc(fmtFH(f.cuando))+'</div>':'<span class="mi-chip p-ALTA">Pendiente</span>')+'</td></tr>';
  }
  function pintar(cont){
    const c=cont||document.getElementById('mi-cuerpo');if(!c)return;
    R.asegurarRango(UI.desde,UI.hasta);
    datos=calcular();
    const d=datos,lista=visibles(d),total=d.pendMin+d.reclMin,est=R.estado();
    const puedeRec=!!(R.puedeReclasificar&&R.puedeReclasificar());
    c.innerHTML=
      '<div class="mi-filtros"><label>Desde<input type="date" data-bp-f="desde" value="'+esc(UI.desde)+'" max="'+esc(hoy)+'"></label><label>Hasta<input type="date" data-bp-f="hasta" value="'+esc(UI.hasta)+'" max="'+esc(hoy)+'"></label>'+
        '<label>Línea<select data-bp-f="linea"><option value="">Todas</option>'+lineasOpc()+'</select></label>'+
        '<label>Turno<select data-bp-f="turno"><option value="">Todos</option><option value="DÍA"'+(UI.turno==='DÍA'?' selected':'')+'>Día</option><option value="NOCHE"'+(UI.turno==='NOCHE'?' selected':'')+'>Noche</option></select></label>'+
        '<label>Estado<select data-bp-f="estado"><option value="todas"'+(UI.estado==='todas'?' selected':'')+'>Todas</option><option value="pendientes"'+(UI.estado==='pendientes'?' selected':'')+'>Pendientes</option><option value="reclasificadas"'+(UI.estado==='reclasificadas'?' selected':'')+'>Reclasificadas</option></select></label>'+
        '<label>Buscar<input type="search" data-bp-f="texto" value="'+esc(UI.texto)+'" placeholder="Texto, causa, equipo…"></label></div>'+
      '<div class="mi-kpis"><div class="mi-kpi" style="--c:#c2410c"><b>'+fmtMin(d.pendMin)+' min</b><span>Pendientes ('+d.pendN+' paradas)</span></div>'+
        '<div class="mi-kpi" style="--c:#0e7490"><b>'+fmtMin(d.reclMin)+' min</b><span>Reclasificadas ('+d.reclN+' paradas)</span></div>'+
        '<div class="mi-kpi" style="--c:#15803d"><b>'+(total>0?Math.round(d.reclMin/total*100):0)+' %</b><span>Avance de la clasificación</span></div></div>'+
      '<p class="mi-meta">Banco de solo lectura: paradas no programadas con causa «Otro», vacía o antigua (sin motivo de catálogo). Las reclasificadas se quedan aquí, con quién y cuándo. Los minutos no cambian.'+
        (puedeRec?' Para clasificar usa la pestaña «Reclasificar paradas».':' Reclasificar lo hacen el Supervisor de Mantenimiento y el Administrador.')+'</p>'+
      (est.error?'<div class="mi-error">'+esc(est.error)+'</div>':'')+
      '<div class="mi-acc"><button type="button" class="btn btn-ghost btn-sm" data-bp-csv'+(lista.length?'':' disabled')+'>Descargar lista (Excel/CSV)</button></div>'+
      (d.sinDatos?'<div class="mi-vacio">Análisis de paradas todavía no está cargado. Abre «Análisis de paradas» una vez o espera unos segundos.</div>':
        lista.length?'<div style="overflow-x:auto"><table class="mi-tabla"><thead><tr><th>Fecha</th><th>Línea</th><th>Turno</th><th>Min</th><th>Parada (texto original)</th><th>Clasificación actual</th><th>Estado</th></tr></thead><tbody>'+lista.slice(0,MAX_FILAS).map(fila).join('')+'</tbody></table></div>'+
          (lista.length>MAX_FILAS?'<div class="mi-aviso">Se muestran las '+MAX_FILAS+' más recientes de '+lista.length+'; filtra o descarga la lista para ver todas.</div>':'')
        :'<div class="mi-vacio"><b>No hay paradas en el banco con estos filtros.</b></div>');
  }

  function descargarCsv(){
    if(!datos)return;
    const lista=visibles(datos);if(!lista.length)return;
    const celda=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const filas=[['Fecha','Línea','Turno','Minutos','Parada (texto original)','Clasificación original','Clasificación actual','Equipo','Estado','Reclasificada por','Reclasificada el']]
      .concat(lista.map(f=>[f.fecha,nombreLinea(f.linea),f.turno,Math.round(f.minutos),f.descripcion,f.origen,f.actual,f.equipo,f.estado==='RECLASIFICADA'?'Reclasificada':'Pendiente',f.por,f.cuando?fmtFH(f.cuando):'']));
    const texto='﻿'+filas.map(r=>r.map(celda).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([texto],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='Banco_de_paradas_'+UI.desde+'_a_'+UI.hasta+'.csv';document.body.appendChild(a);a.click();
    setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},1500);
  }

  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.dataset||t.dataset.bpF===undefined)return;
    UI[t.dataset.bpF]=t.value;if(UI.desde>UI.hasta)UI.hasta=UI.desde;pintar();
  });
  document.addEventListener('input',e=>{
    const t=e.target;if(!t||!t.dataset||t.dataset.bpF!=='texto')return;
    UI.texto=t.value;
    const pos=t.selectionStart;pintar();                       // se repinta la tabla y se devuelve el cursor al buscador
    const b=document.querySelector('[data-bp-f="texto"]');if(b){b.focus();try{b.setSelectionRange(pos,pos);}catch(_){/* sin cursor */}}
  });
  document.addEventListener('click',e=>{const t=e.target;if(t&&t.closest&&t.closest('[data-bp-csv]'))descargarCsv();});

  /* En vivo: otra persona que reclasifica o un registro nuevo se ven sin recargar (sin interrumpir a quien escribe). */
  let temporizador=null;
  function refrescar(){
    clearTimeout(temporizador);
    temporizador=setTimeout(()=>{
      try{
        if(typeof state==='undefined'||state.currentTab!=='intervenciones'||!document.getElementById('mi-cuerpo'))return;
        if(!document.querySelector('.mi-tab.active[data-mi-tab="banco-paradas"]'))return;
        const a=document.activeElement;
        if(a&&a.closest&&a.closest('#mi-cuerpo')&&/INPUT|SELECT|TEXTAREA/.test(a.tagName))return;
        pintar();
      }catch(err){console.warn('Banco de paradas:',err&&err.message||err);}
    },300);
  }
  R.alCambiar(refrescar);
  ['onProgramacionesUpdated','onRecordsUpdated'].forEach(n=>{
    const ant=globalThis[n];if(typeof ant!=='function')return;
    globalThis[n]=function(){const r=ant.apply(this,arguments);refrescar();return r;};
  });

  window.glacialMantPestanas.push({clave:'banco-paradas',titulo:'Banco de paradas',orden:6,pintar:c=>pintar(c),visible:()=>R.puedeVer()});
  window.glacialBancoParadas={calcular,visibles,UI,pintar};
})();
