/* =============================================================
   PLANIFICACIÓN · AVANCE DEL PLAN, COMPROMISO ORIGINAL Y EXPORTACIÓN (etapa 2)

   · AVANCE: por producto (línea + marca + presentación) de un bloque: programado, producido, pendiente, sobreproducción y avance.
     La fuente del producido es la oficial de Producción Actual (glacialProducidoVigente: turno en curso = Paletas; turno cerrado =
     registro del turno). Sin registro NO es cero: devuelve null y la pantalla dice «Sin registro». Día + Intermedio es UN bloque: las
     filas DÍA e INTERMEDIO del mismo producto se agrupan y su producido se pide UNA vez (no se cuenta dos veces).
   · COMPROMISO ORIGINAL: la versión vigente del plan al INICIAR el bloque (inicio del turno DÍA o del NOCHE según la configuración de
     bloques). Lo cambiado antes del inicio es planificación; lo cambiado después es reprogramación. Se guarda en
     compromisosProgramacion/{AAAA-MM-DD_DIA|NOCHE} (un documento por bloque, solo se crea): el PRIMER cambio de plan posterior al inicio
     guarda antes el plan tal como estaba. Si ese guardado falla (p. ej. reglas sin publicar) el cambio de plan NO se bloquea: solo queda
     sin compromiso y Cumplimiento usa el plan vigente. Bloques sin documento = no se registró ninguna reprogramación.
   · EXPORTACIÓN: texto para el supervisor (portapapeles) y Excel del bloque.
   Cargar después de 54-planificacion-solicitudes.js.
   ============================================================= */
