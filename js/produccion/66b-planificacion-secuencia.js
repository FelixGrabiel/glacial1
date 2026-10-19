/* =============================================================
   PLANIFICACIÓN · SECUENCIA POR CANTIDAD, HORA Y CIERRE, CON CAMBIO DE MARCA CONFIGURABLE

   La secuencia YA existía: cada programación puede llevar tramosSecuencia = [{id, orden, tipoFin:'CANTIDAD'|'HORA'|'CIERRE', cantidadObjetivo, horaFin}] (los define Paletas y
   los lee Producción Actual). Aquí se AMPLÍA, sin crear otra secuencia desconectada:
     · Planificación edita la secuencia de una línea y un bloque («Secuencia de la línea»): producto · terminar por · cantidad u hora · cambio previsto · orden (▲▼, apto para celular).
     · Marcas SIN cantidad fija: «Hasta una hora» (modo HORA) y «Hasta el cierre / tiempo restante» (modo TURNO). Son instrucciones temporales válidas que generan una cantidad
       ESTIMADA (nominal × tiempo productivo), no filas incompletas ni cantidades cero. Sin velocidad o con un cambio sin tiempo → estimación PENDIENTE (se guarda la instrucción).
     · tramo.cambioPrevioMin = ajuste explícito del cambio ANTES de ese tramo. Prioridad del cambio: ajuste del plan → regla específica → valor general de la línea → 5 min iniciales
       (visible como «valor inicial»; una regla, incluso con 0 explícito, lo reemplaza). El valor del catálogo no recalcula planes publicados: lo guardado conserva su parámetro.
     · Motor único (65b: M.estimarSecuencia / M.secuencia): inicio según el tramo anterior, transición UNA vez, ventanas (unión), fin por cantidad/hora/cierre, cantidad estimada.
     · Dos lecturas separadas: PLAN PUBLICADO (estimado con sus parámetros y versión) y PROYECCIÓN ACTUAL (con inicios/finales REALES confirmados en Producción Actual y el cambio previsto
       para lo que aún no empieza). La proyección nunca cambia la instrucción publicada ni crea paradas oficiales ni cambia de marca por sí sola.
   Nada de esto crea paradas oficiales ni toca el ratio real. Cargar después de 66p-planificacion-modos.js.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion;
  if(!NS||!NS.motor||!NS.modos)return;
  const {num,norm,esc,fechaOk,ahoraMs}=NS.util;
  const MO=NS.motor,MD=NS.modos;
  const S=NS.secuencia={};
  const bl=b=>NS.valorBloque(b);
  const claveP=(m,p)=>norm(m)+'|'+norm(p);
  const fmt=n=>num(n).toLocaleString('es-PE');
  const hm=m=>typeof NS.textoDuracion==='function'?NS.textoDuracion(m):Math.round(m)+' min';
  const quien=()=>(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||'';
  S.TERMINA={CANTIDAD:'Cantidad',HORA:'Hasta una hora',CIERRE:'Hasta el cierre'};
  const idNuevo=()=>'tr_'+ahoraMs().toString(36)+Math.random().toString(36).slice(2,6);

  /* ---------- filas editables de una línea y bloque ---------- */
  S.filasDe=function(linea,fecha,turno){
    const items=NS.items(fecha,turno).filter(p=>p.linea===linea&&NS.estadoDe(p)!=='CANCELADA');
    const filas=[];let pos=0;
    items.forEach(p=>{
      const modo=MD.modoDe(p),tr=Array.isArray(p.tramosSecuencia)?p.tramosSecuencia:[];
      const mk=(t,ordenBase)=>({id:t&&t.id?t.id:idNuevo(),itemClave:p.clave,marca:p.marca,presentacion:p.presentacion,modo,version:num(p.version),estadoOp:NS.estadoDe(p),
        tipoFin:t&&t.tipoFin?t.tipoFin:(modo==='HORA'?'HORA':modo==='TURNO'?'CIERRE':'CANTIDAD'),
        cantidad:t&&num(t.cantidadObjetivo)>0?num(t.cantidadObjetivo):(modo==='FIJA'||modo==='COMPLETAR'?num(p.cantidadProgramada):''),
        hora:t&&t.horaFin?t.horaFin:'',cambioPrevioMin:t&&t.cambioPrevioMin!==undefined&&t.cambioPrevioMin!==null?t.cambioPrevioMin:null,
        saldo:modo==='COMPLETAR',orden:ordenBase,upp:num(p.unidadesPorPaleta)});
      if(tr.length)tr.forEach(t=>filas.push(mk(t,num(t.orden)||(++pos))));else filas.push(mk(null,9000+(++pos)));
    });
    filas.sort((a,b)=>a.orden-b.orden);
    return filas;
  };
  S.tieneSecuenciaPropia=(linea,fecha,turno)=>S.filasDe(linea,fecha,turno).some(f=>f.tipoFin!=='CANTIDAD')||S.filasDe(linea,fecha,turno).length>1;

  /* ---------- estimación (con el motor único) ---------- */
  const reales=(linea,fecha,turno,b)=>{
    const sal={};
    NS.items(fecha,turno).filter(p=>p.linea===linea).forEach(p=>{
      const op=p.estadoOperacion||{},ini=num(op.inicio),fin=num(op.finalizadaEn);
      const off=ms=>(ms-b.inicioMs)/60000;
      const r={};
      if(ini>0&&['EN_PRODUCCION','PAUSA','DETENIDA','LISTA','FINALIZADA'].includes(op.estado))r.inicioOff=off(ini);
      if(op.estado==='FINALIZADA'&&fin>0)r.finOff=off(fin);
      if(r.inicioOff!==undefined||r.finOff!==undefined)sal[claveP(p.marca,p.presentacion)]=r;
    });
    return sal;
  };
  /* filas → resultado del motor. opc.proyeccion = true: usa la ejecución real y la hora actual. Los planes «Completar cantidad» con saldo por calcular dejan pendientes
     sus tramos y los siguientes (no se usa duración cero para adelantar otras marcas). */
  S.estimar=function(linea,fecha,turno,filas,opc){
    opc=opc||{};
    const bloque=bl(turno),b=NS.bloqueDe(fecha,bloque,linea);
    const idxPend=filas.findIndex(f=>f.saldo&&!(num(f.cantidad)>0));
    const usar=(idxPend<0?filas:filas.slice(0,idxPend)).map((f,i)=>({orden:i+1,marca:f.marca,presentacion:f.presentacion,tipoFin:f.tipoFin,cantidadObjetivo:f.tipoFin==='CANTIDAD'?num(f.cantidad):undefined,horaFin:f.hora,cambioPrevioMin:f.cambioPrevioMin}));
    const ahora=ahoraMs();
    const e={fecha,bloqueClave:bloque,bloque:b,linea,tramos:usar,tp:NS.tiemposDatos(),
      vel:(m,p)=>typeof NS.velocidadDe==='function'?NS.velocidadDe(linea,p,m):0,etiqueta:(m,p)=>NS.etiquetaPresentacion(linea,m,p)};
    if(opc.proyeccion){e.reales=reales(linea,fecha,turno,b);if(ahora>=b.inicioMs&&ahora<b.inicioMs+b.duracionMin*60000)e.ahoraOff=(ahora-b.inicioMs)/60000;}
    const r=usar.length?MO.estimarSecuencia(e):{tramos:[],conflictos:[],faltantes:[],avisos:[],transiciones:[],estado:'SIN_TRAMOS'};
    if(idxPend>=0){
      for(let i=idxPend;i<filas.length;i++){
        const f=filas[i];
        r.tramos.push({orden:i+1,marca:f.marca,presentacion:f.presentacion,etiqueta:NS.etiquetaPresentacion(linea,f.marca,f.presentacion),tipoFin:f.tipoFin,horaFin:f.hora,temporal:f.tipoFin!=='CANTIDAD',inicioOff:null,finOff:null,cantidad:null,tiempoMin:null,
          estado:'PENDIENTE',motivo:i===idxPend?'saldo por calcular (Completar cantidad pendiente de cierre): su duración queda pendiente':'depende de un tramo anterior con saldo por calcular',cambioAntesMin:null});
      }
      if(r.estado==='OK'||r.estado==='SIN_TRAMOS')r.estado='PARCIAL';
    }
    r.bloque=b;r.calculadoEn=ahora;
    return r;
  };
  S.hora=(b,off)=>off===null||off===undefined?'—':MO.hhmm(b.inicioMs+off*60000);

  /* ---------- validación de las filas (cliente; se repite dentro del guardado) ---------- */
  S.validar=function(linea,fecha,turno,filas){
    const errores=[];
    if(!filas.length)errores.push('Agrega al menos un producto a la secuencia.');
    filas.forEach((f,i)=>{
      const n='Tramo '+(i+1)+(f.marca?' ('+f.marca+')':'');
      if(!f.marca||!f.presentacion)errores.push(n+': elige marca y presentación.');
      else{
        if(!NS.marcas(linea).includes(f.marca))errores.push(n+': la marca «'+f.marca+'» no existe en '+NS.nombreLinea(linea)+'.');
        if(!NS.presentacionesBrutas(linea).includes(f.presentacion))errores.push(n+': la presentación no es válida para '+NS.nombreLinea(linea)+'.');
      }
      if(!S.TERMINA[f.tipoFin])errores.push(n+': elige cómo termina (cantidad, hora o cierre).');
      if(f.tipoFin==='CANTIDAD'&&!f.saldo&&(!Number.isInteger(Number(f.cantidad))||Number(f.cantidad)<=0))errores.push(n+': la cantidad debe ser un entero mayor que cero.');
      if(f.tipoFin==='HORA'&&!/^\d{2}:\d{2}$/.test(String(f.hora||'')))errores.push(n+': elige la hora límite.');
      if(f.cambioPrevioMin!==null&&f.cambioPrevioMin!==undefined&&f.cambioPrevioMin!==''&&(!Number.isFinite(Number(f.cambioPrevioMin))||Number(f.cambioPrevioMin)<0))errores.push(n+': el cambio previsto debe ser 0 o más minutos.');
      if(f.tipoFin==='CIERRE'&&i<filas.length-1)errores.push(n+': «Resto del turno / hasta el cierre» solo puede ser el último paso de la línea.');
      const mod=MD.modoDe({modo:f.modo});
      if(f.saldo&&f.tipoFin!=='CANTIDAD')errores.push(n+': «Completar cantidad» no se puede cambiar a hora o cierre desde aquí.');
    });
    return errores;
  };

  /* ---------- guardado (una transacción: todos los productos de la línea y bloque) ---------- */
  const guardando=new Set();
  S.guardar=async function(linea,fecha,turno,filas,opc){
    opc=opc||{};
    if(!NS.puede())throw new Error('Solo Planificación puede crear o editar la programación.');
    const bloque=bl(turno),llave=[linea,fecha,bloque].join('|');
    if(guardando.has(llave))throw new Error('Ya se está guardando esta secuencia: espera un momento.');
    guardando.add(llave);
    try{
      const errores=S.validar(linea,fecha,turno,filas);
      if(errores.length)throw new Error(errores.join('\n'));
      const est=S.estimar(linea,fecha,turno,filas);
      if(est.conflictos.length)throw new Error('La secuencia tiene conflictos: '+est.conflictos.join(' ')+' Revisa la hora, el orden o la cantidad del tramo anterior.');
      if(typeof NS.asegurarCompromiso==='function')await NS.asegurarCompromiso(fecha,bloque);
      const quienN=quien(),t0=ahoraMs();
      // agrupar por producto
      const porProd=new Map();
      filas.forEach((f,i)=>{const k=claveP(f.marca,f.presentacion);if(!porProd.has(k))porProd.set(k,[]);porProd.get(k).push({f,i});});
      const refs=[];
      const ref=db.collection('sync').doc('programaciones');
      const eventos=[];
      let nuevas=null;
      await db.runTransaction(async tx=>{
        eventos.length=0;
        const snap=await tx.get(ref);
        let actuales=snap.exists&&Array.isArray(snap.data().items)?snap.data().items.slice():[];
        const delBloque=p=>p&&p.linea===linea&&p.fecha===fecha&&bl(p.turno)===bloque&&NS.estadoDe(p)!=='CANCELADA'&&(num(p.cantidadProgramada)>0||NS.esPlanSinCantidad(p));
        const tocadas=new Set();
        porProd.forEach(lista=>{
          const f0=(lista.find(x=>x.f.itemClave)||lista[0]).f,existente=actuales.find(p=>p&&p.clave===f0.itemClave)||actuales.find(p=>p&&p.linea===linea&&p.fecha===fecha&&bl(p.turno)===bloque&&claveP(p.marca,p.presentacion)===claveP(f0.marca,f0.presentacion)&&NS.estadoDe(p)!=='CANCELADA')||null;
          const esperada=existente?num(f0.version):null;
          if(existente&&f0.version!==undefined&&num(existente.version)!==num(f0.version))throw Object.assign(new Error('Otra persona cambió «'+f0.marca+'» mientras editabas la secuencia. Vuelve a abrirla para ver lo vigente.'),{conflicto:true});
          if(!existente&&f0.itemClave)throw Object.assign(new Error('«'+f0.marca+'» ya no existe (otra persona la quitó). Vuelve a abrir la secuencia.'),{conflicto:true});
          const esCompletar=existente&&MD.modoDe(existente)==='COMPLETAR';
          const temporal=lista.some(x=>x.f.tipoFin!=='CANTIDAD');
          const tramos=lista.map(({f,i})=>{
            const t={id:f.id,orden:i+1,tipoFin:f.tipoFin,creadoEn:t0};
            if(f.tipoFin==='CANTIDAD')t.cantidadObjetivo=esCompletar?num(existente.cantidadProgramada):Number(f.cantidad);
            if(f.tipoFin==='HORA')t.horaFin=f.hora;
            if(f.cambioPrevioMin!==null&&f.cambioPrevioMin!==undefined&&f.cambioPrevioMin!==''&&i>0)t.cambioPrevioMin=Number(f.cambioPrevioMin);
            return t;
          });
          let cantidad,extra={},conservarCero=false;
          const upp=num(existente?existente.unidadesPorPaleta:0)||num(NS.uppSugerida(linea,f0.marca,f0.presentacion));
          if(esCompletar){cantidad=num(existente.cantidadProgramada);conservarCero=NS.esPlanSinCantidad(existente);}
          else if(temporal){
            /* Un producto puede repetirse en la línea (13 000 ahora y «el resto» más tarde): su cantidad es la SUMA de sus pasos (fijos + estimados). */
            const trs=lista.map(x=>est.tramos[x.i]);
            const fijo=lista.reduce((sum,x)=>sum+(x.f.tipoFin==='CANTIDAD'?Number(x.f.cantidad):0),0);
            const pendientes=lista.some((x,j)=>x.f.tipoFin!=='CANTIDAD'&&!(trs[j]&&trs[j].estado==='OK'&&num(trs[j].cantidad)>0));
            const estim=lista.reduce((sum,x,j)=>sum+(x.f.tipoFin!=='CANTIDAD'&&trs[j]&&trs[j].estado==='OK'?num(trs[j].cantidad):0),0);
            const conCierre=lista.some(x=>x.f.tipoFin==='CIERRE'),tHora=lista.find(x=>x.f.tipoFin==='HORA'),tTemp=lista.find(x=>x.f.tipoFin==='CIERRE')||tHora;
            const modo=conCierre?'TURNO':'HORA';
            extra.modo=modo;extra.alcance=modo==='TURNO'?(lista.length===1&&lista[0].i===0?'TODO_TURNO':'TIEMPO_RESTANTE'):null;extra.meta=null;
            const base={tipoFin:tTemp.f.tipoFin,horaFin:tTemp.f.hora||'',parametrosVersion:num(est.parametrosVersion),calculadoEn:t0,por:quienN};
            if(!pendientes){
              cantidad=fijo+estim;
              const t1=trs[lista.indexOf(tTemp)];
              extra.estimado=Object.assign({cantidad,ratio:t1.velocidad,tiempoProdMin:Math.round(trs.reduce((sum,t)=>sum+num(t&&t.tiempoMin),0)*10)/10,
                inicioMs:est.bloque.inicioMs+trs[0].inicioOff*60000,finMs:est.bloque.inicioMs+t1.finOff*60000},base);
            }else{
              cantidad=fijo;conservarCero=!(fijo>0);       // instrucción válida con estimación pendiente: no es una cantidad fija ficticia
              const tp=trs.find(t=>t&&t.estado!=='OK');
              extra.estimado=Object.assign({estado:'PENDIENTE',motivo:tp&&tp.motivo?tp.motivo:'estimación pendiente'},base);
            }
          }else{
            cantidad=lista.reduce((s,x)=>s+Number(x.f.cantidad),0);
            extra.modo='FIJA';extra.estimado=null;extra.alcance=null;
          }
          if(cantidad>0&&!(upp>0))throw new Error('Falta las unidades por paleta de '+f0.marca+' '+NS.etiquetaPresentacion(linea,f0.marca,f0.presentacion)+' en el catálogo.');
          const campos=Object.assign({cantidadProgramada:cantidad,unidadesPorPaleta:upp,paletasProgramadas:upp?cantidad/upp:0,actualizadoPor:quienN,actualizadoEn:t0,tramosSecuencia:tramos},esCompletar?{}:extra);
          const turnoItem=existente?existente.turno:bloque;
          const r=programacionAplicarEnLista(actuales,{linea,fecha,turno:turnoItem,marca:f0.marca,presentacion:f0.presentacion,cantidadNum:cantidad,uppNum:upp,campos,motivo:opc.motivo,conservarCero},{versionEsperada:existente?esperada:null});
          actuales=r.items;tocadas.add(r.nuevo?r.nuevo.clave:'');
          if(r.nuevo)eventos.push({accion:r.previo?'EDICION':'CREACION',linea,fecha,turno:r.turnoFinal,marca:f0.marca,presentacion:f0.presentacion,anterior:programacionValorHistorial(r.previo,true),nuevo:programacionValorHistorial(r.nuevo,false),
            motivo:opc.motivo||'',referencia:'SECUENCIA: '+tramos.map(t=>t.tipoFin==='CANTIDAD'?fmt(t.cantidadObjetivo)+' UND':t.tipoFin==='HORA'?'hasta '+t.horaFin:'hasta el cierre').join(' → ')+' · '+S.TERMINA[lista[0].f.tipoFin],
            extra:{secuencia:true,tramos:tramos.length,modo:extra.modo||MD.modoDe(existente)}});
        });
        // productos que ya no están en la secuencia: se quitan si no han empezado
        actuales.filter(delBloque).filter(p=>!tocadas.has(p.clave)&&!filas.some(f=>claveP(f.marca,f.presentacion)===claveP(p.marca,p.presentacion))).forEach(p=>{
          if(NS.enProduccion(p))throw new Error('No se puede quitar «'+p.marca+'»: ya está en producción. Déjalo en la secuencia.');
          const r=programacionAplicarEnLista(actuales,{linea,fecha,turno:p.turno,marca:p.marca,presentacion:p.presentacion,cantidadNum:0,uppNum:0,campos:{},motivo:opc.motivo},{versionEsperada:num(p.version)});
          actuales=r.items;
          eventos.push({accion:'ELIMINACION',linea,fecha,turno:r.turnoFinal,marca:p.marca,presentacion:p.presentacion,anterior:programacionValorHistorial(r.previo,true),nuevo:null,motivo:opc.motivo||'',referencia:'SECUENCIA: producto quitado de la secuencia'});
        });
        tx.set(ref,{items:actuales,updatedAt:Date.now()});
        eventos.forEach(ev=>{const x=NS.armarEvento(ev);if(x)tx.set(db.collection('historialProgramacion').doc(x.id),x.doc);});
        nuevas=actuales;
      });
      if(typeof _programacionesCache!=='undefined')_programacionesCache=nuevas;
      if(typeof NS.programarEvaluacion==='function')NS.programarEvaluacion(fecha,bloque);
      return {estimacion:est,eventos:eventos.length};
    }finally{guardando.delete(llave);}
  };

  /* ---------- lectura: plan publicado vs proyección actual ---------- */
  /* Revisión de lo publicado: ¿las cantidades estimadas de hoy difieren de las guardadas? (no se reescribe nada) */
  S.revision=function(p){
    if(!p||!(p.modo==='HORA'||p.modo==='TURNO')||!p.estimado||!(num(p.estimado.cantidad)>0))return null;
    const filas=S.filasDe(p.linea,p.fecha,p.turno);
    const e=S.estimar(p.linea,p.fecha,p.turno,filas);
    const idx=filas.map((f,j)=>f.itemClave===p.clave?j:-1).filter(j=>j>=0);
    const ts=idx.map(j=>e.tramos[j]).filter(Boolean);
    const mal=ts.find(t=>t.estado!=='OK');
    if(!ts.length||mal)return {estado:mal?mal.estado:'SIN_TRAMO',guardado:num(p.estimado.cantidad),hoy:null,cambio:false};
    const hoy=ts.reduce((sum,t)=>sum+num(t.cantidad),0);
    return {estado:'OK',guardado:num(p.estimado.cantidad),hoy,cambio:hoy!==num(p.estimado.cantidad),version:num(e.parametrosVersion),versionGuardada:num(p.estimado.parametrosVersion)};
  };
  /* Proyección actual de una línea: tramos finalizados con su fin real, cambio real observado, y el resto proyectado desde ahora con el cambio previsto. */
  S.proyeccion=function(linea,fecha,turno){
    const filas=S.filasDe(linea,fecha,turno);
    if(!filas.length)return null;
    const b=NS.bloqueDe(fecha,bl(turno),linea);
    if(ahoraMs()<b.inicioMs)return {aplica:false,motivo:'El bloque todavía no empieza: la proyección usa el plan publicado.'};
    const e=S.estimar(linea,fecha,turno,filas,{proyeccion:true});
    const rl=reales(linea,fecha,turno,b);
    const sustento=[];
    filas.forEach((f,i)=>{
      const r=rl[claveP(f.marca,f.presentacion)];
      if(r&&r.finOff!==undefined)sustento.push(f.marca+' finalizó a las '+S.hora(b,r.finOff)+' (real)');
      else if(r&&r.inicioOff!==undefined)sustento.push(f.marca+' empezó a las '+S.hora(b,r.inicioOff)+' (real)');
    });
    // cambio real observado entre dos tramos consecutivos con datos reales (solo informativo: no crea una parada)
    const cambios=[];
    for(let i=1;i<filas.length;i++){
      const a=rl[claveP(filas[i-1].marca,filas[i-1].presentacion)],c=rl[claveP(filas[i].marca,filas[i].presentacion)];
      if(a&&a.finOff!==undefined&&c&&c.inicioOff!==undefined&&claveP(filas[i-1].marca,filas[i-1].presentacion)!==claveP(filas[i].marca,filas[i].presentacion))
        cambios.push({desde:filas[i-1].marca,hacia:filas[i].marca,realMin:Math.max(0,c.inicioOff-a.finOff),previstoMin:e.tramos[i]?e.tramos[i].cambioAntesMin:null});
    }
    return {aplica:true,estimacion:e,sustento,cambios,calculadoEn:ahoraMs(),bloque:b};
  };

  /* ---------- texto y HTML de la secuencia ---------- */
  const etiquetaFin=(t)=>t.tipoFin==='HORA'?'hasta '+(t.horaFin||'—'):t.tipoFin==='CIERRE'?'hasta el cierre':'por cantidad';
  S.textoLinea=function(linea,fecha,turno){
    const filas=S.filasDe(linea,fecha,turno);
    if(filas.length<2&&!filas.some(f=>f.tipoFin!=='CANTIDAD'))return '';
    const e=S.estimar(linea,fecha,turno,filas);
    return 'Secuencia: '+e.tramos.map((t,i)=>{
      const f=filas[i];
      const cam=i>0&&t.cambioAntesMin!==null&&t.cambioAntesMin!==undefined?' ['+t.cambioAntesMin+' min de cambio] ':'';
      const q=t.temporal?(t.cantidad!==null&&t.cantidad!==undefined?' ≈ '+fmt(t.cantidad)+' UND estimadas':' (estimación pendiente)'):' '+fmt(f&&f.cantidad)+' UND';
      return cam+t.marca+' '+etiquetaFin(t)+q;
    }).join(' → ');
  };
  const textoCambio=t=>{
    if(t.cambioAntesMin===null||t.cambioAntesMin===undefined)return t.cambioFaltante?'Cambio: falta configurar ('+esc(t.cambioFaltante)+')':'';
    return 'Cambio previsto: '+t.cambioAntesMin+' min'+(t.cambioAjuste?' (ajuste del plan)':t.cambioInicial?' (valor inicial)':'');
  };
  S.htmlBloque=function(linea,fecha,turno){
    const filas=S.filasDe(linea,fecha,turno);
    if(!filas.length)return '';
    const e=S.estimar(linea,fecha,turno,filas),b=e.bloque,planifica=NS.puede();
    const chip=t=>t.estado==='OK'||t.estado==='REAL'?'':'<span class="plan-chip '+(t.estado==='CONFLICTO'?'rojo':'gris')+'">'+(t.estado==='CONFLICTO'?'Conflicto':'Pendiente')+'</span>';
    const filasH=e.tramos.map((t,i)=>{
      const f=filas[i]||{};
      const cant=t.temporal?(t.cantidad!==null&&t.cantidad!==undefined?'≈ '+fmt(t.cantidad)+' UND <small>estimadas</small>':'<i>estimación pendiente</i>'):(f.saldo&&!(num(f.cantidad)>0)?'<i>saldo por calcular</i>':fmt(f.cantidad)+' UND');
      return (i>0&&claveP(filas[i-1].marca,filas[i-1].presentacion)!==claveP(f.marca,f.presentacion)?'<div class="seq-cambio">'+esc(filas[i-1].marca)+' → '+esc(f.marca)+' · '+esc(textoCambio(t).replace(/&/g,'&amp;'))+(planifica?' · <a href="#" data-plan-seq="'+esc(linea)+'">Editar</a>':'')+'</div>':'')+
        '<div class="seq-tramo"><b>'+(i+1)+'. '+esc(t.marca)+'</b> <small>'+esc(NS.etiquetaPresentacion(linea,t.marca,t.presentacion))+'</small> · '+esc(S.TERMINA[t.tipoFin]||'')+(t.tipoFin==='HORA'?' '+esc(t.horaFin):'')+' · '+cant+
          ' <span class="seq-hora">'+(t.inicioOff!==null&&t.inicioOff!==undefined?S.hora(b,t.inicioOff)+'–'+S.hora(b,t.finOff):'')+'</span> '+chip(t)+(t.motivo&&t.estado!=='REAL'?'<small class="plan-subt plan-warn">'+esc(t.motivo)+'</small>':'')+'</div>';
    }).join('');
    const prox=S.proyeccion(linea,fecha,turno);
    return '<div class="plan-seq seq-linea"><h5>'+esc(NS.nombreLinea(linea))+' · Secuencia <small>(plan publicado · parámetros v'+num(e.parametrosVersion)+')</small>'+(planifica?' <button type="button" class="btn btn-ghost btn-sm" data-plan-seq="'+esc(linea)+'">Editar secuencia</button>':'')+'</h5>'+
      filasH+(e.conflictos.length?'<div class="pm-adv">'+e.conflictos.map(esc).join('<br>')+'</div>':'')+
      (prox&&prox.aplica&&prox.sustento.length?'<details><summary>Proyección actual</summary><div class="plan-nota">Actualizada a las '+S.hora(b,(prox.calculadoEn-b.inicioMs)/60000)+' con datos reales: '+esc(prox.sustento.join('; '))+'. '+
        prox.estimacion.tramos.filter(t=>t.estado!=='REAL').map(t=>esc(t.marca)+': '+(t.cantidad!==null&&t.cantidad!==undefined?(t.temporal?'≈ ':'')+fmt(t.cantidad)+' UND':'pendiente')+' ('+(t.inicioOff!==null&&t.inicioOff!==undefined?S.hora(b,t.inicioOff)+'–'+S.hora(b,t.finOff):'—')+')').join(' · ')+
        (prox.cambios.length?'<br>'+prox.cambios.map(c=>'Cambio real '+esc(c.desde)+' → '+esc(c.hacia)+': '+Math.round(c.realMin)+' min (previsto '+(c.previstoMin===null||c.previstoMin===undefined?'—':c.previstoMin)+' min). Es un dato informativo; no crea una parada oficial.').join('<br>'):'')+
        '<br><small>La proyección no cambia la instrucción publicada ni las cantidades firmes.</small></div></details>':'')+'</div>';
  };

  /* ---------- diálogo «Secuencia de la línea» ---------- */
  function estilos(){
    if(document.getElementById('plan-seq-css'))return;
    const s=document.createElement('style');s.id='plan-seq-css';
    s.textContent=`
      .seq-linea .seq-tramo{padding:6px 0;font-size:13px;border-top:1px dashed #e3eaf0}.seq-linea .seq-cambio{margin:2px 0 2px 14px;padding:3px 8px;border-left:3px solid #7C3AED;background:#f5f3ff;color:#4c1d95;font-size:12px;border-radius:0 8px 8px 0}
      .seq-linea .seq-hora{color:#5a6b78;font-variant-numeric:tabular-nums}
      .sq-fila{display:grid;grid-template-columns:30px minmax(120px,1.2fr) minmax(120px,1.2fr) 120px minmax(90px,.8fr) 70px minmax(150px,1.2fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid #e3eaf0;border-radius:10px;margin:6px 0;background:#fff}
      .sq-fila select,.sq-fila input{width:100%;box-sizing:border-box;min-height:38px}
      .sq-fila .sq-n{font-weight:800;color:#005b96}.sq-est{font-size:12px;color:#46627a;line-height:1.35}.sq-est b{color:#003b5c}
      .sq-cambio{margin:-2px 0 2px 38px;padding:4px 8px;border-left:3px solid #7C3AED;background:#f5f3ff;color:#4c1d95;font-size:12px;border-radius:0 8px 8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .sq-cambio input{width:76px;min-height:30px}
      .sq-botones{display:flex;gap:4px}.sq-botones button{min-width:36px;min-height:36px}
      @media(max-width:760px){.sq-fila{grid-template-columns:1fr 1fr}.sq-fila .sq-n{grid-column:1/-1}.sq-cambio{margin-left:8px}}`;
    document.head.appendChild(s);
  }
  S.abrir=function(linea,fecha,turno){
    if(!NS.puede())return;
    estilos();MD.estilos();
    const E=NS.estado;fecha=fecha||E.fecha;turno=turno||E.turno;
    let filas=S.filasDe(linea,fecha,turno).map(f=>Object.assign({},f));
    if(!filas.length)filas=[{id:idNuevo(),marca:'',presentacion:'',tipoFin:'CANTIDAD',cantidad:'',hora:'',cambioPrevioMin:null,modo:'FIJA',saldo:false,version:undefined,itemClave:'',upp:0}];
    const iniciado=filas.some(f=>NS.enProduccion({estadoOperacion:{estado:f.estadoOp}}))||NS.inicioBloqueMs(fecha,bl(turno))<=ahoraMs();
    const fondo=NS.abrirDialogo('<h3>Secuencia de la línea · '+esc(NS.nombreLinea(linea))+'</h3><div class="small-muted" style="margin-bottom:8px">'+esc(fecha)+' · '+esc(NS.etiquetaBloqueConHorario(turno))+
      '</div><p class="plan-nota">Cada producto termina por <b>cantidad</b>, por una <b>hora</b> o <b>hasta el cierre</b>. Las marcas sin cantidad generan una cantidad <b>estimada</b> con la velocidad nominal y el tiempo productivo; no cambian la marca por sí solas: el supervisor confirma el cambio real.</p>'+
      '<div id="sq-filas"></div><div class="plan-acciones" style="justify-content:flex-start;border:0;padding:0;margin:6px 0"><button type="button" class="btn btn-ghost btn-sm" id="sq-agregar">+ Agregar producto</button></div>'+
      '<div id="sq-resumen"></div>'+
      (iniciado?'<label class="completo" style="display:block;margin-top:8px;font-size:12px;font-weight:600;color:#5a6b78">Motivo del cambio (obligatorio: el bloque ya empezó)<textarea id="sq-motivo" rows="2" style="width:100%;box-sizing:border-box"></textarea></label>':'')+
      '<div class="plan-error" id="sq-error"></div><div class="plan-acciones"><button type="button" class="btn btn-ghost" id="sq-cancelar">Cancelar</button><button type="button" class="btn btn-primary" id="sq-guardar">Guardar secuencia</button></div>',true);
    const q=id=>fondo.querySelector('#'+id);
    const opcionesMarca=(sel)=>'<option value="">Marca…</option>'+NS.marcas(linea).map(m=>'<option'+(m===sel?' selected':'')+'>'+esc(m)+'</option>').join('');
    const opcionesPres=(sel)=>'<option value="">Presentación…</option>'+NS.presentaciones(linea).map(p=>'<option value="'+esc(p.value)+'"'+(p.value===sel?' selected':'')+'>'+esc(p.label)+'</option>').join('');
    let ultima=null;
    const pintarFilas=()=>{
      const e=ultima=S.estimar(linea,fecha,turno,filas);
      q('sq-filas').innerHTML=filas.map((f,i)=>{
        const t=e.tramos[i]||{};
        const bloqueado=f.saldo;                         // Completar cantidad: su cantidad es el saldo
        const cambia=i>0&&claveP(filas[i-1].marca,filas[i-1].presentacion)!==claveP(f.marca,f.presentacion)&&f.marca&&filas[i-1].marca;
        return (cambia?'<div class="sq-cambio">'+esc(filas[i-1].marca)+' → '+esc(f.marca)+' · <span>'+esc(textoCambio(t)||'Cambio previsto: —')+'</span> <label style="display:inline-flex;gap:4px;align-items:center">Ajustar (min): <input type="number" min="0" step="1" data-sq-cambio="'+i+'" value="'+esc(f.cambioPrevioMin===null||f.cambioPrevioMin===undefined?'':f.cambioPrevioMin)+'" placeholder="auto"></label></div>':'')+
          '<div class="sq-fila" data-sq="'+i+'"><div class="sq-n">'+(i+1)+'</div>'+
          '<select data-sq-campo="marca" aria-label="Marca"'+(bloqueado?' disabled':'')+'>'+opcionesMarca(f.marca)+'</select>'+
          '<select data-sq-campo="presentacion" aria-label="Presentación"'+(bloqueado?' disabled':'')+'>'+opcionesPres(f.presentacion)+'</select>'+
          '<select data-sq-campo="tipoFin" aria-label="Terminar por"'+(bloqueado?' disabled':'')+'>'+Object.keys(S.TERMINA).map(k=>'<option value="'+k+'"'+(k===f.tipoFin?' selected':'')+'>'+S.TERMINA[k]+'</option>').join('')+'</select>'+
          (f.tipoFin==='CANTIDAD'?'<input type="number" min="1" step="1" inputmode="numeric" data-sq-campo="cantidad" value="'+esc(f.cantidad)+'" placeholder="UND" aria-label="Cantidad"'+(bloqueado?' disabled':'')+'>'
            :f.tipoFin==='HORA'?'<input type="time" data-sq-campo="hora" value="'+esc(f.hora)+'" aria-label="Hora límite">':'<span class="sq-est">hasta el cierre del bloque</span>')+
          '<div class="sq-botones"><button type="button" class="btn btn-ghost btn-sm" data-sq-subir="'+i+'" aria-label="Subir"'+(i===0?' disabled':'')+'>▲</button><button type="button" class="btn btn-ghost btn-sm" data-sq-bajar="'+i+'" aria-label="Bajar"'+(i===filas.length-1?' disabled':'')+'>▼</button></div>'+
          '<div class="sq-est">'+(t.inicioOff!==null&&t.inicioOff!==undefined?'<b>'+S.hora(e.bloque,t.inicioOff)+'–'+S.hora(e.bloque,t.finOff)+'</b><br>':'')+
            (t.temporal?(t.cantidad!==null&&t.cantidad!==undefined?'≈ '+fmt(t.cantidad)+' UND estimadas':'estimación pendiente'):(f.saldo&&!(num(f.cantidad)>0)?'saldo por calcular':fmt(f.cantidad)+' UND'))+(t.estado==='PENDIENTE'||t.estado==='CONFLICTO'?'<br><span style="color:'+(t.estado==='CONFLICTO'?'#991B1B':'#6b7280')+'">'+esc(t.motivo||'')+'</span>':'')+'</div>'+
          '<button type="button" class="btn btn-ghost btn-sm" data-sq-quitar="'+i+'" style="color:#a32020" aria-label="Quitar">✕</button></div>';
      }).join('');
      const err=S.validar(linea,fecha,turno,filas);
      q('sq-resumen').innerHTML=(e.conflictos.length?'<div class="pm-adv"><b>Conflictos:</b><br>'+e.conflictos.map(esc).join('<br>')+'<br>Revisa la hora, el orden o la cantidad del tramo anterior.</div>':'')+
        (e.faltantes.length?'<div class="pm-info">Cálculo parcial: falta '+esc(e.faltantes.map(f=>f.dato+(f.marca?' de '+f.marca:'')).join('; '))+'. Se puede guardar: la estimación queda pendiente.</div>':'')+
        (e.avisos.length?'<div class="plan-nota">'+e.avisos.map(esc).join('<br>')+'</div>':'')+
        (e.finOff!==null&&e.finOff!==undefined&&!e.faltantes.length?'<div class="plan-nota">Fin estimado de la secuencia: '+S.hora(e.bloque,e.finOff)+'. En «Hasta el cierre» la ocupación prevista del bloque no es una prueba de cumplimiento.</div>':'');
      q('sq-guardar').disabled=!!e.conflictos.length||!!err.length;
      q('sq-error').textContent=err.length&&filas.some(f=>f.marca)?err.join('\n'):'';
    };
    fondo.addEventListener('change',ev=>{
      const t=ev.target,fila=t.closest&&t.closest('[data-sq]');
      if(t.dataset&&t.dataset.sqCambio!==undefined){const i=Number(t.dataset.sqCambio);filas[i].cambioPrevioMin=t.value===''?null:Number(t.value);pintarFilas();return;}
      if(!fila||!t.dataset.sqCampo)return;
      const i=Number(fila.dataset.sq),c=t.dataset.sqCampo;
      filas[i][c]=t.value;
      if(c==='marca'||c==='presentacion'){Object.assign(filas[i],{itemClave:'',version:undefined,modo:'FIJA',saldo:false,upp:0});}      // otro producto = una programación nueva (la anterior se quita si no empezó)
      pintarFilas();
    });
    fondo.addEventListener('input',ev=>{const t=ev.target;if(t.dataset&&t.dataset.sqCampo==='cantidad'){const i=Number(t.closest('[data-sq]').dataset.sq);filas[i].cantidad=t.value;const e=ultima=S.estimar(linea,fecha,turno,filas);q('sq-guardar').disabled=!!e.conflictos.length||!!S.validar(linea,fecha,turno,filas).length;}});
    fondo.addEventListener('click',ev=>{
      const t=ev.target.closest&&ev.target.closest('button');if(!t)return;
      const d=t.dataset;
      if(d.sqSubir!==undefined){const i=Number(d.sqSubir);if(i>0){[filas[i-1],filas[i]]=[filas[i],filas[i-1]];pintarFilas();}return;}
      if(d.sqBajar!==undefined){const i=Number(d.sqBajar);if(i<filas.length-1){[filas[i+1],filas[i]]=[filas[i],filas[i+1]];pintarFilas();}return;}
      if(d.sqQuitar!==undefined){const i=Number(d.sqQuitar);if(filas[i].saldo){q('sq-error').textContent='«Completar cantidad» se quita desde su propio plan.';return;}filas.splice(i,1);pintarFilas();return;}
    });
    q('sq-agregar').onclick=()=>{filas.push({id:idNuevo(),marca:'',presentacion:'',tipoFin:'CANTIDAD',cantidad:'',hora:'',cambioPrevioMin:null,modo:'FIJA',saldo:false,version:undefined,itemClave:'',upp:0});pintarFilas();};
    q('sq-cancelar').onclick=()=>fondo.remove();
    q('sq-guardar').onclick=async()=>{
      q('sq-guardar').disabled=true;q('sq-error').textContent='';
      try{
        const motivo=q('sq-motivo')?q('sq-motivo').value.trim():'';
        if(iniciado&&motivo.length<5)throw new Error('Hace falta un motivo de al menos 5 caracteres: el bloque ya empezó.');
        await S.guardar(linea,fecha,turno,filas,{motivo});
        fondo.remove();if(typeof NS.repintar==='function')NS.repintar();
      }catch(e){q('sq-error').textContent=(e&&e.message)||String(e);q('sq-guardar').disabled=false;}
    };
    pintarFilas();
    const vigilar=()=>{if(!document.body.contains(fondo)){const i=NS.alRefrescar.indexOf(vigilar);if(i>=0)NS.alRefrescar.splice(i,1);}};   // un refresco remoto no reescribe lo que se está editando
    NS.alRefrescar.push(vigilar);
  };
  /* Agrega un producto como el último paso de la secuencia de su línea (desde «Nueva programación»). paso: {tipoFin, hora?, cantidad?}. */
  S.agregarPaso=async function(fila,paso,opc){
    const filas=S.filasDe(fila.linea,fila.fecha,fila.turno).map(f=>Object.assign({},f));
    filas.push({id:idNuevo(),marca:fila.marca,presentacion:fila.presentacion,tipoFin:paso.tipoFin,cantidad:paso.cantidad||'',hora:paso.hora||'',cambioPrevioMin:null,modo:'FIJA',saldo:false,version:undefined,itemClave:'',upp:0});
    return S.guardar(fila.linea,fila.fecha,fila.turno,filas,opc||{});
  };
  /* Editar un plan temporal (hasta una hora / cierre) abre su secuencia, no el formulario simple. */
  S.debeUsarSecuencia=clave=>{const p=NS.programaciones().find(x=>x.clave===clave);return !!p&&(p.modo==='HORA'||(Array.isArray(p.tramosSecuencia)&&p.tramosSecuencia.some(t=>t.tipoFin==='HORA'||t.tipoFin==='CIERRE')));};
  S.abrirDesdeClave=clave=>{const p=NS.programaciones().find(x=>x.clave===clave);if(p)S.abrir(p.linea,p.fecha,p.turno);};
  document.addEventListener('click',e=>{
    const a=e.target.closest&&e.target.closest('[data-plan-seq]');
    if(!a)return;
    e.preventDefault();S.abrir(a.getAttribute('data-plan-seq'));
  });

  /* ---------- bloque de secuencias en Programación ---------- */
  const extrasAnterior=NS.pintarExtras;
  NS.pintarExtras=function(){
    if(typeof extrasAnterior==='function')extrasAnterior.apply(this,arguments);
    try{
      const cap=document.getElementById('plan-capacidad');
      if(!cap)return;
      estilos();
      const E=NS.estado,hs=[];
      NS.lineas().forEach(l=>{
        const filas=S.filasDe(l.key,E.fecha,E.turno);
        if(filas.length>=2||filas.some(f=>f.tipoFin!=='CANTIDAD'))hs.push(S.htmlBloque(l.key,E.fecha,E.turno));
      });
      const prev=cap.querySelector('#plan-seq-lineas');if(prev)prev.remove();
      if(hs.length)cap.insertAdjacentHTML('beforeend','<div id="plan-seq-lineas"><h4 class="plan-h4">Secuencia por línea <small>(terminar por cantidad, hora o cierre · cantidades estimadas marcadas «≈»)</small></h4>'+hs.join('')+'</div>');
    }catch(_){/* informativo */}
  };

  /* ---------- Catálogo: TIEMPO DE CAMBIO DE MARCA por línea ---------- */
  const reglaGeneral=linea=>(NS.tiemposDatos().reglas||[]).filter(r=>r.linea===linea&&r.tipo==='CAMBIO_MARCA'&&r.activo!==false&&!r.origen&&!r.destino).sort((a,b)=>num(b.actualizadoEn)-num(a.actualizadoEn))[0]||null;
  S.cambioMarcaDe=linea=>{const r=reglaGeneral(linea);return r?{minutos:r.minutos,inicial:false,regla:r}:{minutos:MO.CAMBIO_INICIAL_MIN,inicial:true,regla:null};};
  S.htmlCambioMarca=function(){
    const planifica=NS.puede();
    const fh=ms=>ms?new Date(ms).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
    return '<div class="plan-seq" id="cat-cambio-marca"><h5>Tiempo de cambio de marca <small>(valor inicial '+MO.CAMBIO_INICIAL_MIN+' min; editable por línea)</small></h5>'+
      '<p class="plan-nota">Es el tiempo previsto de cambiar de una marca a otra con el mismo formato. Se aplica una vez por transición y no entre tramos del mismo producto. El ajuste de una transición concreta se hace en la secuencia; una regla específica de origen y destino tiene prioridad sobre este valor. Un 0 explícito se respeta. Cambiar el valor afecta a los planes nuevos o revisados: los ya publicados conservan el parámetro que usaron.</p>'+
      '<div class="plan-scroll"><table class="plan-tabla"><thead><tr><th>Línea</th><th class="num">Minutos</th><th>Origen del valor</th><th>Último cambio</th><th></th></tr></thead><tbody>'+
      NS.lineas().map(l=>{const c=S.cambioMarcaDe(l.key);
        return '<tr><td><b>'+esc(l.name)+'</b></td><td class="num">'+(planifica?'<input type="number" min="0" step="1" style="width:84px" data-cm-min="'+esc(l.key)+'" value="'+c.minutos+'" aria-label="Minutos de cambio de marca '+esc(l.name)+'">':c.minutos)+'</td>'+
          '<td>'+(c.inicial?'<span class="plan-chip gris">Valor inicial</span>':'<span class="plan-chip verde">Configurado</span>')+'</td>'+
          '<td>'+(c.regla?esc(c.regla.actualizadoPor||'—')+' · '+esc(fh(c.regla.actualizadoEn)):'—')+'</td>'+
          '<td>'+(planifica?'<button type="button" class="btn btn-ghost btn-sm" data-cm-guardar="'+esc(l.key)+'">Guardar</button>':'')+'</td></tr>';}).join('')+'</tbody></table></div><div class="plan-error" id="cm-error" role="alert"></div></div>';
  };
  const pintarTiemposAnterior=NS.pintarTiemposUI;
  if(typeof pintarTiemposAnterior==='function'){
    NS.pintarTiemposUI=function(cont){
      pintarTiemposAnterior.apply(this,arguments);
      try{if(cont&&!cont.querySelector('#cat-cambio-marca'))cont.insertAdjacentHTML('afterbegin',S.htmlCambioMarca());}catch(_){/* informativo */}
    };
  }
  S.guardarCambioMarca=async function(linea,minutos,motivo){
    if(!NS.puede())throw new Error('Solo Planificación puede configurar los tiempos.');
    const n=Number(minutos);
    if(!Number.isFinite(n)||n<0||!Number.isInteger(n))throw new Error('Los minutos deben ser un entero de 0 o más.');
    const g=reglaGeneral(linea);
    return NS.guardarRegla({id:g?g.id:'',esperadoEn:g?g.actualizadoEn:undefined,linea,tipo:'CAMBIO_MARCA',minutos:n,activo:true,motivo:motivo||'Tiempo de cambio de marca de la línea'});
  };
  document.addEventListener('click',async e=>{
    const b=e.target.closest&&e.target.closest('[data-cm-guardar]');
    if(!b)return;
    const linea=b.getAttribute('data-cm-guardar'),inp=document.querySelector('[data-cm-min="'+linea+'"]'),err=document.getElementById('cm-error');
    b.disabled=true;if(err)err.textContent='';
    try{await S.guardarCambioMarca(linea,inp?inp.value:'');const c=document.getElementById('cat-tiempos');if(c&&typeof NS.pintarTiemposUI==='function')NS.pintarTiemposUI(c);}
    catch(x){if(err)err.textContent=(x&&x.message)||String(x);}
    finally{b.disabled=false;}
  });
})();
