/* =============================================================
   RECLASIFICAR PARADAS · persistencia, lectura en vivo y reglas de la reclasificación

   Una parada ya registrada (Avance/Cierre o Nuevo registro) NO se modifica nunca. Quien reclasifica (Supervisor de Mantenimiento / Administrador) guarda
   APARTE, en la colección reclasificacionesParada, la causa, el motivo, el detalle y el equipo que le corresponden; Análisis de paradas y sus Excel
   muestran ese valor con la marca «reclasificada» y el original visible. Los minutos, la disponibilidad y el ratio NO cambian (solo cambia la etiqueta).

   UN documento por parada. Su id es el id de la parada:
     · Avance/Cierre: el id propio de la parada (avp_…).
     · Nuevo registro: el id de la fila si lo tiene; si no, uno ESTABLE armado con el registro y su posición: reg:<idRegistro>:<cuadro>:<lista>:<fila>
       (el mismo que usa Avance/Cierre, avIdParadaRegistro; 23b lo entrega en cada parada). Una vez usado no se cambia: reordenar o borrar filas de un
       registro ya reclasificado puede desalinear la posición, por eso la reclasificación guarda también la descripción original y los minutos.
     · El id del documento es ese id con «/» cambiado por «_» (los ids de documento no admiten «/»); paradaId conserva el original.
   Campos: id, paradaId, origen ('AVANCE'|'REGISTRO'), linea, fecha, turno, descripcionOriginal, minutos, causa, motivo, detalle, equipo, version,
   actualizadaUid, actualizadaPor, actualizadaEn (hora del servidor) e historial [{id, ts, uid, por, antes:{causa,motivo,detalle,equipo}, despues:{…}, razon}].
   Se crea con version 1 y UNA entrada de historial; cada cambio sube version en 1 y AGREGA una entrada (el historial nunca se acorta ni se edita).
   Cada acción es una TRANSACCIÓN (lee lo último, escribe version+1): dos supervisores no se pisan. Reclasificar un grupo es una sola transacción.
   Quién escribe: Supervisor de Mantenimiento y Administrador (no la cuenta compartida, no jefatura ni consulta). Leen quienes ven Mantenimiento.
   Lectura: solo el rango de fechas que alguna pantalla pidió (fecha >= desde y fecha <= hasta), en vivo.
   Sin increment/arrayUnion/where in/!=/update con rutas: compatible con el puente de Supabase.
   Cargar después de 67b-intervenciones-datos.js (usa sus permisos y la identidad de quien actúa) y de 37e-motivos-parada.js.
   ============================================================= */
