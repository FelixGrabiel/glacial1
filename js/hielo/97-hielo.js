/* =====================================================================================================================
   GLACIAL · REPORTE HIELO · docs/hielo/reporte-hielo.md
   Página propia (se abre desde la tarjeta «Reporte Hielo» de la pantalla de selección), con Inicio, Nuevo registro, Historial,
   Programación y Configuración. Un reporte por fecha operativa y turno (DÍA, INTERMEDIO o NOCHE, como Agua).
   La producción se cuenta en BOLSAS por marca y presentación; los kilos se calculan (bolsas × kg de la presentación).
   Inicio separa las bolsas por presentación (3 kg, 1.5 kg…) — pedido del dueño, 07/11/2026.
   Equipos, motivos de parada e ítems de merma NO se inventan: son listas editables en Configuración (los equipos empiezan vacíos).
   Colecciones (glacial_46): hieloReportes/{fecha_TURNO}, hieloProgramacion/{fecha_TURNO}, hieloParametros/config. Nada se borra.
   ===================================================================================================================== */
(function(){
  'use strict';
  const TURNOS=['DÍA','INTERMEDIO','NOCHE'];
  const DEFECTO={
    marcas:typeof MARCAS_HIELO!=='undefined'?MARCAS_HIELO.slice():['Glacial'],
    presentaciones:typeof PRESENTACIONES_HIELO!=='undefined'?PRESENTACIONES_HIELO.slice():['1.5 kg','3 kg','5 kg'],
    equipos:[],
    estaciones:['Tolva manual','Env. automática'],
    motivos:['Mantenimiento','Falla de equipo','Falta de insumo','Otros'],
    mermas:['Bolsas','Bobina','Hielo (producto)'],
    /* Kg REALES por bolsa (la bolsa «3 kg» pesa 3.25 kg y la «1.5 kg», 1.75 kg, según el reporte de la planta, 20/11/2026): con esto se calculan
       los kilos de todos los reportes. Configurable por presentación; sin dato se usa el número del nombre («3 kg» → 3). */
    pesos:{'3 kg':3.25,'1.5 kg':1.75},
    /* Capacidad de producción de un turno (kg): la eficiencia es kg del turno ÷ capacidad (33.68 % y 44.44 % en el reporte de la planta). */
    capacidadTurnoKg:34000,
    /* Bolsas por paleta, por presentación (3 kg → 300, 1.5 kg → 600): el N° de paletas del reporte es bolsas ÷ esto. */
    bolsasPorPaleta:{'3 kg':300,'1.5 kg':600}
  };
  /** Marcas que se hacen en una presentación (catálogo de la planta); sin catálogo o sin presentación, todas. */
  function marcasDe(cfg,pres){
    const pc=cfg&&cfg.producto&&PRODUCTOS[cfg.producto]&&PRODUCTOS[cfg.producto].catalogo;
    const cat=pc||(typeof PRODUCTOS_HIELO!=='undefined'?PRODUCTOS_HIELO:[]);
    const l=cat.filter(x=>x[1]===pres).map(x=>x[0]).filter(m=>cfg.marcas.includes(m));
    return l.length?l:cfg.marcas;
  }
  /* Productos de la planta de hielo (21/11/2026). CUBOS es el de siempre (sus datos y su configuración no cambian: ids «fecha_TURNO», campos de primer nivel de hieloParametros/config).
     PREMIUM y VASOS comparten las mismas colecciones: su reporte lleva «producto» y su id termina en «_PREMIUM» / «_VASOS»; su configuración va en config.productos.{PRODUCTO}.
     Datos de la planta (Excel del 16 y 20/11/2026): Premium = bolsas de 2 kg y de 1.8 kg; Vasos = 0.25 kg por vaso y 35 vasos por jaba. Todo es editable en Configuración. */
  const PRODUCTOS={
    CUBOS:{id:'CUBOS',nombre:'Hielo en cubos',corto:'Cubos',titulo:'HIELO EN CUBOS',unidad:'bolsas',una:'bolsa',presentaciones:['3 kg','1.5 kg'],pesos:{'3 kg':3.25,'1.5 kg':1.75},capacidadTurnoKg:34000,bolsasPorPaleta:{'3 kg':300,'1.5 kg':600},unidadesPorJaba:0,catalogo:null,metrica:'kg'},
    PREMIUM:{id:'PREMIUM',nombre:'Hielo premium',corto:'Premium',titulo:'HIELO PREMIUM',unidad:'bolsas',una:'bolsa',presentaciones:['2 kg','1.8 kg'],pesos:{'2 kg':2,'1.8 kg':1.8},capacidadTurnoKg:0,bolsasPorPaleta:{},unidadesPorJaba:0,
      catalogo:[['Glacial','2 kg'],["Bell's",'1.8 kg'],['Cuisine & Co','2 kg']],metrica:'kg'},
    VASOS:{id:'VASOS',nombre:'Hielo en vasos',corto:'Vasos',titulo:'HIELO VASOS',unidad:'vasos',una:'vaso',presentaciones:['Vaso'],pesos:{'Vaso':0.25},capacidadTurnoKg:0,bolsasPorPaleta:{},unidadesPorJaba:35,
      catalogo:[['Glacial','Vaso'],['OXXO','Vaso']],metrica:'unidades'}
  };
  const IDS_PRODUCTO=Object.keys(PRODUCTOS);
  /** Producto de un reporte o programación: el que trae, o CUBOS si no trae (los reportes de siempre). */
  const productoDe=r=>{const p=r&&r.producto;return PRODUCTOS[p]?p:'CUBOS';};
  const esProducto=p=>IDS_PRODUCTO.includes(p);
  const UNIDADES_MERMA=['UND','KG'];
  const num=v=>{const n=Number(String(v===undefined||v===null?'':v).replace(',','.'));return Number.isFinite(n)?n:0;};
  const texto=v=>v===undefined||v===null?'':String(v).trim();
  const esFecha=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''));
  const esHora=h=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(h||''));

  /* ------------------------------------------------------------------ núcleo puro */
  /** Número del nombre: «1.5 kg» → 1.5 · «3 kg» → 3 · sin número → 0. Sirve para validar y ordenar, no para calcular kilos. */
  function kgNominal(presentacion){const m=String(presentacion||'').replace(',','.').match(/(\d+(?:\.\d+)?)/);return m?Number(m[1]):0;}
  /* Pesos reales vigentes (los de Configuración, o los de fábrica). Se actualizan con aplicarConfigPesos() cada vez que llega la configuración. */
  const pesosDeFabrica=()=>IDS_PRODUCTO.reduce((o,id)=>Object.assign(o,PRODUCTOS[id].pesos),{});
  let PESOS_ACTIVOS=Object.assign({},DEFECTO.pesos,pesosDeFabrica());
  function aplicarConfigPesos(cfg){
    const nuevo=Object.assign({},DEFECTO.pesos,pesosDeFabrica());
    const poner=p=>{if(p&&typeof p==='object')Object.keys(p).forEach(k=>{const v=num(p[k]);if(v>0)nuevo[k]=v;});};
    poner(cfg&&cfg.pesos);                                                                        // CUBOS: campo de primer nivel (como siempre)
    if(cfg&&cfg.productos&&typeof cfg.productos==='object')IDS_PRODUCTO.forEach(id=>poner(cfg.productos[id]&&cfg.productos[id].pesos));
    PESOS_ACTIVOS=nuevo;
  }
  /** Kg REALES de una bolsa de esa presentación (3 kg → 3.25, 1.5 kg → 1.75 por defecto); sin dato, el número del nombre. */
  function kgDe(presentacion){const v=PESOS_ACTIVOS[texto(presentacion)];return v>0?v:kgNominal(presentacion);}
  /** Id del reporte (o de la programación): «fecha_TURNO»; los productos nuevos agregan «_PREMIUM» / «_VASOS» (el de cubos no cambia). */
  const idReporte=(fecha,turno,producto)=>fecha+'_'+turno+(esProducto(producto)&&producto!=='CUBOS'?'_'+producto:'');
  /** Ordena las presentaciones por kg de mayor a menor (3 kg antes que 1.5 kg). */
  const ordenPres=lista=>[...new Set(lista)].sort((a,b)=>kgNominal(b)-kgNominal(a)||String(a).localeCompare(String(b)));
  /** Totales de uno o varios reportes: bolsas por presentación, bolsas, kg, paradas (min y eventos), merma por ítem+unidad. */
  function totales(reportes){
    const porPres={},porMarca=new Map(),merma=new Map();
    let bolsas=0,kg=0,paradasMin=0,paradas=0;
    (reportes||[]).forEach(r=>{
      (r&&r.produccion||[]).forEach(p=>{
        const b=Math.max(0,Math.round(num(p.bolsas)));if(!b)return;
        porPres[p.presentacion]=(porPres[p.presentacion]||0)+b;bolsas+=b;kg+=b*kgDe(p.presentacion);
        const k=p.marca+'|'+p.presentacion;porMarca.set(k,(porMarca.get(k)||0)+b);
      });
      (r&&r.paradas||[]).forEach(p=>{const m=num(p.minutos);if(m>0){paradasMin+=m;paradas++;}});
      (r&&r.mermas||[]).forEach(m=>{const c=num(m.cantidad);if(c>0){const k=m.item+'|'+(m.unidad||'UND');merma.set(k,(merma.get(k)||0)+c);}});
    });
    return {porPres,bolsas,kg:Math.round(kg*100)/100,paradasMin,paradas,
      porMarca:[...porMarca.entries()].map(([k,b])=>{const [marca,presentacion]=k.split('|');return {marca,presentacion,bolsas:b};}),
      merma:[...merma.entries()].map(([k,c])=>{const [item,unidad]=k.split('|');return {item,unidad,cantidad:Math.round(c*1000)/1000};})};
  }
  /** Programado (bolsas) de una o varias programaciones, por marca+presentación y total. */
  function programado(programas){
    const m=new Map();let total=0;
    (programas||[]).forEach(p=>(p&&p.items||[]).forEach(i=>{const b=Math.max(0,Math.round(num(i.bolsas)));if(!b)return;const k=i.marca+'|'+i.presentacion;m.set(k,(m.get(k)||0)+b);total+=b;}));
    return {total,porMarca:m};
  }
  /** Filas «programado vs producido» por marca y presentación (incluye lo producido sin programar y lo programado sin producir). */
  function avance(reportes,programas){
    const t=totales(reportes),p=programado(programas);
    const claves=new Set([...p.porMarca.keys(),...t.porMarca.map(x=>x.marca+'|'+x.presentacion)]);
    const filas=[...claves].map(k=>{const [marca,presentacion]=k.split('|');const prod=(t.porMarca.find(x=>x.marca===marca&&x.presentacion===presentacion)||{}).bolsas||0;const prog=p.porMarca.get(k)||0;
      return {marca,presentacion,programado:prog,producido:prod,pct:prog>0?prod/prog:null};})
      .sort((a,b)=>kgDe(b.presentacion)-kgDe(a.presentacion)||a.marca.localeCompare(b.marca,'es'));
    return {filas,programado:p.total,producido:t.bolsas,cumplimiento:p.total>0?t.bolsas/p.total:null};
  }
  /** Errores que impiden FINALIZAR (guardar el borrador siempre se puede). */
  function validarFinalizar(r,config){
    const e=[];const cfg=Object.assign({},DEFECTO,config||{});
    if(!r||!esFecha(r.fecha))e.push('Falta la fecha.');
    if(!r||!TURNOS.includes(r.turno))e.push('Elige el turno.');
    if(r&&r.horaInicio&&!esHora(r.horaInicio))e.push('Hora de inicio no válida (HH:MM).');
    if(r&&r.horaFin&&!esHora(r.horaFin))e.push('Hora de fin no válida (HH:MM).');
    const prod=(r&&r.produccion||[]).filter(p=>num(p.bolsas)>0);
    if(!prod.length)e.push('Registra al menos una producción con bolsas.');
    (r&&r.produccion||[]).forEach((p,i)=>{
      if(num(p.bolsas)<0||!Number.isInteger(num(p.bolsas)))e.push(`Producción ${i+1}: las bolsas deben ser un número entero.`);
      if(num(p.bolsas)>0&&(!p.marca||!p.presentacion))e.push(`Producción ${i+1}: elige marca y presentación.`);
      if(num(p.bolsas)>0&&!(kgDe(p.presentacion)>0))e.push(`Producción ${i+1}: la presentación «${p.presentacion}» no tiene kg.`);
    });
    (r&&r.paradas||[]).forEach((p,i)=>{
      if(!(num(p.minutos)>0))e.push(`Parada ${i+1}: indica los minutos.`);
      if(!p.motivo)e.push(`Parada ${i+1}: elige el motivo.`);
      if(cfg.equipos.length&&!p.equipo)e.push(`Parada ${i+1}: elige el equipo.`);
      if(p.inicio&&!esHora(p.inicio))e.push(`Parada ${i+1}: hora no válida (HH:MM).`);
      if(p.motivo==='Otros'&&texto(p.nota).length<5)e.push(`Parada ${i+1}: con «Otros» describe la parada (mínimo 5 caracteres).`);
    });
    (r&&r.mermas||[]).forEach((m,i)=>{if(!(num(m.cantidad)>0))e.push(`Merma ${i+1}: indica la cantidad.`);if(!m.item)e.push(`Merma ${i+1}: elige el ítem.`);});
    (r&&r.produccion||[]).forEach((p,i)=>{
      if(texto(p.horas)!==''&&(!(num(p.horas)>=0)||num(p.horas)>24))e.push(`Producción ${i+1}: el tiempo (h) debe estar entre 0 y 24.`);
      if(texto(p.vence)!==''&&!esFecha(p.vence))e.push(`Producción ${i+1}: la fecha de vencimiento no es válida.`);
    });
    if(r&&texto(r.personas)!==''&&(!Number.isInteger(num(r.personas))||num(r.personas)<0||num(r.personas)>200))e.push('El número de personas debe ser un entero entre 0 y 200.');
    return e;
  }
  /** Documento a guardar (limpio): versión +1, historial y autor. accion: GUARDAR | FINALIZAR | REABRIR. */
  function planGuardar({previo,r,accion,usuario,uid,en,motivo}){
    const ahora=Number(en)||Date.now();
    const limpiar=lista=>(lista||[]).map(x=>Object.assign({},x));
    const estado=accion==='FINALIZAR'?'FINALIZADO':accion==='REABRIR'?'EN_REGISTRO':(previo&&previo.estado)||'EN_REGISTRO';
    const prod=productoDe(r);
    const doc=Object.assign({id:idReporte(r.fecha,r.turno,prod),fecha:r.fecha,turno:r.turno},prod==='CUBOS'?{}:{producto:prod},{estado,
      supervisor:texto(r.supervisor||usuario).slice(0,80),horaInicio:texto(r.horaInicio),horaFin:texto(r.horaFin),
      produccion:limpiar(r.produccion).map(p=>Object.assign({marca:texto(p.marca),presentacion:texto(p.presentacion),estacion:texto(p.estacion).slice(0,40),lote:texto(p.lote).slice(0,40),bolsas:Math.max(0,Math.round(num(p.bolsas)))},
        texto(p.horas)!==''&&num(p.horas)>=0?{horas:Math.round(Math.min(24,num(p.horas))*100)/100}:{},esFecha(p.vence)?{vence:p.vence}:{})),
      paradas:limpiar(r.paradas).map(p=>({inicio:texto(p.inicio),equipo:texto(p.equipo),motivo:texto(p.motivo),minutos:Math.max(0,Math.round(num(p.minutos))),nota:texto(p.nota).slice(0,200)})),
      mermas:limpiar(r.mermas).map(m=>({item:texto(m.item),cantidad:Math.max(0,num(m.cantidad)),unidad:UNIDADES_MERMA.includes(m.unidad)?m.unidad:'UND'})),
      observaciones:texto(r.observaciones).slice(0,500),caidas:!!r.caidas,
      personas:texto(r.personas)!==''&&Number.isInteger(num(r.personas))&&num(r.personas)>=0?Math.min(200,num(r.personas)):null,
      personal:(Array.isArray(r.personal)?r.personal:String(r.personal||'').split('\n')).map(x=>texto(x).slice(0,60)).filter(Boolean).slice(0,20),
      rev:(Number(previo&&previo.rev)||0)+1,
      historial:(previo&&Array.isArray(previo.historial)?previo.historial:[]).concat(accion==='GUARDAR'&&previo?[]:[{accion,por:texto(usuario),uid:texto(uid),en:ahora,motivo:texto(motivo).slice(0,200)}]).slice(-100),
      creadoPor:previo?previo.creadoPor:texto(usuario),creadoEn:previo?previo.creadoEn:ahora,actualizadoPor:texto(usuario),actualizadoUid:texto(uid),actualizadoEn:ahora});
    if(doc.personas===null)delete doc.personas;if(!doc.personal.length)delete doc.personal;      // los reportes sin esos datos quedan igual que siempre
    return doc;
  }
  /** Listas de Configuración: limpias, sin repetidos; las presentaciones deben tener kg. */
  function validarConfig(c,prod){
    if(esProducto(prod)&&prod!=='CUBOS')return validarConfigProducto(c,prod);
    const e=[];const lista=v=>[...new Set((v||[]).map(texto).filter(Boolean))];
    const out={marcas:lista(c.marcas),presentaciones:ordenPres(lista(c.presentaciones)),equipos:lista(c.equipos),estaciones:lista(c.estaciones),motivos:lista(c.motivos),mermas:lista(c.mermas)};
    // Kg reales por bolsa y bolsas por paleta: uno por presentación; vacío = valor de fábrica (o el número del nombre).
    const mapa=(origen,defecto,nombre,permitirDecimal)=>{
      const o={};
      out.presentaciones.forEach(pr=>{
        const crudo=origen&&origen[pr]!==undefined&&origen[pr]!==''?origen[pr]:defecto[pr];
        if(crudo===undefined)return;
        const v=num(crudo);
        if(!(v>0)||v>100000||(!permitirDecimal&&!Number.isInteger(v)))e.push(`${nombre} de «${pr}» debe ser un número ${permitirDecimal?'mayor que 0':'entero mayor que 0'}.`);
        else o[pr]=Math.round(v*1000)/1000;
      });
      return o;
    };
    out.pesos=mapa(c.pesos,DEFECTO.pesos,'Los kg reales por bolsa',true);
    out.bolsasPorPaleta=mapa(c.bolsasPorPaleta,DEFECTO.bolsasPorPaleta,'Las bolsas por paleta',false);
    const cap=c.capacidadTurnoKg===undefined||c.capacidadTurnoKg===''?DEFECTO.capacidadTurnoKg:num(c.capacidadTurnoKg);
    if(!(cap>0)||cap>10000000)e.push('La capacidad por turno debe ser un número de kg mayor que 0.');
    out.capacidadTurnoKg=cap;
    if(!out.marcas.length)e.push('Agrega al menos una marca.');
    if(!out.presentaciones.length)e.push('Agrega al menos una presentación.');
    out.presentaciones.forEach(p=>{if(!kgNominal(p))e.push(`La presentación «${p}» debe tener los kg (por ejemplo «3 kg»).`);});
    if(!out.motivos.length)e.push('Agrega al menos un motivo de parada.');
    return {errores:e,config:out};
  }
  /** Configuración de un producto nuevo (Premium, Vasos): listas compartidas (estaciones, equipos, motivos, mermas) + la parte del producto (marcas, presentaciones, pesos, capacidad, vasos por jaba). */
  function validarConfigProducto(c,prod){
    const P=PRODUCTOS[prod],e=[];const lista=v=>[...new Set((v||[]).map(texto).filter(Boolean))];
    const compartidas={estaciones:lista(c.estaciones),equipos:lista(c.equipos),motivos:lista(c.motivos),mermas:lista(c.mermas)};
    if(!compartidas.motivos.length)e.push('Agrega al menos un motivo de parada.');
    const producto={marcas:lista(c.marcas),presentaciones:ordenPres(lista(c.presentaciones))};
    if(!producto.marcas.length)e.push('Agrega al menos una marca.');
    if(!producto.presentaciones.length)e.push('Agrega al menos una presentación.');
    const pesos={};
    producto.presentaciones.forEach(pr=>{
      const crudo=c.pesos&&c.pesos[pr]!==undefined&&c.pesos[pr]!==''?c.pesos[pr]:P.pesos[pr];
      if(crudo===undefined){if(!kgNominal(pr))e.push(`La presentación «${pr}» necesita sus kg reales (o los kg en el nombre, por ejemplo «2 kg»).`);return;}
      const v=num(crudo);
      if(!(v>0)||v>100000)e.push(`Los kg reales por ${P.una} de «${pr}» deben ser un número mayor que 0.`);else pesos[pr]=Math.round(v*1000)/1000;
    });
    producto.pesos=pesos;
    const cap=c.capacidadTurnoKg===undefined||c.capacidadTurnoKg===''?P.capacidadTurnoKg:num(c.capacidadTurnoKg);
    if(!(cap>=0)||cap>10000000)e.push('La capacidad por turno debe ser un número de kg (0 si no se usa).');
    producto.capacidadTurnoKg=cap>=0?cap:0;
    if(P.unidadesPorJaba){
      const j=c.unidadesPorJaba===undefined||c.unidadesPorJaba===''?P.unidadesPorJaba:num(c.unidadesPorJaba);
      if(!(j>0)||!Number.isInteger(j)||j>100000)e.push('Los vasos por jaba deben ser un número entero mayor que 0.');else producto.unidadesPorJaba=j;
    }
    return {errores:e,config:compartidas,producto};
  }
  /** Filas para el Excel del Historial: una por producción (marca y presentación) de cada reporte. */
  function filasExcel(reportes){
    const filas=[];
    (reportes||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:a.fecha>b.fecha?1:TURNOS.indexOf(a.turno)-TURNOS.indexOf(b.turno)).forEach(r=>{
      const t=totales([r]);
      const prods=(r.produccion||[]).filter(p=>num(p.bolsas)>0);
      (prods.length?prods:[{marca:'',presentacion:'',lote:'',bolsas:0}]).forEach(p=>filas.push([r.fecha,r.turno,r.supervisor||'',p.marca,p.presentacion,p.lote||'',Math.round(num(p.bolsas)),Math.round(num(p.bolsas)*kgDe(p.presentacion)*100)/100,t.paradasMin,r.estado==='FINALIZADO'?'Finalizado':'En registro']));
    });
    return filas;
  }
    /* ---------- Avance y cierre del turno (texto para WhatsApp e imagen) ---------- */
  const f0=(n,d)=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:d===undefined?0:d});
  const fechaDmy=f=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(f||'');return m?m[3]+'/'+m[2]+'/'+m[1]:String(f||'');};
  /** Datos del avance o cierre de un conjunto de reportes (un turno, varios o todo el día). tipo = CIERRE si todos están finalizados; si no, AVANCE. */
  function modeloAvanceCierre(o){
    const rs=(o.reportes||[]).filter(Boolean),ps=(o.programas||[]).filter(Boolean),t=totales(rs),prog=programado(ps);
    const tipo=rs.length&&rs.every(r=>r.estado==='FINALIZADO')?'CIERRE':'AVANCE';
    const marcas=[...new Set(t.porMarca.map(x=>x.marca))].sort((a,b)=>a.localeCompare(b,'es')).map(m=>{
      const filas=t.porMarca.filter(x=>x.marca===m).sort((a,b)=>kgDe(b.presentacion)-kgDe(a.presentacion));
      const bolsas=filas.reduce((s,x)=>s+x.bolsas,0),kg=Math.round(filas.reduce((s,x)=>s+x.bolsas*kgDe(x.presentacion),0)*100)/100;
      return {marca:m,filas,bolsas,kg};
    });
    const PRd=PRODUCTOS[o.producto]||PRODUCTOS.CUBOS;
    const pres=ordenPres([...new Set(PRd.presentaciones.concat(Object.keys(t.porPres)))].filter(p=>PRd.presentaciones.includes(p)||t.porPres[p]>0));
    const paradas=rs.flatMap(r=>(r.paradas||[]).map(p=>Object.assign({turno:r.turno},p))).filter(p=>num(p.minutos)>0).sort((a,b)=>String(a.inicio||'').localeCompare(String(b.inicio||'')));
    const est=new Map();
    rs.forEach(r=>(r.produccion||[]).forEach(p=>{const b=Math.max(0,Math.round(num(p.bolsas)));if(!b)return;const e=texto(p.estacion),k=texto(p.marca)+'|'+texto(p.presentacion);
      if(!est.has(e))est.set(e,new Map());est.get(e).set(k,(est.get(e).get(k)||0)+b);}));
    const estaciones=[...est.entries()].map(([estacion,mp])=>({estacion,filas:[...mp.entries()].map(([k,bolsas])=>{const [marca,presentacion]=k.split('|');return {marca,presentacion,bolsas};})
      .sort((a,b)=>a.marca.localeCompare(b.marca,'es')||kgDe(b.presentacion)-kgDe(a.presentacion))})).sort((a,b)=>(a.estacion===''?1:0)-(b.estacion===''?1:0));
    const horas=rs.map(r=>r.horaInicio).filter(Boolean).sort(),fines=rs.map(r=>r.horaFin).filter(Boolean).sort();
    return {tipo,fecha:o.fecha,turnoTxt:o.turnoTxt||'',turnoCod:o.turnoCod||'',caidas:rs.some(r=>r.caidas),estaciones,hora:o.hora||'',generadoPor:o.generadoPor||'',reportes:rs.length,
      producto:PRd.id,unidad:PRd.unidad,jabas:PRd.unidadesPorJaba?Math.round(t.bolsas/PRd.unidadesPorJaba*100)/100:null,
      titulo:(tipo==='CIERRE'?'CIERRE':'AVANCE')+' DE PRODUCCIÓN HIELO'+(PRd.id==='CUBOS'?'':' '+PRd.corto.toUpperCase()),
      presentaciones:pres.map(p=>({presentacion:p,bolsas:t.porPres[p]||0,kg:Math.round((t.porPres[p]||0)*kgDe(p)*100)/100})),marcas,
      bolsas:t.bolsas,kg:t.kg,programado:prog.total,cumplimiento:prog.total>0?t.bolsas/prog.total:null,paradas,paradasMin:t.paradasMin,merma:t.merma,
      observaciones:rs.filter(r=>texto(r.observaciones)).map(r=>({turno:r.turno,texto:texto(r.observaciones)})),
      supervisores:[...new Set(rs.map(r=>texto(r.supervisor)).filter(Boolean))],inicio:horas[0]||'',fin:fines.length?fines[fines.length-1]:'',
      ultimoRegistro:horaUltimoRegistro(rs)};
  }
  /** Hora (Lima, HH:MM) del último guardado entre los reportes: la mayor «actualizadoEn» (o «creadoEn»). '' si ninguno trae marca de tiempo. */
  function horaUltimoRegistro(rs){
    const ms=(rs||[]).reduce((q,r)=>Math.max(q,num(r&&r.actualizadoEn)||num(r&&r.creadoEn)),0);
    if(!(ms>0))return '';
    try{return new Date(ms).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hour12:false});}catch(_){return '';}
  }
  /** Texto para WhatsApp en el formato que usa la planta: «Avance de produccion HIELO TD», fecha DD_MM_AA, bloques por estación, totales por presentación. */
  function textoAvanceCierre(m){
    const pl=(n,d)=>String(Math.round(Number(n||0)*Math.pow(10,d===undefined?0:d))/Math.pow(10,d===undefined?0:d)).replace('.',',');
    const pk=p=>String(p||'').replace(/\s+/g,'');
    const fecha=(/^(\d{4})-(\d{2})-(\d{2})$/.exec(m.fecha||'')||[]);
    const UN=m.unidad||'bolsas',sinPres=m.producto==='VASOS';
    const out=[(m.tipo==='CIERRE'?'Cierre':'Avance')+' de produccion HIELO'+(m.producto&&m.producto!=='CUBOS'?' '+String(m.producto).charAt(0)+String(m.producto).slice(1).toLowerCase():'')+(m.turnoCod?' '+m.turnoCod:''),fecha[1]?fecha[3]+'_'+fecha[2]+'_'+fecha[1].slice(2):String(m.fecha||'')];
    if(m.hora)out.push('Hora: '+m.hora);
    if(m.ultimoRegistro)out.push('Último registro: '+m.ultimoRegistro);
    if(!m.reportes){out.push('','Todavía no hay reporte de hielo en este turno.');}
    else{
      m.estaciones.forEach(e=>{
        out.push('');
        if(e.estacion)out.push(e.estacion.toUpperCase());
        e.filas.forEach(f=>out.push(f.marca+(sinPres?'':' '+pk(f.presentacion))+': '+pl(f.bolsas)));
      });
      m.presentaciones.filter(p=>p.bolsas>0).forEach(p=>{if(sinPres)out.push('','Producción de '+UN+': '+pl(p.bolsas),'Peso aproximado: '+pl(p.kg,1)+'kg');else out.push('','Producción de '+UN+' '+pk(p.presentacion)+': '+pl(p.bolsas),'Producción de '+pk(p.presentacion)+': '+pl(p.kg,1)+'kg');});
      if(m.jabas)out.push('','Jabas: '+pl(m.jabas,2));
      if(sinPres&&m.bolsas>0)out.push('','TOTAL VASOS: '+pl(m.bolsas));
      else if(m.kg>0)out.push('','TOTAL KILOS: '+pl(m.kg,1)+'kg');          // suma de todas las presentaciones (3 kg + 1.5 kg…)
      if(m.programado>0)out.push('','Programado: '+pl(m.programado)+' '+UN+' · Cumplimiento: '+pl(m.cumplimiento*100)+' %');
      if(m.caidas)out.push('','🚨SE VIENE TRABAJANDO POR CAÍDAS');
      const obs=m.observaciones.map(x=>x.texto).concat(m.paradas.map(p=>[p.equipo,p.motivo].filter(Boolean).join(' – ')+' ('+pl(p.minutos)+' min'+(p.nota?', '+p.nota:'')+')'),m.merma.map(x=>'Merma '+x.item+': '+pl(x.cantidad,3)+' '+x.unidad));
      if(obs.length){out.push('','Observaciones');obs.forEach(x=>out.push(x));}
    }
    return out.join('\n');
  }
  const N={TURNOS,DEFECTO,PRODUCTOS,productoDe,esProducto,marcasDe,modeloAvanceCierre,textoAvanceCierre,kgDe,kgNominal,aplicarConfigPesos,idReporte,ordenPres,totales,programado,avance,validarFinalizar,planGuardar,validarConfig,filasExcel};
  if(typeof module!=='undefined'&&module.exports)module.exports=N;
  if(typeof window==='undefined')return;
  window.glacialHieloNucleo=N;

  /* ------------------------------------------------------------------ permisos (los mismos criterios que el servidor, glacial_46) */
  const usr=()=>(typeof state!=='undefined'&&state.user)||null;
  const tiene=(u,k)=>!!u&&(u.permisos==='todos'||(Array.isArray(u.permisos)&&u.permisos.includes(k)));
  const enVista=()=>!!(window.glacialVista&&window.glacialVista.activo&&window.glacialVista.activo());
  const rol=()=>String((usr()&&usr().rol)||'');
  const esAdmin=()=>rol()==='Administrador';
  /* Permisos de Hielo (21/11/2026): siete permisos finos que el Administrador da o quita en Gestión de usuarios (js/nucleo/02b-permisos-hielo.js).
     El Administrador tiene todos. Los demás: el permiso dado, o el que trae su rol de siempre (nadie pierde acceso por este cambio), salvo que se les haya quitado.
     El servidor (glacial_66) aplica las mismas reglas a lo que se escribe; ver y descargar se aplican en pantalla. */
  const HP=()=>window.glacialPermisosHielo||null;
  const pp=k=>!!usr()&&!!HP()&&HP().permitido(usr(),k);
  const puedeVer=()=>pp('hieloVer');
  const puedeRegistrar=()=>!enVista()&&pp('hielo');
  const puedeCerrar=()=>puedeRegistrar()&&pp('hieloCerrar');
  const puedeReabrir=()=>puedeRegistrar()&&(esAdmin()||pp('hieloReabrir'));
  const puedeProgramar=()=>!enVista()&&pp('programarHielo');
  const puedeConfigurar=()=>!enVista()&&pp('configurarHielo');
  const puedeExportar=()=>puedeVer()&&pp('hieloExportar');
  const sinExportar=()=>{if(puedeExportar())return false;S.msg={tipo:'error',texto:'No tienes permiso para descargar ni compartir reportes de Hielo.'};pintar();return true;};

  /* ------------------------------------------------------------------ datos */
  const C={reportes:'hieloReportes',programacion:'hieloProgramacion',parametros:'hieloParametros'};
  const DIAS=62;
  const cache={reportes:[],programacion:[],config:null,listo:{reportes:false,programacion:false,config:false},error:''};
  let cierres=[];
  const F=()=>window.GlacialFecha;
  const hoy=()=>F()?F().fechaOperativa():(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');})();
  const turnoAhora=()=>F()?F().turnoActual():'DÍA';
  const sumarDias=(f,n)=>F()?F().sumarDias(f,n):f;
  const ahora=()=>typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now();
  const yo=()=>{const u=(typeof firebase!=='undefined'&&firebase.auth&&firebase.auth().currentUser)||null;return {uid:(u&&u.uid)||'',nombre:(usr()&&(usr().nombre||usr().username))||''};};
  /** Configuración vigente de un producto (por defecto, el que se está viendo). CUBOS: la de siempre. Premium y Vasos: lo de fábrica con lo guardado en config.productos.{PRODUCTO}. */
  const config=prod=>{
    prod=esProducto(prod)?prod:(typeof S!=='undefined'&&esProducto(S.producto)?S.producto:'CUBOS');
    const raw=cache.config||{},base=Object.assign({},DEFECTO,raw);
    if(prod==='CUBOS')return Object.assign(base,{producto:'CUBOS',unidadesPorJaba:0});
    const P=PRODUCTOS[prod],ov=(raw.productos&&raw.productos[prod])||{};
    const marcasF=[...new Set(P.catalogo.map(x=>x[0]))];
    return Object.assign(base,{producto:prod,marcas:ov.marcas&&ov.marcas.length?ov.marcas:marcasF,presentaciones:ov.presentaciones&&ov.presentaciones.length?ov.presentaciones:P.presentaciones.slice(),
      pesos:Object.assign({},P.pesos,ov.pesos||{}),capacidadTurnoKg:ov.capacidadTurnoKg!==undefined?ov.capacidadTurnoKg:P.capacidadTurnoKg,bolsasPorPaleta:Object.assign({},P.bolsasPorPaleta,ov.bolsasPorPaleta||{}),
      unidadesPorJaba:ov.unidadesPorJaba!==undefined?ov.unidadesPorJaba:P.unidadesPorJaba});
  };
  function escuchar(){
    if(cierres.length||typeof db==='undefined')return;
    const desde=sumarDias(hoy(),-DIAS);cache.error='';
    const fallo=e=>{cache.error=String((e&&e.message)||e);repintar();};
    try{
      cierres.push(db.collection(C.reportes).where('fecha','>=',desde).onSnapshot(s=>{cache.reportes=s.docs.map(d=>d.data()).filter(x=>x&&x.id);cache.listo.reportes=true;repintar();},fallo));
      cierres.push(db.collection(C.programacion).where('fecha','>=',desde).onSnapshot(s=>{cache.programacion=s.docs.map(d=>d.data()).filter(x=>x&&x.id);cache.listo.programacion=true;repintar();},fallo));
      cierres.push(db.collection(C.parametros).doc('config').onSnapshot(s=>{cache.config=s.exists?s.data():null;aplicarConfigPesos(cache.config);cache.listo.config=true;repintar();},fallo));
    }catch(e){fallo(e);}
  }
  function detener(){cierres.splice(0).forEach(c=>{try{c();}catch(_){/* ya cerrada */}});cache.listo={reportes:false,programacion:false,config:false};}
  async function guardarReporte(r,accion,motivo){
    if(!puedeRegistrar())throw new Error('No tienes permiso para registrar producción de hielo.');
    if(accion==='REABRIR'&&!puedeReabrir())throw new Error('No tienes permiso para reabrir un reporte finalizado.');
    if(accion==='FINALIZAR'&&!puedeCerrar())throw new Error('No tienes permiso para finalizar reportes de hielo.');
    if(accion==='FINALIZAR'){const e=validarFinalizar(r,config());if(e.length)throw new Error(e.join(' · '));}
    const u=yo(),id=idReporte(r.fecha,r.turno),ref=db.collection(C.reportes).doc(id);
    let doc=null;
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const previo=s.exists?s.data():null;
      // Versión distinta: si la guardó ESTE mismo usuario (un guardado anterior que se completó aunque la respuesta se cortó, o dos guardados
      // seguidos con la base lenta), no es un conflicto: se guarda encima con lo que hay en pantalla. Solo otra persona provoca el conflicto.
      const propio=previo&&String(previo.actualizadoUid||'')===String(u.uid||'')&&!!u.uid;
      if(previo&&Number(previo.rev)!==Number(r.rev||0)&&!propio)throw Object.assign(new Error('Otra persona guardó este reporte mientras lo editabas. Se cargó su versión: revisa y vuelve a guardar.'),{codigo:'CONFLICTO'});
      if(!previo&&Number(r.rev||0)>0)throw Object.assign(new Error('El reporte ya no existe.'),{codigo:'CONFLICTO'});
      if(previo&&previo.estado==='FINALIZADO'&&accion!=='REABRIR'&&!esAdmin())throw new Error('El reporte está finalizado: solo se puede reabrir (quien tenga ese permiso) o lo cambia el Administrador.');
      doc=planGuardar({previo,r,accion,usuario:u.nombre,uid:u.uid,en:ahora(),motivo});
      tx.set(ref,doc);
    });
    return doc;
  }
  async function guardarProgramacion(fecha,turno,items,revEsperada,producto){
    if(!puedeProgramar())throw new Error('No tienes permiso para programar la producción de hielo.');
    const u=yo(),prod=esProducto(producto)?producto:'CUBOS',id=idReporte(fecha,turno,prod),ref=db.collection(C.programacion).doc(id);
    const limpios=(items||[]).map(i=>({marca:texto(i.marca),presentacion:texto(i.presentacion),bolsas:Math.max(0,Math.round(num(i.bolsas)))})).filter(i=>i.marca&&i.presentacion&&i.bolsas>0);
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const previo=s.exists?s.data():null;
      if(Number(previo&&previo.rev||0)!==Number(revEsperada||0))throw new Error('Otra persona cambió esta programación. Se actualizó la pantalla: vuelve a guardar.');
      tx.set(ref,Object.assign({id,fecha,turno},prod==='CUBOS'?{}:{producto:prod},{items:limpios,rev:(Number(previo&&previo.rev)||0)+1,
        historial:(previo&&previo.historial||[]).concat([{por:u.nombre,en:ahora(),bolsas:limpios.reduce((s,i)=>s+i.bolsas,0)}]).slice(-50),
        actualizadoPor:u.nombre,actualizadoUid:u.uid,actualizadoEn:ahora()}));
    });
  }
  async function guardarConfig(c,prod){
    if(!puedeConfigurar())throw new Error('No tienes permiso para cambiar la configuración de hielo.');
    const v=validarConfig(c,prod);if(v.errores.length)throw new Error(v.errores.join(' · '));
    const u=yo(),ref=db.collection(C.parametros).doc('config');
    await db.runTransaction(async tx=>{
      const s=await tx.get(ref);const previo=s.exists?s.data():null;
      if(Number(previo&&previo.rev||0)!==Number(cache.config&&cache.config.rev||0))throw new Error('Otra persona cambió la configuración. Vuelve a abrirla.');
      // Cubos: campos de primer nivel (como siempre; se conserva lo de los otros productos). Premium y Vasos: solo su parte en «productos» y las listas compartidas.
      const base=v.producto?Object.assign({},previo||{},v.config,{productos:Object.assign({},previo&&previo.productos||{},{[prod]:v.producto})}):Object.assign({},v.config,previo&&previo.productos?{productos:previo.productos}:{});
      tx.set(ref,Object.assign({id:'config'},base,{rev:(Number(previo&&previo.rev)||0)+1,
        historial:(previo&&previo.historial||[]).concat([{por:u.nombre,en:ahora()}]).slice(-50),actualizadoPor:u.nombre,actualizadoUid:u.uid,actualizadoEn:ahora()}));
    });
  }
  window.glacialHieloDatos={C,cache,alCambiar:f=>oyentes.push(f),escuchar,detener,guardarReporte,guardarProgramacion,guardarConfig,config,puedeVer,puedeRegistrar,puedeCerrar,puedeReabrir,puedeProgramar,puedeConfigurar,puedeExportar,esAdmin};

  /* ------------------------------------------------------------------ pantalla */
  const esc=s=>String(s===undefined||s===null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d)=>{const x=Number(n);if(!Number.isFinite(x))return '—';const t=String(Number(Math.abs(x).toFixed(d===undefined?0:d))).split('.');return (x<0?'−':'')+t[0].replace(/\B(?=(\d{3})+(?!\d))/g,' ')+(t[1]?','+t[1]:'');};
  const fechaTxt=f=>esFecha(f)?f.split('-').reverse().join('/'):'—';
  const S={vista:'inicio',aFecha:'',aTurno:'',fecha:'',turno:'TODOS',ed:null,msg:null,guardado:'',hDesde:'',hHasta:'',hTurno:'',hMarca:'',pFecha:'',pTurno:'',pItems:null,pRev:0,menu:false,producto:'CUBOS'};
  const cap=t=>String(t||'').charAt(0).toUpperCase()+String(t||'').slice(1);
  const PR=()=>PRODUCTOS[S.producto]||PRODUCTOS.CUBOS;       // producto que se está viendo
  /** «Bolsas de 3 kg» · para un producto con una sola presentación (Vasos): solo «Vasos». */
  const etqUnidad=p=>PR().presentaciones.length===1?cap(PR().unidad):cap(PR().unidad)+' de '+p;
  /** Texto de unidades de un conjunto de totales: «2 500 bolsas de 3 kg · 300 bolsas de 1.5 kg» (Vasos: «190 vasos»). */
  const txtUnidades=t=>{const u=PR().unidad;return PR().presentaciones.length===1?fmt(t.bolsas)+' '+u:(ordenPres(Object.keys(t.porPres)).map(p=>`${fmt(t.porPres[p])} ${u} de ${esc(p)}`).join(' · ')||'0 '+u);};
  let temporizador=null;
  function raiz(){
    let r=document.getElementById('hielo-screen');
    if(!r){r=document.createElement('div');r.id='hielo-screen';r.style.display='none';document.body.appendChild(r);}
    return r;
  }
  const visible=()=>{const r=document.getElementById('hielo-screen');return !!(r&&r.style.display!=='none');};
  /* Cambios en vivo (otro usuario o el propio guardado automático): no se redibuja mientras se escribe en un campo. */
  const oyentes=[];
  function repintar(){
    oyentes.slice().forEach(f=>{try{f();}catch(_){/* un oyente no rompe a los demás */}});          // p. ej. la tarjeta de Hielo del Inicio (98-hielo-inicio.js)
    if(!visible())return;
    const a=document.activeElement;
    if((S.vista==='registro'||S.vista==='programacion'||S.vista==='config')&&a&&raiz().contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return;
    pintar();
  }
  function estilos(){return `<style>
#hielo-screen{position:fixed;inset:0;z-index:40;background:#eaf3f9;background-image:radial-gradient(1200px 500px at 85% -10%,#d6ecf8 0,rgba(214,236,248,0) 70%);overflow:auto;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#14263a;font-size:14px;line-height:1.4}
.hl-app{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100%}
.hl-side{background:linear-gradient(180deg,#0a2745 0,#0c3358 100%);color:#d6e6f7;padding:18px 12px;display:flex;flex-direction:column;gap:2px}
.hl-marca{display:flex;align-items:center;gap:10px;margin:0 6px 18px}.hl-marca b{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#fff;font-size:20px;box-shadow:0 4px 12px rgba(14,165,233,.35)}
.hl-marca h2{font-size:15px;margin:0;color:#fff;letter-spacing:.04em}.hl-marca small{display:block;margin:1px 0 0;color:#8fc4ec;font-size:12px}
.hl-side button{display:flex;align-items:center;gap:11px;width:100%;text-align:left;border:0;background:none;color:#cfe2f5;padding:10px 12px;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;min-height:44px;transition:background .15s}
.hl-side button svg{width:19px;height:19px;flex:none;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
.hl-side button:hover{background:rgba(255,255,255,.08)}
.hl-side button.act{background:rgba(56,189,248,.18);color:#fff;box-shadow:inset 3px 0 0 #38bdf8}.hl-side button.act svg{opacity:1;stroke:#7dd3fc}
.hl-sep{border-top:1px solid rgba(255,255,255,.12);margin:12px 6px}
.hl-menu-et{display:block;margin:10px 12px 4px;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7fb4dc}
.hl-main{padding:22px 26px 64px;min-width:0;max-width:1240px}
.hl-cab{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 16px}
.hl-main h1{font-size:25px;letter-spacing:-.01em;margin:0 0 3px;color:#0b2a4a}.hl-sub{color:#587087;margin:0 0 16px}
.hl-card{background:#fff;border:1px solid #d9e7f1;border-radius:16px;padding:16px 18px;margin-bottom:14px;overflow-x:auto;min-width:0;box-shadow:0 1px 2px rgba(15,50,90,.04),0 6px 18px rgba(15,50,90,.05)}
.hl-card h3{font-size:12px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.07em;color:#3c5a75;display:flex;align-items:center;gap:8px}
.hl-card h3::before{content:"";width:4px;height:14px;border-radius:3px;background:#38bdf8}
.hl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-bottom:14px}
.hl-kpi{background:#fff;border:1px solid #d9e7f1;border-radius:16px;padding:14px 16px;box-shadow:0 1px 2px rgba(15,50,90,.04),0 6px 18px rgba(15,50,90,.05);position:relative;overflow:hidden}
.hl-kpi span{display:block;color:#587087;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.hl-kpi b{display:block;font-size:30px;line-height:1.15;margin:6px 0 4px;color:#0b2a4a;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.hl-kpi i{display:block;font-style:normal;font-size:12px;color:#587087}
.hl-kpi.hl-pres{background:linear-gradient(160deg,#fff 55%,#eaf6fd 100%)}.hl-kpi.hl-pres::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(180deg,#38bdf8,#0ea5e9)}
.hl-2{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px}.hl-2>.hl-card{margin-bottom:14px}
.hl-main table{width:100%;border-collapse:collapse}
.hl-main th,.hl-main td{text-align:left;padding:10px 10px;border-bottom:1px solid #eaf1f7;vertical-align:middle}
.hl-main th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#587087;background:#f4f9fd;font-weight:700}
.hl-main th:first-child{border-radius:8px 0 0 8px}.hl-main th:last-child{border-radius:0 8px 8px 0}
.hl-main tbody tr:last-child td{border-bottom:0}.hl-main td.n,.hl-main th.n{text-align:right;font-variant-numeric:tabular-nums}
.hl-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px}
.hl-main label{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:700;color:#587087;text-transform:uppercase;letter-spacing:.05em}
.hl-main input,.hl-main select,.hl-main textarea{font:inherit;font-size:15px;font-weight:500;text-transform:none;letter-spacing:0;padding:9px 12px;border:1px solid #cddfec;border-radius:10px;min-height:44px;width:100%;box-sizing:border-box;background:#fff;color:#14263a;transition:border-color .15s,box-shadow .15s}
.hl-main input:focus,.hl-main select:focus,.hl-main textarea:focus{outline:0;border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.18)}
.hl-main input[readonly]{background:#f1f6fa;font-weight:800;color:#0b2a4a}
.hl-main label small{text-transform:none;letter-spacing:0;font-weight:500;font-size:12px;color:#6b8197}
.hl-main label.hl-chk{flex-direction:row;align-items:center;gap:10px;margin:0 0 10px;padding:10px 12px;border:1px solid #f2c9c9;background:#fff6f6;border-radius:10px;font-size:13.5px;font-weight:700;color:#8a2a2a;text-transform:none;letter-spacing:0;cursor:pointer;min-height:44px}
.hl-main label.hl-chk input{width:22px;height:22px;min-height:0;padding:0;flex:none;accent-color:#dc2626}
.hl-btn{border:0;border-radius:10px;padding:10px 16px;min-height:44px;font:inherit;font-weight:700;cursor:pointer;background:linear-gradient(180deg,#0e86b8,#0877A6);color:#fff;box-shadow:0 2px 6px rgba(8,119,166,.28);transition:transform .1s,box-shadow .15s}
.hl-btn:hover{box-shadow:0 4px 12px rgba(8,119,166,.35)}.hl-btn:active{transform:translateY(1px)}
.hl-btn.o{background:#fff;color:#0877A6;border:1px solid #9fd0e6;box-shadow:none}.hl-btn.o:hover{background:#f1f9fd}.hl-btn.x{min-width:44px;padding:8px}
.hl-btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
.hl-pill{display:inline-block;font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;white-space:nowrap;letter-spacing:.02em}
.hl-ok{background:#dff5e7;color:#157a3b}.hl-av{background:#ffedd5;color:#b45309}.hl-gr{background:#e8eef4;color:#587087}
.hl-bar{height:10px;border-radius:999px;background:#e2edf5;overflow:hidden;min-width:90px}.hl-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#38bdf8,#0ea5e9)}
.hl-msg{border-radius:12px;padding:11px 14px;margin:0 0 14px}.hl-msg.e{background:#fdecec;color:#991b1b;border:1px solid #f5b5b5}.hl-msg.k{background:#e7f6ec;color:#15803d;border:1px solid #b7e4c7}.hl-msg.i{background:#eaf5fc;color:#0b4a6b;border:1px solid #bfdcec}
.hl-acc{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.hl-vacio{color:#587087;padding:16px;border:1px dashed #c3d8e8;border-radius:12px;text-align:center;background:#fafcfe}
.hl-filtros{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0 0 14px;padding:12px 14px;background:#fff;border:1px solid #d9e7f1;border-radius:16px;box-shadow:0 1px 2px rgba(15,50,90,.04)}
.hl-clic{cursor:pointer}.hl-clic:hover td{background:#f1f8fd}
.hl-prod{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px;padding:5px;background:#fff;border:1px solid #d9e7f1;border-radius:14px;width:fit-content;max-width:100%;box-shadow:0 1px 2px rgba(15,50,90,.04)}
.hl-prod button{border:0;background:none;padding:9px 18px;min-height:44px;border-radius:10px;font:inherit;font-weight:700;color:#3c5a75;cursor:pointer}.hl-prod button:hover{background:#eef6fb}
.hl-prod button.act{background:linear-gradient(180deg,#0e86b8,#0877A6);color:#fff;box-shadow:0 2px 6px rgba(8,119,166,.28)}
.hl-rd-graficos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px}.hl-rd-ancho{grid-column:1/-1}.hl-rd-g{min-width:0;border:1px solid #e3eaf0;border-radius:10px;overflow:hidden}
.hl-rd-t td:first-child{white-space:nowrap}.hl-rd-t td.n{text-align:right;font-variant-numeric:tabular-nums}.hl-rd-t th{font-size:11px}.hl-rd-t tr.tot td{background:#f2f2f2;border-top:2px solid #9aa7b2}
@media(max-width:700px){.hl-ed thead{display:none}.hl-ed tr{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 0;border-bottom:1px solid #e2ebf2}
 .hl-ed td{display:flex;flex-direction:column;gap:4px;border:0!important;padding:0!important}.hl-ed td[data-label]:not([data-label=""])::before{content:attr(data-label);font-size:12px;font-weight:700;color:#587087}
 .hl-ed td[data-label=""]{grid-column:1/-1;align-items:flex-end}}
.hl-top,.hl-fondo{display:none}
@media(max-width:860px){.hl-app{grid-template-columns:minmax(0,1fr)}.hl-side{flex-direction:row;gap:4px;overflow-x:auto;padding:8px;position:sticky;top:0;z-index:2}.hl-marca,.hl-sep{display:none}

 .hl-2{grid-template-columns:minmax(0,1fr)}.hl-main{padding:14px 16px 60px}.hl-main h1{font-size:22px}}
/* Teléfono (igual que el menú de Agua): barra con botón ☰ y menú lateral que se abre encima, con fondo oscuro. */
@media(max-width:700px){
#hielo-screen.hl-menu-abierto{overflow:hidden}
.hl-top{display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:30;padding:8px 12px;background:#fff;border-bottom:1px solid #d9e7f1;box-shadow:0 2px 8px rgba(15,50,90,.06)}
.hl-hamb{display:inline-flex;align-items:center;justify-content:center;flex:none;width:42px;height:42px;border:1px solid #d7e4ed;border-radius:9px;background:#f7fbfe;color:#0877A6;cursor:pointer;padding:0}
.hl-hamb svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}.hl-hamb:focus-visible{outline:2px solid #0877A6;outline-offset:2px}
.hl-top-t{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}.hl-top-t b{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#fff;font-size:16px;flex:none}
.hl-top-t strong{font-size:15px;letter-spacing:.04em;color:#033350}.hl-top-t small{color:#587087;font-size:13px;font-weight:600}.hl-top-t small::before{content:'· '}
.hl-app .hl-side{position:fixed;top:0;left:0;bottom:0;z-index:60;flex-direction:column;gap:2px;overflow-x:hidden;overflow-y:auto;width:min(320px,86vw);height:100dvh;padding:18px 12px;border-radius:0 14px 14px 0;box-shadow:12px 0 40px rgba(10,34,52,.28);transform:translateX(-110%);transition:transform .22s ease;visibility:hidden;pointer-events:none}
.hl-app.hl-abierto .hl-side{transform:translateX(0);visibility:visible;pointer-events:auto}
.hl-app .hl-marca{display:flex}.hl-app .hl-sep{display:block}
.hl-app .hl-side button{white-space:normal;width:100%}
.hl-app .hl-fondo{position:fixed;inset:0;z-index:50;width:100%;height:100%;padding:0;border:0;background:rgba(7,30,48,.48);cursor:pointer}.hl-app.hl-abierto .hl-fondo{display:block}
}
</style>`;}
  const opciones=(lista,sel,vacio)=>(vacio!==undefined?`<option value="">${esc(vacio)}</option>`:'')+lista.map(x=>`<option ${x===sel?'selected':''}>${esc(x)}</option>`).join('');
  const reportesDe=(fecha,turno)=>cache.reportes.filter(r=>productoDe(r)===S.producto&&r.fecha===fecha&&(turno==='TODOS'||r.turno===turno));
  const programasDe=(fecha,turno)=>cache.programacion.filter(p=>productoDe(p)===S.producto&&p.fecha===fecha&&(turno==='TODOS'||p.turno===turno));
  function aviso(){
    const m=S.msg?`<div class="hl-msg ${S.msg.tipo==='error'?'e':S.msg.tipo==='info'?'i':'k'}" role="${S.msg.tipo==='error'?'alert':'status'}">${esc(S.msg.texto)}</div>`:'';
    const e=cache.error?`<div class="hl-msg e" role="alert">No se pudieron leer los datos de hielo: ${esc(cache.error)}</div>`:'';
    const c=!cache.error&&!(cache.listo.reportes&&cache.listo.config)?'<div class="hl-msg i">Consultando los datos de hielo…</div>':'';
    return e+c+m;
  }
  /* ---------- Inicio ---------- */
  function vistaInicio(){
    const f=S.fecha||hoy(),t=S.turno;
    const rs=reportesDe(f,t),ps=programasDe(f,t);
    const tot=totales(rs),av=avance(rs,ps);
    const pres=ordenPres(config().presentaciones.filter(p=>PR().presentaciones.includes(p)||tot.porPres[p]||av.filas.some(x=>x.presentacion===p)).concat(Object.keys(tot.porPres)));
    const progPres=p=>av.filas.filter(x=>x.presentacion===p).reduce((s,x)=>s+x.programado,0);
    const kpisPres=pres.map(p=>`<div class="hl-kpi hl-pres"><span>${esc(etqUnidad(p))}</span><b>${fmt(tot.porPres[p]||0)}</b><i>${progPres(p)?'de '+fmt(progPres(p))+' programadas':'sin programación'} · ${fmt((tot.porPres[p]||0)*kgDe(p),1)} kg</i></div>`).join('');
    const estado=rs.length?(rs.every(r=>r.estado==='FINALIZADO')?'<span class="hl-pill hl-ok">finalizado</span>':'<span class="hl-pill hl-av">en curso</span>'):'<span class="hl-pill hl-gr">sin reporte</span>';
    const filas=av.filas.map(x=>`<tr><td>${esc(x.marca)}</td><td>${esc(x.presentacion)}</td><td class="n">${x.programado?fmt(x.programado):'—'}</td><td class="n">${fmt(x.producido)}</td><td>${x.pct===null?'<span class="hl-pill hl-gr">sin programar</span>':`<div class="hl-bar" title="${fmt(x.pct*100)} %"><i style="width:${Math.min(100,x.pct*100)}%"></i></div>`}</td></tr>`).join('');
    const paradas=rs.flatMap(r=>(r.paradas||[]).map(p=>Object.assign({turno:r.turno},p))).filter(p=>num(p.minutos)>0).sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
    const turnos=['TODOS'].concat(TURNOS).map(x=>`<option value="${x}" ${x===t?'selected':''}>${x==='TODOS'?'Todo el día':x}</option>`).join('');
    return `<h1>Inicio · ${esc(PR().nombre)}</h1><p class="hl-sub">${fechaTxt(f)} · ${t==='TODOS'?'todo el día':'turno '+esc(t)} ${estado}</p>
      <div class="hl-filtros"><label>Fecha<input type="date" value="${esc(f)}" onchange="hlSet('fecha',this.value)"></label><label>Turno<select onchange="hlSet('turno',this.value)">${turnos}</select></label></div>
      <div class="hl-kpis">${kpisPres}
        <div class="hl-kpi"><span>Kilos producidos</span><b>${fmt(tot.kg,1)} kg</b><i>${fmt(tot.bolsas)} ${PR().unidad} en total</i></div>
        <div class="hl-kpi"><span>Cumplimiento</span><b>${av.cumplimiento===null?'—':fmt(av.cumplimiento*100)+' %'}</b><i>${av.programado?fmt(av.producido)+' de '+fmt(av.programado)+' '+PR().unidad:'sin programación'}</i></div>
        <div class="hl-kpi"><span>Paradas</span><b>${fmt(tot.paradasMin)} min</b><i>${tot.paradas} evento${tot.paradas===1?'':'s'}</i></div></div>
      <div class="hl-2"><div class="hl-card"><h3>Producción por marca y presentación</h3>${filas?`<table><thead><tr><th>Marca</th><th>Presentación</th><th class="n">Programado</th><th class="n">Producido</th><th>Avance</th></tr></thead><tbody>${filas}</tbody></table>`:'<div class="hl-vacio">Sin producción ni programación.</div>'}</div>
        <div class="hl-card"><h3>Paradas</h3>${paradas.length?`<table><thead><tr><th>Hora</th><th>Turno</th><th>Equipo</th><th>Motivo</th><th class="n">Min</th></tr></thead><tbody>${paradas.map(p=>`<tr><td>${esc(p.inicio||'—')}</td><td>${esc(p.turno)}</td><td>${esc(p.equipo||'—')}</td><td>${esc(p.motivo)}${p.nota?`<br><small class="hl-sub">${esc(p.nota)}</small>`:''}</td><td class="n">${fmt(p.minutos)}</td></tr>`).join('')}</tbody></table>`:'<div class="hl-vacio">Sin paradas.</div>'}</div></div>
      <div class="hl-card"><h3>Merma</h3>${tot.merma.length?`<table><thead><tr><th>Ítem</th><th class="n">Cantidad</th></tr></thead><tbody>${tot.merma.map(m=>`<tr><td>${esc(m.item)}</td><td class="n">${fmt(m.cantidad,3)} ${esc(m.unidad)}</td></tr>`).join('')}</tbody></table>`:'<div class="hl-vacio">Sin merma registrada.</div>'}</div>`;
  }
  /* ---------- Nuevo registro ---------- */
  function abrirEdicion(fecha,turno){
    const id=idReporte(fecha,turno,S.producto),r=cache.reportes.find(x=>x.id===id);
    S.ed=r?JSON.parse(JSON.stringify(r)):{producto:S.producto,fecha,turno,estado:'EN_REGISTRO',supervisor:yo().nombre,horaInicio:'',horaFin:'',produccion:[],paradas:[],mermas:[],observaciones:'',personas:'',personal:[],rev:0};
    if(r)S.ed.producto=productoDe(r);
    if(!r){ // nuevo: una fila por lo programado de ese turno, o una vacía
      const prog=programasDe(fecha,turno).flatMap(p=>p.items||[]);
      S.ed.produccion=prog.length?prog.map(i=>({marca:i.marca,presentacion:i.presentacion,estacion:'',lote:'',bolsas:'',horas:'',vence:''})):[{marca:config().marcas[0]||'',presentacion:config().presentaciones[0]||'',estacion:'',lote:'',bolsas:'',horas:'',vence:''}];
    }
    S.guardado=r?'Guardado':'';
  }
  function vistaRegistro(){
    if(!S.ed)abrirEdicion(hoy(),turnoAhora());
    const r=S.ed,cfg=config(),fin=r.estado==='FINALIZADO';
    const bloq=fin&&!esAdmin()||!puedeRegistrar();
    const dis=bloq?'disabled':'';
    const t=totales([r]);
    const prod=r.produccion.map((p,i)=>`<tr><td data-label="Marca"><select ${dis} onchange="hlCampo('produccion',${i},'marca',this.value)">${opciones(marcasDe(cfg,p.presentacion).includes(p.marca)||!p.marca?marcasDe(cfg,p.presentacion):[p.marca].concat(marcasDe(cfg,p.presentacion)),p.marca,'— marca —')}</select></td>
      <td data-label="Presentación"><select ${dis} onchange="hlCampo('produccion',${i},'presentacion',this.value)">${opciones(cfg.presentaciones.includes(p.presentacion)||!p.presentacion?cfg.presentaciones:[p.presentacion].concat(cfg.presentaciones),p.presentacion,'—')}</select></td>
      <td data-label="Estación"><select ${dis} onchange="hlCampo('produccion',${i},'estacion',this.value)">${opciones(cfg.estaciones.includes(p.estacion)||!p.estacion?cfg.estaciones:[p.estacion].concat(cfg.estaciones),p.estacion,'— estación —')}</select></td>
      <td data-label="Lote"><input ${dis} maxlength="40" value="${esc(p.lote)}" placeholder="opcional" oninput="hlCampo('produccion',${i},'lote',this.value)" aria-label="Lote del producto"></td>
      <td data-label="Tiempo (h)"><input ${dis} type="number" min="0" max="24" step="0.25" inputmode="decimal" value="${esc(p.horas)}" placeholder="opcional" oninput="hlCampo('produccion',${i},'horas',this.value)" aria-label="Tiempo en horas"></td>
      <td data-label="Vence"><input ${dis} type="date" value="${esc(p.vence)}" onchange="hlCampo('produccion',${i},'vence',this.value)" aria-label="Fecha de vencimiento"></td>
      <td data-label="${cap(PR().unidad)}"><input ${dis} type="number" min="0" step="1" inputmode="numeric" value="${esc(p.bolsas)}" oninput="hlCampo('produccion',${i},'bolsas',this.value)" aria-label="${cap(PR().unidad)}"></td>
      <td data-label="Kilos"><input readonly tabindex="-1" id="hl-kg-${i}" value="${fmt(num(p.bolsas)*kgDe(p.presentacion),1)}" aria-label="Kilos"></td>
      <td data-label="">${bloq?'':`<button type="button" class="hl-btn o x" onclick="hlQuitar('produccion',${i})" aria-label="Quitar producción">✕</button>`}</td></tr>`).join('');
    const par=r.paradas.map((p,i)=>`<tr><td data-label="Hora"><input ${dis} type="time" value="${esc(p.inicio)}" onchange="hlCampo('paradas',${i},'inicio',this.value)" aria-label="Hora"></td>
      <td data-label="Equipo">${cfg.equipos.length?`<select ${dis} onchange="hlCampo('paradas',${i},'equipo',this.value)">${opciones(cfg.equipos,p.equipo,'— equipo —')}</select>`:'<small class="hl-sub">Sin equipos en Configuración</small>'}</td>
      <td data-label="Motivo"><select ${dis} onchange="hlCampo('paradas',${i},'motivo',this.value)">${opciones(cfg.motivos,p.motivo,'— motivo —')}</select></td>
      <td data-label="Minutos"><input ${dis} type="number" min="0" step="1" inputmode="numeric" value="${esc(p.minutos)}" oninput="hlCampo('paradas',${i},'minutos',this.value)" aria-label="Minutos"></td>
      <td data-label="Detalle"><input ${dis} maxlength="200" value="${esc(p.nota)}" placeholder="detalle" oninput="hlCampo('paradas',${i},'nota',this.value)" aria-label="Detalle"></td>
      <td data-label="">${bloq?'':`<button type="button" class="hl-btn o x" onclick="hlQuitar('paradas',${i})" aria-label="Quitar parada">✕</button>`}</td></tr>`).join('');
    const mer=r.mermas.map((m,i)=>`<tr><td data-label="Ítem"><select ${dis} onchange="hlCampo('mermas',${i},'item',this.value)">${opciones(cfg.mermas,m.item,'— ítem —')}</select></td>
      <td data-label="Cantidad"><input ${dis} type="number" min="0" step="any" inputmode="decimal" value="${esc(m.cantidad)}" oninput="hlCampo('mermas',${i},'cantidad',this.value)" aria-label="Cantidad"></td>
      <td data-label="Unidad"><select ${dis} onchange="hlCampo('mermas',${i},'unidad',this.value)">${opciones(UNIDADES_MERMA,m.unidad||'UND')}</select></td>
      <td data-label="">${bloq?'':`<button type="button" class="hl-btn o x" onclick="hlQuitar('mermas',${i})" aria-label="Quitar merma">✕</button>`}</td></tr>`).join('');
    const pres=ordenPres(Object.keys(t.porPres));
    return `<h1>${r.rev?'Reporte':'Nuevo registro'} · ${esc(PR().nombre)}</h1><p class="hl-sub">Un reporte por fecha y turno. ${fin?'<span class="hl-pill hl-ok">Finalizado</span>':'<span class="hl-pill hl-av">En registro</span>'} <span id="hl-guardado" class="hl-pill hl-gr">${esc(S.guardado||'Sin guardar')}</span></p>
      ${!puedeRegistrar()?'<div class="hl-msg i">Solo consulta: tu usuario no registra producción de hielo.</div>':''}
      <div class="hl-card"><h3>Datos del turno</h3><div class="hl-form">
        <label>Fecha<input type="date" value="${esc(r.fecha)}" onchange="hlCambiarTurno(this.value,null)"></label>
        <label>Turno<select onchange="hlCambiarTurno(null,this.value)">${opciones(TURNOS,r.turno)}</select></label>
        <label>Supervisor<input ${dis} maxlength="80" value="${esc(r.supervisor)}" oninput="hlDato('supervisor',this.value)"></label>
        <label>Hora inicio<input ${dis} type="time" value="${esc(r.horaInicio)}" onchange="hlDato('horaInicio',this.value)"></label>
        <label>Hora fin<input ${dis} type="time" value="${esc(r.horaFin)}" onchange="hlDato('horaFin',this.value)"></label>
        <label>N.º de personas<input ${dis} type="number" min="0" max="200" step="1" inputmode="numeric" value="${esc(r.personas)}" placeholder="opcional" oninput="hlDato('personas',this.value)"></label></div>
        <label style="margin-top:12px">Personal del turno <small>(un nombre por línea, opcional)</small><textarea ${dis} rows="3" maxlength="900" placeholder="Nombre y apellido" oninput="hlDato('personal',this.value)">${esc(Array.isArray(r.personal)?r.personal.join('\n'):String(r.personal||''))}</textarea></label></div>
      <div class="hl-card"><h3>Producción (${PR().unidad})</h3>
        ${prod?`<table class="hl-ed"><thead><tr><th>Marca</th><th>Presentación</th><th>Estación</th><th>Lote</th><th>Tiempo (h)</th><th>Vence</th><th>${cap(PR().unidad)}</th><th>Kilos</th><th></th></tr></thead><tbody>${prod}</tbody></table>`:'<div class="hl-vacio">Sin producción.</div>'}
        <div class="hl-acc" style="margin-top:8px">${bloq?'':'<button type="button" class="hl-btn o" onclick="hlAgregar(\'produccion\')">+ Agregar marca</button>'}
          <span class="hl-sub" id="hl-tot" style="margin:0">${txtUnidades(t)} · <b>${fmt(t.kg,1)} kg</b>${PR().unidadesPorJaba?' · '+fmt(t.bolsas/PR().unidadesPorJaba,2)+' jabas':''}</span></div></div>
      <div class="hl-2"><div class="hl-card"><h3>Paradas</h3>
        ${par?`<table class="hl-ed"><thead><tr><th>Hora</th><th>Equipo</th><th>Motivo</th><th>Min</th><th>Detalle</th><th></th></tr></thead><tbody>${par}</tbody></table>`:'<div class="hl-vacio">Sin paradas.</div>'}
        ${bloq?'':'<div class="hl-acc" style="margin-top:8px"><button type="button" class="hl-btn o" onclick="hlAgregar(\'paradas\')">+ Agregar parada</button></div>'}
        ${!cfg.equipos.length?'<p class="hl-sub" style="margin:8px 0 0">Los equipos de la planta se agregan en Configuración.</p>':''}</div>
        <div class="hl-card"><h3>Merma</h3>
        ${mer?`<table class="hl-ed"><thead><tr><th>Ítem</th><th>Cantidad</th><th>Unidad</th><th></th></tr></thead><tbody>${mer}</tbody></table>`:'<div class="hl-vacio">Sin merma.</div>'}
        ${bloq?'':'<div class="hl-acc" style="margin-top:8px"><button type="button" class="hl-btn o" onclick="hlAgregar(\'mermas\')">+ Agregar merma</button></div>'}</div></div>
      <div class="hl-card"><h3>Observaciones</h3><label class="hl-chk"><input type="checkbox" ${dis} ${r.caidas?'checked':''} onchange="hlDato('caidas',this.checked)"> 🚨 Se viene trabajando por caídas</label><textarea ${dis} rows="3" maxlength="500" oninput="hlDato('observaciones',this.value)">${esc(r.observaciones)}</textarea></div>
      <div class="hl-acc">${puedeRegistrar()&&!fin?'<button type="button" class="hl-btn o" onclick="hlGuardar(\'GUARDAR\')">Guardar</button>'+(puedeCerrar()?'<button type="button" class="hl-btn" onclick="hlGuardar(\'FINALIZAR\')">Finalizar reporte</button>':'<span class="hl-sub" style="margin:0">Tu usuario no finaliza reportes.</span>'):''}
        ${fin&&puedeReabrir()?'<button type="button" class="hl-btn o" onclick="hlReabrir()">'+(esAdmin()?'Reabrir (Administrador)':'Reabrir reporte')+'</button>':''}</div>`;
  }
  /* ---------- Historial ---------- */
  function filtradosHistorial(){
    const d=S.hDesde||sumarDias(hoy(),-13),h=S.hHasta||hoy();
    return cache.reportes.filter(r=>productoDe(r)===S.producto&&r.fecha>=d&&r.fecha<=h&&(!S.hTurno||r.turno===S.hTurno)&&(!S.hMarca||(r.produccion||[]).some(p=>p.marca===S.hMarca&&num(p.bolsas)>0)))
      .sort((a,b)=>a.fecha<b.fecha?1:a.fecha>b.fecha?-1:TURNOS.indexOf(b.turno)-TURNOS.indexOf(a.turno));
  }
  function vistaHistorial(){
    const d=S.hDesde||sumarDias(hoy(),-13),h=S.hHasta||hoy(),lista=filtradosHistorial(),cfg=config();
    const tot=totales(lista),pres=ordenPres(cfg.presentaciones.concat(Object.keys(tot.porPres))).filter(p=>tot.porPres[p]||PR().presentaciones.includes(p));
    const filas=lista.map(r=>{const t=totales([r]);return `<tr class="hl-clic" onclick="hlAbrir('${esc(r.fecha)}','${esc(r.turno)}')"><td>${fechaTxt(r.fecha)}</td><td>${esc(r.turno)}</td><td>${esc(r.supervisor)}</td>${pres.map(p=>`<td class="n">${fmt(t.porPres[p]||0)}</td>`).join('')}<td class="n">${fmt(t.kg,1)}</td><td class="n">${fmt(t.paradasMin)}</td><td>${r.estado==='FINALIZADO'?'<span class="hl-pill hl-ok">Finalizado</span>':'<span class="hl-pill hl-av">En registro</span>'}</td></tr>`;}).join('');
    return `<h1>Historial · ${esc(PR().nombre)}</h1><p class="hl-sub">Toca un reporte para abrirlo. Se guardan los últimos ${DIAS} días en pantalla.</p>
      <div class="hl-filtros"><label>Desde<input type="date" value="${esc(d)}" onchange="hlSet('hDesde',this.value)"></label><label>Hasta<input type="date" value="${esc(h)}" onchange="hlSet('hHasta',this.value)"></label>
        <label>Turno<select onchange="hlSet('hTurno',this.value)">${opciones(TURNOS,S.hTurno,'Todos')}</select></label><label>Marca<select onchange="hlSet('hMarca',this.value)">${opciones(cfg.marcas,S.hMarca,'Todas')}</select></label></div>
      <div class="hl-card"><div class="hl-acc" style="justify-content:space-between;margin-bottom:8px"><span class="hl-sub" style="margin:0">${lista.length} reporte${lista.length===1?'':'s'} · ${pres.map(p=>fmt(tot.porPres[p]||0)+' '+PR().unidad+(PR().presentaciones.length===1?'':' de '+esc(p))).join(' · ')} · ${fmt(tot.kg,1)} kg</span>
        ${puedeExportar()?`<button type="button" class="hl-btn o" onclick="hlExcel()" ${lista.length?'':'disabled'}>Descargar Excel</button>`:''}</div>
        ${filas?`<table><thead><tr><th>Fecha</th><th>Turno</th><th>Supervisor</th>${pres.map(p=>`<th class="n">${esc(etqUnidad(p))}</th>`).join('')}<th class="n">Kg</th><th class="n">Paradas (min)</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>`:'<div class="hl-vacio">Sin reportes en ese rango.</div>'}</div>`;
  }
  /* ---------- Programación ---------- */
  function vistaProgramacion(){
    const f=S.pFecha||hoy(),t=S.pTurno||'DÍA',cfg=config();
    const doc=cache.programacion.find(p=>p.id===idReporte(f,t,S.producto));
    if(S.pItems===null){S.pItems=doc?JSON.parse(JSON.stringify(doc.items||[])):[];S.pRev=doc?Number(doc.rev)||0:0;}
    const ed=puedeProgramar(),dis=ed?'':'disabled';
    const filas=S.pItems.map((i,k)=>`<tr><td data-label="Marca"><select ${dis} onchange="hlPItem(${k},'marca',this.value)">${opciones(marcasDe(cfg,i.presentacion),i.marca,'— marca —')}</select></td><td data-label="Presentación"><select ${dis} onchange="hlPItem(${k},'presentacion',this.value)">${opciones(cfg.presentaciones,i.presentacion,'—')}</select></td>
      <td data-label="${cap(PR().unidad)}"><input ${dis} type="number" min="0" step="1" inputmode="numeric" value="${esc(i.bolsas)}" oninput="hlPItem(${k},'bolsas',this.value,true)" aria-label="${cap(PR().unidad)}"></td><td data-label="">${ed?`<button type="button" class="hl-btn o x" onclick="hlPQuitar(${k})" aria-label="Quitar">✕</button>`:''}</td></tr>`).join('');
    const prox=cache.programacion.filter(p=>productoDe(p)===S.producto&&p.fecha>=hoy()).sort((a,b)=>a.fecha<b.fecha?-1:a.fecha>b.fecha?1:TURNOS.indexOf(a.turno)-TURNOS.indexOf(b.turno)).slice(0,20);
    return `<h1>Programación · ${esc(PR().nombre)}</h1><p class="hl-sub">${cap(PR().unidad)} a producir por turno, por marca y presentación.</p>
      ${!ed?'<div class="hl-msg i">Solo consulta: programan Planificación, el Jefe de Producción y el Administrador.</div>':''}
      <div class="hl-filtros"><label>Fecha<input type="date" value="${esc(f)}" onchange="hlPSel(this.value,null)"></label><label>Turno<select onchange="hlPSel(null,this.value)">${opciones(TURNOS,t)}</select></label></div>
      <div class="hl-card"><h3>${fechaTxt(f)} · ${esc(t)}</h3>${filas?`<table class="hl-ed"><thead><tr><th>Marca</th><th>Presentación</th><th>${cap(PR().unidad)}</th><th></th></tr></thead><tbody>${filas}</tbody></table>`:'<div class="hl-vacio">Sin programación.</div>'}
        ${ed?`<div class="hl-acc" style="margin-top:8px"><button type="button" class="hl-btn o" onclick="hlPAgregar()">+ Agregar</button><button type="button" class="hl-btn" onclick="hlPGuardar()">Guardar programación</button></div>`:''}</div>
      <div class="hl-card"><h3>Próximos turnos programados</h3>${prox.length?`<table><thead><tr><th>Fecha</th><th>Turno</th><th>Detalle</th><th class="n">${cap(PR().unidad)}</th></tr></thead><tbody>${prox.map(p=>`<tr class="hl-clic" onclick="hlPSel('${esc(p.fecha)}','${esc(p.turno)}')"><td>${fechaTxt(p.fecha)}</td><td>${esc(p.turno)}</td><td>${esc((p.items||[]).map(i=>i.marca+' '+i.presentacion+': '+fmt(i.bolsas)).join(' · '))}</td><td class="n">${fmt((p.items||[]).reduce((s,i)=>s+num(i.bolsas),0))}</td></tr>`).join('')}</tbody></table>`:'<div class="hl-vacio">No hay turnos programados desde hoy.</div>'}</div>`;
  }
  /* ---------- Configuración ---------- */
  function vistaConfig(){
    const P=PR(),esCubos=P.id==='CUBOS',c=config(),ed=puedeConfigurar(),dis=ed?'':'disabled';
    const area=(id,t,v,ayuda)=>`<label>${t}<textarea id="${id}" ${dis} rows="7">${esc(v.join('\n'))}</textarea><span class="hl-sub" style="font-weight:400;margin:0">${ayuda}</span></label>`;
    return `<h1>Configuración · ${esc(P.nombre)}</h1><p class="hl-sub">Una por línea. Quitar una opción no cambia los reportes ya guardados. Marcas, presentaciones y kilos son de este producto; estaciones, equipos, motivos de parada y mermas son los mismos para todos los productos de hielo.</p>
      ${!ed?'<div class="hl-msg i">Solo consulta: la cambian el Administrador y los jefes.</div>':''}
      ${!cache.config?'<div class="hl-msg i">Todavía no se guardó la configuración: se muestran las marcas y presentaciones del programa.</div>':''}
      <div class="hl-card"><div class="hl-form">${area('hl-c-marcas','Marcas',c.marcas,'')}${area('hl-c-pres','Presentaciones',c.presentaciones,P.id==='VASOS'?'Por ejemplo «Vaso».':'Con sus kg, por ejemplo «'+(esCubos?'3':'2')+' kg».')}
        ${area('hl-c-estaciones','Estaciones de producción',c.estaciones,'Para agrupar el avance (ej. Tolva manual).')}${area('hl-c-equipos','Equipos de la planta',c.equipos,'Para las paradas.')}${area('hl-c-motivos','Motivos de parada',c.motivos,'«Otros» pide describir la parada.')}${area('hl-c-mermas','Ítems de merma',c.mermas,'')}</div>
        <h3 style="margin:18px 0 6px">${esCubos?'Kilos reales, paletas y capacidad':P.unidadesPorJaba?'Peso del vaso, vasos por jaba y capacidad':'Kilos reales y capacidad'}</h3>
        <p class="hl-sub" style="margin:0 0 8px">Con esto se calculan los kilos${esCubos?', el N.º de paletas':P.unidadesPorJaba?' y el N.º de jabas':''} y la eficiencia de todos los reportes. Vacío = valor de fábrica.</p>
        <div style="overflow-x:auto"><table class="hl-ed"><thead><tr><th>Presentación</th><th>Kg reales por ${P.una}</th>${esCubos?'<th>Bolsas por paleta</th>':''}</tr></thead><tbody>${c.presentaciones.map(pr=>`<tr><td data-label="Presentación"><b>${esc(pr)}</b></td>
          <td data-label="Kg reales por ${P.una}"><input type="number" step="0.01" min="0" ${dis} data-hl-peso="${esc(pr)}" value="${esc((c.pesos&&c.pesos[pr])!==undefined?c.pesos[pr]:'')}" aria-label="Kg reales por ${P.una} de ${esc(pr)}"></td>
          ${esCubos?`<td data-label="Bolsas por paleta"><input type="number" step="1" min="1" ${dis} data-hl-paleta="${esc(pr)}" value="${esc((c.bolsasPorPaleta&&c.bolsasPorPaleta[pr])!==undefined?c.bolsasPorPaleta[pr]:'')}" aria-label="Bolsas por paleta de ${esc(pr)}"></td>`:''}</tr>`).join('')}</tbody></table></div>
        <div class="hl-form" style="margin-top:10px"><label>Capacidad de un turno (kg)<input type="number" step="100" min="${esCubos?1:0}" id="hl-c-capacidad" ${dis} value="${esc(c.capacidadTurnoKg)}"><span class="hl-sub" style="font-weight:400;margin:0">La eficiencia del reporte diario es los kg del turno ÷ esta capacidad.${esCubos?'':' Con 0 no se calcula la eficiencia.'}</span></label>
          ${P.unidadesPorJaba?`<label>Vasos por jaba<input type="number" step="1" min="1" id="hl-c-jaba" ${dis} value="${esc(c.unidadesPorJaba)}"><span class="hl-sub" style="font-weight:400;margin:0">Con esto se calcula el N.º de jabas del reporte.</span></label>`:''}</div>
        ${ed?'<div class="hl-acc" style="margin-top:10px"><button type="button" class="hl-btn" onclick="hlGuardarConfig()">Guardar configuración</button></div>':''}
        ${cache.config&&cache.config.actualizadoPor?`<p class="hl-sub" style="margin:8px 0 0">Última modificación: ${esc(cache.config.actualizadoPor)} · versión ${esc(cache.config.rev)}</p>`:''}</div>`;
  }
  /* ---------- Avance y cierre (texto para WhatsApp e imagen del turno) ---------- */
  const TURNOS_AV=[['DI','Día + Intermedio'],['DÍA','Día'],['INTERMEDIO','Intermedio'],['NOCHE','Noche'],['TODOS','Todo el día']];
  const turnosDeAv=t=>t==='TODOS'?TURNOS:t==='DI'?['DÍA','INTERMEDIO']:[t];
  function avPorDefecto(){if(!S.aFecha)S.aFecha=hoy();if(!S.aTurno)S.aTurno=turnoAhora()==='NOCHE'?'NOCHE':'DI';}
  function modeloAv(){
    avPorDefecto();const ts=turnosDeAv(S.aTurno),etq=(TURNOS_AV.find(x=>x[0]===S.aTurno)||[])[1]||S.aTurno;
    const hora=F()?F().ahoraLima(ahora()).texto.slice(-5):'';
    return N.modeloAvanceCierre({fecha:S.aFecha,turnoTxt:'Turno '+etq,turnoCod:({TODOS:'TD',DI:'D+I',DÍA:'DÍA',INTERMEDIO:'INT',NOCHE:'NOCHE'})[S.aTurno]||'',producto:S.producto,reportes:cache.reportes.filter(r=>productoDe(r)===S.producto&&r.fecha===S.aFecha&&ts.includes(r.turno)),programas:cache.programacion.filter(p=>productoDe(p)===S.producto&&p.fecha===S.aFecha&&ts.includes(p.turno)),hora,generadoPor:yo().nombre});
  }
  function vistaAvance(){
    const m=modeloAv(),texto=N.textoAvanceCierre(m);
    const pill=!m.reportes?'<span class="hl-pill hl-gr">sin reporte</span>':m.tipo==='CIERRE'?'<span class="hl-pill hl-ok">CIERRE · todos los reportes finalizados</span>':'<span class="hl-pill hl-av">AVANCE · hay reportes en registro</span>';
    return `<h1>Avance y cierre · ${esc(PR().nombre)}</h1><p class="hl-sub">Arma el texto para WhatsApp y la imagen del turno con lo registrado. ${pill}</p>
      <div class="hl-filtros"><label>Fecha<input type="date" value="${esc(S.aFecha)}" onchange="hlAvSet('aFecha',this.value)"></label>
        <label>Turno<select onchange="hlAvSet('aTurno',this.value)">${TURNOS_AV.map(([k,t])=>`<option value="${k}" ${k===S.aTurno?'selected':''}>${t}</option>`).join('')}</select></label></div>
      <div class="hl-card"><h3>Texto para WhatsApp</h3><textarea id="hl-av-texto" readonly rows="16" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.45">${esc(texto)}</textarea>
        ${puedeExportar()?'<div class="hl-acc" style="margin-top:10px"><button type="button" class="hl-btn" onclick="hlAvCopiar()">📋 Copiar texto</button><button type="button" class="hl-btn o" onclick="hlAvWsp()">📲 Abrir en WhatsApp</button><button type="button" class="hl-btn o" onclick="hlAvImagen()">🖼 Descargar imagen</button></div>':''}
        <p class="hl-sub" style="margin:10px 0 0">Se arma al momento con lo guardado: si falta algo, regístralo en «Nuevo registro» y vuelve aquí. El cierre se marca cuando todos los reportes del turno están finalizados.</p></div>`;
  }
  window.hlAvSet=(k,v)=>{S[k]=v;pintar();};
  window.hlAvCopiar=async()=>{
    if(sinExportar())return;
    const t=N.textoAvanceCierre(modeloAv());
    try{await navigator.clipboard.writeText(t);ok('Texto copiado. Pégalo en WhatsApp.');}
    catch(_){const a=document.getElementById('hl-av-texto');if(a){a.removeAttribute('readonly');a.select();try{document.execCommand('copy');ok('Texto copiado. Pégalo en WhatsApp.');}catch(e){mal('No se pudo copiar: selecciona el texto y cópialo a mano.');}a.setAttribute('readonly','');}}
  };
  window.hlAvWsp=()=>{if(sinExportar())return;window.open('https://wa.me/?text='+encodeURIComponent(N.textoAvanceCierre(modeloAv())),'_blank','noopener');};
  /** Imagen PNG del avance o cierre: encabezado, bolsas por presentación, totales, paradas y merma. */
  /** Imagen PNG con el mismo estilo que la del Avance de Agua: cabecera oscura, tarjeta por estación, resumen y pie. */
  function dibujarImagen(m){
    const W=1080,PAD=28,E=1.25,fz=v=>Math.round(v*E);
    const BLUE='#0877A6',DARK='#033350',INK='#172B3A',STEEL='#667784',MUTED='#87949D',BG='#F3F6F8',LINE='#DCE3E8',WHITE='#FFFFFF',GOOD='#2E8B57',WARN='#D89216',BAD='#C0392B';
    const pk=v=>String(v||'').replace(/\s+/g,'');
    const grupos=(m.estaciones||[]).map(e=>({titulo:e.estacion||'PRODUCCIÓN',filas:e.filas}));
    const obs=m.observaciones.map(o=>o.texto).concat(m.paradas.map(p=>[p.equipo,p.motivo].filter(Boolean).join(' – ')+' ('+f0(p.minutos)+' min'+(p.nota?', '+p.nota:'')+')'),m.merma.map(z=>'Merma '+z.item+': '+f0(z.cantidad,3)+' '+z.unidad));
    const pres=m.presentaciones.filter(p=>p.bolsas>0);
    function pintar(c,H){
      const x=c.getContext('2d');
      const rr=(cx,cy,cw,ch,r)=>{x.beginPath();x.moveTo(cx+r,cy);x.arcTo(cx+cw,cy,cx+cw,cy+ch,r);x.arcTo(cx+cw,cy+ch,cx,cy+ch,r);x.arcTo(cx,cy+ch,cx,cy,r);x.arcTo(cx,cy,cx+cw,cy,r);x.closePath();};
      const card=(cx,cy,cw,ch,fill)=>{x.fillStyle=fill||WHITE;rr(cx,cy,cw,ch,9);x.fill();x.strokeStyle=LINE;x.lineWidth=1;rr(cx,cy,cw,ch,9);x.stroke();};
      const wrap=(t,max)=>{const out=[];let row='';String(t||'').split(/\s+/).forEach(w=>{const q=row?row+' '+w:w;if(x.measureText(q).width>max&&row){out.push(row);row=w;}else row=q;});if(row)out.push(row);return out.length?out:[''];};
      x.fillStyle=BG;x.fillRect(0,0,W,H);
      x.fillStyle=DARK;x.fillRect(0,0,W,205);x.fillStyle=WHITE;
      x.font='700 '+fz(31)+'px Arial';x.fillText('GLACIAL',55,56);
      x.font='700 '+fz(34)+'px Arial';x.fillText(m.titulo||((m.tipo==='CIERRE'?'CIERRE':'AVANCE')+' DE PRODUCCIÓN HIELO'),275,62);
      x.font='700 '+fz(26)+'px Arial';x.fillText((m.turnoTxt||'').toUpperCase(),275,101);
      x.font=fz(19)+'px Arial';x.fillText('Fecha: '+fechaDmy(m.fecha),55,154);if(m.hora)x.fillText('Hora: '+m.hora,330,154);
      if(m.inicio||m.fin){x.font=fz(16)+'px Arial';x.fillStyle='#D9EAF3';x.fillText('Inicio: '+(m.inicio||'—')+(m.tipo==='CIERRE'&&m.fin?' · Término: '+m.fin:''),55,184);}
      if(m.ultimoRegistro){x.font=fz(16)+'px Arial';x.fillStyle='#D9EAF3';x.fillText('Último registro: '+m.ultimoRegistro,330,184);}
      let y=228;
      x.fillStyle=BLUE;rr(PAD,y,W-PAD*2,48,8);x.fill();x.fillStyle=WHITE;x.font='700 '+fz(22)+'px Arial';x.fillText('DETALLE DE PRODUCCIÓN POR ESTACIÓN',48,y+31);y+=64;
      if(!m.reportes){card(PAD,y,W-PAD*2,72,'#F8FBFD');x.fillStyle=STEEL;x.font='700 '+fz(17)+'px Arial';x.fillText('Todavía no hay reporte de hielo en este turno.',PAD+20,y+44);y+=90;}
      grupos.forEach(g=>{
        const h=58+16+g.filas.length*fz(34);
        card(PAD,y,W-PAD*2,h);x.fillStyle='#E8F7FE';rr(PAD,y,W-PAD*2,58,9);x.fill();
        x.fillStyle=DARK;x.font='700 '+fz(22)+'px Arial';x.fillText(g.titulo.toUpperCase(),PAD+20,y+38);
        const tot=g.filas.reduce((q,f)=>q+f.bolsas,0);x.textAlign='right';x.fillStyle=GOOD;x.font='700 '+fz(15)+'px Arial';x.fillText(f0(tot)+' '+String(m.unidad||'bolsas').toUpperCase(),W-PAD-20,y+36);x.textAlign='left';
        let cy=y+58+30;
        g.filas.forEach(f=>{x.fillStyle=INK;x.font='700 '+fz(16)+'px Arial';x.fillText(f.marca+(m.producto==='VASOS'?'':' '+pk(f.presentacion)),PAD+28,cy);x.textAlign='right';x.fillStyle=DARK;x.fillText(f0(f.bolsas)+' '+(m.unidad||'bolsas'),W-PAD-22,cy);x.textAlign='left';cy+=fz(34);});
        y+=h+18;
      });
      const filasR=Math.max(1,pres.length),hR=48+filasR*fz(62)+(m.kg>0?fz(56):0)+(m.programado>0?fz(34):0);
      card(PAD,y,W-PAD*2,hR,'#F8FBFD');x.fillStyle=BLUE;x.font='700 '+fz(17)+'px Arial';x.fillText('RESUMEN DEL AVANCE',PAD+20,y+30);
      let ry=y+30+fz(36);
      pres.forEach(p=>{x.fillStyle=DARK;x.font='700 '+fz(17)+'px Arial';x.fillText('Producción de '+(m.unidad||'bolsas')+(m.producto==='VASOS'?'':' '+pk(p.presentacion))+': '+f0(p.bolsas),PAD+20,ry);x.fillStyle=STEEL;x.font=fz(16)+'px Arial';x.fillText('Producción de '+pk(p.presentacion)+': '+f0(p.kg,1)+' kg',PAD+20,ry+fz(26));ry+=fz(62);});
      if(m.kg>0){      // total de kilos de todas las presentaciones, destacado
        x.strokeStyle=LINE;x.lineWidth=1;x.beginPath();x.moveTo(PAD+20,ry-fz(16));x.lineTo(W-PAD-20,ry-fz(16));x.stroke();
        x.fillStyle=BLUE;x.font='700 '+fz(19)+'px Arial';x.fillText('TOTAL KILOS',PAD+20,ry+fz(14));
        x.textAlign='right';x.fillStyle=DARK;x.font='700 '+fz(24)+'px Arial';x.fillText(f0(m.kg,1)+' kg',W-PAD-22,ry+fz(14));x.textAlign='left';ry+=fz(56);
      }
      if(m.programado>0){x.fillStyle=DARK;x.font='700 '+fz(17)+'px Arial';x.fillText('Programado: '+f0(m.programado)+' '+(m.unidad||'bolsas')+' · Cumplimiento: '+f0(m.cumplimiento*100)+' %',PAD+20,ry-fz(8));}
      y+=hR+18;
      if(m.caidas){const h=fz(46);x.fillStyle='#FDECEA';rr(PAD,y,W-PAD*2,h,9);x.fill();x.strokeStyle=BAD;rr(PAD,y,W-PAD*2,h,9);x.stroke();x.fillStyle=BAD;x.font='700 '+fz(17)+'px Arial';x.fillText('🚨 SE VIENE TRABAJANDO POR CAÍDAS',PAD+20,y+fz(30));y+=h+18;}
      if(obs.length){
        x.font=fz(15)+'px Arial';const filas=obs.slice(0,12).map(o=>wrap('• '+o,W-PAD*2-60).slice(0,2));
        const h=fz(40)+filas.reduce((q,f)=>q+f.length*fz(24),0)+16;
        card(PAD,y,W-PAD*2,h);x.fillStyle=BLUE;x.font='700 '+fz(15)+'px Arial';x.fillText('OBSERVACIONES',PAD+20,y+fz(28));
        let oy=y+fz(28)+fz(10);x.fillStyle=STEEL;x.font=fz(15)+'px Arial';filas.forEach(f=>f.forEach(r=>{oy+=fz(24);x.fillText(r,PAD+28,oy);}));y+=h+18;
      }
      y+=10;x.strokeStyle=LINE;x.beginPath();x.moveTo(PAD,y);x.lineTo(W-PAD,y);x.stroke();y+=36;
      x.fillStyle=STEEL;x.font=fz(15)+'px Arial';x.fillText('Generado por: '+(m.generadoPor||m.supervisores.join(', ')||'—'),PAD,y);
      x.textAlign='right';x.fillStyle=DARK;x.font='700 '+fz(18)+'px Arial';x.fillText('GLACIAL · Control de Producción',W-PAD,y);x.textAlign='left';
      return y+36;
    }
    /* primera pasada en un lienzo alto para medir; la segunda ya con el alto exacto */
    const t=document.createElement('canvas');t.width=W;t.height=4000;const H=pintar(t,4000);
    const c=document.createElement('canvas');c.width=W;c.height=H;pintar(c,H);
    return c;
  }
  /* Expuesta para el bot de WhatsApp (proyecto glacial-whatsapp › servicio-hielo.js): dibuja la MISMA imagen que «Descargar imagen», así no hay una copia que mantener. Solo lectura. */
  N.dibujarImagen=dibujarImagen;
  window.hlAvImagen=()=>{
    if(sinExportar())return;
    try{
      const m=modeloAv(),c=dibujarImagen(m);
      c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='hielo-'+m.tipo.toLowerCase()+'-'+m.fecha+'.png';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);ok('Imagen descargada.');},'image/png');
    }catch(e){mal('No se pudo generar la imagen: '+((e&&e.message)||e));}
  };
  /* ---------- Reporte diario (formato del Excel de la planta; js/hielo/99-hielo-reporte-diario.js) ---------- */
  const RD=()=>window.glacialHieloReporte||null;
  const modeloReporte=f=>RD().modelo({fecha:f,turno:S.rTurno||'AMBOS',producto:S.producto,dias:S.rDias||14,reportes:cache.reportes,cfg:config(),catalogo:PR().catalogo||(typeof PRODUCTOS_HIELO!=='undefined'?PRODUCTOS_HIELO:[])});
  function vistaReporteDiario(){
    if(!RD())return '<h1>Reporte diario</h1><div class="hl-msg e">El reporte diario no está disponible en esta versión.</div>';
    const f=S.rFecha||hoy(),m=modeloReporte(f);S._rdModelo=m;
    // Formato del Excel de la planta (11,450.25), igual que las gráficas y el archivo descargado.
    const n2=v=>Number(v||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}),n0=v=>Number(v||0).toLocaleString('es-PE',{maximumFractionDigits:0}),est={FINALIZADO:'Finalizado',EN_REGISTRO:'En registro',SIN_REPORTE:'Sin reporte'};
    const kpi=(t,v,s,c)=>`<div class="hl-kpi"${c?` style="border-top:4px solid ${c}"`:''}><span>${t}</span><b>${v}</b><i>${s}</i></div>`;
    const UN=cap(m.unidad),nm=x=>m.enUnidades?n0(x):n2(x),uM=m.unidadMetrica;       // unidad principal del reporte: kg (cubos y premium) o vasos
    const subT=t=>t.eficiencia!==null?'Eficiencia '+n2(t.eficiencia)+' %':(t.reportes?(m.enUnidades?n2(t.pesoKg)+' kg'+(t.jabas!==null?' · '+n2(t.jabas)+' jabas':''):n0(t.bolsas)+' '+m.unidad+' · '+n2(t.pesoKg)+' kg'):'Sin reporte');
    const exNom=m.extra==='paletas'?'N° paletas':m.extra==='jabas'?'N° jabas':null,valEx=c=>m.extra==='paletas'?c.paletas:c.jabas,nCol=exNom?6:5;
    const celdas=c=>`<td class="n" data-label="${UN}">${c.bolsas?n0(c.bolsas):''}</td><td class="n" data-label="Tiempo (h)">${c.horas!==null?n2(c.horas):''}</td>${exNom?`<td class="n" data-label="${exNom}">${valEx(c)!==null&&c.bolsas?n2(valEx(c)):''}</td>`:''}<td data-label="Lote">${esc(c.lote)}</td><td data-label="F. venc.">${esc(c.vence)}</td><td class="n" data-label="Peso (kg)">${c.bolsas?n2(c.pesoKg):''}</td>`;
    const v=m.vista,solo=v!=='AMBOS',T=v==='NOCHE'?m.noche:m.dia,bl=solo?[v==='NOCHE'?'n':'d']:['n','d'],nomT=v==='NOCHE'?'noche':'día';
    const filas=m.filas.map((x,i)=>`<tr><td data-label="${m.producto==='VASOS'?'Marca':'Presentación'}"><b>${i+1}</b> ${esc(x.etiqueta)}</td>${bl.map(b=>celdas(b==='n'?x.noche:x.dia)).join('')}</tr>`).join('');
    const pal=t=>m.filas.reduce((s,x)=>s+((valEx(t==='n'?x.noche:x.dia))||0),0);
    const turnoFila=(t,n)=>`<tr><td data-label="Turno"><b>${n}</b> · ${esc(t.fechaTxt)} <span class="hl-pill">${est[t.estado]}</span></td><td data-label="Ingreso">${esc(t.ingreso||'—')}</td><td data-label="Salida">${esc(t.salida||'—')}</td><td data-label="Jornada">${t.jornadaH!==null?n2(t.jornadaH)+' h':'—'}</td><td data-label="Responsable">${esc(t.supervisor||'—')}</td><td data-label="Personas">${t.personas?n0(t.personas):'—'}</td><td data-label="Personal">${esc((t.personal||[]).join(', ')||'—')}</td></tr>`;
    const tot=b=>{const t=b==='n'?m.noche:m.dia;return `<td class="n"><b>${n0(t.bolsas)}</b></td><td></td>${exNom?`<td class="n"><b>${n2(pal(b))}</b></td>`:''}<td></td><td></td><td class="n"><b>${n2(t.pesoKg)}</b></td>`;};
    const kpis=solo?`${kpi('Turno '+nomT+' · '+esc(T.fechaTxt),nm(T.kg)+' '+uM,subT(T),v==='NOCHE'?'#2a78d6':'#eb6834')}${kpi(UN,n0(T.bolsas),exNom?n2(pal(bl[0]))+' '+m.extra:'Peso '+n2(T.pesoKg)+' kg','#0a2745')}${kpi('Jornada',T.jornadaH!==null?n2(T.jornadaH)+' h':'—',esc(T.supervisor||'Sin responsable'),'#6250d6')}${kpi('Semana '+m.semanaNum,nm(m.totalSemanaKg)+' '+uM,'Solo turno '+nomT+' · '+m.semana.dias.filter(d=>d.hayDatos).length+' de 7 días','#157a3b')}`
      :`${kpi('Turno noche · '+esc(m.noche.fechaTxt),nm(m.noche.kg)+' '+uM,subT(m.noche),'#2a78d6')}${kpi('Turno día · '+esc(m.dia.fechaTxt),nm(m.dia.kg)+' '+uM,subT(m.dia),'#eb6834')}${kpi('Total del día',nm(m.totalDiaKg)+' '+uM,'Noche + día','#0a2745')}${kpi('Semana '+m.semanaNum,nm(m.totalSemanaKg)+' '+uM,m.semana.dias.filter(d=>d.hayDatos).length+' de 7 días con datos','#157a3b')}`;
    const obs=[m.noche.observaciones&&`<p><b>Noche:</b> ${esc(m.noche.observaciones).replace(/\n/g,'<br>')}</p>`,m.dia.observaciones&&`<p><b>Día:</b> ${esc(m.dia.observaciones).replace(/\n/g,'<br>')}</p>`].filter(Boolean).join('')||'<p class="hl-sub">Sin observaciones.</p>';
    return `<h1>Reporte diario de producción · ${esc(PR().nombre)}</h1><p class="hl-sub">${solo?`Solo el <b>turno ${nomT} del ${esc(fechaTxt(v==='NOCHE'?m.fNoche:f))}</b>.`:`Igual que el Excel de la planta: la <b>noche del ${esc(fechaTxt(m.fNoche))}</b> más el <b>día del ${esc(fechaTxt(f))}</b>.`} Kilos reales (${Object.keys(m.pesos).filter(k=>m.presentaciones.some(p=>p.presentacion===k)||PR().presentaciones.includes(k)).map(k=>esc(k)+' = '+esc(String(m.pesos[k]))+' kg').join(' · ')} por ${m.una}).</p>
      ${S.msg?`<div class="hl-msg ${S.msg.tipo==='ok'?'k':'e'}" role="status">${esc(S.msg.texto)}</div>`:''}
      <div class="hl-card"><div class="hl-acc" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><span style="display:flex;gap:12px;flex-wrap:wrap"><label>Reporte de<select onchange="hlRDTurno(this.value)" aria-label="Turno del reporte">${[['AMBOS','Día de producción (noche + día)'],['NOCHE','Solo turno noche'],['DIA','Solo turno día']].map(([k,t])=>`<option value="${k}" ${(S.rTurno||'AMBOS')===k?'selected':''}>${t}</option>`).join('')}</select></label>
          <label>${solo?'Fecha del turno':'Día de producción'}<input type="date" value="${esc(f)}" onchange="hlRDFecha(this.value)" aria-label="Día de producción"></label>
          <label>Período de la mezcla y el mapa<select onchange="hlRDDias(this.value)" aria-label="Período de la mezcla por marca y el mapa de calor">${[7,14,21].map(n=>`<option value="${n}" ${(S.rDias||14)===n?'selected':''}>Últimos ${n} días</option>`).join('')}</select></label></span>
        ${puedeExportar()?`<span style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="hl-btn" onclick="hlRDExcel()" ${m.hayDatos?'':'disabled'}>Descargar Excel</button><button type="button" class="hl-btn o" onclick="hlRDImagen()" ${m.hayDatos?'':'disabled'}>Descargar imagen</button><button type="button" class="hl-btn" style="background:#1fa855;border-color:#1fa855;color:#fff" onclick="hlRDCompartir('img')" ${m.hayDatos?'':'disabled'}>Compartir imagen por WhatsApp</button><button type="button" class="hl-btn" style="background:#1fa855;border-color:#1fa855;color:#fff" onclick="hlRDCompartir('xlsx')" ${m.hayDatos?'':'disabled'}>Compartir Excel por WhatsApp</button></span>`:''}</div></div>
      ${m.hayDatos?'':`<div class="hl-msg i">${solo?`No hay reporte del turno ${nomT} del ${esc(fechaTxt(v==='NOCHE'?m.fNoche:f))}.`:`No hay reportes de la noche del ${esc(fechaTxt(m.fNoche))} ni del día del ${esc(fechaTxt(f))}.`}</div>`}
      <div class="hl-kpis">${kpis}</div>
      <div class="hl-card"><h3 style="margin:0 0 8px">Reporte de personal</h3><div style="overflow-x:auto"><table class="hl-ed"><thead><tr><th>Turno</th><th>Ingreso</th><th>Salida</th><th>Jornada</th><th>Responsable</th><th>Personas</th><th>Personal</th></tr></thead><tbody>${v!=='DIA'?turnoFila(m.noche,'NOCHE'):''}${v!=='NOCHE'?turnoFila(m.dia,'DÍA'):''}</tbody></table></div></div>
      <div class="hl-card"><h3 style="margin:0 0 8px">Reporte por marca</h3><div style="overflow-x:auto"><table class="hl-ed hl-rd-t"><thead><tr><th rowspan="2">${m.producto==='VASOS'?'Marca':'Presentación'}</th>${v!=='DIA'?`<th colspan="${nCol}" style="background:#d9d9d9">NOCHE · ${esc(m.noche.fechaTxt)}</th>`:''}${v!=='NOCHE'?`<th colspan="${nCol}" style="background:#bdd7ee">DÍA · ${esc(m.dia.fechaTxt)}</th>`:''}</tr>
        <tr>${[UN,'Tiempo (h)'].concat(exNom?[exNom]:[],['Lote','F. venc.','Peso (kg)']).map(t=>`<th>${t}</th>`).join('').repeat(bl.length)}</tr></thead><tbody>${filas}
        <tr class="tot"><td><b>TOTAL</b></td>${bl.map(tot).join('')}</tr></tbody></table></div>
        <p class="hl-sub" style="margin:8px 0 0">El tiempo (h) y el vencimiento se anotan en «Nuevo registro» (opcionales: salen vacíos si no se anotan).${m.extra==='paletas'?' Paletas = bolsas ÷ bolsas por paleta (Configuración).':m.extra==='jabas'?' Jabas = vasos ÷ vasos por jaba (Configuración).':''}</p></div>
      <div class="hl-card"><div id="hl-rd-graficos" class="hl-rd-graficos"></div></div>
      <div class="hl-card"><h3 style="margin:0 0 8px">Observaciones</h3>${obs}</div>`;
  }
  /* ---------- Resumen de planta (Cubos + Premium + Vasos) ---------- */
  const modeloPl=()=>RD().modeloPlanta({fecha:S.plFecha||hoy(),reportes:cache.reportes,dias:S.rDias||14});
  function vistaPlanta(){
    if(!RD()||!RD().modeloPlanta)return '<h1>Resumen de planta</h1><div class="hl-msg e">El resumen de planta no está disponible en esta versión.</div>';
    const f=S.plFecha||hoy(),m=modeloPl();S._plModelo=m;
    const n2=v=>Number(v||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}),n0=v=>Number(v||0).toLocaleString('es-PE',{maximumFractionDigits:0});
    const kpi=(t,v,s2,c)=>`<div class="hl-kpi"${c?` style="border-top:4px solid ${c}"`:''}><span>${t}</span><b>${v}</b><i>${s2}</i></div>`;
    const COLP={CUBOS:'#2a78d6',PREMIUM:'#6250d6',VASOS:'#1fa3a3'};
    const kpis=kpi('Planta · total del día',n2(m.totalKg)+' kg','Noche '+n2(m.nocheKg)+' · Día '+n2(m.diaKg),'#0a2745')+m.productos.map(p=>kpi(esc(p.nombre),p.id==='VASOS'?n0(p.totalUnidades)+' vasos':n2(p.totalKg)+' kg',p.hayDatos?(p.id==='VASOS'?n2(p.totalKg)+' kg · '+n2(p.jabas)+' jabas':'Noche '+n2(p.noche.kg)+' · Día '+n2(p.dia.kg)):'Sin reporte',COLP[p.id])).join('');
    const filas=m.productos.map(p=>{const sem=m.semana.dias.reduce((s2,d)=>s2+d.porProd[p.id],0);const u=p.id==='VASOS'?x=>n2(x.kg)+' kg ('+n0(x.unidades)+')':x=>n2(x.kg);
      return `<tr><td data-label="Producto"><b>${esc(p.nombre)}</b></td><td class="n" data-label="Noche (kg)">${p.noche.reportes?u(p.noche):'—'}</td><td class="n" data-label="Día (kg)">${p.dia.reportes?u(p.dia):'—'}</td><td class="n" data-label="Total (kg)"><b>${n2(p.totalKg)}</b></td><td class="n" data-label="Semana (kg)">${n2(sem)}</td></tr>`;}).join('');
    const par=m.paradas.length?`<div class="hl-card"><h3>Paradas con minutos (todos los productos)</h3><table><thead><tr><th>Producto</th><th>Turno</th><th>Equipo</th><th>Motivo</th><th class="n">Min</th></tr></thead><tbody>${m.paradas.map(p=>`<tr><td>${esc(PRODUCTOS[p.producto].corto)}</td><td>${esc(p.turno)}</td><td>${esc(p.equipo||'—')}</td><td>${esc(p.motivo)}</td><td class="n">${n0(p.minutos)}</td></tr>`).join('')}</tbody></table></div>`:'';
    return `<h1>Resumen de planta · Hielo</h1><p class="hl-sub">Los tres productos juntos: la <b>noche del ${esc(fechaTxt(m.fNoche))}</b> más el <b>día del ${esc(fechaTxt(f))}</b>. Todo en kg reales (los vasos también en vasos y jabas).</p>
      ${S.msg?`<div class="hl-msg ${S.msg.tipo==='ok'?'k':'e'}" role="status">${esc(S.msg.texto)}</div>`:''}
      <div class="hl-card"><div class="hl-acc" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><span style="display:flex;gap:12px;flex-wrap:wrap"><label>Día de producción<input type="date" value="${esc(f)}" onchange="hlPlFecha(this.value)" aria-label="Día de producción del resumen de planta"></label>
          <label>Período de la mezcla<select onchange="hlRDDias(this.value)" aria-label="Período de la mezcla de la planta">${[7,14,21].map(n=>`<option value="${n}" ${(S.rDias||14)===n?'selected':''}>Últimos ${n} días</option>`).join('')}</select></label></span>
        ${puedeExportar()?`<span style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="hl-btn o" onclick="hlPlImagen()" ${m.hayDatos?'':'disabled'}>Descargar imagen</button><button type="button" class="hl-btn" style="background:#1fa855;border-color:#1fa855;color:#fff" onclick="hlPlCompartir()" ${m.hayDatos?'':'disabled'}>Compartir por WhatsApp</button></span>`:''}</div></div>
      ${m.hayDatos?'':`<div class="hl-msg i">No hay reportes de hielo de la noche del ${esc(fechaTxt(m.fNoche))} ni del día del ${esc(fechaTxt(f))}.</div>`}
      <div class="hl-kpis">${kpis}</div>
      <div class="hl-card"><h3>Producción por producto (kg reales)</h3><div style="overflow-x:auto"><table class="hl-ed hl-rd-t"><thead><tr><th>Producto</th><th class="n">Noche</th><th class="n">Día</th><th class="n">Total del día</th><th class="n">Semana ${m.semanaNum}</th></tr></thead><tbody>${filas}
        <tr class="tot"><td><b>PLANTA</b></td><td class="n"><b>${n2(m.nocheKg)}</b></td><td class="n"><b>${n2(m.diaKg)}</b></td><td class="n"><b>${n2(m.totalKg)}</b></td><td class="n"><b>${n2(m.semana.total)}</b></td></tr></tbody></table></div></div>
      <div class="hl-card"><div id="hl-pl-graficos" class="hl-rd-graficos"></div></div>${par}`;
  }
  function pintarGraficosPlanta(){
    const c=document.getElementById('hl-pl-graficos');if(!c||!RD()||!S._plModelo)return;
    try{const g=RD().graficosPlanta(S._plModelo);['semana','mezcla'].forEach(k=>{const w=document.createElement('div');w.className='hl-rd-g';w.appendChild(g[k]);c.appendChild(w);});}
    catch(e){c.innerHTML='<p class="hl-sub">No se pudieron dibujar las gráficas en este navegador.</p>';}
  }
  window.hlPlFecha=v=>{if(esFecha(v)){S.plFecha=v;S.msg=null;pintar();}};
  window.hlPlImagen=()=>{
    if(sinExportar())return;
    try{RD().imagenPlanta(modeloPl()).toBlob(b=>{if(!b)return mal('No se pudo crear la imagen.');rdBajar(b,'Resumen-planta-Hielo-'+(S.plFecha||hoy())+'.png');ok('Imagen generada.');},'image/png');}
    catch(e){mal('No se pudo generar la imagen: '+((e&&e.message)||e));}
  };
  window.hlPlCompartir=()=>{
    if(sinExportar())return;
    try{
      const m=modeloPl(),texto=RD().resumenTextoPlanta(m),nombre='Resumen-planta-Hielo-'+(S.plFecha||hoy())+'.png';
      RD().imagenPlanta(m).toBlob(async b=>{
        try{
          if(!b)throw new Error('No se pudo crear la imagen.');
          const archivo=new File([b],nombre,{type:'image/png'}),movil=/Android|iPhone|iPad|iPod/i.test(String(navigator.userAgent||''));
          if(movil&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[archivo]})){
            try{await navigator.share({files:[archivo],text:texto,title:'Resumen de planta de Hielo'});ok('Elige WhatsApp en el menú para enviarlo.');return;}catch(e){if(e&&e.name==='AbortError')return;}
          }
          rdBajar(b,nombre);const w=window.open('https://wa.me/?text='+encodeURIComponent(texto),'_blank','noopener');
          ok(w===null?'Se descargó '+nombre+'. Abre WhatsApp y adjúntalo en el chat.':'Se descargó '+nombre+' y se abrió WhatsApp con el resumen: adjunta el archivo en el chat.');
        }catch(e){mal('No se pudo preparar el envío por WhatsApp: '+((e&&e.message)||e));}
      },'image/png');
    }catch(e){mal('No se pudo preparar el envío por WhatsApp: '+((e&&e.message)||e));}
  };
  function pintarGraficosReporte(){
    const c=document.getElementById('hl-rd-graficos');if(!c||!RD()||!S._rdModelo)return;
    try{const g=RD().graficos(S._rdModelo);['capacidad','presentacion','semana','paradas','control','marcas','mapa'].forEach(k=>{const w=document.createElement('div');w.className='hl-rd-g'+(k==='mapa'?' hl-rd-ancho':'');w.appendChild(g[k]);c.appendChild(w);});}
    catch(e){c.innerHTML='<p class="hl-sub">No se pudieron dibujar las gráficas en este navegador.</p>';}
  }
  window.hlRDTurno=v=>{S.rTurno=v==='NOCHE'||v==='DIA'?v:'AMBOS';S.msg=null;pintar();};
  window.hlRDDias=v=>{S.rDias=[7,14,21].includes(Number(v))?Number(v):14;pintar();};
  window.hlRDFecha=v=>{if(esFecha(v)){S.rFecha=v;S.msg=null;pintar();}};
  const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const nombreRD=(f,ext)=>'Reporte-diario-Hielo'+(S.producto==='CUBOS'?'':'-'+S.producto.toLowerCase())+'-'+f+(S.rTurno==='NOCHE'?'-noche':S.rTurno==='DIA'?'-dia':'')+'.'+ext;
  const rdBlobImagen=f=>new Promise((res,rej)=>{RD().imagen(modeloReporte(f)).toBlob(b=>b?res(b):rej(new Error('No se pudo crear la imagen.')),'image/png');});
  async function rdBlobExcel(f){
    const m=modeloReporte(f);
    const ExcelJS=typeof cargarScriptExterno==='function'?await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS'):window.ExcelJS;
    if(!ExcelJS)throw new Error('No se pudo cargar la librería de Excel.');
    const g=RD().graficos(m),imgs={};g.mapa=RD().graficoMapa(m,1200);Object.keys(g).forEach(k=>{imgs[k]={data:g[k].toDataURL('image/png').split(',')[1],w:g[k].width/2,h:g[k].height/2};});
    const buf=await RD().construirExcel(ExcelJS,m,imgs).xlsx.writeBuffer();return new Blob([buf],{type:XLSX_MIME});
  }
  function rdBajar(blob,nombre){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nombre;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
  window.hlRDExcel=async()=>{
    if(sinExportar())return;
    try{const f=S.rFecha||hoy();rdBajar(await rdBlobExcel(f),nombreRD(f,'xlsx'));ok('Excel generado.');}
    catch(e){mal('No se pudo generar el Excel: '+((e&&e.message)||e));}
  };
  window.hlRDImagen=async()=>{
    if(sinExportar())return;
    try{const f=S.rFecha||hoy();rdBajar(await rdBlobImagen(f),nombreRD(f,'png'));ok('Imagen generada.');}
    catch(e){mal('No se pudo generar la imagen: '+((e&&e.message)||e));}
  };
  /* Compartir por WhatsApp. En el celular abre el menú de compartir del teléfono con el archivo (se elige WhatsApp y el chat).
     En el computador (o si el menú no está disponible) descarga el archivo y abre WhatsApp con el resumen para que se adjunte. */
  window.hlRDCompartir=async tipo=>{
    if(sinExportar())return;
    try{
      const f=S.rFecha||hoy(),img=tipo!=='xlsx',nombre=nombreRD(f,img?'png':'xlsx'),texto=RD().resumenTexto(modeloReporte(f));
      const blob=img?await rdBlobImagen(f):await rdBlobExcel(f),archivo=new File([blob],nombre,{type:blob.type||(img?'image/png':XLSX_MIME)});
      const movil=/Android|iPhone|iPad|iPod/i.test(String(navigator.userAgent||''));
      if(movil&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[archivo]})){
        try{await navigator.share({files:[archivo],text:texto,title:'Reporte diario de Hielo'});ok('Elige WhatsApp en el menú para enviarlo.');return;}
        catch(e){if(e&&e.name==='AbortError')return;}   // si el menú falla, se descarga
      }
      rdBajar(blob,nombre);
      const w=window.open('https://wa.me/?text='+encodeURIComponent(texto),'_blank','noopener');
      ok(w===null?'Se descargó '+nombre+'. Abre WhatsApp y adjúntalo en el chat.':'Se descargó '+nombre+' y se abrió WhatsApp con el resumen: adjunta el archivo en el chat.');
    }catch(e){mal('No se pudo preparar el envío por WhatsApp: '+((e&&e.message)||e));}
  };
  /** Selector de producto (Cubos · Premium · Vasos): todas las pantallas muestran el producto elegido. */
  function selectorProducto(){
    return `<div class="hl-prod" role="group" aria-label="Producto de hielo">${IDS_PRODUCTO.map(id=>`<button type="button" class="${S.producto===id?'act':''}" aria-pressed="${S.producto===id}" onclick="hlProducto('${id}')">${esc(PRODUCTOS[id].nombre)}</button>`).join('')}</div>`;
  }
  function pintar(){
    const r=raiz();
    const MENU=[['inicio','Inicio'],['registro','Nuevo registro'],['avance','Avance y cierre'],['reporte','Reporte diario'],['planta','Resumen de planta'],['historial','Historial'],['programacion','Programación'],['config','Configuración']];
    const GRUPOS=[['Día a día',['inicio','registro','avance']],['Reportes',['reporte','planta','historial']],['Gestión',['programacion','config']]];
    const cuerpo={inicio:vistaInicio,registro:vistaRegistro,avance:vistaAvance,reporte:vistaReporteDiario,planta:vistaPlanta,historial:vistaHistorial,programacion:vistaProgramacion,config:vistaConfig}[S.vista]||vistaInicio;
    const y=r.scrollTop;
    const IC={producto:'<path d="M4 8l8-4 8 4-8 4-8-4Z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>',planta:'<path d="M4 20V9M10 20V4M16 20v-8M22 20H2"/><path d="M3 7l5-4 5 3 7-4"/>',reporte:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',inicio:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',registro:'<path d="M12 5v14M5 12h14"/>',avance:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',historial:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',programacion:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',config:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',volver:'<path d="M15 6l-6 6 6 6"/>'};
    const ico=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]||''}</svg>`;
    const titulo=(MENU.find(x=>x[0]===S.vista)||MENU[0])[1];
    r.classList.toggle('hl-menu-abierto',!!S.menu);
    r.innerHTML=`${estilos()}<div class="hl-app${S.menu?' hl-abierto':''}"><header class="hl-top"><button type="button" class="hl-hamb" aria-label="${S.menu?'Cerrar':'Abrir'} menú de Hielo" aria-controls="hl-menu" aria-expanded="${S.menu?'true':'false'}" onclick="hlMenu()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><div class="hl-top-t"><b aria-hidden="true">❄</b><strong>GLACIAL · HIELO</strong><small>${esc(titulo)}</small></div></header>
      <button type="button" class="hl-fondo" aria-label="Cerrar menú" tabindex="-1" onclick="hlMenu(false)"></button><nav class="hl-side" id="hl-menu" aria-label="Menú de Hielo"><div class="hl-marca"><b aria-hidden="true">❄</b><div><h2>GLACIAL · HIELO</h2><small>Reporte Hielo</small></div></div>
      ${GRUPOS.map(([et,ks],g)=>`${g?'<div class="hl-sep"></div>':''}<small class="hl-menu-et">${et}</small>${ks.map(k=>`<button type="button" class="${S.vista===k?'act':''}" ${S.vista===k?'aria-current="page"':''} onclick="hlVista('${k}')">${ico(k)}<span>${(MENU.find(x=>x[0]===k)||[])[1]}</span></button>`).join('')}`).join('')}
      <div class="hl-sep"></div><button type="button" onclick="hlSalir()">${ico('volver')}<span>Volver a Reporte Agua</span></button></nav>
      <main class="hl-main">${S.vista==='planta'?'':selectorProducto()}${aviso()}${cuerpo()}</main></div>`;
    r.scrollTop=y;
    if(S.vista==='reporte')pintarGraficosReporte();
    if(S.vista==='planta')pintarGraficosPlanta();
  }
  /* ---------- acciones ---------- */
  const ok=t=>{S.msg={tipo:'ok',texto:t};pintar();};
  const mal=e=>{S.msg={tipo:'error',texto:String(e&&e.message||e)};pintar();};
  window.hlMenu=abrir=>{S.menu=abrir===undefined?!S.menu:!!abrir;pintar();if(S.menu)setTimeout(()=>{const b=document.querySelector('#hl-menu button');if(b)b.focus();},30);else{const h=document.querySelector('.hl-hamb');if(h)h.focus();}};
  if(typeof document.addEventListener==='function')document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.menu&&visible())window.hlMenu(false);});
  window.hlVista=v=>{S.vista=v;S.menu=false;S.msg=null;if(v==='programacion')S.pItems=null;pintar();};
  window.hlSet=(k,v)=>{S[k]=v;S.msg=null;pintar();};
  window.hlProducto=id=>{
    if(!esProducto(id))return;
    if(id===S.producto){if(S.vista==='planta'){S.vista='inicio';S.menu=false;pintar();}else if(S.menu){S.menu=false;pintar();}return;}
    if(S.vista==='planta')S.vista='inicio';S.menu=false;
    if(temporizador){clearTimeout(temporizador);temporizador=null;if(S.ed&&puedeRegistrar()&&S.ed.estado!=='FINALIZADO')window.hlGuardar('GUARDAR',true);}   // lo que se estaba escribiendo se guarda antes de cambiar
    S.producto=id;S.ed=null;S.pItems=null;S.msg=null;S.hMarca='';
    try{localStorage.setItem('glacial-hielo-producto',id);}catch(_){/* sin almacenamiento: vale para esta sesión */}
    pintar();
  };
  window.hlAbrir=(f,t)=>{abrirEdicion(f,t);S.vista='registro';S.msg=null;pintar();};
  window.hlCambiarTurno=(f,t)=>{
    if(S.ed&&temporizador){clearTimeout(temporizador);temporizador=null;}
    abrirEdicion(f||S.ed.fecha,t||S.ed.turno);S.msg=null;pintar();
  };
  function cambio(rehacer){
    S.guardado='Cambios sin guardar';const g=document.getElementById('hl-guardado');if(g)g.textContent=S.guardado;
    if(rehacer)pintar();else actualizarTotales();
    // guardado automático del borrador (no finaliza)
    if(puedeRegistrar()&&S.ed&&S.ed.estado!=='FINALIZADO'){clearTimeout(temporizador);temporizador=setTimeout(()=>{temporizador=null;window.hlGuardar('GUARDAR',true);},2500);}
  }
  function actualizarTotales(){
    const r=S.ed;if(!r)return;const t=totales([r]);
    r.produccion.forEach((p,i)=>{const e=document.getElementById('hl-kg-'+i);if(e)e.value=fmt(num(p.bolsas)*kgDe(p.presentacion),1);});
    const e=document.getElementById('hl-tot');if(e)e.innerHTML=txtUnidades(t)+` · <b>${fmt(t.kg,1)} kg</b>`+(PR().unidadesPorJaba?' · '+fmt(t.bolsas/PR().unidadesPorJaba,2)+' jabas':'');
  }
  window.hlDato=(k,v)=>{if(!S.ed)return;S.ed[k]=v;cambio(false);};
  window.hlCampo=(lista,i,k,v)=>{if(!S.ed||!S.ed[lista][i])return;S.ed[lista][i][k]=v;if(lista==='produccion'&&k==='presentacion'&&S.ed[lista][i].marca&&!marcasDe(config(),v).includes(S.ed[lista][i].marca))S.ed[lista][i].marca='';cambio(k==='presentacion'||k==='motivo');};
  window.hlAgregar=lista=>{if(!S.ed)return;const c=config();
    S.ed[lista].push(lista==='produccion'?{marca:'',presentacion:c.presentaciones[0]||'',estacion:'',lote:'',bolsas:'',horas:'',vence:''}:lista==='paradas'?{inicio:'',equipo:'',motivo:'',minutos:'',nota:''}:{item:c.mermas[0]||'',cantidad:'',unidad:'UND'});cambio(true);};
  window.hlQuitar=(lista,i)=>{if(!S.ed)return;S.ed[lista].splice(i,1);cambio(true);};
  /* Los guardados van DE A UNO: con la base lenta, un guardado automático podía salir mientras el anterior seguía en curso, con la versión
     vieja, y chocar consigo mismo («cambió mientras se guardaba», 10 y 11/11/2026). Si hay uno en curso, el automático queda pendiente y
     sale al terminar; Guardar / Finalizar esperan a que termine. */
  let guardandoAhora=null,repetirAuto=false;
  window.hlGuardar=async(accion,auto)=>{
    if(!S.ed)return;
    if(accion!=='GUARDAR'&&temporizador){clearTimeout(temporizador);temporizador=null;}
    if(guardandoAhora){
      if(auto){repetirAuto=true;return;}
      try{await guardandoAhora;}catch(_){/* el anterior ya informó su error */}
    }
    let fin;guardandoAhora=new Promise(res=>{fin=res;});
    try{
      const doc=await guardarReporte(S.ed,accion);
      const enPantalla=S.ed;
      if(enPantalla&&enPantalla.fecha===doc.fecha&&enPantalla.turno===doc.turno){enPantalla.rev=doc.rev;enPantalla.estado=doc.estado;enPantalla.historial=doc.historial;}
      const h=new Date(doc.actualizadoEn);S.guardado='Guardado '+String(h.getHours()).padStart(2,'0')+':'+String(h.getMinutes()).padStart(2,'0');
      if(auto){const g=document.getElementById('hl-guardado');if(g)g.textContent=S.guardado;return;}
      ok(accion==='FINALIZAR'?'Reporte finalizado.':'Reporte guardado.');
    }catch(e){
      if(e&&e.codigo==='CONFLICTO'&&S.ed){abrirEdicion(S.ed.fecha,S.ed.turno);}
      if(auto){S.guardado='No se guardó: '+String(e&&e.message||e);const g=document.getElementById('hl-guardado');if(g)g.textContent=S.guardado;if(e&&e.codigo==='CONFLICTO')mal(e);return;}
      mal(e);
    }finally{
      guardandoAhora=null;fin();
      // cambios hechos mientras se guardaba: un guardado automático más, ya con la versión nueva
      if(repetirAuto){repetirAuto=false;if(S.ed&&S.ed.estado!=='FINALIZADO'&&puedeRegistrar())setTimeout(()=>window.hlGuardar('GUARDAR',true),0);}
    }
  };
  window.hlReabrir=async()=>{
    const m=typeof prompt==='function'?prompt('Motivo para reabrir el reporte (mínimo 5 caracteres):'):'';
    if(m===null)return;if(String(m||'').trim().length<5)return mal('Escribe el motivo (mínimo 5 caracteres).');
    try{const doc=await guardarReporte(S.ed,'REABRIR',m);S.ed.rev=doc.rev;S.ed.estado=doc.estado;ok('Reporte reabierto.');}catch(e){mal(e);}
  };
  window.hlPSel=(f,t)=>{S.pFecha=f||S.pFecha||hoy();S.pTurno=t||S.pTurno||'DÍA';S.pItems=null;S.vista='programacion';S.msg=null;pintar();};
  window.hlPItem=(k,campo,v,sinPintar)=>{if(!S.pItems||!S.pItems[k])return;S.pItems[k][campo]=v;if(campo==='presentacion'&&S.pItems[k].marca&&!marcasDe(config(),v).includes(S.pItems[k].marca))S.pItems[k].marca='';if(!sinPintar)pintar();};
  window.hlPAgregar=()=>{const c=config();S.pItems.push({marca:'',presentacion:c.presentaciones[0]||'',bolsas:''});pintar();};
  window.hlPQuitar=k=>{S.pItems.splice(k,1);pintar();};
  window.hlPGuardar=async()=>{try{await guardarProgramacion(S.pFecha||hoy(),S.pTurno||'DÍA',S.pItems,S.pRev,S.producto);S.pItems=null;ok('Programación guardada.');}catch(e){S.pItems=null;mal(e);}};
  window.hlGuardarConfig=async()=>{
    const v=id=>((document.getElementById(id)||{}).value||'').split('\n');
    const mapa=atributo=>{const o={};document.querySelectorAll('['+atributo+']').forEach(i=>{o[i.getAttribute(atributo)]=i.value;});return o;};
    try{await guardarConfig({marcas:v('hl-c-marcas'),presentaciones:v('hl-c-pres'),estaciones:v('hl-c-estaciones'),equipos:v('hl-c-equipos'),motivos:v('hl-c-motivos'),mermas:v('hl-c-mermas'),
      pesos:mapa('data-hl-peso'),bolsasPorPaleta:mapa('data-hl-paleta'),capacidadTurnoKg:(document.getElementById('hl-c-capacidad')||{}).value,unidadesPorJaba:(document.getElementById('hl-c-jaba')||{}).value},S.producto);ok('Configuración guardada.');}catch(e){mal(e);}
  };
  window.hlExcel=async()=>{
    if(sinExportar())return;
    try{
      const lista=filtradosHistorial();
      const ExcelJS=typeof cargarScriptExterno==='function'?await cargarScriptExterno('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','ExcelJS'):window.ExcelJS;
      if(!ExcelJS)throw new Error('No se pudo cargar la librería de Excel.');
      const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Hielo',{views:[{state:'frozen',ySplit:3}]});
      const COL=['Fecha','Turno','Supervisor','Marca','Presentación','Lote','Bolsas','Kg','Paradas del turno (min)','Estado'];
      ws.addRow(['GLACIAL · Historial de producción de hielo']).font={bold:true,size:14};
      ws.addRow([`${lista.length} reportes · generado ${new Date().toLocaleString('es-PE')}`]);
      const cab=ws.addRow(COL);cab.font={bold:true,color:{argb:'FFFFFFFF'}};cab.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B2A4A'}};});
      const filas=filasExcel(lista);filas.forEach(f=>ws.addRow(f));
      ws.addRow(['Total','','','','','',filas.reduce((s,f)=>s+f[6],0),Math.round(filas.reduce((s,f)=>s+f[7],0)*100)/100]).font={bold:true};
      [12,12,22,16,14,14,10,10,12,12].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
      ws.autoFilter={from:{row:3,column:1},to:{row:3,column:COL.length}};
      const buf=await wb.xlsx.writeBuffer();const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.download='Historial-Hielo.xlsx';
      document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
    }catch(e){mal('No se pudo generar el Excel: '+((e&&e.message)||e));}
  };
  function abrir(prod){
    if(!puedeVer()){alert('No tienes permiso para ver Hielo. Pídelo a un Administrador.');return;}
    const sel=document.getElementById('report-select-screen'),app=document.getElementById('app-screen');
    S.desdeAgua=!!(app&&app.style.display!=='none'&&getComputedStyle(app).display!=='none');      // se abrió con el botón del Reporte Agua
    if(sel)sel.style.display='none';if(app)app.style.display='none';
    if(esProducto(prod)){S.producto=prod;S.productoElegido=true;S.ed=null;S.pItems=null;if(S.vista==='planta')S.vista='inicio';try{localStorage.setItem('glacial-hielo-producto',prod);}catch(_){/* sin almacenamiento */}}      // «Hielo Premium» / «Hielo en vasos» de la pantalla de módulos abren directo ese producto
    else try{const g=localStorage.getItem('glacial-hielo-producto');if(esProducto(g)&&!S.productoElegido){S.producto=g;S.productoElegido=true;}}catch(_){/* sin almacenamiento */}
    raiz().style.display='block';escuchar();if(!S.fecha)S.fecha=hoy();pintar();
  }
  window.hlSalir=()=>{
    if(temporizador){clearTimeout(temporizador);temporizador=null;window.hlGuardar('GUARDAR',true);}
    S.menu=false;raiz().classList.remove('hl-menu-abierto');raiz().style.display='none';
    const app=document.getElementById('app-screen'),sel=document.getElementById('report-select-screen');
    if(S.desdeAgua&&app){app.style.display='block';if(typeof renderMain==='function')try{renderMain();}catch(_){/* vuelve igual */}}
    else if(sel)sel.style.display='flex';
  };
  // La tarjeta «Reporte Hielo» de la pantalla de selección abre esta página (antes mostraba «en desarrollo», 03-auth.js).
  window.goReporteHielo=abrir;
  if(window.glacialCierresSesion)window.glacialCierresSesion.push(()=>{detener();cache.reportes=[];cache.programacion=[];cache.config=null;S.ed=null;const r=document.getElementById('hielo-screen');if(r){r.style.display='none';r.innerHTML='';}});
  window.glacialHieloUI={abrir,pintar,S};
})();
