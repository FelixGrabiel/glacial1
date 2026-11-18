/* =============================================================
   GLACIAL · ALMACÉN › PRODUCTO TERMINADO · DESPACHOS Y STOCK · ALERTAS · RESUMEN DEL TURNO
   -------------------------------------------------------------
   · STOCK de producto terminado por línea y producto = lo RECIBIDO (acumulado de Almacén: paletas completas + unidades, incluido el saldo contado) − lo DESPACHADO.
   · DESPACHOS (almacenPtDespacho, glacial_61): libro inmutable de salidas. Un despacho lleva destino, referencia/guía (opcional) y de 1 a 30 líneas de producto con
     paletas y unidades. Corregir = anular (con motivo) y volver a despachar. Lo registra el almacenero identificado (cuenta compartida) o quien tiene el permiso de Almacén.
     No se puede despachar más de lo que hay en stock (se comprueba en pantalla; el servidor valida la forma del documento).
   · ALERTAS: paletas por recibir hace más de 4 h y saldos entregados por el supervisor sin contar hace más de 2 h.
   · RESUMEN DEL TURNO: texto listo para copiar o enviar por WhatsApp (recibido, diferencias, pendiente, saldos, despachos del día y stock).
   La lógica pura se prueba con node (tests/almacen-despachos.test.js). Cargar después de 103-almacen-compartido.js.
   ============================================================= */
