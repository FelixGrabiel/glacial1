/* =========================================================
   ENTREGA DE TURNO entre supervisores de Producción

   Por qué: el supervisor entrante se enteraba de los pendientes de palabra. Aquí queda escrito qué se entrega, quién lo recibe y a qué hora,
   y el entrante lo ve en su celular apenas se envía (tarjeta en el Inicio, en vivo).

   Cambios de turno que cubre: DÍA → INTERMEDIO, INTERMEDIO → NOCHE y NOCHE → DÍA. DÍA e INTERMEDIO comparten programación y producción
   acumulada: la entrega NO reinicia nada, solo toma la foto del bloque.

   FIRESTORE: colección entregasTurno, un documento por fecha operativa y turno SALIENTE (id «AAAA-MM-DD_DIA|INTERMEDIO|NOCHE»; la fecha es
   la operativa, la misma convención de resumenesTurno: la NOCHE de después de medianoche sigue en la fecha del día en que empezó).
     · Crear (runTransaction, no pisa uno existente): fecha, turno, estado:'ENTREGADA', resumen, novedades, entregaUid, entregaPor,
       entregaNombre, entregadaEn (hora del servidor).
     · Mientras esté ENTREGADA, quien la entregó corrige SOLO resumen y novedades (+ actualizadaEn y actualizaciones).
     · Recibir: otro usuario pasa estado a 'RECIBIDA' y escribe SOLO recibeUid, recibePor, recibeNombre, recibidaEn (hora del servidor) y
       observacionRecibe (opcional). Después nadie la cambia. Nunca se borra.
   resumen = foto automática por línea (estado, producido contra programado, parada abierta, paradas con motivo pendiente) armada con
   glacialResumenTurno.construirDatos (48-resumen-turno.js → 23b + bitacoraMttoPendientes): no se duplica ninguna fórmula.
   La confirmación NO bloquea: el entrante puede operar las líneas aunque no haya marcado «Recibido».
   Compatible con el puente de Supabase: solo where '>=' + orderBy sobre el mismo campo, runTransaction, set/update con claves planas.
   Cargar después de 48-resumen-turno.js y de 31-rotacion-supervisores.js.
   ========================================================= */
