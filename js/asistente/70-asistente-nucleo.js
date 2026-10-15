/* =============================================================
   GLACIAL · ASISTENTE DE PRODUCCIÓN — NÚCLEO DE CÁLCULO (puro, sin Firestore ni pantalla)
   -------------------------------------------------------------
   Diseño y diagnóstico: docs/ASISTENTE-PRODUCCION.md.
   · Cuadro = combinación programada (o producida) del bloque: fecha|bloque|línea|marca|presentación. Se une al cuadro del reporte
     diario por marca + presentación (como 35-autollenado-registro.js) para tomar lote, horas, paradas y producción efectiva.
   · Producido: cierre (cuadro.produccion.efectiva) si el reporte está FINALIZADO; si no, Paletas al corte. Nunca se suman.
   · Factores: SOLO del catálogo (apFactores) con vigencia; el más específico gana (marca+presentación > presentación > marca > línea).
     Sin factor → «Pendiente de configurar» (nunca un valor por defecto). consumo teórico = producido ÷ cantidadBase × factor
     (base UND) o paletas ÷ cantidadBase × factor (base PALETA).
   · Stock en Producción = último CONTEO + movimientos posteriores (libro inmutable). Material observado/dañado no es disponible.
   · Reservas DERIVADAS (requerimiento pendiente de cuadros abiertos), nunca guardadas → recalcular no duplica.
   · Conciliación: real = saldo inicial + entregado + transf. entrada − transf. salida − devuelto − saldo final;
     desviación = real − teórico; por revisar = desviación − merma validada (no se convierte en merma).
   · Nunca se suman unidades distintas (kg, UND, cajas…): todo se agrupa por material + unidad.
   ============================================================= */