(function(){
  'use strict';
  const COLECCION='reclasificacionesParada';
  const MIN_RAZON=5;
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const sinConexion=()=>!!(window.glacialEstadoDatos&&window.glacialEstadoDatos.enLinea===false);
  const API=()=>window.glacialIntervenciones;
  const clon=v=>JSON.parse(JSON.stringify(v));

  const idDoc=paradaId=>String(paradaId||'').replace(/\//g,'_').slice(0,200);

  /* ---------- agrupar descripciones parecidas (solo visual) ---------- */
  const ABREVIATURAS={env:'envasadora',envas:'envasadora',sop:'sopladora',etiq:'etiquetadora',empaq:'empaquetadora',emp:'empaquetadora',comp:'compresor',calib:'calibracion',mant:'mantenimiento'};
  const RELLENO=new Set(['parada','parad','paro','paros','por','de','del','la','el','los','las','en','a','y','x','un','una']);
  /* «parada por env», «parad por env» y «parada por envasadora» dan la misma clave. «env» = «envasadora» solo aquí, para agrupar: no cambia ningún texto. */
  function claveGrupo(texto){
    const t=norm(texto).replace(/[^a-z0-9ñ ]+/g,' ').replace(/\s+/g,' ').trim();
    const palabras=t.split(' ').filter(Boolean).filter(p=>!RELLENO.has(p)).map(p=>ABREVIATURAS[p]||p);
    return palabras.join(' ')||t||'(sin descripción)';
  }

  /* ---------- sugerencia de causa según el texto (solo sugerencia: nada se guarda sin confirmar) ---------- */
  const REGLAS=[
    ['Servicios (agua, aire comprimido, energía)',/\b(agua|aire|compresor|presion|energia|luz|corte|vapor|caldero|caldera)\b/],
    ['Falta de insumos',/\b(insumo|insumos|preforma|preformas|tapa|tapas|etiqueta|etiquetas|paleta|paletas|material|materiales|envase|envases|botella|botellas|film|stretch|jarabe)\b/],
    ['Falta de personal o apoyo a otra línea',/\b(personal|apoyo|rotacion|operario|operarios|gente|ayuda)\b/],
    ['Calidad / producto no conforme',/\b(calidad|no conforme|rechazo|contamin\w*|muestra)\b/],
    ['Ajuste o calibración',/\b(calibr\w*|ajust\w*|regul\w*|llenado|carril|guia|atasco|atasc\w*|formato|cambio)\b/],
    ['Falla de máquina',/\b(falla|fallo|averia|roto|rota|rompio|trabo|trabado|motor|sensor|mantenimiento|reparacion|reparar)\b/]
  ];
  function sugerirCausa(texto){
    const t=' '+norm(texto)+' ';
    const M=window.glacialMotivosParada;
    for(const [causa,re] of REGLAS){
      if(!re.test(t))continue;
      const c=M&&M.causaPorNombre?M.causaPorNombre(causa):null;
      if(M&&(!c||!c.activa))continue;                       // solo causas que el catálogo ofrece
      const ms=c?c.motivos.filter(x=>x.activo):[];
      return {causa:c?c.nombre:causa,motivo:ms.length===1?ms[0].nombre:''};
    }
    return null;
  }

  /* ---------- qué paradas son candidatas a reclasificar ---------- */
  /* Causa «Otro», vacía o antigua (sin motivo de catálogo). Siempre sobre los valores ORIGINALES de la parada. */
  function esCandidata(it){
    if(!it||it.clasif!=='NO_PROGRAMADA'||!it.id)return false;
    if(it.origen!=='AVANCE'&&it.origen!=='REGISTRO')return false;
    const causa=norm(it.causa);
    return !causa||causa==='otro'||!String(it.motivoCat||'').trim();
  }
  const valoresDe=x=>({causa:String(x&&x.causa||''),motivo:String(x&&(x.motivo!==undefined?x.motivo:x.motivoCat)||''),detalle:String(x&&x.detalle||''),equipo:String(x&&x.equipo||'')});

  /* ---------- permisos ---------- */
  const permisos=()=>API()?API().permisos():{ver:false,escribir:false,puedeCorregir:false};
  const puedeReclasificar=()=>!!permisos().puedeCorregir;
  const compartida=()=>typeof window.esMantCompartido==='function'&&window.esMantCompartido();
  const puedeVer=()=>!!permisos().ver&&!compartida();           // la cuenta compartida no lee reclasificaciones (reglas)

  /* ---------- lectura en vivo por rango de fechas ---------- */
  const S={docs:new Map(),desde:'',hasta:'',desub:null,listo:false,error:''};
  const oyentes=[];
  const avisar=()=>{
    oyentes.slice().forEach(f=>{try{f();}catch(e){console.warn('Reclasificaciones:',e&&e.message||e);}});
    try{if(window.glacialAnalisisParadas&&window.glacialAnalisisParadas.refrescar)window.glacialAnalisisParadas.refrescar();}catch(_){/* sin pantalla */}   // el Pareto se actualiza al instante
  };
  const alCambiar=f=>{if(typeof f==='function'&&!oyentes.includes(f))oyentes.push(f);};
  function suscribir(){
    if(S.desub){try{S.desub();}catch(_){/* ya cerrada */}S.desub=null;}
    if(typeof db==='undefined'||typeof state==='undefined'||!state.user||!puedeVer()||!S.desde||!S.hasta)return;
    S.listo=false;S.error='';
    try{
      S.desub=db.collection(COLECCION).where('fecha','>=',S.desde).where('fecha','<=',S.hasta).onSnapshot(snap=>{
        const m=new Map();
        snap.docs.forEach(d=>{const x=d.data({serverTimestamps:'estimate'});m.set(x.paradaId||d.id,Object.assign({},x,{id:d.id,version:Number(x.version)||0}));});
        S.docs=m;S.listo=true;S.error='';avisar();
      },e=>{S.error='No se pudieron cargar las reclasificaciones: '+((e&&e.message)||e);S.listo=true;S.desub=null;avisar();});
    }catch(e){S.error=String((e&&e.message)||e);S.desub=null;}
  }
  /* Pide que se lean las reclasificaciones de [desde, hasta] (fechas AAAA-MM-DD). Si el rango ya está cubierto no hace nada; si no, amplía la lectura. */
  function asegurarRango(desde,hasta){
    if(!desde||!hasta)return;
    const nd=!S.desde||desde<S.desde?desde:S.desde,nh=!S.hasta||hasta>S.hasta?hasta:S.hasta;
    if(S.desub&&nd===S.desde&&nh===S.hasta)return;
    if(!S.desub&&nd===S.desde&&nh===S.hasta&&S.error)return;      // un error ya avisado no se reintenta en cada pintado (lo hace el temporizador)
    S.desde=nd;S.hasta=nh;suscribir();
  }
  function detener(){
    if(S.desub){try{S.desub();}catch(_){/* ya cerrada */}}
    S.desub=null;S.docs=new Map();S.desde='';S.hasta='';S.listo=false;S.error='';
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(detener);
  setInterval(()=>{if(S.desde&&!S.desub&&typeof state!=='undefined'&&state.user)suscribir();},5000);

  const de=paradaId=>S.docs.get(String(paradaId||''))||null;
  /* La parada con su reclasificación aplicada (copia): causa, motivoCat, detalle y equipo nuevos; el original queda en .original. Sin reclasificación, la misma parada. */
  function aplicar(it){
    const r=it&&it.id?de(it.id):null;
    if(!r)return it;
    return Object.assign({},it,{causa:r.causa||'',motivoCat:r.motivo||'',detalle:r.detalle||'',equipo:r.equipo||'',reclasificada:true,reclasifVersion:r.version,
      original:{causa:it.causa||'',motivoCat:it.motivoCat||'',detalle:it.detalle||'',equipo:it.equipo||'',motivo:it.motivo||''}});
  }
  const lista=()=>[...S.docs.values()];

  /* ---------- escritura ---------- */
  const ts=()=>firebase.firestore.FieldValue.serverTimestamp();
  const refDe=id=>db.collection(COLECCION).doc(id);
  const idHist=()=>'h_'+ahora().toString(36)+Math.random().toString(36).slice(2,7);

  /* Error legible o '' si los valores son válidos. */
  function validar(v,linea){
    const M=window.glacialMotivosParada,G=window.glacialEquipos;
    if(M){const e=M.validar(v.causa,v.motivo,v.detalle);if(e)return e;}
    else if(!String(v.causa||'').trim()||!String(v.motivo||'').trim())return 'Elige la causa y el motivo.';
    if(M&&M.pideEquipo(v.causa)&&G){const e=G.validarTexto(v.equipo);if(e)return e;}
    if(String(v.razon||'').trim().length<MIN_RAZON)return 'Escribe el motivo de la reclasificación (mínimo '+MIN_RAZON+' caracteres).';
    return '';
  }

  /* paradas: [{paradaId,origen,linea,fecha,turno,minutos,descripcion,original:{causa,motivo,detalle,equipo}}]; v: {causa,motivo,detalle,equipo,razon}.
     Una sola transacción para todo el grupo. Devuelve {creadas,actualizadas}. */
  async function reclasificar(paradas,v){
    const p=permisos();
    if(!p.puedeCorregir)throw new Error('Solo el Supervisor de Mantenimiento o el Administrador pueden reclasificar paradas.');
    if(sinConexion())throw new Error('Sin conexión: la reclasificación NO se guardó. Inténtalo cuando vuelva la conexión.');
    const q=API().quienActua();
    if(!q||!q.uid)throw new Error('No hay una sesión segura activa: no se puede registrar quién reclasifica.');
    if(!Array.isArray(paradas)||!paradas.length)throw new Error('No hay paradas seleccionadas.');
    if(paradas.length>400)throw new Error('Son demasiadas paradas de una vez (máximo 400): reclasifica por partes.');
    const lineas=new Set(paradas.map(x=>x.linea));
    const err=validar(v,lineas.size===1?[...lineas][0]:'');
    if(err)throw new Error(err);
    const despues={causa:String(v.causa).trim(),motivo:String(v.motivo).trim(),detalle:String(v.detalle||'').trim().slice(0,120),equipo:String(v.equipo||'').trim().slice(0,100)};
    if(!(window.glacialMotivosParada&&window.glacialMotivosParada.pideEquipo(despues.causa)))despues.equipo='';
    const razon=String(v.razon).trim().slice(0,200);
    const t=ahora(),resultado={creadas:0,actualizadas:0,docs:[]};
    await db.runTransaction(async tx=>{
      resultado.creadas=0;resultado.actualizadas=0;resultado.docs=[];
      const snaps=[];
      for(const x of paradas)snaps.push(await tx.get(refDe(idDoc(x.paradaId))));          // todas las lecturas primero
      paradas.forEach((x,i)=>{
        const id=idDoc(x.paradaId),snap=snaps[i];
        const previo=snap.exists?snap.data():null;
        const antes=previo?valoresDe(previo):valoresDe(x.original||{});
        const entrada={id:idHist(),ts:t,uid:q.uid,por:q.nombre||q.cuenta||'',antes,despues:clon(despues),razon};
        const doc=previo?Object.assign({},previo,{causa:despues.causa,motivo:despues.motivo,detalle:despues.detalle,equipo:despues.equipo,
            version:(Number(previo.version)||0)+1,historial:(Array.isArray(previo.historial)?previo.historial.slice():[]).concat([entrada])})
          :{id,paradaId:String(x.paradaId),origen:x.origen,linea:x.linea,fecha:x.fecha,turno:x.turno||'',descripcionOriginal:String(x.descripcion||'').slice(0,200),minutos:Math.round(Number(x.minutos)*10)/10||0,
            causa:despues.causa,motivo:despues.motivo,detalle:despues.detalle,equipo:despues.equipo,version:1,historial:[entrada]};
        doc.actualizadaPor=q.nombre||q.cuenta||'';
        tx.set(refDe(id),Object.assign({},doc,{actualizadaUid:q.uid,actualizadaEn:ts()}));
        if(previo)resultado.actualizadas++;else resultado.creadas++;
        resultado.docs.push(Object.assign({},doc,{actualizadaEn:t}));
      });
    });
    resultado.docs.forEach(d=>S.docs.set(d.paradaId,d));          // esta pestaña lo ve sin esperar al aviso del servidor
    avisar();
    return resultado;
  }

  window.glacialReclasificaciones={COLECCION,MIN_RAZON,idDoc,claveGrupo,sugerirCausa,esCandidata,validar,permisos,puedeReclasificar,puedeVer,asegurarRango,de,aplicar,lista,reclasificar,
    alCambiar,detener,estado:()=>({listo:S.listo,error:S.error,desde:S.desde,hasta:S.hasta,n:S.docs.size})};
})();
