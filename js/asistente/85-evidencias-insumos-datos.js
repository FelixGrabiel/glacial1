/* =============================================================
   GLACIAL · EVIDENCIAS DE INSUMOS — DATOS (capa documento + foto privada + auditoría)
   -------------------------------------------------------------
   Colección insumosEvidencias/{sha256 de la foto}: un documento por fotografía con su lectura, los datos con procedencia, el estado y el historial.
   · La FOTO va al bucket privado «glacial-fotos» (carpeta asistente/evidencias/, ya permitida por glacial_25) y se muestra con enlace firmado.
   · Importar, editar, confirmar y cambiar de estado son TRANSACCIONES: se revisa el estado y la revisión (`rev`) actuales, así dos personas no se pisan
     y un doble clic no aprueba dos veces. Cada operación deja un evento en insumosAuditoria (el mismo libro del inventario), con antes → después.
   · Permisos: los del Inventario de insumos (ver: Asistente de Producción, Jefe de Operaciones y Administrador; escribir/aprobar: Asistente y Administrador).
     Reabrir una evidencia aprobada o rechazada solo lo hace un Administrador. Reglas de Supabase: supabase/migraciones/glacial_31_evidencias_insumos.sql.
   · NO toca stock: este archivo no conoce cortes, conteos, catálogo ni movimientos. Aprobar datos no registra entradas, transferencias ni consumos.
   Cargar DESPUÉS de 75-inventario-insumos-datos.js y 84-evidencias-insumos-nucleo.js.
   ============================================================= */
