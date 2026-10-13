/* =============================================================
   GLACIAL · CORREGIR Y REASIGNAR PARADAS
   -------------------------------------------------------------
   Una parada de Avance/Cierre (sync/avancesTurno → paradasOperativas) es un evento de la LÍNEA, turno y fecha. Su asignación a una marca
   vive en el Nuevo registro (draft.asignacionParadasAvance: id → índice del cuadro; 35-autollenado-registro.js). Esta corrección NO borra la
   parada: cambia su asignación y deja constancia.

   Acciones (permiso «corregir_paradas»; Administrador siempre; nunca en modo consulta):
     · QUITAR_MARCA     la parada vuelve a «Sin asignar» (draft.asignacionParadasAvance[id] = -1) y se elige de nuevo con el aviso
                        «Paradas de Avance/Cierre por asignar» del Registro. El evento fuente, sus minutos, causa, tipo, autor y origen no cambian.
     · REASIGNAR_MARCA  pasa a otro cuadro (marca) del mismo registro.
     · REASIGNAR_LINEA  cambia la línea del evento (UNA transacción sobre sync/avancesTurno; fecha, turno, minutos, tipo y horas no cambian).
                        En la línea destino queda sin asignar a marca hasta que el supervisor la elija (o se asigna sola si hay una sola producción).

   Historial: en el propio dato (draft.correccionesParadas para la marca; parada.historialAsignacion para la línea), guardado en el MISMO
   documento y en el mismo guardado que el cambio, más una copia inmutable en la colección correccionesParada (un documento por operación,
   id = identificador de la operación: un reintento o un doble clic no la repite; las reglas impiden editarla o borrarla).
   Hora: la del servidor (tareoAhoraServidor). Sin increment/arrayUnion/update con rutas: compatible con el puente de Supabase.
   Cargar DESPUÉS de 29-avance-produccion.js y 35-autollenado-registro.js.
   ============================================================= */
