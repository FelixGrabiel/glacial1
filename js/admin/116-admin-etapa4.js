/* =============================================================
   GLACIAL · PANEL DE ADMINISTRACIÓN · ETAPA 4 — Alertas y anuncios · Salud y sesiones · Seguridad · Respaldos e integraciones
   -------------------------------------------------------------
   Lo que SÍ se puede hacer desde el navegador (y se hace):
     · Alertas y anuncios → adminConfig/anuncio (texto para todos los equipos, con fecha de inicio/fin) y adminConfig/mantenimiento (aviso de modo mantenimiento).
       Ambos se leen en vivo en todos los equipos (113-admin-config.js pinta el banner). El modo mantenimiento AVISA: no bloquea escrituras.
     · Salud y sesiones → saludSistema/actual (revisión diaria del servidor, glacial_40) y el estado de la conexión de este equipo.
     · Seguridad → la revisión de cuentas y perfiles que ya existe (comprobarMigracion): cuentas sin acceso seguro, perfiles que no coinciden, restos de claves.
     · Respaldos → copia manual en JSON (sin claves ni sales) y exportaciones CSV por módulo y rango de fechas.
   Lo que NO se puede desde el navegador (y se dice claramente en la pantalla): listar y cerrar sesiones de otros usuarios, intentos de ingreso fallidos y cuentas bloqueadas,
   respaldos automáticos y la política de días de sesión. Necesitan una función de servidor con la llave de servicio de Supabase (patrón de fs-cuentas); ver docs/00-general/panel-administracion.md.
   Cargar después de 115-admin-etapa3.js.
   ============================================================= */