(function instalarAsistenteNucleo(global){
  'use strict';

  const LINEAS=[
    {codigo:'PET1',nombre:'PET1',unidad:'UND',color:'0E7CC1'},
    {codigo:'PET2',nombre:'PET2',unidad:'UND',color:'1497A8'},
    {codigo:'B7L',nombre:'B7L',unidad:'UND',color:'1D7A4C'},
    {codigo:'C20L',nombre:'CAJAS 20L',unidad:'cajas',color:'B26A00'},
    {codigo:'B20L',nombre:'B20L',unidad:'UND',color:'6B4FA0'}
  ];
  const lineaInfo=c=>LINEAS.find(l=>l.codigo===c)||{codigo:c,nombre:String(c||''),unidad:'UND',color:'0E7CC1'};
  /* Acepta el código o cualquier nombre visible conocido («PET 1», «CAJAS 20L», «Cajas 20 L», «C20L»…). */
  function codigoLinea(v){
    const s=String(v||'').toUpperCase().replace(/\s+/g,'');
    if(/^CAJAS?20L$|^C20L$/.test(s))return 'C20L';
    const l=LINEAS.find(x=>x.codigo===s);return l?l.codigo:'';
  }

  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  /* Redondeo sin residuos de coma flotante (evita -0.00). */
  function red(v,dec){
    if(v===null||v===undefined||v==='')return null;
    const n=Number(v);if(!Number.isFinite(n))return null;
    const f=Math.pow(10,dec===undefined?4:dec);
    const r=Math.round((n+(n>=0?1:-1)*Number.EPSILON)*f)/f;
    return Object.is(r,-0)||Math.abs(r)<1/f/2?0:r;
  }
  const norm=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/(\d)\s*(litros?|lts?)(?![a-z])/g,'$1l').replace(/\s+/g,' ').trim();
  const bloqueDe=t=>String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DIA';
  const turnosDeBloque=b=>bloqueDe(b)==='NOCHE'?['NOCHE']:['DÍA','INTERMEDIO'];
  const claveCuadro=(fecha,bloque,linea,marca,presentacion)=>[fecha,bloqueDe(bloque),linea,norm(marca),norm(presentacion)].join('|');

  /* ---------- catálogo de insumos ---------- */
  const TIPOS_INSUMO=['preforma','tapa','carton','polietileno','stretch','etiqueta','asa','bolsa','otro'];
  const UNIDADES=['UND','kg','caja','plancha','rollo','millar','paquete'];
  function validarInsumo(i){
    const e=[];
    if(!/^[A-Z0-9_]{2,40}$/.test(String(i&&i.codigo||'')))e.push('Código: 2 a 40 caracteres en MAYÚSCULAS, números o «_».');
    if(!String(i&&i.nombre||'').trim())e.push('Indica el nombre del insumo.');
    if(!UNIDADES.includes(i&&i.unidad))e.push('Unidad no válida.');
    if(!TIPOS_INSUMO.includes(i&&i.tipo))e.push('Tipo no válido.');
    return e;
  }

  /* ---------- factores de consumo ---------- */
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  function validarFactor(f){
    const e=[];
    if(!f||!String(f.insumo||'').trim())e.push('Indica el insumo.');
    if(!f||!codigoLinea(f.linea))e.push('Línea no válida.');
    if(!f||!['UND','PALETA'].includes(f.base))e.push('La base debe ser UND o PALETA.');
    if(!f||!(Number(f.cantidadBase)>0))e.push('La cantidad base debe ser mayor que 0.');
    if(!f||!Number.isFinite(Number(f.factor))||Number(f.factor)<0)e.push('El factor debe ser un número ≥ 0.');
    if(!f||!fechaOk(f.vigenteDesde))e.push('Vigente desde: fecha AAAA-MM-DD.');
    if(f&&f.vigenteHasta&&(!fechaOk(f.vigenteHasta)||f.vigenteHasta<f.vigenteDesde))e.push('Vigente hasta debe ser posterior a Vigente desde.');
    return e;
  }
  const vigenteEn=(f,fecha)=>f&&f.activo!==false&&String(f.vigenteDesde||'')<=fecha&&(!f.vigenteHasta||fecha<=f.vigenteHasta);
  const especificidad=f=>(f.marca&&f.marca!=='*'?2:0)+(f.presentacion&&f.presentacion!=='*'?1:0)+(f.presentacion&&f.presentacion!=='*'&&f.marca&&f.marca!=='*'?1:0);
  /* Factor vigente para (insumo, línea, marca, presentación, fecha). → {factor} | {error:'SIN_FACTOR'|'AMBIGUO', candidatos} */
  function factorVigente(factores,q){
    const cand=(factores||[]).filter(f=>f&&f.insumo===q.insumo&&codigoLinea(f.linea)===codigoLinea(q.linea)&&vigenteEn(f,q.fecha)
      &&(!f.marca||f.marca==='*'||norm(f.marca)===norm(q.marca))
      &&(!f.presentacion||f.presentacion==='*'||norm(f.presentacion)===norm(q.presentacion)));
    if(!cand.length)return {error:'SIN_FACTOR'};
    const max=Math.max(...cand.map(especificidad));
    const top=cand.filter(f=>especificidad(f)===max);
    if(top.length>1){
      // Dos vigentes con la misma especificidad: gana la vigencia más reciente; si empatan, es ambiguo (se avisa, no se elige al azar).
      top.sort((a,b)=>String(b.vigenteDesde).localeCompare(String(a.vigenteDesde)));
      if(top[0].vigenteDesde===top[1].vigenteDesde)return {error:'AMBIGUO',candidatos:top};
    }
    return {factor:top[0]};
  }
  /* Consumo teórico de un insumo para lo producido. null si no hay base de cálculo (sin unidades por paleta). */
  function teorico(producido,unidadesPorPaleta,f){
    if(!f)return null;
    const base=Number(f.cantidadBase)||1,fac=Number(f.factor)||0;
    if(f.base==='PALETA'){
      if(!(Number(unidadesPorPaleta)>0))return null;
      return red(num(producido)/Number(unidadesPorPaleta)/base*fac,4);
    }
    return red(num(producido)/base*fac,4);
  }

  /* ---------- cuadros del bloque (desde Programación + reporte diario + Paletas) ---------- */
  /* entrada: {fecha, bloque, programaciones, records, produccionAlCorte(linea,fecha,turnos,marca,presentacion) → {valor,encontrada},
     unidadesPorPaleta(linea,marca,presentacion), lineas} */
  function cuadrosDelBloque(e){
    const b=bloqueDe(e.bloque),turnos=turnosDeBloque(b);
    const lineas=(e.lineas&&e.lineas.length?e.lineas:LINEAS.map(l=>l.codigo));
    const grupo=b==='NOCHE'?'NOCHE':'DIA_INTERMEDIO';
    const recs=(e.records||[]).filter(r=>r&&r.fecha===e.fecha&&(r.grupoTurno?r.grupoTurno===grupo:turnos.includes(String(r.turno||'').toUpperCase().replace('DIA','DÍA'))));
    const mapa=new Map();
    const agregar=(linea,marca,presentacion)=>{
      const k=claveCuadro(e.fecha,b,linea,marca,presentacion);
      if(!mapa.has(k))mapa.set(k,{clave:k,fecha:e.fecha,bloque:b,linea,marca:String(marca||''),presentacion:String(presentacion||''),
        programado:0,unidadesPorPaleta:0,programaciones:[],estado:'PENDIENTE',reporte:null});
      return mapa.get(k);
    };
    (e.programaciones||[]).forEach(p=>{
      if(!p||p.fecha!==e.fecha||!lineas.includes(p.linea))return;
      const t=String(p.turno||'').toUpperCase();
      if(!turnos.includes(t)&&!(b==='DIA'&&t==='DIA'))return;
      const c=agregar(p.linea,p.marca,p.presentacion);
      c.programado+=num(p.cantidadProgramada);
      c.unidadesPorPaleta=num(p.unidadesPorPaleta)||c.unidadesPorPaleta;
      c.programaciones.push(p.id);
      const est=p.estadoOperacion&&p.estadoOperacion.estado||'PENDIENTE';
      c.estado=PRIORIDAD_ESTADO.indexOf(est)<PRIORIDAD_ESTADO.indexOf(c.estado)?est:c.estado;
      if(p.modo==='COMPLETAR')c.completar=true;
    });
    // Cuadros del reporte diario (con marca): aportan lote, horas, efectiva y paradas; si no estaban programados, se agregan igual.
    recs.forEach(r=>{
      if(!lineas.includes(r.linea))return;
      (r.cuadros||[]).forEach((q,i)=>{
        if(!q||!String(q.marca||'').trim())return;
        const prod=num(q.produccion&&q.produccion.efectiva);
        const c=mapa.get(claveCuadro(e.fecha,b,r.linea,q.marca,q.presentacion));
        if(!c&&!(prod>0))return;
        const x=c||agregar(r.linea,q.marca,q.presentacion);
        x.reporte={recordId:r.id,indice:i,lote:q.lote||'',horaInicio:q.horaInicio||'',horaFin:q.horaFin||'',efectiva:prod,
          finalizado:String(r.estadoRegistro||'')==='FINALIZADO'||q.estadoCuadro==='FINALIZADO',
          paradasProgramadas:(q.paradasProgramadas||[]).map(p=>({descripcion:p.descripcion||'',minutos:num(p.tiempoMin),equipo:p.equipo||''})),
          paradasNoProgramadas:(q.paradasNoProgramadas||[]).map(p=>({descripcion:p.descripcion||'',minutos:num(p.tiempoMin),equipo:p.equipo||'',causa:p.causa||''})),
          supervisor:r.finalizadoPor||r.registradoPor||''};
      });
    });
    const lista=[...mapa.values()];
    lista.forEach(c=>{
      if(!c.unidadesPorPaleta&&typeof e.unidadesPorPaleta==='function'){try{c.unidadesPorPaleta=num(e.unidadesPorPaleta(c.linea,c.marca,c.presentacion));}catch(_){/* sin dato */}}
      if(c.reporte&&c.reporte.finalizado){c.producido=c.reporte.efectiva;c.fuenteProduccion='Cierre';}
      else{
        let r=null;try{r=typeof e.produccionAlCorte==='function'?e.produccionAlCorte(c.linea,c.fecha,turnos,c.marca,c.presentacion):null;}catch(_){r=null;}
        if(r&&r.encontrada){c.producido=num(r.valor);c.fuenteProduccion='Paletas';}
        else if(c.reporte&&c.reporte.efectiva>0){c.producido=c.reporte.efectiva;c.fuenteProduccion='Reporte';}
        else{c.producido=0;c.fuenteProduccion='Sin registro';}
      }
      c.saldo=Math.max(c.programado-c.producido,0);
      c.cumplimiento=c.programado>0?c.producido/c.programado:null;
      if(c.reporte&&c.reporte.finalizado&&c.estado!=='CANCELADA')c.estado='FINALIZADA';
    });
    // Código visible por línea (C01, C02…) en orden de inicio; sin hora, al final y por marca.
    lineas.forEach(l=>{
      lista.filter(c=>c.linea===l).sort((a,b2)=>String(a.reporte&&a.reporte.horaInicio||'99').localeCompare(String(b2.reporte&&b2.reporte.horaInicio||'99'))||a.marca.localeCompare(b2.marca))
        .forEach((c,i)=>{c.codigo='C'+String(i+1).padStart(2,'0');});
    });
    return lista.sort((a,b2)=>lineas.indexOf(a.linea)-lineas.indexOf(b2.linea)||a.codigo.localeCompare(b2.codigo));
  }
  const PRIORIDAD_ESTADO=['EN_PRODUCCION','PAUSA','DETENIDA','LISTA','PENDIENTE','FINALIZADA','CANCELADA'];
  const cuadroAbierto=c=>!['FINALIZADA','CANCELADA'].includes(c.estado);

  /* ---------- stock en Producción (libro de movimientos) ---------- */
  const TIPOS_MOV=['CONTEO','RECEPCION','DEVOLUCION','TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA','CONSUMO','ANULACION'];
  const SIGNO={RECEPCION:1,TRANSFERENCIA_ENTRADA:1,DEVOLUCION:-1,TRANSFERENCIA_SALIDA:-1,CONSUMO:-1};
  /* Saldo por insumo (y condición). Ignora movimientos anulados. → {utilizable, observado, conteo:{cantidad,en,usuario}|null, movimientos} */
  function saldoInsumo(movs,insumo,hastaMs){
    const anulados=new Set((movs||[]).filter(m=>m&&m.tipo==='ANULACION'&&m.anulaA).map(m=>m.anulaA));
    const lista=(movs||[]).filter(m=>m&&m.insumo===insumo&&m.tipo!=='ANULACION'&&!anulados.has(m.opId)&&(!hastaMs||num(m.en)<=hastaMs))
      .sort((a,b)=>num(a.en)-num(b.en)||String(a.opId).localeCompare(String(b.opId)));
    const res={utilizable:0,observado:0,conteo:null,movimientos:0};
    let desde=0;
    // El último conteo de cada condición fija el saldo; después se suman los movimientos posteriores.
    ['UTILIZABLE','OBSERVADO'].forEach(cond=>{
      const conteos=lista.filter(m=>m.tipo==='CONTEO'&&(m.condicion||'UTILIZABLE')===cond);
      const ult=conteos[conteos.length-1];
      let s=ult?num(ult.cantidad):0;const corte=ult?num(ult.en):-Infinity;
      if(cond==='UTILIZABLE'&&ult){res.conteo={cantidad:num(ult.cantidad),en:num(ult.en),usuario:ult.usuario||''};desde=corte;}
      lista.forEach(m=>{
        if(m.tipo==='CONTEO'||num(m.en)<corte||(num(m.en)===corte&&m===ult))return;
        if((m.condicion||'UTILIZABLE')!==cond)return;
        s+=(SIGNO[m.tipo]||0)*num(m.cantidad);
      });
      res[cond==='UTILIZABLE'?'utilizable':'observado']=red(s,4);
    });
    res.movimientos=lista.filter(m=>num(m.en)>=desde).length;
    return res;
  }

  /* ---------- requerimientos, reservas y faltantes ---------- */
  /* cuadros: de cuadrosDelBloque. Para cada cuadro e insumo con factor: requerido = teórico(programado); consumido = movimientos
     CONSUMO del cuadro; pendiente = máx(requerido − consumido, 0). Reserva de otros = pendientes de OTROS cuadros abiertos.
     Disponible para el cuadro = utilizable − reservado por otros. Faltante = máx(pendiente − disponible, 0).
     Un cuadro en modo «completar» sin cierre previo queda «Pendiente del cierre» (no cero). */
  function requerimientos(e){
    const filas=[];
    const insumos=(e.insumos||[]).filter(i=>i.activo!==false);
    const consumoMov=(clave,insumo)=>(e.movimientos||[]).filter(m=>m.tipo==='CONSUMO'&&m.cuadro===clave&&m.insumo===insumo&&!anulado(e.movimientos,m)).reduce((s,m)=>s+num(m.cantidad),0);
    (e.cuadros||[]).forEach(c=>{
      insumos.forEach(i=>{
        const fv=factorVigente(e.factores,{insumo:i.codigo,linea:c.linea,marca:c.marca,presentacion:c.presentacion,fecha:c.fecha});
        if(fv.error){
          if(aplicaInsumo(e.factores,i.codigo,c.linea))filas.push({cuadro:c,insumo:i,estado:fv.error==='AMBIGUO'?'FACTOR_AMBIGUO':'SIN_FACTOR'});
          return;
        }
        if(Number(fv.factor.factor)===0)return;            // «No aplica» explícito (por ejemplo, B20L sin polietileno)
        const pendCierre=c.completar&&!(c.programado>0);
        const req=pendCierre?null:teorico(c.programado,c.unidadesPorPaleta,fv.factor);
        const consumido=red(consumoMov(c.clave,i.codigo),4);
        filas.push({cuadro:c,insumo:i,factor:fv.factor,estado:pendCierre?'PENDIENTE_CIERRE':req===null?'SIN_BASE':'OK',
          requerido:req,consumido,pendiente:req===null?null:red(Math.max(req-consumido,0),4)});
      });
    });
    // Reservas: pendiente de los cuadros abiertos; cada cuadro ve lo reservado por los demás.
    const porInsumo=new Map();
    filas.forEach(f=>{if(f.estado==='OK'&&cuadroAbierto(f.cuadro)){porInsumo.set(f.insumo.codigo,(porInsumo.get(f.insumo.codigo)||0)+f.pendiente);}});
    filas.forEach(f=>{
      const s=saldoInsumo(e.movimientos,f.insumo.codigo);
      f.utilizable=s.utilizable;f.observado=s.observado;f.conteo=s.conteo;
      if(f.estado!=='OK')return;
      const propio=cuadroAbierto(f.cuadro)?f.pendiente:0;
      f.reservadoOtros=red((porInsumo.get(f.insumo.codigo)||0)-propio,4);
      f.disponible=red(Math.max(s.utilizable-f.reservadoOtros,0),4);
      f.faltante=cuadroAbierto(f.cuadro)?red(Math.max(f.pendiente-f.disponible,0),4):0;
    });
    return filas;
  }
  const anulado=(movs,m)=>(movs||[]).some(x=>x&&x.tipo==='ANULACION'&&x.anulaA===m.opId);
  const aplicaInsumo=(factores,insumo,linea)=>(factores||[]).some(f=>f&&f.insumo===insumo&&codigoLinea(f.linea)===codigoLinea(linea));
  /* Resumen por insumo (sin mezclar unidades): requerido, consumido, disponible, reservado y faltante del bloque. */
  function resumenInsumos(filas){
    const m=new Map();
    filas.forEach(f=>{
      const k=f.insumo.codigo;
      if(!m.has(k))m.set(k,{insumo:f.insumo,requerido:0,pendiente:0,faltante:0,utilizable:f.utilizable,observado:f.observado,conteo:f.conteo,sinFactor:0,pendienteCierre:0});
      const x=m.get(k);
      if(f.estado==='OK'){x.requerido+=f.requerido;x.pendiente+=cuadroAbierto(f.cuadro)?f.pendiente:0;}
      else if(f.estado==='PENDIENTE_CIERRE')x.pendienteCierre++;
      else x.sinFactor++;
    });
    return [...m.values()].map(x=>({...x,requerido:red(x.requerido,4),pendiente:red(x.pendiente,4),faltante:red(Math.max(x.pendiente-x.utilizable,0),4)}));
  }

  /* ---------- conciliación por cuadro e insumo ---------- */
  /* d: {saldoInicial, saldoFinal, entregado, devuelto, transfEntrada, transfSalida, teorico, mermaValidada}. Faltantes → PENDIENTE. */
  function conciliar(d){
    const falta=[];
    if(d.saldoInicial===null||d.saldoInicial===undefined||d.saldoInicial==='')falta.push('saldo inicial');
    if(d.saldoFinal===null||d.saldoFinal===undefined||d.saldoFinal==='')falta.push('saldo final');
    if(d.teorico===null||d.teorico===undefined)falta.push('factor');
    const real=(d.saldoInicial===null||d.saldoInicial===undefined||d.saldoInicial===''||d.saldoFinal===null||d.saldoFinal===undefined||d.saldoFinal==='')?null
      :red(num(d.saldoInicial)+num(d.entregado)+num(d.transfEntrada)-num(d.transfSalida)-num(d.devuelto)-num(d.saldoFinal),4);
    const desv=real===null||d.teorico===null||d.teorico===undefined?null:red(real-num(d.teorico),4);
    const desvPct=desv===null||!(num(d.teorico)>0)?null:red(desv/num(d.teorico),4);
    const porRevisar=desv===null?null:red(desv-num(d.mermaValidada),4);
    return {real,desviacion:desv,desviacionPct:desvPct,porRevisar,pendiente:falta.length>0,falta,
      texto:falta.length?'Pendiente de conciliación ('+falta.join(', ')+')':''};
  }
  /* Totales de movimientos de un cuadro e insumo para la conciliación (sin anulados). */
  function movimientosCuadro(movs,clave,insumo){
    const t={entregado:0,devuelto:0,transfEntrada:0,transfSalida:0};
    (movs||[]).forEach(m=>{
      if(!m||m.cuadro!==clave||m.insumo!==insumo||anulado(movs,m))return;
      if(m.tipo==='RECEPCION')t.entregado+=num(m.cantidad);
      else if(m.tipo==='DEVOLUCION')t.devuelto+=num(m.cantidad);
      else if(m.tipo==='TRANSFERENCIA_ENTRADA')t.transfEntrada+=num(m.cantidad);
      else if(m.tipo==='TRANSFERENCIA_SALIDA')t.transfSalida+=num(m.cantidad);
    });
    Object.keys(t).forEach(k=>{t[k]=red(t[k],4);});
    return t;
  }

  /* ---------- mermas ---------- */
  const CAUSAS_MERMA=['Arranque de línea','Cambio de formato','Calibración','Falla de máquina','Defecto de material','Problema de calidad','Manipulación','Otros'];
  const ETAPAS_MERMA=['Soplado','Llenado','Tapado','Etiquetado','Empaque','Paletizado','Almacenamiento','Otra'];
  function validarMerma(m){
    const e=[];
    if(!m||!codigoLinea(m.linea))e.push('Línea no válida.');
    if(!m||!String(m.cuadro||'').trim())e.push('Indica el cuadro (marca y presentación) al que pertenece.');
    if(!m||!['MATERIAL','PRODUCTO'].includes(m.categoria))e.push('Indica si es materia prima/empaque o producto terminado.');
    if(!m||!String(m.insumo||'').trim())e.push('Indica el material o producto.');
    if(!m||!(Number(m.cantidad)>0))e.push('La cantidad debe ser mayor que 0.');
    if(!m||!String(m.unidad||'').trim())e.push('Indica la unidad.');
    if(!m||!CAUSAS_MERMA.includes(m.causa))e.push('Elige la causa.');
    if(m&&m.causa==='Otros'&&String(m.observaciones||'').trim().length<5)e.push('Con causa «Otros» describe la merma (mínimo 5 caracteres).');
    return e;
  }
  /* Merma validada de un cuadro y material (misma unidad). Las pendientes y rechazadas no cuentan. */
  const mermaValidada=(mermas,clave,insumo,unidad)=>red((mermas||[]).filter(m=>m&&m.cuadro===clave&&m.insumo===insumo&&m.unidad===unidad&&m.estado==='VALIDADA'&&m.categoria!=='PRODUCTO').reduce((s,m)=>s+num(m.cantidad),0),4);
  /* Por material + unidad (nunca se suman kg con UND). */
  function resumenMermas(mermas){
    const m=new Map();
    (mermas||[]).forEach(x=>{
      if(!x||x.estado==='RECHAZADA')return;
      const k=(x.categoria||'MATERIAL')+'|'+x.insumo+'|'+x.unidad;
      if(!m.has(k))m.set(k,{categoria:x.categoria||'MATERIAL',insumo:x.insumo,unidad:x.unidad,validada:0,pendiente:0,eventosValidados:0,eventosPendientes:0});
      const r=m.get(k);
      if(x.estado==='VALIDADA'){r.validada+=num(x.cantidad);r.eventosValidados++;}else{r.pendiente+=num(x.cantidad);r.eventosPendientes++;}
    });
    return [...m.values()].map(r=>({...r,validada:red(r.validada,4),pendiente:red(r.pendiente,4),total:red(r.validada+r.pendiente,4)}));
  }

  /* ---------- solicitudes a Almacén ---------- */
  const ESTADOS_SOLICITUD=['BORRADOR','SOLICITADA','EN_PREPARACION','ENTREGADA_PARCIAL','ENTREGADA','RECIBIDA','OBSERVADA','CANCELADA','CERRADA'];
  const TRANSICIONES={
    BORRADOR:['SOLICITADA','CANCELADA'],
    SOLICITADA:['EN_PREPARACION','CANCELADA'],
    EN_PREPARACION:['ENTREGADA_PARCIAL','ENTREGADA','CANCELADA'],
    ENTREGADA_PARCIAL:['ENTREGADA_PARCIAL','ENTREGADA','RECIBIDA','OBSERVADA'],
    ENTREGADA:['RECIBIDA','OBSERVADA'],
    RECIBIDA:['CERRADA','OBSERVADA'],
    OBSERVADA:['RECIBIDA','CERRADA','CANCELADA'],
    CANCELADA:[],CERRADA:[]
  };
  /* Quién mueve cada estado: Producción (asistente) pide, recibe, observa y cierra; Almacén prepara y entrega. */
  const ACTOR_ESTADO={SOLICITADA:'asistente',CANCELADA:'asistente',EN_PREPARACION:'almacen',ENTREGADA_PARCIAL:'almacen',ENTREGADA:'almacen',RECIBIDA:'asistente',OBSERVADA:'asistente',CERRADA:'asistente'};
  function puedeTransicion(de,a){return (TRANSICIONES[de]||[]).includes(a);}
  /* Entregar: cantidades por ítem (acumulan). Nunca más de lo solicitado salvo autorización. Devuelve el nuevo estado. */
  function aplicarEntrega(sol,entregas,opc){
    const items=(sol.items||[]).map(i=>({...i}));
    const errores=[];
    items.forEach(i=>{
      const q=num(entregas&&entregas[i.insumo]);
      if(q<0)errores.push(i.insumo+': la entrega no puede ser negativa.');
      const nuevo=red(num(i.entregado)+q,4);
      if(nuevo>num(i.solicitado)&&!(opc&&opc.permitirExceso))errores.push(i.insumo+': se entregaría más de lo solicitado.');
      i.entregado=nuevo;
    });
    if(errores.length)return {errores};
    const completo=items.every(i=>num(i.entregado)>=num(i.solicitado));
    const algo=items.some(i=>num(i.entregado)>0);
    return {items,estado:completo?'ENTREGADA':(algo?'ENTREGADA_PARCIAL':sol.estado)};
  }
  /* Recibir: Producción confirma lo realmente recibido (≤ entregado − ya recibido). Cada recepción genera un movimiento RECEPCION. */
  function aplicarRecepcion(sol,recibidos){
    const items=(sol.items||[]).map(i=>({...i}));const errores=[],movs=[];
    items.forEach(i=>{
      const q=num(recibidos&&recibidos[i.insumo]);
      if(!q)return;
      if(q<0){errores.push(i.insumo+': cantidad no válida.');return;}
      if(red(num(i.recibido)+q,4)>num(i.entregado)){errores.push(i.insumo+': se recibiría más de lo entregado por Almacén.');return;}
      i.recibido=red(num(i.recibido)+q,4);movs.push({insumo:i.insumo,unidad:i.unidad,cantidad:q});
    });
    if(errores.length)return {errores};
    const todo=items.every(i=>num(i.recibido)>=num(i.entregado));
    return {items,movimientos:movs,estado:todo&&['ENTREGADA','OBSERVADA'].includes(sol.estado)?'RECIBIDA':sol.estado};
  }

  /* ---------- alertas del resumen ---------- */
  function alertas(e){
    const a=[];
    (e.requerimientos||[]).forEach(f=>{
      const n=lineaInfo(f.cuadro.linea).nombre+' · '+f.cuadro.marca+' '+f.cuadro.presentacion;
      if(f.estado==='SIN_FACTOR')a.push({nivel:'atencion',tipo:'FACTOR',texto:n+': falta el factor de '+f.insumo.nombre+'. El cálculo de ese insumo está bloqueado.'});
      if(f.estado==='FACTOR_AMBIGUO')a.push({nivel:'critico',tipo:'FACTOR',texto:n+': hay dos factores vigentes iguales para '+f.insumo.nombre+'. Corrige el catálogo.'});
      if(f.estado==='OK'&&f.faltante>0)a.push({nivel:'critico',tipo:'DESABASTECIMIENTO',texto:n+': faltan '+fmt(f.faltante)+' '+f.insumo.unidad+' de '+f.insumo.nombre+'.'});
    });
    (e.conciliaciones||[]).forEach(c=>{if(c.porRevisar!==null&&c.porRevisar!==undefined&&Math.abs(c.porRevisar)>0.0001)a.push({nivel:'atencion',tipo:'POR_REVISAR',texto:c.etiqueta+': '+fmt(c.porRevisar)+' '+c.unidad+' por revisar (desviación no explicada por merma validada).'});});
    const pend=(e.mermas||[]).filter(m=>m.estado==='PENDIENTE').length;
    if(pend)a.push({nivel:'info',tipo:'MERMA',texto:pend+' merma'+(pend===1?'':'s')+' pendiente'+(pend===1?'':'s')+' de validar.'});
    const sol=(e.solicitudes||[]).filter(s=>!['CERRADA','CANCELADA','RECIBIDA'].includes(s.estado)).length;
    if(sol)a.push({nivel:'info',tipo:'SOLICITUD',texto:sol+' solicitud'+(sol===1?'':'es')+' a Almacén sin cerrar.'});
    return a;
  }
  /* El turno cierra con movimientos pendientes: solicitudes abiertas, mermas pendientes o ítems por revisar. */
  function pendientesDeCierre(e){
    return {
      solicitudes:(e.solicitudes||[]).filter(s=>!['CERRADA','CANCELADA'].includes(s.estado)).length,
      mermas:(e.mermas||[]).filter(m=>m.estado==='PENDIENTE').length,
      porRevisar:(e.conciliaciones||[]).filter(c=>c.porRevisar!==null&&c.porRevisar!==undefined&&Math.abs(c.porRevisar)>0.0001).length,
      sinConciliar:(e.conciliaciones||[]).filter(c=>c.pendiente).length
    };
  }
  const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString('es-PE',{maximumFractionDigits:2});

  /* ---------- migración de los factores fijos del código (05-utils.js) ---------- */
  /* Lee las constantes del Nuevo registro y las convierte en factores versión 1 (origen 'codigo'). Ids deterministas: repetir la
     migración no duplica ni pisa factores ya editados. c: {CAJAS_PREFORMAS_DIVISOR, FACTOR_CARTON_PET, …, PRESENTACIONES_POR_LINEA}. */
  const INSUMOS_BASE=[
    {codigo:'CAJA_PREFORMA',nombre:'Cajas de preformas',unidad:'caja',tipo:'preforma'},
    {codigo:'CARTON',nombre:'Planchas de cartón',unidad:'plancha',tipo:'carton'},
    {codigo:'POLIETILENO',nombre:'Polietileno',unidad:'kg',tipo:'polietileno'},
    {codigo:'STRETCH',nombre:'Stretch film',unidad:'kg',tipo:'stretch'},
    {codigo:'TAPA',nombre:'Tapas',unidad:'UND',tipo:'tapa'},
    {codigo:'ETIQUETA',nombre:'Etiquetas',unidad:'UND',tipo:'etiqueta'}
  ];
  function idFactor(f){
    const s=v=>norm(v||'*').replace(/[^a-z0-9.]+/g,'-').replace(/^-|-$/g,'')||'x';
    return [f.linea,f.insumo,s(f.marca),s(f.presentacion),String(f.vigenteDesde||'').replace(/-/g,'')].join('_').slice(0,700);
  }
  function factoresDesdeCodigo(c,vigenteDesde){
    const out=[];const desde=vigenteDesde||'2020-01-01';
    const add=(linea,insumo,marca,presentacion,base,cantidadBase,factor,nota)=>{
      const f={insumo,linea,marca:marca||'*',presentacion:presentacion||'*',base,cantidadBase,factor,vigenteDesde:desde,vigenteHasta:null,activo:true,origen:'codigo',nota:nota||''};
      f.id=idFactor(f);out.push(f);
    };
    const presDe=l=>(c.PRESENTACIONES_POR_LINEA&&c.PRESENTACIONES_POR_LINEA[l])||[];
    /* Las tablas del código usan la presentación en minúsculas; varias presentaciones VIGENTES («Regular») solo figuran allí con su
       nombre anterior «Alcalina» (01-config.js: «los formatos equivalentes quedan centralizados bajo REGULAR»; normalizarPresentacionRegular).
       Se migran: (1) todas las claves tal cual (datos históricos) y (2) cada presentación vigente con su valor propio o, si no lo tiene,
       con el de su equivalente «Alcalina», anotando de dónde sale. */
    const tablas=[['CAJA_PREFORMA',c.CAJAS_PREFORMAS_DIVISOR,'UND'],['CARTON',c.FACTOR_CARTON_PET,'PALETA'],['POLIETILENO',c.FACTOR_POLIETILENO_PET,'PALETA'],['STRETCH',c.FACTOR_STRETCHFILM_PET,'PALETA']];
    const equivalente=(tabla,k)=>{
      if(tabla[k]!==undefined)return {clave:k,valor:tabla[k]};
      const alc=[k.replace('_regular_','_alcalina_'),k.replace('_regular_','_alcalina(y)_')].find(x=>tabla[x]!==undefined);
      return alc?{clave:alc,valor:tabla[alc],equivalente:true}:null;
    };
    ['PET1','PET2'].forEach(l=>{
      const claves=new Set();
      tablas.forEach(([,t])=>Object.keys(t||{}).forEach(k=>claves.add(k)));
      const vigentes=presDe(l).map(p=>String(p));
      [...claves].map(k=>({k,p:k})).concat(vigentes.map(p=>({k:p.toLowerCase(),p}))).forEach(({k,p})=>{
        tablas.forEach(([insumo,t,base])=>{
          const v=t&&equivalente(t,k);if(!v)return;
          const nota=(insumo==='CAJA_PREFORMA'?'producción ÷ '+v.valor:'')+(v.equivalente?(insumo==='CAJA_PREFORMA'?' · ':'')+'equivalente de «'+v.clave+'» (código)':'');
          if(insumo==='CAJA_PREFORMA')add(l,insumo,'*',p,base,v.valor,1,nota);
          else add(l,insumo,'*',p,base,1,v.valor,nota);
        });
      });
    });
    add('B7L','CAJA_PREFORMA','*','*','UND',2900,1,'producción ÷ 2900');
    add('B7L','CARTON','*','*','PALETA',1,num(c.CARTON_FIJO_B7L));
    add('B7L','POLIETILENO','*','*','PALETA',1,0,'No aplica (marcas sin polietileno)');
    (c.MARCAS_POLIETILENO_B7L_SI||[]).forEach(m=>add('B7L','POLIETILENO',m,'*','PALETA',1,num(c.POLIETILENO_B7L_FACTOR)));
    add('B7L','STRETCH','*','*','PALETA',1,num(c.STRETCHFILM_B7L_FACTOR));
    add('C20L','CAJA_PREFORMA','*','*','UND',1,0,'No aplica');
    add('C20L','CARTON','*','*','PALETA',1,num(c.CARTON_C20L_DEFAULT));
    add('C20L','CARTON','San Fernando','*','PALETA',1,num(c.CARTON_C20L_SAN_FERNANDO));
    add('C20L','POLIETILENO','*','*','PALETA',1,num(c.POLIETILENO_C20L_FACTOR));
    add('C20L','STRETCH','*','*','PALETA',1,num(c.STRETCHFILM_C20L_FACTOR));
    add('B20L','CAJA_PREFORMA','*','*','UND',1,0,'No aplica');
    add('B20L','CARTON','*','*','PALETA',1,num(c.CARTON_FIJO_B20L));
    add('B20L','POLIETILENO','*','*','PALETA',1,0,'No aplica');
    add('B20L','STRETCH','*','*','PALETA',1,num(c.STRETCHFILM_B20L_FACTOR));
    // Un id repetido (dos presentaciones que normalizan igual) se deja una sola vez.
    const vistos=new Set();return out.filter(f=>vistos.has(f.id)?false:(vistos.add(f.id),true));
  }

  global.glacialAsistenteNucleo={
    LINEAS,lineaInfo,codigoLinea,red,norm,bloqueDe,turnosDeBloque,claveCuadro,
    TIPOS_INSUMO,UNIDADES,validarInsumo,validarFactor,vigenteEn,factorVigente,teorico,idFactor,
    cuadrosDelBloque,cuadroAbierto,TIPOS_MOV,saldoInsumo,requerimientos,resumenInsumos,
    conciliar,movimientosCuadro,CAUSAS_MERMA,ETAPAS_MERMA,validarMerma,mermaValidada,resumenMermas,
    ESTADOS_SOLICITUD,TRANSICIONES,ACTOR_ESTADO,puedeTransicion,aplicarEntrega,aplicarRecepcion,
    alertas,pendientesDeCierre,INSUMOS_BASE,factoresDesdeCodigo,fmt
  };
})(typeof window!=='undefined'?window:globalThis);