(function(){
  'use strict';

  const COLECCION='entregasTurno';
  const TURNOS=['DIA','INTERMEDIO','NOCHE'];
  const ETQ={DIA:'DÍA',INTERMEDIO:'INTERMEDIO',NOCHE:'NOCHE'};
  const SIGUIENTE={DIA:'INTERMEDIO',INTERMEDIO:'NOCHE',NOCHE:'DIA'};
  const LINEAS_NOV=['GENERAL','PET1','PET2','B7L','C20L','B20L'];
  const MAX_NOVEDADES=30,MAX_TEXTO=500,MAX_OBS=300,MAX_ACTUALIZACIONES=20;
  const DIAS_HISTORIAL=30,LIMITE_LISTA=90,DIAS_PENDIENTE=2;
  const ROLES_OPERAN=['Administrador','Jefe de Producción','Jefe de Operaciones','Supervisor','Supervisor de Producción'];

  /* ---------- utilidades ---------- */
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t==null?'':t).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ahoraMs=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const fmt=n=>Math.round(num(n)).toLocaleString('es-PE');
  const fmtPct=v=>v==null?'—':Number(v).toFixed(1)+' %';
  const hhmm=ms=>Number(ms)>0?new Date(Number(ms)).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const isoDe=ms=>iso(new Date(ms));
  const fmtFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):String(f||'');
  const addDias=(f,n)=>{const [y,m,d]=String(f).split('-').map(Number);return iso(new Date(y,m-1,d+n));};
  const msDe=v=>!v?0:typeof v.toMillis==='function'?v.toMillis():(typeof v.seconds==='number'?v.seconds*1000:Number(v)||0);
  const claveTurno=t=>{const x=String(t||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');return x.includes('NOCHE')?'NOCHE':x.includes('INTER')?'INTERMEDIO':'DIA';};
  const idEntrega=(fecha,turno)=>fecha+'_'+claveTurno(turno);
  const ordenTurno=t=>TURNOS.indexOf(claveTurno(t));
  const chip=()=>window.glacialEstadoDatos?window.glacialEstadoDatos.chip():'';
  const sinConexion=()=>!!(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false);
  const usuario=()=>(typeof state!=='undefined'&&state.user)||null;
  const quien=()=>{
    let uid='';try{uid=(firebase.auth().currentUser||{}).uid||'';}catch(_){/* sin sesión segura */}
    const u=usuario()||{};
    return {uid,username:u.username||'',nombre:u.nombre||u.username||''};
  };
  const nombreLinea=k=>{if(k==='GENERAL')return 'General';try{const l=(typeof LINES!=='undefined'?LINES:[]).find(x=>x.key===k);return l?l.name:k;}catch(_){return k;}};

  /* ---------- permisos (los mismos criterios que puedeOperarProduccion de las reglas) ---------- */
  function noCompartida(u){
    try{return !(typeof esMantCompartido==='function'&&esMantCompartido(u));}catch(_){return true;}
  }
  function puedeOperar(){
    const u=usuario();
    if(!u||!noCompartida(u))return false;
    try{
      if(window.glacialVista&&window.glacialVista.activo())return false;
      if(typeof esUsuarioSoloConsulta==='function'&&esUsuarioSoloConsulta(u))return false;
      if(ROLES_OPERAN.includes(String(u.rol||'').trim()))return true;
      return typeof tienePermiso==='function'&&!!tienePermiso('paletas');
    }catch(_){return false;}
  }
  function puedeVer(){
    const u=usuario();
    if(!u||!noCompartida(u))return false;
    if(window.glacialVista&&window.glacialVista.activo())return window.glacialVista.puedeModulo('entrega_turno');
    return true;                                          // leen todos los usuarios con sesión, salvo la cuenta compartida de Mantenimiento
  }
  const esMia=doc=>!!doc&&!!doc.entregaUid&&doc.entregaUid===quien().uid;

  /* ---------- datos de una entrega (foto del bloque) ---------- */
  const canonBloque=turno=>claveTurno(turno)==='NOCHE'?'NOCHE':'DIA';   // DÍA e INTERMEDIO comparten programación y producción
  async function armarResumen(fecha,turno){
    const R=window.glacialResumenTurno;
    if(!R||typeof R.construirDatos!=='function')throw new Error('Falta el módulo de resumen de turno.');
    const d=await R.construirDatos(fecha,canonBloque(turno));
    const sinMotivo=d.pendientes&&Array.isArray(d.pendientes.paradasSinMotivo)?d.pendientes.paradasSinMotivo:null;
    const lineas=(d.lineas||[]).map(l=>({
      linea:l.linea,nombre:l.nombre||nombreLinea(l.linea),estado:l.estado||'',
      programado:Math.round(num(l.programado)),producido:Math.round(num(l.producido)),
      cumplimiento:l.cumplimiento==null?null:l.cumplimiento,
      paradaAbierta:['DETENIDA','PAUSA','EN_PAUSA'].includes(String(l.estado||'')),
      motivosPendientes:sinMotivo?sinMotivo.filter(p=>p.linea===l.linea).length:null
    }));
    return {generadoMs:ahoraMs(),
      totales:{programado:num(d.totales&&d.totales.programado),producido:num(d.totales&&d.totales.producido),
        cumplimiento:d.totales&&d.totales.cumplimiento!=null?d.totales.cumplimiento:null},
      lineas,motivosPendientes:sinMotivo?sinMotivo.length:null};
  }
  /* Limpia las novedades escritas: sin vacías, línea válida, texto acotado, id único. */
  function limpiarNovedades(lista){
    const sal=[],usados=new Set();
    (Array.isArray(lista)?lista:[]).forEach(n=>{
      const texto=String(n&&n.texto||'').trim().slice(0,MAX_TEXTO);
      if(!texto)return;
      const linea=LINEAS_NOV.includes(n.linea)?n.linea:'GENERAL';
      let id=String(n.id||'');
      if(!id||usados.has(id))id=nuevoId();
      usados.add(id);sal.push({id,linea,texto});
    });
    return sal;
  }
  let secuencia=0;
  const nuevoId=()=>'n'+ahoraMs().toString(36)+(++secuencia).toString(36)+Math.random().toString(36).slice(2,6);

  /* ---------- sugerencia del entrante según la rotación de supervisores (no impide que reciba otro) ---------- */
  function sugerirEntrante(fecha,turno,excluirUsername){
    try{
      if(typeof rotSupBuscarSemanaPorFecha!=='function'||typeof rotSupAsignacionFecha!=='function')return '';
      const t=claveTurno(turno),entra=SIGUIENTE[t],fechaEnt=t==='NOCHE'?addDias(fecha,1):fecha;
      const rot=rotSupBuscarSemanaPorFecha(fechaEnt,true);
      if(!rot)return '';
      return (rot.detalles||[])
        .filter(d=>d&&d.username&&d.username!==excluirUsername)
        .filter(d=>{const a=rotSupAsignacionFecha(rot,d.username,fechaEnt);return a&&claveTurno(a.turno)===entra&&['DÍA','INTERMEDIO','NOCHE'].includes(a.turno);})
        .map(d=>d.nombre||d.username).join(' / ');
    }catch(_){return '';}
  }

  /* =========================================================
     ESCRITURAS (transacciones)
     ========================================================= */
  function refDe(id){return db.collection(COLECCION).doc(id);}
  const ts=()=>firebase.firestore.FieldValue.serverTimestamp();

  async function entregar(fecha,turno,resumen,novedades){
    if(!puedeOperar())throw new Error('No tienes permiso para entregar el turno.');
    if(sinConexion())throw new Error('Sin conexión: la entrega NO se guardó.');
    const t=claveTurno(turno);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha||'')))throw new Error('Fecha no válida.');
    if(!resumen)throw new Error('El resumen del turno todavía no está listo.');
    const nov=limpiarNovedades(novedades);
    if(nov.length>MAX_NOVEDADES)throw new Error('Demasiadas novedades (máximo '+MAX_NOVEDADES+').');
    const q=quien();
    if(!q.uid)throw new Error('No hay una sesión segura activa.');
    const ref=refDe(idEntrega(fecha,t));
    return db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      if(s.exists)return {creado:false,existente:s.data()};
      tx.set(ref,{fecha,turno:t,estado:'ENTREGADA',resumen,novedades:nov,
        entregaUid:q.uid,entregaPor:q.username,entregaNombre:q.nombre,entregadaEn:ts()});
      return {creado:true};
    });
  }

  /* Corrige resumen y novedades mientras siga ENTREGADA y sea de quien la entregó. resumenNuevo=null conserva la foto. */
  async function corregir(id,novedades,resumenNuevo){
    if(!puedeOperar())throw new Error('No tienes permiso para corregir la entrega.');
    if(sinConexion())throw new Error('Sin conexión: los cambios NO se guardaron.');
    const nov=limpiarNovedades(novedades);
    if(nov.length>MAX_NOVEDADES)throw new Error('Demasiadas novedades (máximo '+MAX_NOVEDADES+').');
    const q=quien(),ref=refDe(id);
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      if(!s.exists)throw new Error('La entrega ya no existe.');
      const x=s.data();
      if(x.estado!=='ENTREGADA')throw new Error('La entrega ya fue recibida: ya no se puede editar.');
      if(x.entregaUid!==q.uid)throw new Error('Solo quien entregó el turno puede corregirlo.');
      const previo=Array.isArray(x.actualizaciones)?x.actualizaciones:[];
      const cambios={novedades:nov,actualizadaEn:ts(),actualizaciones:previo.concat([{por:q.username,en:ahoraMs()}]).slice(-MAX_ACTUALIZACIONES)};
      if(resumenNuevo)cambios.resumen=resumenNuevo;
      tx.update(ref,cambios);
    });
  }

  /* Recibir: otro usuario distinto del que entregó. Escribe solo los campos de recepción. */
  async function recibir(id,observacion){
    if(!puedeOperar())throw new Error('No tienes permiso para recibir el turno.');
    if(sinConexion())throw new Error('Sin conexión: la recepción NO se guardó.');
    const q=quien(),ref=refDe(id);
    if(!q.uid)throw new Error('No hay una sesión segura activa.');
    const obs=String(observacion||'').trim().slice(0,MAX_OBS);
    return db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      if(!s.exists)throw new Error('La entrega ya no existe.');
      const x=s.data();
      if(x.estado==='RECIBIDA')return {recibida:false,yaRecibida:true,por:x.recibeNombre||x.recibePor||''};
      if(x.entregaUid===q.uid)throw new Error('No puedes recibir tu propia entrega.');
      const cambios={estado:'RECIBIDA',recibeUid:q.uid,recibePor:q.username,recibeNombre:q.nombre,recibidaEn:ts()};
      if(obs)cambios.observacionRecibe=obs;
      tx.update(ref,cambios);
      return {recibida:true};
    });
  }

  /* =========================================================
     LECTURA EN VIVO (la lista alimenta la pantalla, el historial y la tarjeta del Inicio)
     ========================================================= */
  const S={docs:[],listo:false,error:'',desub:null,reintento:null,vistos:null,
    vista:'lista',abierto:null,form:null,cargandoResumen:false,guardando:false,msg:''};

  function docDeFirestore(id,x){
    return {id,fecha:x.fecha||'',turno:claveTurno(x.turno),estado:x.estado||'ENTREGADA',resumen:x.resumen||null,
      novedades:Array.isArray(x.novedades)?x.novedades:[],
      entregaUid:x.entregaUid||'',entregaPor:x.entregaPor||'',entregaNombre:x.entregaNombre||x.entregaPor||'',entregadaEnMs:msDe(x.entregadaEn),
      actualizadaEnMs:msDe(x.actualizadaEn),actualizaciones:Array.isArray(x.actualizaciones)?x.actualizaciones:[],
      recibeUid:x.recibeUid||'',recibePor:x.recibePor||'',recibeNombre:x.recibeNombre||x.recibePor||'',recibidaEnMs:msDe(x.recibidaEn),
      observacionRecibe:x.observacionRecibe||''};
  }
  const ordenar=l=>l.sort((a,b)=>b.fecha.localeCompare(a.fecha)||ordenTurno(b.turno)-ordenTurno(a.turno));

  function escuchar(){
    if(S.desub||typeof db==='undefined'||!usuario()||!puedeVer())return;
    try{
      const desde=addDias(iso(new Date(ahoraMs())),-DIAS_HISTORIAL);
      S.desub=db.collection(COLECCION).where('fecha','>=',desde).orderBy('fecha','desc').limit(LIMITE_LISTA).onSnapshot(snap=>{
        S.docs=ordenar(snap.docs.map(d=>docDeFirestore(d.id,d.data({serverTimestamps:'estimate'}))));
        S.listo=true;S.error='';alActualizar();
      },e=>{S.error='No se pudieron cargar las entregas: '+((e&&e.message)||e);S.listo=true;S.desub=null;alActualizar();});
    }catch(e){S.error=String((e&&e.message)||e);S.desub=null;}
  }
  function detener(){
    if(typeof S.desub==='function'){try{S.desub();}catch(_){/* ya cerrada */}}
    S.desub=null;S.docs=[];S.listo=false;S.vistos=null;
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(detener);
  S.reintento=setInterval(()=>{if(!S.desub&&usuario())escuchar();},4000);

  /* Pendientes para quien opera Producción y no es quien entregó (solo las recientes: una entrega muy antigua no se queda para siempre). */
  function pendientesPara(uid,hoyIso){
    const limite=addDias(hoyIso,-DIAS_PENDIENTE);
    return S.docs.filter(d=>d.estado==='ENTREGADA'&&d.entregaUid!==uid&&d.fecha>=limite);
  }
  const docPorId=id=>S.docs.find(d=>d.id===id)||null;

  function alActualizar(){
    try{
      const p=puedeOperar()?pendientesPara(quien().uid,isoDe(ahoraMs())):[];
      const ids=new Set(p.map(d=>d.id));
      if(S.vistos){
        const nuevas=p.filter(d=>!S.vistos.has(d.id));
        if(nuevas.length&&!(state.currentTab==='centro-perfil'&&document.getElementById('et-pendiente'))&&state.currentTab!=='entrega-turno')avisoNueva(nuevas[0]);
      }
      S.vistos=ids;
      pintarTarjeta();
      if(typeof state!=='undefined'&&state.currentTab==='entrega-turno'&&document.getElementById('entrega-turno-view'))render();
    }catch(e){console.warn('Entrega de turno:',e&&e.message||e);}
  }

  /* =========================================================
     ESTILOS Y VENTANAS PROPIAS (sin alert / confirm / prompt)
     ========================================================= */
  function estilos(){
    if(document.getElementById('et-css'))return;
    const s=document.createElement('style');s.id='et-css';
    s.textContent=`
      .et-card{border:1px solid #f0c36a;border-left:6px solid #df8b00;border-radius:12px;background:#fffbea;padding:12px 14px;margin:10px 0}
      .et-card h4{margin:0 0 4px;font-size:15px;color:#10265f}.et-card small,.et-nota{color:#5a6b7b;font-size:12px}
      .et-nov{margin:6px 0 0;padding-left:18px;font-size:13px}.et-nov b{color:#10265f}
      .et-acciones{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
      .et-sec{margin:16px 0 6px;font-size:15px;color:#10265f}
      .et-chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700}
      .et-chip.ent{background:#fff3d6;color:#8a5a00}.et-chip.rec{background:#e3f6ea;color:#0e6b3b}
      .et-fila{display:grid;grid-template-columns:130px 1fr auto;gap:8px;margin:6px 0;align-items:center}
      .et-fila select,.et-fila input,.et-obs{width:100%;box-sizing:border-box;padding:8px;border:1px solid #c5d0db;border-radius:8px;font:inherit}
      .et-vacio{padding:14px;border:1px dashed #c5d0db;border-radius:10px;background:#f8fafc;color:#4a5b6b;font-size:13px}
      .et-error{padding:8px 12px;border-radius:8px;background:#fdecea;border:1px solid #f1aeb5;color:#8c1d18;margin:8px 0;font-size:13px}
      .et-ok{padding:8px 12px;border-radius:8px;background:#effbf4;border:1px solid #13814a;margin:8px 0;font-size:13px}
      .et-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-top:8px}
      .et-hist{border:1px solid #dfe4ea;border-left:6px solid #df8b00;border-radius:10px;padding:10px 14px;background:#fff;cursor:pointer}
      .et-hist.rec{border-left-color:#13814a}.et-hist h4{margin:0 0 4px;font-size:15px;color:#10265f}
      .et-modal-fondo{position:fixed;inset:0;background:rgba(10,20,40,.55);z-index:10060;display:flex;align-items:center;justify-content:center;padding:16px}
      .et-modal{background:#fff;border-radius:14px;max-width:420px;width:100%;padding:18px;box-shadow:0 14px 40px rgba(0,0,0,.3)}
      .et-modal h3{margin:0 0 8px;font-size:17px;color:#10265f}.et-modal p{margin:0 0 10px;font-size:14px}
      .et-toast{position:fixed;left:16px;right:16px;bottom:16px;max-width:380px;z-index:10050;padding:12px 14px;border-radius:10px;background:#fff3d6;border:1px solid #f0c36a;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:13px}
      @media (max-width:520px){.et-fila{grid-template-columns:1fr}.et-fila button{justify-self:end}}
    `;
    document.head.appendChild(s);
  }
  /* Ventana propia: devuelve {ok,texto}. campo = {etiqueta,max} para pedir un texto opcional. */
  function dialogo(o){
    return new Promise(resolver=>{
      estilos();
      const fondo=document.createElement('div');fondo.className='et-modal-fondo';
      fondo.innerHTML='<div class="et-modal" role="dialog" aria-modal="true" aria-label="'+esc(o.titulo)+'"><h3>'+esc(o.titulo)+'</h3>'+
        (o.mensaje?'<p>'+esc(o.mensaje)+'</p>':'')+
        (o.campo?'<label style="font-size:13px;font-weight:600">'+esc(o.campo.etiqueta)+'</label><textarea class="et-obs" rows="3" maxlength="'+(o.campo.max||MAX_OBS)+'"></textarea>':'')+
        '<div class="et-acciones" style="justify-content:flex-end">'+(o.cancelar===false?'':'<button type="button" class="btn btn-ghost btn-sm" data-et-d="no">'+esc(o.cancelar||'Cancelar')+'</button>')+
        '<button type="button" class="btn btn-primary btn-sm" data-et-d="si">'+esc(o.ok||'Aceptar')+'</button></div></div>';
      const cerrar=(ok)=>{const t=fondo.querySelector('textarea');const texto=t?t.value.trim():'';fondo.remove();resolver({ok,texto});};
      fondo.addEventListener('click',e=>{
        const b=e.target.closest('[data-et-d]');
        if(b)cerrar(b.dataset.etD==='si');
        else if(e.target===fondo&&o.cancelar!==false)cerrar(false);
      });
      document.body.appendChild(fondo);
      const t=fondo.querySelector('textarea');if(t)t.focus();
    });
  }
  const aviso=(titulo,mensaje)=>dialogo({titulo,mensaje,cancelar:false,ok:'Entendido'});

  function avisoNueva(d){
    try{
      estilos();document.getElementById('et-toast')?.remove();
      const t=document.createElement('div');t.id='et-toast';t.className='et-toast';t.setAttribute('role','status');
      t.innerHTML='<b>Entrega de turno pendiente</b><div>'+esc(d.entregaNombre)+' entregó el turno '+esc(ETQ[d.turno])+' ('+esc(fmtFecha(d.fecha))+').</div>'+
        '<div class="et-acciones"><button type="button" class="btn btn-primary btn-sm" data-et-ver="'+esc(d.id)+'">Ver</button> <button type="button" class="btn btn-ghost btn-sm" data-et-x>Cerrar</button></div>';
      document.body.appendChild(t);setTimeout(()=>t.remove(),30000);
    }catch(_){/* aviso informativo */}
  }

  /* =========================================================
     TARJETA «ENTREGA DE TURNO PENDIENTE» (Inicio)
     ========================================================= */
  function htmlNovedades(lista){
    return lista.length?'<ul class="et-nov">'+lista.map(n=>'<li><b>'+esc(nombreLinea(n.linea))+':</b> '+esc(n.texto)+'</li>').join('')+'</ul>':'<div class="et-nota">Sin novedades escritas.</div>';
  }
  function htmlTarjeta(pend){
    return pend.map(d=>{
      const sug=sugerirEntrante(d.fecha,d.turno,d.entregaPor);
      const r=d.resumen;
      return '<div class="et-card" data-et-card="'+esc(d.id)+'"><h4>Entrega de turno pendiente · '+esc(ETQ[d.turno])+' · '+esc(fmtFecha(d.fecha))+'</h4>'+
        '<div>Entrega: <b>'+esc(d.entregaNombre)+'</b> · '+esc(hhmm(d.entregadaEnMs))+'</div>'+
        (sug?'<small>Entrante según la rotación: '+esc(sug)+' (puede recibir cualquier supervisor)</small>':'')+
        (r&&r.totales?'<div class="et-nota">Cumplimiento '+fmtPct(r.totales.cumplimiento)+(r.motivosPendientes?' · '+r.motivosPendientes+' parada(s) con motivo pendiente':'')+'</div>':'')+
        htmlNovedades(d.novedades)+
        '<div class="et-acciones"><button type="button" class="btn btn-primary btn-sm" data-et-recibir="'+esc(d.id)+'">Recibido</button> '+
        '<button type="button" class="btn btn-ghost btn-sm" data-et-ver="'+esc(d.id)+'">Ver detalle</button></div></div>';
    }).join('');
  }
  function pintarTarjeta(){
    const m=document.getElementById('main');
    if(!m||state.currentTab!=='centro-perfil'||state.showWelcome)return;
    const pend=puedeOperar()?pendientesPara(quien().uid,isoDe(ahoraMs())):[];
    const previo=m.querySelector('#et-pendiente');
    if(!pend.length){if(previo)previo.remove();return;}
    estilos();
    const html='<section id="et-pendiente" aria-label="Entrega de turno pendiente">'+htmlTarjeta(pend)+'</section>';
    if(previo){previo.outerHTML=html;return;}
    const shell=m.querySelector('.cp-shell');
    if(!shell)return;
    const titulo=shell.querySelector('.cp-title-row');
    if(titulo)titulo.insertAdjacentHTML('afterend',html);
    else shell.insertAdjacentHTML('afterbegin',html);
  }
  if(typeof renderCentroPerfil==='function'){
    const anterior=renderCentroPerfil;
    renderCentroPerfil=function(){
      const r=anterior.apply(this,arguments);
      try{escuchar();pintarTarjeta();}catch(e){console.warn('Tarjeta «Entrega de turno pendiente»:',e&&e.message||e);}
      return r;
    };
    window.renderCentroPerfil=renderCentroPerfil;
  }

  /* Recibir desde la tarjeta o desde la pantalla. */
  async function recibirConDialogo(id){
    const d=docPorId(id);
    if(!d)return;
    const r=await dialogo({titulo:'Recibir el turno',mensaje:'Confirmas que recibes la entrega de '+d.entregaNombre+' ('+ETQ[d.turno]+', '+fmtFecha(d.fecha)+'). Quedará registrado quién y a qué hora.',
      campo:{etiqueta:'Observación (opcional)',max:MAX_OBS},ok:'Recibido'});
    if(!r.ok)return;
    try{
      const res=await recibir(id,r.texto);
      if(res&&res.yaRecibida)await aviso('Ya estaba recibida','Esta entrega ya fue recibida por '+(res.por||'otro usuario')+'.');
    }catch(e){await aviso('No se pudo registrar',(e&&e.message)||String(e));}
  }

  /* =========================================================
     PANTALLA «ENTREGA DE TURNO»
     ========================================================= */
  function turnoVigenteClave(){
    try{if(typeof window.glacialTurnoVigente==='function'){const t=window.glacialTurnoVigente();if(t&&t.fecha)return {fecha:t.fecha,turno:claveTurno(t.turno)};}}catch(_){/* sin turno */}
    const h=new Date(ahoraMs());return {fecha:iso(h),turno:'DIA'};
  }
  function iniciarFormulario(fecha,turno){
    S.form={fecha,turno,novedades:[],resumen:null,error:'',editandoId:null};
    calcularResumen();
  }
  async function calcularResumen(){
    const f=S.form;if(!f)return;
    S.cargandoResumen=true;render();
    try{const r=await armarResumen(f.fecha,f.turno);if(S.form===f)f.resumen=r;}
    catch(e){if(S.form===f)f.error=String((e&&e.message)||e);}
    S.cargandoResumen=false;render();
  }
  function cargarEdicion(d){
    S.form={fecha:d.fecha,turno:d.turno,novedades:d.novedades.map(n=>({id:n.id,linea:n.linea,texto:n.texto})),resumen:d.resumen,error:'',editandoId:d.id};
  }

  function htmlResumen(r){
    if(!r)return '<div class="et-vacio">'+(S.cargandoResumen?'Armando el resumen del turno…':'Sin resumen.')+'</div>';
    return '<div class="tareo-table-scroll"><table class="tareo-table"><thead><tr><th>Línea</th><th>Estado</th><th>Programado</th><th>Producido</th><th>Cumpl.</th><th>Parada abierta</th><th>Motivos pendientes</th></tr></thead><tbody>'+
      (r.lineas.length?r.lineas.map(l=>'<tr><td>'+esc(l.nombre)+'</td><td>'+esc(String(l.estado||'—').replace(/_/g,' '))+'</td><td>'+fmt(l.programado)+'</td><td>'+fmt(l.producido)+'</td><td>'+fmtPct(l.cumplimiento)+
        '</td><td>'+(l.paradaAbierta?'Sí':'No')+'</td><td>'+(l.motivosPendientes==null?'—':l.motivosPendientes)+'</td></tr>').join('')
        :'<tr><td colspan="7" class="small-muted">Sin líneas con inicio real en este bloque.</td></tr>')+
      '<tr><td><b>Total</b></td><td></td><td><b>'+fmt(r.totales.programado)+'</b></td><td><b>'+fmt(r.totales.producido)+'</b></td><td><b>'+fmtPct(r.totales.cumplimiento)+'</b></td><td></td><td><b>'+(r.motivosPendientes==null?'—':r.motivosPendientes)+'</b></td></tr></tbody></table></div>'+
      '<div class="et-nota">Foto tomada a las '+esc(hhmm(r.generadoMs))+' · '+(r.motivosPendientes==null?'no se pudieron consultar los motivos pendientes':'datos del semáforo y de la bitácora')+'</div>';
  }
  function htmlEditorNovedades(f){
    const filas=f.novedades.map((n,i)=>'<div class="et-fila"><select data-et-n="'+i+'" data-et-campo="linea" aria-label="Línea">'+
      LINEAS_NOV.map(k=>'<option value="'+k+'"'+(n.linea===k?' selected':'')+'>'+esc(nombreLinea(k))+'</option>').join('')+'</select>'+
      '<input type="text" data-et-n="'+i+'" data-et-campo="texto" maxlength="'+MAX_TEXTO+'" value="'+esc(n.texto)+'" placeholder="Qué se entrega o queda pendiente" aria-label="Novedad">'+
      '<button type="button" class="btn btn-ghost btn-sm" data-et-quitar="'+i+'" aria-label="Quitar novedad">Quitar</button></div>').join('');
    return (filas||'<div class="et-nota">Aún no hay novedades. Agrega una por línea o una general.</div>')+
      (f.novedades.length<MAX_NOVEDADES?'<div class="et-acciones"><button type="button" class="btn btn-ghost btn-sm" data-et-agregar>+ Agregar novedad</button></div>':'');
  }
  function htmlEstado(d){
    const rec=d.estado==='RECIBIDA';
    return '<p><span class="et-chip '+(rec?'rec':'ent')+'">'+(rec?'RECIBIDA':'ENTREGADA')+'</span> Entregó <b>'+esc(d.entregaNombre)+'</b> a las '+esc(hhmm(d.entregadaEnMs))+
      (d.actualizadaEnMs?' · corregida a las '+esc(hhmm(d.actualizadaEnMs)):'')+'</p>'+
      (rec?'<p>Recibió <b>'+esc(d.recibeNombre)+'</b> a las '+esc(hhmm(d.recibidaEnMs))+(d.observacionRecibe?'<br><span class="et-nota">Observación: '+esc(d.observacionRecibe)+'</span>':'')+'</p>'
        :'<p class="et-nota">Esperando que otro supervisor la reciba.'+(sugerirEntrante(d.fecha,d.turno,d.entregaPor)?' Según la rotación: '+esc(sugerirEntrante(d.fecha,d.turno,d.entregaPor))+'.':'')+'</p>');
  }
  function htmlHistorial(){
    if(S.error)return '<div class="et-error">'+esc(S.error)+'</div>';
    if(!S.listo)return '<div class="et-vacio">Cargando entregas…</div>';
    if(!S.docs.length)return '<div class="et-vacio"><b>Todavía no hay entregas de turno.</b><br>Aparecerán aquí cuando un supervisor entregue su turno.</div>';
    const porFecha=new Map();
    S.docs.forEach(d=>{const l=porFecha.get(d.fecha)||[];l.push(d);porFecha.set(d.fecha,l);});
    return [...porFecha.entries()].map(([f,l])=>'<h4 class="et-sec">'+esc(fmtFecha(f))+'</h4><div class="et-grid">'+l.map(d=>
      '<div class="et-hist '+(d.estado==='RECIBIDA'?'rec':'')+'" data-et-abrir="'+esc(d.id)+'" role="button" tabindex="0"><h4>'+esc(ETQ[d.turno])+' · '+(d.estado==='RECIBIDA'?'Recibida':'Entregada')+'</h4>'+
      '<div>Entregó <b>'+esc(d.entregaNombre)+'</b> · '+esc(hhmm(d.entregadaEnMs))+'</div>'+
      '<small>'+(d.estado==='RECIBIDA'?'Recibió '+esc(d.recibeNombre)+' · '+esc(hhmm(d.recibidaEnMs)):'Pendiente de recibir')+' · '+d.novedades.length+' novedad(es)</small></div>').join('')+'</div>').join('');
  }

  function render(){
    const main=document.getElementById('main');
    if(!main)return;
    if(!puedeVer()){main.innerHTML='<div class="empty-state"><h4>Acceso no autorizado</h4></div>';return;}
    estilos();escuchar();
    const activo=document.activeElement,clave=activo&&activo.dataset&&activo.dataset.etN!=null?[activo.dataset.etN,activo.dataset.etCampo,activo.selectionStart]:null;
    const opera=puedeOperar();
    if(!S.form&&opera){const t=turnoVigenteClave();iniciarFormulario(t.fecha,t.turno);return;}
    const f=S.form||{fecha:turnoVigenteClave().fecha,turno:turnoVigenteClave().turno,novedades:[],resumen:null,error:''};
    const id=idEntrega(f.fecha,f.turno),doc=docPorId(id);
    const hoy=isoDe(ahoraMs());
    let cuerpo='';
    cuerpo+='<div class="et-acciones" style="align-items:flex-end"><div class="field-sm"><label>Turno que se entrega</label><select id="et-turno">'+
      TURNOS.map(t=>'<option value="'+t+'"'+(f.turno===t?' selected':'')+'>'+ETQ[t]+' → '+ETQ[SIGUIENTE[t]]+'</option>').join('')+'</select></div>'+
      '<div class="field-sm"><label>Fecha operativa</label><input type="date" id="et-fecha" value="'+esc(f.fecha)+'" max="'+esc(hoy)+'"></div></div>';
    if(S.msg)cuerpo+='<div class="et-ok">'+esc(S.msg)+'</div>';
    if(f.error)cuerpo+='<div class="et-error">'+esc(f.error)+'</div>';
    if(doc){
      cuerpo+=htmlEstado(doc);
      const editable=doc.estado==='ENTREGADA'&&esMia(doc)&&opera;
      if(editable){
        if(!S.form||S.form.editandoId!==doc.id)cargarEdicion(doc);
        const g=S.form;
        cuerpo+='<h3 class="et-sec">Resumen del turno</h3>'+htmlResumen(g.resumen)+
          '<h3 class="et-sec">Novedades por línea</h3>'+htmlEditorNovedades(g)+
          '<div class="et-acciones"><button type="button" class="btn btn-primary btn-sm" data-et-guardar'+(S.guardando?' disabled':'')+'>Guardar cambios</button> '+
          '<button type="button" class="btn btn-ghost btn-sm" data-et-refoto'+(S.guardando||S.cargandoResumen?' disabled':'')+'>Actualizar la foto del resumen</button></div>'+
          '<div class="et-nota">Puedes corregir mientras nadie la haya recibido.</div>';
      }else{
        cuerpo+='<h3 class="et-sec">Resumen del turno</h3>'+htmlResumen(doc.resumen)+'<h3 class="et-sec">Novedades por línea</h3>'+htmlNovedades(doc.novedades);
        if(doc.estado==='ENTREGADA'&&!esMia(doc)&&opera)cuerpo+='<div class="et-acciones"><button type="button" class="btn btn-primary btn-sm" data-et-recibir="'+esc(doc.id)+'">Recibido</button></div>';
      }
    }else if(opera){
      if(S.form&&S.form.editandoId)S.form.editandoId=null;
      const sug=sugerirEntrante(f.fecha,f.turno,quien().username);
      cuerpo+='<h3 class="et-sec">Resumen del turno</h3>'+htmlResumen(f.resumen)+
        '<h3 class="et-sec">Novedades por línea</h3>'+htmlEditorNovedades(f)+
        (sug?'<div class="et-nota">Entrante según la rotación: '+esc(sug)+' (puede recibir cualquier supervisor).</div>':'')+
        '<div class="et-acciones"><button type="button" class="btn btn-primary" data-et-entregar'+(S.guardando||!f.resumen||S.cargandoResumen?' disabled':'')+'>Entregar turno</button> '+
        '<button type="button" class="btn btn-ghost btn-sm" data-et-refoto'+(S.guardando||S.cargandoResumen?' disabled':'')+'>Actualizar la foto del resumen</button></div>';
    }else{
      cuerpo+='<div class="et-vacio">Todavía no se entregó este turno.</div>';
    }
    cuerpo+='<h3 class="et-sec">Historial</h3>'+htmlHistorial();
    main.innerHTML='<div class="main-head" id="entrega-turno-view"><div><h2>Entrega de turno</h2><div class="sub">'+(opera?'Entrega escrita entre supervisores':'Modo consulta')+' · '+chip()+'</div></div></div>'+
      '<div class="panel"><div class="panel-body">'+cuerpo+'</div></div>';
    if(clave){
      const el=main.querySelector('[data-et-n="'+clave[0]+'"][data-et-campo="'+clave[1]+'"]');
      if(el){el.focus();try{el.setSelectionRange(clave[2],clave[2]);}catch(_){/* select no admite selección */}}
    }
  }

  /* ---------- eventos ---------- */
  document.addEventListener('input',e=>{
    const el=e.target;
    if(!el||!el.dataset||el.dataset.etN==null||!S.form)return;
    const n=S.form.novedades[Number(el.dataset.etN)];
    if(n&&el.dataset.etCampo==='texto')n.texto=el.value;
  });
  document.addEventListener('change',e=>{
    const el=e.target;
    if(!el||!document.getElementById('entrega-turno-view'))return;
    if(el.dataset&&el.dataset.etN!=null&&S.form){const n=S.form.novedades[Number(el.dataset.etN)];if(n&&el.dataset.etCampo==='linea')n.linea=el.value;return;}
    if(el.id==='et-turno'||el.id==='et-fecha'){
      const turno=el.id==='et-turno'?el.value:S.form.turno,fecha=el.id==='et-fecha'?(el.value||S.form.fecha):S.form.fecha;
      S.msg='';
      if(puedeOperar())iniciarFormulario(fecha,turno);else{S.form={fecha,turno,novedades:[],resumen:null,error:'',editandoId:null};render();}
    }
  });
  document.addEventListener('click',async e=>{
    const t=e.target;if(!t||!t.closest)return;
    if(t.closest('[data-et-x]')){document.getElementById('et-toast')?.remove();return;}
    const ver=t.closest('[data-et-ver]')?.dataset.etVer;
    if(ver){document.getElementById('et-toast')?.remove();abrir(ver);return;}
    const rec=t.closest('[data-et-recibir]')?.dataset.etRecibir;
    if(rec){await recibirConDialogo(rec);return;}
    if(!document.getElementById('entrega-turno-view'))return;
    const ab=t.closest('[data-et-abrir]')?.dataset.etAbrir;
    if(ab){abrir(ab);return;}
    if(t.closest('[data-et-agregar]')&&S.form){S.form.novedades.push({id:nuevoId(),linea:'GENERAL',texto:''});render();return;}
    const q=t.closest('[data-et-quitar]')?.dataset.etQuitar;
    if(q!=null&&S.form){S.form.novedades.splice(Number(q),1);render();return;}
    if(t.closest('[data-et-refoto]')&&S.form){
      const f=S.form;S.cargandoResumen=true;render();
      try{const r=await armarResumen(f.fecha,f.turno);if(S.form===f)f.resumen=r;}catch(err){f.error=String((err&&err.message)||err);}
      S.cargandoResumen=false;render();return;
    }
    if(t.closest('[data-et-entregar]')&&S.form&&!S.guardando){
      const f=S.form;f.error='';S.msg='';
      const sin=limpiarNovedades(f.novedades).length===0;
      const c=await dialogo({titulo:'Entregar el turno '+ETQ[f.turno],mensaje:sin?'No escribiste novedades. ¿Entregar el turno sin novedades?':'Se enviará ahora al supervisor entrante. Podrás corregirla mientras nadie la reciba.',ok:'Entregar turno'});
      if(!c.ok)return;
      S.guardando=true;render();
      try{
        const r=await entregar(f.fecha,f.turno,f.resumen,f.novedades);
        S.msg=r.creado?'Turno entregado. El supervisor entrante lo verá en su Inicio.':'Este turno ya había sido entregado por '+(r.existente&&r.existente.entregaNombre||'otro usuario')+'.';
        S.form=null;
      }catch(err){f.error=String((err&&err.message)||err);}
      S.guardando=false;render();return;
    }
    if(t.closest('[data-et-guardar]')&&S.form&&!S.guardando){
      const f=S.form;f.error='';S.msg='';S.guardando=true;render();
      try{await corregir(f.editandoId,f.novedades,f.resumen);S.msg='Cambios guardados.';S.form=null;}
      catch(err){f.error=String((err&&err.message)||err);}
      S.guardando=false;render();
    }
  });
  function abrir(id){
    const d=docPorId(id);
    if(!d)return;
    S.msg='';S.form=null;
    if(typeof window.entregaTurnoAbrir==='function')window.entregaTurnoAbrir();
    if(puedeOperar()&&d.estado==='ENTREGADA'&&esMia(d))cargarEdicion(d);
    else S.form={fecha:d.fecha,turno:d.turno,novedades:[],resumen:null,error:'',editandoId:null};
    render();
  }

  /* ---------- navegación ---------- */
  window.entregaTurnoAbrir=function(){
    if(!puedeVer()){aviso('Sin acceso','No tienes permiso para ver la entrega de turno.');return;}
    if(typeof confirmarAbandonoRotacionPendiente==='function'&&!confirmarAbandonoRotacionPendiente())return;
    S.msg='';S.form=null;
    state.currentTab='entrega-turno';
    if(typeof renderSidebar==='function')renderSidebar();
    if(typeof renderMain==='function')renderMain();
  };
  window.goEntregaTurno=()=>window.entregaTurnoAbrir();

  if(typeof ajustarVistaSegunPermisos==='function'){
    const anterior=ajustarVistaSegunPermisos;
    ajustarVistaSegunPermisos=function(){
      if(state.currentTab==='entrega-turno'&&puedeVer())return;
      return anterior.apply(this,arguments);
    };
  }
  if(typeof renderMain==='function'){
    const anterior=renderMain;
    renderMain=function(){
      if(state.currentTab==='entrega-turno'&&!state.showWelcome&&puedeVer()){render();return;}
      return anterior.apply(this,arguments);
    };
  }
  if(typeof grupoSidebarActivo==='function'){
    const anterior=grupoSidebarActivo;
    grupoSidebarActivo=function(){return state.currentTab==='entrega-turno'?'produccion':anterior.apply(this,arguments);};
  }
  if(typeof renderSidebar==='function'){
    const anterior=renderSidebar;
    renderSidebar=function(){
      const r=anterior.apply(this,arguments);
      const b=document.getElementById('btn-entrega-turno');
      if(b){
        const mostrar=!!usuario()&&puedeVer();
        b.hidden=!mostrar;b.style.display=mostrar?'':'none';
        const activo=mostrar&&state.currentTab==='entrega-turno';
        b.classList.toggle('active',activo);
        if(activo)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
        if(typeof actualizarGruposSidebar==='function')actualizarGruposSidebar();
        escuchar();
      }
      return r;
    };
  }
  if(typeof handleLogout==='function'){
    const anterior=handleLogout;
    handleLogout=function(){const r=anterior.apply(this,arguments);detener();S.form=null;return r;};
  }

  window.glacialEntregaTurno={COLECCION,TURNOS,SIGUIENTE,LINEAS_NOV,MAX_NOVEDADES,MAX_TEXTO,idEntrega,claveTurno,armarResumen,limpiarNovedades,sugerirEntrante,
    entregar,corregir,recibir,puedeOperar,puedeVer,pendientesPara,escuchar,detener,estado:()=>S,render};
})();
