/* =============================================================
   GLACIAL · PRODUCCIÓN › PALETAS › «SALDOS POR ENTREGAR A ALMACÉN»
   -------------------------------------------------------------
   El saldo (paleta incompleta) no pasa a Almacén hasta el cierre del turno o el cambio de producto. Aquí el SUPERVISOR lo «entrega»: confirma cuántos
   paquetes manda (ya viene lleno con el saldo anotado). Almacén lo cuenta por su lado, sin ver esta cifra, y el sistema compara: deben coincidir EXACTO.
   Se guarda en almacenPtSaldoEntrega (glacial_58, libro inmutable: corregir = anular con motivo y volver a entregar).
   La lógica de comparación vive en js/almacen/101-producto-terminado.js (window.glacialAlmacenPTNucleo). Cargar después de 16-paletas.js y 101.
   ============================================================= */
(function(){
  'use strict';
  if(typeof window==='undefined'||!window.document)return;
  const W=window;
  const S={recs:[],entregas:[],escuchando:false,abierto:'',modo:'',cantidad:'',motivo:'',msg:null,guardando:false};
  let cierres=[];
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>{const x=Number(n);return Number.isFinite(x)?x.toLocaleString('es-PE',{maximumFractionDigits:0}):'—';};
  const N=()=>W.glacialAlmacenPTNucleo||null;
  const vistaActiva=()=>!!(W.glacialVista&&typeof W.glacialVista.activo==='function'&&W.glacialVista.activo());
  function puede(){try{return !!(state&&state.user&&tienePermiso('paletas')&&!vistaActiva()&&!(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(state.user)));}catch(_){return false;}}
  const eq=(l,m,p)=>{try{return typeof W.glacialEquivalenciaSaldo==='function'?W.glacialEquivalenciaSaldo(l,m,p):null;}catch(_){return null;}};
  const msgError=e=>{const c=String((e&&e.code)||'').replace(/^firestore\//,'');return c==='permission-denied'?'No tienes permiso para entregar saldos (o falta aplicar glacial_58).':((e&&e.message)||String(e));};

  function escuchar(){
    if(S.escuchando||typeof db==='undefined')return;
    S.escuchando=true;
    try{
      cierres.push(db.collection('almacenPtSaldoEntrega').onSnapshot(s=>{S.entregas=s.docs.map(d=>d.data()).filter(x=>x&&x.opId);pintar();},()=>{}));
      cierres.push(db.collection('almacenPtRecepcion').onSnapshot(s=>{S.recs=s.docs.map(d=>d.data()).filter(x=>x&&x.opId);pintar();},()=>{}));
    }catch(_){/* sin conexión: el panel queda vacío */}
  }
  function detener(){cierres.forEach(f=>{try{f();}catch(_){/* ya cerrada */}});cierres=[];S.escuchando=false;S.recs=[];S.entregas=[];}
  if(W.glacialCierresSesion)W.glacialCierresSesion.push(()=>{detener();S.abierto='';S.msg=null;});

  /** Saldos de la línea, la fecha y el turno que se están viendo en Paletas. */
  function items(){
    const n=N();if(!n||typeof draftPaleta==='undefined'||!draftPaleta||typeof loadPaletas!=='function')return [];
    return n.saldos(loadPaletas(),S.recs,S.entregas,'',eq).filter(x=>x.paleta.linea===draftPaleta.linea&&x.paleta.fecha===String(draftPaleta.fecha||'')&&x.paleta.turno===draftPaleta.turno);
  }
  const txt=(und,x)=>x.factor?`${fmt(und/x.factor)} ${und/x.factor===1?x.unidad.s:x.unidad.p} (${fmt(und)} UND)`:`${fmt(und)} UND`;
  const convTxt=(x,v)=>{const q=Number(v);return x.factor&&Number.isInteger(q)&&q>=1?`= ${fmt(q*x.factor)} UND`:'';};
  function fila(x){
    const p=x.paleta,e=x.entrega,c=x.conteo,abre=S.abierto===x.id,puedeE=puede();
    let estado='',acc='';
    if(x.estado==='EN_LINEA'){estado=`<b>Saldo en línea:</b> ${esc(txt(x.saldoLinea.unidades,x))}`;acc=puedeE?`<button type="button" class="btn btn-primary btn-sm" onclick="slEntregar('${esc(x.id)}')">Entregar saldo a Almacén</button>`:'';}
    else if(x.estado==='ENTREGADO'){estado=`Entregado a Almacén: <b>${esc(txt(e.unidades,x))}</b> · esperando el conteo de Almacén`;acc=puedeE?`<button type="button" class="btn btn-ghost btn-sm" onclick="slAnularAbrir('${esc(x.id)}')">Anular entrega</button>`:'';}
    else if(x.estado==='CONFORME'){estado=`✓ <b>Conforme:</b> entregaste ${esc(txt(e.unidades,x))} y Almacén contó lo mismo`;}
    else if(x.estado==='DIFERENCIA'){estado=`<b style="color:#c62828">⚠ Con diferencia:</b> entregaste ${esc(txt(e.unidades,x))} · Almacén contó ${esc(txt(c.unidadesRecibidas,x))}. Recuenten juntos; si tu entrega estaba mal, anúlala y entrégala de nuevo.`;acc=puedeE?`<button type="button" class="btn btn-ghost btn-sm" onclick="slAnularAbrir('${esc(x.id)}')">Anular entrega</button>`:'';}
    else {estado=`Almacén contó <b>${esc(txt(c.unidadesRecibidas,x))}</b> y falta tu entrega para compararlo.`;acc=puedeE?`<button type="button" class="btn btn-primary btn-sm" onclick="slEntregar('${esc(x.id)}')">Entregar saldo a Almacén</button>`:'';}
    let form='';
    if(abre&&S.modo==='ENTREGAR')form=`<div class="av-paradas-note" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end"><label style="display:grid;gap:4px;font-weight:700">${x.factor?'Paquetes que entregas':'Unidades que entregas'}<input type="number" min="1" step="1" inputmode="numeric" value="${esc(S.cantidad)}" oninput="slCantidad(this.value)" style="min-height:40px;padding:6px 10px"></label><span id="sl-conv" class="small-muted">${esc(convTxt(x,S.cantidad))}</span>
      <button type="button" class="btn btn-primary btn-sm" onclick="slConfirmar('${esc(x.id)}')" ${S.guardando?'disabled':''}>${S.guardando?'Guardando…':'Sí, entregar'}</button><button type="button" class="btn btn-ghost btn-sm" onclick="slCerrar()">Cancelar</button>
      <span class="small-muted" style="flex:1 1 100%">Ya viene lleno con el saldo anotado; cámbialo si mandas otra cantidad. Después de entregar, el saldo de esta marca queda cerrado: para cambiarlo hay que anular la entrega.</span></div>`;
    if(abre&&S.modo==='ANULAR')form=`<div class="av-paradas-note" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end"><label style="display:grid;gap:4px;font-weight:700;flex:1 1 260px">Motivo de la anulación (mínimo 5 caracteres)<textarea rows="2" maxlength="300" oninput="slMotivo(this.value)" style="padding:6px 10px">${esc(S.motivo)}</textarea></label>
      <button type="button" class="btn btn-primary btn-sm" onclick="slAnular('${esc(x.id)}')" ${S.guardando?'disabled':''}>Anular entrega</button><button type="button" class="btn btn-ghost btn-sm" onclick="slCerrar()">Cancelar</button></div>`;
    return `<div style="border:1px solid #d9e7f1;border-radius:10px;padding:10px 12px;margin:0 0 8px;display:grid;gap:6px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><div><b>${esc(p.marca)} ${esc(p.presentacion)}</b></div>${acc}</div><div>${estado}</div>${form}</div>`;
  }
  function html(){
    const l=items();if(!l.length)return '';
    return `<div class="panel-head"><h3>Saldos por entregar a Almacén</h3></div><div class="panel-body" style="display:block">
      <p class="small-muted" style="margin:0 0 8px">El saldo (paleta incompleta) pasa a Almacén al cierre del turno o al cambiar de producto. Tú lo entregas aquí y Almacén lo cuenta por su lado: las dos cifras deben coincidir exacto.</p>
      ${S.msg?`<div class="av-paradas-note" role="status" style="${S.msg.tipo==='error'?'border-color:#f5b5b5;background:#fdecec;color:#991b1b':'border-color:#b7e4c7;background:#e7f6ec;color:#15803d'}">${esc(S.msg.texto)}</div>`:''}
      ${l.map(fila).join('')}</div>`;
  }
  function pintar(){
    const c=document.getElementById('pt-saldo-panel');if(!c)return;
    const a=document.activeElement;if(a&&c.contains(a)&&/^(INPUT|TEXTAREA)$/.test(a.tagName))return;
    const h=html();c.innerHTML=h;c.style.display=h?'':'none';
  }

  /* ---------- acciones ---------- */
  async function guardar(doc){
    const u=(typeof state!=='undefined'&&state.user)||{};let uid='';try{uid=firebase.auth().currentUser.uid;}catch(_){/* sin sesión */}
    await db.collection('almacenPtSaldoEntrega').doc(doc.opId).set({...doc,uid,usuario:u.nombre||u.username||'Usuario',usuarioUsername:u.username||'',guardadoEn:firebase.firestore.FieldValue.serverTimestamp()});
  }
  W.slEntregar=id=>{const x=items().find(i=>i.id===id);if(!x)return;S.abierto=id;S.modo='ENTREGAR';S.cantidad=x.saldoLinea.paquetes>0&&Number.isInteger(x.saldoLinea.paquetes)?String(x.saldoLinea.paquetes):(x.factor?'':String(x.saldoLinea.unidades||''));S.msg=null;pintar();};
  W.slAnularAbrir=id=>{S.abierto=id;S.modo='ANULAR';S.motivo='';S.msg=null;pintar();};
  W.slCerrar=()=>{S.abierto='';S.modo='';pintar();};
  W.slCantidad=v=>{S.cantidad=v;const x=items().find(i=>i.id===S.abierto),e=document.getElementById('sl-conv');if(e&&x)e.textContent=convTxt(x,v);};
  W.slMotivo=v=>{S.motivo=v;};
  W.slConfirmar=async id=>{
    if(!puede()||S.guardando)return;const n=N(),x=items().find(i=>i.id===id);if(!n||!x)return;
    const e=n.validarEntregaSaldo(x,{cantidad:S.cantidad});if(e.length){S.msg={tipo:'error',texto:e.join(' ')};pintar();return;}
    S.guardando=true;S.msg=null;pintar();
    try{await guardar(n.construirEntregaSaldo(x,{cantidad:S.cantidad}));S.msg={tipo:'ok',texto:'Saldo entregado a Almacén. Cuando Almacén lo cuente, aquí verás si coincide.'};S.abierto='';S.modo='';S.cantidad='';}
    catch(err){S.msg={tipo:'error',texto:'No se pudo guardar: '+msgError(err)};}
    S.guardando=false;pintar();
  };
  W.slAnular=async id=>{
    if(!puede()||S.guardando)return;const n=N(),x=items().find(i=>i.id===id);if(!n||!x||!x.entrega)return;
    if(String(S.motivo||'').trim().length<5){S.msg={tipo:'error',texto:'Escribe el motivo de la anulación (mínimo 5 caracteres).'};pintar();return;}
    S.guardando=true;S.msg=null;pintar();
    try{await guardar(n.documentoAnulacionEntrega(x,S.motivo));S.msg={tipo:'ok',texto:'Entrega anulada. Puedes entregar el saldo de nuevo.'};S.abierto='';S.modo='';S.motivo='';}
    catch(err){S.msg={tipo:'error',texto:'No se pudo anular: '+msgError(err)};}
    S.guardando=false;pintar();
  };

  /* ---------- enganche en la pestaña Paletas ---------- */
  if(typeof renderPaletasTab==='function'){
    const original=renderPaletasTab;
    renderPaletasTab=function(){
      const r=original.apply(this,arguments);
      try{
        const form=document.getElementById('paletas-form-panel');
        if(form&&N()){
          let c=document.getElementById('pt-saldo-panel');
          if(!c){c=document.createElement('div');c.id='pt-saldo-panel';c.className='panel';form.insertAdjacentElement('afterend',c);}
          escuchar();pintar();
        }
      }catch(e){console.warn('Saldos por entregar:',e&&e.message||e);}
      return r;
    };
  }
  W.glacialSaldoEntrega={items,estado:S,pintar,detener};
})();
