/* =============================================================
   GLACIAL · AUTOLLENADO DEL NUEVO REGISTRO (Paletas + paradas)
   -------------------------------------------------------------
   Llave común: fecha + turno + línea + marca + presentación.
   (DÍA e INTERMEDIO comparten reporte; NOCHE usa la fecha de inicio
   del turno, igual que Paletas y la programación.)

   PALETAS  → solo la cantidad total en UND va a produccion.efectiva
              del cuadro con esa marca y presentación.
   PARADAS  → solo MINUTOS (sin horas) + motivo + tipo. Fuente oficial:
                · AGREGAR PARADAS    (Avance/Cierre)
              (PAUSA PROGRAMADA y DETENER LÍNEA del semáforo ya NO se importan: son estado de la línea.)
              Las de Avance/Cierre
              se asignan a la marca que estaba corriendo; si no se puede
              saber, el supervisor elige.

   Campos NUEVOS (nada existente cambia ni se crea ningún documento):
     draft.autollenadoV1              registro creado con esta función
     draft.asignacionParadasAvance    {idParada: indiceCuadro}
     cuadro.autoPaletas {ids,total}   marca la UND como automática
     cuadro.autoParadasSig            firma de lo importado (para avisar cambios)
     fila.auto/origen/origenId        marcan cada parada automática

   Los registros guardados ANTES de este cambio no se tocan
   (sin draft.autollenadoV1 no se llena ni se avisa nada).
   Cargar DESPUÉS de 06-registro.js, 16-paletas.js, 23b y 29; antes de 12-init.js.
   ============================================================= */
