/* =============================================================
   GLACIAL · SUPERVISOR EN TURNO (quién está en cada área)
   -------------------------------------------------------------
   Cada supervisor, al entrar a su turno, indica en qué área está:
     · AGUA  (abarca PET1, PET2, B7L, Cajas 20L y B20L)
     · HIELO (hielo en cubos, premium y vasos)
   Una barra en todos los módulos muestra solo los NOMBRES: «Agua: Ana · Hielo: Luis».
   Datos: un documento por fecha operativa y bloque (Día incluye Intermedio; Noche aparte) en la colección que ya existe
   «distribucionPersonal» (id «supervisores_AAAA-MM-DD_DIA|NOCHE»); no hay colección nueva ni cambios en el servidor: usa las mismas
   reglas (versión +1, hora del servidor, permiso «distribuirPersonal», que el Supervisor tiene por defecto). Lo leen todos con sesión.
   Cada supervisor escribe solo su propia entrada (clave = su uid); una persona que cambia de área reemplaza la suya.
   SOLO QUIEN ESTÁ EN PLANTA (26/11/2026): antes la barra acumulaba a todos los que eligieron área en el bloque (Día + Intermedio, 07:00–19:00)
   aunque ya se hubieran ido. Ahora:
     · cada entrada vence sola al terminar SU turno (hastaMs = cierre de su ventana de 17b; sin rotación, 8 h desde que entró) y guarda su
       turno real (Día / Intermedio / Noche);
     · solo se pregunta el área (y solo se suma a la barra) a quien está en «Trabajar» y DENTRO de su horario; fuera de horario o en «Visualizar», no;
     · «Salir del turno» quita el nombre al momento en todas las pantallas;
     · se lee también el bloque anterior, para que el Intermedio (15–23) siga visible después de las 19:00 hasta su hora de salida.
   ============================================================= */