(function(){
  'use strict';
  if(typeof window==='undefined'||!window.document)return;
  const W=window,N=W.glacialAdminNucleo;
  const U=()=>W.glacialAdminUI,DA=()=>W.glacialAdminDatos,CF=()=>W.glacialAdminConfig;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S={msg:null,modal:null,guardando:false,anun:null,mant:null,salud:null,saludOn:false,seg:null,segCargando:false,exp:{desde:'',hasta:''},escuchando:false};
  const repintar=()=>{try{U().pintar();}catch(_){/* informativo */}};
  const sinFoco=()=>{const a=document.activeElement;if(a&&a.blur)a.blur();repintar();};
  const msgHtml=()=>S.msg?`<div class="adm-msg ${S.msg.t}" role="status">${esc(S.msg.x)}</div>`:'';
  const modal=h=>`<div class="adm-mod" role="dialog" aria-modal="true"><div>${h}</div></div>`;
  const motivoHtml=()=>`<label style="display:grid;gap:4px;font-weight:700;margin-top:8px">Motivo (obligatorio, mínimo ${N.MOTIVO_MIN} caracteres)<textarea maxlength="300" oninput="adm4Motivo(this.value)">${esc(S.modal&&S.modal.motivo||'')}</textarea></label>${S.modal&&S.modal.error?`<div class="adm-msg e" style="margin-top:8px">${esc(S.modal.error)}</div>`:''}`;
  const botones=(ok,fn)=>`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="adm-b" onclick="adm4Cerrar()" ${S.guardando?'disabled':''}>Cancelar</button><button type="button" class="adm-b p" onclick="${fn}" ${S.guardando?'disabled':''}>${S.guardando?'Guardando…':esc(ok)}</button></div>`;
  W.adm4Motivo=v=>{if(S.modal)S.modal.motivo=v;};W.adm4Cerrar=()=>{if(S.guardando)return;S.modal=null;repintar();};
  const hoy=()=>{try{return U().hoyLima();}catch(_){return '';}};
  const noDisp=(t,d)=>`<div class="adm-card" style="margin:0"><h2>${esc(t)}</h2><p class="adm-mut"><b>No disponible desde el navegador.</b> ${esc(d)}</p></div>`;

  function arrancar(){
    if(S.escuchando||typeof db==='undefined')return;S.escuchando=true;
    try{if(CF())CF().escuchar();CF()&&CF().alCambiar(()=>repintar());}catch(_){/* sin lectura */}
    try{db.collection('saludSistema').doc('actual').onSnapshot(s=>{S.salud=s.exists?s.data():null;S.saludOn=true;repintar();},()=>{S.saludOn=true;});}catch(_){S.saludOn=true;}
  }
  async function guardarCfg(id,datos,motivo,accion,antes,despues){
    const r=await CF().guardar(id,datos,motivo,CF().version(id),{modulo:'Alertas y anuncios',accion,antes,despues});
    if(!r.ok)throw new Error(r.msg);return r;
  }
  async function ejecutar(fn,ok){
    const m=S.modal,e=N.validarMotivo(m.motivo);if(e.length){m.error=e.join(' ');repintar();return;}
    S.guardando=true;m.error='';sinFoco();
    try{await fn();S.msg={t:'k',x:ok};S.modal=null;}catch(err){m.error=(err&&err.message)||String(err);}
    S.guardando=false;repintar();
  }
  const msLocal=v=>{if(!v)return 0;const t=Date.parse(v);return Number.isFinite(t)?t:0;};
  const inputLocal=ms=>{if(!ms)return '';const d=new Date(ms-new Date().getTimezoneOffset()*60000);return d.toISOString().slice(0,16);};

  /* =========================================================
     ALERTAS Y ANUNCIOS
     ========================================================= */
  function alertasHtml(){
    arrancar();
    const CFG=CF(),a=CFG&&CFG.doc('anuncio')||{},m=CFG&&CFG.doc('mantenimiento')||{};
    if(!S.anun||S.anun.base!==(a.version||0)&&!S.anun.sucio)S.anun={base:a.version||0,sucio:false,texto:a.texto||'',activo:a.activo===true,desde:a.desdeMs||0,hasta:a.hastaMs||0};
    if(!S.mant||S.mant.base!==(m.version||0)&&!S.mant.sucio)S.mant={base:m.version||0,sucio:false,texto:m.texto||'',activo:m.activo===true};
    const an=S.anun,mt=S.mant;
    const plantillas=typeof PERMISOS_SUGERIDOS_POR_ROL!=='undefined'?PERMISOS_SUGERIDOS_POR_ROL:{};
    const users=U().usuarios(),conAlerta=users.filter(u=>u.permisos==='todos'||(Array.isArray(u.permisos)&&u.permisos.includes('recibirAlertasProduccion'))).length;
    return `${msgHtml()}<div class="adm-2"><div class="adm-card"><h2>Anuncio para todos los equipos</h2><p class="adm-mut">Se ve arriba en todas las pantallas (supervisores, jefaturas, Mantenimiento…) en cuanto lo guardas. Con fecha de fin, se retira solo. <b>La cuenta compartida de Almacén no lo recibe</b> (sus reglas no le dan lectura).</p>
        <label style="display:grid;gap:4px;font-weight:700">Texto (máx. 300 caracteres)<textarea maxlength="300" oninput="adm4Anun('texto',this.value)">${esc(an.texto)}</textarea></label>
        <div class="adm-grid" style="margin-top:8px"><label>Visible desde (opcional)<input type="datetime-local" value="${esc(inputLocal(an.desde))}" onchange="adm4Anun('desde',this.value)"></label><label>Visible hasta (opcional)<input type="datetime-local" value="${esc(inputLocal(an.hasta))}" onchange="adm4Anun('hasta',this.value)"></label>
        <label style="display:flex;gap:8px;align-items:center;align-self:end"><input type="checkbox" style="min-height:auto" ${an.activo?'checked':''} onchange="adm4Anun('activo',this.checked)"> Anuncio activo</label></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="adm-b" onclick="adm4Descartar('anun')" ${an.sucio?'':'disabled'}>Descartar</button><button type="button" class="adm-b p" onclick="adm4Pedir('anuncio')" ${an.sucio?'':'disabled'}>Guardar</button></div></div>
      <div class="adm-card"><h2>Modo mantenimiento</h2><p class="adm-mut">Muestra un aviso en todos los equipos mientras haces cambios grandes. <b>Es un aviso: no bloquea que otros guarden.</b> (Bloquear escrituras de verdad necesitaría una regla de servidor; no se activó para no frenar la planta por error.)</p>
        <label style="display:grid;gap:4px;font-weight:700">Texto del aviso<textarea maxlength="300" oninput="adm4Mant('texto',this.value)" placeholder="Estamos haciendo cambios; por ahora solo consulta.">${esc(mt.texto)}</textarea></label>
        <label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" style="min-height:auto" ${mt.activo?'checked':''} onchange="adm4Mant('activo',this.checked)"> Modo mantenimiento activo</label>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="adm-b" onclick="adm4Descartar('mant')" ${mt.sucio?'':'disabled'}>Descartar</button><button type="button" class="adm-b p" onclick="adm4Pedir('mantenimiento')" ${mt.sucio?'':'disabled'}>Guardar</button></div></div></div>
      <div class="adm-card"><h2>Alertas de producción por rol</h2><p class="adm-mut">Las alertas de producción las recibe quien tiene el permiso «Recibir notificaciones y alertas de producción». Hoy lo tienen <b>${conAlerta}</b> de ${users.length} usuarios. Para cambiar a quién le llegan, edita la plantilla del rol (Roles y permisos) o el permiso del usuario (Usuarios): no hay un segundo interruptor.</p>
        <div class="adm-caja"><table class="adm-t"><thead><tr><th>Rol</th><th>La plantilla incluye el permiso</th></tr></thead><tbody>${Object.keys(plantillas).sort((a,b)=>a.localeCompare(b,'es')).map(r=>`<tr><td>${esc(r)}</td><td>${(plantillas[r]||[]).includes('recibirAlertasProduccion')?'Sí':'No'}</td></tr>`).join('')}</tbody></table></div></div>
      ${S.modal&&S.modal.tipo==='cfg'?modal(`<h2 style="margin:0 0 6px">${esc(S.modal.titulo)}</h2>${motivoHtml()}${botones('Guardar','adm4GuardarCfg()')}`):''}`;
  }
  W.adm4Anun=(k,v)=>{const a=S.anun;a.sucio=true;if(k==='desde'||k==='hasta')a[k]=msLocal(v);else a[k]=v;};
  W.adm4Mant=(k,v)=>{const m=S.mant;m.sucio=true;m[k]=v;};
  W.adm4Descartar=k=>{if(k==='anun')S.anun=null;else S.mant=null;repintar();};
  W.adm4Pedir=id=>{
    if(id==='anuncio'){const a=S.anun;if(a.activo&&!String(a.texto).trim()){S.msg={t:'e',x:'Escribe el texto del anuncio.'};repintar();return;}if(a.desde&&a.hasta&&a.hasta<=a.desde){S.msg={t:'e',x:'«Visible hasta» debe ser posterior a «Visible desde».'};repintar();return;}}
    S.modal={tipo:'cfg',id,titulo:id==='anuncio'?'Guardar el anuncio':'Guardar el modo mantenimiento',motivo:'',error:''};repintar();
  };
  W.adm4GuardarCfg=()=>ejecutar(async()=>{
    const m=S.modal,CFG=CF();
    if(m.id==='anuncio'){const a=S.anun,antes=CFG.doc('anuncio')||{};await guardarCfg('anuncio',{texto:String(a.texto).trim().slice(0,300),activo:!!a.activo,desdeMs:a.desde||0,hastaMs:a.hasta||0},m.motivo,a.activo?'Publicó un anuncio para todos':'Desactivó el anuncio',{texto:antes.texto||'',activo:!!antes.activo},{texto:a.texto,activo:a.activo});S.anun=null;}
    else{const t=S.mant,antes=CFG.doc('mantenimiento')||{};await guardarCfg('mantenimiento',{texto:String(t.texto).trim().slice(0,300),activo:!!t.activo},m.motivo,t.activo?'Activó el modo mantenimiento':'Desactivó el modo mantenimiento',{activo:!!antes.activo},{activo:t.activo});S.mant=null;}
  },'Guardado. Los demás equipos lo ven en segundos.');

  /* =========================================================
     SALUD Y SESIONES
     ========================================================= */
  function sistemaHtml(){
    arrancar();
    const s=S.salud,rev=Number(s&&s.revisadoEn)||0,horas=rev?Math.round((Date.now()-rev)/3600000):null;
    const problemas=Array.isArray(s&&s.problemas)?s.problemas:[];
    const punto=c=>`<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:6px"></span>`;
    const online=typeof navigator!=='undefined'?navigator.onLine:true;
    const k=(t,v,n,c)=>`<div class="adm-kpi" style="cursor:default"><span>${punto(c)}${esc(t)}</span><b style="font-size:22px">${esc(v)}</b><small>${esc(n)}</small></div>`;
    return `<div class="adm-kpis">${k('Este equipo',online?'Con conexión':'Sin conexión','Estado de la red de este equipo',online?'#16A34A':'#C62828')}
      ${k('Revisión diaria del servidor',rev?(horas<36?'Al día':'Atrasada'):'Sin datos',rev?'Hace '+horas+' h · '+U().fmtFecha(rev):(S.saludOn?'Aún no hay revisión publicada (glacial_40)':'Consultando…'),rev?(horas<36&&!problemas.length?'#16A34A':'#F59E0B'):'#9CA3AF')}
      ${k('Problemas detectados',String(problemas.length),problemas.length?'Ver abajo':'Ninguno en la última revisión',problemas.length?'#F59E0B':'#16A34A')}
      ${k('Entorno',typeof ENTORNO!=='undefined'?String(ENTORNO):'—','Base de datos a la que apunta esta página','#0877A6')}</div>
      <div class="adm-2"><div class="adm-card"><h2>Problemas de la última revisión</h2>${problemas.length?problemas.map(p=>`<div style="padding:7px 0;border-top:1px solid #eaf1f7"><span class="adm-pill" style="${p.nivel==='roja'?'background:#fdecec;color:#991b1b':'background:#ffedd5;color:#b45309'}">${p.nivel==='roja'?'Grave':'Atención'}</span> ${esc(p.texto)}</div>`).join(''):'<div class="adm-vacio">Sin problemas.</div>'}</div>
      <div style="display:grid;gap:14px">${noDisp('Equipos conectados y cerrar sesión de otros usuarios','Supabase solo permite ver y cerrar las sesiones de otras personas con la llave de servicio, que nunca debe estar en el navegador. Se haría con una función de servidor que solo acepte al Administrador (como fs-cuentas); falta construirla y desplegarla.')}
        ${noDisp('Política de días de sesión','Se configura en Supabase (Authentication › Sessions), no desde la página.')}</div></div>`;
  }

  /* =========================================================
     SEGURIDAD
     ========================================================= */
  function seguridadHtml(){
    const r=S.seg;
    const fila=(t,l,ok)=>`<tr><td>${esc(t)}</td><td>${(l&&l.length)?`<b style="color:#b45309">${l.length}</b> · ${esc(l.slice(0,8).join(', '))}${l.length>8?'…':''}`:'<span style="color:#157a3b">Ninguna</span>'}</td></tr>`;
    return `${msgHtml()}<div class="adm-2"><div class="adm-card"><h2>Revisión de cuentas y perfiles</h2><p class="adm-mut">Compara los usuarios con sus cuentas seguras y sus perfiles (lo que usa el servidor para decidir permisos). Es la misma comprobación que ya existía.</p>
        <button type="button" class="adm-b p" onclick="adm4RevisarSeg()" ${S.segCargando?'disabled':''}>${S.segCargando?'Revisando…':'Revisar ahora'}</button>
        ${r?`<div class="adm-caja" style="margin-top:10px"><table class="adm-t"><tbody>${fila('Usuarios sin cuenta segura',r.sinCuentaSegura)}${fila('Con restos de clave antigua guardados',r.conRestosDeClave)}${fila('Sin perfil para el servidor',r.sinPerfil)}${fila('Rol distinto en el perfil',r.rolDistinto)}${fila('Sin acceso registrado',r.sinAcceso)}${fila('Perfiles que sobran',r.perfilesSobrantes)}<tr><td>Administrador correcto en perfiles</td><td>${r.adminOk?'<span style="color:#157a3b">Sí</span>':'<b style="color:#c62828">No: revísalo</b>'}</td></tr></tbody></table></div><p class="adm-mut">Revisado ${esc(U().fmtFecha(r.__en))} sobre ${esc(r.total)} usuarios.</p>`:''}</div>
      <div style="display:grid;gap:14px">${noDisp('Intentos de ingreso fallidos y cuentas bloqueadas','Supabase no entrega esos datos al navegador: están en sus registros de autenticación, accesibles solo con la llave de servicio. Se mostrarían desde una función de servidor que solo acepte al Administrador; falta construirla. Mientras tanto, la identificación por PIN de las cuentas compartidas sí bloquea tras 5 intentos.')}</div></div>`;
  }
  W.adm4RevisarSeg=async()=>{
    if(typeof comprobarMigracion!=='function'){S.msg={t:'e',x:'La revisión no está disponible en esta sesión.'};repintar();return;}
    S.segCargando=true;repintar();
    try{S.seg=await comprobarMigracion({silencioso:true});if(S.seg)S.seg.__en=Date.now();}catch(e){S.msg={t:'e',x:'No se pudo revisar: '+((e&&e.message)||e)};}
    S.segCargando=false;repintar();
  };

  /* =========================================================
     RESPALDOS E INTEGRACIONES
     ========================================================= */
  const SECRETOS=['password','passwordHash','salt','hash','clave','pass','pin','authUid','authEmail'];
  const limpio=u=>{const o=Object.assign({},u);SECRETOS.forEach(k=>delete o[k]);return o;};
  const descargar=(nombre,texto,tipo)=>{try{const b=new Blob([texto],{type:tipo}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);return true;}catch(e){S.msg={t:'e',x:'No se pudo descargar: '+((e&&e.message)||e)};return false;}};
  const csv=(cab,filas)=>'﻿'+[cab,...filas].map(f=>f.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const enRango=f=>{const x=String(f||'');return (!S.exp.desde||x>=S.exp.desde)&&(!S.exp.hasta||x<=S.exp.hasta);};
  const EXPORTES=[
    ['produccion','Reportes de producción',()=>{let r=[];try{r=loadRecords()||[];}catch(_){r=[];}return csv(['Fecha','Línea','Turno','Estado','Actualizado por'],r.filter(x=>enRango(x.fecha)).map(x=>[x.fecha,x.linea,x.turno,x.estadoRegistro||'FINALIZADO',x.actualizadoPor||'']));}],
    ['trabajadores','Trabajadores',()=>{let w=[];try{w=loadWorkers()||[];}catch(_){w=[];}return csv(['Nombre','DNI','Área','Cargo','Línea','Estado'],w.map(x=>[x.nombre,x.dni,x.area,x.cargo,x.linea,x.estado||'Activo']));}],
    ['usuarios','Usuarios (sin claves)',()=>csv(['Usuario','Nombre','Rol','Permisos','Línea'],U().usuarios().map(u=>[u.username,u.nombre,u.rol,u.permisos==='todos'?'todos':(u.permisos||[]).length+' permisos',u.linea||'']))],
    ['tareo','Tareos',()=>{let t=[];try{t=typeof obtenerTareos==='function'?(obtenerTareos()||[]):[];}catch(_){t=[];}return csv(['Fecha','Área','Turno','Estado'],t.filter(x=>enRango(x.fecha)).map(x=>[x.fecha,x.area||'',x.turno||'',x.estado||'']));}],
    ['auditoria','Auditoría consolidada',()=>{const por={};DA().AUDITORIAS.forEach(([c])=>{por[c]=DA().D.cache[c]||[];});return csv(['Cuándo','Quién','Módulo','Acción','Antes','Después','Motivo'],N.consolidar(por).filter(a=>enRango(a.ms?new Date(a.ms).toLocaleDateString('en-CA',{timeZone:'America/Lima'}):'')).map(a=>[U().fmtFecha(a.ms),a.quien,a.modulo,a.accion,a.antes,a.despues,a.motivo]));}]
  ];
  function respaldosHtml(){
    return `${msgHtml()}<div class="adm-2"><div class="adm-card"><h2>Respaldo manual</h2><p class="adm-mut">Descarga una copia en JSON de lo que esta sesión puede leer: usuarios (<b>sin claves, sales ni PIN</b>), trabajadores, reportes de producción y la configuración del panel. Es una copia de consulta; el respaldo completo de la base lo hace Supabase.</p>
        <button type="button" class="adm-b p" onclick="adm4Respaldar()">Crear y descargar respaldo ahora</button></div>
      <div class="adm-card"><h2>Exportar datos (CSV, se abre en Excel)</h2><div class="adm-f"><label>Desde<input type="date" value="${esc(S.exp.desde)}" onchange="adm4Exp('desde',this.value)"></label><label>Hasta<input type="date" value="${esc(S.exp.hasta)}" onchange="adm4Exp('hasta',this.value)"></label></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${EXPORTES.map(([k,t])=>`<button type="button" class="adm-b" onclick="adm4Exportar('${k}')">${esc(t)}</button>`).join('')}</div>
        <p class="adm-mut">El rango aplica a lo que tiene fecha (reportes, tareos, auditoría).</p></div></div>
      <div class="adm-2">${noDisp('Respaldos automáticos (diario o semanal)','Necesitan una tarea programada en el servidor que guarde las copias en un lugar propio. Falta construirla; hoy el respaldo de la base lo hace Supabase según el plan contratado.')}
        ${noDisp('Integraciones (WhatsApp, Google Sheets, bots)','Su estado vive en el servidor y en servicios externos; el navegador no puede comprobarlo. Se mostrarían desde la función de servidor de la Etapa 4 cuando exista.')}</div>`;
  }
  W.adm4Exp=(k,v)=>{S.exp[k]=v;};
  W.adm4Respaldar=async()=>{
    let rec=[],wk=[];try{rec=loadRecords()||[];}catch(_){/* sin datos */}try{wk=loadWorkers()||[];}catch(_){/* sin datos */}
    const CFG=CF()||{doc:()=>null};
    const paq={generadoEn:new Date().toISOString(),por:(state.user&&state.user.username)||'',entorno:typeof ENTORNO!=='undefined'?ENTORNO:'',usuarios:U().usuarios().map(limpio),trabajadores:wk,reportesProduccion:rec,adminConfig:{tolerancias:CFG.doc('tolerancias'),roles:CFG.doc('roles'),anuncio:CFG.doc('anuncio'),mantenimiento:CFG.doc('mantenimiento')}};
    if(descargar('glacial-respaldo-'+(hoy()||'hoy')+'.json',JSON.stringify(paq,null,1),'application/json')){
      S.msg={t:'k',x:'Respaldo descargado ('+paq.usuarios.length+' usuarios, '+wk.length+' trabajadores, '+rec.length+' reportes).'};
      try{await DA().registrar([{modulo:'Respaldos e integraciones',accion:'Descargó un respaldo manual',antes:null,despues:{usuarios:paq.usuarios.length,trabajadores:wk.length,reportes:rec.length},motivo:'Respaldo manual descargado desde el panel'}]);}catch(_){/* queda en la cola de reintento */}
    }
    repintar();
  };
  W.adm4Exportar=k=>{
    const e=EXPORTES.find(x=>x[0]===k);if(!e)return;
    if(descargar('glacial-'+k+'-'+(hoy()||'hoy')+'.csv',e[2](),'text/csv;charset=utf-8'))S.msg={t:'k',x:'Exportación descargada.'};
    repintar();
  };

  U().registrar('alertas',{html:alertasHtml});
  U().registrar('sistema',{html:sistemaHtml});
  U().registrar('seguridad',{html:seguridadHtml});
  U().registrar('respaldos',{html:respaldosHtml});
  { const irOriginal=W.admIr; W.admIr=function(id){S.modal=null;S.msg=null;return irOriginal.apply(this,arguments);}; }
})();