(function instalarAutollenadoRegistro(){
  'use strict';

  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const esc=t=>typeof escaparHtml==='function'?escaparHtml(t):String(t??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const grupo=t=>typeof grupoTurnoReporte==='function'?grupoTurnoReporte(t):(t==='NOCHE'?'NOCHE':'DIA_INTERMEDIO');
  const canonAvance=t=>String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DÍA';

  function mismaPresentacion(a,b){
    if(a===b)return true;
    if(typeof clavePresentacionVisualPaletas==='function'){
      const ca=clavePresentacionVisualPaletas(a),cb=clavePresentacionVisualPaletas(b);
      return !!ca&&ca===cb;
    }
    return false;
  }
  const mismoProducto=(x,q)=>x.marca===q.marca&&mismaPresentacion(x.presentacion,q.presentacion);

  const activo=()=>typeof draft!=='undefined'&&draft&&draft.autollenadoV1===true&&
    !(typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado());

  /* ---------- fuentes ---------- */
  /* Cantidad programada (UND) de la combinación, con el plan compartido DÍA/INTERMEDIO. */
  function programadoDe(q){
    if(typeof resumenProgramacionCombinacionTurnos!=='function')return 0;
    const items=itemsLinea().filter(p=>mismoProducto(p,q));
    if(items.length&&items.every(p=>p.estadoOperacion?.estado==='CANCELADA'))return 0;
    const turnos=grupo(draft.turno)==='NOCHE'?['NOCHE']:['DÍA','INTERMEDIO'];
    try{
      const r=resumenProgramacionCombinacionTurnos(draft.linea,draft.fecha,turnos,q.marca,q.presentacion);
      return Math.round(num(r&&r.cantidadProgramada));
    }catch(_){return 0;}
  }

  function paletasDe(q){
    const lista=typeof loadPaletas==='function'?(loadPaletas()||[]):[];
    const ids=[];let suma=0;
    lista.forEach(p=>{
      if(!p||p.linea!==draft.linea||p.fecha!==draft.fecha||grupo(p.turno)!==grupo(draft.turno)||!mismoProducto(p,q))return;
      ids.push(p.id);suma+=num(p.totalUnidades);
    });
    if(!ids.length)return {ids,total:0};
    /*
       Las paletas se registran como cantidades ACUMULADAS (ej. "Completa 4 → 1,296 und",
       luego "Completa 5 → 1,620 und"): NO se pueden sumar. El total del turno lo calcula
       el propio módulo de Paletas (el mismo que usa Producción Actual).
    */
    if(typeof resumenProgramacionCombinacionTurnos==='function'){
      const turnos=grupo(draft.turno)==='NOCHE'?['NOCHE']:['DÍA','INTERMEDIO'];
      try{
        const r=resumenProgramacionCombinacionTurnos(draft.linea,draft.fecha,turnos,q.marca,q.presentacion);
        return {ids,total:Math.round(num(r&&r.unidadesProducidas))};
      }catch(_){/* se usa el respaldo */}
    }
    return {ids,total:Math.round(suma)};
  }

  function itemsLinea(){
    const lista=typeof loadProgramaciones==='function'?(loadProgramaciones()||[]):[];
    return lista.filter(p=>p&&p.linea===draft.linea&&p.fecha===draft.fecha&&grupo(p.turno)===grupo(draft.turno));
  }

  const causaDe=motivo=>{
    const causas=typeof CAUSAS_PARADA_NO_PROGRAMADA!=='undefined'?CAUSAS_PARADA_NO_PROGRAMADA:[];
    return causas.find(c=>norm(c)===norm(motivo))||'Otro';
  };

  /* DETENER LÍNEA / PAUSA PROGRAMADA del semáforo son ESTADO de la línea, no paradas oficiales: ya no se copian al registro.
     Las paradas oficiales son las de Avance/Cierre (y las manuales del registro). */
  function paradasBoton(q){
    return [];
  }

  function paradasAvance(){
    const lista=typeof paradasOperativasActuales==='function'?(paradasOperativasActuales()||[]):[];
    const turno=canonAvance(draft.turno);
    return lista.filter(p=>p&&!p.eliminada&&p.linea===draft.linea&&p.fecha===draft.fecha&&canonAvance(p.turno)===turno&&num(p.minutos)>0);
  }

  function cuadrosConProducto(){
    return (normalizarCuadros(draft)||[]).map((q,i)=>({q,i})).filter(({q})=>q.marca&&q.presentacion);
  }

  /* Cuadro (índice) al que corresponde una parada de Avance/Cierre, o null. */
  function cuadroDeAvance(p){
    const asign=draft.asignacionParadasAvance||{};
    if(asign[p.id]!==undefined&&asign[p.id]!==null)return Number(asign[p.id]);
    const cand=cuadrosConProducto();
    if(cand.length===1)return cand[0].i;
    // Con hora "Desde": la marca que estaba corriendo a esa hora.
    if(p.horaInicio&&typeof calcularTiemposLinea==='function'){
      const [h,m]=String(p.horaInicio).split(':').map(Number);
      const d=new Date(draft.fecha+'T00:00:00');d.setHours(h,m,0,0);
      if(canonAvance(draft.turno)==='NOCHE'&&h<12)d.setDate(d.getDate()+1);
      const t=d.getTime();
      const corriendo=itemsLinea()
        .filter(x=>num(x.estadoOperacion?.inicio)&&num(x.estadoOperacion.inicio)<=t)
        .sort((a,b)=>num(b.estadoOperacion.inicio)-num(a.estadoOperacion.inicio))[0];
      if(corriendo){
        const c=cand.find(({q})=>mismoProducto(corriendo,q));
        if(c)return c.i;
      }
    }
    return null;
  }

  const filaAvance=p=>{
    const prog=p.tipo==='PROGRAMADA';
    return {
      id:'auto:'+p.id,descripcion:p.descripcion||'',tiempoMin:Math.round(num(p.minutos)),
      causa:prog?undefined:(p.causa||'Otro'),auto:true,origen:'AVANCE',origenId:p.id,
      tipo:prog?'PROGRAMADA':'NO_PROGRAMADA'
    };
  };

  /* Paradas de Avance/Cierre que todavía no tienen cuadro. */
  function paradasSinAsignar(){
    if(!activo())return [];
    return paradasAvance().filter(p=>cuadroDeAvance(p)===null);
  }

  /* ---------- llenado ---------- */
  const firma=filas=>filas.map(f=>`${f.origenId}|${f.tiempoMin}|${f.descripcion}|${f.tipo}`).sort().join(';');
  const vacia=r=>!String(r.descripcion||'').trim()&&!num(r.tiempoMin);

  function paradasDeseadas(i,q){
    const filas=[...paradasBoton(q)];
    paradasAvance().forEach(p=>{if(cuadroDeAvance(p)===i)filas.push(filaAvance(p));});
    return filas;
  }

  /* Llena el cuadro i. Devuelve true si algo cambió. forzar = también cuadros finalizados. */
  function llenarCuadro(i,forzar,campo){
    const q=normalizarCuadros(draft)[i];
    if(!q||!q.marca||!q.presentacion)return false;
    if(q.estadoCuadro==='FINALIZADO'&&!forzar)return false;
    let cambio=false;

    // 1) Paletas → solo la cantidad en UND
    // Todo lo que consulta normalizarCuadros() se calcula ANTES de escribir: cada llamada
    // crea objetos nuevos y dejaría huérfano el cuadro que se está modificando.
    const P=paletasDe(q);
    const Pr=programadoDe(q);
    const deseadas=paradasDeseadas(i,q);
    const w=normalizarCuadros(draft)[i];
    if(!w)return false;
    const forzarEf=forzar&&(!campo||campo==='paletas');
    const forzarPr=forzar&&(!campo||campo==='programada');
    {
    // 0) Programación → Programada (UND / cajas / bidones según la línea)
    if(Pr>0){
      const manualPr=num(w.produccion.programada)>0&&!w.autoProgramada;
      if(manualPr&&!forzarPr){
        if(w.autoProgramadaDisponible!==Pr){w.autoProgramadaDisponible=Pr;cambio=true;}
      }else{
        if(num(w.produccion.programada)!==Pr){w.produccion.programada=Pr;cambio=true;}
        if(!w.autoProgramada||w.autoProgramada.total!==Pr){w.autoProgramada={total:Pr};cambio=true;}
        if(w.autoProgramadaDisponible!==undefined){delete w.autoProgramadaDisponible;cambio=true;}
      }
    }else{
      if(w.autoProgramada){w.produccion.programada=0;delete w.autoProgramada;cambio=true;}
      if(w.autoProgramadaDisponible!==undefined){delete w.autoProgramadaDisponible;cambio=true;}
    }

    if(P.ids.length){
      const manual=num(w.produccion.efectiva)>0&&!w.autoPaletas;
      if(manual&&!forzarEf){
        if(w.autoPaletasDisponible!==P.total){w.autoPaletasDisponible=P.total;cambio=true;}
      }else{
        if(num(w.produccion.efectiva)!==P.total){w.produccion.efectiva=P.total;cambio=true;}
        if(!w.autoPaletas||w.autoPaletas.total!==P.total||w.autoPaletas.ids.length!==P.ids.length){
          w.autoPaletas={ids:P.ids,total:P.total};cambio=true;
        }
        if(w.autoPaletasDisponible!==undefined){delete w.autoPaletasDisponible;cambio=true;}
      }
    }else{
      if(w.autoPaletas){w.produccion.efectiva=0;delete w.autoPaletas;cambio=true;}
      if(w.autoPaletasDisponible!==undefined){delete w.autoPaletasDisponible;cambio=true;}
    }

    // 2) Paradas → solo minutos
    const sig=firma(deseadas);
    const actual=[...(w.paradasProgramadas||[]),...(w.paradasNoProgramadas||[])].filter(r=>r&&r.auto);
    if(firma(actual.map(r=>({origenId:r.origenId,tiempoMin:r.tiempoMin,descripcion:r.descripcion,tipo:r.tipo})))!==sig||
       (w.autoParadasSig||'')!==sig){
      const manualesP=(w.paradasProgramadas||[]).filter(r=>r&&!r.auto&&!vacia(r));
      const manualesN=(w.paradasNoProgramadas||[]).filter(r=>r&&!r.auto&&!vacia(r));
      const bloqueVacio=esNP=>({id:generarIdParadaProduccion(),descripcion:'',tiempoMin:0,...(esNP?{causa:''}:{})});
      w.paradasProgramadas=[...deseadas.filter(f=>f.tipo==='PROGRAMADA'),...manualesP];
      w.paradasNoProgramadas=[...deseadas.filter(f=>f.tipo==='NO_PROGRAMADA'),...manualesN];
      if(!w.paradasProgramadas.length)w.paradasProgramadas.push(bloqueVacio(false));
      if(!w.paradasNoProgramadas.length)w.paradasNoProgramadas.push(bloqueVacio(true));
      w.autoParadasSig=sig;
      cambio=true;
    }
    }
    return cambio;
  }

  /* Llena todos los cuadros abiertos. */
  function autollenarRegistro(opts){
    const o=opts||{};
    if(!activo()&&!o.forzar)return false;
    let cambio=false;
    normalizarCuadros(draft).forEach((_,i)=>{
      if(o.solo!==undefined&&o.solo!==i)return;
      if(llenarCuadro(i,!!o.forzar,o.campo)){cambio=true;if(typeof actualizarCuadro==='function')actualizarCuadro(i);}
    });
    if(cambio&&typeof syncLegacyFromCuadro1==='function')syncLegacyFromCuadro1();
    return cambio;
  }
  window.autollenarRegistro=autollenarRegistro;
  window.__autollenadoInternos={programadoDe,paradasBoton,paradasAvance,itemsLinea,paradasDeseadas,paletasDe};

  /* ---------- enlaces "Editar en origen" ---------- */
  function editarEnOrigen(origen,i){
    if(origen==='paletas'){
      state.currentLine=draft.linea;state.currentTab='paletas';state.viewingRecordId=null;
      if(typeof renderSidebar==='function')renderSidebar();
      renderMain();
    }else if(origen==='AVANCE'){
      if(typeof avAbrirParadas==='function')avAbrirParadas(draft.linea,draft.fecha,draft.turno);
    }else if(typeof goProduccionActual==='function'){
      goProduccionActual();
    }
  }
  window.registroEditarEnOrigen=editarEnOrigen;

  window.registroUsarPaletas=function(i){
    const q=normalizarCuadros(draft)[i];
    if(!q)return;
    if(!confirm('¿Reemplazar la producción escrita a mano por la de Paletas ('+num(q.autoPaletasDisponible).toLocaleString('es-PE')+' UND)?'))return;
    autollenarRegistro({forzar:true,solo:i,campo:'paletas'});
    renderFormTab();
    if(typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();
  };

  window.registroUsarProgramada=function(i){
    const q=normalizarCuadros(draft)[i];
    if(!q)return;
    if(!confirm('¿Reemplazar la cantidad programada escrita a mano por la de la programación ('+num(q.autoProgramadaDisponible).toLocaleString('es-PE')+')?'))return;
    autollenarRegistro({forzar:true,solo:i,campo:'programada'});
    renderFormTab();
    if(typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();
  };

  window.registroAsignarParada=function(id,i){
    if(!draft)return;
    draft.asignacionParadasAvance=draft.asignacionParadasAvance||{};
    draft.asignacionParadasAvance[id]=i===''?null:Number(i);
    autollenarRegistro();
    renderFormTab();
    if(typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();
  };

  /* Registro cerrado/guardado: lo agregado después no lo modifica; se avisa. */
  window.registroActualizarCuadro=async function(i){
    if(typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado()){
      alert('El reporte está finalizado. Reábrelo para actualizar sus datos.');return;
    }
    if(!confirm('Hay paletas o paradas nuevas. ¿Actualizar el registro con esos datos?'))return;
    autollenarRegistro({forzar:true,solo:i});
    if(typeof guardarAvanceReporte==='function')await guardarAvanceReporte({silencioso:true});
    renderFormTab();
  };

  /* ---------- filas automáticas en la tabla de paradas ---------- */
  window.registroFilaAuto=function(r,i,key,cuadroIndex,esProgramada){
    if(!r||!r.auto)return '';
    const origenTxt=r.origen==='PAUSA'?'Pausa programada':r.origen==='DETENER'?'Detener línea':'Avance/Cierre';
    return `<tr class="fila-auto">
      <td style="padding:5px;"><strong>${esc(r.descripcion)}</strong>
        <div><small>${origenTxt}</small></div></td>
      ${esProgramada?'':`<td style="padding:5px;">${esc(r.causa||'Otro')}</td>`}
      <td style="padding:5px;text-align:center;"><input type="number" value="${num(r.tiempoMin)}" readonly
        style="width:100%;box-sizing:border-box;text-align:center;font-weight:600;background:#f1f3f5;cursor:not-allowed;"></td>
      <td></td></tr>`;
  };

  /* Notas bajo la tabla: etiqueta Manual y aviso de posible duplicado. */
  window.registroNotaParadas=function(rows){
    const lista=Array.isArray(rows)?rows:[];
    const autos=lista.filter(r=>r&&r.auto);
    const manuales=lista.filter(r=>r&&!r.auto&&!vacia(r));
    if(!autos.length&&!manuales.length)return '';
    const dup=manuales.filter(m=>autos.some(a=>norm(a.descripcion)===norm(m.descripcion)));
    return `<div class="nota-auto">
      ${manuales.length?`<span class="tag-manual">Manual</span> ${manuales.length} fila${manuales.length>1?'s':''} escrita${manuales.length>1?'s':''} a mano `:''}
      ${dup.length?`<span class="aviso-dup">⚠ Posible duplicado de una parada ya registrada: ${dup.map(d=>esc(d.descripcion)).join(', ')}</span>`:''}
    </div>`;
  };

  /* ---------- avisos e inyección en pantalla ---------- */
  function estilos(){
    if(document.getElementById('autollenado-css'))return;
    const s=document.createElement('style');s.id='autollenado-css';
    s.textContent=`
      .tag-auto{display:inline-block;padding:1px 7px;border-radius:999px;background:#e3f1fb;color:#005b96;font-size:10px;font-weight:800;}
      .tag-manual{display:inline-block;padding:1px 7px;border-radius:999px;background:#eceff2;color:#5a7083;font-size:10px;font-weight:800;}
      .link-origen{margin-left:6px;font-size:11px;color:#005b96;text-decoration:underline;}
      .fila-auto td{background:#f6fbff;}
      .nota-auto{margin:6px 5px 0;font-size:11px;color:#667784;}
      .aviso-dup{color:#a86f00;font-weight:700;}
      .auto-aviso{margin:0 0 12px;padding:10px 12px;border:1px solid #efc98a;border-left:4px solid #e0a100;border-radius:8px;background:#fff8e6;color:#6b4a00;font-size:13px;}
      .auto-aviso select{margin-left:8px;}
    `;
    document.head.appendChild(s);
  }

  function inyectarAvisos(){
    const main=document.getElementById('main');
    if(!main||typeof draft==='undefined'||!draft||draft.autollenadoV1!==true)return;
    main.querySelectorAll('.auto-aviso').forEach(e=>e.remove());

    // Paradas de Avance/Cierre que necesitan que el supervisor elija la producción.
    const pend=paradasSinAsignar();
    const primera=main.querySelector('.production-card');
    if(pend.length&&primera){
      const cand=cuadrosConProducto();
      const div=document.createElement('div');div.className='auto-aviso';
      div.innerHTML=`<strong>Paradas de Avance/Cierre por asignar:</strong> elige a qué producción pertenece cada una.`+
        pend.map(p=>`<div style="margin-top:6px;">${esc(p.descripcion)} · ${Math.round(num(p.minutos))} min
          <select onchange="registroAsignarParada('${esc(p.id)}',this.value)">
            <option value="">Elegir producción…</option>
            ${cand.map(({q,i})=>`<option value="${i}">Producción ${i+1} · ${esc(q.marca)}</option>`).join('')}
          </select></div>`).join('');
      primera.parentNode.insertBefore(div,primera);
    }

    // Registro cerrado/finalizado: aviso si hay datos nuevos en origen.
    main.querySelectorAll('.production-card[data-cuadro-index]').forEach(card=>{
      const i=Number(card.dataset.cuadroIndex);
      const q=normalizarCuadros(draft)[i];
      if(!q||!q.marca||!q.presentacion)return;
      const congelado=q.estadoCuadro==='FINALIZADO'||(typeof reporteEstaBloqueado==='function'&&reporteEstaBloqueado());
      if(!congelado)return;
      const P=paletasDe(q);
      const Pr=programadoDe(q);
      const nuevasPaletas=(P.ids.length&&(!q.autoPaletas||q.autoPaletas.total!==P.total))||
        (Pr>0&&q.autoProgramada&&q.autoProgramada.total!==Pr);
      const nuevasParadas=firma(paradasDeseadas(i,q))!==(q.autoParadasSig||'');
      if(!nuevasPaletas&&!nuevasParadas)return;
      const div=document.createElement('div');div.className='auto-aviso';
      div.innerHTML=`Hay paletas, programación o paradas nuevas para esta producción. <button type="button" class="btn btn-sm btn-primary" style="margin-left:8px;" onclick="registroActualizarCuadro(${i})">Actualizar registro</button>`;
      card.insertBefore(div,card.firstChild);
    });
  }

  /* ---------- enganches ---------- */
  function preparar(){
    if(typeof draft==='undefined'||!draft||state.currentTab!=='nuevo')return;
    // Solo registros NUEVOS (sin id) se marcan; los ya guardados antes no se tocan.
    if(!draft.id&&draft.autollenadoV1===undefined)draft.autollenadoV1=true;
    if(autollenarRegistro()&&typeof programarGuardadoAutomaticoReporte==='function'){
      programarGuardadoAutomaticoReporte();
    }
  }

  if(typeof renderFormTab==='function'){
    const original=renderFormTab;
    renderFormTab=function(){
      try{preparar();}catch(e){console.warn('Autollenado:',e);}
      const r=original.apply(this,arguments);
      try{estilos();inyectarAvisos();}catch(e){console.warn('Autollenado (avisos):',e);}
      return r;
    };
    window.renderFormTab=renderFormTab;
  }

  /* Tiempo real: si cambian paletas, programación (botones) o paradas de Avance. */
  let esperando=null;
  function refrescar(){
    if(typeof state==='undefined'||!state.user||state.currentTab!=='nuevo'||!activo())return;
    const main=document.getElementById('main');
    const a=document.activeElement;
    const escribiendo=main&&a&&main.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if(!autollenarRegistro()){
      // Aunque no cambie el llenado, los avisos pueden cambiar.
      if(!escribiendo)inyectarAvisos();
      return;
    }
    if(typeof programarGuardadoAutomaticoReporte==='function')programarGuardadoAutomaticoReporte();
    if(escribiendo){
      // No se interrumpe lo que escribe el supervisor: se reintenta en unos segundos.
      clearTimeout(esperando);esperando=setTimeout(refrescar,3000);
      return;
    }
    renderFormTab();
  }
  window.registroAutoRefrescar=refrescar;

  ['onPaletasUpdated','onProgramacionesUpdated'].forEach(nombre=>{
    const anterior=globalThis[nombre];
    if(typeof anterior!=='function')return;
    globalThis[nombre]=function(){
      const r=anterior.apply(this,arguments);
      try{refrescar();}catch(e){console.warn('Autollenado:',e);}
      return r;
    };
  });

  // Minutos de pausas/detenciones abiertas siguen corriendo.
  setInterval(()=>{try{refrescar();}catch(_){/* siguiente ciclo */}},60000);
})();
