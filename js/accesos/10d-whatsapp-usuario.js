/* =============================================================
   GESTIÓN DE USUARIOS · NÚMERO DE WHATSAPP (25/11/2026)
   El bot de WhatsApp usa este número para saber QUIÉN envió la programación al grupo y si tiene permiso de Planificación
   (docs/planificacion/programacion-whatsapp.md). Lo edita el Administrador (la lista de usuarios solo la escribe el Administrador).
   Se guarda en el usuario como «whatsapp» (solo dígitos, con código de país; 9 dígitos de Perú → se antepone 51).
   ============================================================= */
(function(){
  'use strict';
  const normalizar=v=>{const d=String(v||'').replace(/\D/g,'');if(!d)return '';return d.length===9?'51'+d:d;};
  window.normalizarWhatsappUsuario=normalizar;
  window.puedeEditarWhatsappUsuario=()=>typeof state!=='undefined'&&!!state.user&&(state.user.rol==='Administrador'||state.user.username==='admin'||(typeof esAdministradorSeguridad==='function'&&esAdministradorSeguridad()));
  window.editarWhatsappUsuario=function(username){
    if(!window.puedeEditarWhatsappUsuario()){alert('Solo el Administrador registra el número de WhatsApp.');return;}
    const u=(loadUsers()||[]).find(x=>x.username===username);if(!u)return;
    const esc=typeof escaparHtml==='function'?escaparHtml:(t=>String(t));
    const fondo=document.createElement('div');
    fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10060;padding:16px;';
    fondo.innerHTML='<div class="modal" style="max-width:420px;width:100%;background:#fff;border-radius:12px;padding:16px">'+
      '<h3 style="margin:0 0 6px">WhatsApp de '+esc(u.nombre||u.username)+'</h3>'+
      '<p class="small-muted" style="margin:0 0 10px">Con este número el bot reconoce a quien envía la programación al grupo (solo se carga si su usuario tiene permiso de Planificación). Déjalo vacío para quitarlo.</p>'+
      '<input data-wsp type="tel" inputmode="tel" placeholder="Ej. 987 654 321" value="'+esc(u.whatsapp||'')+'" style="width:100%">'+
      '<div data-wsp-error style="color:#c62828;font-size:12px;min-height:16px;margin-top:6px"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="btn btn-ghost" data-wsp-x>Cancelar</button><button type="button" class="btn btn-primary" data-wsp-ok>Guardar</button></div></div>';
    document.body.appendChild(fondo);
    const err=t=>{fondo.querySelector('[data-wsp-error]').textContent=t;};
    fondo.querySelector('[data-wsp-x]').onclick=()=>fondo.remove();
    fondo.querySelector('[data-wsp-ok]').onclick=async()=>{
      const n=normalizar(fondo.querySelector('[data-wsp]').value);
      if(n&&(n.length<9||n.length>15)){err('Escribe un número válido (9 dígitos, o con código de país).');return;}
      const otro=n&&(loadUsers()||[]).find(x=>x.username!==username&&x.whatsapp&&String(x.whatsapp).slice(-9)===n.slice(-9));
      if(otro){err('Ese número ya es de '+(otro.nombre||otro.username)+'.');return;}
      err('Guardando…');
      try{
        const r=await saveUsers((loadUsers()||[]).map(x=>{if(x.username!==username)return x;const c=Object.assign({},x);if(n)c.whatsapp=n;else delete c.whatsapp;return c;}));
        if(r===false){err('No se pudo guardar.');return;}
        fondo.remove();if(typeof renderUserList==='function')renderUserList();
      }catch(e){err('No se pudo guardar: '+((e&&e.message)||e));}
    };
  };
})();
