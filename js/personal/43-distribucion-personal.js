/* =============================================================
   GLACIAL · DISTRIBUCIÓN DE PERSONAL POR LÍNEA (fuente compartida)
   -------------------------------------------------------------
   El supervisor declara cuántas personas hay en cada línea (PET1, PET2, B7L, C20L, B20L) por fecha operativa y BLOQUE
   (Día incluye Intermedio; Noche aparte). Tareo la edita; Avance/Cierre y los reportes la CONSULTAN al corte. Nadie guarda
   cantidades propias.

   Datos (Firestore, sin tocar lo existente):
     distribucionPersonal/{AAAA-MM-DD}_{DIA|NOCHE}            versión y resumen (version, ultimoDesdeMs, ultimaLineas)
     distribucionPersonal/{...}/eventos/{opId}                 un evento por cambio; solo se crea (historial inmutable)
   Evento: {opId, version, desdeMs, lineas:{PET1..B20L: entero | null}, apoyoCompartido, total, anterior, motivo,
            observaciones, correccion, uid, usuario, guardadoEn (hora del SERVIDOR)}.
   · desdeMs = hora EFECTIVA desde la que aplica; guardadoEn = cuándo se guardó (datos distintos).
   · lineas es el vector COMPLETO de ese momento: null = sin confirmar (desconocido); 0 = cero confirmado.
   · El evento vigente a un corte es el de mayor desdeMs ≤ corte (empate: mayor versión). Corregir no borra: agrega otro evento.
   · apoyoCompartido: personal de apoyo que sirve a varias líneas; se registra aparte y NO se suma a las líneas (no se duplica).
   · Las horas hombre son horas de ASIGNACIÓN A LÍNEA: suma de personal asignado × duración de cada intervalo (no descuentan
     paradas de máquina ni refrigerio).
   ============================================================= */
