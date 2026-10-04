/* =============================================================
   GLACIAL · INTEGRACIONES: GOOGLE SHEETS Y WHATSAPP
   -------------------------------------------------------------
   - Sin servidor y sin tocar Firebase.
   - Google Sheets: Apps Script publicado como aplicación web
     (SHEETS_URL / SHEETS_CLAVE en 01-config.js). Se envía con
     Content-Type text/plain para evitar el bloqueo CORS.
     La PRIMERA columna de cada fila es un ID único: si se reenvía,
     el script actualiza la fila en vez de duplicarla.
   - Si el envío falla (sin internet), NO se bloquea el cierre: el
     registro queda "pendiente de enviar" (guardado solo en este
     navegador) y se reintenta con el botón de reenvío.
   - WhatsApp: abre https://wa.me/?text=… con el mensaje armado.

   Orden de carga en index.html: DESPUÉS de 13-tareo.js, 29-avance-
   produccion.js y 33-rotacion-maquinistas.js, y ANTES de 12-init.js.
   ============================================================= */
(function instalarIntegraciones(){
  'use strict';

  const PEND_KEY='glacial.sheets.pendientes';

  /* ---------- utilidades ---------- */
  const dmy=iso=>{
    const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m?`${m[3]}/${m[2]}/${m[1]}`:String(iso||'');
  };
  const horaTxt=h=>/^\d{1,2}:\d{2}$/.test(String(h||''))?String(h).padStart(5,'0'):'';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const fmt=n=>Math.round(num(n)).toLocaleString('es-PE');
  const configurado=()=>typeof SHEETS_URL!=='undefined'&&!!SHEETS_URL&&typeof SHEETS_CLAVE!=='undefined'&&!!SHEETS_CLAVE;

  function aviso(texto,error){
    let t=document.getElementById('glacial-toast');
    if(!t){
      t=document.createElement('div');t.id='glacial-toast';
      t.style.cssText='position:fixed;right:16px;bottom:16px;z-index:10000;max-width:320px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.2);transition:opacity .3s;';
      document.body.appendChild(t);
    }
    t.textContent=texto;
    t.style.background=error?'#fde8e8':'#e5f6ec';
    t.style.color=error?'#a92f27':'#13814a';
    t.style.border='1px solid '+(error?'#f0b8b8':'#b9e8cd');
    t.style.opacity='1';
    clearTimeout(t._t);
    t._t=setTimeout(()=>{t.style.opacity='0';},error?6000:3000);
  }

  /* ---------- pendientes (solo en este navegador) ---------- */
  function leerPend(){try{return JSON.parse(localStorage.getItem(PEND_KEY)||'[]')||[];}catch(_){return [];}}
  function guardarPend(l){try{localStorage.setItem(PEND_KEY,JSON.stringify(l));}catch(_){/* sin almacenamiento */}}
  function marcarPend(tipo,id,pendiente){
    const l=leerPend().filter(p=>!(p.tipo===tipo&&p.id===id));
    if(pendiente)l.push({tipo,id});
    guardarPend(l);
  }
  window.sheetsPendiente=(tipo,id)=>leerPend().some(p=>p.tipo===tipo&&p.id===id);
  window.sheetsCantidadPendientes=()=>leerPend().length;

  /* =========================================================
     enviarASheets(hoja, encabezados, filas)
     Responde { ok, nuevas, actualizadas } o { ok:false, error }.
     ========================================================= */
  async function enviarASheets(hoja,encabezados,filas){
    if(!configurado())throw new Error('Google Sheets no está configurado (SHEETS_URL / SHEETS_CLAVE en 01-config.js).');
    const respuesta=await fetch(SHEETS_URL,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},   // evita el bloqueo CORS de Apps Script
      body:JSON.stringify({clave:SHEETS_CLAVE,hoja,encabezados,filas})
    });
    const datos=await respuesta.json();
    if(!datos||!datos.ok)throw new Error((datos&&datos.error)||'El script de Google Sheets rechazó el envío.');
    return datos;
  }
  window.enviarASheets=enviarASheets;

  /* Envío con aviso y manejo de pendientes. Nunca lanza error. */
  async function enviarConAviso(tipo,id,hoja,enc,filas,opts){
    const o=opts||{};
    if(!configurado()){
      if(!o.automatico)aviso('Configura SHEETS_URL y SHEETS_CLAVE en 01-config.js',true);
      return false;
    }
    if(!filas.length){if(!o.automatico)aviso('No hay filas para enviar.',true);return false;}
    try{
      await enviarASheets(hoja,enc,filas);
      marcarPend(tipo,id,false);
      aviso('Enviado a Google Sheets');
      return true;
    }catch(e){
      marcarPend(tipo,id,true);
      aviso('No se envió a Google Sheets (queda pendiente): '+(e&&e.message?e.message:e),true);
      if(typeof renderHistorialTareo==='function'&&document.getElementById('tareo-historial-view'))renderHistorialTareo();
      return false;
    }
  }

  /* =========================================================
     HOJA "Tareo": una fila por persona
     ID = fecha|turno|área|trabajador
     ========================================================= */
  const ENC_TAREO=['ID','Fecha','Turno','Área','Trabajador','Tipo','Estado','Ingreso',
    'Salida refrigerio','Retorno refrigerio','Salida','Horas trabajadas','Horas extras','Supervisor','Estado del tareo'];

  function filasTareo(tareo){
    const area=tareoAreaDe(tareo);
    const fecha=dmy(tareo.fecha);
    const sup=typeof tareoResponsable==='function'?tareoResponsable(tareo):(tareo.creadoPor||'');
    const estadoTareo=typeof tareoEstadoBloqueo==='function'?tareoEstadoBloqueo(tareo):'Abierto';
    const base=(persona,tipo,estado,saldo)=>{
      const nombre=String(persona.nombre||'').trim();
      return [
        [fecha,tareo.turno,area,nombre].join('|'),
        fecha,String(tareo.turno||''),area,nombre,tipo,estado,
        horaTxt(persona.horaIngreso),horaTxt(persona.salidaRefrigerio),horaTxt(persona.retornoRefrigerio),
        horaTxt(persona.horaSalida),
        saldo.horas,saldo.extras,sup,estadoTareo
      ];
    };
    const filas=[];
    (tareo.personal||[]).forEach(p=>{
      const s=tareoSaldoHoras(p,tareo.jornadaNormal);
      const tipo=tareoEsMaquinista(p)?'maquinista':'planilla';
      filas.push(base(p,tipo,tareoEtiquetaEstado(p.asistencia),{
        horas:num(p.horasTrabajadas).toFixed(2),
        extras:s===null?'':tareoTextoSaldo(s)
      }));
    });
    (typeof tareoPorDiaActivos==='function'?tareoPorDiaActivos(tareo):[]).forEach(p=>{
      const s=tareoSaldoHoras(p,tareo.jornadaNormal);
      filas.push(base(p,'por día','Asistió',{
        horas:tareoHorasPorDia(p).toFixed(2),
        extras:s===null?'':tareoTextoSaldo(s)
      }));
    });
    return filas;
  }

  async function sheetsEnviarTareo(tareo,opts){
    if(!tareo)return false;
    return enviarConAviso('tareo',tareo.id,'Tareo',ENC_TAREO,filasTareo(tareo),opts);
  }
  window.sheetsEnviarTareo=sheetsEnviarTareo;
  window.sheetsReenviarTareo=id=>{
    const t=obtenerTareos().find(x=>x.id===id);
    if(t)return sheetsEnviarTareo(t,{});
  };

  /* =========================================================
     HOJA "Produccion": una fila por línea al cierre de turno
     ID = fecha|turno|línea
     ========================================================= */
  const ENC_PROD=['ID','Fecha','Turno','Línea','Programado','Producido','Rechazadas',
    'Minutos de parada','Ratio UND/h','Supervisor'];

  function filasCierre(s){
    const fecha=dmy(s.fecha);
    return (s.lineas||[]).map(l=>{
      const nombre=l.nombre||l.linea;
      return [
        [fecha,s.turno,nombre].join('|'),
        fecha,String(s.turno||''),String(nombre||''),
        Math.round(num(l.programado)),Math.round(num(l.produccionTotal)),
        '',                                  // Rechazadas: el cierre aún no guarda este dato
        Math.round(num(l.totalParadas)),
        l.ratio?Math.round(num(l.ratio)):'',
        s.supervisor||s.generadoPor||''
      ];
    });
  }

  async function sheetsEnviarCierre(s,opts){
    if(!s)return false;
    return enviarConAviso('cierre',s.id,'Produccion',ENC_PROD,filasCierre(s),opts);
  }
  window.sheetsEnviarCierre=sheetsEnviarCierre;

  const snapshotPorId=id=>(typeof avanceEstado!=='undefined'
    ?(avanceEstado.todosSnapshots||[]).find(x=>x.id===id)||(avanceEstado.snapshots||[]).find(x=>x.id===id):null);
  window.sheetsReenviarCierre=id=>{const s=snapshotPorId(id);if(s)return sheetsEnviarCierre(s,{});};

  /* Reenvía todo lo pendiente de este navegador. */
  async function sheetsReenviarPendientes(){
    const lista=leerPend();
    if(!lista.length){aviso('No hay envíos pendientes.');return;}
    let ok=0;
    for(const p of lista){
      const exito=p.tipo==='tareo'
        ?await sheetsEnviarTareo(obtenerTareos().find(t=>t.id===p.id),{automatico:true})
        :await sheetsEnviarCierre(snapshotPorId(p.id),{automatico:true});
      if(exito)ok++;
    }
    aviso(ok===lista.length?'Pendientes enviados a Google Sheets':`Enviados ${ok} de ${lista.length}; el resto sigue pendiente`,ok!==lista.length);
    if(document.getElementById('tareo-historial-view')&&typeof renderHistorialTareo==='function')renderHistorialTareo();
  }
  window.sheetsReenviarPendientes=sheetsReenviarPendientes;

  /* Envío automático al guardar/cerrar el tareo (no bloquea el guardado). */
  if(typeof guardarTareoActual==='function'){
    const original=guardarTareoActual;
    guardarTareoActual=function(){
      const id=tareoActualId;
      const r=original.apply(this,arguments);
      setTimeout(()=>{
        const t=obtenerTareos().find(x=>x.id===id);
        if(t&&tareoPuedeEditar(t))sheetsEnviarTareo(t,{automatico:true});
      },400);
      return r;
    };
    window.guardarTareoActual=guardarTareoActual;
  }

  /* =========================================================
     WHATSAPP
     ========================================================= */
  function abrirWhatsApp(mensaje){
    window.open('https://wa.me/?text='+encodeURIComponent(mensaje),'_blank','noopener');
  }

  function mensajeCierre(s){
    const out=[`*CIERRE DE PRODUCCIÓN*`,`${dmy(s.fecha)} · Turno ${s.turno}`,''];
    (s.lineas||[]).forEach(l=>{
      const prog=num(l.programado),prod=num(l.produccionTotal);
      const pct=prog>0?Math.round(prod/prog*100):0;
      const u=l.linea==='C20L'?'caj':l.linea==='B20L'||l.linea==='B7L'?'bid':'und';
      out.push(`*${l.nombre||l.linea}:* ${fmt(prod)} / ${fmt(prog)} ${u} (${pct}%)`);
    });
    const paradas=(s.lineas||[]).reduce((t,l)=>t+num(l.totalParadas),0);
    out.push('',`Paradas: ${fmt(paradas)} min`,`Supervisor: ${s.supervisor||s.generadoPor||'—'}`);
    return out.join('\n');
  }
  window.wspEnviarCierre=id=>{
    const s=snapshotPorId(id);
    if(!s){aviso('No se encontró el cierre.',true);return;}
    abrirWhatsApp(mensajeCierre(s));
  };

  function mensajeTareo(tareo){
    const personal=tareo.personal||[];
    const estado=p=>tareoEstadoCanonico(p.asistencia);
    // Criterio único de asistencia (13-tareo.js: tareoResumenAsistencia).
    const g=tareoResumenAsistencia(personal);
    const faltas=personal.filter(p=>tareoGrupoAsistencia(p.asistencia)==='faltas');
    const tardanzas=personal.filter(p=>tareoEsPresente(p.asistencia)&&num(p.tardanzaMinutos)>0);
    const porDia=typeof tareoPorDiaActivos==='function'?tareoPorDiaActivos(tareo).length:0;
    const maquinistas=personal.filter(p=>tareoEsMaquinista(p)).length;
    const out=[`*TAREO ${String(tareoAreaDe(tareo)).toUpperCase()}*`,`${dmy(tareo.fecha)} · Turno ${tareo.turno}`,'',
      `Presentes: ${g.presentes}${g.enComision?` (${g.enComision} en comisión)`:''}`,`Faltas: ${g.faltas}`,`Descansos: ${g.descansos}`,
      `Otros ausentes: ${g.otros}`,`Sin registrar: ${g.sinRegistrar}`,
      `Tardanzas: ${tardanzas.length}`,`Personal por día: ${porDia}`,`Maquinistas: ${maquinistas}`];
    if(faltas.length)out.push('',`*Faltas:* ${faltas.map(p=>p.nombre).join(', ')}`);
    if(tardanzas.length)out.push('',`*Tardanzas:* ${tardanzas.map(p=>`${p.nombre} (${num(p.tardanzaMinutos)} min)`).join(', ')}`);
    out.push('',`Supervisor: ${typeof tareoResponsable==='function'?tareoResponsable(tareo):'—'}`);
    return out.join('\n');
  }
  window.wspEnviarTareo=id=>{
    const t=obtenerTareos().find(x=>x.id===id);
    if(!t){aviso('No se encontró el tareo.',true);return;}
    abrirWhatsApp(mensajeTareo(t));
  };

  // Reintenta pendientes al recuperar la conexión (solo si el usuario ya tiene sesión).
  window.addEventListener('online',()=>{if(leerPend().length)aviso('Conexión recuperada: usa «Reenviar pendientes» en el Historial.');});
})();
