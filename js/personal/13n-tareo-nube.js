/* =============================================================
   GLACIAL · TAREO — GUARDADO EN LA NUBE (concurrencia, errores, pendientes y documento por tareo)
   -------------------------------------------------------------
   Diagnóstico (docs/personal-tareo/tareo-guardado-concurrente.md): todos los tareos vivían en UN documento (sync/tareos). Cada marca de cualquier
   supervisor abría una transacción sobre ese documento; con varios equipos a la vez Firestore agotaba sus 5 intentos y devolvía
   «the stored version (…) does not match the required base version (…)», que la app mostraba como «falta permiso o internet».

   Este módulo es la ÚNICA forma de escribir tareos:
     · modificar(ids, fn): transacción que lee los tareos indicados, deja que fn los cambie y escribe SOLO esos.
         - Modo documento compartido (TAREO_POR_DOCUMENTO = false): sync/tareos, como siempre.
         - Modo documento por tareo (true): tareos/{id}. Si el tareo aún no tiene documento, se toma de sync/tareos dentro de la misma
           transacción (migración al guardar). sync/tareos no se modifica ni se borra (reversible). Eliminar deja una marca
           {eliminado:true} con los datos (no se pierde nada).
     · reintentos limitados con espera creciente para conflicto de versiones, falta de conexión o fallo temporal; nunca para permisos,
       tamaño ni validaciones.
     · clasificarError(): mensaje preciso para cada caso (no «falta permiso o internet» para todo).
     · combinar(): lectura en la transición (sync/tareos + tareos/{id}; el documento individual se fusiona campo a campo con el legado).
     · pendientes: las operaciones de asistencia no confirmadas se guardan en este navegador (por usuario, 24 h, se borran al cerrar
       sesión) y se reenvían al volver; son idempotentes (hora por campo), así que reenviarlas no duplica nada.
   ============================================================= */
