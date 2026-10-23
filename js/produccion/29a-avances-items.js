/* =============================================================
   AVANCES Y CIERRES · UN DOCUMENTO POR SNAPSHOT (colección avancesTurnoItems)
   -------------------------------------------------------------
   PROBLEMA: sync/avancesTurno guardaba TODOS los snapshots en un arreglo (items) y cada avance nuevo pesa 21–35 KB; el documento
   llegó al 97,6 % del límite de Firestore (1 MiB por documento) y el siguiente avance, cierre o guardado de paradas podía fallar.

   SOLUCIÓN:
     · Cada snapshot vive en avancesTurnoItems/{id} (mismo id y mismos campos de siempre + creadoPorUid y creadoEn del servidor).
     · sync/avancesTurno queda con paradasOperativas y updatedAt (el control de conflicto por updatedAt de las paradas no cambia).
     · Crear falla si el id ya existe (también si existe todavía en el documento antiguo): se conservan «el cierre ya fue generado»
       y «el avance HH:MM ya fue generado».
     · Lectura: escucha EN VIVO por fecha / mes (varios dispositivos se ven sin recargar) y consulta por rango para pantallas que
       no necesitan tiempo real (Inicio, reenvíos). Mientras haya items en el documento antiguo, se UNEN con los nuevos sin duplicar por id.
     · Migración (solo Administrador, idempotente): respaldo JSON → copia sin modificar → verificación → recién entonces se quitan
       del documento antiguo SOLO los items verificados. Nada se borra sin respaldo descargado y verificado.
     · Vigilancia: aviso al Administrador cuando un documento de sync supera el 80 % del límite (estimado con la fórmula de Firestore).
   Cargar ANTES de 29-avance-produccion.js.
   ============================================================= */
