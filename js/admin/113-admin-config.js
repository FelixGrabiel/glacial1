/* =============================================================
   GLACIAL · PANEL DE ADMINISTRACIÓN · CONFIGURACIÓN (adminConfig, glacial_60) · LECTURA PARA TODOS, ESCRITURA SOLO DEL ADMINISTRADOR
   -------------------------------------------------------------
   Documentos adminConfig/{id}: tolerancias (merma y desviación aceptables por línea) · roles (plantillas de permisos y roles propios) · (anuncio, mantenimiento,
   alertas, sesion y respaldos llegan con las etapas siguientes). Cada documento lleva version (el servidor exige version anterior + 1: si dos equipos editan a la
   vez, el segundo es rechazado; nunca gana en silencio el último), motivo (≥ 10 caracteres) y quién lo cambió.
   Lectura: cualquier módulo pregunta aquí. Sin documento o sin leer todavía, TODO SIGUE COMO ANTES (los valores del código):
     · glacialAdminConfig.tolerancia(linea,'mermaPct'|'desviacionPct') → número o null (el Asistente de Producción lo usa para «Por revisar»);
     · glacialAdminConfig.lineasSinExigirMerma() → líneas donde la merma no se exige validada antes de cerrar el turno;
     · las plantillas de rol y los roles propios se aplican sobre PERMISOS_SUGERIDOS_POR_ROL (los que usa «Nuevo usuario»).
   Escribir: glacialAdminConfig.guardar(id,datos,motivo,versionBase,auditoria) — solo con la marca adm_panel (Administrador); deja su fila en adminAuditoria.
   ============================================================= */
(function(){
  'use strict';
  if(typeof window==='undefined'||!window.document)return;
  const W=window;
  const C={docs:{},listo:{},on:false};
  let cierres=[];const oyentes=[];
  let baseRoles=null;
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  const ROL_DESDE=()=>{const o=C.docs.roles;return o&&typeof o==='object'?o:null;};

  function aplicarRoles(){
    if(typeof PERMISOS_SUGERIDOS_POR_ROL==='undefined')return;
    const O=PERMISOS_SUGERIDOS_POR_ROL;
    if(!baseRoles)baseRoles=JSON.parse(JSON.stringify(O));
    Object.keys(O).forEach(k=>{if(!(k in baseRoles))delete O[k];});                    // roles propios que ya no existen
    Object.keys(baseRoles).forEach(k=>{O[k]=baseRoles[k].slice();});                  // vuelve a las plantillas del sistema
    const d=ROL_DESDE();if(!d)return;
    Object.keys(d.plantillas||{}).forEach(r=>{if(Array.isArray(d.plantillas[r]))O[r]=d.plantillas[r].slice();});
    (d.propios||[]).forEach(r=>{if(r&&r.nombre&&!(r.nombre in O))O[r.nombre]=[];});
  }
  function escuchar(){
    if(C.on||typeof db==='undefined'||typeof state==='undefined'||!state.user)return;
    const rol=String(state.user.rol||'');
    if(rol==='mantenimiento_compartido'||rol==='almacen_compartido')return;            // las reglas no les dan lectura: siguen con los valores del código
    C.on=true;
    ['tolerancias','roles'].forEach(id=>{
      try{
        cierres.push(db.collection('adminConfig').doc(id).onSnapshot(s=>{C.docs[id]=s.exists?s.data():null;C.listo[id]=true;if(id==='roles')aplicarRoles();avisar();},()=>{C.listo[id]=true;}));
      }catch(_){C.listo[id]=true;}
    });
  }
  function detener(){cierres.forEach(f=>{try{f();}catch(_){/* ya cerrada */}});cierres=[];C.on=false;C.docs={};C.listo={};aplicarRoles();}
  if(W.glacialCierresSesion)W.glacialCierresSesion.push(detener);
  // se empieza a leer al entrar a la app (y de nuevo si cambia el usuario)
  if(typeof enterApp==='function'){const a=enterApp;enterApp=function(){const r=a.apply(this,arguments);try{escuchar();}catch(_){/* informativo */}return r;};}

  const lineaDoc=l=>{const d=C.docs.tolerancias;return d&&d.lineas&&d.lineas[String(l||'').toUpperCase()]||null;};
  function tolerancia(linea,campo){
    escuchar();
    const x=lineaDoc(linea);if(!x)return null;
    const v=x[campo];return v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
  }
  function lineasSinExigirMerma(){
    escuchar();
    const d=C.docs.tolerancias;if(!d||!d.lineas)return [];
    return Object.keys(d.lineas).filter(l=>d.lineas[l]&&d.lineas[l].validarMermaAntes===false);
  }
  const rolesPropios=()=>{const d=ROL_DESDE();return d&&Array.isArray(d.propios)?d.propios.map(r=>r.nombre).filter(Boolean):[];};

  /** Escribe adminConfig/{id} con control de versión. base = versión que tenía el documento cuando se empezó a editar. */
  async function guardar(id,datos,motivo,base,auditoria){
    const DA=W.glacialAdminDatos,N=W.glacialAdminNucleo;
    if(!DA||!DA.puede())return {ok:false,msg:'No tienes acceso.'};
    const e=N.validarMotivo(motivo);if(e.length)return {ok:false,msg:e.join(' ')};
    const ref=db.collection('adminConfig').doc(id);
    let version=0;
    try{
      await db.runTransaction(async tx=>{
        const s=await tx.get(ref),ant=s.exists?s.data():null,vAnt=Number(ant&&ant.version)||0;
        if(vAnt!==(Number(base)||0)){const err=new Error('CONFLICTO');err.conflicto=true;throw err;}
        version=vAnt+1;
        const u=(typeof state!=='undefined'&&state.user)||{};let uid='';try{uid=firebase.auth().currentUser.uid;}catch(_){/* sin sesión segura */}
        tx.set(ref,Object.assign({},datos,{id,version,motivo:String(motivo).trim(),uid,usuario:u.username||'',usuarioNombre:u.nombre||u.username||'',actualizadoEn:Date.now()}));
      });
    }catch(err){
      if(err&&err.conflicto)return {ok:false,conflicto:true,msg:'Esto cambió en otro equipo: la configuración fue modificada mientras la editabas. Se volvió a cargar.'};
      const c=String((err&&err.code)||'');
      return {ok:false,msg:c.includes('permission')?'El servidor no aceptó el cambio (¿falta aplicar glacial_60 o la configuración cambió en otro equipo?).':'No se pudo guardar: '+((err&&err.message)||err)};
    }
    const r=await DA.registrar([Object.assign({modulo:'Configuración',motivo},auditoria||{})]);
    return {ok:true,version,auditoriaPendiente:r.fallidas,msg:'Guardado.'+(r.fallidas?' Atención: no se pudo registrar la auditoría; reintenta.':'')};
  }

  W.glacialAdminConfig={doc:id=>C.docs[id]||null,listo:id=>!!C.listo[id],version:id=>Number(C.docs[id]&&C.docs[id].version)||0,escuchar,detener,tolerancia,lineasSinExigirMerma,rolesPropios,
    alCambiar:f=>{oyentes.push(f);return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};},guardar};
})();