(function instalarSupervisorEnTurno(){
  'use strict';
  const AREAS={
    AGUA:{nombre:'Agua',detalle:'PET1, PET2, B7L, Cajas 20L y B20L'},
    HIELO:{nombre:'Hielo',detalle:'Hielo en cubos, premium y vasos'}
  };
  const ORDEN=['AGUA','HIELO'];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const bloqueDe=t=>String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DIA';
  const clave=(fecha,bloque)=>'supervisores_'+String(fecha)+'_'+bloqueDe(bloque);
  const DURACION_SIN_HORARIO_MS=8*3600000;      // sin rotación (o entradas anteriores sin hastaMs): vence 8 h después de entrar

  /* ---------- núcleo puro ---------- */
  /* Entrada de un supervisor sobre el documento anterior (o null) → mapa nuevo de supervisores. Una entrada por uid. */
  function aplicar(prev,e){
    if(!e||!String(e.uid||'').trim())throw new Error('Falta el usuario.');
    if(!AREAS[e.area])throw new Error('El área debe ser Agua o Hielo.');
    const nombre=String(e.nombre||'').trim();
    if(!nombre)throw new Error('Falta el nombre del supervisor.');
    const sup=Object.assign({},prev&&prev.supervisores&&typeof prev.supervisores==='object'?prev.supervisores:{});
    const desdeMs=num(e.desdeMs),hastaMs=num(e.hastaMs)>desdeMs?num(e.hastaMs):desdeMs+DURACION_SIN_HORARIO_MS;
    sup[e.uid]={uid:String(e.uid),nombre:nombre.slice(0,80),area:e.area,turno:String(e.turno||''),desdeMs,hastaMs};
    return {supervisores:sup};
  }
  /* «Salir del turno»: la entrada queda con salioMs (deja de mostrarse al momento). */
  function salir(prev,uid,ms){
    const sup=Object.assign({},prev&&prev.supervisores&&typeof prev.supervisores==='object'?prev.supervisores:{});
    if(!sup[uid])return {supervisores:sup};
    sup[uid]=Object.assign({},sup[uid],{salioMs:num(ms)});
    return {supervisores:sup};
  }
  /* ¿Sigue en planta a esta hora? Sin hora (ahoraMs) no se filtra (compatibilidad). */
  function vigente(x,ahoraMs){
    if(!x)return false;
    if(ahoraMs===undefined||ahoraMs===null)return true;
    if(num(x.salioMs)&&num(x.salioMs)<=ahoraMs)return false;
    const hasta=num(x.hastaMs)||(num(x.desdeMs)+DURACION_SIN_HORARIO_MS);
    return ahoraMs<hasta&&ahoraMs>=num(x.desdeMs)-60000;      // (con 1 min de margen por diferencias de reloj)
  }
  /* Nombres por área (sin repetir, por hora de ingreso). Área sin nadie = lista vacía. */
  function porArea(doc,ahoraMs,docAnterior){
    const r={AGUA:[],HIELO:[]};
    // Bloque anterior + actual (el actual manda si la misma persona está en los dos).
    const todas=Object.assign({},(docAnterior&&docAnterior.supervisores)||{},(doc&&doc.supervisores)||{});
    const lista=Object.values(todas).filter(x=>x&&AREAS[x.area]&&vigente(x,ahoraMs)).sort((a,b)=>num(a.desdeMs)-num(b.desdeMs));
    lista.forEach(x=>{if(!r[x.area].includes(x.nombre))r[x.area].push(x.nombre);});
    return r;
  }
  const propia=(doc,uid,ahoraMs)=>{const x=((doc&&doc.supervisores)||{})[uid]||null;return x&&vigente(x,ahoraMs)?x:null;};
  /* Bloque anterior al de (fecha, bloque): el anterior a la Noche es el Día de la misma fecha; el anterior al Día es la Noche del día previo. */
  function anterior(fecha,bloque){
    if(bloqueDe(bloque)==='NOCHE')return {fecha,bloque:'DIA'};
    const [y,m,d]=String(fecha).split('-').map(Number),x=new Date(Date.UTC(y,m-1,d-1));      // día calendario previo (sin zona horaria)
    return {fecha:x.getUTCFullYear()+'-'+String(x.getUTCMonth()+1).padStart(2,'0')+'-'+String(x.getUTCDate()).padStart(2,'0'),bloque:'NOCHE'};
  }
  /* Estado de la ventana del supervisor (17b) → ¿está en planta y hasta cuándo? Sin rotación: sí, sin hora de salida conocida. */
  function enHorario(st){
    if(!st||st.aplica===false||st.estado==='NO_APLICA'||st.estado==='SIN_HORARIO'||st.estado==='CARGANDO')return {dentro:true,turno:'',hastaMs:0};
    if(st.ventana&&['ABIERTA','ANTICIPADA','TOLERANCIA','AMPLIADA'].includes(st.estado))return {dentro:true,turno:st.ventana.turno||'',hastaMs:num(st.ventana.cierreMs)||num(st.ventana.finMs)};
    return {dentro:false,turno:'',hastaMs:0};      // ANTES, CERRADA, SIN_TURNO (aunque el cierre automático esté desactivado)
  }

  const N={AREAS,ORDEN,clave,bloqueDe,aplicar,salir,vigente,porArea,propia,anterior,enHorario,DURACION_SIN_HORARIO_MS};
  if(typeof module!=='undefined'&&module.exports)module.exports=N;
  if(typeof window==='undefined'||typeof document==='undefined')return;

  /* ---------- contexto (fecha operativa y bloque) ---------- */
  const ahora=()=>{try{if(typeof window.tareoAhoraServidor==='function'){const t=window.tareoAhoraServidor();if(Number.isFinite(Number(t)))return Number(t);}}catch(_){/* sin reloj del servidor: hora del equipo */}return Date.now();};
  const cfgBloques=()=>{try{const c=typeof window.glacialConfigIndicadores==='function'?window.glacialConfigIndicadores():null;return c?c.bloques:undefined;}catch(_){return undefined;}};
  const usuario=()=>(typeof state!=='undefined'&&state.user)||null;
  function contexto(){
    const u=usuario()||{},c=u.contextoRotacion||{};
    let bl=null;try{bl=window.GlacialIndicadores.bloqueVigente(ahora(),cfgBloques());}catch(_){bl=null;}
    const porHora=bl&&bl.bloque==='noche'?'NOCHE':'DÍA';
    const turno=String(u.turnoOperativo||c.turno||porHora).toUpperCase();
    let fecha=u.fechaOperativa||c.fechaOperativa||(bl&&bl.fecha)||'';
    if(!fecha){try{fecha=window.GlacialIndicadores.diaOperativo(ahora());}catch(_){fecha='';}}
    return {fecha,bloque:bloqueDe(turno),turno:turno.includes('NOCHE')?'NOCHE':(turno.includes('INTER')?'INTERMEDIO':'DÍA')};
  }
  const esSupervisor=()=>{const u=usuario();return !!u&&u.rol==='Supervisor';};
  const soloVista=()=>!!(window.glacialVista&&typeof window.glacialVista.activo==='function'&&window.glacialVista.activo());
  const puedeDeclarar=()=>esSupervisor()&&!soloVista()&&typeof tienePermiso==='function'&&tienePermiso('distribuirPersonal');
  const horario=()=>{try{return enHorario(window.glacialVentanaSupervisor&&typeof window.glacialVentanaSupervisor.estado==='function'?window.glacialVentanaSupervisor.estado(usuario()):null);}catch(_){return enHorario(null);}};
  /* Se pregunta el área (y se suma a la barra) solo a quien trabaja y está dentro de su horario. */
  const debeDeclarar=()=>puedeDeclarar()&&horario().dentro;
  const uidActual=()=>{const f=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;return (f&&f.uid)||'';};
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------- Firestore ---------- */
  const E={clave:'',doc:null,cerrar:null,listo:false,error:false,decidido:{},claveAnt:'',docAnt:null,cerrarAnt:null};
  const ref=(fecha,bloque)=>db.collection('distribucionPersonal').doc(clave(fecha,bloque));
  function escuchar(){
    if(typeof db==='undefined'||!usuario())return;
    const c=contexto();if(!c.fecha)return;
    const k=clave(c.fecha,c.bloque);
    if(E.clave===k&&E.cerrar)return;
    if(E.cerrar){try{E.cerrar();}catch(_){/* ya cerrada */}}
    if(E.cerrarAnt){try{E.cerrarAnt();}catch(_){/* ya cerrada */}}
    E.clave=k;E.doc=null;E.listo=false;E.error=false;E.docAnt=null;
    try{
      E.cerrar=ref(c.fecha,c.bloque).onSnapshot(s=>{E.doc=s.exists?s.data():null;E.listo=true;E.error=false;pintar();avisarSiFalta();},()=>{E.error=true;E.listo=true;pintar();});
    }catch(_){E.cerrar=null;E.error=true;}
    // Bloque anterior: el Intermedio (15–23) sigue visible después de las 19:00 hasta su salida.
    try{const a=anterior(c.fecha,c.bloque);E.claveAnt=clave(a.fecha,a.bloque);E.cerrarAnt=ref(a.fecha,a.bloque).onSnapshot(s=>{E.docAnt=s.exists?s.data():null;pintar();},()=>{E.docAnt=null;});}catch(_){E.cerrarAnt=null;}
  }
  async function declarar(area){
    if(!puedeDeclarar())throw new Error('No tienes permiso para indicar tu área.');
    const c=contexto(),u=usuario(),uid=uidActual();
    if(!uid)throw new Error('Sin sesión: vuelve a iniciar sesión.');
    const r=ref(c.fecha,c.bloque);
    await db.runTransaction(async tx=>{
      const s=await tx.get(r),prev=s.exists?s.data():null;
      const v=prev?num(prev.version):0;
      const h=horario();
      const nuevo=aplicar(prev,{uid,nombre:u.nombre||u.username,area,turno:h.turno||c.turno,desdeMs:ahora(),hastaMs:h.hastaMs});
      tx.set(r,Object.assign({},nuevo,{version:v+1,fecha:c.fecha,bloque:bloqueDe(c.bloque),tipo:'SUPERVISORES',actualizadoEn:firebase.firestore.FieldValue.serverTimestamp(),actualizadoUid:uid}));
    });
  }

  /* «Salir del turno»: deja de figurar en el documento actual y en el anterior. */
  async function salirDelTurno(){
    try{await salirDelTurnoGuardar();}catch(e){if(typeof alert==='function')alert((e&&e.message)||'No se pudo guardar. Intenta de nuevo.');}
    pintar();
  }
  async function salirDelTurnoGuardar(){
    const uid=uidActual();if(!uid||!puedeDeclarar())return;
    const c=contexto(),a=anterior(c.fecha,c.bloque),ms=ahora();
    for(const x of [[c.fecha,c.bloque],[a.fecha,a.bloque]]){
      const r=ref(x[0],x[1]);
      await db.runTransaction(async tx=>{
        const s=await tx.get(r),prev=s.exists?s.data():null;
        if(!prev||!prev.supervisores||!prev.supervisores[uid])return;
        tx.set(r,Object.assign({},salir(prev,uid,ms),{version:num(prev.version)+1,actualizadoEn:firebase.firestore.FieldValue.serverTimestamp(),actualizadoUid:uid}),{merge:true});
      });
    }
    E.decidido[E.clave]=true;
  }

  /* ---------- barra con los nombres ---------- */
  function estilos(){
    if(document.getElementById('sup-css'))return;
    const s=document.createElement('style');s.id='sup-css';
    s.textContent=`
      .sup-barra{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;margin:0;padding:7px max(16px,env(safe-area-inset-left,0px));background:#EAF4FA;border-bottom:1px solid #CFE3EF;color:#0B2A4A;font-size:13px;line-height:1.35}
      .sup-barra[hidden]{display:none!important}
      .sup-barra b{font-weight:800}.sup-barra .sup-t{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#587087}
      .sup-barra .sup-n{color:#0B2A4A}.sup-barra .sup-v{color:#7a8a98;font-style:italic}
      .sup-barra button{border:0;background:#0877A6;color:#fff;border-radius:8px;padding:5px 12px;min-height:32px;font:inherit;font-weight:700;cursor:pointer}
      .sup-barra button.sup-sec{background:transparent;color:#0877A6;text-decoration:underline;padding:5px 6px}
      .sup-modal{position:fixed;inset:0;z-index:100000;background:rgba(7,30,48,.55);display:flex;align-items:center;justify-content:center;padding:16px}
      .sup-modal>div{background:#fff;color:#0B2A4A;width:min(460px,100%);border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(7,30,48,.35)}
      .sup-modal h3{margin:0 0 4px;font-size:19px}.sup-modal p{margin:0 0 14px;color:#587087;font-size:14px}
      .sup-modal .sup-op{display:block;width:100%;text-align:left;margin:0 0 10px;padding:14px 16px;min-height:60px;border:2px solid #CFE3EF;border-radius:12px;background:#F5FAFD;cursor:pointer;font:inherit;color:#0B2A4A}
      .sup-modal .sup-op b{display:block;font-size:18px}.sup-modal .sup-op small{color:#587087}
      .sup-modal .sup-op:hover,.sup-modal .sup-op:focus{border-color:#0877A6;background:#E8F7FE;outline:none}
      .sup-modal .sup-ahora{background:none;border:0;color:#587087;text-decoration:underline;cursor:pointer;font:inherit;padding:8px 0}`;
    document.head.appendChild(s);
  }
  function htmlBarra(){
    const ms=ahora(),p=porArea(E.doc,ms,E.docAnt),uid=uidActual(),propiaEnt=propia(E.doc,uid,ms)||propia(E.docAnt,uid,ms);
    const celdas=ORDEN.map(a=>{
      const n=p[a];
      return `<span><span class="sup-t">${esc(AREAS[a].nombre)}</span> <b class="sup-n">${n.length?esc(n.join(', ')):''}</b>${n.length?'':'<span class="sup-v">sin indicar</span>'}</span>`;
    }).join('');
    const accion=puedeDeclarar()&&E.listo&&!E.error
      ?(propiaEnt?'<button type="button" class="sup-sec" onclick="glacialSupervisorTurno.preguntar()">Cambiar mi área</button><button type="button" class="sup-sec" onclick="glacialSupervisorTurno.salirDelTurno()">Salir del turno</button>'
        :(horario().dentro?'<button type="button" onclick="glacialSupervisorTurno.preguntar()">Indicar mi área</button>':''))
      :'';
    return `<span class="sup-t">Supervisor en turno</span>${celdas}${accion}`;
  }
  /* Todas las barras (la de Agua en index.html y las que dibuja Hielo en su pantalla). Sin sesión o sin datos, se ocultan. */
  function pintar(){
    estilos();
    const mostrar=!!usuario()&&E.listo&&!E.error;
    document.querySelectorAll('.sup-barra').forEach(b=>{b.hidden=!mostrar;b.innerHTML=mostrar?htmlBarra():'';});
  }
  function htmlBarraHielo(){estilos();return `<div class="sup-barra"${E.listo&&!E.error&&usuario()?'':' hidden'}>${E.listo&&!E.error&&usuario()?htmlBarra():''}</div>`;}

  /* ---------- pregunta al entrar al turno ---------- */
  function cerrarModal(){const m=document.getElementById('sup-modal');if(m)m.remove();}
  function preguntar(){
    if(!puedeDeclarar())return;
    if(!horario().dentro){if(typeof alert==='function')alert('Estás fuera de tu horario: solo quien está en planta aparece en «Supervisor en turno».');return;}
    estilos();cerrarModal();
    const c=contexto(),t=c.turno==='NOCHE'?'Noche':(c.turno==='INTERMEDIO'?'Intermedio':'Día');
    const m=document.createElement('div');m.id='sup-modal';m.className='sup-modal';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','¿En qué área estás?');
    m.innerHTML=`<div><h3>¿En qué área estás en este turno?</h3><p>Turno ${esc(t)}. Todos verán tu nombre en el área que elijas.</p>
      ${ORDEN.map(a=>`<button type="button" class="sup-op" onclick="glacialSupervisorTurno.elegir('${a}')"><b>${esc(AREAS[a].nombre)}</b><small>${esc(AREAS[a].detalle)}</small></button>`).join('')}
      <button type="button" class="sup-ahora" onclick="glacialSupervisorTurno.ahoraNo()">Ahora no</button><div id="sup-error" style="color:#8A1C13;font-size:13px"></div></div>`;
    document.body.appendChild(m);
    const b=m.querySelector('.sup-op');if(b)b.focus();
  }
  async function elegir(area){
    try{await declarar(area);cerrarModal();E.decidido[E.clave]=true;}
    catch(e){const x=document.getElementById('sup-error');if(x)x.textContent=(e&&e.message)||'No se pudo guardar. Intenta de nuevo.';}
  }
  function ahoraNo(){E.decidido[E.clave]=true;cerrarModal();}
  /* Al llegar los datos: si es supervisor, está en turno y aún no indicó su área (ni dijo «ahora no» en este turno), se le pregunta una vez. */
  function avisarSiFalta(){
    if(!debeDeclarar()||!E.listo||E.error||E.decidido[E.clave]||document.getElementById('sup-modal'))return;
    if(propia(E.doc,uidActual(),ahora())||propia(E.docAnt,uidActual(),ahora())){E.decidido[E.clave]=true;return;}
    const app=document.getElementById('app-screen'),hl=document.getElementById('hielo-screen'),sel=document.getElementById('report-select-screen');
    const hay=el=>!!el&&el.style.display!=='none'&&getComputedStyle(el).display!=='none';
    if(!(hay(app)||hay(hl)||hay(sel)))return;      // aún en la pantalla de acceso
    preguntar();
  }
  setInterval(()=>{try{escuchar();pintar();avisarSiFalta();}catch(_){/* una falla aquí no debe romper la página */}},15000);
  setTimeout(()=>{try{escuchar();}catch(_){/* ídem */}},2500);
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{if(E.cerrar){try{E.cerrar();}catch(_){/* ya cerrada */}}if(E.cerrarAnt){try{E.cerrarAnt();}catch(_){/* ya cerrada */}}E.cerrar=null;E.cerrarAnt=null;E.docAnt=null;E.clave='';E.doc=null;E.listo=false;E.decidido={};cerrarModal();pintar();});

  window.glacialSupervisorTurno={preguntar,elegir,ahoraNo,pintar,htmlBarraHielo,declarar,salirDelTurno,estado:()=>E};
})();
