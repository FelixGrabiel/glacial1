/* =============================================================
   MANTENIMIENTO · VELOCIDADES ESTÁNDAR (UND/h por línea y formato) con historial
   -------------------------------------------------------------
   Antes la velocidad se editaba dentro de Planificación (catálogo) y en el editor de metas de Análisis de paradas. Ahora se cambia AQUÍ,
   en Mantenimiento: Administrador y quienes tienen el permiso «moduloMantenimiento». Planificación y los demás módulos solo la leen.
   La tabla sigue siendo sync/configIndicadores → velocidades (la que ya leen Planificación, Resumen, Registro y Análisis), así que un cambio
   se ve en todo el sistema en segundos. Cada cambio guarda desde cuándo rige la nueva y deja lo anterior en un HISTORIAL oculto (se abre
   con «Ver historial»); nada se borra. Lógica pura y pruebas: js/nucleo/45b-velocidades-vigencia.js y tests/velocidades-vigencia.test.js.
   Reglas del servidor: migración glacial_36 (la marca «supmtto» puede escribir solo estos campos de configIndicadores).
   ============================================================= */
(function(){
  'use strict';
  const TAB='velocidades-estandar',BOTON='btn-velocidades';
  const GV=()=>window.GlacialVelocidades;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n).toLocaleString('es-PE');
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const hoyIso=()=>GlacialFecha.fechaISOLocal(ahoraMs());          // fecha de hoy en hora de Lima (01b-fecha-operativa.js)
  const ddmmaaaa=f=>{const m=String(f||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:'—';};
  const cuando=ms=>{if(!ms)return '';const d=new Date(ms);return isNaN(d)?'':d.toLocaleString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};

  /* ---------- permisos ---------- */
  const rol=()=>String((typeof state!=='undefined'&&state.user&&state.user.rol)||'').trim();
  function puedeEditar(){
    if(typeof state==='undefined'||!state.user)return false;
    if(typeof esMantCompartido==='function'&&esMantCompartido(state.user))return false;       // la cuenta compartida solo consulta
    return rol()==='Administrador'||(typeof tienePermiso==='function'&&tienePermiso('moduloMantenimiento'));
  }
  function puedeVer(){
    if(typeof state==='undefined'||!state.user)return false;
    if(puedeEditar())return true;
    const P=window.glacialPlanificacion;
    const jef=['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'].includes(rol());
    return jef||(typeof tienePermiso==='function'&&tienePermiso('planificacion'))||!!(P&&P.puedeVer&&P.puedeVer());
  }

  /* ---------- datos ---------- */
  const cfg=()=>{try{return(typeof window.glacialConfigIndicadores==='function'?window.glacialConfigIndicadores():null)||{velocidades:{}};}catch(_){return {velocidades:{}};}};
  const nombreLinea=k=>{try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}};
  const ordenLinea=k=>{try{const i=(typeof LINES!=='undefined'?LINES:[]).findIndex(x=>x.key===k);return i<0?99:i;}catch(_){return 99;}};
  const nombrePres=p=>String(p||'').replace(/_/g,' ');

  /* Una fila por línea y formato: los de la tabla + los formatos conocidos que aún no tienen valor cargado (se ve el valor base del código). */
  function filas(){
    const c=cfg(),v=GV(),vel=c.velocidades||{},vistos=new Set(),res=[];
    const agregar=(clave,linea,pres,marca,sinCargar,base)=>{
      const n=v.normClave(clave);if(vistos.has(n))return;vistos.add(n);
      const act=v.vigente(c,clave);
      res.push({clave,linea,presentacion:pres,marca,valor:sinCargar?(base||null):act.valor,sinCargar,desde:act.desde,por:act.por,en:act.en,motivo:act.motivo,historial:v.historial(c,clave)});
    };
    Object.keys(vel).forEach(k=>{if(Number(vel[k])>0){const p=v.partesDeClave(k);agregar(k,p.linea,p.presentacion,p.marca,false);}});
    try{
      Object.keys(PRESENTACIONES_POR_LINEA).forEach(l=>(PRESENTACIONES_POR_LINEA[l]||[]).forEach(p=>{
        const clave=l+'|'+p;
        if(vistos.has(v.normClave(clave)))return;
        const base=typeof window.glacialVelocidadCatalogo==='function'?Number(window.glacialVelocidadCatalogo(l,p,''))||null:null;
        agregar(clave,l,p,'',true,base);
      }));
    }catch(_){/* sin lista de presentaciones */}
    return res.sort((a,b)=>ordenLinea(a.linea)-ordenLinea(b.linea)||a.presentacion.localeCompare(b.presentacion,'es')||a.marca.localeCompare(b.marca,'es'));
  }

  const UI={linea:'',abiertos:new Set()};

  function estilos(){
    if(document.getElementById('vel-css'))return;
    const s=document.createElement('style');s.id='vel-css';
    s.textContent=
      '.vel-wrap{max-width:1100px}'+
      '.vel-nota{border:1px solid #cfe3d8;background:#f2faf5;border-radius:12px;padding:10px 14px;font-size:13px;line-height:1.45;margin:6px 0 14px}'+
      '.vel-nota.vel-solo{border-color:#e6d9a8;background:#fffbea}'+
      '.vel-barra{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:12px}'+
      '.vel-barra label{font-size:13px;display:flex;flex-direction:column;gap:3px}'+
      '.vel-barra select{padding:7px 10px;border:1px solid #b8c6d2;border-radius:8px;min-width:180px}'+
      '.vel-linea{margin:18px 0 6px;font-size:16px;color:#003b5c}'+
      '.vel-tabla{width:100%;table-layout:fixed;border-collapse:collapse;background:#fff;border:1px solid #d5e3ec;border-radius:12px;overflow:hidden;font-size:13px}'+
      '.vel-tabla th{background:#eef5fa;text-align:left;padding:8px 10px;font-size:12px;color:#44586a}'+
      '.vel-tabla td{padding:9px 10px;border-top:1px solid #e6eef3;vertical-align:top}'+
      '.vel-tabla .vel-num{text-align:right;white-space:nowrap}'+
      '.vel-valor{font-weight:700;font-size:15px;color:#003b5c}'+
      '.vel-chip{display:inline-block;font-size:11px;padding:2px 8px;border-radius:99px;background:#fff3dc;color:#8a5a00;font-weight:700}'+
      '.vel-chip.vel-hist{background:#eef5fa;color:#44586a}'+
      '.vel-acc{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}'+
      '.vel-hist-fila td{background:#fafcfd;padding:8px 10px 12px 28px}'+
      '.vel-hist-lista{margin:0;padding-left:16px}.vel-hist-lista li{margin:5px 0;line-height:1.4}'+
      '.vel-muted{color:#6a7b8b;font-size:12px}'+
      '.vel-modal{position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10060;padding:16px}'+
      '.vel-modal>div{background:#fff;border-radius:12px;padding:18px;max-width:460px;width:100%;max-height:92vh;overflow:auto}'+
      '.vel-modal label{display:block;font-size:13px;margin:10px 0}.vel-modal input{display:block;width:100%;padding:8px;margin-top:3px;border:1px solid #b8c6d2;border-radius:8px;box-sizing:border-box}'+
      '.vel-err{color:#c62828;font-size:12px;min-height:16px}'+
      '@media (max-width:700px){.vel-tabla colgroup{display:none}.vel-tabla thead{display:none}.vel-tabla td{display:block;border-top:0;padding:3px 10px}.vel-tabla tr{display:block;border-top:1px solid #e6eef3;padding:6px 0}.vel-tabla .vel-num{text-align:left}.vel-acc{justify-content:flex-start}}';
    document.head.appendChild(s);
  }

  function htmlHistorial(f){
    if(!f.historial.length)return '<div class="vel-muted">Esta velocidad todavía no ha cambiado: no hay historial.</div>';
    return '<ul class="vel-hist-lista">'+f.historial.map(h=>
      '<li><b>'+fmt(h.valor)+' UND/h</b> · '+(h.desde?'desde '+ddmmaaaa(h.desde):'desde antes de llevar historial')+(h.hasta?' hasta '+ddmmaaaa(h.hasta):'')+
      (h.por?'<div class="vel-muted">La puso '+esc(h.por)+(h.en?' · '+esc(cuando(h.en)):'')+(h.motivo?' · «'+esc(h.motivo)+'»':'')+'</div>':'')+
      '<div class="vel-muted">La reemplazó '+esc(h.reemplazadoPor||'—')+(h.reemplazadoEn?' · '+esc(cuando(h.reemplazadoEn)):'')+(h.motivoCambio?' · «'+esc(h.motivoCambio)+'»':'')+'</div></li>').join('')+'</ul>';
  }

  function pintar(main){
    estilos();
    const editar=puedeEditar(),todas=filas();
    const lineas=[...new Set(todas.map(f=>f.linea))];
    const visibles=todas.filter(f=>!UI.linea||f.linea===UI.linea);
    const porLinea=lineas.filter(l=>!UI.linea||l===UI.linea).map(l=>{
      const fs=visibles.filter(f=>f.linea===l);
      if(!fs.length)return '';
      return '<h3 class="vel-linea">'+esc(nombreLinea(l))+'</h3><table class="vel-tabla"><colgroup><col style="width:31%"><col style="width:15%"><col style="width:13%"><col style="width:23%"><col style="width:18%"></colgroup><thead><tr><th>Formato</th><th class="vel-num">Velocidad (UND/h)</th><th>Rige desde</th><th>Última modificación</th><th></th></tr></thead><tbody>'+
        fs.map(f=>{
          const abierto=UI.abiertos.has(f.clave);
          const sub=f.marca?'<div class="vel-muted">Solo para la marca '+esc(f.marca)+'</div>':'';
          return '<tr><td><b>'+esc(nombrePres(f.presentacion))+'</b>'+sub+'</td>'+
            '<td class="vel-num">'+(f.valor?'<span class="vel-valor">'+fmt(f.valor)+'</span>':'<span class="vel-muted">sin valor</span>')+(f.sinCargar&&f.valor?'<div><span class="vel-chip" title="Es el valor base del sistema; aún no se ha guardado en la tabla">valor base</span></div>':'')+'</td>'+
            '<td>'+(f.desde?ddmmaaaa(f.desde):'<span class="vel-muted">—</span>')+'</td>'+
            '<td>'+(f.por?esc(f.por)+(f.en?'<div class="vel-muted">'+esc(cuando(f.en))+'</div>':'')+(f.motivo?'<div class="vel-muted">«'+esc(f.motivo)+'»</div>':''):'<span class="vel-muted">—</span>')+'</td>'+
            '<td><div class="vel-acc">'+(editar?'<button type="button" class="btn btn-primary btn-sm" data-vel-cambiar="'+esc(f.clave)+'">'+(f.valor?'Cambiar':'Cargar')+'</button>':'')+
              (f.historial.length?'<button type="button" class="btn btn-ghost btn-sm" data-vel-hist="'+esc(f.clave)+'" aria-expanded="'+abierto+'">'+(abierto?'Ocultar historial':'Ver historial ('+f.historial.length+')')+'</button>':'')+'</div></td></tr>'+
            (abierto?'<tr class="vel-hist-fila"><td colspan="5">'+htmlHistorial(f)+'</td></tr>':'');
        }).join('')+'</tbody></table>';
    }).join('');
    main.innerHTML='<div class="vel-wrap" id="vel-raiz"><div class="main-head"><div><h2>Velocidades estándar</h2><div class="sub">Unidades por hora de cada línea y formato. Es la base del rendimiento y del OEE en todo el sistema.</div></div>'+
      (window.glacialEstadoDatos?'<div>'+window.glacialEstadoDatos.chip()+'</div>':'')+'</div>'+
      (editar?'<div class="vel-nota"><b>Cómo funciona:</b> al cambiar una velocidad, la nueva rige desde la fecha que indiques y se ve en todo el sistema (Planificación, Resumen, Registro). La anterior no se pierde: queda en el <b>historial</b>, oculto, y se abre con «Ver historial». Los reportes ya registrados conservan su propia velocidad.</div>'
        :'<div class="vel-nota vel-solo"><b>Solo consulta.</b> Las velocidades las cambian Mantenimiento y el Administrador. Aquí puedes ver el valor vigente y su historial.</div>')+
      '<div class="vel-barra"><label>Línea<select id="vel-linea"><option value="">Todas</option>'+lineas.map(l=>'<option value="'+esc(l)+'"'+(UI.linea===l?' selected':'')+'>'+esc(nombreLinea(l))+'</option>').join('')+'</select></label></div>'+
      (porLinea||'<div class="vel-nota vel-solo">No hay velocidades para mostrar.</div>')+'</div>';
  }

  /* ---------- cambio de velocidad ---------- */
  function abrirCambio(clave){
    const f=filas().find(x=>GV().normClave(x.clave)===GV().normClave(clave));
    if(!f)return;
    if(!puedeEditar()){alert('Solo Mantenimiento y el Administrador pueden cambiar la velocidad estándar.');return;}
    const fondo=document.createElement('div');fondo.className='vel-modal';
    const min=f.desde||'';
    fondo.innerHTML='<div role="dialog" aria-modal="true" aria-label="Cambiar velocidad estándar"><h3 style="margin:0 0 4px">'+(f.valor?'Cambiar':'Cargar')+' velocidad estándar</h3>'+
      '<div class="vel-muted">'+esc(nombreLinea(f.linea))+' · '+esc(nombrePres(f.presentacion))+(f.marca?' · '+esc(f.marca):'')+'</div>'+
      (f.valor?'<p style="margin:10px 0 0;font-size:13px">Velocidad actual: <b>'+fmt(f.valor)+' UND/h</b>'+(f.desde?' (desde '+ddmmaaaa(f.desde)+')':'')+'. Al guardar, quedará en el historial.</p>':'')+
      '<label>Nueva velocidad (UND/h)<input type="number" id="vel-nuevo" min="1" step="1" inputmode="numeric" autofocus></label>'+
      '<label>Rige desde<input type="date" id="vel-desde" value="'+hoyIso()+'"'+(min?' min="'+min+'"':'')+'></label>'+
      '<label>Motivo del cambio<input type="text" id="vel-motivo" maxlength="160" placeholder="Ej.: medición de 3 turnos, cambio de molde…"></label>'+
      '<div class="vel-err" id="vel-error" role="alert"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px"><button type="button" class="btn btn-ghost" id="vel-x">Cancelar</button><button type="button" class="btn btn-primary" id="vel-ok">Guardar cambio</button></div></div>';
    document.body.appendChild(fondo);
    const q=i=>fondo.querySelector('#'+i),err=t=>{q('vel-error').textContent=t||'';};
    q('vel-x').onclick=()=>fondo.remove();
    q('vel-ok').onclick=async()=>{
      err('');
      const e={valor:q('vel-nuevo').value,desde:q('vel-desde').value,motivo:q('vel-motivo').value,por:(state.user&&(state.user.nombre||state.user.username))||'',ahoraMs:ahoraMs()};
      const previo=GV().prepararCambio(cfg(),f.clave,e);
      if(previo.error){err(previo.error);return;}
      if(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false){err('Sin conexión: no se guardó. Inténtalo cuando vuelva la conexión.');return;}
      q('vel-ok').disabled=true;err('Guardando…');
      try{
        const ref=db.collection('sync').doc('configIndicadores');
        await db.runTransaction(async tx=>{
          const snap=await tx.get(ref);
          const fresco=snap.exists?(snap.data()||{}):{};
          const r=GV().prepararCambio(fresco,f.clave,e);          // con el dato más reciente del servidor, para no pisar el historial de otra persona
          if(r.error)throw new Error(r.error);
          tx.set(ref,Object.assign({},r.patch,{actualizadoPor:(state.user&&state.user.username)||'',actualizadoEn:ahoraMs()}),{merge:true});
        });
        fondo.remove();
        repintar();
      }catch(ex){err('No se pudo guardar: '+((ex&&ex.message)||ex));q('vel-ok').disabled=false;}
    };
    setTimeout(()=>{try{q('vel-nuevo').focus();}catch(_){/* ya cerrado */}},50);
  }

  function repintar(){
    if(typeof state==='undefined'||state.currentTab!==TAB)return;
    const m=document.getElementById('main');
    if(m&&!m.querySelector('.vel-modal input:focus'))pintar(m);
  }

  document.addEventListener('click',e=>{
    const raiz=e.target.closest&&e.target.closest('#vel-raiz');
    if(!raiz)return;
    const c=e.target.closest('[data-vel-cambiar]');
    if(c){abrirCambio(c.getAttribute('data-vel-cambiar'));return;}
    const h=e.target.closest('[data-vel-hist]');
    if(h){const k=h.getAttribute('data-vel-hist');if(UI.abiertos.has(k))UI.abiertos.delete(k);else UI.abiertos.add(k);repintar();}
  });
  document.addEventListener('change',e=>{
    if(e.target&&e.target.id==='vel-linea'){UI.linea=e.target.value;repintar();}
  });
  (window.glacialConfigIndicadoresOyentes=window.glacialConfigIndicadoresOyentes||[]).push(repintar);   // otra persona cambió algo: se actualiza solo

  /* ---------- navegación ---------- */
  function ir(){
    if(!puedeVer()){alert('No tienes permiso para ver esta pantalla.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    if(typeof window.glacialConfigIndicadoresEscuchar==='function')window.glacialConfigIndicadoresEscuchar();
    state.currentTab=TAB;
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  }
  window.goVelocidadesEstandar=ir;
  window.glacialVelocidadesPantalla={filas,puedeEditar,puedeVer,abrirCambio};

  if(typeof ajustarVistaSegunPermisos==='function'){
    const a=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){if(state.currentTab===TAB&&puedeVer())return;return a.apply(this,arguments);};
  }
  if(typeof renderMain==='function'){
    const a=renderMain;
    renderMain=function(){
      if(state.currentTab===TAB&&!state.showWelcome&&puedeVer()){pintar(document.getElementById('main'));return;}
      return a.apply(this,arguments);
    };
  }
  if(typeof renderSidebar==='function'){
    const a=renderSidebar;
    renderSidebar=function(){
      const r=a.apply(this,arguments);
      const b=document.getElementById(BOTON);
      if(b){
        const m=puedeVer();b.hidden=!m;b.style.display=m?'':'none';
        b.classList.toggle('active',m&&state.currentTab===TAB);
        if(m&&state.currentTab===TAB)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      }
      if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
      return r;
    };
  }
})();
