/* =============================================================
   GLACIAL · ASISTENTE DE PRODUCCIÓN — REPORTES EN EXCEL CON PREVISUALIZACIÓN Y CORRECCIÓN (Historial › Reportes)
   -------------------------------------------------------------
   Dos reportes del día elegido:
     · RESUMEN GENERAL  — todas las líneas (el Excel de siempre: Resumen general + una hoja por línea).
     · RESUMEN POR LÍNEA — solo las líneas marcadas (Resumen + sus hojas).
   Cada uno tiene «Previsualizar» y «Descargar Excel». La previsualización muestra lo MISMO que irá al Excel (73-reporte-general.js · modelo) y permite
   corregir los errores que son del Asistente en el DATO ORIGINAL, con historial y motivo:
     ✎ saldos inicial y final del consumo (conciliación; una confirmada la reabre quien valida) y mermas pendientes de validar.
   Lo que viene de otros módulos (programación, producción, paradas, personal) se ve pero no se edita aquí: se corrige donde nace.
   Al descargar, el Excel se arma otra vez con los datos vivos, así que sale con las correcciones.
   Usa los ayudantes de 72-asistente-pantalla.js (window.glacialAsistenteUI).
   ============================================================= */
(function instalarReportesAsistente(){
  'use strict';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const U=()=>window.glacialAsistenteUI;
  const RG=()=>window.glacialReporteGeneral;
  const D=()=>window.glacialAsistenteDatos;
  const N=()=>window.glacialAsistenteNucleo;

  /* Estado de la previsualización (se descarta al cerrarla). */
  const PV={fecha:'',lineas:null,modelo:null,cargando:false,error:'',msg:null,linea:'',editMerma:'',titulo:'',carga:0};
  const SEL={lineas:null};                                   // líneas marcadas para «Resumen por línea» (null = todas)
  const lineasElegidas=()=>SEL.lineas&&SEL.lineas.length?SEL.lineas:N().LINEAS.map(l=>l.codigo);

  /* ---------- tarjeta del Historial ---------- */
  function tarjeta(){
    const u=U();if(!u||!RG())return '';
    const AP=u.AP,exp=u.puede('reporteGeneral');
    if(!exp)return u.tarjeta('Reportes en Excel',u.vacio('Tu usuario no tiene permiso para los reportes.'));
    const el=lineasElegidas();
    const chk=N().LINEAS.map(l=>`<label class="ap-chk"><input type="checkbox" ${el.includes(l.codigo)?'checked':''} onchange="apRepLinea('${l.codigo}',this.checked)"> ${u.esc(l.nombre)}</label>`).join('');
    return u.tarjeta('Reportes en Excel',`<p class="ap-sub">Día operativo <b>${u.esc(AP.fecha)}</b>. Primero «Previsualizar» para revisar y corregir; después «Descargar Excel».</p>
      <div class="ap-2 ap-2-rep">
        <div class="ap-rep"><h4>${u.ico('excel')} Resumen general</h4><p class="ap-mut">Todas las líneas en un solo archivo: resumen del día + una hoja por línea.</p>
          <div class="ap-acc"><button type="button" class="ap-btn ap-btn-o" onclick="apRepPrevia('general')">${u.ico('lista')} Previsualizar</button>
          <button type="button" class="ap-btn ap-btn-excel" onclick="apRepDescargar('general')">${u.ico('excel')} Descargar Excel</button></div></div>
        <div class="ap-rep"><h4>${u.ico('excel')} Resumen por línea</h4><p class="ap-mut">Elige las líneas del archivo:</p><div class="ap-chks">${chk}</div>
          <div class="ap-acc"><button type="button" class="ap-btn ap-btn-o" onclick="apRepPrevia('lineas')">${u.ico('lista')} Previsualizar</button>
          <button type="button" class="ap-btn ap-btn-excel" onclick="apRepDescargar('lineas')">${u.ico('excel')} Descargar Excel</button></div></div>
      </div>`,{icono:'excel'});
  }
  window.apRepLinea=(cod,marcada)=>{const s=new Set(lineasElegidas());if(marcada)s.add(cod);else s.delete(cod);SEL.lineas=[...s];};

  /* ---------- descarga ---------- */
  window.apRepDescargar=modo=>{
    const u=U(),lineas=modo==='lineas'?lineasElegidas():null;
    if(modo==='lineas'&&!lineas.length){u.AP.msg={tipo:'error',texto:'Marca al menos una línea.'};u.pintar();return;}
    u.ejecutar(()=>RG().exportar(u.AP.fecha,{lineas}),r=>'Excel generado: '+r);
  };
  window.apRepDescargarPrevia=async()=>{
    const u=U();PV.msg=null;
    try{PV.msg={tipo:'ok',texto:'Excel generado: '+await RG().exportar(PV.fecha,{lineas:PV.lineas})};}
    catch(e){PV.msg={tipo:'error',texto:D().mensajeError(e)};}
    dibujar();
  };

  /* ---------- previsualización ---------- */
  window.apRepPrevia=async modo=>{
    const u=U();
    PV.fecha=u.AP.fecha;PV.lineas=modo==='lineas'?lineasElegidas():null;PV.titulo=modo==='lineas'?'Resumen por línea':'Resumen general';
    if(modo==='lineas'&&!PV.lineas.length){u.AP.msg={tipo:'error',texto:'Marca al menos una línea.'};u.pintar();return;}
    PV.msg=null;PV.editMerma='';PV.linea='';await recargar(true);
  };
  async function recargar(abrir){
    const id=++PV.carga;PV.cargando=true;PV.error='';
    if(abrir)dibujar();
    try{const m=await RG().modeloDeFecha(PV.fecha,{lineas:PV.lineas});if(id!==PV.carga)return;PV.modelo=m;}
    catch(e){if(id!==PV.carga)return;PV.error=D().mensajeError(e);}
    PV.cargando=false;dibujar();
  }
  const hhmm=f=>{if(f===null||f===undefined)return '—';const m=Math.round(f*1440);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
  const pct=(a,b)=>b>0?Math.round(a/b*1000)/10+' %':'—';

  function dibujar(){
    const u=U();if(!u)return;
    let cuerpo;
    if(PV.cargando&&!PV.modelo)cuerpo=u.pie('Leyendo los datos del día…');
    else if(PV.error)cuerpo=`<div class="ap-msg ap-msg-error" role="alert">${u.ico('alerta')}<span>${u.esc(PV.error)}</span></div>`;
    else cuerpo=contenido();
    u.modal(`Previsualización · ${u.esc(PV.titulo)} · ${u.esc(PV.fecha)}`,cuerpo,'ap-modal-xl');
  }

  function contenido(){
    const u=U(),m=PV.modelo,ed=u.puede('asistenteProduccion');
    const msg=PV.msg?`<div class="ap-msg ap-msg-${PV.msg.tipo==='error'?'error':'ok'}" role="status">${u.ico(PV.msg.tipo==='error'?'alerta':'check')}<span>${u.esc(PV.msg.texto)}</span></div>`:'';
    const obs=(m.observaciones||[]).map(o=>`<li class="ap-obs-${o.nivel}">${u.pill(o.nivel==='critico'?'Atención':o.nivel==='atencion'?'Revisar':'Nota',o.nivel==='critico'?'rojo':o.nivel==='atencion'?'ambar':'gris')} ${u.esc(o.texto)}</li>`).join('');
    const filas=m.lineas.map(l=>{
      const prog=l.cuadros.reduce((s,c)=>s+c.programado,0),prod=l.cuadros.reduce((s,c)=>s+c.producido,0),par=l.paradas.reduce((s,p)=>s+p.minutos,0);
      const pend=l.insumos.filter(i=>i.saldoInicial===null||i.saldoFinal===null).length,mp=l.mermas.filter(x=>x.estadoRaw==='PENDIENTE').length;
      return `<tr class="ap-clic" onclick="apRepLineaSel('${l.codigo}')"><td data-label="Línea"><b>${u.esc(l.nombre)}</b></td><td data-label="Turno">${u.esc(l.bloques)}</td>
        <td data-label="Programado" class="ap-num">${u.fmt(prog,0)}</td><td data-label="Producido" class="ap-num">${u.fmt(prod,0)}</td><td data-label="Cumpl." class="ap-num">${pct(prod,prog)}</td>
        <td data-label="Paradas" class="ap-num">${u.fmt(par,0)} min</td>
        <td data-label="Consumo">${l.insumos.length?(pend?u.pill(pend+' por conciliar','ambar','reloj'):u.pill('Completo','verde','check')):'<span class="ap-mut">—</span>'}</td>
        <td data-label="Mermas">${l.mermas.length?(mp?u.pill(mp+' pendiente(s)','ambar','reloj'):u.pill(l.mermas.length+' validada(s)','verde','check')):'<span class="ap-mut">—</span>'}</td>
        <td data-label="Detalle"><button type="button" class="ap-btn ap-btn-o ap-btn-s">Ver y corregir ${u.ico('flecha')}</button></td></tr>`;}).join('');
    const sel=m.lineas.find(l=>l.codigo===PV.linea);
    return `${msg}<p class="ap-sub">Esto es lo que irá al Excel. Lo marcado con ✎ lo puedes corregir aquí: se guarda en el dato original, con tu nombre y motivo.${ed?'':' <b>Tu usuario es solo de consulta: no puede corregir.</b>'}</p>
      ${obs?`<ul class="ap-obs">${obs}</ul>`:''}
      ${u.tabla(['Línea','Turno','#Programado','#Producido','#Cumpl.','#Paradas','Consumo','Mermas',''],filas,'ap-t-click')}
      ${sel?detalleLinea(sel,ed):u.pie('Toca una línea para ver su detalle y corregir.')}
      <div class="ap-acc ap-acc-wrap"><button type="button" class="ap-btn ap-btn-o" onclick="apRepRefrescar()">${u.ico('reloj')} Actualizar</button>
        <button type="button" class="ap-btn ap-btn-excel" onclick="apRepDescargarPrevia()">${u.ico('excel')} Descargar Excel</button>
        <button type="button" class="ap-btn" onclick="closeModal()">Cerrar</button></div>`;
  }
  window.apRepLineaSel=cod=>{PV.linea=PV.linea===cod?'':cod;PV.editMerma='';dibujar();};
  window.apRepRefrescar=()=>{PV.msg=null;recargar(false);};

  function detalleLinea(l,ed){
    const u=U();
    const cuadros=l.cuadros.length?u.tabla(['Cuadro','Bloque','Marca','Presentación','Lote','Inicio','Fin','#Programado','#Producido','Cierre'],l.cuadros.map(c=>`<tr><td data-label="Cuadro">${u.esc(c.codigo)}</td><td data-label="Bloque">${c.bloque==='NOCHE'?'Noche':'Día'}</td>
      <td data-label="Marca">${u.esc(c.marca)}</td><td data-label="Presentación">${u.esc(c.presentacion)}</td><td data-label="Lote">${u.esc(c.lote||'—')}</td><td data-label="Inicio">${hhmm(c.inicio)}</td><td data-label="Fin">${hhmm(c.fin)}</td>
      <td data-label="Programado" class="ap-num">${u.fmt(c.programado,0)}</td><td data-label="Producido" class="ap-num">${u.fmt(c.producido,0)}</td>
      <td data-label="Cierre">${c.cierre==='Confirmado'?u.pill('Confirmado','verde','check'):c.cierre==='Sin cierre'?u.pill('Sin cierre','ambar','reloj'):u.pill('Sin producción','gris')}</td></tr>`).join('')):u.vacio(l.motivo||'Sin producción registrada.');
    const paradas=l.paradas.length?u.tabla(['Evento','Cuadro','Tipo','Equipo','#Minutos','Motivo'],l.paradas.map(p=>`<tr><td data-label="Evento">${u.esc(p.evento)}</td><td data-label="Cuadro">${u.esc(p.cuadro)}</td><td data-label="Tipo">${u.esc(p.tipo)}</td>
      <td data-label="Equipo">${u.esc(p.equipo)}</td><td data-label="Minutos" class="ap-num">${u.fmt(p.minutos,0)}</td><td data-label="Motivo">${u.esc(p.motivo||'—')}</td></tr>`).join('')):u.vacio('Sin paradas registradas.');
    return `<section class="ap-card ap-card-in"><h3>${u.esc(l.nombre)} · detalle</h3>
      <h4>Cuadros del día <small class="ap-mut">(vienen de Programación, Paletas y Cierre: se corrigen en su módulo)</small></h4>${cuadros}
      <h4>Paradas <small class="ap-mut">(se corrigen en Avance / Cierre)</small></h4>${paradas}
      <h4>${u.ico('lista')} Insumos y consumo ✎</h4>${consumo(l,ed)}
      <h4>${u.ico('alerta')} Mermas ✎</h4>${mermas(l,ed)}
      <h4>Personal <small class="ap-mut">(viene del Tareo)</small></h4>${l.personal.length?u.tabla(['Código','Nombre','Puesto','Bloque','Asistencia'],l.personal.map(p=>`<tr><td data-label="Código">${u.esc(p.codigo)}</td><td data-label="Nombre">${u.esc(p.nombre)}</td><td data-label="Puesto">${u.esc(p.puesto||'—')}</td><td data-label="Bloque">${u.esc(p.bloque)}</td><td data-label="Asistencia">${u.esc(p.asistencia)}</td></tr>`).join('')):u.vacio('Sin personal asignado a esta línea.')}
    </section>`;
  }

  /* ---------- consumo (saldos editables) ---------- */
  const claveFila=i=>(i.claveCuadro+'||'+i.insumoCodigo);
  function consumo(l,ed){
    const u=U();
    if(!l.insumos.length)return u.vacio('Sin insumos con factor para esta línea.');
    const v=D().puede('validarMermas');
    const filas=l.insumos.map((i,k)=>{
      const conf=i.estadoConcil==='CONFIRMADA',bloqueada=conf||!ed;
      const real=i.saldoInicial!==null&&i.saldoFinal!==null?N().red(i.saldoInicial+i.entregado-i.devuelto-i.saldoFinal,4):null;
      const inp=(campo,valor)=>`<input class="ap-in-s" id="ap-rp-${campo}-${k}" type="number" step="any" min="0" value="${valor===null?'':u.esc(valor)}" ${bloqueada?'disabled':''} aria-label="${campo}">`;
      const acc=conf?(v?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apRepReabrir(${k})">Reabrir</button>`:`<span class="ap-mut">Confirmada: la reabre quien valida</span>`)
        :(ed?`<button type="button" class="ap-btn ap-btn-s" onclick="apRepGuardarSaldos(${k})">Guardar ✎</button>`:'');
      return `<tr><td data-label="Cuadro">${u.esc(i.cuadro)}</td><td data-label="Insumo">${u.esc(i.insumo)}</td><td data-label="Saldo inicial" class="ap-num">${inp('ini',i.saldoInicial)}</td>
        <td data-label="Entregado" class="ap-num">${u.fmt(i.entregado)}</td><td data-label="Devuelto" class="ap-num">${u.fmt(i.devuelto)}</td><td data-label="Saldo final" class="ap-num">${inp('fin',i.saldoFinal)}</td>
        <td data-label="Consumo real" class="ap-num">${real===null?u.pill('Pendiente','ambar','reloj'):u.fmt(real)+' '+u.esc(i.unidad)}</td>
        <td data-label="Estado">${conf?u.pill('Confirmada','verde','check'):i.estadoConcil==='SIN_REGISTRO'?u.pill('Sin registro','gris'):u.pill(i.estadoConcil==='EN_REVISION'?'En revisión':'Borrador','ambar')}</td><td data-label="">${acc}</td></tr>`;}).join('');
    return u.tabla(['Cuadro','Insumo','#Saldo inicial','#Entregado','#Devuelto','#Saldo final','#Consumo real','Estado',''],filas,'ap-t-plano');
  }
  const filaConsumo=k=>{const l=PV.modelo.lineas.find(x=>x.codigo===PV.linea);return l&&l.insumos[k];};
  const leer=id=>{const e=document.getElementById(id);return e?e.value:'';};
  window.apRepGuardarSaldos=async k=>{
    const i=filaConsumo(k);if(!i)return;
    const ini=leer('ap-rp-ini-'+k),fin=leer('ap-rp-fin-'+k);
    if(ini===''&&fin==='')return aviso('error','Escribe al menos un saldo.');
    if((ini!==''&&!(num(ini)>=0))||(fin!==''&&!(num(fin)>=0)))return aviso('error','Los saldos deben ser números mayores o iguales a 0.');
    const nota=(prompt('Motivo de la corrección (mínimo 5 caracteres):','')||'').trim();
    if(nota.length<5)return aviso('error','Hace falta el motivo de la corrección (mínimo 5 caracteres).');
    try{
      await D().guardarConciliacion({fecha:i.fecha,bloque:i.bloque,linea:i.linea,cuadro:i.claveCuadro,insumo:i.insumoCodigo,unidad:i.unidad,
        saldoInicial:ini===''?null:num(ini),saldoFinal:fin===''?null:num(fin),observaciones:i.observaciones,nota:'Corregida en la previsualización: '+nota},'BORRADOR',i.version);
      PV.msg={tipo:'ok',texto:'Saldos guardados. El reporte ya los usa.'};await recargar(false);
    }catch(e){aviso('error',D().mensajeError(e));}
  };
  window.apRepReabrir=async k=>{
    const i=filaConsumo(k);if(!i)return;
    const nota=(prompt('Motivo para reabrir la conciliación (mínimo 5 caracteres):','')||'').trim();
    if(nota.length<5)return aviso('error','Hace falta el motivo (mínimo 5 caracteres).');
    try{await D().guardarConciliacion({fecha:i.fecha,bloque:i.bloque,linea:i.linea,cuadro:i.claveCuadro,insumo:i.insumoCodigo,unidad:i.unidad,nota},'REABRIR',i.version);
      PV.msg={tipo:'ok',texto:'Conciliación reabierta: ya se puede corregir y volver a enviar a revisión.'};await recargar(false);}
    catch(e){aviso('error',D().mensajeError(e));}
  };
  function aviso(tipo,texto){PV.msg={tipo,texto};dibujar();}

  /* ---------- mermas (corrección) ---------- */
  function mermas(l,ed){
    const u=U();
    if(!l.mermas.length)return u.vacio('Sin mermas registradas (las rechazadas no entran al reporte).');
    const filas=l.mermas.map(x=>{
      const pen=x.estadoRaw==='PENDIENTE';
      return `<tr><td data-label="Evento">${u.esc(x.evento)}</td><td data-label="Cuadro">${u.esc(x.cuadro)}</td><td data-label="Material">${u.esc(x.material)}</td><td data-label="Cantidad" class="ap-num">${u.fmt(x.cantidad)} ${u.esc(x.unidad)}</td>
        <td data-label="Causa">${u.esc(x.causa||'—')}</td><td data-label="Estado">${pen?u.pill('Pendiente','ambar','reloj'):u.pill('Validada','verde','check')}</td>
        <td data-label="">${pen&&ed?`<button type="button" class="ap-btn ap-btn-o ap-btn-s" onclick="apRepEditarMerma('${u.esc(x.id)}')">Corregir ✎</button>`:(pen?'':'<span class="ap-mut">Validada: no se edita</span>')}</td></tr>`;}).join('');
    const f=PV.editMerma?l.mermas.find(x=>x.id===PV.editMerma):null;
    return u.tabla(['Evento','Cuadro','Material','#Cantidad','Causa','Estado',''],filas)+(f?formMerma(l,f):'');
  }
  window.apRepEditarMerma=id=>{PV.editMerma=id;dibujar();};
  window.apRepCancelarMerma=()=>{PV.editMerma='';dibujar();};
  function formMerma(l,x){
    const u=U(),Dd=D();
    const insumos=Dd.cache.insumos.filter(i=>i.activo!==false);
    const cuadros=l.cuadros;
    const sel=(id,lista,actual)=>`<select id="${id}">${lista.map(([v,t])=>`<option value="${u.esc(v)}" ${v===actual?'selected':''}>${u.esc(t)}</option>`).join('')}</select>`;
    return `<div class="ap-card ap-card-in ap-edit"><h4>Corregir merma ${u.esc(x.evento)}</h4>
      <div class="ap-form ap-form-3">
        ${u.campo('Material',sel('ap-em-ins',insumos.map(i=>[i.codigo,i.nombre+' ('+i.unidad+')']),x.insumoCodigo))}
        ${u.campo('Cantidad',`<input id="ap-em-cant" type="number" step="any" min="0" value="${u.esc(x.cantidad)}">`)}
        ${u.campo('Cuadro',sel('ap-em-cua',cuadros.map(c=>[c.clave,c.codigo+' · '+c.marca+' '+c.presentacion]),x.claveCuadro))}
        ${u.campo('Causa',sel('ap-em-cau',Dd.causasMerma().map(c=>[c,c]),x.causa))}
        ${u.campo('Etapa',sel('ap-em-eta',[['','—']].concat(Dd.etapasMerma().map(c=>[c,c])),x.etapa))}
        ${u.campo('Lote',`<input id="ap-em-lot" maxlength="40" value="${u.esc(x.lote)}">`)}
        ${u.campo('Observaciones',`<input id="ap-em-obs" maxlength="200" value="${u.esc(x.observaciones)}">`,'ap-ancho')}
        ${u.campo('Motivo de la corrección (obligatorio)',`<input id="ap-em-mot" maxlength="200" placeholder="Ej.: cantidad mal digitada">`,'ap-ancho')}
      </div>
      <div class="ap-acc"><button type="button" class="ap-btn ap-btn-o" onclick="apRepCancelarMerma()">Cancelar</button><button type="button" class="ap-btn" onclick="apRepGuardarMerma('${u.esc(x.id)}')">Guardar corrección</button></div></div>`;
  }
  window.apRepGuardarMerma=async id=>{
    const l=PV.modelo.lineas.find(y=>y.codigo===PV.linea),x=l&&l.mermas.find(y=>y.id===id);if(!x)return;
    const insCod=leer('ap-em-ins'),ins=D().cache.insumos.find(i=>i.codigo===insCod),cu=l.cuadros.find(c=>c.clave===leer('ap-em-cua'));
    try{
      await D().editarMerma(id,{insumo:insCod,unidad:ins?ins.unidad:x.unidad,cantidad:leer('ap-em-cant'),cuadro:leer('ap-em-cua'),marca:cu?cu.marca:undefined,presentacion:cu?cu.presentacion:undefined,
        causa:leer('ap-em-cau'),etapa:leer('ap-em-eta'),lote:leer('ap-em-lot'),observaciones:leer('ap-em-obs')},x.version,leer('ap-em-mot'));
      PV.editMerma='';PV.msg={tipo:'ok',texto:'Merma corregida. El reporte ya la usa.'};await recargar(false);
    }catch(e){aviso('error',D().mensajeError(e));}
  };

  window.glacialAsistenteReportes={tarjeta,PV,SEL};
})();
