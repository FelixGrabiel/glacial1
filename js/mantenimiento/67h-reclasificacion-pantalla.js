/* =============================================================
   RECLASIFICAR PARADAS · pantalla (pestaña «Reclasificar paradas» del módulo Mantenimiento)

   Lista las paradas NO programadas con causa «Otro», vacía o antigua (sin motivo de catálogo), del rango, línea y turno elegidos, agrupa las descripciones
   parecidas (minúsculas, sin tildes ni espacios dobles; «env» = «envasadora» solo para agrupar) y permite asignar causa, motivo, detalle y equipo a TODAS
   las de un grupo (o a las que se dejen marcadas) en una sola operación. La causa se SUGIERE según el texto, pero nada se guarda sin que la persona
   lo confirme. La parada original no se toca: la reclasificación se guarda aparte (67g-reclasificacion-datos.js) y los minutos no cambian.
   Solo la ven y la usan el Supervisor de Mantenimiento y el Administrador. Se actualiza en vivo (otro dispositivo que reclasifica se ve al instante).
   Cargar después de 67g-reclasificacion-datos.js, 67c-intervenciones-pantalla.js y 47-analisis-paradas.js.
   ============================================================= */
(function(){
  'use strict';
  if(typeof document==='undefined'||!window.glacialMantPestanas||!window.glacialReclasificaciones)return;
  const R=window.glacialReclasificaciones;
  const UIM=()=>window.glacialMantUI;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const iso=ms=>{const d=new Date(ms),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
  const hoyOp=()=>{try{if(window.GlacialIndicadores&&window.GlacialIndicadores.diaOperativo)return window.GlacialIndicadores.diaOperativo(ahora());}catch(_){/* local */}return iso(ahora());};
  const restarDias=(f,n)=>{const d=new Date(f+'T12:00:00');d.setDate(d.getDate()-n);return iso(d.getTime());};
  const fmtF=f=>String(f||'').split('-').reverse().join('/');
  const fmtMin=m=>Math.round(m).toLocaleString('es-PE');
  const fmtFH=ms=>{const n=Number(ms)||(ms&&typeof ms.toMillis==='function'?ms.toMillis():0);return n?new Date(n).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';};
  const nombreLinea=k=>{try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}};

  const hoy=hoyOp();
  const UI={desde:restarDias(hoy,30),hasta:hoy,linea:'',turno:'',excl:new Set(),abiertos:new Set()};
  let datos=null;       // {grupos,recl,pendMin,pendN,reclMin,reclN,sinDatos}

  /* ---------- cálculo ---------- */
  function calcular(){
    const A=window.glacialAnalisisParadas;
    const sal={grupos:[],recl:[],pendMin:0,pendN:0,reclMin:0,reclN:0,sinDatos:false};
    if(!A||typeof A.listarUnidades!=='function'){sal.sinDatos=true;return sal;}
    let r;try{r=A.listarUnidades(UI.desde,UI.hasta,{linea:UI.linea,turno:UI.turno});}catch(_){sal.sinDatos=true;return sal;}
    const grupos=new Map();
    (r.unidades||[]).forEach(u=>{
      (u.npItems||[]).forEach(it=>{
        if(!it||!it.id)return;
        const fila={paradaId:it.id,origen:it.origen,linea:u.linea,fecha:u.fecha,turno:u.turno,minutos:Number(it.minutos)||0,descripcion:it.motivo||'',
          original:it.reclasificada?it.original:{causa:it.causa,motivo:it.motivoCat,detalle:it.detalle,equipo:it.equipo},actual:it};
        if(it.reclasificada){
          const o=Object.assign({},it,it.original,{motivoCat:it.original.motivoCat});
          if(R.esCandidata(o)){sal.recl.push(fila);sal.reclMin+=fila.minutos;sal.reclN++;}
          return;
        }
        if(!R.esCandidata(it))return;
        const k=R.claveGrupo(fila.descripcion||fila.original.causa);
        const g=grupos.get(k)||{clave:k,filas:[],min:0,textos:new Map(),lineas:new Set()};
        g.filas.push(fila);g.min+=fila.minutos;g.lineas.add(fila.linea);
        const t=String(fila.descripcion||'').trim()||'(sin descripción)';g.textos.set(t,(g.textos.get(t)||0)+1);
        grupos.set(k,g);sal.pendMin+=fila.minutos;sal.pendN++;
      });
    });
    sal.grupos=[...grupos.values()].sort((a,b)=>b.min-a.min);
    sal.grupos.forEach(g=>{
      const top=[...g.textos.entries()].sort((a,b)=>b[1]-a[1]);
      g.etiqueta=top[0][0];g.textosLista=top;
      g.sugerencia=R.sugerirCausa(top.map(x=>x[0]).join(' '));
    });
    sal.recl.sort((a,b)=>b.fecha.localeCompare(a.fecha));
    return sal;
  }

  /* ---------- pantalla ---------- */
  const lineasOpc=()=>(typeof LINES!=='undefined'?LINES:[]).map(l=>'<option value="'+esc(l.key)+'"'+(UI.linea===l.key?' selected':'')+'>'+esc(l.name)+'</option>').join('');
  function tarjetaGrupo(g){
    const sel=g.filas.filter(f=>!UI.excl.has(f.paradaId));
    const sug=g.sugerencia?'<div class="mi-meta">Sugerencia según el texto: <span class="mi-chip p-ALTA">'+esc(g.sugerencia.causa)+(g.sugerencia.motivo?' › '+esc(g.sugerencia.motivo):'')+'</span> <small>(solo una sugerencia: tú confirmas)</small></div>':'';
    return '<div class="mi-card" style="--c:#7c3aed;cursor:default"><h4>'+esc(g.etiqueta)+' <small style="font-weight:500;color:#5a6b78">· '+g.filas.length+' parada(s) · '+fmtMin(g.min)+' min</small></h4>'+
      (g.textosLista.length>1?'<div class="mi-meta">Escritas como: '+g.textosLista.slice(0,6).map(([t,n])=>'«'+esc(t)+'»'+(n>1?' ×'+n:'')).join(', ')+(g.textosLista.length>6?'…':'')+'</div>':'')+sug+
      '<details data-rc-det="'+esc(g.clave)+'"'+(UI.abiertos.has(g.clave)?' open':'')+'><summary style="cursor:pointer;font-size:13px;margin-top:6px">Ver las paradas del grupo</summary>'+
        '<table class="mi-tabla"><tbody>'+g.filas.map(f=>'<tr><td><input type="checkbox" data-rc-sel="'+esc(f.paradaId)+'" data-rc-grupo="'+esc(g.clave)+'" aria-label="Incluir"'+(UI.excl.has(f.paradaId)?'':' checked')+'></td><td>'+esc(fmtF(f.fecha))+' · '+esc(nombreLinea(f.linea))+' · '+esc(f.turno)+'</td><td>'+esc(f.descripcion||'(sin descripción)')+(f.original.causa?' <small>('+esc(f.original.causa)+')</small>':'')+'</td><td style="text-align:right">'+fmtMin(f.minutos)+' min</td></tr>').join('')+'</tbody></table></details>'+
      '<div class="mi-acc"><button type="button" class="btn btn-primary" data-rc-asignar="'+esc(g.clave)+'"'+(sel.length?'':' disabled')+'>Asignar a las '+sel.length+' parada(s) de este grupo</button></div></div>';
  }
  function tarjetaRecl(f){
    const d=R.de(f.paradaId),a=f.actual,o=f.original;
    const txt=x=>[x.causa,x.motivo||x.motivoCat].filter(Boolean).join(' › ')+(x.detalle?' — '+x.detalle:'')+(x.equipo?' · '+x.equipo:'');
    return '<details class="mi-card" style="--c:#0e7490;cursor:default"><summary style="cursor:pointer;font-weight:700;font-size:13px">'+esc(fmtF(f.fecha))+' · '+esc(nombreLinea(f.linea))+' · '+fmtMin(f.minutos)+' min · '+esc(txt(a))+' <span class="mi-chip r-OPERATIVO_VERIFICADO">reclasificada</span></summary>'+
      '<div class="mi-meta"><b>Original:</b> '+esc(f.descripcion||'(sin descripción)')+' · '+esc(txt(o)||'sin causa')+'</div>'+
      (d?'<div class="mi-meta">Versión '+d.version+' · por '+esc(d.actualizadaPor||'')+' · '+esc(fmtFH(d.actualizadaEn))+'</div>'+
        '<div class="mi-crono">'+(d.historial||[]).slice().reverse().map(h=>'<div><b>'+esc(h.por||'')+'</b> · '+esc(fmtFH(h.ts))+'<br><small>Antes: '+esc(txt(h.antes||{})||'sin causa')+'<br>Ahora: '+esc(txt(h.despues||{}))+'<br>Motivo: '+esc(h.razon||'')+'</small></div>').join('')+'</div>':'')+'</details>';
  }
  function pintar(cont){
    const c=cont||document.getElementById('mi-cuerpo');if(!c)return;
    R.asegurarRango(UI.desde,UI.hasta);
    datos=calcular();
    const d=datos,total=d.pendMin+d.reclMin,est=R.estado();
    c.innerHTML=
      '<div class="mi-filtros"><label>Desde<input type="date" data-rc-f="desde" value="'+esc(UI.desde)+'" max="'+esc(hoy)+'"></label><label>Hasta<input type="date" data-rc-f="hasta" value="'+esc(UI.hasta)+'" max="'+esc(hoy)+'"></label>'+
        '<label>Línea<select data-rc-f="linea"><option value="">Todas</option>'+lineasOpc()+'</select></label>'+
        '<label>Turno<select data-rc-f="turno"><option value="">Todos</option><option value="DÍA"'+(UI.turno==='DÍA'?' selected':'')+'>Día</option><option value="NOCHE"'+(UI.turno==='NOCHE'?' selected':'')+'>Noche</option></select></label></div>'+
      '<div class="mi-kpis"><div class="mi-kpi" style="--c:#c2410c"><b>'+fmtMin(d.pendMin)+' min</b><span>Sin clasificar ('+d.pendN+' paradas)</span></div>'+
        '<div class="mi-kpi" style="--c:#0e7490"><b>'+fmtMin(d.reclMin)+' min</b><span>Reclasificados ('+d.reclN+' paradas)</span></div>'+
        '<div class="mi-kpi" style="--c:#15803d"><b>'+(total>0?Math.round(d.reclMin/total*100):0)+' %</b><span>Cuánto bajó lo sin clasificar</span></div></div>'+
      '<p class="mi-meta">Paradas no programadas con causa «Otro», vacía o antigua (sin motivo de catálogo). La reclasificación solo cambia la etiqueta: los minutos, la disponibilidad y el ratio no cambian, y la parada original no se modifica.</p>'+
      (est.error?'<div class="mi-error">'+esc(est.error)+'</div>':'')+
      (d.grupos.length&&window.glacialGraficos?'<div class="gm-panel" style="padding-top:12px"><div class="gm-card"><h5>Minutos sin clasificar por grupo (toca una barra para asignar)</h5>'+
        window.glacialGraficos.barrasH(d.grupos.slice(0,8).map(g=>({id:g.clave,etiqueta:g.etiqueta,valor:Math.round(g.min),sub:g.filas.length+' parada(s)',color:'#c2410c'})),{grupo:'rc-grupo',unidad:'min'})+'</div></div>':'')+
      (d.sinDatos?'<div class="mi-vacio">Análisis de paradas todavía no está cargado. Abre «Análisis de paradas» una vez o espera unos segundos.</div>':
        d.grupos.length?d.grupos.slice(0,40).map(tarjetaGrupo).join('')+(d.grupos.length>40?'<div class="mi-aviso">Se muestran los 40 grupos con más minutos; reduce el rango o filtra por línea para ver el resto.</div>':'')
        :'<div class="mi-vacio"><b>No hay paradas por clasificar en este rango.</b></div>')+
      (d.recl.length?'<h5 style="margin-top:14px">Reclasificadas en el rango ('+d.recl.length+')</h5>'+d.recl.slice(0,50).map(tarjetaRecl).join('')+(d.recl.length>50?'<div class="mi-aviso">Se muestran las 50 más recientes.</div>':''):'');
  }

  /* ---------- asignar a un grupo ---------- */
  function abrirAsignar(clave){
    const g=datos&&datos.grupos.find(x=>x.clave===clave);if(!g)return;
    const filas=g.filas.filter(f=>!UI.excl.has(f.paradaId));
    if(!filas.length)return;
    const M=window.glacialMotivosParada,G=window.glacialEquipos;
    if(!M){UIM().aviso('Catálogo no disponible','El catálogo de motivos de parada no está cargado.');return;}
    const linea=[...new Set(filas.map(f=>f.linea))];
    const sug=g.sugerencia||{causa:'',motivo:''};
    const minTot=filas.reduce((s,f)=>s+f.minutos,0);
    const html='<div class="completo mi-meta">Se asignará a <b>'+filas.length+' parada(s)</b> ('+fmtMin(minTot)+' min). El registro original no cambia y queda el historial de quién lo hizo.</div>'+
      '<label>Causa<select id="rc-causa">'+M.opcionesCausa(sug.causa)+'</select></label>'+
      '<label>Motivo<select id="rc-motivo">'+M.opcionesMotivo(sug.causa,sug.motivo)+'</select></label>'+
      '<label class="completo"><span id="rc-det-et">Detalle (opcional)</span><input type="text" id="rc-detalle" maxlength="120" placeholder="Ej. el texto original o más contexto"></label>'+
      '<div class="completo" id="rc-eq-wrap" hidden><label>Equipo que falló (obligatorio)<select id="rc-eq">'+(G&&linea.length===1?G.opciones(linea[0],''):'<option value="">—</option>')+'</select></label>'+
        '<label id="rc-eq-otro-wrap" hidden>Detalle del equipo<input type="text" id="rc-eq-otro" maxlength="80" placeholder="Mínimo 5 caracteres"></label>'+
        (linea.length>1?'<div class="mi-aviso">Estas paradas son de varias líneas: para indicar el equipo filtra una sola línea.</div>':'')+'</div>'+
      '<label class="completo">Motivo de la reclasificación<input type="text" id="rc-razon" maxlength="200" value="Revisión del historial de paradas"></label>';
    const f=UIM().formulario('Asignar causa y motivo',html,'Guardar para '+filas.length+' parada(s)',async q=>{
      if(M.pideEquipo(q('#rc-causa').value)&&linea.length>1)throw new Error('Esta causa pide equipo y el grupo mezcla líneas: filtra una sola línea.');
      const v={causa:q('#rc-causa').value,motivo:q('#rc-motivo').value,detalle:q('#rc-detalle').value,razon:q('#rc-razon').value,
        equipo:M.pideEquipo(q('#rc-causa').value)&&G?G.componer(q('#rc-eq').value,q('#rc-eq-otro').value):''};
      if(M.pideEquipo(v.causa)&&!v.equipo)throw new Error(G.validar(q('#rc-eq').value,q('#rc-eq-otro').value)||'Indica el equipo.');
      await R.reclasificar(filas,v);
    },{dos:true});
    const q=s=>f.querySelector(s);
    const alCambiarCausa=()=>{
      const c=q('#rc-causa').value,ms=M.motivosDe(c);
      q('#rc-motivo').innerHTML=M.opcionesMotivo(c,ms.length===1?ms[0]:'');
      const min=M.detalleMin(c);q('#rc-det-et').textContent=min?'Detalle (obligatorio, mínimo '+min+' caracteres)':'Detalle (opcional)';
      q('#rc-eq-wrap').hidden=!(c&&M.pideEquipo(c));
    };
    q('#rc-causa').addEventListener('change',alCambiarCausa);
    q('#rc-eq').addEventListener('change',()=>{q('#rc-eq-otro-wrap').hidden=q('#rc-eq').value!=='__otro__';});
    if(sug.causa){alCambiarCausa();if(sug.motivo)q("#rc-motivo").value=sug.motivo;}
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click',e=>{
    const t=e.target;if(!t||!t.closest)return;
    const b=t.closest('[data-rc-asignar]');if(b){abrirAsignar(b.dataset.rcAsignar);return;}
    const gm=t.closest('[data-gm-grupo="rc-grupo"]');if(gm)abrirAsignar(gm.dataset.gmId);
  });
  document.addEventListener('toggle',e=>{
    const t=e.target;if(!t||!t.dataset||t.dataset.rcDet===undefined)return;
    if(t.open)UI.abiertos.add(t.dataset.rcDet);else UI.abiertos.delete(t.dataset.rcDet);
  },true);
  document.addEventListener('change',e=>{
    const t=e.target;if(!t||!t.dataset)return;
    if(t.dataset.rcF){UI[t.dataset.rcF]=t.value;if(UI.desde>UI.hasta)UI.hasta=UI.desde;pintar();return;}
    if(t.dataset.rcSel!==undefined){
      if(t.checked)UI.excl.delete(t.dataset.rcSel);else UI.excl.add(t.dataset.rcSel);
      const g=datos&&datos.grupos.find(x=>x.clave===t.dataset.rcGrupo),btn=g&&document.querySelector('[data-rc-asignar="'+(window.CSS&&CSS.escape?CSS.escape(g.clave):g.clave)+'"]');
      if(g&&btn){const n=g.filas.filter(f=>!UI.excl.has(f.paradaId)).length;btn.textContent='Asignar a las '+n+' parada(s) de este grupo';btn.disabled=!n;}
    }
  });

  /* En vivo: otra persona que reclasifica, o un cambio en el catálogo o en los registros, se ve sin recargar (sin interrumpir a quien escribe). */
  let temporizador=null;
  function refrescar(){
    clearTimeout(temporizador);
    temporizador=setTimeout(()=>{
      try{
        if(typeof state==='undefined'||state.currentTab!=='intervenciones'||!document.getElementById('mi-cuerpo'))return;
        if(!document.querySelector('.mi-tab.active[data-mi-tab="reclasificar"]'))return;
        if(document.querySelector('.mi-fondo'))return;
        const a=document.activeElement;
        if(a&&a.closest&&a.closest('#mi-cuerpo')&&/INPUT|SELECT|TEXTAREA/.test(a.tagName))return;
        pintar();
      }catch(err){console.warn('Reclasificar paradas:',err&&err.message||err);}
    },300);
  }
  R.alCambiar(refrescar);
  if(window.glacialMotivosParada)window.glacialMotivosParada.alCambiar(refrescar);
  ['onProgramacionesUpdated','onRecordsUpdated'].forEach(n=>{
    const ant=globalThis[n];if(typeof ant!=='function')return;
    globalThis[n]=function(){const r=ant.apply(this,arguments);refrescar();return r;};
  });

  window.glacialMantPestanas.push({clave:'reclasificar',titulo:'Reclasificar paradas',orden:5,pintar:c=>pintar(c),visible:()=>R.puedeReclasificar()});
  window.glacialReclasificarPantalla={calcular,UI,pintar};
})();