(function instalarEvidenciasInsumosDatos(){
  'use strict';
  const N=window.glacialEvidenciasNucleo,D=window.glacialInventarioDatos;
  if(!N||!D||!D._ayudas)return;
  const {auditar,usuario,ahora,col,falla}=D._ayudas;
  const COL='insumosEvidencias';
  const cache={lista:[],listo:false,error:''};
  const oyentes=[];let cierre=null,activo=false;
  const avisar=()=>oyentes.slice().forEach(f=>{try{f();}catch(_){/* una vista no rompe a otra */}});
  const yoEscribo=()=>D.puedeEscribir();
  const porId=id=>cache.lista.find(d=>d.id===id)||null;

  /* ---------- tiempo real ---------- */
  function escuchar(){
    if(activo||typeof db==='undefined')return;
    activo=true;cache.listo=false;cache.error='';
    cierre=col(COL).onSnapshot(s=>{
      cache.lista=N.ordenar(s.docs.map(d=>d.data()).filter(x=>x&&x.id&&x.campos));cache.listo=true;cache.error='';avisar();
    },e=>{cache.error=D.mensajeError(e);avisar();});
  }
  function detener(){
    activo=false;
    if(cierre){try{cierre();}catch(_){/* ya cerrada */}cierre=null;}
  }
  // La escucha se cierra al cambiar de pestaña dentro del Asistente (72-asistente-pantalla.js llama a detener()) y al cerrar sesión.
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detener();cache.lista=[];cache.listo=false;});

  const refDe=id=>col(COL).doc(id);
  const nombreAuditoria=d=>(d&&d.campos&&d.campos.producto&&d.campos.producto.valor)||(d&&d.archivoOriginal)||'';

  /* ---------- importar (resultado revisado + foto) ---------- */
  /** registro: contenido de un -revisado.json; archivoFoto: File/Blob con la fotografía. Idempotente por huella SHA-256. */
  async function importar(registro,archivoFoto){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para importar evidencias.');
    if(!archivoFoto)throw falla('FORMATO','Falta la fotografía.');
    const mime=String(archivoFoto.type||'').toLowerCase();
    if(!/^image\/(jpeg|png|webp)$/.test(mime))throw falla('FORMATO','La foto debe ser JPG, PNG o WebP.');
    if(archivoFoto.size>10*1024*1024)throw falla('FORMATO','La foto supera los 10 MB.');
    const sha=await N.sha256Hex(await archivoFoto.arrayBuffer());
    if(porId(sha))throw falla('DUPLICADO','Esta evidencia ya está en la bandeja.');
    const F=window.glacialFotos;
    if(!F||!F.disponible())throw falla('SIN_FOTOS','Supabase Storage no está disponible: no se puede guardar la foto privada.');
    const u=usuario(),t=ahora();
    const doc=N.construirDocumento(registro,{sha256:sha,foto:{url:'',mimetype:mime,bytes:archivoFoto.size},usuario:u.nombre,uid:u.uid,ahora:t});   // valida antes de subir nada
    let subida;
    try{subida=await F.subir(archivoFoto,{carpeta:'asistente/evidencias',id:sha,tipo:mime});}
    catch(e){
      if(!/exist|duplicate|409/i.test(String(e&&e.message)))throw falla('FOTO','No se pudo subir la foto: '+((e&&e.message)||e));
      subida={url:F.PREFIJO+'asistente/evidencias/'+sha+'.'+(/png/.test(mime)?'png':/webp/.test(mime)?'webp':'jpg')};     // misma huella = misma foto ya subida
    }
    doc.foto.url=subida.url;
    const ref=refDe(sha);
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      if(s.exists)throw falla('DUPLICADO','Esta evidencia ya está en la bandeja.');
      tx.set(ref,doc);
      auditar(tx,'IMPORTAR_EVIDENCIA',sha,nombreAuditoria(doc),null,{estado:'pendiente',archivo:doc.archivoOriginal,version:doc.versionProcesador||'vision-v2'},{evidenciaId:sha});
    });
    return {id:sha};
  }

  /* ---------- operaciones sobre una evidencia ---------- */
  async function sobreDocumento(id,revEsperada,operacion){
    if(!yoEscribo())throw falla('PERMISO','No tienes permiso para validar evidencias.');
    const ref=refDe(id);let salida=null;
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);
      if(!s.exists)throw falla('VALIDACION','La evidencia ya no existe.');
      const doc=s.data();
      if(Number(doc.rev)!==Number(revEsperada))throw falla('CONCURRENCIA','Otra persona cambió esta evidencia mientras la revisabas. Se actualizó la pantalla: revisa y vuelve a intentar.');
      salida=operacion(doc,tx,ref);
    });
    return salida;
  }

  /** cambios: {campo: textoEscrito, categoria?, tipoDocumento?}; confirmar: [campo]. Una transacción, un evento por dato. */
  function guardarEdiciones(id,revEsperada,{cambios={},confirmar=[]}){
    const u=usuario(),t=ahora();
    return sobreDocumento(id,revEsperada,(doc,tx,ref)=>{
      const r=N.aplicarEdiciones(doc,{cambios,confirmar},u.nombre,t);
      if(r.errores.length)throw falla('VALIDACION',r.errores.join(' '));
      if(!r.eventos.length)return {cambiado:false,doc};
      tx.set(ref,r.doc);
      r.eventos.forEach(e=>auditar(tx,e.tipo,id,nombreAuditoria(r.doc),{[e.campo]:e.antes},{[e.campo]:e.despues},{evidenciaId:id}));
      return {cambiado:true,doc:r.doc,eventos:r.eventos.length};
    });
  }

  /** a: 'aprobado_dato' | 'requiere_correccion' | 'rechazado' | 'pendiente' (reabrir, solo Administrador). */
  function cambiarEstado(id,revEsperada,a,{motivo=''}={}){
    const u=usuario(),t=ahora();
    return sobreDocumento(id,revEsperada,(doc,tx,ref)=>{
      const r=N.cambiarEstado(doc,a,{usuario:u.nombre,motivo,esAdmin:D.esAdmin(),en:t});
      tx.set(ref,r.doc);
      auditar(tx,'CAMBIAR_ESTADO_EVIDENCIA',id,nombreAuditoria(r.doc),r.evento.antes,r.evento.despues,{evidenciaId:id});
      return {doc:r.doc};
    });
  }

  window.glacialEvidenciasDatos={COL,cache,escuchar,detener,importar,guardarEdiciones,cambiarEstado,porId,puedeVer:D.puedeVer,puedeEscribir:D.puedeEscribir,esAdmin:D.esAdmin,mensajeError:D.mensajeError,
    alCambiar:f=>{oyentes.push(f);return ()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}};
})();