(function(){
  'use strict';
  const NS=window.glacialPlanificacion;
  const {num,esc,fechaOk,ahoraMs}=NS.util;

  /* ---------- paletas completas + UND restantes ---------- */
  NS.paletasTexto=(cant,upp)=>{
    cant=num(cant);upp=num(upp);
    if(!(upp>0)||!(cant>=0))return '—';
    const c=Math.floor(cant/upp),r=cant-c*upp;
    return c.toLocaleString('es-PE')+(r>0?' + '+r.toLocaleString('es-PE')+' UND':'');
  };

  /* ---------- producido oficial (null = sin registro) ---------- */
  NS.producidoDe=p=>{
    if(typeof window.glacialProducidoVigente!=='function')return null;
    try{const v=window.glacialProducidoVigente(p);return v===null||v===undefined||!Number.isFinite(Number(v))?null:Number(v);}catch(_){return null;}
  };

  /* ---------- resumen de un bloque ---------- */
  const claveProd=p=>[p.linea,p.marca,p.presentacion].join('|');
  /* Devuelve {grupos:Map(clave→grupo), porLinea:Map(linea→totales)}.
     grupo: {linea,marca,presentacion,filas,programado,producido|null,pendiente|null,sobre|null,avance|null,alcanzada,upp}
     Las filas CANCELADA no cuentan en el programado (igual que GlacialIndicadores.programadoVigente). */
  NS.resumenBloque=function(fecha,turno){
    const grupos=new Map();
    NS.items(fecha,turno).forEach(p=>{
      const k=claveProd(p),g=grupos.get(k)||{linea:p.linea,marca:p.marca,presentacion:p.presentacion,filas:[],programado:0,upp:0};
      g.filas.push(p);
      if(NS.estadoDe(p)!=='CANCELADA'){g.programado+=num(p.cantidadProgramada);g.upp=num(p.unidadesPorPaleta)||g.upp;}
      grupos.set(k,g);
    });
    const porLinea=new Map();
    grupos.forEach(g=>{
      if(!(g.programado>0)){g.producido=null;g.pendiente=null;g.sobre=null;g.avance=null;g.alcanzada=false;return;}   // solo canceladas: no cuenta en ningún total
      g.producido=g.programado>0?NS.producidoDe(g.filas.find(f=>NS.estadoDe(f)!=='CANCELADA')||g.filas[0]):null;
      const sin=g.producido===null;
      g.pendiente=sin?null:Math.max(0,g.programado-g.producido);
      g.sobre=sin?null:Math.max(0,g.producido-g.programado);
      g.avance=sin||!(g.programado>0)?null:g.producido/g.programado;
      g.alcanzada=!sin&&g.programado>0&&g.producido>=g.programado;
      const t=porLinea.get(g.linea)||{programado:0,producido:0,pendiente:0,sobre:0,sinRegistro:0,productos:0};
      t.programado+=g.programado;t.productos++;
      if(sin&&g.programado>0)t.sinRegistro++;
      else if(!sin){t.producido+=g.producido;t.pendiente+=g.pendiente;t.sobre+=g.sobre;}
      porLinea.set(g.linea,t);
    });
    return {grupos,porLinea};
  };

  /* ---------- inicio del bloque ---------- */
  NS.inicioBloqueMs=(fecha,turno)=>{
    const h=NS.horarioBloque(turno),m=/^(\d{1,2}):(\d{2})/.exec(h||'');
    if(!m||!fechaOk(fecha))return 0;
    return new Date(fecha+'T'+m[1].padStart(2,'0')+':'+m[2]+':00').getTime();
  };

  /* ---------- compromiso original ---------- */
  const compromisos=new Map();           // id → documento (escucha en vivo)
  const ya=new Set();                    // ids que ya se sabe que existen (evita lecturas repetidas)
  NS.compromisos=()=>[...compromisos.values()];
  NS.compromisoDe=(fecha,turno)=>compromisos.get(fecha+'_'+NS.valorBloque(turno))||null;
  const usuario=()=>{
    const u=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;
    return {uid:(u&&u.uid)||'',nombre:(typeof state!=='undefined'&&state.user&&(state.user.nombre||state.user.username))||''};
  };
  const filasDe=(items,fecha,bloque)=>items.filter(p=>p&&p.fecha===fecha&&NS.valorBloque(p.turno)===bloque&&num(p.cantidadProgramada)>0&&NS.estadoDe(p)!=='CANCELADA');
  /* Original de un producto en un bloque: número, o null si ese bloque no tiene compromiso guardado (no hubo reprogramación registrada). */
  NS.originalDe=(fecha,turno,linea,marca,pres)=>{
    const c=NS.compromisoDe(fecha,turno);
    if(!c)return null;
    return (c.filas||[]).filter(f=>f.linea===linea&&f.marca===marca&&f.presentacion===pres).reduce((a,f)=>a+num(f.cantidad),0);
  };
  /* Diferencias entre el original y el plan vigente: [{linea,marca,presentacion,original,vigente}] (solo las que difieren). */
  NS.cambiosDesdeInicio=(fecha,turno)=>{
    const c=NS.compromisoDe(fecha,turno);
    if(!c)return [];
    const bloque=NS.valorBloque(turno),mapa=new Map();
    (c.filas||[]).forEach(f=>{const k=claveProd(f),o=mapa.get(k)||{linea:f.linea,marca:f.marca,presentacion:f.presentacion,original:0,vigente:0};o.original+=num(f.cantidad);mapa.set(k,o);});
    filasDe(NS.programaciones(),fecha,bloque).forEach(p=>{const k=claveProd(p),o=mapa.get(k)||{linea:p.linea,marca:p.marca,presentacion:p.presentacion,original:0,vigente:0};o.vigente+=num(p.cantidadProgramada);mapa.set(k,o);});
    return [...mapa.values()].filter(o=>o.original!==o.vigente);
  };
  /* Guarda el compromiso del bloque ANTES del primer cambio posterior al inicio. No bloquea nunca el cambio de plan. */
  NS.asegurarCompromiso=async function(fecha,turno){
    try{
      const bloque=NS.valorBloque(turno),id=fecha+'_'+bloque;
      if(!fechaOk(fecha)||ya.has(id)||typeof db==='undefined')return;
      const inicio=NS.inicioBloqueMs(fecha,bloque);
      if(!inicio||ahoraMs()<inicio)return;                 // antes del inicio es planificación
      if(compromisos.has(id)){ya.add(id);return;}
      const u=usuario();
      if(!u.uid)return;
      const ref=db.collection('compromisosProgramacion').doc(id),refP=db.collection('sync').doc('programaciones');
      await db.runTransaction(async tx=>{
        const s=await tx.get(ref);
        if(s.exists)return;
        const ps=await tx.get(refP);
        const items=ps.exists&&Array.isArray(ps.data().items)?ps.data().items:[];
        const filas=filasDe(items,fecha,bloque).map(p=>({id:p.clave,linea:p.linea,marca:p.marca,presentacion:p.presentacion,cantidad:num(p.cantidadProgramada),upp:num(p.unidadesPorPaleta)}));
        tx.set(ref,{fecha,bloque,inicioMs:inicio,filas,creadoEn:firebase.firestore.FieldValue.serverTimestamp(),creadoPor:u.nombre,uid:u.uid});
      });
      ya.add(id);NS.compromisoFallo='';
    }catch(e){
      NS.compromisoFallo=(e&&e.message)||String(e);
      console.warn('Planificación: no se pudo guardar el compromiso original del bloque (el cambio de plan sigue):',NS.compromisoFallo);
    }
  };
  NS.escuchas.push(function(){
    if(typeof db==='undefined')return null;
    return db.collection('compromisosProgramacion').orderBy('fecha','desc').limit(200).onSnapshot(snap=>{
      compromisos.clear();
      snap.docs.forEach(d=>{const x=d.data();compromisos.set(d.id,Object.assign({id:d.id},x));ya.add(d.id);});
      NS.refrescar();
    },err=>console.warn('Compromiso original (¿reglas sin publicar?):',err&&err.message||err));
  });
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{compromisos.clear();ya.clear();});

  /* ---------- exportación del plan del bloque ---------- */
  const fmt=n=>num(n).toLocaleString('es-PE');
  const fechaTxt=f=>f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4);
  /* Texto para el supervisor: lo programado por línea y producto, con paletas completas + UND y el estado; sin cantidades producidas. */
  NS.textoPlan=function(fecha,turno){
    const items=NS.items(fecha,turno).filter(p=>NS.estadoDe(p)!=='CANCELADA');
    const sal=['PLAN DE PRODUCCIÓN','Bloque: '+NS.etiquetaBloqueConHorario(turno),'Fecha: '+fechaTxt(fecha),''];
    if(!items.length){sal.push('Sin programación para este bloque.');return sal.join('\n');}
    const porLinea=new Map();
    items.forEach(p=>{const l=porLinea.get(p.linea)||[];l.push(p);porLinea.set(p.linea,l);});
    NS.lineas().forEach(l=>{
      const ps=porLinea.get(l.key);if(!ps)return;
      sal.push(l.name);
      // un producto con filas en Día e Intermedio se muestra sumado
      const por=new Map();ps.forEach(p=>{const k=p.marca+'|'+p.presentacion,o=por.get(k)||{p,cant:0,upp:0,est:NS.estadoDe(p)};o.cant+=num(p.cantidadProgramada);o.upp=num(p.unidadesPorPaleta)||o.upp;por.set(k,o);});
      por.forEach(o=>sal.push('- '+o.p.marca+' '+NS.etiquetaPresentacion(o.p.linea,o.p.marca,o.p.presentacion)+': '+fmt(o.cant)+' UND'+(o.upp>0?' ('+NS.paletasTexto(o.cant,o.upp)+' paletas)':'')+' · '+NS.estadoTexto(o.est)));
      sal.push('');
    });
    sal.push('GLACIAL - Control de Producción');
    return sal.join('\n');
  };
  NS.copiarPlan=async function(fecha,turno){
    const t=NS.textoPlan(fecha,turno);
    try{await navigator.clipboard.writeText(t);}
    catch(_){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
    return t;
  };
  NS.excelPlan=function(fecha,turno){
    if(typeof XLSX==='undefined'){alert('No se cargó la librería de Excel.');return;}
    const r=NS.resumenBloque(fecha,turno);
    const filas=[];
    r.grupos.forEach(g=>{
      if(!(g.programado>0))return;                          // solo filas canceladas: no forman parte del plan
      const orig=NS.originalDe(fecha,turno,g.linea,g.marca,g.presentacion);
      filas.push([fecha,NS.etiquetaBloque(turno),NS.nombreLinea(g.linea),g.marca,NS.etiquetaPresentacion(g.linea,g.marca,g.presentacion),g.programado,orig===null?'':orig,
        g.upp||'',NS.paletasTexto(g.programado,g.upp),g.producido===null?'sin registro':g.producido,g.pendiente===null?'':g.pendiente,g.sobre===null?'':g.sobre,
        g.avance===null?'':+(g.avance*100).toFixed(1),NS.estadoTexto(NS.estadoDe(g.filas[0]))]);
    });
    const ws=XLSX.utils.aoa_to_sheet([['Fecha','Bloque','Línea','Marca','Presentación','Programado (UND)','Original al inicio (UND)','UND por paleta','Paletas (completas + UND)','Producido (UND)','Pendiente (UND)','Sobreproducción (UND)','Avance %','Estado']].concat(filas));
    ws['!cols']=[12,22,12,14,16,16,18,12,20,14,14,16,10,14].map(w=>({wch:w}));
    const libro=XLSX.utils.book_new();XLSX.utils.book_append_sheet(libro,ws,'Plan');
    XLSX.writeFile(libro,'plan-'+fecha+'-'+NS.valorBloque(turno)+'.xlsx');
  };
})();