(function instalarDistribucionPersonal(){
  'use strict';
  const LINEAS=['PET1','PET2','B7L','C20L','B20L'];
  const MS_H=3600000;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const bloqueDe=t=>String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DIA';
  const turnoDe=b=>bloqueDe(b)==='NOCHE'?'NOCHE':'DÍA';
  const clave=(fecha,bloque)=>String(fecha)+'_'+bloqueDe(bloque);
  const falla=(codigo,msg)=>{const e=new Error(msg);e.codigo=codigo;return e;};

  /* ---------- validación y armado de un evento (puro) ---------- */
  /* Cantidades por línea → {lineas, errores}. Vacío/null = sin confirmar; entero ≥ 0 (0 = confirmado en cero). */
  function normalizarLineas(entrada){
    const lineas={},errores=[];
    LINEAS.forEach(l=>{
      const v=entrada?entrada[l]:undefined;
      if(v===undefined||v===null||v===''){lineas[l]=null;return;}
      const n=Number(v);
      if(!Number.isInteger(n)||n<0){errores.push(l+': debe ser un número entero mayor o igual a 0');lineas[l]=null;return;}
      lineas[l]=n;
    });
    return {lineas,errores};
  }
  const totalDe=lineas=>LINEAS.reduce((s,l)=>s+(lineas[l]===null||lineas[l]===undefined?0:lineas[l]),0);

  /* parent: documento de versión actual (o null). entrada: {opId, versionEsperada, desdeMs, lineas, apoyoCompartido, motivo,
     observaciones, correccion}. ctx: {ahoraMs, horario:{inicio,fin}, puedeCorregir, uid, usuario}.
     Devuelve {evento, parent} o lanza Error con .codigo (CONFLICTO, CORRECCION, VALIDACION). */
  function prepararEvento(parent,entrada,ctx){
    const version=parent?num(parent.version):0;
    if(!entrada||!String(entrada.opId||'').trim())throw falla('VALIDACION','Falta el identificador de la operación.');
    if(num(entrada.versionEsperada)!==version)throw falla('CONFLICTO','La distribución cambió mientras la editabas (otra persona guardó). Vuelve a abrirla para ver los valores actuales.');
    const {lineas,errores}=normalizarLineas(entrada.lineas);
    if(errores.length)throw falla('VALIDACION',errores.join(' · '));
    if(LINEAS.every(l=>lineas[l]===null))throw falla('VALIDACION','Indica el personal de al menos una línea (0 también es un dato válido).');
    let apoyo=0;
    if(entrada.apoyoCompartido!==undefined&&entrada.apoyoCompartido!==null&&entrada.apoyoCompartido!==''){
      apoyo=Number(entrada.apoyoCompartido);
      if(!Number.isInteger(apoyo)||apoyo<0)throw falla('VALIDACION','El apoyo compartido debe ser un entero mayor o igual a 0.');
    }
    const desde=Number(entrada.desdeMs);
    if(!Number.isFinite(desde))throw falla('VALIDACION','Indica la hora desde la que aplica.');
    const h=ctx.horario;
    if(!h||desde<h.inicio||desde>h.fin)throw falla('VALIDACION','La hora debe estar dentro del bloque seleccionado.');
    if(desde>num(ctx.ahoraMs)+60000)throw falla('VALIDACION','No se puede confirmar una hora futura.');
    const motivo=String(entrada.motivo||'').trim();
    const ultimo=parent?num(parent.ultimoDesdeMs):0;
    const retroactiva=!!parent&&desde<ultimo;
    if(retroactiva){
      if(!entrada.correccion||!ctx.puedeCorregir)throw falla('CORRECCION','Cambiar una hora anterior a la última registrada es una corrección: requiere permiso de corrección.');
      if(motivo.length<5)throw falla('CORRECCION','Una corrección retroactiva exige el motivo (mínimo 5 caracteres).');
    }
    if(parent&&motivo.length<5)throw falla('VALIDACION','Para registrar un cambio indica el motivo (mínimo 5 caracteres).');
    const evento={
      opId:String(entrada.opId),version:version+1,desdeMs:desde,lineas,apoyoCompartido:apoyo,total:totalDe(lineas),
      anterior:parent&&parent.ultimaLineas?parent.ultimaLineas:null,motivo,observaciones:String(entrada.observaciones||'').trim(),
      correccion:retroactiva,uid:String(ctx.uid||''),usuario:String(ctx.usuario||'')
    };
    const nuevoUltimo=Math.max(ultimo,desde);
    return {
      evento,
      parent:{version:version+1,ultimoDesdeMs:nuevoUltimo,ultimaLineas:desde>=ultimo?lineas:(parent.ultimaLineas||lineas)}
    };
  }

  /* ---------- consulta al corte (puro) ---------- */
  function vigente(eventos,tMs){
    let mejor=null;
    (eventos||[]).forEach(e=>{
      if(!e||num(e.desdeMs)>tMs)return;
      if(!mejor||num(e.desdeMs)>num(mejor.desdeMs)||(num(e.desdeMs)===num(mejor.desdeMs)&&num(e.version)>num(mejor.version)))mejor=e;
    });
    return mejor;
  }
  /* Personal de una línea vigente al corte: CONFIRMADO (cantidad, 0 incluido) o PENDIENTE (sin confirmar). */
  function personalAlCorte(eventos,linea,corteMs){
    const e=vigente(eventos,corteMs);
    const v=e&&e.lineas?e.lineas[linea]:null;
    if(!e||v===null||v===undefined)return {estado:'PENDIENTE',cantidad:null,desdeMs:e?num(e.desdeMs):null,version:e?num(e.version):null,opId:e?e.opId:null};
    return {estado:'CONFIRMADO',cantidad:num(v),desdeMs:num(e.desdeMs),version:num(e.version),opId:e.opId,apoyoCompartido:num(e.apoyoCompartido)};
  }
  /* Horas hombre de ASIGNACIÓN a una línea entre inicio y corte: Σ personal × duración (h) de cada intervalo con dato.
     Los huecos sin dato NO cuentan como cero: se informa cobertura y estado COMPLETO / PARCIAL / SIN_DATOS. */
  function horasHombre(eventos,linea,inicioMs,corteMs){
    const total=corteMs-inicioMs;
    const vacio={horas:null,estado:'SIN_DATOS',cobertura:0,minutosSinDato:total>0?Math.round(total/60000):0,segmentos:[]};
    if(!(total>0))return {...vacio,minutosSinDato:0};
    const puntos=[inicioMs,corteMs];
    (eventos||[]).forEach(e=>{const d=num(e.desdeMs);if(d>inicioMs&&d<corteMs)puntos.push(d);});
    const orden=[...new Set(puntos)].sort((a,b)=>a-b);
    let horas=0,conDato=0;const segmentos=[];
    for(let i=0;i<orden.length-1;i++){
      const a=orden[i],b=orden[i+1],e=vigente(eventos,a),v=e&&e.lineas?e.lineas[linea]:null;
      if(v===null||v===undefined){segmentos.push({desdeMs:a,hastaMs:b,personal:null});continue;}
      horas+=num(v)*(b-a)/MS_H;conDato+=b-a;
      segmentos.push({desdeMs:a,hastaMs:b,personal:num(v)});
    }
    const sinDato=total-conDato;
    return {horas:conDato>0?horas:null,estado:conDato===0?'SIN_DATOS':(sinDato===0?'COMPLETO':'PARCIAL'),cobertura:conDato/total,minutosSinDato:Math.round(sinDato/60000),segmentos};
  }
  /* Total de la planta: suma de las líneas con dato; el estado es el peor de las líneas. */
  function horasHombrePlanta(eventos,inicioMs,corteMs){
    const porLinea={};let horas=0,alguna=false;
    LINEAS.forEach(l=>{
      const r=horasHombre(eventos,l,inicioMs,corteMs);porLinea[l]=r;
      if(r.horas!==null){horas+=r.horas;alguna=true;}
    });
    const todasSin=LINEAS.every(l=>porLinea[l].estado==='SIN_DATOS');
    return {horas:alguna?horas:null,estado:todasSin?'SIN_DATOS':(LINEAS.every(l=>porLinea[l].estado==='COMPLETO')?'COMPLETO':'PARCIAL'),porLinea};
  }
  /* Comparación con el personal disponible (asistentes de Producción del Tareo): solo aviso, nunca una cifra inventada. */
  function compararConDisponible(distribuido,disponible){
    if(disponible===null||disponible===undefined||!Number.isFinite(Number(disponible)))return {estado:'NO_COMPROBABLE',mensaje:'No se puede comprobar: el Tareo del bloque no tiene asistencia.'};
    const d=num(distribuido)-num(disponible);
    if(d===0)return {estado:'COINCIDE',diferencia:0,mensaje:'Coincide con el personal disponible.'};
    return {estado:'REVISAR',diferencia:d,mensaje:d>0?'Se distribuyeron '+d+' más que el personal disponible: revisar.':'Faltan '+(-d)+' por distribuir respecto al personal disponible.'};
  }

  /* ---------- permisos y contexto ---------- */
  const puedeEditar=()=>typeof tienePermiso==='function'&&tienePermiso('distribuirPersonal');
  /* Corregir horas anteriores: Administrador y Jefe de Producción. */
  const puedeCorregir=()=>{const r=(typeof state!=='undefined'&&state.user&&state.user.rol)||'';return r==='Administrador'||r==='Jefe de Producción';};
  const usuarioActual=()=>{
    const u=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;
    return {uid:(u&&u.uid)||'',nombre:(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||''};
  };
  const ahoraServidor=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const cfgBloques=()=>{try{const c=typeof window.glacialConfigIndicadores==='function'?window.glacialConfigIndicadores():null;return c?c.bloques:undefined;}catch(_){return undefined;}};
  const horarioDe=(fecha,bloque)=>window.GlacialIndicadores.horarioBloque(fecha,turnoDe(bloque),cfgBloques());

  /* ---------- Firestore ---------- */
  const cache={};                 // clave → {parent, eventos, listo}
  const oyentes=[];               // funciones avisadas cuando cambia algo
  const cierres=[];
  const serverTs=()=>firebase.firestore.FieldValue.serverTimestamp();
  const ref=(fecha,bloque)=>db.collection('distribucionPersonal').doc(clave(fecha,bloque));
  const marca=v=>v&&typeof v.toMillis==='function'?v.toMillis():num(v);
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no debe romper a otra */}});

  /* Escucha en vivo un (fecha, bloque). Devuelve la función que la cierra; al cerrar sesión se cierran todas. */
  function escuchar(fecha,bloque){
    const k=clave(fecha,bloque);
    cache[k]=cache[k]||{parent:null,eventos:[],listo:false};
    const r=ref(fecha,bloque);
    const u1=r.onSnapshot(s=>{cache[k].parent=s.exists?s.data():null;cache[k].listo=true;avisar();},()=>{});
    const u2=r.collection('eventos').orderBy('desdeMs').onSnapshot(q=>{
      cache[k].eventos=q.docs.map(d=>{const x=d.data();return {...x,guardadoEnMs:marca(x.guardadoEn)};});avisar();
    },()=>{});
    const cerrar=()=>{try{u1();}catch(_){/* ya cerrada */}try{u2();}catch(_){/* ya cerrada */}};
    cierres.push(cerrar);
    return cerrar;
  }
  /* Lectura única (para consultar un día/bloque que no se está escuchando). */
  async function cargar(fecha,bloque){
    const k=clave(fecha,bloque);
    const [p,q]=await Promise.all([ref(fecha,bloque).get(),ref(fecha,bloque).collection('eventos').orderBy('desdeMs').get()]);
    cache[k]={parent:p.exists?p.data():null,eventos:q.docs.map(d=>{const x=d.data();return {...x,guardadoEnMs:marca(x.guardadoEn)};}),listo:true};
    avisar();
    return cache[k];
  }
  const datos=(fecha,bloque)=>cache[clave(fecha,bloque)]||{parent:null,eventos:[],listo:false};

  /* Guarda UN evento en una sola transacción: versión + evento. Un reintento con el mismo opId devuelve el evento ya guardado
     (no duplica). Si otra persona guardó antes, falla con CONFLICTO y no se pisa nada. */
  async function guardar(fecha,bloque,entrada){
    if(!puedeEditar())throw falla('PERMISO','No tienes permiso para registrar la distribución de personal.');
    const u=usuarioActual();
    const r=ref(fecha,bloque),evRef=r.collection('eventos').doc(String(entrada.opId||''));
    const ctx={ahoraMs:ahoraServidor(),horario:horarioDe(fecha,bloque),puedeCorregir:puedeCorregir(),uid:u.uid,usuario:u.nombre};
    let resultado=null;
    await db.runTransaction(async tx=>{
      resultado=null;
      const ya=await tx.get(evRef);
      if(ya.exists){resultado={duplicado:true,evento:ya.data()};return;}
      const ps=await tx.get(r);
      const prep=prepararEvento(ps.exists?ps.data():null,entrada,ctx);
      tx.set(evRef,{...prep.evento,fecha,bloque:bloqueDe(bloque),guardadoEn:serverTs()});
      tx.set(r,{...prep.parent,fecha,bloque:bloqueDe(bloque),actualizadoEn:serverTs(),actualizadoUid:u.uid});
      resultado={duplicado:false,evento:prep.evento};
    });
    return resultado;
  }

  /* ---------- servicio de consulta compartido (Avance/Cierre, reportes) ---------- */
  function consultar(fecha,bloque,linea,corteMs){
    const d=datos(fecha,bloque);
    return {...personalAlCorte(d.eventos,linea,corteMs),sincronizado:d.listo};
  }
  function consultarHorasHombre(fecha,bloque,linea,inicioMs,corteMs){
    const d=datos(fecha,bloque);
    return {...horasHombre(d.eventos,linea,inicioMs,corteMs),sincronizado:d.listo};
  }

  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{
    cierres.splice(0).forEach(c=>c());
    Object.keys(cache).forEach(k=>delete cache[k]);
  });

  window.glacialDistribucionPersonal={
    LINEAS,clave,bloqueDe,normalizarLineas,totalDe,prepararEvento,vigente,personalAlCorte,horasHombre,horasHombrePlanta,compararConDisponible,
    escuchar,cargar,datos,guardar,consultar,consultarHorasHombre,puedeEditar,puedeCorregir,
    alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};},
    horarioDe
  };
})();