(function instalarTareoNube(){
  'use strict';

  const REINTENTOS = 3;                 // además de los 5 intentos internos de cada transacción de Firestore
  const ESPERA_BASE_MS = 700;
  const TTL_PENDIENTES_MS = 24 * 3600 * 1000;
  const MENSAJES = {
    conflicto: 'Este registro cambió en otro equipo. Actualizaremos los datos y conservaremos tu modificación pendiente para revisarla o reintentar de forma segura.',
    sin_conexion: 'Sin conexión. Hay cambios pendientes de sincronización.',
    permisos: 'Tu usuario no tiene permiso para guardar este tareo.',
    temporal: 'No fue posible sincronizar ahora. Se intentará nuevamente sin duplicar el registro.',
    tamano: 'El tareo es demasiado grande para guardarse en un solo documento. Avisa a Sistemas (ver docs/personal-tareo/tareo-guardado-concurrente.md).',
    validacion: '',
    ok: 'Tareo guardado en la nube.'
  };

  const porDocumento = () => !!window.TAREO_POR_DOCUMENTO;
  const copia = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- errores ---------- */
  function clasificarError(err){
    const code = String((err && err.code) || '').replace(/^firestore\//, '');
    const msg = String((err && err.message) || err || '');
    let tipo = 'validacion';
    if(/does not match the required base version|stored version/i.test(msg) || code === 'aborted' || code === 'failed-precondition') tipo = 'conflicto';
    else if(code === 'permission-denied' || code === 'unauthenticated' || /insufficient permissions/i.test(msg)) tipo = 'permisos';
    else if(/exceeds the maximum allowed size|maximum.*size|too large/i.test(msg) || (code === 'invalid-argument' && /size/i.test(msg))) tipo = 'tamano';
    else if(code === 'unavailable' || (typeof navigator !== 'undefined' && navigator.onLine === false) || /offline|network/i.test(msg)) tipo = 'sin_conexion';
    else if(['deadline-exceeded', 'resource-exhausted', 'internal', 'unknown', 'cancelled'].includes(code)) tipo = 'temporal';
    const reintentable = tipo === 'conflicto' || tipo === 'sin_conexion' || tipo === 'temporal';
    return {tipo, reintentable, mensaje: MENSAJES[tipo] || msg, tecnico: (code ? code + ': ' : '') + msg};
  }

  /* Ejecuta una transacción con reintentos limitados. fnTx recibe la transacción (puede reejecutarse: solo cálculo puro). */
  async function transaccion(fnTx, opc){
    opc = opc || {};
    let ultimo = null;
    for(let intento = 0; intento <= REINTENTOS; intento++){
      try{
        return await db.runTransaction(fnTx);
      }catch(err){
        ultimo = err;
        const c = clasificarError(err);
        console.warn('Tareo · ' + (opc.etiqueta || 'guardado') + ' · intento ' + (intento + 1) + ' falló (' + c.tipo + '): ' + c.tecnico);
        if(!c.reintentable || intento === REINTENTOS) break;
        const base = Number(window.TAREO_ESPERA_BASE_MS) || ESPERA_BASE_MS;     // configurable solo para pruebas
        await esperar(base * Math.pow(2, intento) + Math.floor(Math.random() * Math.min(400, base)));
      }
    }
    throw ultimo;
  }

  /* ---------- referencias ---------- */
  const refLegado = () => db.collection('sync').doc('tareos');
  const refDoc = id => db.collection('tareos').doc(String(id));
  const idValido = id => /^[^/]{1,700}$/.test(String(id || '')) && !/^\.\.?$/.test(String(id));

  /* Firestore no acepta undefined ni prototipos raros: lo que se guarda es una copia JSON. */
  const limpio = t => copia(t);

  /* modificar(ids, fn, opc): fn(ctx) con ctx.obtener(id) → tareo (o null), ctx.guardar(tareo), ctx.eliminar(id, quien).
     Lo que fn devuelve se devuelve. fn puede lanzar un Error de validación (no se reintenta). */
  async function modificar(ids, fn, opc){
    ids = [...new Set((ids || []).map(String))];
    opc = opc || {};
    if(porDocumento()){
      ids.forEach(id => { if(!idValido(id)) throw new Error('Identificador de tareo no válido: ' + id); });
      return transaccion(async tx => {
        const docs = new Map();
        for(const id of ids){ const s = await tx.get(refDoc(id)); docs.set(id, s.exists ? s.data() : null); }
        let legado = null;
        if(ids.some(id => !docs.get(id))){
          const s = await tx.get(refLegado());
          legado = (s.exists && Array.isArray(s.data().items)) ? s.data().items : [];
        }
        const actuales = new Map();
        ids.forEach(id => {
          const d = docs.get(id);
          if(d && !d.eliminado) actuales.set(id, copia(d));
          else if(!d){ const l = (legado || []).find(t => t && String(t.id) === id); if(l) actuales.set(id, copia(l)); }
        });
        const escritos = new Map(), eliminados = new Map();
        const ctx = {
          obtener: id => actuales.get(String(id)) || null,
          guardar: t => { if(!t || !idValido(t.id)) throw new Error('Tareo sin identificador válido.'); actuales.set(String(t.id), t); escritos.set(String(t.id), t); },
          eliminar: (id, quien) => { eliminados.set(String(id), quien || ''); escritos.delete(String(id)); }
        };
        const r = fn(ctx);
        escritos.forEach((t, id) => tx.set(refDoc(id), limpio(t)));
        eliminados.forEach((quien, id) => {
          const base = actuales.get(id) || {id};
          tx.set(refDoc(id), Object.assign(limpio(base), {id, eliminado: true, eliminadoEn: Date.now(), eliminadoPor: quien}));
        });
        return r;
      }, opc);
    }
    return transaccion(async tx => {
      const s = await tx.get(refLegado());
      const items = (s.exists && Array.isArray(s.data().items)) ? s.data().items.slice() : [];
      let cambio = false;
      const ctx = {
        obtener: id => items.find(t => t && String(t.id) === String(id)) || null,
        guardar: t => { const i = items.findIndex(x => x && x.id === t.id); if(i >= 0) items[i] = t; else items.push(t); cambio = true; },
        eliminar: id => { const i = items.findIndex(x => x && String(x.id) === String(id)); if(i >= 0){ items.splice(i, 1); cambio = true; } }
      };
      const r = fn(ctx);
      if(cambio) tx.set(refLegado(), {items, updatedAt: Date.now()});
      return r;
    }, opc);
  }

  /* ---------- lectura en la transición ---------- */
  /* legado: items de sync/tareos; docs: [{id, data}] de tareos/{id}. Un documento individual reemplaza al del legado, fusionado campo a
     campo con él (así lo que marcó un equipo con la versión anterior de la app no se pierde); eliminado:true lo quita. */
  function combinar(legado, docs){
    const salida = (Array.isArray(legado) ? legado : []).map(copia);
    (docs || []).forEach(d => {
      const t = d && d.data;
      if(!t) return;
      const id = String(t.id || d.id);
      const i = salida.findIndex(x => x && String(x.id) === id);
      if(t.eliminado){ if(i >= 0) salida.splice(i, 1); return; }
      if(i < 0){ salida.push(copia(t)); return; }
      salida[i] = typeof tareoFusionar === 'function' ? tareoFusionar(salida[i], copia(t)) : copia(t);
    });
    return salida;
  }

  /* ---------- pendientes persistentes (operaciones de asistencia) ---------- */
  const clavePend = () => {
    const u = (typeof state !== 'undefined' && state.user) || null;
    const uid = u && (u.uid || u.authUid || u.username);
    return uid ? 'glacial.tareo.pendientes.' + String(uid) : '';
  };
  let ultimaClave = '';
  function guardarPendientes(lista){
    try{
      const k = clavePend(); if(!k || typeof localStorage === 'undefined') return;
      ultimaClave = k;
      const vivos = (lista || []).filter(o => o && o.estado !== 'guardado');
      if(!vivos.length){ localStorage.removeItem(k); return; }
      localStorage.setItem(k, JSON.stringify({guardadoEn: Date.now(), ops: vivos.map(o => ({
        id: o.id, tareoId: o.tareoId, clave: o.clave, claveFila: o.claveFila, filaId: o.filaId, nombre: o.nombre, campos: o.campos, base: o.base || null, ts: o.ts
      }))}));
    }catch(e){ console.warn('Tareo: no se pudieron conservar los pendientes en este equipo:', e && e.message || e); }
  }
  function leerPendientes(){
    try{
      const k = clavePend(); if(!k || typeof localStorage === 'undefined') return [];
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      if(!d || !Array.isArray(d.ops)) return [];
      if(Date.now() - Number(d.guardadoEn || 0) > TTL_PENDIENTES_MS){ localStorage.removeItem(k); return []; }
      return d.ops;
    }catch(_){ return []; }
  }
  function borrarPendientes(){
    try{ const k = clavePend() || ultimaClave; if(k && typeof localStorage !== 'undefined') localStorage.removeItem(k); }catch(_){ /* sin almacenamiento */ }
  }
  if(window.glacialCierresSesion) window.glacialCierresSesion.push(borrarPendientes);

  window.TareoNube = {
    porDocumento, clasificarError, transaccion, modificar, combinar, MENSAJES,
    guardarPendientes, leerPendientes, borrarPendientes, REINTENTOS
  };
})();