(function instalarCorreccionParadas(){
  'use strict';
  const COLECCION='correccionesParada';
  const MIN_MOTIVO=5;
  const SIN_ASIGNAR=-1;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const canon=t=>String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DÍA';
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const clon=v=>JSON.parse(JSON.stringify(v));
  const lineasTodas=()=>typeof AVANCE_LINEAS!=='undefined'?AVANCE_LINEAS:['PET1','PET2','B7L','C20L','B20L','HIELO'];
  const nombreLinea=l=>(typeof AVANCE_NOMBRES!=='undefined'&&AVANCE_NOMBRES[l])||l;
  const idOperacion=()=>'cp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const esperar=ms=>new Promise(r=>setTimeout(r,ms));

  /* ---------- permisos ---------- */
  function puede(){
    const u=typeof state!=='undefined'&&state.user;
    if(!u)return false;
    if(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(u))return false;
    if(window.glacialVista&&typeof window.glacialVista.activo==='function'&&window.glacialVista.activo())return false;     // modo visualización: sin escritura
    return typeof tienePermiso==='function'&&tienePermiso('corregir_paradas');
  }
  /* Línea dentro del alcance del usuario: el Administrador y «Todas las líneas» ven todas; el resto, la suya. */
  function lineaEnAlcance(l){
    const u=typeof state!=='undefined'&&state.user;
    if(!u)return false;
    if(typeof tienePermiso==='function'&&tienePermiso('todasLasLineas'))return true;
    return !u.linea||u.linea===l;
  }
  function actor(){
    const u=(typeof state!=='undefined'&&state.user)||{};
    let q=null;
    try{q=window.glacialIntervenciones&&window.glacialIntervenciones.quienActua?window.glacialIntervenciones.quienActua():null;}catch(_){q=null;}
    let uid=q&&q.uid||'';
    if(!uid){try{uid=(window.firebase&&firebase.auth&&firebase.auth().currentUser&&firebase.auth().currentUser.uid)||u.uid||'';}catch(_){uid=u.uid||'';}}
    return {uid,por:(q&&q.nombre)||u.nombre||u.username||''};
  }

  /* ---------- núcleo (funciones puras: se prueban sin pantalla) ---------- */
  function validarMotivo(m){
    return String(m||'').trim().length<MIN_MOTIVO?'Escribe el motivo de la corrección (mínimo '+MIN_MOTIVO+' caracteres).':'';
  }
  /* Copia del mapa de asignación con las paradas indicadas en `destino` (SIN_ASIGNAR o índice del cuadro). No toca las demás. */
  function asignacionConCambios(actual,ids,destino){
    const n=Object.assign({},actual||{});
    ids.forEach(id=>{n[id]=destino;});
    return n;
  }
  /* Cambia la LÍNEA de las paradas indicadas dentro de la lista de paradas operativas. Devuelve {lista,movidas}; lanza un Error legible si algo no
     cuadra (la parada ya no existe, ya se movió, otro usuario la cambió, destino igual al origen o ya contiene el id). No modifica `operativas`. */
  function transferirLinea(operativas,ids,o){
    const lista=Array.isArray(operativas)?operativas.slice():[];
    const unicos=[...new Set((ids||[]).map(String))];
    if(!unicos.length)throw new Error('Selecciona al menos una parada.');
    if(!o||!lineasTodas().includes(o.destino))throw new Error('Elige la línea destino.');
    if(o.origen===o.destino)throw new Error('La línea destino es la misma de origen.');
    const movidas=[];
    unicos.forEach(id=>{
      const i=lista.findIndex(p=>p&&String(p.id)===id&&!p.eliminada);
      if(i<0)throw new Error('La parada ya no existe o fue eliminada. Vuelve a abrir la corrección.');
      const p=lista[i],nombre='«'+(String(p.descripcion||'').trim()||'sin motivo')+'»';
      if(p.linea!==o.origen||p.fecha!==o.fecha||canon(p.turno)!==canon(o.turno))
        throw new Error('La parada '+nombre+' ya no está en '+nombreLinea(o.origen)+' de ese turno (otra persona la movió). Vuelve a abrir la corrección.');
      if(o.base&&o.base[id]!==undefined&&num(o.base[id])!==num(p.actualizadoEn))
        throw new Error('La parada '+nombre+' fue modificada por otro usuario mientras la revisabas. Vuelve a abrir la corrección para ver los cambios.');
      if(lista.some((x,j)=>j!==i&&x&&String(x.id)===id&&x.linea===o.destino&&!x.eliminada))
        throw new Error('La parada '+nombre+' ya está registrada en '+nombreLinea(o.destino)+': no se agrega otra vez.');
      const entrada={opId:o.opId,accion:'REASIGNAR_LINEA',desde:{linea:o.origen},hacia:{linea:o.destino},minutos:num(p.minutos),motivo:String(o.motivo||'').trim(),
        uid:o.actor.uid,por:o.actor.por,ts:o.ahora};
      lista[i]=Object.assign({},p,{linea:o.destino,actualizadoPor:o.actor.por,actualizadoEn:o.ahora,historialAsignacion:[...(Array.isArray(p.historialAsignacion)?p.historialAsignacion:[]),entrada]});
      movidas.push({paradaId:id,descripcion:String(p.descripcion||''),minutos:num(p.minutos),tipo:p.tipo||''});
    });
    return {lista,movidas};
  }
  /* Documento inmutable de la colección correccionesParada (los campos son exactamente los que aceptan las reglas). */
  function docAuditoria(o){
    return {id:o.opId,accion:o.accion,linea:o.linea,fecha:o.fecha,turno:canon(o.turno),paradas:o.paradas,
      desde:o.desde||{},hacia:o.hacia||{},minutos:o.paradas.reduce((s,p)=>s+num(p.minutos),0),motivo:String(o.motivo||'').trim(),cerrado:!!o.cerrado,
      version:1,actualizadaUid:o.actor.uid,actualizadaPor:o.actor.por,actualizadaEn:o.ts};
  }
  /* Revisa la selección y la acción elegidas; '' si todo es válido. */
  function validarEntrada(E){
    if(!E.sel.size)return 'Selecciona al menos una parada.';
    const m=validarMotivo(E.motivo);if(m)return m;
    if(!['QUITAR','MARCA','LINEA'].includes(E.accion))return 'Elige qué quieres hacer: quitar de la marca o reasignar.';
    if(E.accion==='QUITAR'&&E.cuadro===null)return 'Quitar de la marca solo aplica desde el Registro.';
    if(E.accion==='LINEA'){
      if(!E.destLinea)return 'Elige la línea destino.';
      if(E.destLinea===E.ctx.linea)return 'La línea destino es la misma de origen. Para cambiar de marca usa «Otra marca de esta línea».';
      if(!lineaEnAlcance(E.ctx.linea)||!lineaEnAlcance(E.destLinea))return 'No tienes alcance sobre la línea de origen o de destino.';
    }
    if(E.accion==='MARCA'){
      if(E.destCuadro===''||E.destCuadro===null)return 'Elige la marca destino.';
      if(E.cuadro!==null&&Number(E.destCuadro)===E.cuadro)return 'La parada ya está en esa marca.';
    }
    return '';
  }

  /* ---------- estado y estilos ---------- */
  const S={modal:null};
  function estilos(){
    if(document.getElementById('corp-css'))return;
    const s=document.createElement('style');s.id='corp-css';
    s.textContent='.corp-fondo{position:fixed;inset:0;background:rgba(10,24,40,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:8px}'+
      '.corp-dlg{background:#fff;color:#14283c;border-radius:12px;width:min(620px,calc(100vw - 16px));max-height:92vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.3);font-size:13px}'+
      '.corp-dlg header{padding:14px 16px;border-bottom:1px solid #dbe5ee;display:flex;justify-content:space-between;align-items:flex-start;gap:8px}'+
      '.corp-dlg h3{margin:0;font-size:16px}.corp-dlg header small{color:#5a7083}'+
      '.corp-cuerpo{padding:12px 16px;display:grid;gap:10px}'+
      '.corp-lista{display:grid;gap:6px;max-height:34vh;overflow:auto}'+
      '.corp-fila{display:grid;grid-template-columns:auto 1fr;gap:8px;padding:8px;border:1px solid #dbe5ee;border-radius:8px;align-items:start}'+
      '.corp-fila.sel{border-color:#005b96;background:#f2f8fd}.corp-fila small{color:#5a7083;display:block}'+
      '.corp-bloque{border:1px solid #dbe5ee;border-radius:8px;padding:8px 10px;display:grid;gap:6px}'+
      '.corp-bloque label{display:block}.corp-bloque label select{margin-left:6px}'+
      '.corp-bloque select,.corp-dlg textarea{max-width:100%;box-sizing:border-box}.corp-dlg textarea{width:100%;min-height:54px}'+
      '.corp-antes{background:#f6fbff;border:1px solid #cfe3f3;border-radius:8px;padding:8px 10px}'+
      '.corp-error{background:#fdecec;color:#8a1c1c;border:1px solid #f0b9b9;border-radius:8px;padding:8px 10px}'+
      '.corp-aviso{background:#fff8e6;color:#6b4a00;border:1px solid #efc98a;border-radius:8px;padding:8px 10px}'+
      '.corp-pie{padding:12px 16px;border-top:1px solid #dbe5ee;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}';
    document.head.appendChild(s);
  }

  /* ---------- contexto: de dónde se abre ---------- */
  const I=()=>window.__autollenadoInternos||{};
  function cuadrosRegistro(){return typeof I().cuadrosConProducto==='function'?I().cuadrosConProducto():[];}
  const etiquetaCuadro=(q,i)=>'Producción '+(i+1)+' · '+(q&&q.marca||'')+(q&&q.presentacion?' '+q.presentacion:'');

  function filasRegistro(){
    const cu=cuadrosRegistro();
    return (I().paradasAvance?I().paradasAvance():[]).map(p=>{
      const i=I().cuadroDeAvance(p);
      const c=i===null||i===undefined?null:cu.find(x=>x.i===i);
      return {id:p.id,descripcion:p.descripcion||'',causa:p.causa||'',tipo:p.tipo,minutos:num(p.minutos),actualizadoEn:num(p.actualizadoEn),
        origen:'Avance/Cierre',cuadro:i===undefined?null:i,asignacion:c?etiquetaCuadro(c.q,c.i):'Sin asignar'};
    });
  }
  function filasAvance(linea,fecha,turno){
    const lista=typeof avanceEstado!=='undefined'?(avanceEstado.paradasOperativas||[]):[];
    return lista.filter(p=>p&&!p.eliminada&&p.linea===linea&&p.fecha===fecha&&canon(p.turno)===canon(turno)).map(p=>({
      id:p.id,descripcion:p.descripcion||'',causa:p.causa||'',tipo:p.tipo,minutos:num(p.minutos),actualizadoEn:num(p.actualizadoEn),
      origen:'Avance/Cierre',cuadro:null,asignacion:'Línea '+nombreLinea(linea)}));
  }
  function hayCierre(fecha,turno){
    return typeof avanceEstado!=='undefined'&&Array.isArray(avanceEstado.todosSnapshots)&&
      avanceEstado.todosSnapshots.some(s=>s&&s.tipo==='CIERRE'&&s.fecha===fecha&&canon(s.turno)===canon(turno));
  }

  function abrir(ctx,filas,cuadro,sel){
    if(!puede())return;
    estilos();
    const f=filas.filter(x=>x.id);
    S.modal={ctx,cuadro,filas:f,sel:new Set(sel||[]),filtro:cuadro===null?'todas':'marca',accion:cuadro===null?'LINEA':'QUITAR',
      destLinea:'',destCuadro:'',motivo:'',guardando:false,error:'',opId:idOperacion(),cerrado:hayCierre(ctx.fecha,ctx.turno)};
    pintar();
  }
  function abrirRegistro(cuadro,idParada){
    if(typeof draft==='undefined'||!draft)return;
    abrir({linea:draft.linea,fecha:draft.fecha,turno:draft.turno,origen:'registro'},filasRegistro(),Number(cuadro),idParada?[idParada]:[]);
  }
  function abrirAvance(){
    const m=typeof avanceEstado!=='undefined'?avanceEstado.paradasModal:null;
    const linea=m?m.linea:null,fecha=m?m.fecha:avanceEstado.fecha,turno=m?m.turno:avanceEstado.turno;
    if(!linea)return;
    abrir({linea,fecha,turno,origen:'avance'},filasAvance(linea,fecha,turno),null,[]);
  }
  function cerrar(){
    if(S.modal&&S.modal.guardando)return;
    const e=document.getElementById('corp-modal');if(e)e.remove();
    S.modal=null;
  }

  /* ---------- pantalla ---------- */
  function visibles(E){
    return E.filas.filter(f=>E.filtro==='todas'||(E.filtro==='sin'&&f.cuadro===null&&f.asignacion==='Sin asignar')||(E.filtro==='marca'&&f.cuadro===E.cuadro));
  }
  function resumenAntesDespues(E){
    const sel=E.filas.filter(f=>E.sel.has(f.id)),min=sel.reduce((s,f)=>s+f.minutos,0),n=sel.length;
    if(!n)return '<span>Selecciona las paradas para ver el antes y el después.</span>';
    const txt=n+' parada'+(n>1?'s':'')+' · '+min+' min';
    if(E.accion==='QUITAR'){
      const cu=cuadrosRegistro().find(x=>x.i===E.cuadro);
      return '<b>Antes:</b> '+esc(txt)+' asignados a '+esc(cu?etiquetaCuadro(cu.q,cu.i):'esta marca')+'.<br><b>Después:</b> salen '+min+' min de esa marca y quedan «Sin asignar» (pendientes de asignación); no se suman en ninguna marca hasta que elijas una.';
    }
    if(E.accion==='MARCA'){
      const o=cuadrosRegistro().find(x=>x.i===E.cuadro),d=cuadrosRegistro().find(x=>x.i===Number(E.destCuadro));
      return '<b>Antes:</b> '+esc(txt)+' en '+esc(o?etiquetaCuadro(o.q,o.i):'esta marca')+'.<br><b>Después:</b> −'+min+' min en origen · +'+min+' min en '+esc(d?etiquetaCuadro(d.q,d.i):'la marca destino')+'.';
    }
    return '<b>Antes:</b> '+esc(txt)+' en '+esc(nombreLinea(E.ctx.linea))+'.<br><b>Después:</b> −'+min+' min en '+esc(nombreLinea(E.ctx.linea))+' · +'+min+' min en '+esc(E.destLinea?nombreLinea(E.destLinea):'la línea destino')+
      ' (queda «Sin asignar» a marca hasta que el supervisor de esa línea la elija en su Registro). Fecha '+esc(E.ctx.fecha)+' y turno '+esc(E.ctx.turno)+' no cambian.';
  }
  function pintar(){
    const E=S.modal;if(!E)return;
    let modal=document.getElementById('corp-modal');
    if(!modal){modal=document.createElement('div');modal.id='corp-modal';modal.className='corp-fondo';document.body.appendChild(modal);}
    const dis=E.guardando?'disabled':'';
    const cu=cuadrosRegistro();
    const lineasDest=lineasTodas().filter(l=>l!==E.ctx.linea&&lineaEnAlcance(l));
    const lista=visibles(E);
    modal.innerHTML='<div class="corp-dlg" role="dialog" aria-modal="true" aria-label="Corregir asignación de paradas">'+
      '<header><div><h3>Corregir asignación</h3><small>'+esc(nombreLinea(E.ctx.linea))+' · '+esc(E.ctx.fecha)+' · '+esc(E.ctx.turno)+'</small></div><button type="button" class="btn btn-ghost" onclick="glacialCorreccionParadas.cerrar()" '+dis+' aria-label="Cerrar">✕</button></header>'+
      '<div class="corp-cuerpo">'+
        (E.cerrado?'<div class="corp-aviso">El cierre de este turno ya fue generado. Se conserva tal como se generó; esta corrección queda registrada y puedes generar una nueva versión autorizada después.</div>':'')+
        (E.ctx.origen==='avance'?'<div class="corp-aviso">Los cambios sin guardar del formulario «Agregar paradas» se descartan al reasignar.</div>':'')+
        (E.error?'<div class="corp-error" role="alert">'+esc(E.error)+'</div>':'')+
        (E.cuadro!==null?'<label>Mostrar <select onchange="glacialCorreccionParadas.filtro(this.value)" '+dis+'><option value="marca" '+(E.filtro==='marca'?'selected':'')+'>Esta marca</option><option value="sin" '+(E.filtro==='sin'?'selected':'')+'>Sin asignar</option><option value="todas" '+(E.filtro==='todas'?'selected':'')+'>Todas las paradas del turno</option></select></label>':'')+
        '<div class="corp-lista">'+(lista.map(f=>'<label class="corp-fila'+(E.sel.has(f.id)?' sel':'')+'"><input type="checkbox" '+(E.sel.has(f.id)?'checked ':'')+dis+' onchange="glacialCorreccionParadas.marcar(\''+esc(f.id)+'\',this.checked)">'+
          '<span><b>'+esc(f.descripcion||'(sin motivo)')+'</b> · '+f.minutos+' min<small>'+esc(f.tipo==='PROGRAMADA'?'Programada':'No programada')+(f.causa?' · '+esc(f.causa):'')+' · '+esc(E.ctx.fecha)+' · '+esc(E.ctx.turno)+'</small><small>Origen: '+esc(f.origen)+' · Asignación: <b>'+esc(f.asignacion)+'</b></small></span></label>').join('')||'<div class="corp-aviso">No hay paradas en esta vista.</div>')+'</div>'+
        '<div class="corp-bloque"><b>¿Qué quieres hacer?</b>'+
          (E.cuadro!==null?'<label><input type="radio" name="corp-acc" '+(E.accion==='QUITAR'?'checked ':'')+dis+' onchange="glacialCorreccionParadas.accion(\'QUITAR\')"> Quitar de esta marca (queda «Sin asignar» para elegirla de nuevo)</label>'+
            '<label><input type="radio" name="corp-acc" '+(E.accion==='MARCA'?'checked ':'')+dis+' onchange="glacialCorreccionParadas.accion(\'MARCA\')"> Otra marca de esta línea: '+
              '<select onchange="glacialCorreccionParadas.destCuadro(this.value)" '+(dis||(E.accion==='MARCA'?'':'disabled'))+'><option value="">Elegir…</option>'+cu.filter(x=>x.i!==E.cuadro).map(x=>'<option value="'+x.i+'" '+(String(E.destCuadro)===String(x.i)?'selected':'')+'>'+esc(etiquetaCuadro(x.q,x.i))+'</option>').join('')+'</select></label>':'')+
          '<label><input type="radio" name="corp-acc" '+(E.accion==='LINEA'?'checked ':'')+dis+' onchange="glacialCorreccionParadas.accion(\'LINEA\')"> Otra línea: '+
            '<select onchange="glacialCorreccionParadas.destLinea(this.value)" '+(dis||(E.accion==='LINEA'?'':'disabled'))+'><option value="">Elegir…</option>'+lineasDest.map(l=>'<option value="'+esc(l)+'" '+(E.destLinea===l?'selected':'')+'>'+esc(nombreLinea(l))+'</option>').join('')+'</select></label>'+
        '</div>'+
        '<div class="corp-antes" aria-live="polite">'+resumenAntesDespues(E)+'</div>'+
        '<label>Motivo de la corrección (obligatorio)<textarea maxlength="200" oninput="glacialCorreccionParadas.motivo(this.value)" '+dis+'>'+esc(E.motivo)+'</textarea></label>'+
      '</div>'+
      '<div class="corp-pie"><button type="button" class="btn btn-ghost" onclick="glacialCorreccionParadas.cerrar()" '+dis+'>Cancelar</button>'+
        '<button type="button" class="btn btn-primary" onclick="glacialCorreccionParadas.confirmar()" '+dis+'>'+(E.guardando?'Guardando…':'Confirmar corrección')+'</button></div></div>';
  }

  /* ---------- entradas de la pantalla ---------- */
  const E_=()=>S.modal&&!S.modal.guardando?S.modal:null;
  function marcar(id,v){const E=E_();if(!E)return;if(v)E.sel.add(id);else E.sel.delete(id);E.error='';pintar();}
  function accion(a){const E=E_();if(!E)return;E.accion=a;E.error='';pintar();}
  function filtro(v){const E=E_();if(!E)return;E.filtro=v;pintar();}
  function destLinea(v){const E=E_();if(!E)return;E.destLinea=v;E.error='';pintar();}
  function destCuadro(v){const E=E_();if(!E)return;E.destCuadro=v;E.error='';pintar();}
  function motivo(v){const E=E_();if(!E)return;E.motivo=v;}      // sin redibujar: conserva el cursor

  /* ---------- guardado ---------- */
  const ts=()=>firebase.firestore.FieldValue.serverTimestamp();
  function avisar(t){try{if(typeof avAviso==='function')avAviso(t);else if(typeof mostrarToastReporte==='function')mostrarToastReporte(t);}catch(_){/* sin aviso */}}

  /* Copia inmutable en correccionesParada. Si ya existe (reintento) se da por registrada. Devuelve true/false. */
  async function registrarAuditoria(datos){
    try{
      const ref=db.collection(COLECCION).doc(datos.id);
      await db.runTransaction(async tx=>{
        const ya=await tx.get(ref);
        if(ya.exists)return;
        tx.set(ref,Object.assign({},datos,{actualizadaEn:ts()}));
      });
      return true;
    }catch(e){console.warn('Historial central de correcciones:',e&&e.message||e);return false;}
  }

  async function aplicarMarca(E){
    if(typeof draft==='undefined'||!draft)throw new Error('No hay un registro abierto.');
    if(typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado())
      throw new Error('El reporte está finalizado. Reábrelo (permiso «Reabrir reportes») antes de corregir la asignación.');
    if(!I().cuadroDeAvance)throw new Error('La asignación de paradas no está disponible en este registro.');
    const ids=[...E.sel],vivas=I().paradasAvance();
    const sel=ids.map(id=>vivas.find(p=>p.id===id));
    if(sel.some(p=>!p))throw new Error('Una de las paradas ya no existe en el turno. Vuelve a abrir la corrección.');
    const cu=cuadrosRegistro();
    if(E.accion==='QUITAR'&&sel.some(p=>I().cuadroDeAvance(p)!==E.cuadro))
      throw new Error('Una de las paradas ya no está asignada a esta marca (otra persona la cambió). Vuelve a abrir la corrección.');
    if(E.accion==='MARCA'){
      const dest=Number(E.destCuadro);
      if(!cu.some(x=>x.i===dest))throw new Error('La marca destino ya no existe en este registro.');
      if(sel.some(p=>I().cuadroDeAvance(p)===dest))throw new Error('Una de las paradas ya está asignada a la marca destino: no se agrega otra vez.');
    }
    const destino=E.accion==='QUITAR'?SIN_ASIGNAR:Number(E.destCuadro);
    const antesAsig=clon(draft.asignacionParadasAvance||{}),antesHist=clon(draft.correccionesParadas||[]);
    const a=actor(),ahora=ahoraMs();
    const desdeCu=cu.find(x=>x.i===E.cuadro),haciaCu=cu.find(x=>x.i===destino);
    const paradas=sel.map(p=>({paradaId:p.id,descripcion:String(p.descripcion||''),minutos:num(p.minutos),tipo:p.tipo||''}));
    const desde={linea:E.ctx.linea,cuadro:E.cuadro,marca:desdeCu?etiquetaCuadro(desdeCu.q,desdeCu.i):''};
    const hacia=E.accion==='QUITAR'?{linea:E.ctx.linea,sinAsignar:true}:{linea:E.ctx.linea,cuadro:destino,marca:haciaCu?etiquetaCuadro(haciaCu.q,haciaCu.i):''};
    const accionDoc=E.accion==='QUITAR'?'QUITAR_MARCA':'REASIGNAR_MARCA';
    draft.asignacionParadasAvance=asignacionConCambios(draft.asignacionParadasAvance,ids,destino);
    draft.correccionesParadas=antesHist.concat([{opId:E.opId,accion:accionDoc,paradas,desde,hacia,motivo:E.motivo.trim(),uid:a.uid,por:a.por,ts:ahora,cerrado:E.cerrado}]);
    const refrescar=()=>{
      if(typeof window.autollenarRegistro==='function')window.autollenarRegistro({forzar:true,campo:'paradas'});
      if(typeof renderFormTab==='function')renderFormTab();
    };
    refrescar();
    let ok=typeof guardarAvanceReporte==='function'?await guardarAvanceReporte({silencioso:true}):false;
    if(!ok){await esperar(700);ok=await guardarAvanceReporte({silencioso:true});}
    if(!ok){
      draft.asignacionParadasAvance=antesAsig;draft.correccionesParadas=antesHist;refrescar();
      throw new Error('No se pudo guardar la corrección en el servidor. Se restauró la asignación anterior; revisa tu conexión e inténtalo de nuevo.');
    }
    const copia=await registrarAuditoria(docAuditoria({opId:E.opId,accion:accionDoc,linea:E.ctx.linea,fecha:E.ctx.fecha,turno:E.ctx.turno,paradas,desde,hacia,motivo:E.motivo,cerrado:E.cerrado,actor:a}));
    return {copia};
  }

  async function aplicarLinea(E){
    const ids=[...E.sel],a=actor();
    const base={};E.filas.forEach(f=>{if(E.sel.has(f.id))base[f.id]=f.actualizadoEn;});
    const resultado=await db.runTransaction(async tx=>{
      const aRef=db.collection('sync').doc('avancesTurno'),audRef=db.collection(COLECCION).doc(E.opId);
      const [adoc,audoc]=await Promise.all([tx.get(aRef),tx.get(audRef)]);
      if(audoc.exists)throw new Error('Esta corrección ya se aplicó. Vuelve a abrir la pantalla para ver el estado actual.');
      const ad=adoc.exists?adoc.data():{};
      const ahora=Math.max(ahoraMs(),num(ad.updatedAt)+1);
      const t=transferirLinea(ad.paradasOperativas,ids,{origen:E.ctx.linea,destino:E.destLinea,fecha:E.ctx.fecha,turno:E.ctx.turno,motivo:E.motivo,actor:a,ahora,opId:E.opId,base});
      tx.set(aRef,{paradasOperativas:t.lista,updatedAt:ahora},{merge:true});
      tx.set(audRef,Object.assign(docAuditoria({opId:E.opId,accion:'REASIGNAR_LINEA',linea:E.ctx.linea,fecha:E.ctx.fecha,turno:E.ctx.turno,paradas:t.movidas,
        desde:{linea:E.ctx.linea},hacia:{linea:E.destLinea},motivo:E.motivo,cerrado:E.cerrado,actor:a}),{actualizadaEn:ts()}));
      return {operativas:t.lista,updatedAt:ahora};
    });
    if(typeof avanceEstado!=='undefined'){avanceEstado.paradasOperativas=resultado.operativas;avanceEstado.avancesUpdatedAt=resultado.updatedAt;}
    return resultado;
  }

  async function confirmar(){
    const E=S.modal;if(!E||E.guardando)return;
    const err=validarEntrada(E);
    if(err){E.error=err;pintar();return;}
    E.guardando=true;E.error='';pintar();
    try{
      if(E.accion==='LINEA'){
        await aplicarLinea(E);
        E.guardando=false;
        const origen=E.ctx;cerrar();
        if(origen.origen==='avance'&&typeof avCerrarParadas==='function'){
          avCerrarParadas();
          if(typeof avAbrirParadas==='function')await avAbrirParadas(origen.linea,origen.fecha,origen.turno);
        }
        if(typeof draft!=='undefined'&&draft&&typeof window.autollenarRegistro==='function'){
          try{if(window.autollenarRegistro({forzar:true,campo:'paradas'})&&typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();
            if(typeof renderFormTab==='function'&&typeof state!=='undefined'&&state.currentTab==='nuevo')renderFormTab();}catch(e){console.warn('Refrescando el registro:',e);}
        }
        if(typeof state!=='undefined'&&state.currentTab==='avance-produccion'&&typeof avDibujar==='function')avDibujar();
        avisar('Parada(s) reasignada(s) a '+nombreLinea(E.destLinea)+'.');
      }else{
        const r=await aplicarMarca(E);
        E.guardando=false;cerrar();
        avisar(r.copia?'Corrección guardada.':'Corrección guardada; no se pudo copiar al historial central (queda en el registro).');
      }
    }catch(e){
      console.error('Corregir asignación:',e);
      E.guardando=false;E.error=(e&&e.message)||'No se pudo guardar la corrección.';
      if(S.modal===E)pintar();
    }
  }

  /* ---------- aviso en Avance/Cierre: correcciones posteriores a un avance o cierre ya generado ---------- */
  function correccionesPosteriores(paradas,snapshots){
    const out=[];
    (paradas||[]).forEach(p=>{
      (Array.isArray(p&&p.historialAsignacion)?p.historialAsignacion:[]).forEach(h=>{
        const afecta=(snapshots||[]).some(s=>s&&s.fecha===p.fecha&&canon(s.turno)===canon(p.turno)&&num(s.generadoEn)<num(h.ts));
        if(afecta)out.push({paradaId:p.id,fecha:p.fecha,turno:canon(p.turno),ts:num(h.ts),minutos:num(h.minutos),desde:h.desde&&h.desde.linea||'',hacia:h.hacia&&h.hacia.linea||'',motivo:h.motivo||''});
      });
    });
    return out;
  }
  function avisoPosterior(){
    if(typeof avanceEstado==='undefined')return '';
    const lista=correccionesPosteriores((avanceEstado.paradasOperativas||[]).filter(p=>p&&p.fecha===avanceEstado.fecha&&canon(p.turno)===canon(avanceEstado.turno)),avanceEstado.snapshots||[]);
    if(!lista.length)return '';
    return '<div class="av-inline-status" style="font-size:12px;color:#6b4a00">Hay '+lista.length+' corrección(es) de paradas posteriores a un avance o cierre ya generado en este turno ('+
      lista.map(c=>esc(nombreLinea(c.desde))+' → '+esc(nombreLinea(c.hacia))+' · '+c.minutos+' min').join('; ')+'). Lo ya generado conserva los valores de entonces; genera una nueva versión para reflejarlas.</div>';
  }

  window.glacialCorreccionParadas={COLECCION,SIN_ASIGNAR,MIN_MOTIVO,puede,lineaEnAlcance,abrirRegistro,abrirAvance,cerrar,marcar,accion,filtro,destLinea,destCuadro,motivo,confirmar,
    avisoPosterior,
    nucleo:{validarMotivo,asignacionConCambios,transferirLinea,docAuditoria,validarEntrada,correccionesPosteriores,registrarAuditoria}};
})();
