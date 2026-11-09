/* =====================================================================================================================
   GLACIAL · REPORTE HIELO · docs/hielo/reporte-hielo.md
   Página propia (se abre desde la tarjeta «Reporte Hielo» de la pantalla de selección), con Inicio, Nuevo registro, Historial,
   Programación y Configuración. Un reporte por fecha operativa y turno (DÍA, INTERMEDIO o NOCHE, como Agua).
   La producción se cuenta en BOLSAS por marca y presentación; los kilos se calculan (bolsas × kg de la presentación).
   Inicio separa las bolsas por presentación (3 kg, 1.5 kg…) — pedido del dueño, 07/11/2026.
   Equipos, motivos de parada e ítems de merma NO se inventan: son listas editables en Configuración (los equipos empiezan vacíos).
   Colecciones (glacial_46): hieloReportes/{fecha_TURNO}, hieloProgramacion/{fecha_TURNO}, hieloParametros/config. Nada se borra.
   ===================================================================================================================== */
(function(){
  'use strict';
  const TURNOS=['DÍA','INTERMEDIO','NOCHE'];
  const DEFECTO={
    marcas:typeof MARCAS_HIELO!=='undefined'?MARCAS_HIELO.slice():['Glacial'],
    presentaciones:typeof PRESENTACIONES_HIELO!=='undefined'?PRESENTACIONES_HIELO.slice():['1.5 kg','3 kg','5 kg'],
    equipos:[],
    motivos:['Mantenimiento','Falla de equipo','Falta de insumo','Otros'],
    mermas:['Bolsas','Bobina','Hielo (producto)']
  };
  const UNIDADES_MERMA=['UND','KG'];
  const num=v=>{const n=Number(String(v===undefined||v===null?'':v).replace(',','.'));return Number.isFinite(n)?n:0;};
  const texto=v=>v===undefined||v===null?'':String(v).trim();
  const esFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  const esHora=h=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(h||''));

  /* ------------------------------------------------------------------ núcleo puro */
  /** «1.5 kg» → 1.5 · «3 kg» → 3 · sin número → 0. */
  function kgDe(presentacion){const m=String(presentacion||'').replace(',','.').match(/(\d+(?:\.\d+)?)/);return m?Number(m[1]):0;}
  const idReporte=(fecha,turno)=>fecha+'_'+turno;
  /** Ordena las presentaciones por kg de mayor a menor (3 kg antes que 1.5 kg). */
  const ordenPres=lista=>[...new Set(lista)].sort((a,b)=>kgDe(b)-kgDe(a)||String(a).localeCompare(String(b)));
  /** Totales de uno o varios reportes: bolsas por presentación, bolsas, kg, paradas (min y eventos), merma por ítem+unidad. */
  function totales(reportes){
    const porPres={},porMarca=new Map(),merma=new Map();
    let bolsas=0,kg=0,paradasMin=0,paradas=0;
    (reportes||[]).forEach(r=>{
      (r&&r.produccion||[]).forEach(p=>{
        const b=Math.max(0,Math.round(num(p.bolsas)));if(!b)return;
        porPres[p.presentacion]=(porPres[p.presentacion]||0)+b;bolsas+=b;kg+=b*kgDe(p.presentacion);
        const k=p.marca+'|'+p.presentacion;porMarca.set(k,(porMarca.get(k)||0)+b);
      });
      (r&&r.paradas||[]).forEach(p=>{const m=num(p.minutos);if(m>0){paradasMin+=m;paradas++;}});
      (r&&r.mermas||[]).forEach(m=>{const c=num(m.cantidad);if(c>0){const k=m.item+'|'+(m.unidad||'UND');merma.set(k,(merma.get(k)||0)+c);}});
    });
    return {porPres,bolsas,kg:Math.round(kg*100)/100,paradasMin,paradas,
      porMarca:[...porMarca.entries()].map(([k,b])=>{const [marca,presentacion]=k.split('|');return {marca,presentacion,bolsas:b};}),
      merma:[...merma.entries()].map(([k,c])=>{const [item,unidad]=k.split('|');return {item,unidad,cantidad:Math.round(c*1000)/1000};})};
  }
  /** Programado (bolsas) de una o varias programaciones, por marca+presentación y total. */
  function programado(programas){
    const m=new Map();let total=0;
    (programas||[]).forEach(p=>(p&&p.items||[]).forEach(i=>{const b=Math.max(0,Math.round(num(i.bolsas)));if(!b)return;const k=i.marca+'|'+i.presentacion;m.set(k,(m.get(k)||0)+b);total+=b;}));
    return {total,porMarca:m};
  }
  /** Filas «programado vs producido» por marca y presentación (incluye lo producido sin programar y lo programado sin producir). */
  function avance(reportes,programas){
    const t=totales(reportes),p=programado(programas);
    const claves=new Set([...p.porMarca.keys(),...t.porMarca.map(x=>x.marca+'|'+x.presentacion)]);
    const filas=[...claves].map(k=>{const [marca,presentacion]=k.split('|');const prod=(t.porMarca.find(x=>x.marca===marca&&x.presentacion===presentacion)||{}).bolsas||0;const prog=p.porMarca.get(k)||0;
      return {marca,presentacion,programado:prog,producido:prod,pct:prog>0?prod/prog:null};})
      .sort((a,b)=>kgDe(b.presentacion)-kgDe(a.presentacion)||a.marca.localeCompare(b.marca,'es'));
    return {filas,programado:p.total,producido:t.bolsas,cumplimiento:p.total>0?t.bolsas/p.total:null};
  }
  /** Errores que impiden FINALIZAR (guardar el borrador siempre se puede). */
  function validarFinalizar(r,config){
    const e=[];const cfg=Object.assign({},DEFECTO,config||{});
    if(!r||!esFecha(r.fecha))e.push('Falta la fecha.');
    if(!r||!TURNOS.includes(r.turno))e.push('Elige el turno.');
    if(r&&r.horaInicio&&!esHora(r.horaInicio))e.push('Hora de inicio no válida (HH:MM).');
    if(r&&r.horaFin&&!esHora(r.horaFin))e.push('Hora de fin no válida (HH:MM).');
    const prod=(r&&r.produccion||[]).filter(p=>num(p.bolsas)>0);
    if(!prod.length)e.push('Registra al menos una producción con bolsas.');
    (r&&r.produccion||[]).forEach((p,i)=>{
      if(num(p.bolsas)<0||!Number.isInteger(num(p.bolsas)))e.push(`Producción ${i+1}: las bolsas deben ser un número entero.`);
      if(num(p.bolsas)>0&&(!p.marca||!p.presentacion))e.push(`Producción ${i+1}: elige marca y presentación.`);
      if(num(p.bolsas)>0&&!kgDe(p.presentacion))e.push(`Producción ${i+1}: la presentación «${p.presentacion}» no tiene kg.`);
    });
    (r&&r.paradas||[]).forEach((p,i)=>{
      if(!(num(p.minutos)>0))e.push(`Parada ${i+1}: indica los minutos.`);
      if(!p.motivo)e.push(`Parada ${i+1}: elige el motivo.`);
      if(cfg.equipos.length&&!p.equipo)e.push(`Parada ${i+1}: elige el equipo.`);
      if(p.inicio&&!esHora(p.inicio))e.push(`Parada ${i+1}: hora no válida (HH:MM).`);
      if(p.motivo==='Otros'&&texto(p.nota).length<5)e.push(`Parada ${i+1}: con «Otros» describe la parada (mínimo 5 caracteres).`);
    });
    (r&&r.mermas||[]).forEach((m,i)=>{if(!(num(m.cantidad)>0))e.push(`Merma ${i+1}: indica la cantidad.`);if(!m.item)e.push(`Merma ${i+1}: elige el ítem.`);});
    return e;
  }
  /** Documento a guardar (limpio): versión +1, historial y autor. accion: GUARDAR | FINALIZAR | REABRIR. */
  function planGuardar({previo,r,accion,usuario,uid,en,motivo}){
    const ahora=Number(en)||Date.now();
    const limpiar=lista=>(lista||[]).map(x=>Object.assign({},x));
    const estado=accion==='FINALIZAR'?'FINALIZADO':accion==='REABRIR'?'EN_REGISTRO':(previo&&previo.estado)||'EN_REGISTRO';
    const doc={id:idReporte(r.fecha,r.turno),fecha:r.fecha,turno:r.turno,estado,
      supervisor:texto(r.supervisor||usuario).slice(0,80),horaInicio:texto(r.horaInicio),horaFin:texto(r.horaFin),
      produccion:limpiar(r.produccion).map(p=>({marca:texto(p.marca),presentacion:texto(p.presentacion),lote:texto(p.lote).slice(0,40),bolsas:Math.max(0,Math.round(num(p.bolsas)))})),
      paradas:limpiar(r.paradas).map(p=>({inicio:texto(p.inicio),equipo:texto(p.equipo),motivo:texto(p.motivo),minutos:Math.max(0,Math.round(num(p.minutos))),nota:texto(p.nota).slice(0,200)})),
      mermas:limpiar(r.mermas).map(m=>({item:texto(m.item),cantidad:Math.max(0,num(m.cantidad)),unidad:UNIDADES_MERMA.includes(m.unidad)?m.unidad:'UND'})),
      observaciones:texto(r.observaciones).slice(0,500),
      rev:(Number(previo&&previo.rev)||0)+1,
      historial:(previo&&Array.isArray(previo.historial)?previo.historial:[]).concat(accion==='GUARDAR'&&previo?[]:[{accion,por:texto(usuario),uid:texto(uid),en:ahora,motivo:texto(motivo).slice(0,200)}]).slice(-100),
      creadoPor:previo?previo.creadoPor:texto(usuario),creadoEn:previo?previo.creadoEn:ahora,actualizadoPor:texto(usuario),actualizadoUid:texto(uid),actualizadoEn:ahora};
    return doc;
  }
  /** Listas de Configuración: limpias, sin repetidos; las presentaciones deben tener kg. */
  function validarConfig(c){
    const e=[];const lista=v=>[...new Set((v||[]).map(texto).filter(Boolean))];
    const out={marcas:lista(c.marcas),presentaciones:ordenPres(lista(c.presentaciones)),equipos:lista(c.equipos),motivos:lista(c.motivos),mermas:lista(c.mermas)};
    if(!out.marcas.length)e.push('Agrega al menos una marca.');
    if(!out.presentaciones.length)e.push('Agrega al menos una presentación.');
    out.presentaciones.forEach(p=>{if(!kgDe(p))e.push(`La presentación «${p}» debe tener los kg (por ejemplo «3 kg»).`);});
    if(!out.motivos.length)e.push('Agrega al menos un motivo de parada.');
    return {errores:e,config:out};
  }
  /** Filas para el Excel del Historial: una por producción (marca y presentación) de cada reporte. */
  function filasExcel(reportes){
    const filas=[];
    (reportes||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:a.fecha>b.fecha?1:TURNOS.indexOf(a.turno)-TURNOS.indexOf(b.turno)).forEach(r=>{
      const t=totales([r]);
      const prods=(r.produccion||[]).filter(p=>num(p.bolsas)>0);
      (prods.length?prods:[{marca:'',presentacion:'',lote:'',bolsas:0}]).forEach(p=>filas.push([r.fecha,r.turno,r.supervisor||'',p.marca,p.presentacion,p.lote||'',Math.round(num(p.bolsas)),Math.round(num(p.bolsas)*kgDe(p.presentacion)*100)/100,t.paradasMin,r.estado==='FINALIZADO'?'Finalizado':'En registro']));
    });
    return filas;
  }
  const N={TURNOS,DEFECTO,kgDe,idReporte,ordenPres,totales,programado,avance,validarFinalizar,planGuardar,validarConfig,filasExcel};
  if(typeof module!=='undefined'&&module.exports)module.exports=N;
  if(typeof window==='undefined')return;
  window.glacialHieloNucleo=N;

  /* ------------------------------------------------------------------ permisos (los mismos criterios que el servidor, glacial_46) */
  const usr=()=>(typeof state!=='undefined'&&state.user)||null;
  const tiene=(u,k)=>!!u&&(u.permisos==='todos'||(Array.isArray(u.permisos)&&u.permisos.includes(k)));
  const enVista=()=>!!(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo());
  const rol=()=>String((usr()&&usr().rol)||'');
  const esAdmin=()=>rol()==='Administrador';
  const puedeRegistrar=()=>!!usr()&&!enVista()&&rol()!=='mantenimiento_compartido'&&(esAdmin()||['Jefe de Producción','Jefe de Operaciones','Supervisor','Supervisor de Producción'].includes(rol())||tiene(usr(),'paletas'));
  const puedeProgramar=()=>!!usr()&&!enVista()&&rol()!=='mantenimiento_compartido'&&(esAdmin()||tiene(usr(),'planificacion')||(['Jefe de Producción','Planificación','Ventas y Planificación'].includes(rol())&&!tiene(usr(),'-planificacion')));
  const puedeConfigurar=()=>!!usr()&&!enVista()&&(esAdmin()||['Jefe de Producción','Jefe de Operaciones','Jefatura','Gerente General','Gerente'].includes(rol()));

  /* ------------------------------------------------------------------ datos */
  const C={reportes:'hieloReportes',programacion:'hieloProgramacion',parametros:'hieloParametros'};
  const DIAS=62;
  const cache={reportes:[],programacion:[],config:null,listo:{reportes:false,programacion:false,config:false},error:''};
  let cierres=[];
  const F=()=>window.GlacialFecha;
  const hoy=()=>F()?F().fechaOperativa():(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');})();
  const turnoAhora=()=>F()?F().turnoActual():'DÍA';
  const sumarDias=(f,n)=>F()?F().sumarDias(f,n):f;
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const yo=()=>{const u=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;return {uid:(u&&u.uid)||'',nombre:(usr()&&(usr().nombre||usr().username))||''};};
  const config=()=>Object.assign({},DEFECTO,cache.config||{});
  function escuchar(){
    if(cierres.length||typeof db==='undefined')return;
    const desde=sumarDias(hoy(),-DIAS);cache.error='';
    const fallo=e=>{cache.error=String((e&&e.message)||e);repintar();};
    try{
      cierres.push(db.collection(C.reportes).where('fecha','>=',desde).onSnapshot(s=>{cache.reportes=s.docs.map(d=>d.data()).filter(x=>x&&x.id);cache.listo.reportes=true;repintar();},fallo));
      cierres.push(db.collection(C.programacion).where('fecha','>=',desde).onSnapshot(s=>{cache.programacion=s.docs.map(d=>d.data()).filter(x=>x&&x.id);cache.listo.programacion=true;repintar();},fallo));
      cierres.push(db.collection(C.parametros).doc('config').onSnapshot(s=>{cache.config=s.exists?s.data():null;cache.listo.config=true;repintar();},fallo));
    }catch(e){fallo(e);}
  }
  function detener(){cierres.splice(0).forEach(c=>{try{c();}catch(_){/* ya cerrada */}});cache.listo={reportes:false,programacion:false,config:false};}
  async function guardarReporte(r,accion,motivo){
    if(!puedeRegistrar())throw new Error('No tienes permiso para registrar producción de hielo.');
    if(accion==='REABRIR'&&!esAdmin())throw new Error('Solo el Administrador puede reabrir un reporte finalizado.');
    if(accion==='FINALIZAR'){const e=validarFinalizar(r,config());if(e.length)throw new Error(e.join(' · '));}
    const u=yo(),id=idReporte(r.fecha,r.turno),ref=db.collection(C.reportes).doc(id);
    let doc=null;
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const previo=s.exists?s.data():null;
      if(previo&&Number(previo.rev)!==Number(r.rev||0))throw Object.assign(new Error('Otra persona guardó este reporte mientras lo editabas. Se cargó su versión: revisa y vuelve a guardar.'),{codigo:'CONFLICTO'});
      if(!previo&&Number(r.rev||0)>0)throw Object.assign(new Error('El reporte ya no existe.'),{codigo:'CONFLICTO'});
      if(previo&&previo.estado==='FINALIZADO'&&accion!=='REABRIR'&&!esAdmin())throw new Error('El reporte está finalizado: solo el Administrador puede cambiarlo.');
      doc=planGuardar({previo,r,accion,usuario:u.nombre,uid:u.uid,en:ahora(),motivo});
      tx.set(ref,doc);
    });
    return doc;
  }
  async function guardarProgramacion(fecha,turno,items,revEsperada){
    if(!puedeProgramar())throw new Error('No tienes permiso para programar la producción de hielo.');
    const u=yo(),id=idReporte(fecha,turno),ref=db.collection(C.programacion).doc(id);
    const limpios=(items||[]).map(i=>({marca:texto(i.marca),presentacion:texto(i.presentacion),bolsas:Math.max(0,Math.round(num(i.bolsas)))})).filter(i=>i.marca&&i.presentacion&&i.bolsas>0);
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const previo=s.exists?s.data():null;
      if(Number(previo&&previo.rev||0)!==Number(revEsperada||0))throw new Error('Otra persona cambió esta programación. Se actualizó la pantalla: vuelve a guardar.');
      tx.set(ref,{id,fecha,turno,items:limpios,rev:(Number(previo&&previo.rev)||0)+1,
        historial:(previo&&previo.historial||[]).concat([{por:u.nombre,en:ahora(),bolsas:limpios.reduce((s,i)=>s+i.bolsas,0)}]).slice(-50),
        actualizadoPor:u.nombre,actualizadoUid:u.uid,actualizadoEn:ahora()});
    });
  }
  async function guardarConfig(c){
    if(!puedeConfigurar())throw new Error('No tienes permiso para cambiar la configuración de hielo.');
    const v=validarConfig(c);if(v.errores.length)throw new Error(v.errores.join(' · '));
    const u=yo(),ref=db.collection(C.parametros).doc('config');
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const previo=s.exists?s.data():null;
      if(Number(previo&&previo.rev||0)!==Number(cache.config&&cache.config.rev||0))throw new Error('Otra persona cambió la configuración. Vuelve a abrirla.');
      tx.set(ref,Object.assign({id:'config'},v.config,{rev:(Number(previo&&previo.rev)||0)+1,
        historial:(previo&&previo.historial||[]).concat([{por:u.nombre,en:ahora()}]).slice(-50),actualizadoPor:u.nombre,actualizadoUid:u.uid,actualizadoEn:ahora()}));
    });
  }
  window.glacialHieloDatos={C,cache,alCambiar:f=>oyentes.push(f),escuchar,detener,guardarReporte,guardarProgramacion,guardarConfig,config,puedeRegistrar,puedeProgramar,puedeConfigurar,esAdmin};

  /* ------------------------------------------------------------------ pantalla */
  const esc=s=>String(s===undefined||s===null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d)=>{const x=Number(n);if(!Number.isFinite(x))return '—';const t=String(Number(Math.abs(x).toFixed(d===undefined?0:d))).split('.');return (x<0?'−':'')+t[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ')+(t[1]?','+t[1]:'');};
  const fechaTxt=f=>esFecha(f)?f.split('-').reverse().join('/'):'—';
  const S={vista:'inicio',fecha:'',turno:'TODOS',ed:null,msg:null,guardado:'',hDesde:'',hHasta:'',hTurno:'',hMarca:'',pFecha:'',pTurno:'',pItems:null,pRev:0};
  let temporizador=null;
  function raiz(){
    let r=document.getElementById('hielo-screen');
    if(!r){r=document.createElement('div');r.id='hielo-screen';r.style.display='none';document.body.appendChild(r);}
    return r;
  }
  const visible=()=>{const r=document.getElementById('hielo-screen');return !!(r&&r.style.display!=='none');};
  /* Cambios en vivo (otro usuario o el propio guardado automático): no se redibuja mientras se escribe en un campo. */
  const oyentes=[];
  function repintar(){
    oyentes.slice().forEach(f=>{try{f();}catch(_){/* un oyente no rompe a los demás */}});          // p. ej. la tarjeta de Hielo del Inicio (98-hielo-inicio.js)
    if(!visible())return;
    const a=document.activeElement;
    if((S.vista==='registro'||S.vista==='programacion'||S.vista==='config')&&a&&raiz().contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return;
    pintar();
  }
  function estilos(){return `<style>
#hielo-screen{position:fixed;inset:0;z-index:40;background:#eef6fb;overflow:auto;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#16263a;font-size:14px}
.hl-app{display:grid;grid-template-columns:230px minmax(0,1fr);min-height:100%}
.hl-side{background:#0b2a4a;color:#dbeafe;padding:16px 10px}
.hl-side h2{font-size:15px;margin:0 6px 2px;color:#fff}.hl-side small{display:block;margin:0 6px 14px;color:#93c5fd}
.hl-side button{display:block;width:100%;text-align:left;border:0;background:none;color:#dbeafe;padding:10px 12px;border-radius:8px;font:inherit;font-weight:600;cursor:pointer;min-height:44px}
.hl-side button.act{background:rgba(56,189,248,.2);color:#fff;box-shadow:inset 3px 0 0 #38bdf8}
.hl-sep{border-top:1px solid rgba(255,255,255,.14);margin:10px 6px}
.hl-main{padding:16px 18px 60px;min-width:0;max-width:1180px}
.hl-main h1{font-size:22px;margin:0 0 4px}.hl-sub{color:#5b6b7c;margin:0 0 12px}
.hl-card{background:#fff;border:1px solid #d6e4ee;border-radius:12px;padding:14px;margin-bottom:12px;overflow-x:auto;min-width:0}
.hl-card h3{font-size:15px;margin:0 0 8px}
.hl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:12px}
.hl-kpi{background:#fff;border:1px solid #d6e4ee;border-radius:12px;padding:12px}.hl-kpi b{display:block;font-size:24px;color:#0b2a4a}.hl-kpi span{color:#5b6b7c;font-size:12px}.hl-kpi i{display:block;font-style:normal;font-size:12px;margin-top:4px;color:#5b6b7c}
.hl-kpi.hl-pres{border-top:4px solid #38bdf8}
.hl-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.hl-main table{width:100%;border-collapse:collapse}.hl-main th,.hl-main td{text-align:left;padding:8px;border-bottom:1px solid #edf2f7;vertical-align:middle}.hl-main th{font-size:12px;color:#5b6b7c;background:#f5f9fc}
.hl-main td.n,.hl-main th.n{text-align:right}
.hl-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.hl-main label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#5b6b7c}
.hl-main input,.hl-main select,.hl-main textarea{font:inherit;font-size:15px;padding:9px 10px;border:1px solid #d6e4ee;border-radius:10px;min-height:44px;width:100%;box-sizing:border-box;background:#fff;color:#16263a}
.hl-main input[readonly]{background:#f1f5f9;font-weight:800;color:#0b2a4a}
.hl-btn{border:0;border-radius:10px;padding:10px 14px;min-height:44px;font:inherit;font-weight:700;cursor:pointer;background:#0877A6;color:#fff}
.hl-btn.o{background:#fff;color:#0877A6;border:1px solid #0877A6}.hl-btn.x{min-width:44px;padding:8px}
.hl-btn:disabled{opacity:.5;cursor:not-allowed}
.hl-pill{display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap}
.hl-ok{background:#e7f6ec;color:#15803d}.hl-av{background:#fff4e5;color:#b45309}.hl-gr{background:#eef1f4;color:#5b6b7c}
.hl-bar{height:12px;border-radius:6px;background:#e2edf5;overflow:hidden;min-width:80px}.hl-bar i{display:block;height:100%;background:#38bdf8}
.hl-msg{border-radius:10px;padding:10px 12px;margin:0 0 12px}.hl-msg.e{background:#fdecec;color:#991b1b;border:1px solid #f5b5b5}.hl-msg.k{background:#e7f6ec;color:#15803d;border:1px solid #b7e4c7}.hl-msg.i{background:#eef6fb;color:#0b4a6b;border:1px solid #bfdcec}
.hl-acc{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.hl-vacio{color:#5b6b7c;padding:10px;border:1px dashed #d6e4ee;border-radius:10px;text-align:center}
.hl-filtros{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:10px}
.hl-clic{cursor:pointer}.hl-clic:hover{background:#f3f9fc}
@media(max-width:700px){.hl-ed thead{display:none}.hl-ed tr{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 0;border-bottom:1px solid #e2ebf2}
 .hl-ed td{display:flex;flex-direction:column;gap:4px;border:0!important;padding:0!important}.hl-ed td[data-label]:not([data-label=""])::before{content:attr(data-label);font-size:12px;font-weight:700;color:#5b6b7c}
 .hl-ed td[data-label=""]{grid-column:1/-1;align-items:flex-end}}
@media(max-width:860px){.hl-app{grid-template-columns:minmax(0,1fr)}.hl-side{display:flex;gap:4px;overflow-x:auto;padding:8px;position:sticky;top:0;z-index:2}.hl-side h2,.hl-side small,.hl-sep{display:none}
 .hl-side button{white-space:nowrap;width:auto}.hl-2{grid-template-columns:minmax(0,1fr)}.hl-main{padding:12px 16px 60px}}
</style>`;}
  const opciones=(lista,sel,vacio)=>(vacio!==undefined?`<option value="">${esc(vacio)}</option>`:'')+lista.map(x=>`<option ${x===sel?'selected':''}>${esc(x)}</option>`).join('');
  const reportesDe=(fecha,turno)=>cache.reportes.filter(r=>r.fecha===fecha&&(turno==='TODOS'||r.turno===turno));
  const programasDe=(fecha,turno)=>cache.programacion.filter(p=>p.fecha===fecha&&(turno==='TODOS'||p.turno===turno));
  function aviso(){
    const m=S.msg?`<div class="hl-msg ${S.msg.tipo==='error'?'e':S.msg.tipo==='info'?'i':'k'}" role="${S.msg.tipo==='error'?'alert':'status'}">${esc(S.msg.texto)}</div>`:'';
    const e=cache.error?`<div class="hl-msg e" role="alert">No se pudieron leer los datos de hielo: ${esc(cache.error)}</div>`:'';
    const c=!cache.error&&!(cache.listo.reportes&&cache.listo.config)?'<div class="hl-msg i">Consultando los datos de hielo…</div>':'';
    return e+c+m;
  }
  /* ---------- Inicio ---------- */
  function vistaInicio(){
    const f=S.fecha||hoy(),t=S.turno;
    const rs=reportesDe(f,t),ps=programasDe(f,t);
    const tot=totales(rs),av=avance(rs,ps);
    const pres=ordenPres(config().presentaciones.filter(p=>p==='3 kg'||p==='1.5 kg'||tot.porPres[p]||av.filas.some(x=>x.presentacion===p)).concat(Object.keys(tot.porPres)));
    const progPres=p=>av.filas.filter(x=>x.presentacion===p).reduce((s,x)=>s+x.programado,0);
    const kpisPres=pres.map(p=>`<div class="hl-kpi hl-pres"><span>Bolsas de ${esc(p)}</span><b>${fmt(tot.porPres[p]||0)}</b><i>${progPres(p)?'de '+fmt(progPres(p))+' programadas':'sin programación'} · ${fmt((tot.porPres[p]||0)*kgDe(p),1)} kg</i></div>`).join('');
    const estado=rs.length?(rs.every(r=>r.estado==='FINALIZADO')?'<span class="hl-pill hl-ok">finalizado</span>':'<span class="hl-pill hl-av">en curso</span>'):'<span class="hl-pill hl-gr">sin reporte</span>';
    const filas=av.filas.map(x=>`<tr><td>${esc(x.marca)}</td><td>${esc(x.presentacion)}</td><td class="n">${x.programado?fmt(x.programado):'—'}</td><td class="n">${fmt(x.producido)}</td><td>${x.pct===null?'<span class="hl-pill hl-gr">sin programar</span>':`<div class="hl-bar" title="${fmt(x.pct*100)} %"><i style="width:${Math.min(100,x.pct*100)}%"></i></div>`}</td></tr>`).join('');
    const paradas=rs.flatMap(r=>(r.paradas||[]).map(p=>Object.assign({turno:r.turno},p))).filter(p=>num(p.minutos)>0).sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
    const turnos=['TODOS'].concat(TURNOS).map(x=>`<option value="${x}" ${x===t?'selected':''}>${x==='TODOS'?'Todo el día':x}</option>`).join('');
    return `<h1>Inicio · Hielo</h1><p class="hl-sub">${fechaTxt(f)} · ${t==='TODOS'?'todo el día':'turno '+esc(t)} ${estado}</p>
      <div class="hl-filtros"><label>Fecha<input type="date" value="${esc(f)}" onchange="hlSet('fecha',this.value)"></label><label>Turno<select onchange="hlSet('turno',this.value)">${turnos}</select></label></div>
      <div class="hl-kpis">${kpisPres}
        <div class="hl-kpi"><span>Kilos producidos</span><b>${fmt(tot.kg,1)} kg</b><i>${fmt(tot.bolsas)} bolsas en total</i></div>
        <div class="hl-kpi"><span>Cumplimiento</span><b>${av.cumplimiento===null?'—':fmt(av.cumplimiento*100)+' %'}</b><i>${av.programado?fmt(av.producido)+' de '+fmt(av.programado)+' bolsas':'sin programación'}</i></div>
        <div class="hl-kpi"><span>Paradas</span><b>${fmt(tot.paradasMin)} min</b><i>${tot.paradas} evento${tot.paradas===1?'':'s'}</i></div></div>
      <div class="hl-2"><div class="hl-card"><h3>Producción por marca y presentación</h3>${filas?`<table><thead><tr><th>Marca</th><th>Presentación</th><th class="n">Programado</th><th class="n">Producido</th><th>Avance</th></tr></thead><tbody>${filas}</tbody></table>`:'<div class="hl-vacio">Sin producción ni programación.</div>'}</div>
        <div class="hl-card"><h3>Paradas</h3>${paradas.length?`<table><thead><tr><th>Hora</th><th>Turno</th><th>Equipo</th><th>Motivo</th><th class="n">Min</th></tr></thead><tbody>${paradas.map(p=>`<tr><td>${esc(p.inicio||'—')}</td><td>${esc(p.turno)}</td><td>${esc(p.equipo||'—')}</td><td>${esc(p.motivo)}${p.nota?`<br><small class="hl-sub">${esc(p.nota)}</small>`:''}</td><td class="n">${fmt(p.minutos)}</td></tr>`).join('')}</tbody></table>`:'<div class="hl-vacio">Sin paradas.</div>'}</div></div>
      <div class="hl-card"><h3>Merma</h3>${tot.merma.length?`<table><thead><tr><th>Ítem</th><th class="n">Cantidad</th></tr></thead><tbody>${tot.merma.map(m=>`<tr><td>${esc(m.item)}</td><td class="n">${fmt(m.cantidad,3)} ${esc(m.unidad)}</td></tr>`).join('')}</tbody></table>`:'<div class="hl-vacio">Sin merma registrada.</div>'}</div>`;
  }
  /* ---------- Nuevo registro ---------- */
  function abrirEdicion(fecha,turno){
    const id=idReporte(fecha,turno),r=cache.reportes.find(x=>x.id===id);
    S.ed=r?JSON.parse(JSON.stringify(r)):{fecha,turno,estado:'EN_REGISTRO',supervisor:yo().nombre,horaInicio:'',horaFin:'',produccion:[],paradas:[],mermas:[],observaciones:'',rev:0};
    if(!r){ // nuevo: una fila por lo programado de ese turno, o una vacía
      const prog=programasDe(fecha,turno).flatMap(p=>p.items||[]);
      S.ed.produccion=prog.length?prog.map(i=>({marca:i.marca,presentacion:i.presentacion,lote:'',bolsas:''})):[{marca:config().marcas[0]||'',presentacion:config().presentaciones[0]||'',lote:'',bolsas:''}];
    }
    S.guardado=r?'Guardado':'';
  }
  function vistaRegistro(){
    if(!S.ed)abrirEdicion(hoy(),turnoAhora());
    const r=S.ed,cfg=config(),fin=r.estado==='FINALIZADO';
    const bloq=fin&&!esAdmin()||!puedeRegistrar();
    const dis=bloq?'disabled':'';
    const t=totales([r]);
    const prod=r.produccion.map((p,i)=>`<tr><td data-label="Marca"><select ${dis} onchange="hlCampo('produccion',${i},'marca',this.value)">${opciones(cfg.marcas.includes(p.marca)||!p.marca?cfg.marcas:[p.marca].concat(cfg.marcas),p.marca,'— marca —')}</select></td>
      <td data-label="Presentación"><select ${dis} onchange="hlCampo('produccion',${i},'presentacion',this.value)">${opciones(cfg.presentaciones.includes(p.presentacion)||!p.presentacion?cfg.presentaciones:[p.presentacion].concat(cfg.presentaciones),p.presentacion,'—')}</select></td>
      <td data-label="Lote"><input ${dis} maxlength="40" value="${esc(p.lote)}" placeholder="opcional" oninput="hlCampo('produccion',${i},'lote',this.value)" aria-label="Lote del producto"></td>
      <td data-label="Bolsas"><input ${dis} type="number" min="0" step="1" inputmode="numeric" value="${esc(p.bolsas)}" oninput="hlCampo('produccion',${i},'bolsas',this.value)" aria-label="Bolsas"></td>
      <td data-label="Kilos"><input readonly tabindex="-1" id="hl-kg-${i}" value="${fmt(num(p.bolsas)*kgDe(p.presentacion),1)}" aria-label="Kilos"></td>
      <td data-label="">${bloq?'':`<button type="button" class="hl-btn o x" onclick="hlQuitar('produccion',${i})" aria-label="Quitar producción">✕</button>`}</td></tr>`).join('');
    const par=r.paradas.map((p,i)=>`<tr><td data-label="Hora"><input ${dis} type="time" value="${esc(p.inicio)}" onchange="hlCampo('paradas',${i},'inicio',this.value)" aria-label="Hora"></td>
      <td data-label="Equipo">${cfg.equipos.length?`<select ${dis} onchange="hlCampo('paradas',${i},'equipo',this.value)">${opciones(cfg.equipos,p.equipo,'— equipo —')}</select>`:'<small class="hl-sub">Sin equipos en Configuración</small>'}</td>
      <td data-label="Motivo"><select ${dis} onchange="hlCampo('paradas',${i},'motivo',this.value)">${opciones(cfg.motivos,p.motivo,'— motivo —')}</select></td>
      <td data-label="Minutos"><input ${dis} type="number" min="0" step="1" inputmode="numeric" value="${esc(p.minutos)}" oninput="hlCampo('paradas',${i},'minutos',this.value)" aria-label="Minutos"></td>
      <td data-label="Detalle"><input ${dis} maxlength="200" value="${esc(p.nota)}" placeholder="detalle" oninput="hlCampo('paradas',${i},'nota',this.value)" aria-label="Detalle"></td>
      <td data-label="">${bloq?'':`<button type="button" class="hl-btn o x" onclick="hlQuitar('paradas',${i})" aria-label="Quitar parada">✕</button>`}</td></tr>`).join('');
    const mer=r.mermas.map((m,i)=>`<tr><td data-label="Ítem"><select ${dis} onchange="hlCampo('mermas',${i},'item',this.value)">${opciones(cfg.mermas,m.item,'— ítem —')}</select></td>
      <td data-label="Cantidad"><input ${dis} type="number" min="0" step="any" inputmode="decimal" value="${esc(m.cantidad)}" oninput="hlCampo('mermas',${i},'cantidad',this.value)" aria-label="Cantidad"></td>
      <td data-label="Unidad"><select ${dis} onchange="hlCampo('mermas',${i},'unidad',this.value)">${opciones(UNIDADES_MERMA,m.unidad||'UND')}</select></td>
      <td data-label="">${bloq?'':`<button type="button" class="hl-btn o x" onclick="hlQuitar('mermas',${i})" aria-label="Quitar merma">✕</button>`}</td></tr>`).join('');
    const pres=ordenPres(Object.keys(t.porPres));
    return `<h1>${r.rev?'Reporte':'Nuevo registro'} · Hielo</h1><p class="hl-sub">Un reporte por fecha y turno. ${fin?'<span class="hl-pill hl-ok">Finalizado</span>':'<span class="hl-pill hl-av">En registro</span>'} <span id="hl-guardado" class="hl-pill hl-gr">${esc(S.guardado||'Sin guardar')}</span></p>
      ${!puedeRegistrar()?'<div class="hl-msg i">Solo consulta: tu usuario no registra producción de hielo.</div>':''}
      <div class="hl-card"><h3>Datos del turno</h3><div class="hl-form">
        <label>Fecha<input type="date" value="${esc(r.fecha)}" onchange="hlCambiarTurno(this.value,null)"></label>
        <label>Turno<select onchange="hlCambiarTurno(null,this.value)">${opciones(TURNOS,r.turno)}</select></label>
        <label>Supervisor<input ${dis} maxlength="80" value="${esc(r.supervisor)}" oninput="hlDato('supervisor',this.value)"></label>
        <label>Hora inicio<input ${dis} type="time" value="${esc(r.horaInicio)}" onchange="hlDato('horaInicio',this.value)"></label>
        <label>Hora fin<input ${dis} type="time" value="${esc(r.horaFin)}" onchange="hlDato('horaFin',this.value)"></label></div></div>
      <div class="hl-card"><h3>Producción (bolsas)</h3>
        ${prod?`<table class="hl-ed"><thead><tr><th>Marca</th><th>Presentación</th><th>Lote</th><th>Bolsas</th><th>Kilos</th><th></th></tr></thead><tbody>${prod}</tbody></table>`:'<div class="hl-vacio">Sin producción.</div>'}
        <div class="hl-acc" style="margin-top:8px">${bloq?'':'<button type="button" class="hl-btn o" onclick="hlAgregar(\'produccion\')">+ Agregar marca</button>'}
          <span class="hl-sub" id="hl-tot" style="margin:0">${pres.map(p=>`${fmt(t.porPres[p])} bolsas de ${esc(p)}`).join(' · ')||'0 bolsas'} · <b>${fmt(t.kg,1)} kg</b></span></div></div>
      <div class="hl-2"><div class="hl-card"><h3>Paradas</h3>
        ${par?`<table class="hl-ed"><thead><tr><th>Hora</th><th>Equipo</th><th>Motivo</th><th>Min</th><th>Detalle</th><th></th></tr></thead><tbody>${par}</tbody></table>`:'<div class="hl-vacio">Sin paradas.</div>'}
        ${bloq?'':'<div class="hl-acc" style="margin-top:8px"><button type="button" class="hl-btn o" onclick="hlAgregar(\'paradas\')">+ Agregar parada</button></div>'}
        ${!cfg.equipos.length?'<p class="hl-sub" style="margin:8px 0 0">Los equipos de la planta se agregan en Configuración.</p>':''}</div>
        <div class="hl-card"><h3>Merma</h3>
        ${mer?`<table class="hl-ed"><thead><tr><th>Ítem</th><th>Cantidad</th><th>Unidad</th><th></th></tr></thead><tbody>${mer}</tbody></table>`:'<div class="hl-vacio">Sin merma.</div>'}
        ${bloq?'':'<div class="hl-acc" style="margin-top:8px"><button type="button" class="hl-btn o" onclick="hlAgregar(\'mermas\')">+ Agregar merma</button></div>'}</div></div>
      <div class="hl-card"><h3>Observaciones</h3><textarea ${dis} rows="3" maxlength="500" oninput="hlDato('observaciones',this.value)">${esc(r.observaciones)}</textarea></div>
      <div class="hl-acc">${puedeRegistrar()&&!fin?'<button type="button" class="hl-btn o" onclick="hlGuardar(\'GUARDAR\')">Guardar</button><button type="button" class="hl-btn" onclick="hlGuardar(\'FINALIZAR\')">Finalizar reporte</button>':''}
        ${fin&&esAdmin()?'<button type="button" class="hl-btn o" onclick="hlReabrir()">Reabrir (Administrador)</button>':''}</div>`;
  }
  /* ---------- Historial ---------- */
  function filtradosHistorial(){
    const d=S.hDesde||sumarDias(hoy(),-13),h=S.hHasta||hoy();
    return cache.reportes.filter(r=>r.fecha>=d&&r.fecha<=h&&(!S.hTurno||r.turno===S.hTurno)&&(!S.hMarca||(r.produccion||[]).some(p=>p.marca===S.hMarca&&num(p.bolsas)>0)))
      .sort((a,b)=>a.fecha<b.fecha?1:a.fecha>b.fecha?-1:TURNOS.indexOf(b.turno)-TURNOS.indexOf(a.turno));
  }
  function vistaHistorial(){
    const d=S.hDesde||sumarDias(hoy(),-13),h=S.hHasta||hoy(),lista=filtradosHistorial(),cfg=config();
    const tot=totales(lista),pres=ordenPres(cfg.presentaciones.concat(Object.keys(tot.porPres))).filter(p=>tot.porPres[p]||p==='3 kg'||p==='1.5 kg');
    const filas=lista.map(r=>{const t=totales([r]);return `<tr class="hl-clic" onclick="hlAbrir('${esc(r.fecha)}','${esc(r.turno)}')"><td>${fechaTxt(r.fecha)}</td><td>${esc(r.turno)}</td><td>${esc(r.supervisor)}</td>${pres.map(p=>`<td class="n">${fmt(t.porPres[p]||0)}</td>`).join('')}<td class="n">${fmt(t.kg,1)}</td><td class="n">${fmt(t.paradasMin)}</td><td>${r.estado==='FINALIZADO'?'<span class="hl-pill hl-ok">Finalizado</span>':'<span class="hl-pill hl-av">En registro</span>'}</td></tr>`;}).join('');
    return `<h1>Historial · Hielo</h1><p class="hl-sub">Toca un reporte para abrirlo. Se guardan los últimos ${DIAS} días en pantalla.</p>
      <div class="hl-filtros"><label>Desde<input type="date" value="${esc(d)}" onchange="hlSet('hDesde',this.value)"></label><label>Hasta<input type="date" value="${esc(h)}" onchange="hlSet('hHasta',this.value)"></label>
        <label>Turno<select onchange="hlSet('hTurno',this.value)">${opciones(TURNOS,S.hTurno,'Todos')}</select></label><label>Marca<select onchange="hlSet('hMarca',this.value)">${opciones(cfg.marcas,S.hMarca,'Todas')}</select></label></div>
      <div class="hl-card"><div class="hl-acc" style="justify-content:space-between;margin-bottom:8px"><span class="hl-sub" style="margin:0">${lista.length} reporte${lista.length===1?'':'s'} · ${pres.map(p=>fmt(tot.porPres[p]||0)+' bolsas de '+esc(p)).join(' · ')} · ${fmt(tot.kg,1)} kg</span>
        <button type="button" class="hl-btn o" onclick="hlExcel()" ${lista.length?'':'disabled'}>Descargar Excel</button></div>
        ${filas?`<table><thead><tr><th>Fecha</th><th>Turno</th><th>Supervisor</th>${pres.map(p=>`<th class="n">Bolsas ${esc(p)}</th>`).join('')}<th class="n">Kg</th><th class="n">Paradas (min)</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>`:'<div class="hl-vacio">Sin reportes en ese rango.</div>'}</div>`;
  }
  /* ---------- Programación ---------- */
  function vistaProgramacion(){
    const f=S.pFecha||hoy(),t=S.pTurno||'DÍA',cfg=config();
    const doc=cache.programacion.find(p=>p.id===idReporte(f,t));
    if(S.pItems===null){S.pItems=doc?JSON.parse(JSON.stringify(doc.items||[])):[];S.pRev=doc?Number(doc.rev)||0:0;}
    const ed=puedeProgramar(),dis=ed?'':'disabled';
    const filas=S.pItems.map((i,k)=>`<tr><td data-label="Marca"><select ${dis} onchange="hlPItem(${k},'marca',this.value)">${opciones(cfg.marcas,i.marca,'— marca —')}</select></td><td data-label="Presentación"><select ${dis} onchange="hlPItem(${k},'presentacion',this.value)">${opciones(cfg.presentaciones,i.presentacion,'—')}</select></td>
      <td data-label="Bolsas"><input ${dis} type="number" min="0" step="1" inputmode="numeric" value="${esc(i.bolsas)}" oninput="hlPItem(${k},'bolsas',this.value,true)" aria-label="Bolsas"></td><td data-label="">${ed?`<button type="button" class="hl-btn o x" onclick="hlPQuitar(${k})" aria-label="Quitar">✕</button>`:''}</td></tr>`).join('');
    const prox=cache.programacion.filter(p=>p.fecha>=hoy()).sort((a,b)=>a.fecha<b.fecha?-1:a.fecha>b.fecha?1:TURNOS.indexOf(a.turno)-TURNOS.indexOf(b.turno)).slice(0,20);
    return `<h1>Programación · Hielo</h1><p class="hl-sub">Bolsas a producir por turno, por marca y presentación.</p>
      ${!ed?'<div class="hl-msg i">Solo consulta: programan Planificación, el Jefe de Producción y el Administrador.</div>':''}
      <div class="hl-filtros"><label>Fecha<input type="date" value="${esc(f)}" onchange="hlPSel(this.value,null)"></label><label>Turno<select onchange="hlPSel(null,this.value)">${opciones(TURNOS,t)}</select></label></div>
      <div class="hl-card"><h3>${fechaTxt(f)} · ${esc(t)}</h3>${filas?`<table class="hl-ed"><thead><tr><th>Marca</th><th>Presentación</th><th>Bolsas</th><th></th></tr></thead><tbody>${filas}</tbody></table>`:'<div class="hl-vacio">Sin programación.</div>'}
        ${ed?`<div class="hl-acc" style="margin-top:8px"><button type="button" class="hl-btn o" onclick="hlPAgregar()">+ Agregar</button><button type="button" class="hl-btn" onclick="hlPGuardar()">Guardar programación</button></div>`:''}</div>
      <div class="hl-card"><h3>Próximos turnos programados</h3>${prox.length?`<table><thead><tr><th>Fecha</th><th>Turno</th><th>Detalle</th><th class="n">Bolsas</th></tr></thead><tbody>${prox.map(p=>`<tr class="hl-clic" onclick="hlPSel('${esc(p.fecha)}','${esc(p.turno)}')"><td>${fechaTxt(p.fecha)}</td><td>${esc(p.turno)}</td><td>${esc((p.items||[]).map(i=>i.marca+' '+i.presentacion+': '+fmt(i.bolsas)).join(' · '))}</td><td class="n">${fmt((p.items||[]).reduce((s,i)=>s+num(i.bolsas),0))}</td></tr>`).join('')}</tbody></table>`:'<div class="hl-vacio">No hay turnos programados desde hoy.</div>'}</div>`;
  }
  /* ---------- Configuración ---------- */
  function vistaConfig(){
    const c=config(),ed=puedeConfigurar(),dis=ed?'':'disabled';
    const area=(id,t,v,ayuda)=>`<label>${t}<textarea id="${id}" ${dis} rows="7">${esc(v.join('\n'))}</textarea><span class="hl-sub" style="font-weight:400;margin:0">${ayuda}</span></label>`;
    return `<h1>Configuración · Hielo</h1><p class="hl-sub">Una por línea. Quitar una opción no cambia los reportes ya guardados.</p>
      ${!ed?'<div class="hl-msg i">Solo consulta: la cambian el Administrador y los jefes.</div>':''}
      ${!cache.config?'<div class="hl-msg i">Todavía no se guardó la configuración: se muestran las marcas y presentaciones del programa.</div>':''}
      <div class="hl-card"><div class="hl-form">${area('hl-c-marcas','Marcas',c.marcas,'')}${area('hl-c-pres','Presentaciones',c.presentaciones,'Con sus kg, por ejemplo «3 kg».')}
        ${area('hl-c-equipos','Equipos de la planta',c.equipos,'Para las paradas.')}${area('hl-c-motivos','Motivos de parada',c.motivos,'«Otros» pide describir la parada.')}${area('hl-c-mermas','Ítems de merma',c.mermas,'')}</div>
        ${ed?'<div class="hl-acc" style="margin-top:10px"><button type="button" class="hl-btn" onclick="hlGuardarConfig()">Guardar configuración</button></div>':''}
        ${cache.config&&cache.config.actualizadoPor?`<p class="hl-sub" style="margin:8px 0 0">Última modificación: ${esc(cache.config.actualizadoPor)} · versión ${esc(cache.config.rev)}</p>`:''}</div>`;
  }
  function pintar(){
    const r=raiz();
    const MENU=[['inicio','Inicio'],['registro','Nuevo registro'],['historial','Historial'],['programacion','Programación'],['config','Configuración']];
    const cuerpo={inicio:vistaInicio,registro:vistaRegistro,historial:vistaHistorial,programacion:vistaProgramacion,config:vistaConfig}[S.vista]||vistaInicio;
    const y=r.scrollTop;
    r.innerHTML=`${estilos()}<div class="hl-app"><nav class="hl-side" aria-label="Menú de Hielo"><h2>❄ GLACIAL · HIELO</h2><small>Reporte Hielo</small>
      ${MENU.map(([k,t])=>`<button type="button" class="${S.vista===k?'act':''}" ${S.vista===k?'aria-current="page"':''} onclick="hlVista('${k}')">${t}</button>`).join('')}
      <div class="hl-sep"></div><button type="button" onclick="hlSalir()">← Volver a Reporte Agua</button></nav>
      <main class="hl-main">${aviso()}${cuerpo()}</main></div>`;
    r.scrollTop=y;
  }
  /* ---------- acciones ---------- */
  const ok=t=>{S.msg={tipo:'ok',texto:t};pintar();};
  const mal=e=>{S.msg={tipo:'error',texto:String(e&&e.message||e)};pintar();};
  window.hlVista=v=>{S.vista=v;S.msg=null;if(v==='programacion')S.pItems=null;pintar();};
  window.hlSet=(k,v)=>{S[k]=v;S.msg=null;pintar();};
  window.hlAbrir=(f,t)=>{abrirEdicion(f,t);S.vista='registro';S.msg=null;pintar();};
  window.hlCambiarTurno=(f,t)=>{
    if(S.ed&&temporizador){clearTimeout(temporizador);temporizador=null;}
    abrirEdicion(f||S.ed.fecha,t||S.ed.turno);S.msg=null;pintar();
  };
  function cambio(rehacer){
    S.guardado='Cambios sin guardar';const g=document.getElementById('hl-guardado');if(g)g.textContent=S.guardado;
    if(rehacer)pintar();else actualizarTotales();
    // guardado automático del borrador (no finaliza)
    if(puedeRegistrar()&&S.ed&&S.ed.estado!=='FINALIZADO'){clearTimeout(temporizador);temporizador=setTimeout(()=>{temporizador=null;window.hlGuardar('GUARDAR',true);},2500);}
  }
  function actualizarTotales(){
    const r=S.ed;if(!r)return;const t=totales([r]);
    r.produccion.forEach((p,i)=>{const e=document.getElementById('hl-kg-'+i);if(e)e.value=fmt(num(p.bolsas)*kgDe(p.presentacion),1);});
    const e=document.getElementById('hl-tot');if(e)e.innerHTML=(ordenPres(Object.keys(t.porPres)).map(p=>`${fmt(t.porPres[p])} bolsas de ${esc(p)}`).join(' · ')||'0 bolsas')+` · <b>${fmt(t.kg,1)} kg</b>`;
  }
  window.hlDato=(k,v)=>{if(!S.ed)return;S.ed[k]=v;cambio(false);};
  window.hlCampo=(lista,i,k,v)=>{if(!S.ed||!S.ed[lista][i])return;S.ed[lista][i][k]=v;cambio(k==='presentacion'||k==='motivo');};
  window.hlAgregar=lista=>{if(!S.ed)return;const c=config();
    S.ed[lista].push(lista==='produccion'?{marca:'',presentacion:c.presentaciones[0]||'',lote:'',bolsas:''}:lista==='paradas'?{inicio:'',equipo:'',motivo:'',minutos:'',nota:''}:{item:c.mermas[0]||'',cantidad:'',unidad:'UND'});cambio(true);};
  window.hlQuitar=(lista,i)=>{if(!S.ed)return;S.ed[lista].splice(i,1);cambio(true);};
  window.hlGuardar=async(accion,auto)=>{
    if(!S.ed)return;
    if(accion!=='GUARDAR'&&temporizador){clearTimeout(temporizador);temporizador=null;}
    try{
      const doc=await guardarReporte(S.ed,accion);
      const enPantalla=S.ed;
      if(enPantalla&&enPantalla.fecha===doc.fecha&&enPantalla.turno===doc.turno){enPantalla.rev=doc.rev;enPantalla.estado=doc.estado;enPantalla.historial=doc.historial;}
      const h=new Date(doc.actualizadoEn);S.guardado='Guardado '+String(h.getHours()).padStart(2,'0')+':'+String(h.getMinutes()).padStart(2,'0');
      if(auto){const g=document.getElementById('hl-guardado');if(g)g.textContent=S.guardado;return;}
      ok(accion==='FINALIZAR'?'Reporte finalizado.':'Reporte guardado.');
    }catch(e){
      if(e&&e.codigo==='CONFLICTO'){abrirEdicion(S.ed.fecha,S.ed.turno);}
      if(auto){S.guardado='No se guardó: '+String(e&&e.message||e);const g=document.getElementById('hl-guardado');if(g)g.textContent=S.guardado;if(e&&e.codigo==='CONFLICTO')mal(e);return;}
      mal(e);
    }
  };
  window.hlReabrir=async()=>{
    const m=typeof prompt==='function'?prompt('Motivo para reabrir el reporte (mínimo 5 caracteres):'):'';
    if(m===null)return;if(String(m||'').trim().length<5)return mal('Escribe el motivo (mínimo 5 caracteres).');
    try{const doc=await guardarReporte(S.ed,'REABRIR',m);S.ed.rev=doc.rev;S.ed.estado=doc.estado;ok('Reporte reabierto.');}catch(e){mal(e);}
  };
  window.hlPSel=(f,t)=>{S.pFecha=f||S.pFecha||hoy();S.pTurno=t||S.pTurno||'DÍA';S.pItems=null;S.vista='programacion';S.msg=null;pintar();};
  window.hlPItem=(k,campo,v,sinPintar)=>{if(!S.pItems||!S.pItems[k])return;S.pItems[k][campo]=v;if(!sinPintar)pintar();};
  window.hlPAgregar=()=>{const c=config();S.pItems.push({marca:'',presentacion:c.presentaciones[0]||'',bolsas:''});pintar();};
  window.hlPQuitar=k=>{S.pItems.splice(k,1);pintar();};
  window.hlPGuardar=async()=>{try{await guardarProgramacion(S.pFecha||hoy(),S.pTurno||'DÍA',S.pItems,S.pRev);S.pItems=null;ok('Programación guardada.');}catch(e){S.pItems=null;mal(e);}};
  window.hlGuardarConfig=async()=>{
    const v=id=>((document.getElementById(id)||{}).value||'').split('\n');
    try{await guardarConfig({marcas:v('hl-c-marcas'),presentaciones:v('hl-c-pres'),equipos:v('hl-c-equipos'),motivos:v('hl-c-motivos'),mermas:v('hl-c-mermas')});ok('Configuración guardada.');}catch(e){mal(e);}
  };
  window.hlExcel=async()=>{
    try{
      const lista=filtradosHistorial();
      const ExcelJS=typeof cargarScriptExterno==='function'?await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS'):window.ExcelJS;
      if(!ExcelJS)throw new Error('No se pudo cargar la librería de Excel.');
      const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Hielo',{views:[{state:'frozen',ySplit:3}]});
      const COL=['Fecha','Turno','Supervisor','Marca','Presentación','Lote','Bolsas','Kg','Paradas del turno (min)','Estado'];
      ws.addRow(['GLACIAL · Historial de producción de hielo']).font={bold:true,size:14};
      ws.addRow([`${lista.length} reportes · generado ${new Date().toLocaleString('es-PE')}`]);
      const cab=ws.addRow(COL);cab.font={bold:true,color:{argb:'FFFFFFFF'}};cab.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B2A4A'}};});
      const filas=filasExcel(lista);filas.forEach(f=>ws.addRow(f));
      ws.addRow(['Total','','','','','',filas.reduce((s,f)=>s+f[6],0),Math.round(filas.reduce((s,f)=>s+f[7],0)*100)/100]).font={bold:true};
      [12,12,22,16,14,14,10,10,12,12].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
      ws.autoFilter={from:{row:3,column:1},to:{row:3,column:COL.length}};
      const buf=await wb.xlsx.writeBuffer();const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.download='Historial-Hielo.xlsx';
      document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
    }catch(e){mal('No se pudo generar el Excel: '+((e&&e.message)||e));}
  };
  function abrir(){
    const sel=document.getElementById('report-select-screen'),app=document.getElementById('app-screen');
    S.desdeAgua=!!(app&&app.style.display!=='none'&&getComputedStyle(app).display!=='none');      // se abrió con el botón del Reporte Agua
    if(sel)sel.style.display='none';if(app)app.style.display='none';
    raiz().style.display='block';escuchar();if(!S.fecha)S.fecha=hoy();pintar();
  }
  window.hlSalir=()=>{
    if(temporizador){clearTimeout(temporizador);temporizador=null;window.hlGuardar('GUARDAR',true);}
    raiz().style.display='none';
    const app=document.getElementById('app-screen'),sel=document.getElementById('report-select-screen');
    if(S.desdeAgua&&app){app.style.display='block';if(typeof renderMain==='function')try{renderMain();}catch(_){/* vuelve igual */}}
    else if(sel)sel.style.display='flex';
  };
  // La tarjeta «Reporte Hielo» de la pantalla de selección abre esta página (antes mostraba «en desarrollo», 03-auth.js).
  window.goReporteHielo=abrir;
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detener();cache.reportes=[];cache.programacion=[];cache.config=null;S.ed=null;const r=document.getElementById('hielo-screen');if(r){r.style.display='none';r.innerHTML='';}});
  window.glacialHieloUI={abrir,pintar,S};
})();
