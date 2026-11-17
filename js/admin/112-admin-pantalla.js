/* =============================================================
   GLACIAL · PANEL DE ADMINISTRACIÓN (Centro de control) · PANTALLA — etapa 1
   -------------------------------------------------------------
   Secciones construidas: Resumen · Usuarios · Roles y permisos · Auditoría (consolidada, solo lectura).
   Las otras 13 aparecen en el menú con la etapa en que se construyen (docs/00-general/panel-administracion.md).
   Edición en BORRADOR: nada se guarda hasta «Guardar cambios»; ahí se pide el motivo (≥ 10 caracteres) y se guarda todo o nada. Cada cambio queda en la auditoría.
   Se adapta a celular: el menú lateral pasa a una fila deslizable arriba, las tablas se desplazan dentro de su caja y los botones miden ≥ 44 px.
   ============================================================= */
(function(){
  'use strict';
  if(typeof window==='undefined'||!window.document)return;
  const W=window,N=W.glacialAdminNucleo;
  const DA=()=>W.glacialAdminDatos;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S={sec:'resumen',gq:'',q:'',rolFiltro:'Todos',sel:'',borr:{},abiertas:{},rolSel:'',af:{modulo:'Todos',quien:'Todos',texto:''},aLim:100,modal:null,msg:null,guardando:false,menuAbierto:false};
  let desub=null;

  const claves=()=>DA().clavesPermisos();
  const etiqueta=k=>DA().etiquetaPermiso(k);
  const usuarios=()=>{try{return (loadUsers()||[]).filter(u=>u&&u.username);}catch(_){return [];}};
  const trabajadores=()=>{try{return loadWorkers()||[];}catch(_){return [];}};
  const plantillas=()=>(typeof PERMISOS_SUGERIDOS_POR_ROL!=='undefined'?PERMISOS_SUGERIDOS_POR_ROL:{});
  const roles=()=>[...new Set([...Object.keys(plantillas()),...usuarios().map(u=>String(u.rol||'').trim()).filter(Boolean),'Administrador'])].sort((a,b)=>a.localeCompare(b,'es'));
  const plantillaDeRol=rol=>rol==='Administrador'?N.TODOS:(plantillas()[rol]||[]).filter(p=>claves().includes(p));
  const fmtFecha=ms=>{if(!ms)return '—';try{return new Date(ms).toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}catch(_){return '—';}};
  const hoyLima=()=>{try{return new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});}catch(_){return '';}};
  const inicioHoyMs=()=>{const f=hoyLima();const t=f?Date.parse(f+'T00:00:00-05:00'):0;return Number.isFinite(t)?t:0;};
  const filasAud=()=>{
    const por={};DA().AUDITORIAS.forEach(([c])=>{por[c]=DA().D.cache[c]||[];});
    return N.consolidar(por);
  };

  /* ---------- estilos ---------- */
  function estilos(){return `<style>
.adm{display:grid;grid-template-columns:240px minmax(0,1fr);gap:18px;color:#033350;font-size:14px;align-items:start}.adm *{box-sizing:border-box}
.adm-menu{position:sticky;top:8px;background:linear-gradient(180deg,#0a2745,#0c3358);color:#cfe2f5;border-radius:14px;padding:14px 10px;display:flex;flex-direction:column;gap:2px;max-height:calc(100vh - 24px);overflow:auto}
.adm-marca{display:flex;gap:10px;align-items:center;margin:0 6px 12px}.adm-marca b{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#0877A6;color:#fff;font-size:18px}.adm-marca span{display:block;font-weight:800;color:#fff;letter-spacing:.05em}.adm-marca small{color:#8fc4ec}
.adm-g{font-size:11px;font-weight:800;letter-spacing:.1em;color:#7fa9cc;margin:12px 10px 4px}
.adm-menu button{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;border:0;background:none;color:#cfe2f5;padding:10px 12px;border-radius:9px;font:inherit;font-weight:600;cursor:pointer;min-height:44px}
.adm-menu button:hover{background:rgba(255,255,255,.08)}.adm-menu button.act{background:rgba(56,189,248,.2);color:#fff;box-shadow:inset 3px 0 0 #38bdf8}.adm-menu button.pr{opacity:.62}
.adm-menu button small{font-size:10.5px;font-weight:700;color:#8fc4ec;border:1px solid rgba(143,196,236,.4);border-radius:99px;padding:1px 7px;white-space:nowrap}
.adm-cab{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-end;margin:0 0 14px}.adm-cab small{color:#587087;font-weight:700;letter-spacing:.04em}.adm-cab h1{margin:2px 0;font-size:28px}.adm-cab p{margin:0;color:#587087}
.adm-bus{position:relative;min-width:260px;flex:1 1 280px;max-width:420px}.adm-bus label{display:block;font-size:11px;font-weight:700;color:#587087;margin:0 0 3px}.adm-bus input{width:100%}
.adm-res{position:absolute;z-index:20;left:0;right:0;top:100%;background:#fff;border:1px solid #cddfec;border-radius:10px;box-shadow:0 8px 24px rgba(15,50,90,.16);max-height:300px;overflow:auto}.adm-res button{display:flex;justify-content:space-between;gap:8px;width:100%;border:0;background:none;padding:10px 12px;text-align:left;font:inherit;cursor:pointer;min-height:44px}.adm-res button:hover{background:#f1f8fd}.adm-res small{color:#587087}
.adm-en{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#157a3b}.adm-en i{width:9px;height:9px;border-radius:50%;background:#16a34a}
.adm input,.adm select,.adm textarea{font:inherit;padding:8px 10px;border:1px solid #cddfec;border-radius:9px;background:#fff;color:#14263a;min-height:44px}.adm textarea{min-height:80px}
.adm-card{background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:14px 16px;margin:0 0 14px}.adm-card h2{margin:0 0 8px;font-size:15px}.adm-mut{color:#587087;font-size:12.5px}
.adm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:0 0 14px}.adm-kpi{background:#fff;border:1px solid #d9e7f1;border-radius:14px;padding:12px 14px;text-align:left;font:inherit;cursor:pointer;min-height:44px}.adm-kpi span{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#587087}.adm-kpi b{display:block;font-size:30px;margin:3px 0 1px}.adm-kpi small{color:#587087}.adm-kpi.pr{opacity:.6}
.adm-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:14px;align-items:start}
.adm-caja{overflow-x:auto;border:1px solid #e2ebf2;border-radius:10px}.adm-t{width:100%;border-collapse:collapse}.adm-t th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#587087;background:#f4f9fd;text-align:left;padding:9px 10px;white-space:nowrap}.adm-t td{padding:9px 10px;border-top:1px solid #eaf1f7;vertical-align:top}.adm-t tr.sel td{background:#eaf5fc}.adm-t tr.cl{cursor:pointer}.adm-t tr.cl:hover td{background:#f4f9fd}
.adm-b{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #9fd0e6;background:#fff;color:#0877a6;font:inherit;font-weight:700;cursor:pointer}.adm-b.p{background:#0877a6;color:#fff;border-color:#0877a6}.adm-b:disabled{opacity:.5;cursor:not-allowed}
.adm-f{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:0 0 12px}.adm-f label{display:grid;gap:3px;font-size:11px;font-weight:700;color:#587087;text-transform:uppercase;letter-spacing:.05em}
.adm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.adm-grid label{display:grid;gap:3px;font-size:12px;font-weight:700;color:#587087}
.adm-ar{border:1px solid #e2ebf2;border-radius:10px;margin:0 0 8px}.adm-ar>div{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:6px 10px;background:#f7fbfe;border-radius:10px}.adm-ar>div button{border:0;background:none;font:inherit;font-weight:700;color:#033350;cursor:pointer;min-height:40px;text-align:left}
.adm-pe{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:4px 14px;padding:8px 12px}.adm-pe label{display:flex;gap:8px;align-items:flex-start;font-size:13px;min-height:32px}
.adm-barra{position:sticky;bottom:8px;z-index:30;display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;background:#033350;color:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 8px 24px rgba(3,51,80,.35)}.adm-barra .adm-b{border-color:#fff}
.adm-msg{border-radius:10px;padding:10px 14px;margin:0 0 12px}.adm-msg.e{background:#fdecec;color:#991b1b;border:1px solid #f5b5b5}.adm-msg.k{background:#e7f6ec;color:#15803d;border:1px solid #b7e4c7}.adm-msg.i{background:#eaf5fc;color:#0b4a6b;border:1px solid #bfdcec}
.adm-mod{position:fixed;inset:0;z-index:10050;background:rgba(7,30,48,.5);display:flex;align-items:center;justify-content:center;padding:14px}.adm-mod>div{background:#fff;border-radius:14px;padding:18px;max-width:560px;width:100%;max-height:90vh;overflow:auto}.adm-mod ul{margin:6px 0 10px 16px;padding:0;font-size:13px}
.adm-pill{display:inline-block;font-size:11px;font-weight:800;border-radius:99px;padding:2px 9px;background:#e8eef4;color:#587087;white-space:nowrap}
.adm-vacio{padding:22px;text-align:center;color:#587087;border:1px dashed #c3d8e8;border-radius:12px}
@media(max-width:900px){.adm{grid-template-columns:minmax(0,1fr)}.adm-menu{position:static;flex-direction:row;overflow-x:auto;max-height:none;padding:8px;gap:4px}.adm-marca,.adm-g{display:none}.adm-menu button{width:auto;white-space:nowrap}.adm-2{grid-template-columns:minmax(0,1fr)}}
</style>`;}

  /* ---------- marco ---------- */
  function menuHtml(){
    return N.GRUPOS.map(g=>`<span class="adm-g">${esc(g.toUpperCase())}</span>`+N.SECCIONES.filter(s=>s.grupo===g).map(s=>
      `<button type="button" class="${S.sec===s.id?'act':''}${s.etapa>1?' pr':''}" ${S.sec===s.id?'aria-current="page"':''} onclick="admIr('${s.id}')"><span>${esc(s.titulo)}</span>${s.etapa>1?`<small>Etapa ${s.etapa}</small>`:''}</button>`).join('')).join('');
  }
  function resultadosBusqueda(){
    const q=S.gq.trim().toLowerCase();if(q.length<2)return '';
    const r=[];
    usuarios().filter(u=>[u.nombre,u.username,u.rol].join(' ').toLowerCase().includes(q)).slice(0,5).forEach(u=>r.push(['Usuario',u.nombre||u.username,u.rol||'',`admBuscarIr('usuarios','${esc(u.username)}')`]));
    trabajadores().filter(t=>[t.nombre,t.dni,t.puesto].join(' ').toLowerCase().includes(q)).slice(0,4).forEach(t=>r.push(['Trabajador',t.nombre||'',[t.area,t.puesto].filter(Boolean).join(' · '),`admBuscarIr('trabajadores','')`]));
    N.SECCIONES.filter(s=>s.titulo.toLowerCase().includes(q)||s.sub.toLowerCase().includes(q)).slice(0,4).forEach(s=>r.push(['Sección',s.titulo,s.grupo,`admBuscarIr('${s.id}','')`]));
    return `<div class="adm-res" role="listbox">${r.length?r.map(x=>`<button type="button" onclick="${x[3]}"><span><b>${esc(x[1])}</b><br><small>${esc(x[2])}</small></span><small>${esc(x[0])}</small></button>`).join(''):`<div class="adm-mut" style="padding:12px">Sin resultados para «${esc(S.gq)}».</div>`}</div>`;
  }
  function html(){
    const sec=N.seccion(S.sec);
    return `${estilos()}<div class="adm"><nav class="adm-menu" aria-label="Secciones del panel"><div class="adm-marca"><b aria-hidden="true">G</b><div><span>GLACIAL</span><small>Centro de control</small></div></div>${menuHtml()}</nav>
      <div><div class="adm-cab"><div><small>Administración · ${esc(sec.grupo)}</small><h1>${esc(sec.titulo)}</h1><p>${esc(sec.sub)}</p></div>
        <div class="adm-bus"><label for="adm-gq">Buscar en GLACIAL</label><input id="adm-gq" type="search" placeholder="Usuario, trabajador o sección…" value="${esc(S.gq)}" oninput="admBuscar(this.value)" autocomplete="off">${resultadosBusqueda()}</div>
        <span class="adm-en"><i></i>En vivo</span></div>
        ${S.msg?`<div class="adm-msg ${S.msg.t}" role="status">${esc(S.msg.x)}</div>`:''}
        ${DA().D.pendientes.length?`<div class="adm-msg e" role="alert">No se pudo registrar la auditoría de ${DA().D.pendientes.length} cambio(s). <button type="button" class="adm-b" onclick="admReintentar()">Reintentar</button></div>`:''}
        ${cuerpo()}${barra()}</div></div>${S.modal?modalHtml():''}`;
  }
  function cuerpo(){
    const sec=N.seccion(S.sec);
    if(sec.etapa>1)return `<div class="adm-card"><h2>${esc(sec.titulo)}</h2><p>${esc(sec.sub)}.</p><p class="adm-mut">Esta sección se construye en la <b>etapa ${sec.etapa}</b> del panel. Mientras tanto, esa función sigue donde siempre.</p></div>`;
    return ({resumen:resumenHtml,usuarios:usuariosHtml,roles:rolesHtml,auditoria:auditoriaHtml}[sec.id]||(()=>''))();
  }

  /* ---------- Resumen ---------- */
  function resumenHtml(){
    const aud=filasAud(),k=N.kpisResumen({usuarios:usuarios(),trabajadores:trabajadores(),registros:(()=>{try{return loadRecords()||[];}catch(_){return [];}})(),auditoria:aud,inicioHoyMs:inicioHoyMs(),hoy:hoyLima()});
    const kp=(t,v,n,go,pr)=>`<button type="button" class="adm-kpi${pr?' pr':''}" ${go?`onclick="admIr('${go}')"`:'disabled'}><span>${esc(t)}</span><b>${esc(v)}</b><small>${esc(n)}</small></button>`;
    const recientes=aud.slice(0,8);
    const err=Object.keys(DA().D.error).filter(c=>DA().D.error[c]);
    return `<div class="adm-kpis">${kp('Usuarios',k.usuarios,'con acceso a GLACIAL','usuarios')}${kp('Trabajadores activos',k.trabajadores,'en la lista de personal','trabajadores',true)}
      ${kp('Registros en curso',k.registrosEnCurso,'turnos aún sin cerrar','registros',true)}${kp('Cambios registrados hoy',k.cambiosHoy,'en todas las auditorías','auditoria')}
      ${kp('Equipos conectados','—','llega con «Salud y sesiones» (etapa 4)','',true)}${kp('Alertas de seguridad','—','llega con «Seguridad» (etapa 4)','',true)}</div>
      <div class="adm-2"><div class="adm-card"><h2>Pendientes de aprobación</h2><p class="adm-mut">Las solicitudes de programación y las ampliaciones de turno se siguen aprobando donde siempre (Planificación y Turnos). Aquí se reunirán en la etapa 3.</p></div>
      <div class="adm-card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2>Últimos cambios</h2><button type="button" class="adm-b" onclick="admIr('auditoria')">Ver auditoría</button></div>
        ${recientes.length?recientes.map(a=>`<div style="padding:7px 0;border-top:1px solid #eaf1f7"><b>${esc(a.quien||'—')}</b> · ${esc(a.accion)}<br><span class="adm-mut">${esc(fmtFecha(a.ms))} · ${esc(a.modulo)}</span></div>`).join(''):`<div class="adm-vacio">${DA().D.activo&&Object.keys(DA().D.listo).length<DA().AUDITORIAS.length?'Consultando…':'Todavía no hay cambios registrados.'}</div>`}
        ${err.length?`<p class="adm-mut">No se pudo leer: ${esc(err.join(', '))}.</p>`:''}</div></div>`;
  }

  /* ---------- Usuarios ---------- */
  const borradorSel=()=>S.sel&&S.borr[S.sel]?S.borr[S.sel].borrador:null;
  function usuariosHtml(){
    const lista=usuarios(),q=S.q.trim().toLowerCase();
    const vis=lista.filter(u=>(S.rolFiltro==='Todos'||u.rol===S.rolFiltro)&&(!q||[u.nombre,u.username,u.rol].join(' ').toLowerCase().includes(q)));
    const u=S.sel?lista.find(x=>x.username===S.sel):null;
    return `<div class="adm-2"><div class="adm-card"><div class="adm-f"><label>Buscar<input type="search" placeholder="Nombre o usuario" value="${esc(S.q)}" oninput="admQ(this.value)"></label>
        <label>Rol<select onchange="admRolFiltro(this.value)">${['Todos',...roles()].map(r=>`<option ${r===S.rolFiltro?'selected':''}>${esc(r)}</option>`).join('')}</select></label></div>
        <div class="adm-caja"><table class="adm-t"><thead><tr><th>Usuario</th><th>Rol</th><th>Permisos</th><th>Líneas</th></tr></thead><tbody>${vis.map(x=>{
          const b=S.borr[x.username];return `<tr class="cl ${x.username===S.sel?'sel':''}" onclick="admSel('${esc(x.username)}')"><td><b>${esc(x.nombre||x.username)}</b>${b?' <span class="adm-pill" style="background:#ffedd5;color:#b45309">sin guardar</span>':''}<br><span class="adm-mut">${esc(x.username)}</span></td><td>${esc(x.rol||'—')}</td><td>${esc(N.resumenPermisos(x,claves()))}</td><td>${esc(x.linea||'—')}</td></tr>`;}).join('')}</tbody></table></div>
        ${vis.length?'':'<div class="adm-vacio">Ningún usuario coincide con la búsqueda.</div>'}</div>
      <div class="adm-card">${u?fichaHtml(u):'<div class="adm-vacio">Elige un usuario de la lista para ver y editar su ficha.</div>'}</div></div>`;
  }
  function fichaHtml(u){
    const b=borradorSel()||N.borradorDe(u,claves()),admin=N.esAdminPrincipal(u),dis=admin?'disabled':'';
    const plantilla=plantillaDeRol(b.rol),difiere=!admin&&!N.igualesPermisos(b.permisos===N.TODOS?N.TODOS:b.permisos.slice().sort(),plantilla===N.TODOS?N.TODOS:plantilla.slice().sort());
    const todos=b.permisos===N.TODOS,on=k=>todos||b.permisos.includes(k),total=claves().length,nOn=todos?total:b.permisos.filter(p=>claves().includes(p)).length;
    const lineas=[...new Set(['',...usuarios().map(x=>x.linea||'')])];
    return `<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b style="font-size:16px">${esc(b.nombre||u.username)}</b><br><span class="adm-mut">${esc(u.username)}</span></div>${admin?'<span class="adm-pill">Administrador</span>':''}</div>
      <div class="adm-grid" style="margin:10px 0"><label>Nombre<input value="${esc(b.nombre)}" oninput="admCampo('nombre',this.value)" ${dis}></label>
        <label>Rol<select onchange="admCampo('rol',this.value)" ${dis}>${roles().map(r=>`<option ${r===b.rol?'selected':''}>${esc(r)}</option>`).join('')}</select></label>
        <label>Líneas a cargo<select onchange="admCampo('linea',this.value)" ${dis}>${lineas.map(l=>`<option value="${esc(l)}" ${l===b.linea?'selected':''}>${esc(l||'Sin línea fija')}</option>`).join('')}</select></label></div>
      ${admin?'<div class="adm-msg i">Administrador principal: tiene todos los permisos y no se pueden quitar ni cambiar desde el panel.</div>':''}
      ${difiere?`<div class="adm-msg i">Sus permisos son distintos a la plantilla de su rol (${esc(b.rol)}). <button type="button" class="adm-b" onclick="admIgualarRol()">Igualar al rol</button></div>`:''}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:6px 0">Permisos por área</h2><span class="adm-mut">${nOn} de ${total} activos</span></div>
      <label style="display:flex;gap:8px;align-items:center;margin:0 0 8px"><input type="checkbox" ${todos?'checked':''} ${dis} onchange="admTodos(this.checked)" style="min-height:auto"> Todos los permisos</label>
      ${AREAS_PERMISOS.map(a=>{
        const items=PERMISOS_APP.filter(p=>p.area===a.clave);if(!items.length)return '';
        const abierta=S.abiertas[a.clave]!==false,n=items.filter(p=>on(p.key)).length;
        return `<div class="adm-ar"><div><button type="button" onclick="admArea('${a.clave}')" aria-expanded="${abierta}">${abierta?'▾':'▸'} ${esc(a.titulo)} · ${n} de ${items.length}</button><button type="button" class="adm-b" style="min-height:36px" ${dis||todos?'disabled':''} onclick="admAreaTodos('${a.clave}')">${n===items.length?'Quitar todos':'Marcar todos'}</button></div>
          ${abierta?`<div class="adm-pe">${items.map(p=>`<label><input type="checkbox" style="min-height:auto" ${on(p.key)?'checked':''} ${dis||todos?'disabled':''} onchange="admPerm('${p.key}',this.checked)"><span>${esc(p.label)}</span></label>`).join('')}</div>`:''}</div>`;}).join('')}`;
  }

  /* ---------- Roles y permisos ---------- */
  function rolesHtml(){
    const lista=roles(),rol=S.rolSel&&lista.includes(S.rolSel)?S.rolSel:lista[0],us=usuarios().filter(u=>String(u.rol||'').trim()===rol),pl=plantillaDeRol(rol);
    const difieren=us.filter(u=>!N.esAdminPrincipal(u)&&!N.igualesPermisos(u.permisos===N.TODOS?N.TODOS:N.permisosDe(u,claves()).sort(),pl===N.TODOS?N.TODOS:pl.slice().sort()));
    const on=k=>pl===N.TODOS||pl.includes(k);
    return `<div class="adm-2"><div class="adm-card"><h2>Roles</h2><p class="adm-mut">Cada rol es una plantilla. Al crear un usuario recibe los permisos de su rol.</p>
        ${lista.map(r=>{const n=usuarios().filter(u=>String(u.rol||'').trim()===r).length,p=plantillaDeRol(r);return `<button type="button" class="adm-b" style="display:flex;justify-content:space-between;width:100%;margin:0 0 6px;${r===rol?'background:#eaf5fc':''}" onclick="admRol('${esc(r)}')"><span>${esc(r)}</span><span class="adm-mut">${n} usuarios · ${p===N.TODOS?'todos':p.length} permisos</span></button>`;}).join('')}</div>
      <div class="adm-card"><h2>Plantilla: ${esc(rol)}</h2><p class="adm-mut">${pl===N.TODOS?'Todos':pl.length} de ${claves().length} permisos · ${us.length} usuarios con este rol. <b>Editar plantillas y crear roles nuevos llega en la etapa 2</b> (necesita un documento nuevo en el servidor); hoy las plantillas son las del sistema.</p>
        ${difieren.length?`<div class="adm-msg i">${difieren.length} usuario(s) tienen permisos distintos a la plantilla: ${esc(difieren.map(u=>u.nombre||u.username).join(', '))}. <button type="button" class="adm-b p" onclick="admIgualarTodos('${esc(rol)}')">Igualar a la plantilla</button></div>`:(us.length?'<div class="adm-msg k">Todos los usuarios de este rol tienen exactamente la plantilla.</div>':'')}
        ${AREAS_PERMISOS.map(a=>{const items=PERMISOS_APP.filter(p=>p.area===a.clave);if(!items.length)return '';const n=items.filter(p=>on(p.key)).length;
          return `<div class="adm-ar"><div><b>${esc(a.titulo)}</b><span class="adm-mut">${n}/${items.length}</span></div><div class="adm-pe">${items.map(p=>`<label><input type="checkbox" style="min-height:auto" disabled ${on(p.key)?'checked':''}><span>${esc(p.label)}</span></label>`).join('')}</div></div>`;}).join('')}</div></div>`;
  }

  /* ---------- Auditoría ---------- */
  function auditoriaHtml(){
    const todas=filasAud(),f=N.filtrarAuditoria(todas,S.af),vis=f.slice(0,S.aLim);
    const D=DA().D,err=DA().AUDITORIAS.filter(([c])=>D.error[c]).map(([c])=>c);
    return `<div class="adm-card"><div class="adm-f"><label>Módulo<select onchange="admAf('modulo',this.value)">${['Todos',...N.modulosDe(todas)].map(m=>`<option ${m===S.af.modulo?'selected':''}>${esc(m)}</option>`).join('')}</select></label>
      <label>Persona<select onchange="admAf('quien',this.value)">${['Todos',...N.quienesDe(todas)].map(m=>`<option ${m===S.af.quien?'selected':''}>${esc(m)}</option>`).join('')}</select></label>
      <label>Buscar<input type="search" value="${esc(S.af.texto)}" placeholder="Acción, motivo…" oninput="admAf('texto',this.value)"></label>
      <button type="button" class="adm-b" onclick="admExportar()">Exportar (Excel/CSV)</button></div>
      <p class="adm-mut">Reúne las auditorías de Tareo, Asistente de Producción, Inventario de insumos, Registros y del propio panel (las más recientes de cada una). Solo lectura.</p>
      ${err.length?`<div class="adm-msg e">No se pudo leer: ${esc(err.join(', '))}.</div>`:''}
      <div class="adm-caja"><table class="adm-t"><thead><tr><th>Cuándo</th><th>Quién</th><th>Módulo</th><th>Acción</th><th>Antes</th><th>Después</th><th>Motivo</th></tr></thead><tbody>${vis.map(a=>`<tr><td style="white-space:nowrap">${esc(fmtFecha(a.ms))}</td><td>${esc(a.quien||'—')}</td><td><span class="adm-pill">${esc(a.modulo)}</span></td><td>${esc(a.accion)}</td><td>${esc(a.antes)}</td><td>${esc(a.despues)}</td><td>${esc(a.motivo)}</td></tr>`).join('')}</tbody></table></div>
      ${vis.length?'':'<div class="adm-vacio">No hay cambios que coincidan.</div>'}
      ${f.length>vis.length?`<p><button type="button" class="adm-b" onclick="admMas()">Ver más (${f.length-vis.length})</button></p>`:''}</div>`;
  }

  /* ---------- borrador: barra y guardado ---------- */
  const pendientes=()=>Object.keys(S.borr).filter(k=>{const u=usuarios().find(x=>x.username===k);return u&&N.diffUsuario(u,S.borr[k].borrador,claves(),etiqueta).length;});
  function barra(){
    const n=pendientes().length;if(!n)return '';
    return `<div class="adm-barra" role="status"><span>${n} ${n===1?'cambio':'cambios'} sin guardar</span><span><button type="button" class="adm-b" style="background:transparent;color:#fff" onclick="admDescartar()">Descartar</button> <button type="button" class="adm-b p" style="background:#fff;color:#033350" onclick="admPedirMotivo()">Guardar</button></span></div>`;
  }
  function modalHtml(){
    const m=S.modal;if(m.tipo!=='motivo')return '';
    const claves0=claves();
    const items=m.cambios.map(c=>{const u=usuarios().find(x=>x.username===c.username);const d=u?N.diffUsuario(u,c.borrador,claves0,etiqueta):[];return `<li><b>${esc(c.titulo||c.username)}</b>: ${d.map(x=>esc(x.campo)+': '+esc(x.antes)+' → '+esc(x.despues)+(x.agregados&&x.agregados.length?' (+'+esc(x.agregados.slice(0,4).join(', '))+(x.agregados.length>4?'…':'')+')':'')+(x.quitados&&x.quitados.length?' (−'+esc(x.quitados.slice(0,4).join(', '))+(x.quitados.length>4?'…':'')+')':'')).join('; ')}</li>`;}).join('');
    return `<div class="adm-mod" role="dialog" aria-modal="true"><div><h2 style="margin:0 0 6px">Guardar cambios</h2><p class="adm-mut">Se guarda todo junto: si algo falla, no se cambia nada. Quedará en la Auditoría.</p><ul>${items}</ul>
      <label style="display:grid;gap:4px;font-weight:700">Motivo (obligatorio, mínimo ${N.MOTIVO_MIN} caracteres)<textarea id="adm-motivo" maxlength="300" oninput="admMotivoTxt(this.value)" placeholder="Ej.: pasó a cubrir Calidad desde el 01/12">${esc(m.motivo||'')}</textarea></label>
      ${m.error?`<div class="adm-msg e" style="margin-top:8px">${esc(m.error)}</div>`:''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="adm-b" onclick="admCerrarModal()" ${S.guardando?'disabled':''}>Cancelar</button><button type="button" class="adm-b p" onclick="admGuardar()" ${S.guardando?'disabled':''}>${S.guardando?'Guardando…':'Guardar cambios'}</button></div></div></div>`;
  }

  /* ---------- pintar ---------- */
  function pintar(){
    if(typeof state==='undefined'||state.currentTab!=='admin-panel')return;
    const main=document.getElementById('main');if(!main)return;
    const a=document.activeElement;
    if(a&&main.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&(a.id==='adm-motivo'||a.closest('.adm-card')||a.id==='adm-gq'))return;   // no se pisa lo que se escribe
    const y=window.scrollY;main.innerHTML=html();window.scrollTo(0,y);
    if(!desub)desub=DA().suscribir(()=>pintar());
  }
  function reiniciar(){if(desub){desub();desub=null;}S.sec='resumen';S.sel='';S.borr={};S.modal=null;S.msg=null;S.gq='';}
  W.glacialAdminUI={pintar,reiniciar,estado:S};

  /* ---------- acciones ---------- */
  const rep=()=>{const a=document.activeElement;if(a&&a.blur)a.blur();pintar();};
  W.admIr=id=>{if(Object.keys(S.borr).length&&pendientes().length&&!['usuarios','roles'].includes(id)&&!confirm('Tienes cambios sin guardar. ¿Salir de esta sección y mantenerlos en borrador?'))return;S.sec=id;S.msg=null;S.gq='';S.aLim=100;rep();};
  W.admBuscar=v=>{S.gq=v;const m=document.getElementById('main'),c=m&&m.querySelector('.adm-bus');if(c){const r=c.querySelector('.adm-res');if(r)r.remove();const h=resultadosBusqueda();if(h)c.insertAdjacentHTML('beforeend',h);}};
  W.admBuscarIr=(sec,usr)=>{S.sec=sec;if(usr)S.sel=usr;S.gq='';rep();};
  W.admQ=v=>{S.q=v;pintar();};W.admRolFiltro=v=>{S.rolFiltro=v;pintar();};
  W.admSel=u=>{S.sel=u;S.msg=null;rep();};
  function asegurarBorrador(){
    const u=usuarios().find(x=>x.username===S.sel);if(!u||N.esAdminPrincipal(u))return null;
    if(!S.borr[S.sel])S.borr[S.sel]={base:N.borradorDe(u,claves()),borrador:N.borradorDe(u,claves()),titulo:u.nombre||u.username};
    return S.borr[S.sel].borrador;
  }
  const tocar=()=>{const u=S.sel;if(u&&S.borr[u]&&!N.diffUsuario(usuarios().find(x=>x.username===u)||{},S.borr[u].borrador,claves(),etiqueta).length)delete S.borr[u];pintar();};
  W.admCampo=(c,v)=>{const b=asegurarBorrador();if(!b)return;b[c]=v;if(c==='rol'&&S.borr[S.sel])S.msg={t:'i',x:'Cambiaste el rol: los permisos no cambian solos. Usa «Igualar al rol» si quieres los de la plantilla.'};tocar();};
  W.admTodos=on=>{const b=asegurarBorrador();if(!b)return;b.permisos=on?N.TODOS:claves().slice();tocar();};
  W.admPerm=(k,on)=>{const b=asegurarBorrador();if(!b)return;const a=b.permisos===N.TODOS?claves().slice():b.permisos.slice();b.permisos=on?[...new Set([...a,k])]:a.filter(x=>x!==k);tocar();};
  W.admArea=a=>{S.abiertas[a]=S.abiertas[a]===false;pintar();};
  W.admAreaTodos=a=>{const b=asegurarBorrador();if(!b)return;const ks=PERMISOS_APP.filter(p=>p.area===a).map(p=>p.key),cur=b.permisos===N.TODOS?claves().slice():b.permisos.slice(),todos=ks.every(k=>cur.includes(k));b.permisos=todos?cur.filter(x=>!ks.includes(x)):[...new Set([...cur,...ks])];tocar();};
  W.admIgualarRol=()=>{const b=asegurarBorrador();if(!b)return;const p=plantillaDeRol(b.rol);b.permisos=p===N.TODOS?N.TODOS:p.slice();tocar();};
  W.admRol=r=>{S.rolSel=r;rep();};
  W.admIgualarTodos=rol=>{
    const pl=plantillaDeRol(rol);
    usuarios().filter(u=>String(u.rol||'').trim()===rol&&!N.esAdminPrincipal(u)).forEach(u=>{
      const b=N.borradorDe(u,claves()),n=Object.assign({},b,{permisos:pl===N.TODOS?N.TODOS:pl.slice()});
      if(N.diffUsuario(u,n,claves(),etiqueta).length)S.borr[u.username]={base:b,borrador:n,titulo:u.nombre||u.username};
    });
    S.sec='usuarios';S.msg={t:'i',x:'Cambios preparados en borrador para los usuarios del rol «'+rol+'». Revísalos y pulsa «Guardar».'};rep();
  };
  W.admDescartar=()=>{S.borr={};S.modal=null;S.msg={t:'i',x:'Cambios descartados.'};rep();};
  W.admPedirMotivo=()=>{const ks=pendientes();if(!ks.length)return;S.modal={tipo:'motivo',motivo:'',error:'',cambios:ks.map(k=>({username:k,base:S.borr[k].base,borrador:S.borr[k].borrador,titulo:S.borr[k].titulo}))};rep();};
  W.admMotivoTxt=v=>{if(S.modal)S.modal.motivo=v;};
  W.admCerrarModal=()=>{if(S.guardando)return;S.modal=null;rep();};
  W.admGuardar=async()=>{
    const m=S.modal;if(!m||S.guardando)return;
    const e=N.validarMotivo(m.motivo);if(e.length){m.error=e.join(' ');pintarModal();return;}
    S.guardando=true;m.error='';pintarModal();
    const r=await DA().guardarUsuarios(m.cambios,m.motivo);
    S.guardando=false;
    if(!r.ok){m.error=r.msg;if(r.recargar){S.borr={};S.modal=null;S.msg={t:'e',x:r.msg};}rep();return;}
    S.borr={};S.modal=null;S.msg={t:r.auditoriaPendiente?'e':'k',x:r.msg};rep();
  };
  function pintarModal(){const a=document.activeElement;if(a&&a.blur)a.blur();const main=document.getElementById('main');if(main){const y=window.scrollY;main.innerHTML=html();window.scrollTo(0,y);}}
  W.admReintentar=async()=>{const r=await DA().reintentarAuditoria();S.msg=r.fallidas?{t:'e',x:'Aún no se pudo registrar '+r.fallidas+' cambio(s) en la auditoría.'}:{t:'k',x:'Auditoría registrada.'};rep();};
  W.admAf=(k,v)=>{S.af[k]=v;S.aLim=100;pintar();};W.admMas=()=>{S.aLim+=100;pintar();};
  W.admExportar=()=>{
    const f=N.filtrarAuditoria(filasAud(),S.af),c=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const csv='﻿'+[['Cuándo','Quién','Módulo','Acción','Antes','Después','Motivo'].map(c).join(',')].concat(f.map(a=>[fmtFecha(a.ms),a.quien,a.modulo,a.accion,a.antes,a.despues,a.motivo].map(c).join(','))).join('\r\n');
    try{const b=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(b),l=document.createElement('a');l.href=url;l.download='auditoria-glacial-'+(hoyLima()||'hoy')+'.csv';document.body.appendChild(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
    catch(e){S.msg={t:'e',x:'No se pudo exportar: '+((e&&e.message)||e)};pintar();}
  };
})();
