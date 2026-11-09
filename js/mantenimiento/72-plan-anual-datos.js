/* =====================================================================================================================
   MANTENIMIENTO · PLAN ANUAL · datos (tablas mtto_* de la migración glacial_47) · docs/mantenimiento/plan-y-registro.md
   Lee las máquinas y las actividades del plan con el cliente de Supabase de la sesión (las reglas RLS deciden quién lee y quién escribe)
   y escucha los cambios en tiempo real (supabase_realtime): lo que edita el supervisor aparece en los demás dispositivos sin recargar.
   Cada actividad lleva «version»: al guardar se exige la versión que la persona vio; si otra persona la cambió, no se pisa.
   ===================================================================================================================== */
(function(){
  'use strict';
  const N=window.glacialMttoPlan;
  const cache={maquinas:[],actividades:[],config:null,listo:false,cargando:false,error:'',enVivo:false,registros:[],regActs:[],semana:null,errorSemana:''};
  const oyentes=[];
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
  function alCambio(tabla,p){
    const t=p&&p.eventType,n=p&&p.new,o=p&&p.old;
    if(tabla==='mtto_maquinas'){
      if(t==='DELETE'&&o)cache.maquinas=cache.maquinas.filter(x=>x.id!==o.id);else if(n&&n.id){reemplazar(cache.maquinas,n);cache.maquinas=ordenM(cache.maquinas);}
    }else if(tabla==='mtto_plan_actividades'){
      if(t==='DELETE'&&o)cache.actividades=cache.actividades.filter(x=>x.id!==o.id);else if(n&&n.id)reemplazar(cache.actividades,n);
    }else if(tabla==='mtto_config'&&n)cache.config=n;
    else if(tabla==='mtto_registros'){
      const sm=cache.semana;
      if(t==='DELETE'&&o)cache.registros=cache.registros.filter(x=>x.id!==o.id);
      else if(n&&n.id&&sm&&n.anio===sm.anio&&n.semana===sm.semana)reemplazar(cache.registros,n);
    }else if(tabla==='mtto_registro_actividades'){
      if(t==='DELETE'&&o)cache.regActs=cache.regActs.filter(x=>x.id!==o.id);
      else if(n&&n.id&&cache.registros.some(r=>r.id===n.registro_id))reemplazar(cache.regActs,n);
    }
    avisar();
  }
  /** Registros de UNA semana (y sus actividades): lo que muestra el Programa semanal. */
  async function cargarSemana(anio,semana){
    const c=sb();if(!c)return;
    cache.semana={anio,semana};cache.errorSemana='';
    try{
      const r=await c.from('mtto_registros').select('*').eq('anio',anio).eq('semana',semana);
      if(r.error)throw r.error;
      const regs=r.data||[];let acts=[];
      if(regs.length){
        const a=await c.from('mtto_registro_actividades').select('*').in('registro_id',regs.map(x=>x.id)).order('item').limit(5000);
        if(a.error)throw a.error;acts=a.data||[];
      }
      if(!cache.semana||cache.semana.anio!==anio||cache.semana.semana!==semana)return;      // mientras tanto se pidió otra semana
      cache.registros=regs;cache.regActs=acts;
    }catch(e){cache.errorSemana=msg(e);}
    avisar();
  }
  /** Empieza a escuchar (una sola vez): carga inicial + tiempo real. */
  function escuchar(){
    if(activo)return;activo=true;
    cargar();
    const c=sb();if(!c||typeof c.channel!=='function')return;
    let ch=c.channel('mtto-plan-anual');
    ['mtto_maquinas','mtto_plan_actividades','mtto_config','mtto_registros','mtto_registro_actividades'].forEach(t=>{ch=ch.on('postgres_changes',{event:'*',schema:'public',table:t},p=>alCambio(t,p));});
    ch.subscribe(estado=>{
      const vivo=estado==='SUBSCRIBED';
      if(vivo!==cache.enVivo){cache.enVivo=vivo;avisar();}
      if(vivo&&cache.listo){cargar();if(cache.semana)cargarSemana(cache.semana.anio,cache.semana.semana);}                       // al reconectar se vuelve a leer, por si hubo cambios mientras se cayó la conexión
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

  const API={cache,escuchar,detener,cargar,cargarSemana,guardarActividad,quitarActividad,ordenNuevo,alCambiar:f=>oyentes.push(f),usarCliente:c=>{cliente=c;},mensajeError:msg,
    actividadesDe:(maquinaId,anio)=>cache.actividades.filter(a=>a.maquina_id===maquinaId&&a.anio===anio).sort((a,b)=>(a.orden||0)-(b.orden||0)),
    anios:()=>[...new Set(cache.actividades.map(a=>a.anio))].sort((a,b)=>b-a)};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  window.glacialMttoPlanDatos=API;
})();