(function(raiz){
  'use strict';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const claveProducto=x=>[x.linea||'',x.marca||'',x.presentacion||''].join('|');

  /* ---------- lógica pura ---------- */
  /** despachos: documentos de almacenPtDespacho. → vigentes (sin los anulados), cada uno con su fila. */
  function vigentes(despachos){
    const anul=new Set();
    (despachos||[]).forEach(d=>{if(d&&d.tipo==='ANULACION'&&d.anulaA)anul.add(d.anulaA);});
    return (despachos||[]).filter(d=>d&&d.tipo==='DESPACHO'&&Array.isArray(d.items)&&!anul.has(d.opId));
  }
  /** recibido: [{linea,marca,presentacion,paletas,unidades}] (acumulado de Almacén) → stock por producto {recibido, despachado, stock} en paletas y unidades. */
  function stock(recibido,despachos){
    const m=new Map();
    const fila=x=>{const k=claveProducto(x);if(!m.has(k))m.set(k,{clave:k,linea:x.linea||'',marca:x.marca||'',presentacion:x.presentacion||'',recPal:0,recUnd:0,desPal:0,desUnd:0});return m.get(k);};
    (recibido||[]).forEach(x=>{const f=fila(x);f.recPal+=num(x.paletas);f.recUnd+=num(x.unidades);});
    vigentes(despachos).forEach(d=>d.items.forEach(i=>{const f=fila(i);f.desPal+=num(i.paletas);f.desUnd+=num(i.unidades);}));
    const lista=[...m.values()].map(f=>({...f,stockPal:f.recPal-f.desPal,stockUnd:f.recUnd-f.desUnd})).sort((a,b)=>String(a.linea).localeCompare(String(b.linea),'es')||String(a.marca+a.presentacion).localeCompare(String(b.marca+b.presentacion),'es'));
    const total=lista.reduce((t,f)=>({recPal:t.recPal+f.recPal,recUnd:t.recUnd+f.recUnd,desPal:t.desPal+f.desPal,desUnd:t.desUnd+f.desUnd,stockPal:t.stockPal+f.stockPal,stockUnd:t.stockUnd+f.stockUnd}),{recPal:0,recUnd:0,desPal:0,desUnd:0,stockPal:0,stockUnd:0});
    return {lista,total};
  }
  /** Unidades por paleta aproximadas de un producto (para sugerir las unidades al escribir las paletas). */
  const unidadesPorPaleta=f=>f&&f.recPal>0?Math.round(f.recUnd/f.recPal):0;
  /** form: {destino, referencia, lineas:[{clave,paletas,unidades}]}; stockLista: stock().lista → lista de errores. */
  function validarDespacho(form,stockLista){
    const e=[],d=String(form&&form.destino||'').replace(/\s+/g,' ').trim();
    if(d.length<2||d.length>80)e.push('Escribe el destino o cliente (de 2 a 80 caracteres).');
    if(String(form&&form.referencia||'').length>60)e.push('La referencia o guía admite hasta 60 caracteres.');
    const lineas=((form&&form.lineas)||[]).filter(l=>num(l.unidades)>0||num(l.paletas)>0);
    if(!lineas.length)e.push('Agrega al menos un producto con cantidad.');
    if(lineas.length>30)e.push('Un despacho admite hasta 30 productos.');
    lineas.forEach(l=>{
      const f=(stockLista||[]).find(x=>x.clave===l.clave),n=f?(f.linea+' '+f.marca+' '+f.presentacion).trim():l.clave;
      if(!f){e.push(n+': ese producto no tiene stock.');return;}
      if(!Number.isInteger(num(l.paletas))||num(l.paletas)<0)e.push(n+': las paletas deben ser un número entero (0 o más).');
      if(!Number.isInteger(num(l.unidades))||num(l.unidades)<=0)e.push(n+': escribe las unidades (número entero mayor que 0).');
      if(num(l.unidades)>f.stockUnd)e.push(n+': despachas '+num(l.unidades)+' UND y solo hay '+f.stockUnd+'.');
      if(num(l.paletas)>f.stockPal)e.push(n+': despachas '+num(l.paletas)+' paletas y solo hay '+f.stockPal+'.');
    });
    return e;
  }
  const idDespacho=(ms,azar)=>'DESP_'+Math.floor(ms)+'_'+String(azar||Math.random().toString(36).slice(2,8)).toLowerCase().replace(/[^a-z0-9]/g,'').padEnd(4,'0').slice(0,6);
  function construirDespacho(form,stockLista,ms,azar){
    const lineas=(form.lineas||[]).filter(l=>num(l.unidades)>0||num(l.paletas)>0);
    const id=idDespacho(ms,azar);
    return {opId:id,tipo:'DESPACHO',destino:String(form.destino).replace(/\s+/g,' ').trim(),referencia:String(form.referencia||'').trim()||null,
      items:lineas.map(l=>{const f=stockLista.find(x=>x.clave===l.clave);return {linea:f.linea,marca:f.marca,presentacion:f.presentacion,paletas:num(l.paletas),unidades:num(l.unidades)};})};
  }
  const docAnulacionDespacho=(d,motivo)=>({opId:'ANUL_'+d.opId,tipo:'ANULACION',anulaA:d.opId,motivo:String(motivo||'').trim().slice(0,300)});
  /** Alertas de lo que se queda sin atender. items: tramos PENDIENTE (con ms); saldos: de saldos(); ahora en ms. */
  function alertas(items,saldos,ahora,cfg){
    const c=Object.assign({horasPaletas:4,horasSaldo:2},cfg||{}),out=[],H=3600000;
    const viejas=(items||[]).filter(x=>x.estado==='PENDIENTE'&&x.ms&&ahora-x.ms>c.horasPaletas*H);
    if(viejas.length){
      const pal=viejas.reduce((n,x)=>n+num(x.paleta.paletas),0),mas=Math.max(...viejas.map(x=>ahora-x.ms));
      out.push({tipo:'PALETAS',nivel:mas>12*H?'roja':'ambar',texto:pal+(pal===1?' paleta lleva':' paletas llevan')+' más de '+c.horasPaletas+' h por recibir (la más antigua, hace '+Math.floor(mas/H)+' h).'});
    }
    const sd=(saldos||[]).filter(x=>x.estado==='ENTREGADO'&&x.entrega&&ahora-msDe(x.entrega)>c.horasSaldo*H);
    if(sd.length)out.push({tipo:'SALDOS',nivel:'ambar',texto:sd.length+(sd.length===1?' saldo entregado por el supervisor sigue':' saldos entregados por el supervisor siguen')+' sin contar (más de '+c.horasSaldo+' h).'});
    const dif=(saldos||[]).filter(x=>x.estado==='DIFERENCIA').length;
    if(dif)out.push({tipo:'DIFERENCIA',nivel:'roja',texto:dif+(dif===1?' saldo no coincide':' saldos no coinciden')+' entre el supervisor y Almacén.'});
    return out;
  }
  function msDe(d){const g=d&&d.guardadoEn;return g&&g.toMillis?g.toMillis():num(g);}
  const fechaLima=ms=>{try{return new Date(ms).toLocaleDateString('en-CA',{timeZone:'America/Lima'});}catch(_){return '';}};
  const f2=n=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:0});
  const nom=x=>(x.linea+' · '+(x.marca+' '+x.presentacion).trim()).trim();
  /** Texto del cierre del turno de Almacén. datos: {fecha, turno:'DIA'|'NOCHE', recibidas:[items RECIBIDA/DIFERENCIA/OBSERVADA], pendientes:[items], saldos:[], despachos:[docs], stock:{lista,total}} */
  function resumenTurnoTexto(d){
    const fechaTxt=String(d.fecha||'').split('-').reverse().join('/'),turno=d.turno==='NOCHE'?'Noche':'Día (Día + Intermedio)';
    const L=['RESUMEN ALMACÉN · Producto terminado','Fecha: '+fechaTxt+' · Turno: '+turno,''];
    const rec=(d.recibidas||[]).filter(x=>x.estado==='RECIBIDA'||x.estado==='DIFERENCIA');
    const porP=new Map();
    rec.forEach(x=>{const k=claveProducto(x.paleta);const o=porP.get(k)||{p:x.paleta,pal:0,und:0};o.pal+=x.estado==='RECIBIDA'?num(x.paleta.paletas):0;o.und+=num(x.recepcion&&x.recepcion.unidadesRecibidas);porP.set(k,o);});
    L.push('RECIBIDO');
    if(porP.size){let tp=0,tu=0;porP.forEach(o=>{tp+=o.pal;tu+=o.und;L.push('• '+nom(o.p)+': '+f2(o.pal)+(o.pal===1?' paleta':' paletas')+' · '+f2(o.und)+' UND');});L.push('Total: '+f2(tp)+' paletas · '+f2(tu)+' UND');}else L.push('• Nada recibido en este turno.');
    const dif=(d.recibidas||[]).filter(x=>x.estado==='DIFERENCIA'||x.estado==='OBSERVADA');
    if(dif.length){L.push('','CON DIFERENCIA O EN OBSERVACIÓN');dif.forEach(x=>L.push('• '+nom(x.paleta)+': '+(x.estado==='OBSERVADA'?'en observación':'diferencia de '+f2(x.recepcion&&x.recepcion.diferencia)+' UND')+(x.recepcion&&x.recepcion.motivo?' ('+x.recepcion.motivo+')':'')));}
    const pen=d.pendientes||[];
    L.push('','POR RECIBIR');
    if(pen.length){const pp=pen.reduce((n,x)=>n+num(x.paleta.paletas),0);pen.forEach(x=>L.push('• '+nom(x.paleta)+': '+f2(x.paleta.paletas)+' paletas · '+f2(x.paleta.totalUnidades)+' UND'));L.push('Total pendiente: '+f2(pp)+' paletas');}else L.push('• Nada pendiente.');
    const sd=(d.saldos||[]).filter(x=>['EN_LINEA','ENTREGADO','SIN_ENTREGA','DIFERENCIA'].includes(x.estado));
    if(sd.length){L.push('','SALDOS INCOMPLETOS SIN CERRAR');sd.forEach(x=>L.push('• '+nom(x.paleta)+': '+({EN_LINEA:'en línea',ENTREGADO:'entregado, falta contar',SIN_ENTREGA:'contado, falta la entrega del supervisor',DIFERENCIA:'con diferencia'}[x.estado])));}
    const ds=vigentes(d.despachos).filter(x=>fechaLima(msDe(x))===d.fecha);
    L.push('','DESPACHADO EL '+fechaTxt);
    if(ds.length){ds.forEach(x=>{const p=x.items.reduce((n,i)=>n+num(i.paletas),0),u=x.items.reduce((n,i)=>n+num(i.unidades),0);L.push('• '+x.destino+(x.referencia?' ('+x.referencia+')':'')+': '+f2(p)+' paletas · '+f2(u)+' UND');});}else L.push('• Sin despachos.');
    if(d.stock&&d.stock.total)L.push('','STOCK ACTUAL: '+f2(d.stock.total.stockPal)+' paletas · '+f2(d.stock.total.stockUnd)+' UND');
    return L.join('\n');
  }
  const NUCLEO={claveProducto,vigentes,stock,unidadesPorPaleta,validarDespacho,idDespacho,construirDespacho,docAnulacionDespacho,alertas,resumenTurnoTexto,fechaLima};
  if(typeof module!=='undefined'&&module.exports){module.exports=NUCLEO;}
  if(typeof window==='undefined'||!window.document)return;

  /* ---------- parte del navegador ---------- */
  const W=window;
  const P=()=>W.glacialAlmacenPT,CX=()=>P().ctx();
  const S={despachos:[],listo:false,error:'',form:{destino:'',referencia:'',lineas:{}},msg:null,guardando:false,anular:'',motivo:'',resumen:null};
  let cierre=null;let repintar=()=>{};
  function escuchar(rep){
    repintar=rep||repintar;
    if(cierre||typeof db==='undefined')return;
    cierre=db.collection('almacenPtDespacho').onSnapshot(s=>{S.despachos=s.docs.map(d=>d.data()).filter(x=>x&&x.opId);S.listo=true;S.error='';repintar();},
      e=>{S.error=((e&&e.code)||'').includes('permission')?'Falta aplicar glacial_61 o tu usuario no tiene permiso para ver los despachos.':((e&&e.message)||String(e));S.listo=true;repintar();});
  }
  function detener(){if(cierre){try{cierre();}catch(_){/* ya cerrada */}cierre=null;}}
  if(W.glacialCierresSesion)W.glacialCierresSesion.push(()=>{detener();S.despachos=[];S.listo=false;S.form={destino:'',referencia:'',lineas:{}};S.msg=null;});
  const stockActual=()=>{const c=CX();return stock(c.acumulado(),S.despachos);};

  /* ---------- pestaña Stock ---------- */
  function htmlStock(c){
    const st=stock(c.acumulado(),S.despachos),und=c.ES.unidad==='und',e=c.esc,fmt=c.fmt;
    const cel=(p,u)=>und?`<b>${fmt(u)} UND</b><small>${fmt(p)} paletas</small>`:`<b>${fmt(p)} ${p===1?'paleta':'paletas'}</b><small>${fmt(u)} UND</small>`;
    return `<div class="pt-card"><h3>Stock de producto terminado</h3><p class="pt-mut">Stock = lo recibido por Almacén − lo despachado. Cuenta desde el 16/11/2026. El saldo incompleto contado entra en unidades.</p>
      ${st.lista.length?`<table class="pt-t"><thead><tr><th>Línea</th><th>Producto</th><th class="pt-n">Recibido</th><th class="pt-n">Despachado</th><th class="pt-n">Stock</th></tr></thead><tbody>${st.lista.map(f=>`<tr><td data-l="Línea"><b>${e(c.nombreLinea(f.linea))}</b></td><td data-l="Producto">${e(f.marca)} ${e(f.presentacion)}</td><td data-l="Recibido" class="pt-n">${cel(f.recPal,f.recUnd)}</td><td data-l="Despachado" class="pt-n">${cel(f.desPal,f.desUnd)}</td><td data-l="Stock" class="pt-n" style="${f.stockUnd<0||f.stockPal<0?'color:#c62828':''}">${cel(f.stockPal,f.stockUnd)}</td></tr>`).join('')}
        <tr style="background:#f4f9fd"><td colspan="2"><b>Total</b></td><td class="pt-n">${cel(st.total.recPal,st.total.recUnd)}</td><td class="pt-n">${cel(st.total.desPal,st.total.desUnd)}</td><td class="pt-n">${cel(st.total.stockPal,st.total.stockUnd)}</td></tr></tbody></table>`:'<div class="pt-vacio">Todavía no hay producto recibido.</div>'}</div>`;
  }

  /* ---------- pestaña Despachos ---------- */
  const fechaHora=ms=>{try{return new Date(ms).toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}catch(_){return '';}};
  function htmlDespachos(c){
    const st=stock(c.acumulado(),S.despachos),conStock=st.lista.filter(f=>f.stockUnd>0),e=c.esc,fmt=c.fmt,puede=c.puedeEscribir();
    const lista=vigentes(S.despachos).sort((a,b)=>msDe(b)-msDe(a)).slice(0,40);
    const L=S.form.lineas;
    const form=puede?`<div class="pt-card"><h3>Nuevo despacho</h3>${S.msg?`<div class="pt-msg ${S.msg.tipo==='error'?'pt-msg-e':'pt-msg-k'}" role="status">${e(S.msg.texto)}</div>`:''}
      <div class="pt-form"><label>Destino o cliente<input maxlength="80" value="${e(S.form.destino)}" oninput="pdCampo('destino',this.value)" placeholder="Ej.: Cliente Norte"></label><label>Guía o referencia (opcional)<input maxlength="60" value="${e(S.form.referencia)}" oninput="pdCampo('referencia',this.value)" placeholder="Ej.: G001-0234"></label></div>
      ${conStock.length?`<table class="pt-t" style="margin-top:10px"><thead><tr><th>Producto</th><th class="pt-n">Stock</th><th class="pt-n">Paletas</th><th class="pt-n">Unidades</th></tr></thead><tbody>${conStock.map(f=>{const x=L[f.clave]||{paletas:'',unidades:''};return `<tr><td data-l="Producto"><b>${e(c.nombreLinea(f.linea))}</b> · ${e(f.marca)} ${e(f.presentacion)}</td><td data-l="Stock" class="pt-n">${fmt(f.stockPal)} pal · ${fmt(f.stockUnd)} UND</td>
        <td data-l="Paletas" class="pt-n"><input type="number" min="0" step="1" inputmode="numeric" style="width:90px" value="${e(x.paletas)}" oninput="pdLinea('${e(f.clave)}','paletas',this.value)" aria-label="Paletas de ${e(f.marca)} ${e(f.presentacion)}"></td>
        <td data-l="Unidades" class="pt-n"><input type="number" min="0" step="1" inputmode="numeric" style="width:110px" id="pd-und-${e(f.clave.replace(/[^a-z0-9]/gi,'_'))}" value="${e(x.unidades)}" oninput="pdLinea('${e(f.clave)}','unidades',this.value)" aria-label="Unidades de ${e(f.marca)} ${e(f.presentacion)}"></td></tr>`;}).join('')}</tbody></table>
        <div class="pt-ac" style="margin-top:10px;justify-content:flex-start"><button type="button" class="pt-b pt-b-v" onclick="pdRegistrar()" ${S.guardando?'disabled':''}>${S.guardando?'Guardando…':'Registrar despacho'}</button><span class="pt-mut">Las unidades se sugieren al escribir las paletas; puedes ajustarlas. No se puede despachar más que el stock.</span></div>`:'<div class="pt-vacio">No hay stock de producto terminado para despachar.</div>'}</div>`
      :'<div class="pt-msg pt-msg-i">Solo consulta: para registrar despachos identifícate con tu PIN (cuenta compartida) o usa un usuario con permiso de Almacén.</div>';
    const hist=`<div class="pt-card"><h3>Despachos recientes</h3>${S.error?`<div class="pt-msg pt-msg-e">${e(S.error)}</div>`:''}${lista.length?`<table class="pt-t"><thead><tr><th>Cuándo</th><th>Destino</th><th>Productos</th><th>Registró</th><th></th></tr></thead><tbody>${lista.map(d=>{const ab=S.anular===d.opId;
      return `<tr><td data-l="Cuándo">${e(fechaHora(msDe(d)))}</td><td data-l="Destino"><b>${e(d.destino)}</b>${d.referencia?`<small>${e(d.referencia)}</small>`:''}</td><td data-l="Productos">${d.items.map(i=>`<div>${e(i.marca)} ${e(i.presentacion)} · ${fmt(i.paletas)} pal · ${fmt(i.unidades)} UND</div>`).join('')}</td><td data-l="Registró">${e((d.almacenero&&d.almacenero.nombre)||d.usuario||'')}</td>
        <td>${puede?`<button type="button" class="pt-b pt-b-r" onclick="pdAnular('${e(d.opId)}')">Anular</button>`:''}</td></tr>${ab?`<tr class="pt-det"><td colspan="5"><div class="pt-form"><label>Motivo de la anulación (mínimo 5 caracteres)<textarea rows="2" maxlength="300" oninput="pdMotivo(this.value)">${e(S.motivo)}</textarea></label><button type="button" class="pt-b pt-b-r" onclick="pdAnularOk('${e(d.opId)}')" ${S.guardando?'disabled':''}>Anular despacho</button><button type="button" class="pt-b" onclick="pdAnular('')">Cancelar</button></div></td></tr>`:''}`;}).join('')}</tbody></table>`:`<div class="pt-vacio">${S.listo?'Todavía no hay despachos.':'Consultando…'}</div>`}</div>`;
    return form+hist;
  }
  W.pdCampo=(k,v)=>{S.form[k]=v;};
  W.pdLinea=(clave,campo,v)=>{
    const x=S.form.lineas[clave]||(S.form.lineas[clave]={paletas:'',unidades:''});x[campo]=v;
    if(campo==='paletas'){
      const f=stockActual().lista.find(y=>y.clave===clave),u=unidadesPorPaleta(f);
      if(f&&u>0&&v!==''){x.unidades=String(Math.min(f.stockUnd,Math.round(num(v)*u)));const el=document.getElementById('pd-und-'+clave.replace(/[^a-z0-9]/gi,'_'));if(el)el.value=x.unidades;}
    }
  };
  W.pdRegistrar=async()=>{
    const c=CX();if(!c.puedeEscribir()||S.guardando)return;
    const st=stockActual(),form={destino:S.form.destino,referencia:S.form.referencia,lineas:Object.keys(S.form.lineas).map(k=>({clave:k,paletas:S.form.lineas[k].paletas,unidades:S.form.lineas[k].unidades}))};
    const err=validarDespacho(form,st.lista);if(err.length){S.msg={tipo:'error',texto:err.join(' ')};repintar();return;}
    S.guardando=true;S.msg=null;repintar();
    try{
      const doc=construirDespacho(form,st.lista,Date.now()),p=c.persona(),q=c.quien();
      await db.collection('almacenPtDespacho').doc(doc.opId).set({...doc,uid:q.uid,usuario:q.usuario,usuarioUsername:q.username,almacenero:p?{id:p.id,nombre:p.nombre}:null,guardadoEn:c.serverTs()});
      S.msg={tipo:'ok',texto:'Despacho registrado: '+doc.items.reduce((n,i)=>n+i.paletas,0)+' paletas para '+doc.destino+'.'};S.form={destino:'',referencia:'',lineas:{}};
    }catch(e){S.msg={tipo:'error',texto:'No se pudo guardar: '+(((e&&e.code)||'').includes('permission')?'falta aplicar glacial_61 o tu usuario no puede registrar despachos.':((e&&e.message)||e))};}
    S.guardando=false;repintar();
  };
  W.pdAnular=id=>{S.anular=id;S.motivo='';repintar();};
  W.pdMotivo=v=>{S.motivo=v;};
  W.pdAnularOk=async id=>{
    const c=CX();if(!c.puedeEscribir()||S.guardando)return;
    if(String(S.motivo).trim().length<5){S.msg={tipo:'error',texto:'Escribe el motivo de la anulación (mínimo 5 caracteres).'};repintar();return;}
    const d=vigentes(S.despachos).find(x=>x.opId===id);if(!d)return;
    S.guardando=true;repintar();
    try{const doc=docAnulacionDespacho(d,S.motivo),p=c.persona(),q=c.quien();
      await db.collection('almacenPtDespacho').doc(doc.opId).set({...doc,uid:q.uid,usuario:q.usuario,usuarioUsername:q.username,almacenero:p?{id:p.id,nombre:p.nombre}:null,guardadoEn:c.serverTs()});
      S.msg={tipo:'ok',texto:'Despacho anulado: esas paletas vuelven al stock.'};S.anular='';}
    catch(e){S.msg={tipo:'error',texto:'No se pudo anular: '+((e&&e.message)||e)};}
    S.guardando=false;repintar();
  };

  /* ---------- alertas ---------- */
  function htmlAlertas(c){
    const al=alertas(c.itemsTodos(),c.saldos(),Date.now());
    if(!al.length)return '';
    return `<div class="pt-msg ${al.some(a=>a.nivel==='roja')?'pt-msg-e':'pt-msg-i'}" role="alert"><b>Por atender:</b> ${al.map(a=>c.esc(a.texto)).join(' · ')}</div>`;
  }

  /* ---------- resumen del turno ---------- */
  function datosResumen(c,fecha,turno){
    const todos=c.itemsTodos(),en=x=>x.paleta.fecha===fecha&&c.turnoCoincide(x.paleta.turno,turno);
    return {fecha,turno,recibidas:todos.filter(x=>['RECIBIDA','DIFERENCIA','OBSERVADA'].includes(x.estado)&&en(x)),pendientes:todos.filter(x=>x.estado==='PENDIENTE'&&en(x)),
      saldos:c.saldos().filter(x=>x.paleta.fecha===fecha&&c.turnoCoincide(x.paleta.turno,turno)),despachos:S.despachos,stock:stock(c.acumulado(),S.despachos)};
  }
  W.pdResumen=(fecha,turno)=>{
    const c=CX(),f=fecha||c.hoy(),t=turno||(c.ES.turno==='NOCHE'?'NOCHE':'DIA');
    S.resumen={fecha:f,turno:t};repintarResumen();
  };
  function repintarResumen(){
    const c=CX(),r=S.resumen;let o=document.getElementById('pd-resumen');
    if(!r){if(o)o.remove();return;}
    const txt=resumenTurnoTexto(datosResumen(c,r.fecha,r.turno));
    if(!o){o=document.createElement('div');o.id='pd-resumen';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(7,30,48,.5);display:flex;align-items:center;justify-content:center;padding:14px';document.body.appendChild(o);}
    o.innerHTML=`<div style="background:#fff;border-radius:14px;padding:16px;max-width:620px;width:100%;max-height:92vh;overflow:auto;color:#033350"><h2 style="margin:0 0 8px">Resumen del turno</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 8px"><label style="display:grid;gap:3px;font-size:12px;font-weight:700">Fecha<input type="date" value="${c.esc(r.fecha)}" onchange="pdResumen(this.value,'${r.turno}')" style="min-height:44px;padding:6px 10px"></label>
      <label style="display:grid;gap:3px;font-size:12px;font-weight:700">Turno<select onchange="pdResumen('${c.esc(r.fecha)}',this.value)" style="min-height:44px;padding:6px 10px"><option value="DIA" ${r.turno==='DIA'?'selected':''}>Día</option><option value="NOCHE" ${r.turno==='NOCHE'?'selected':''}>Noche</option></select></label></div>
      <textarea id="pd-resumen-txt" readonly rows="18" style="width:100%;font:13px/1.4 ui-monospace,Menlo,monospace;padding:10px;border:1px solid #cddfec;border-radius:10px">${c.esc(txt)}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px"><button type="button" class="pt-b" onclick="pdResumenCerrar()">Cerrar</button><button type="button" class="pt-b" onclick="pdResumenCopiar()">Copiar</button><button type="button" class="pt-b pt-b-v" onclick="pdResumenWsp()">Enviar por WhatsApp</button></div></div>`;
  }
  W.pdResumenCerrar=()=>{S.resumen=null;repintarResumen();};
  W.pdResumenCopiar=async()=>{const t=(document.getElementById('pd-resumen-txt')||{}).value||'';try{await navigator.clipboard.writeText(t);}catch(_){const e=document.getElementById('pd-resumen-txt');if(e){e.select();try{document.execCommand('copy');}catch(__){/* se puede copiar a mano */}}}};
  W.pdResumenWsp=()=>{const t=(document.getElementById('pd-resumen-txt')||{}).value||'';window.open('https://wa.me/?text='+encodeURIComponent(t),'_blank','noopener');};

  W.glacialAlmacenPTDespachos={escuchar,detener,htmlStock,htmlDespachos,htmlAlertas,estado:S,nucleo:NUCLEO};
})(typeof window!=='undefined'?window:globalThis);
