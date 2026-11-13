/* =====================================================================================================================
   MANTENIMIENTO · PLAN ANUAL · datos (tablas mtto_* de la migración glacial_47) · docs/mantenimiento/plan-y-registro.md
   Lee las máquinas y las actividades del plan con el cliente de Supabase de la sesión (las reglas RLS deciden quién lee y quién escribe)
   y escucha los cambios en tiempo real (supabase_realtime): lo que edita el supervisor aparece en los demás dispositivos sin recargar.
   Cada actividad lleva «version»: al guardar se exige la versión que la persona vio; si otra persona la cambió, no se pisa.
   ===================================================================================================================== */
(function(){
  'use strict';
  const N=window.glacialMttoPlan;
  const cache={ejec:{},maquinas:[],actividades:[],config:null,listo:false,cargando:false,error:'',enVivo:false,registros:[],regActs:[],piezas:[],fotos:[],fotosOk:true,semana:null,errorSemana:'',historial:[],anioHistorial:null,errorHistorial:'',cargandoHistorial:false};
  const oyentes=[],remotos=[];
  let cliente=null,canal=null,activo=false;
  const sb=()=>cliente||window.glacialSupabaseCliente||null;
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* un oyente no rompe a los demás */}});
  const ordenM=l=>l.slice().sort((a,b)=>(a.orden||0)-(b.orden||0));
  const msg=e=>{const t=String((e&&e.message)||e||'');
    if(/permission|denied|42501|row-level/i.test(t))return 'No tienes permiso para esta acción.';
    if(/fetch|network|failed|timeout/i.test(t))return 'Sin conexión con el servidor. Inténtalo de nuevo.';
    return t||'No se pudo completar la acción.';};

  async function cargar(){
    const c=sb();if(!c){cache.error='Sin conexión con la base de datos.';cache.listo=false;avisar();return;}
    cache.cargando=true;cache.error='';avisar();
    try{
      const [m,a,cf]=await Promise.all([
        c.from('mtto_maquinas').select('*').order('orden'),
        c.from('mtto_plan_actividades').select('*').order('orden').limit(5000),
        c.from('mtto_config').select('*').eq('id','config').maybeSingle()]);
      const e=m.error||a.error||cf.error;if(e)throw e;
      cache.maquinas=ordenM(m.data||[]);cache.actividades=a.data||[];cache.config=cf.data||null;cache.listo=true;
    }catch(e){cache.error=msg(e);cache.listo=false;}
    cache.cargando=false;avisar();
  }
  const reemplazar=(lista,fila,clave)=>{const i=lista.findIndex(x=>x[clave||'id']===fila[clave||'id']);if(i<0)lista.push(fila);else lista[i]=fila;};
  /** Cada cambio que llega (propio o de otro dispositivo) con la fila anterior del caché: así la pantalla detecta cuando otra persona pisa lo que se está editando. */
  const filaPrevia=(tabla,n)=>{
    const l={mtto_registros:cache.registros,mtto_registro_actividades:cache.regActs,mtto_registro_piezas:cache.piezas,mtto_registro_fotos:cache.fotos}[tabla];
    const f=l&&n&&n.id?l.find(x=>x.id===n.id):null;return f?Object.assign({},f):null;
  };
  function alCambio(tabla,p){
    const t=p&&p.eventType,n=p&&p.new,o=p&&p.old;
    if(tabla==='mtto_registros'||tabla==='mtto_registro_actividades')programarEjecucion();      // el Registro cambió: la ejecución del año se vuelve a leer
    const previa=(t==='UPDATE'||t==='INSERT')&&n?filaPrevia(tabla,n):null;
    if(previa||t==='UPDATE')remotos.slice().forEach(f=>{try{f(tabla,previa,n);}catch(_){/* un oyente no rompe a los demás */}});
    if(tabla==='mtto_maquinas'){
      if(t==='DELETE'&&o)cache.maquinas=cache.maquinas.filter(x=>x.id!==o.id);else if(n&&n.id){reemplazar(cache.maquinas,n);cache.maquinas=ordenM(cache.maquinas);}
    }else if(tabla==='mtto_plan_actividades'){
      if(t==='DELETE'&&o)cache.actividades=cache.actividades.filter(x=>x.id!==o.id);else if(n&&n.id)reemplazar(cache.actividades,n);
    }else if(tabla==='mtto_config'&&n)cache.config=n;
    else if(tabla==='mtto_registros'){
      if(cache.anioHistorial!==null){
        if(t==='DELETE'&&o)cache.historial=cache.historial.filter(x=>x.id!==o.id);
        else if(n&&n.id&&n.anio===cache.anioHistorial)reemplazar(cache.historial,n);
      }
      const sm=cache.semana;
      if(t==='DELETE'&&o)cache.registros=cache.registros.filter(x=>x.id!==o.id);
      else if(n&&n.id&&sm&&n.anio===sm.anio&&n.semana===sm.semana)reemplazar(cache.registros,n);
    }else if(tabla==='mtto_registro_piezas'){
      if(t==='DELETE'&&o)cache.piezas=cache.piezas.filter(x=>x.id!==o.id);
      else if(n&&n.id&&cache.registros.some(r=>r.id===n.registro_id))reemplazar(cache.piezas,n);
    }else if(tabla==='mtto_registro_actividades'){
      if(t==='DELETE'&&o)cache.regActs=cache.regActs.filter(x=>x.id!==o.id);
      else if(n&&n.id&&cache.registros.some(r=>r.id===n.registro_id))reemplazar(cache.regActs,n);
    }else if(tabla==='mtto_registro_fotos'){
      if(t==='DELETE'&&o)cache.fotos=cache.fotos.filter(x=>x.id!==o.id);
      else if(n&&n.id&&cache.registros.some(r=>r.id===n.registro_id))reemplazar(cache.fotos,n);
    }
    avisar();
  }
  /* ---------- ejecución del año (Registro) ----------
     Registros y actividades marcadas de UN año: con ellos el Plan anual pinta lo hecho, lo no realizado y lo vencido, y el Inicio arma «Esta semana en Mantenimiento».
     Se piden una vez por año y se vuelven a pedir (con una pausa) cuando cambia el Registro, aquí o en otro dispositivo. */
  let tEjec=null;
  async function cargarEjecucion(anio){
    const c=sb();if(!c||!Number.isFinite(Number(anio)))return null;
    const previo=cache.ejec[anio];if(previo&&previo.cargando)return previo;
    cache.ejec[anio]=Object.assign(previo||{registros:[],acts:[]},{cargando:true});
    try{
      const r=await c.from('mtto_registros').select('id,maquina_id,anio,semana,estado,actualizado_en').eq('anio',anio).limit(3000);
      if(r.error)throw r.error;
      const registros=r.data||[],acts=[];
      for(let i=0;i<registros.length;i+=60){
        const a=await c.from('mtto_registro_actividades').select('id,registro_id,plan_actividad_id,realizado,no_realizado,motivo_no,origen_actividad_id,item,equipo,actividad').in('registro_id',registros.slice(i,i+60).map(x=>x.id)).limit(5000);
        if(a.error)throw a.error;acts.push(...(a.data||[]));
      }
      cache.ejec[anio]={registros,acts,listo:true,cargando:false,error:'',en:Date.now()};
    }catch(e){cache.ejec[anio]={registros:[],acts:[],listo:false,cargando:false,error:msg(e),en:Date.now()};}
    avisar();return cache.ejec[anio];
  }
  /** Ejecución del año si ya está leída; si no, la pide (una sola vez) y avisa a las pantallas cuando llegue. */
  function ejecucion(anio){
    const e=cache.ejec[anio];
    if(!e||(!e.listo&&!e.cargando&&!e.error))cargarEjecucion(anio);
    return e&&(e.listo||e.error)?e:null;
  }
  function programarEjecucion(){
    clearTimeout(tEjec);
    tEjec=setTimeout(()=>{Object.keys(cache.ejec).forEach(a=>{if(cache.ejec[a]&&cache.ejec[a].listo)cargarEjecucion(Number(a));});},1500);
  }
  /** Registros de UNA semana (y sus actividades): lo que muestra el Programa semanal. */
  async function cargarSemana(anio,semana){
    const c=sb();if(!c)return;
    cache.semana={anio,semana};cache.errorSemana='';
    try{
      const r=await c.from('mtto_registros').select('*').eq('anio',anio).eq('semana',semana);
      if(r.error)throw r.error;
      const regs=r.data||[];let acts=[],pzs=[];
      if(regs.length){
        const a=await c.from('mtto_registro_actividades').select('*').in('registro_id',regs.map(x=>x.id)).order('item').limit(5000);
        if(a.error)throw a.error;acts=a.data||[];
        const z=await c.from('mtto_registro_piezas').select('*').in('registro_id',regs.map(x=>x.id)).order('orden');
        if(z.error)throw z.error;pzs=z.data||[];
      }
      let fts=[];cache.fotosOk=true;
      if(regs.length){const f=await c.from('mtto_registro_fotos').select('*').in('registro_id',regs.map(x=>x.id)).order('creado_en');if(f.error)cache.fotosOk=false;else fts=f.data||[];}   // sin glacial_49 no hay fotos, pero lo demás funciona
      if(!cache.semana||cache.semana.anio!==anio||cache.semana.semana!==semana)return;      // mientras tanto se pidió otra semana
      cache.registros=regs;cache.regActs=acts;cache.piezas=pzs;cache.fotos=fts;
    }catch(e){cache.errorSemana=msg(e);}
    avisar();
  }
  /** Historial: los registros de un año (los más recientes primero). El detalle de uno (actividades y piezas) se pide al abrirlo o imprimirlo. */
  async function cargarHistorial(anio){
    const c=sb();if(!c)return;
    cache.anioHistorial=anio;cache.cargandoHistorial=true;cache.errorHistorial='';avisar();
    try{
      const r=await c.from('mtto_registros').select('*').eq('anio',anio).order('semana',{ascending:false}).limit(2000);
      if(r.error)throw r.error;
      if(cache.anioHistorial===anio)cache.historial=r.data||[];
    }catch(e){cache.errorHistorial=msg(e);}
    cache.cargandoHistorial=false;avisar();
  }
  /** {reg, acts, piezas} de un registro cualquiera (de la semana cargada, del historial o del servidor). */
  async function detalleRegistro(id){
    const c=sb();
    const reg=cache.registros.find(r=>r.id===id)||cache.historial.find(r=>r.id===id)||null;if(!reg)return null;
    if(cache.registros.some(r=>r.id===id))return {reg,acts:cache.regActs.filter(a=>a.registro_id===id),piezas:cache.piezas.filter(p=>p.registro_id===id)};
    if(!c)throw new Error('Sin conexión con la base de datos.');
    const [a,z]=await Promise.all([c.from('mtto_registro_actividades').select('*').eq('registro_id',id).order('item').limit(500),c.from('mtto_registro_piezas').select('*').eq('registro_id',id).order('orden')]);
    if(a.error||z.error)throw new Error(msg(a.error||z.error));
    return {reg,acts:a.data||[],piezas:z.data||[]};
  }
  /** Empieza a escuchar (una sola vez): carga inicial + tiempo real. */
  function escuchar(){
    if(activo)return;activo=true;
    cargar();
    const c=sb();if(!c||typeof c.channel!=='function')return;
    let ch=c.channel('mtto-plan-anual');
    ['mtto_maquinas','mtto_plan_actividades','mtto_config','mtto_registros','mtto_registro_actividades','mtto_registro_piezas','mtto_registro_fotos'].forEach(t=>{ch=ch.on('postgres_changes',{event:'*',schema:'public',table:t},p=>alCambio(t,p));});
    ch.subscribe(estado=>{
      const vivo=estado==='SUBSCRIBED';
      if(vivo!==cache.enVivo){cache.enVivo=vivo;avisar();}
      if(vivo&&cache.listo){cargar();if(cache.semana)cargarSemana(cache.semana.anio,cache.semana.semana);if(cache.anioHistorial!==null)cargarHistorial(cache.anioHistorial);}                       // al reconectar se vuelve a leer, por si hubo cambios mientras se cayó la conexión
    });
    canal=ch;
  }
  function detener(){
    activo=false;cache.enVivo=false;
    if(canal&&sb()){try{sb().removeChannel(canal);}catch(_){/* ya cerrado */}}
    canal=null;
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detener();cache.maquinas=[];cache.actividades=[];cache.config=null;cache.listo=false;});

  /* ---------- escritura (solo supervisor / jefe de Mantenimiento: lo exigen las reglas RLS) ---------- */
  /** Crea una máquina del plan en una línea (solo supervisor / jefe de Mantenimiento: lo exigen las reglas RLS). Devuelve la máquina creada. */
  async function crearMaquina(nombre,linea){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const n=String(nombre||'').replace(/\s+/g,' ').trim().slice(0,80),l=String(linea||'').trim();
    if(!n)throw new Error('Escribe el nombre de la máquina.');
    if(!N.LINEAS_PLAN.includes(l))throw new Error('Elige la línea de la máquina.');
    if(cache.maquinas.some(m=>(m.linea_impresion||'PET')===l&&String(m.nombre).trim().toLowerCase()===n.toLowerCase()))throw new Error('Ya hay una máquina con ese nombre en '+l+'.');
    const orden=Math.max(0,...cache.maquinas.map(m=>m.orden||0))+1;
    const fila={planta:'AGUA',linea_impresion:l,codigo_hoja:N.codigoHojaNuevo(l,n),nombre:n,orden,activo:true,pendiente_confirmar:false,linea:l==='PET'?null:l};
    const r=await c.from('mtto_maquinas').insert(fila).select();
    if(r.error)throw new Error(msg(r.error));
    if(!r.data||!r.data[0])throw new Error('No se pudo guardar: no tienes permiso para crear máquinas.');
    alCambio('mtto_maquinas',{eventType:'INSERT',new:r.data[0]});return r.data[0];
  }
  /** datos: {frecuencia, item, actividad, insumos, n_tecnicos, semanas_por_mes[12], semanas[], es_todo_el_anio}. id + version = edición; sin id = actividad nueva de la máquina. */
  async function guardarActividad(maquinaId,anio,datos,id,version){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const fila={frecuencia:String(datos.frecuencia||'').trim().toUpperCase(),bloque_orden:N.bloqueOrden(datos.frecuencia),item:String(datos.item||'').trim(),
      actividad:String(datos.actividad||'').replace(/\s+/g,' ').trim(),insumos:String(datos.insumos||'').replace(/\s+/g,' ').trim(),
      n_tecnicos:Math.max(0,Math.min(20,Math.round(Number(datos.n_tecnicos))||1)),semanas_por_mes:datos.semanas_por_mes,semanas:datos.semanas,es_todo_el_anio:!!datos.es_todo_el_anio};
    if(!fila.frecuencia||!fila.actividad)throw new Error('Falta la frecuencia o la actividad.');
    let r;
    if(id){
      r=await c.from('mtto_plan_actividades').update(fila).eq('id',id).eq('version',version).select();
      if(r.error)throw new Error(msg(r.error));
      if(!r.data||!r.data.length){await cargar();const e=new Error('Otra persona cambió esta actividad mientras la editabas. Ya se actualizó la pantalla: revisa y vuelve a guardar.');e.conflicto=true;throw e;}
      alCambio('mtto_plan_actividades',{eventType:'UPDATE',new:r.data[0]});
      return r.data[0];
    }
    const mismas=cache.actividades.filter(a=>a.maquina_id===maquinaId&&a.anio===anio);
    fila.maquina_id=maquinaId;fila.anio=anio;fila.orden=ordenNuevo(mismas);
    r=await c.from('mtto_plan_actividades').insert(fila).select();
    if(r.error)throw new Error(msg(r.error));
    alCambio('mtto_plan_actividades',{eventType:'INSERT',new:r.data[0]});
    return r.data[0];
  }
  /** La actividad nueva va al final de su bloque de frecuencia: el bloque lo decide «bloque_orden» y dentro de él, «orden» (el último + 1). */
  const ordenNuevo=acts=>acts.reduce((m,a)=>Math.max(m,a.orden||0),0)+1;
  async function quitarActividad(id){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const r=await c.from('mtto_plan_actividades').delete().eq('id',id).select();
    if(r.error)throw new Error(msg(r.error));
    if(!r.data||!r.data.length)throw new Error('No se pudo quitar: ya no existe o no tienes permiso.');
    alCambio('mtto_plan_actividades',{eventType:'DELETE',old:{id}});
  }


  /* ---------- Registro CFA-CA-F-023: crear, marcar, cerrar, validar ---------- */
  const ahoraIso=()=>new Date().toISOString();
  const hhmmAhora=()=>new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Lima'});
  async function esc1(q){const r=await q;if(r.error)throw new Error(msg(r.error));return r.data;}
  /** Crea el registro de la máquina y la semana con las actividades que manda el plan (o devuelve el que ya existe: único por máquina, año y semana). */
  async function iniciarRegistro(maquina,anio,semana,o){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const previo=cache.registros.find(r=>r.maquina_id===maquina.id&&r.anio===anio&&r.semana===semana);if(previo)return previo;
    const ini=N.inicioRegistros(cache.config);
    if(N.antesDelInicio(anio,semana,ini))throw new Error('Los registros en GLACIAL empiezan en la semana '+ini.semana+' de '+ini.anio+': no se pueden iniciar registros de semanas anteriores.');
    const fecha=o.fecha;
    const fila={maquina_id:maquina.id,anio,semana,fecha,proxima_revision:N.proximaRevision(fecha),tecnico_senior:o.tecnico?o.tecnico.nombre:'',tecnico_senior_id:o.tecnico?String(o.tecnico.id||''):'',
      maquinista:o.maquinista?o.maquinista.nombre:'',maquinista_id:o.maquinista?String(o.maquinista.id||''):'',supervisor:o.supervisor||'',creado_por:o.creadoPor||''};
    const cfg=cache.config&&cache.config.datos||{};if(cfg.horario&&cfg.horario.inicio){fila.hora_inicio_prog=cfg.horario.inicio;fila.hora_fin_prog=cfg.horario.fin;}
    let reg;
    const r=await c.from('mtto_registros').insert(fila).select();
    if(r.error){
      if(/duplicate|unique|23505/i.test(String(r.error.message||r.error.code))){                // otra persona lo creó al mismo tiempo
        const ya=await esc1(c.from('mtto_registros').select('*').eq('maquina_id',maquina.id).eq('anio',anio).eq('semana',semana));
        if(!ya||!ya.length)throw new Error(msg(r.error));reg=ya[0];
      }else throw new Error(msg(r.error));
    }else reg=r.data[0];
    if(!cache.registros.some(x=>x.id===reg.id)){
      alCambio('mtto_registros',{eventType:'INSERT',new:reg});                       // primero el registro: las actividades solo entran al caché si su registro ya está
      const pend=await pendientesDe(maquina.id,anio,semana);                         // «No se realizó» de semanas anteriores que aún no pasaron a otra semana
      const acts=N.actividadesParaRegistro(actividadesDeMaquina(maquina.id,anio),semana,pend).map(a=>Object.assign({registro_id:reg.id},a));
      if(acts.length){const ins=await c.from('mtto_registro_actividades').insert(acts).select();if(ins.error)throw new Error(msg(ins.error));ins.data.forEach(a=>alCambio('mtto_registro_actividades',{eventType:'INSERT',new:a}));}
    }
    return reg;
  }
  /** Pendientes (no realizadas) de semanas anteriores de la máquina que todavía no pasaron a una semana posterior. Si la función de la base no está (glacial_53), no hay pendientes. */
  async function pendientesDe(maquinaId,anio,semana){
    const c=sb();if(!c||typeof c.rpc!=='function')return [];
    const r=await c.rpc('mtto_pendientes_arrastrables',{p_maquina:maquinaId,p_anio:anio,p_semana:semana});
    if(r.error){if(/mtto_pendientes_arrastrables|PGRST202|42883/i.test(String(r.error.message||r.error.code||'')))return [];throw new Error(msg(r.error));}
    return r.data||[];
  }
  /** Al abrir un registro que ya existe y sigue abierto: trae lo que se marcó «No se realizó» después de que se creó (idempotente: una actividad pendiente entra una sola vez). */
  async function traerPendientes(reg){
    const c=sb();if(!c||!reg||!['PENDIENTE','EN_CURSO'].includes(reg.estado))return 0;
    const pend=N.pendientesFaltantes(await pendientesDe(reg.maquina_id,reg.anio,reg.semana),cache.regActs.filter(a=>a.registro_id===reg.id));
    if(!pend.length)return 0;
    const ult=Math.max(0,...cache.regActs.filter(a=>a.registro_id===reg.id).map(a=>a.item||0));
    const filas=N.filasArrastradas(pend).map((a,i)=>Object.assign({registro_id:reg.id,item:ult+i+1},a));
    const ins=await c.from('mtto_registro_actividades').insert(filas).select();if(ins.error)throw new Error(msg(ins.error));
    ins.data.forEach(a=>alCambio('mtto_registro_actividades',{eventType:'INSERT',new:a}));return ins.data.length;
  }
  const actividadesDeMaquina=(maquinaId,anio)=>cache.actividades.filter(a=>a.maquina_id===maquinaId&&a.anio===anio);
  async function actualizarReg(id,campos){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const r=await c.from('mtto_registros').update(campos).eq('id',id).select();
    if(r.error)throw new Error(msg(r.error));
    if(!r.data||!r.data.length)throw new Error('No se pudo guardar: el registro ya no existe o no tienes permiso.');
    alCambio('mtto_registros',{eventType:'UPDATE',new:r.data[0]});return r.data[0];
  }
  /** Marca o desmarca una actividad; al marcar la primera, el registro pasa a EN_CURSO y guarda la hora real de inicio. */
  async function marcarActividad(act,realizado,quien){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const campos={realizado:!!realizado,marcado_por:quien||'',marcado_en:ahoraIso()};if(realizado){campos.no_realizado=false;campos.motivo_no='';}
    const r=await c.from('mtto_registro_actividades').update(campos).eq('id',act.id).select();
    if(r.error)throw new Error(msg(r.error));
    if(!r.data||!r.data.length)throw new Error('No se pudo guardar: la actividad ya no existe o el registro está validado.');
    alCambio('mtto_registro_actividades',{eventType:'UPDATE',new:r.data[0]});
    const reg=cache.registros.find(x=>x.id===act.registro_id);
    if(reg&&reg.estado==='PENDIENTE'&&realizado)await actualizarReg(reg.id,{estado:'EN_CURSO',hora_inicio_real:reg.hora_inicio_real||hhmmAhora()});
    if(realizado)await quitarArrastradaSinTocar(act.id);        // ya no está pendiente: la copia que pasó a la semana siguiente sobra
    return r.data[0];
  }
  /** «No se realizó» con su motivo (obligatorio). Pasa a la semana siguiente hasta que se haga. */
  async function marcarNoRealizada(act,motivo,quien){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const m=String(motivo||'').trim().slice(0,300);if(!m)throw new Error('Escribe el motivo por el que no se realizó.');
    const r=await c.from('mtto_registro_actividades').update({no_realizado:true,motivo_no:m,realizado:false,marcado_por:quien||'',marcado_en:ahoraIso()}).eq('id',act.id).select();
    if(r.error)throw new Error(msg(r.error));
    if(!r.data||!r.data.length)throw new Error('No se pudo guardar: la actividad ya no existe o el registro está validado.');
    alCambio('mtto_registro_actividades',{eventType:'UPDATE',new:r.data[0]});return r.data[0];
  }
  /** Quita la marca «No se realizó» (queda sin decidir) y la copia que ya hubiera pasado a la semana siguiente si nadie la tocó. */
  async function quitarNoRealizada(act){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const r=await c.from('mtto_registro_actividades').update({no_realizado:false,motivo_no:''}).eq('id',act.id).select();
    if(r.error)throw new Error(msg(r.error));
    if(!r.data||!r.data.length)throw new Error('No se pudo guardar: la actividad ya no existe o el registro está validado.');
    alCambio('mtto_registro_actividades',{eventType:'UPDATE',new:r.data[0]});
    await quitarArrastradaSinTocar(act.id);return r.data[0];
  }
  /** Borra la copia arrastrada de una actividad si sigue sin marcar, sin observación y sin fotos. */
  async function quitarArrastradaSinTocar(origenId){
    const c=sb();if(!c)return;
    const q=await c.from('mtto_registro_actividades').select('id,realizado,no_realizado,observacion').eq('origen_actividad_id',origenId);
    if(q.error||!q.data)return;
    for(const h of q.data){
      if(h.realizado||h.no_realizado||String(h.observacion||'').trim())continue;
      if(cache.fotos.some(f=>f.actividad_id===h.id))continue;
      const d=await c.from('mtto_registro_actividades').delete().eq('id',h.id).select();
      if(!d.error&&d.data&&d.data.length)alCambio('mtto_registro_actividades',{eventType:'DELETE',old:{id:h.id}});
    }
  }
  async function guardarObservacion(act,texto,quien){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const r=await c.from('mtto_registro_actividades').update({observacion:String(texto||'').slice(0,500),marcado_por:act.marcado_por||quien||'',marcado_en:act.marcado_en||ahoraIso()}).eq('id',act.id).select();
    if(r.error)throw new Error(msg(r.error));
    if(r.data&&r.data[0])alCambio('mtto_registro_actividades',{eventType:'UPDATE',new:r.data[0]});
  }
  /** Solo los campos que cambiaron (el último cambio de cada campo gana y no se pisan los demás). */
  const guardarCampos=(id,campos)=>actualizarReg(id,campos);
  async function guardarPieza(registroId,orden,descripcion){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const r=await c.from('mtto_registro_piezas').upsert({registro_id:registroId,orden,descripcion:String(descripcion||'').slice(0,200)},{onConflict:'registro_id,orden'}).select();
    if(r.error)throw new Error(msg(r.error));
    if(r.data&&r.data[0])alCambio('mtto_registro_piezas',{eventType:'UPDATE',new:r.data[0]});
  }
  /** Guarda la referencia de una foto YA subida a Storage (primero el archivo, después la referencia: nunca queda una referencia a un archivo que no existe). */
  async function agregarFoto(registroId,{ruta,actividadId,descripcion,quien}){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const r=await c.from('mtto_registro_fotos').insert({registro_id:registroId,actividad_id:actividadId||null,ruta,descripcion:String(descripcion||'').slice(0,200),subido_por:quien||''}).select();
    if(r.error){if(/20 fotos|23514/i.test(String(r.error.message||r.error.code)))throw new Error('Un registro admite hasta 20 fotos.');throw new Error(msg(r.error));}
    if(r.data&&r.data[0])alCambio('mtto_registro_fotos',{eventType:'INSERT',new:r.data[0]});
    return r.data&&r.data[0];
  }
  async function guardarDescripcionFoto(id,texto){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const r=await c.from('mtto_registro_fotos').update({descripcion:String(texto||'').slice(0,200)}).eq('id',id).select();
    if(r.error)throw new Error(msg(r.error));
    if(r.data&&r.data[0])alCambio('mtto_registro_fotos',{eventType:'UPDATE',new:r.data[0]});
  }
  /** Quita la referencia (el archivo queda en Storage: las reglas no permiten borrarlo desde la página). Solo el supervisor. */
  async function quitarFoto(id){
    const c=sb();if(!c)throw new Error('Sin conexión con la base de datos.');
    const r=await c.from('mtto_registro_fotos').delete().eq('id',id).select();
    if(r.error)throw new Error(msg(r.error));
    if(!r.data||!r.data.length)throw new Error('No se pudo quitar: ya no existe o no tienes permiso.');
    alCambio('mtto_registro_fotos',{eventType:'DELETE',old:{id}});
  }
  const cerrarRegistro=(reg,quien)=>actualizarReg(reg.id,{estado:'CERRADO',hora_fin_real:reg.hora_fin_real||hhmmAhora(),tecnico_senior:reg.tecnico_senior||quien||''});
  const validarRegistro=(reg,quien)=>actualizarReg(reg.id,{estado:'VALIDADO',supervisor:quien||reg.supervisor||''});
  const reabrirRegistro=reg=>actualizarReg(reg.id,{estado:'EN_CURSO'});

  const API={cache,escuchar,detener,cargar,cargarSemana,cargarHistorial,detalleRegistro,crearMaquina,iniciarRegistro,traerPendientes,cargarEjecucion,ejecucion,marcarActividad,marcarNoRealizada,quitarNoRealizada,guardarObservacion,guardarCampos,guardarPieza,agregarFoto,quitarFoto,guardarDescripcionFoto,alCambioRemoto:f=>{if(typeof f==='function')remotos.push(f);},cerrarRegistro,validarRegistro,reabrirRegistro,guardarActividad,quitarActividad,ordenNuevo,alCambiar:f=>oyentes.push(f),usarCliente:c=>{cliente=c;},mensajeError:msg,
    actividadesDe:(maquinaId,anio)=>cache.actividades.filter(a=>a.maquina_id===maquinaId&&a.anio===anio).sort((a,b)=>(a.orden||0)-(b.orden||0)),
    anios:()=>[...new Set(cache.actividades.map(a=>a.anio))].sort((a,b)=>b-a)};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  window.glacialMttoPlanDatos=API;
})();
