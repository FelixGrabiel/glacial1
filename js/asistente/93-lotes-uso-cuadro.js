/* =============================================================
   USO EN EL CUADRO Y PESO FINAL (Etapa 2b de la trazabilidad de lotes) — acciones del supervisor
   -------------------------------------------------------------
   Desde el panel «Lotes de insumo usados» del cuadro (92-lotes-en-cuadro.js) el supervisor:
     · «Marcar en uso»: la unidad pasa de ENTREGADA_LINEA a EN_USO y queda el movimiento USO_CUADRO con el cuadro;
     · «Registrar peso final»: la unidad se CONSUMIÓ (peso 0) o se DEVUELVE a almacén con el peso que queda (devolución parcial); queda el movimiento
       CONSUMO o DEVOLUCION con los kg consumidos.
   Cada acción es una transacción (unidad + movimiento inmutable). Las reglas del servidor están en supabase/migraciones/glacial_39_uso_lotes_supervisores.sql:
   sin esa migración la acción avisa que no tiene permiso y no cambia nada. La lógica (estados, validaciones, pesos) es la del núcleo 87.
   ============================================================= */
(function(){
  'use strict';
  const T=window.glacialTrazabilidadNucleo;
  if(!T||typeof T.planUsoEnCuadro!=='function')return;
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const actor=()=>{
    const u=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;
    return {uid:(u&&u.uid)||'',nombre:(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||''};
  };
  const serverTs=()=>firebase.firestore.FieldValue.serverTimestamp();

  function aviso(texto,tipo){
    let c=document.getElementById('lc-toasts');
    if(!c){c=document.createElement('div');c.id='lc-toasts';c.setAttribute('aria-live','polite');c.style.cssText='position:fixed;top:14px;right:14px;z-index:95;display:grid;gap:8px;max-width:360px';document.body.appendChild(c);}
    const d=document.createElement('div');
    d.style.cssText='background:#fff;border:1px solid #dde6ef;border-left:5px solid '+(tipo==='error'?'#b42318':'#166534')+';border-radius:10px;padding:10px 14px;box-shadow:0 8px 24px rgba(15,37,71,.18);font-size:14px;cursor:pointer';
    d.textContent=texto;d.onclick=()=>d.remove();c.appendChild(d);setTimeout(()=>d.remove(),8000);
  }
  const mensajeError=e=>{
    if(e&&e.codigo)return e.message;
    const code=String(e&&e.code||'').replace(/^firestore\//,'');
    if(code==='permission-denied')return 'Tu usuario no tiene permiso para registrar el uso de lotes (falta publicar las reglas del servidor).';
    if(code==='unavailable')return 'Sin conexión: no se guardó. Inténtalo cuando vuelva la conexión.';
    return (e&&e.message)||String(e);
  };
  /* Cuadro del formulario i: clave del Asistente (fecha, bloque, línea, marca, presentación) y un texto legible. */
  function cuadroDe(i){
    const q=(typeof normalizarCuadros==='function'&&typeof draft!=='undefined'&&draft)?normalizarCuadros(draft)[i]:null;
    if(!q)throw new Error('No se encontró el cuadro.');
    const N=window.glacialAsistenteNucleo;
    const bloque=N&&N.bloqueDe?N.bloqueDe(draft.turno):(String(draft.turno||'').toUpperCase()==='NOCHE'?'NOCHE':'DIA');
    const clave=N&&N.claveCuadro?N.claveCuadro(draft.fecha,bloque,draft.linea,q.marca,q.presentacion):[draft.fecha,bloque,draft.linea,q.marca,q.presentacion].join('|');
    return {clave,fecha:draft.fecha,bloque,texto:draft.linea+' · C'+String(q.numero||i+1).padStart(2,'0')+' · '+q.marca+' '+q.presentacion};
  }
  async function transaccion(unidadId,planear){
    const refU=db.collection('insumosUnidades').doc(unidadId);
    let salida=null;
    await db.runTransaction(async tx=>{
      const s=await tx.get(refU);
      if(!s.exists)throw Object.assign(new Error('La unidad ya no existe.'),{codigo:'VALIDACION'});
      const plan=planear(s.data());
      tx.set(refU,plan.unidad);
      tx.set(db.collection('insumosLoteMovimientos').doc(plan.movimiento.id),Object.assign({},plan.movimiento,{en:serverTs()}));
      salida=plan;
    });
    return salida;
  }

  window.loteUsoMarcar=async function(i,unidadId){
    try{
      const a=actor(),cuadro=cuadroDe(i);
      await transaccion(unidadId,u=>T.planUsoEnCuadro({unidad:u,cuadro,usuario:a.nombre,uid:a.uid,en:ahora()}));
      aviso('Unidad '+unidadId+' marcada en uso en '+cuadro.texto+'.');
    }catch(e){aviso(mensajeError(e),'error');}
  };

  /* T5: el supervisor toma una caja/bobina que está EN ALMACÉN para su línea desde el cuadro: queda ENTREGADA a su línea (movimiento ENTREGA_LINEA,
     servidor: glacial_43) y el lote se marca en el cuadro. Un lote vencido no se toma (lo decide el núcleo 87, igual que la entrega de Almacén). */
  window.loteTomarAlmacen=async function(i,unidadId){
    try{
      const a=actor(),cuadro=cuadroDe(i);
      if(typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado())throw Object.assign(new Error('El reporte está finalizado: no se puede cambiar.'),{codigo:'ESTADO'});
      const hoy=typeof GlacialFecha!=='undefined'&&GlacialFecha.fechaISOLocal?GlacialFecha.fechaISOLocal(ahora()):(d=>d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'))(new Date(ahora()-5*3600000));   // respaldo: hora de Perú
      let lote=null;
      const refU=db.collection('insumosUnidades').doc(unidadId);
      await db.runTransaction(async tx=>{
        const s=await tx.get(refU);
        if(!s.exists)throw Object.assign(new Error('La caja/bobina ya no existe.'),{codigo:'VALIDACION'});
        const u=s.data(),sl=await tx.get(db.collection('insumosLotes').doc(u.loteId));
        if(!sl.exists)throw Object.assign(new Error('El lote de esta caja/bobina no existe.'),{codigo:'VALIDACION'});
        lote=sl.data();
        const plan=T.planEntregaLinea({unidad:u,lote,linea:draft.linea,usuario:a.nombre,uid:a.uid,en:ahora(),hoy,parametros:{diasAvisoVencimiento:null},
          motivo:'Tomada del almacén por el supervisor para '+cuadro.texto});
        tx.set(refU,plan.unidad);
        tx.set(db.collection('insumosLoteMovimientos').doc(plan.movimiento.id),Object.assign({},plan.movimiento,{en:serverTs()}));
      });
      if(typeof window.loteCuadroMarcarTomada==='function')window.loteCuadroMarcarTomada(i,lote,unidadId);
      aviso('Caja/bobina '+unidadId+' tomada para '+draft.linea+' y marcada en '+cuadro.texto+'. Márcala «en uso» cuando empiece a usarse.');
    }catch(e){aviso(mensajeError(e),'error');}
  };

  let abierto=null;
  function cerrarVentana(){const v=document.getElementById('lc-fondo');if(v)v.remove();abierto=null;}
  window.loteUsoCerrar=function(i,unidadId){
    cerrarVentana();abierto={i,unidadId};
    const f=document.createElement('div');f.id='lc-fondo';
    f.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.55);display:flex;align-items:center;justify-content:center;z-index:96;padding:16px';
    f.innerHTML='<div role="dialog" aria-modal="true" aria-label="Peso final de la unidad" style="background:#fff;border-radius:12px;padding:18px;max-width:420px;width:100%">'+
      '<h3 style="margin:0 0 6px">Peso final de la unidad</h3><div style="font-size:13px;color:#5a6b7b;margin-bottom:10px">'+esc(unidadId)+'</div>'+
      '<label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="radio" name="lc-dest" value="CONSUMIDA" checked> Se consumió completa</label>'+
      '<label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="radio" name="lc-dest" value="EN_ALMACEN"> Sobró: devolver a almacén</label>'+
      '<label id="lc-peso-et" style="display:none;font-size:14px;margin:8px 0">Peso que queda (kg)<input id="lc-peso" type="number" min="0" step="any" inputmode="decimal" style="display:block;width:100%;padding:8px;margin-top:3px;border:1px solid #b8c6d2;border-radius:8px;box-sizing:border-box"></label>'+
      '<div id="lc-peso-und" style="font-size:13px;color:#5a6b7b;min-height:16px"></div>'+
      '<div id="lc-error" role="alert" style="color:#c62828;font-size:13px;min-height:16px"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px"><button type="button" class="btn btn-ghost" id="lc-x">Cancelar</button><button type="button" class="btn btn-primary" id="lc-ok">Guardar</button></div></div>';
    document.body.appendChild(f);
    const q=s=>f.querySelector(s);
    f.querySelectorAll('input[name=lc-dest]').forEach(r=>r.addEventListener('change',()=>{q('#lc-peso-et').style.display=q('input[name=lc-dest]:checked').value==='EN_ALMACEN'?'block':'none';}));
    // UND estimadas por el peso que queda (Asistente › Conversiones), solo como referencia.
    q('#lc-peso').addEventListener('input',()=>{const t=typeof window.loteUnidadesEstimadas==='function'?window.loteUnidadesEstimadas(unidadId,q('#lc-peso').value):'';
      q('#lc-peso-und').textContent=t?t+' (estimado por peso, con la conversión vigente)':'';});
    q('#lc-x').onclick=cerrarVentana;
    q('#lc-ok').onclick=async()=>{
      const destino=q('input[name=lc-dest]:checked').value,peso=q('#lc-peso').value,a=actor();
      q('#lc-error').textContent='';q('#lc-ok').disabled=true;
      try{
        const r=await transaccion(unidadId,u=>T.planCierreUnidad({unidad:u,destino,pesoFinal:peso,usuario:a.nombre,uid:a.uid,en:ahora()}));
        cerrarVentana();
        aviso('Unidad '+unidadId+': '+(destino==='CONSUMIDA'?'consumida':'devuelta a almacén')+' · consumo '+r.consumidoKg+' kg.');
      }catch(e){q('#lc-error').textContent=mensajeError(e);q('#lc-ok').disabled=false;}
    };
    setTimeout(()=>{try{q('input[name=lc-dest]').focus();}catch(_){/* ya cerrada */}},50);
  };
  window.__lotesUsoCuadro={cuadroDe};
})();