(function(){
  'use strict';

  const COL='avancesTurnoItems', LEGADO='avancesTurno', LIMITE=1048576;
  const E={legado:[],legadoListo:false,porClave:new Map(),oyentes:new Map(),cambios:[],error:'',legadoBytes:0,legadoCampos:null};

  const esAdmin=()=>!!(typeof state!=='undefined'&&state&&state.user&&String(state.user.rol||'').trim()==='Administrador');
  const colRef=()=>db.collection(COL);
  const legadoRef=()=>db.collection('sync').doc(LEGADO);
  const uidActual=()=>(typeof auth!=='undefined'&&auth&&auth.currentUser&&auth.currentUser.uid)||'';
  const sello=()=>firebase.firestore.FieldValue.serverTimestamp();

  /* El snapshot en memoria es EXACTAMENTE el de antes: sin los campos de control que agrega la colección. */
  function limpiar(d){
    if(!d||typeof d!=='object')return d;
    const o=Object.assign({},d);delete o.creadoPorUid;delete o.creadoEn;delete o.migrado;return o;
  }
  function unir(legado,nuevos){
    const m=new Map();
    (legado||[]).forEach(x=>{if(x&&x.id)m.set(x.id,x);});
    (nuevos||[]).forEach(x=>{if(x&&x.id)m.set(x.id,x);});      // si está en ambos lados, manda el documento nuevo
    return [...m.values()];
  }
  const nuevosEnMemoria=()=>{const o=[];E.porClave.forEach(v=>o.push(...v));return o;};
  const todos=()=>unir(E.legado,nuevosEnMemoria());
  const alCambiar=f=>{if(typeof f==='function'&&!E.cambios.includes(f))E.cambios.push(f);};
  const avisar=()=>E.cambios.slice().forEach(f=>{try{f();}catch(e){console.warn('Avances:',e&&e.message||e);}});

  /* ---------- items del documento antiguo (los entrega 29-avance-produccion.js desde su escucha) ---------- */
  function fijarLegado(data){
    data=data||{};
    E.legado=Array.isArray(data.items)?data.items:[];
    E.legadoListo=true;
    if(esAdmin()){try{E.legadoBytes=estimarBytes(data)+LEGADO.length+32;E.legadoCampos=bytesPorCampo(data);}catch(_){E.legadoBytes=0;}}
    avisar();
  }

  /* ---------- escuchas en vivo ---------- */
  function cerrar(clave){
    const o=E.oyentes.get(clave);
    if(o){try{o.un();}catch(_){/* ya cerrada */}}
    E.oyentes.delete(clave);E.porClave.delete(clave);
  }
  function escucharRango(clave,desde,hasta){
    if(typeof db==='undefined')return;
    const k=desde+'|'+hasta,o=E.oyentes.get(clave);
    if(o&&o.k===k)return;
    cerrar(clave);
    let q=colRef();
    q=desde===hasta?q.where('fecha','==',desde):q.where('fecha','>=',desde).where('fecha','<=',hasta);
    const un=q.onSnapshot(snap=>{
      E.porClave.set(clave,snap.docs.map(d=>limpiar(d.data())));E.error='';avisar();
    },e=>{
      console.error('Avances (colección):',e);E.error=(e&&e.message)||'No se pudo sincronizar';avisar();
    });
    E.oyentes.set(clave,{k,un});
  }
  function cerrarTodo(){
    [...E.oyentes.keys()].forEach(cerrar);
    E.legado=[];E.legadoListo=false;E.error='';E.legadoBytes=0;E.legadoCampos=null;
  }
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(cerrarTodo);

  /* ---------- escritura ---------- */
  /* Crea el snapshot. Falla si el id ya existe en la colección o en el documento antiguo (transición). */
  async function crear(s,mensajeExiste){
    if(!s||!s.id)throw Error('Snapshot sin id.');
    const uid=uidActual();
    if(!uid)throw Error('No hay sesión activa.');
    const ref=colRef().doc(s.id),lref=legadoRef();
    await db.runTransaction(async tx=>{
      const d=await tx.get(ref),l=await tx.get(lref);
      const enLegado=l.exists&&Array.isArray(l.data().items)&&l.data().items.some(x=>x&&x.id===s.id);
      if(d.exists||enLegado)throw Error(mensajeExiste||'Este avance ya fue generado.');
      tx.set(ref,Object.assign({},s,{creadoPorUid:uid,creadoEn:sello()}));
    });
  }

  /* ---------- consultas puntuales ---------- */
  async function consultarRango(desde,hasta){
    const q=desde===hasta?colRef().where('fecha','==',desde):colRef().where('fecha','>=',desde).where('fecha','<=',hasta);
    const snap=await q.get();
    let legado=E.legado;
    if(!E.legadoListo){
      try{const l=await legadoRef().get();legado=l.exists&&Array.isArray(l.data().items)?l.data().items:[];}catch(_){legado=[];}
    }
    return unir(legado.filter(x=>x&&x.fecha>=desde&&x.fecha<=hasta),snap.docs.map(d=>limpiar(d.data())));
  }
  const consultarFecha=f=>consultarRango(f,f);
  async function obtener(id){
    const m=todos().find(x=>x.id===id);
    if(m)return m;
    const d=await colRef().doc(id).get();
    return d.exists?limpiar(d.data()):null;
  }

  /* ---------- tamaño (fórmula de Firestore, estimada) ---------- */
  const utf8=s=>{let n=0;for(const ch of String(s)){const c=ch.codePointAt(0);n+=c<0x80?1:c<0x800?2:c<0x10000?3:4;}return n;};
  function estimarBytes(v){
    if(v===null||v===undefined)return 1;
    if(typeof v==='string')return utf8(v)+1;
    if(typeof v==='number')return 8;
    if(typeof v==='boolean')return 1;
    if(v&&typeof v.toMillis==='function')return 8;
    if(Array.isArray(v))return v.reduce((a,x)=>a+estimarBytes(x),0);
    if(typeof v==='object')return Object.keys(v).reduce((a,k)=>v[k]===undefined?a:a+utf8(k)+1+estimarBytes(v[k]),0);
    return 0;
  }
  const bytesPorCampo=d=>Object.keys(d||{}).reduce((o,k)=>{o[k]=utf8(k)+1+estimarBytes(d[k]);return o;},{});

  /* Medición para decidir si paradasOperativas necesita partirse: tamaño, cuántas paradas, bytes por parada y crecimiento por día. */
  async function medir(){
    const d=await legadoRef().get();
    const data=d.exists?d.data():{};
    const campos=bytesPorCampo(data),total=estimarBytes(data)+LEGADO.length+32;
    const par=Array.isArray(data.paradasOperativas)?data.paradasOperativas:[];
    const fechas=[...new Set(par.map(p=>p&&p.fecha).filter(Boolean))].sort();
    let dias=1;
    if(fechas.length>1)dias=Math.max(1,Math.round((new Date(fechas[fechas.length-1]+'T12:00:00')-new Date(fechas[0]+'T12:00:00'))/86400000)+1);
    const bp=campos.paradasOperativas||0,porDia=fechas.length?bp/dias:0;
    const libre=LIMITE-total;
    return {bytesTotal:total,porcentaje:Math.round(total/LIMITE*1000)/10,campos,items:(data.items||[]).length,paradas:par.length,
      bytesPorParada:par.length?Math.round(bp/par.length):0,desde:fechas[0]||'',hasta:fechas[fechas.length-1]||'',dias,crecimientoBytesDia:Math.round(porDia),
      diasRestantesSoloParadas:porDia>0?Math.floor((LIMITE-(total-(campos.items||0)))/porDia):null,libre};
  }

  /* ---------- migración (solo Administrador, idempotente) ---------- */
  const estable=v=>{
    if(Array.isArray(v))return '['+v.map(estable).join(',')+']';
    if(v&&typeof v==='object')return '{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+estable(v[k])).join(',')+'}';
    return JSON.stringify(v===undefined?null:v);
  };
  function descargarJson(nombre,obj){
    const blob=new Blob([JSON.stringify(obj,null,1)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=nombre;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }
  /* opts.descargar(nombre,objeto) → debe lanzar si no pudo; opts.quitar=false deja los items en el documento antiguo. */
  async function migrar(opts){
    opts=opts||{};
    if(!esAdmin())throw Error('Solo un Administrador puede migrar los avances.');
    const uid=uidActual();if(!uid)throw Error('No hay sesión activa.');
    const lsnap=await legadoRef().get();
    const data=lsnap.exists?lsnap.data():{};
    const items=Array.isArray(data.items)?data.items.filter(x=>x&&x.id):[];
    const r={estado:'',total:items.length,copiados:0,yaExistian:0,conflictos:[],verificados:0,quitados:0,restantes:items.length,respaldo:''};
    if(!items.length){r.estado='nada-que-migrar';return r;}
    // 1) respaldo del documento completo; si no se puede descargar, no se toca nada
    const nombre='respaldo-avancesTurno-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    (opts.descargar||descargarJson)(nombre,{documento:'sync/avancesTurno',generado:new Date().toISOString(),datos:data});
    r.respaldo=nombre;
    // 2) copiar cada item sin modificarlo (si ya existe y es idéntico se cuenta; si difiere, es un conflicto y NO se sobrescribe)
    const pendientes=[];
    for(const it of items){
      const ref=colRef().doc(it.id),ex=await ref.get();
      if(ex.exists){
        if(estable(limpiar(ex.data()))===estable(it))r.yaExistian++;
        else r.conflictos.push(it.id);
      }else pendientes.push(it);
    }
    for(let i=0;i<pendientes.length;i+=10){
      const lote=db.batch();
      pendientes.slice(i,i+10).forEach(it=>lote.set(colRef().doc(it.id),Object.assign({},it,{creadoPorUid:uid,creadoEn:sello(),migrado:true})));
      await lote.commit();
      r.copiados+=Math.min(10,pendientes.length-i);
    }
    // 3) verificar contenido leyendo de vuelta
    const ok=new Set();
    for(const it of items){
      if(r.conflictos.includes(it.id))continue;
      const d=await colRef().doc(it.id).get();
      if(d.exists&&estable(limpiar(d.data()))===estable(it))ok.add(it.id);
      else r.conflictos.push(it.id);
    }
    r.verificados=ok.size;
    if(ok.size!==items.length-r.conflictos.length||r.conflictos.length){r.estado='con-conflictos';r.restantes=items.length;return r;}
    // 4) solo ahora se quitan del documento antiguo, y solo los verificados (no se toca updatedAt ni paradasOperativas)
    if(opts.quitar!==false){
      await db.runTransaction(async tx=>{
        const cur=await tx.get(legadoRef());
        const arr=cur.exists&&Array.isArray(cur.data().items)?cur.data().items:[];
        const quedan=arr.filter(x=>!(x&&ok.has(x.id)));
        r.quitados=arr.length-quedan.length;r.restantes=quedan.length;
        tx.set(legadoRef(),{items:quedan},{merge:true});
      });
    }
    r.estado='migrado';
    return r;
  }
  async function migrarUI(){
    try{
      if(!confirm('Se descargará un respaldo JSON y luego se copiará cada avance/cierre a su propio documento. Los items solo se quitan del documento antiguo cuando la copia queda verificada.\n\n¿Continuar?'))return;
      const r=await migrar();
      alert(r.estado==='nada-que-migrar'?'No hay avances pendientes de migrar.'
        :r.estado==='migrado'?'Migración completa.\nCopiados: '+r.copiados+' · ya existían: '+r.yaExistian+' · verificados: '+r.verificados+' · quitados del documento antiguo: '+r.quitados+'.\nRespaldo: '+r.respaldo
        :'La migración se detuvo SIN borrar nada. Conflictos: '+r.conflictos.join(', ')+'\nRespaldo: '+r.respaldo);
    }catch(e){alert('No se migró nada: '+(e&&e.message||e));}
  }

  /* ---------- vigilancia del tamaño de los documentos de sync (solo Administrador, una vez al día) ---------- */
  const DOCS_SYNC=['users','records','workers','rotaciones','rotacionesMantenimiento','rotacionMaquinistas','tecnicosMant','borradoresNuevoRegistro',
    'tareos','paletas','programaciones','avancesTurno','perfiles','accesos','configTareo','configAlertas','configIndicadores','catalogoPlanificacion','configMantenimiento'];
  const UMBRAL=0.8;
  /* El límite de 1 MiB es por documento de Firestore. En Supabase (puente) una lista cuyos elementos traen una clave única (id, username, clave, opId, email
     o uid) se guarda en una fila por elemento, así que ya no pesa contra ese límite: solo cuenta lo que SÍ queda dentro del documento
     (campos sueltos y listas sin clave única). Sin esto, records y tareos mostraban el aviso aunque cada fila pese unos KB. */
  function sinListasPartidas(data){
    const r={};
    Object.keys(data||{}).forEach(k=>{if(!(Array.isArray(data[k])&&claveDeLista(data[k])))r[k]=data[k];});
    return r;
  }
  async function revisarTamanos(){
    if(!esAdmin()||typeof db==='undefined')return [];
    const altos=[];
    for(const n of DOCS_SYNC){
      try{
        const d=await db.collection('sync').doc(n).get();
        if(!d.exists)continue;
        const b=estimarBytes(sinListasPartidas(d.data()))+n.length+32;
        if(b>=LIMITE*UMBRAL)altos.push({doc:n,bytes:b,porcentaje:Math.round(b/LIMITE*1000)/10});
      }catch(_){/* sin permiso o sin red: se ignora ese documento */}
    }
    return altos;
  }
  /* Medición de documentos de sync (solo Administrador; lee, no escribe). Por cada uno: bytes estimados, % del límite de 1 MiB, n.º de elementos,
     bytes por elemento, rango de fechas y crecimiento por día, y si TODOS los elementos de cada lista traen una clave única (id, username, clave,
     opId, email o uid): en Supabase esas listas se parten en filas (fs_items); si algún elemento no la trae, la lista queda como un solo documento.
     Uso: await glacialAvancesItems.medirSync()  ·  await glacialAvancesItems.medirSync(['programaciones','paletas']) */
  const CLAVES_LISTA=['id','username','clave','opId','email','uid'];
  const claveDeLista=l=>{
    if(!Array.isArray(l)||!l.length||!l.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))return null;
    for(const c of CLAVES_LISTA){const v=new Set();let ok=true;for(const e of l){const t=typeof e[c];if((t!=='string'&&t!=='number')||String(e[c]).length<1||v.has(String(e[c]))){ok=false;break;}v.add(String(e[c]));}if(ok)return c;}
    return null;
  };
  async function medirSync(nombres){
    if(!esAdmin())throw Error('Solo un Administrador puede medir los documentos de sync.');
    const sal=[];
    for(const n of (nombres||['programaciones','paletas','catalogoPlanificacion'])){
      const d=await db.collection('sync').doc(n).get();
      if(!d.exists){sal.push({doc:n,existe:false});continue;}
      const data=d.data(),bytes=estimarBytes(data)+n.length+32;
      const listas=Object.keys(data).filter(k=>Array.isArray(data[k])).map(k=>{
        const l=data[k],fechas=l.map(x=>x&&x.fecha).filter(f=>typeof f==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
        const dias=fechas.length>1?Math.max(1,Math.round((new Date(fechas[fechas.length-1]+'T12:00:00')-new Date(fechas[0]+'T12:00:00'))/86400000)+1):0;
        const bl=utf8(k)+1+estimarBytes(l),clave=claveDeLista(l);
        return {campo:k,elementos:l.length,bytes:bl,bytesPorElemento:l.length?Math.round(bl/l.length):0,desde:fechas[0]||'',hasta:fechas[fechas.length-1]||'',dias,
          crecimientoBytesDia:dias?Math.round(bl/dias):0,claveUnica:clave,seParteEnSupabase:!!clave||!l.length};
      });
      sal.push({doc:n,existe:true,bytes,porcentaje:Math.round(bytes/LIMITE*1000)/10,libre:LIMITE-bytes,listas});
    }
    return sal;
  }
  function avisoTamanos(altos){
    if(!altos.length||typeof document==='undefined')return;
    let b=document.getElementById('sync-tamano-aviso');
    if(!b){b=document.createElement('div');b.id='sync-tamano-aviso';b.style.cssText='position:fixed;left:50%;transform:translateX(-50%);top:10px;z-index:3000;max-width:640px;background:#fff3cd;border:1px solid #e0b100;color:#5c4400;padding:10px 14px;border-radius:10px;font:13px system-ui;box-shadow:0 6px 24px rgba(0,0,0,.2)';document.body.appendChild(b);}
    b.innerHTML='<b>Aviso de capacidad (solo Administrador):</b> estos documentos superan el 80 % del límite de Firestore (1 MiB): '+
      altos.map(a=>'<b>sync/'+a.doc+'</b> '+a.porcentaje+' %').join(' · ')+'. Avisa al soporte antes de que falle un guardado. <button type="button" style="margin-left:8px" onclick="this.parentNode.remove()">Cerrar</button>';
  }
  async function vigilar(){
    if(!esAdmin())return;
    try{
      const clave='glacialSyncTamano';let ult=0;
      try{ult=Number(localStorage.getItem(clave))||0;}catch(_){/* sin almacenamiento */}
      if(Date.now()-ult<86400000)return;
      const altos=await revisarTamanos();
      try{localStorage.setItem(clave,String(Date.now()));}catch(_){/* sin almacenamiento */}
      avisoTamanos(altos);
    }catch(e){console.warn('Vigilancia de tamaño:',e&&e.message||e);}
  }

  // El Administrador recibe el aviso aunque no abra Avance: se revisa una vez por sesión (y como máximo una vez al día por equipo).
  if(typeof setInterval==='function'&&typeof window!=='undefined'){
    let vigilado=false;
    setInterval(()=>{
      try{
        const hay=typeof auth!=='undefined'&&auth&&auth.currentUser;
        if(!hay){vigilado=false;return;}
        if(esAdmin()&&!vigilado){vigilado=true;setTimeout(vigilar,15000);}
      }catch(_){/* se reintenta */}
    },30000);
  }

  window.glacialAvancesItems={COL,LIMITE,UMBRAL,todos,alCambiar,fijarLegado,escucharRango,cerrar,cerrarTodo,crear,consultarRango,consultarFecha,obtener,
    unir,limpiar,estimarBytes,bytesPorCampo,medir,migrar,migrarUI,revisarTamanos,medirSync,vigilar,avisoTamanos,estado:E};
})();
