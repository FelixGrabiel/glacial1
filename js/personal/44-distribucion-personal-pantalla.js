/* =============================================================
   GLACIAL · TAREO · DISTRIBUCIÓN DE PERSONAL (pantalla)
   -------------------------------------------------------------
   Pestaña «Distribución de personal» del Tareo de Producción. Edita y consulta la fuente compartida
   (43-distribucion-personal.js); no guarda cantidades propias. Avance/Cierre y los reportes leen lo mismo.
   Pensada para celular: controles grandes y una sola columna.
   El total son asignaciones DECLARADAS por el supervisor (cantidades), no un conteo individual verificado.
   Cargar DESPUÉS de 43-distribucion-personal.js y 13-tareo.js.
   ============================================================= */
(function instalarPantallaDistribucion(){
  'use strict';
  const D=()=>window.glacialDistribucionPersonal;
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const cfgBloques=()=>{try{const c=typeof window.glacialConfigIndicadores==='function'?window.glacialConfigIndicadores():null;return c?c.bloques:undefined;}catch(_){return undefined;}};
  const hhmm=ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
  const fechaHora=ms=>ms?new Date(ms).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
  const ETQ={PET1:'PET1',PET2:'PET2',B7L:'B7L',C20L:'CAJAS 20L',B20L:'B20L'};

  const E={fecha:'',bloque:'DÍA',form:null,guardando:false,error:'',aviso:'',historial:false,escucha:null,oyente:false};

  /* Contexto del usuario: fecha operativa y bloque (rotación del supervisor o el bloque vigente por hora). */
  function contexto(){
    const u=(typeof state!=='undefined'&&state.user)||{},c=u.contextoRotacion||{};
    let bl=null;try{bl=window.GlacialIndicadores.bloqueVigente(ahora(),cfgBloques());}catch(_){bl=null;}
    const porHora=bl&&bl.bloque==='noche'?'NOCHE':'DÍA';
    const turno=String(u.turnoOperativo||c.turno||porHora).toUpperCase().includes('NOCHE')?'NOCHE':'DÍA';
    const fecha=u.fechaOperativa||c.fechaOperativa||(bl&&bl.fecha)||window.GlacialIndicadores.diaOperativo(ahora());
    return {fecha,bloque:turno};
  }
  const horario=()=>D().horarioDe(E.fecha,E.bloque);
  const datos=()=>D().datos(E.fecha,E.bloque);
  /* Un supervisor edita en su contexto (su fecha y bloque); Jefe de Producción y Administrador, en cualquiera. */
  function puedeEditarAqui(){
    if(!D().puedeEditar())return false;
    const rol=(state.user&&state.user.rol)||'';
    if(rol!=='Supervisor')return true;
    const c=contexto();
    return c.fecha===E.fecha&&c.bloque===E.bloque;
  }
  /* Instante de corte «ahora» dentro del bloque. */
  function corteAhora(){const h=horario();return h?Math.min(Math.max(ahora(),h.inicio),h.fin):ahora();}
  function horaAMs(texto){
    const m=String(texto||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return NaN;
    const h=horario();if(!h)return NaN;
    const base=new Date(h.inicio);
    const d=new Date(base.getFullYear(),base.getMonth(),base.getDate(),Number(m[1]),Number(m[2]));
    if(d.getTime()<h.inicio)d.setDate(d.getDate()+1);   // Noche: de 00:00 a 06:59 es el día siguiente
    return d.getTime();
  }

  /* Personal disponible: asistentes de Producción del Tareo del mismo bloque (solo para comprobar; null si no hay Tareo). */
  function disponibles(){
    try{
      const turnos=E.bloque==='NOCHE'?['NOCHE']:['DÍA','INTERMEDIO'];
      const ts=(typeof obtenerTareos==='function'?obtenerTareos():[]).filter(t=>t&&t.fecha===E.fecha&&turnos.includes(String(t.turno||'').toUpperCase())&&
        (typeof tareoAreaDe==='function'?tareoAreaDe(t)==='Producción':true));
      if(!ts.length)return null;
      const validos=new Set(['ASISTIO','ASISTIÓ','TARDANZA','FERIADO TRABAJADO','COMISION/TRABAJO EXTERNO','COMISIÓN/TRABAJO EXTERNO']);
      const vistos=new Set();
      ts.forEach(t=>(t.personal||[]).forEach(p=>{if(p&&validos.has(String(p.asistencia||'').toUpperCase()))vistos.add(String(p.trabajadorId||p.nombre||'').trim().toLowerCase());}));
      return vistos.size;
    }catch(_){return null;}
  }

  /* ---------- formulario ---------- */
  function nuevoOpId(){return 'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
  function reiniciarFormulario(){
    const d=datos(),corte=corteAhora(),ev=D().vigente(d.eventos,corte);
    const lineas={};
    D().LINEAS.forEach(l=>{const v=ev&&ev.lineas?ev.lineas[l]:null;lineas[l]=v===null||v===undefined?'':String(v);});
    E.form={lineas,desde:hhmm(corte),apoyo:ev&&ev.apoyoCompartido?String(ev.apoyoCompartido):'',motivo:'',obs:'',opId:nuevoOpId(),
      versionEsperada:d.parent?num(d.parent.version):0,correccion:false,dirty:false};
    E.error='';
  }
  function asegurarEscucha(){
    const key=D().clave(E.fecha,E.bloque);
    if(!E.escucha||E.escucha.key!==key){
      if(E.escucha){try{E.escucha.cerrar();}catch(_){/* ya cerrada */}}
      E.escucha={key,cerrar:D().escuchar(E.fecha,E.bloque)};
      E.form=null;
    }
    if(!E.oyente){E.oyente=true;D().alCambiar(refrescar);}
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{if(E.escucha){try{E.escucha.cerrar();}catch(_){/* ya cerrada */}}E.escucha=null;E.form=null;});

  /* ---------- HTML ---------- */
  function estilos(){
    if(document.getElementById('dp-css'))return;
    const s=document.createElement('style');s.id='dp-css';
    s.textContent=`
      .dp{max-width:760px;margin:0 auto;padding:4px 2px 40px}
      .dp h3{margin:0 0 4px}.dp .dp-sub{color:#667784;font-size:13px;margin-bottom:12px}
      .dp-card{background:#fff;border:1px solid #D7DBD4;border-radius:10px;padding:12px 14px;margin-bottom:12px}
      .dp-ctx{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .dp-ctx label,.dp-campo label{display:block;font-size:12px;color:#667784;margin-bottom:3px}
      .dp input,.dp select,.dp textarea{width:100%;box-sizing:border-box;min-height:46px;font-size:17px;padding:8px 10px;border:1px solid #B9C4CC;border-radius:8px}
      .dp textarea{min-height:60px;font-size:15px}
      .dp-fila{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #EEF2F5}
      .dp-fila:last-child{border-bottom:0}.dp-fila b{flex:1;font-size:16px}.dp-fila input{width:120px;text-align:center;font-weight:700;font-size:22px;min-height:52px}
      .dp-vig{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #EEF2F5}
      .dp-vig:last-child{border-bottom:0}
      .dp-pend{color:#B26A00;font-weight:600}.dp-ok{color:#1F7A44;font-weight:700}
      .dp-total{display:flex;justify-content:space-between;font-weight:700;font-size:16px;padding-top:8px}
      .dp-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .dp-btns button{flex:1 1 150px;min-height:50px;font-size:16px;font-weight:700;border-radius:10px;border:0;cursor:pointer}
      .dp-primario{background:#005B96;color:#fff}.dp-sec{background:#EAF5FC;color:#003B5C}.dp-btns button[disabled]{opacity:.45;cursor:not-allowed}
      .dp-aviso{padding:9px 12px;border-radius:8px;font-size:13px;margin-bottom:10px;background:#FFF4DC;color:#7A5200}
      .dp-error{background:#FDE7E5;color:#8A1C13}.dp-bien{background:#E3F4EA;color:#14532D}
      .dp-nota{font-size:12px;color:#667784;margin-top:6px}
      .dp-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-end;justify-content:center}
      .dp-modal>div{background:#fff;width:min(780px,100%);max-height:88vh;overflow:auto;border-radius:14px 14px 0 0;padding:14px}
      .dp-tabla{width:100%;border-collapse:collapse;font-size:12px;min-width:560px}.dp-tabla th,.dp-tabla td{border-bottom:1px solid #E2E8EC;padding:6px 5px;text-align:left;vertical-align:top}
      @media(min-width:700px){.dp-modal{align-items:center}.dp-modal>div{border-radius:14px}}`;
    document.head.appendChild(s);
  }
  function htmlResumen(){
    const d=datos(),h=horario(),corte=corteAhora(),eventos=d.eventos||[];
    const ult=eventos.slice().sort((a,b)=>num(b.version)-num(a.version))[0];
    const filas=D().LINEAS.map(l=>{
      const p=D().personalAlCorte(eventos,l,corte);
      return `<div class="dp-vig"><b>${esc(ETQ[l])}</b>${p.estado==='CONFIRMADO'
        ?`<span class="dp-ok">${p.cantidad} <small style="font-weight:400;color:#667784">desde ${hhmm(p.desdeMs)}</small></span>`
        :'<span class="dp-pend">Pendiente de confirmar</span>'}</div>`;
    }).join('');
    const total=D().LINEAS.reduce((s,l)=>s+(D().personalAlCorte(eventos,l,corte).cantidad||0),0);
    const vig=D().vigente(eventos,corte);
    const disp=disponibles(),cmp=D().compararConDisponible(total,disp);
    const apoyo=vig&&vig.apoyoCompartido?`<div class="dp-nota">Apoyo compartido (no sumado a las líneas): <b>${num(vig.apoyoCompartido)}</b></div>`:'';
    return `
      <div class="dp-card">
        <div class="dp-total"><span>Total distribuido ahora</span><span>${total}</span></div>${apoyo}
        <div class="dp-nota">Son asignaciones declaradas por el supervisor, no un conteo individual verificado.</div>
        ${ult?`<div class="dp-nota">Confirmada por <b>${esc(ult.usuario||'—')}</b> · última actualización ${fechaHora(ult.guardadoEnMs)} · versión ${num(ult.version)}</div>`
             :'<div class="dp-nota"><b>Sin confirmar:</b> aún no se registró la distribución de este bloque.</div>'}
        <div class="dp-aviso ${cmp.estado==='REVISAR'?'':'dp-bien'}" style="margin-top:8px;${cmp.estado==='NO_COMPROBABLE'?'background:#EEF2F5;color:#44525C':''}">${esc(cmp.mensaje)}${disp!==null?` (disponibles según Tareo: ${disp})`:''}</div>
      </div>
      <div class="dp-card"><h3 style="font-size:15px">Vigente ahora${h?` · bloque ${hhmm(h.inicio)}–${hhmm(h.fin)}`:''}</h3>${filas}</div>`;
  }
  function htmlFormulario(){
    if(!E.form)reiniciarFormulario();
    const f=E.form,d=datos(),hayEventos=!!d.parent;
    if(!puedeEditarAqui()){
      return `<div class="dp-card"><div class="dp-nota">${D().puedeEditar()
        ?'Como supervisor solo puedes registrar la distribución de tu fecha y bloque operativo.'
        :'Modo consulta: no tienes permiso para registrar la distribución de personal.'}</div>
        <div class="dp-btns"><button class="dp-sec" onclick="glacialDistribucionPantalla.historial(true)">Ver historial</button></div></div>`;
    }
    const filas=D().LINEAS.map(l=>`<div class="dp-fila"><b>${esc(ETQ[l])}</b>
      <input type="number" inputmode="numeric" min="0" step="1" placeholder="—" value="${esc(f.lineas[l])}" oninput="glacialDistribucionPantalla.campo('${l}',this.value)"></div>`).join('');
    const totalForm=D().totalDe(D().normalizarLineas(f.lineas).lineas);
    const bloqueado=E.guardando;
    return `
      <div class="dp-card">
        <h3 style="font-size:15px">${hayEventos?'Registrar cambio':'Confirmar distribución'}</h3>
        <div class="dp-campo" style="margin-bottom:8px"><label>Hora desde la que aplica</label>
          <input type="time" value="${esc(f.desde)}" oninput="glacialDistribucionPantalla.desde(this.value)"></div>
        ${filas}
        <div class="dp-total"><span>Total distribuido</span><span id="dp-total-form">${totalForm}</span></div>
        <div class="dp-nota">Vacío = sin confirmar. 0 = confirmado sin personal en esa línea.</div>
        <div class="dp-campo" style="margin-top:8px"><label>Apoyo compartido (opcional, no se suma a las líneas)</label>
          <input type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${esc(f.apoyo)}" oninput="glacialDistribucionPantalla.apoyo(this.value)"></div>
        <div class="dp-campo" style="margin-top:8px"><label>${hayEventos?'Motivo del cambio (obligatorio)':'Observaciones (opcional)'}</label>
          <textarea oninput="glacialDistribucionPantalla.motivo(this.value)">${esc(hayEventos?f.motivo:f.obs)}</textarea></div>
        ${D().puedeCorregir()&&hayEventos?`<label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px"><input type="checkbox" style="width:22px;min-height:22px" ${f.correccion?'checked':''} onchange="glacialDistribucionPantalla.correccion(this.checked)"> Es una corrección de una hora anterior a la última registrada</label>`:''}
        <div class="dp-btns">
          <button class="dp-primario" ${bloqueado||hayEventos?'disabled':''} onclick="glacialDistribucionPantalla.guardar()" title="Primera confirmación del bloque">Confirmar distribución</button>
          <button class="dp-primario" ${bloqueado||!hayEventos?'disabled':''} onclick="glacialDistribucionPantalla.guardar()" title="Cambio posterior (exige motivo)">Registrar cambio</button>
          <button class="dp-sec" onclick="glacialDistribucionPantalla.historial(true)">Ver historial</button>
        </div>
      </div>`;
  }
  function htmlHistorial(){
    const eventos=(datos().eventos||[]).slice().sort((a,b)=>num(b.version)-num(a.version));
    const cambios=e=>D().LINEAS.map(l=>{
      const a=e.anterior?e.anterior[l]:null,n=e.lineas?e.lineas[l]:null;
      if(a===n||(a===undefined&&n===null))return '';
      const t=v=>v===null||v===undefined?'—':v;
      return `${esc(ETQ[l])}: ${t(a)} → <b>${t(n)}</b>`;
    }).filter(Boolean).join('<br>')||'Sin cambios en las cantidades';
    return `<div class="dp-modal" onclick="if(event.target===this)glacialDistribucionPantalla.historial(false)"><div>
      <div style="display:flex;justify-content:space-between;align-items:center"><h3>Historial · ${esc(E.fecha)} · ${window.GlacialIndicadores.nombreBloque(E.bloque,'pantalla','titulo')}</h3>
        <button class="dp-sec" style="min-height:40px;padding:0 14px;border:0;border-radius:8px" onclick="glacialDistribucionPantalla.historial(false)">Cerrar</button></div>
      <div style="overflow-x:auto"><table class="dp-tabla"><thead><tr><th>Ver.</th><th>Aplica desde</th><th>Guardado</th><th>Usuario</th><th>Cantidades</th><th>Motivo / observación</th></tr></thead><tbody>
      ${eventos.map(e=>`<tr><td>${num(e.version)}${e.correccion?'<br><small>corrección</small>':''}</td><td>${hhmm(e.desdeMs)}</td><td>${fechaHora(e.guardadoEnMs)}</td><td>${esc(e.usuario||'—')}</td><td>${cambios(e)}${num(e.apoyoCompartido)?`<br>Apoyo: ${num(e.apoyoCompartido)}`:''}</td><td>${esc(e.motivo||e.observaciones||'—')}</td></tr>`).join('')||'<tr><td colspan="6">Sin eventos registrados.</td></tr>'}
      </tbody></table></div></div></div>`;
  }
  function htmlBanner(){
    const d=datos();
    if(E.form&&E.form.dirty&&(d.parent?num(d.parent.version):0)!==E.form.versionEsperada)
      return '<div class="dp-aviso dp-error">Otra persona guardó una distribución mientras editabas. Pulsa «Actualizar» para ver los valores vigentes; si guardas ahora se te pedirá actualizar.<div class="dp-btns"><button class="dp-sec" onclick="glacialDistribucionPantalla.actualizar()">Actualizar</button></div></div>';
    if(E.error)return `<div class="dp-aviso dp-error">${esc(E.error)}</div>`;
    if(E.aviso)return `<div class="dp-aviso dp-bien">${esc(E.aviso)}</div>`;
    return '';
  }

  /* ---------- pintado ---------- */
  function pintar(){
    const main=document.getElementById('main');if(!main)return;
    estilos();
    if(!E.fecha){const c=contexto();E.fecha=c.fecha;E.bloque=c.bloque;}
    asegurarEscucha();
    const tabs=typeof tareoRenderTabs==='function'?tareoRenderTabs('distribucion'):'';
    main.innerHTML=`${tabs}<div class="dp" id="dp-root">
      <h3>DISTRIBUCIÓN DE PERSONAL</h3><div class="dp-sub">Cuántas personas hay en cada línea. Avance/Cierre y los reportes leen estos mismos datos.</div>
      <div class="dp-card"><div class="dp-ctx">
        <div class="dp-campo"><label>Fecha operativa</label><input type="date" value="${esc(E.fecha)}" onchange="glacialDistribucionPantalla.contexto(this.value,null)"></div>
        <div class="dp-campo"><label>Bloque</label><select onchange="glacialDistribucionPantalla.contexto(null,this.value)">
          <option value="DÍA" ${E.bloque==='DÍA'?'selected':''}>${window.GlacialIndicadores.nombreBloque('DÍA','pantalla','titulo')}</option><option value="NOCHE" ${E.bloque==='NOCHE'?'selected':''}>Noche</option></select></div>
      </div></div>
      <div id="dp-banner">${htmlBanner()}</div>
      <div id="dp-resumen">${htmlResumen()}</div>
      <div id="dp-form">${htmlFormulario()}</div>
      <div id="dp-modal">${E.historial?htmlHistorial():''}</div></div>`;
  }
  /* Cambio remoto (otro dispositivo o supervisor): se actualiza el resumen y el aviso sin tocar lo que se está escribiendo. */
  function refrescar(){
    if(!document.getElementById('dp-root'))return;
    const b=document.getElementById('dp-banner'),r=document.getElementById('dp-resumen'),m=document.getElementById('dp-modal');
    if(b)b.innerHTML=htmlBanner();
    if(r)r.innerHTML=htmlResumen();
    if(m)m.innerHTML=E.historial?htmlHistorial():'';
    if(!E.form||!E.form.dirty){E.form=null;const f=document.getElementById('dp-form');if(f)f.innerHTML=htmlFormulario();}
  }

  /* ---------- acciones ---------- */
  async function guardar(){
    if(E.guardando||!E.form)return;
    const f=E.form,d=datos(),hayEventos=!!d.parent;
    const desdeMs=horaAMs(f.desde);
    E.guardando=true;E.error='';E.aviso='';
    document.getElementById('dp-form').innerHTML=htmlFormulario();
    try{
      const res=await D().guardar(E.fecha,E.bloque,{opId:f.opId,versionEsperada:f.versionEsperada,desdeMs,lineas:f.lineas,
        apoyoCompartido:f.apoyo,motivo:hayEventos?f.motivo:'',observaciones:hayEventos?'':f.obs,correccion:f.correccion});
      E.aviso=res.duplicado?'Esa operación ya estaba guardada.':'Distribución guardada (versión '+res.evento.version+').';
      E.form=null;
    }catch(e){
      E.error=e&&e.message?e.message:'No se pudo guardar la distribución.';
      if(e&&e.codigo==='CONFLICTO'&&E.form)E.form.versionEsperada=-1;   // fuerza a actualizar antes de reintentar
    }finally{E.guardando=false;}
    const b=document.getElementById('dp-banner');if(b)b.innerHTML=htmlBanner();
    const r=document.getElementById('dp-resumen');if(r)r.innerHTML=htmlResumen();
    const fo=document.getElementById('dp-form');if(fo)fo.innerHTML=htmlFormulario();
  }
  const api={
    pintar,guardar,
    campo(l,v){if(!E.form)return;E.form.lineas[l]=v;E.form.dirty=true;const t=document.getElementById('dp-total-form');if(t)t.textContent=D().totalDe(D().normalizarLineas(E.form.lineas).lineas);},
    desde(v){if(E.form){E.form.desde=v;E.form.dirty=true;}},
    apoyo(v){if(E.form){E.form.apoyo=v;E.form.dirty=true;}},
    motivo(v){if(!E.form)return;if(datos().parent)E.form.motivo=v;else E.form.obs=v;E.form.dirty=true;},
    correccion(v){if(E.form){E.form.correccion=!!v;E.form.dirty=true;}},
    historial(v){E.historial=!!v;const m=document.getElementById('dp-modal');if(m)m.innerHTML=v?htmlHistorial():'';},
    actualizar(){E.form=null;E.error='';E.aviso='';pintar();},
    contexto(fecha,bloque){if(fecha)E.fecha=fecha;if(bloque)E.bloque=bloque;E.form=null;E.error='';E.aviso='';pintar();},
    estado:()=>E
  };
  window.glacialDistribucionPantalla=api;
  window.renderDistribucionPersonal=pintar;
})();
