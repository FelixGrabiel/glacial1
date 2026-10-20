/* =============================================================
   PLANIFICACIÓN · ÓRDENES DE VENTAS — NÚCLEO DE CÁLCULO (puro: sin Firestore ni pantalla)
   -------------------------------------------------------------
   Una orden de venta es un pedido: N.º, cliente, producto (marca + presentación; la línea es opcional), cantidad en UND y fecha de entrega.
   Este archivo solo calcula; guardar y dibujar está en 66v-planificacion-ordenes-venta.js.

   · coberturaOrdenes: cuánto de cada orden está programado y producido. Las órdenes de un mismo producto se cubren con las programaciones
     de ese producto por FECHA DE ENTREGA (la más urgente primero). No se modifica ninguna programación.
   · estadoOrden / resumenOrdenes: estado derivado y tarjetas.
   · Pensado para la hoja real de Ventas («COSTO X PALETA»: una pestaña por cadena —MAKRO, SPSA, CEN, TAMBO— con OC, TIENDA, FECHA EMISION, FECHA ENTREGA,
     PRODUCTO, UND SOLICITADAS, UND DESPACHO/ENVIADA, NNSS y OBS). Una OC trae VARIOS productos (una fila por producto): la orden se identifica por N.º + producto.
     PRODUCTO llega como un solo texto («SCALA-AGUA-SIN-GAS-BT-1-L»): se traduce a (marca, presentación) con una tabla de equivalencias; las que faltan
     se avisan, nunca se adivinan en silencio. UND DESPACHO es lo ya enviado: no necesita producción.
   · importarFilas: la MISMA lógica sirve para Excel/CSV hoy y para Google Sheets mañana (cualquier fuente entrega filas {encabezado: valor}).
     Crea las órdenes nuevas, actualiza las que ya existen (por N.º, sin duplicar) y, si se pide, marca como «retirada» la que ya no está en la fuente.
   Se usa en el navegador (window.glacialOrdenesVentaNucleo) y en las pruebas de Node (module.exports).
   ============================================================= */
(function(raiz){
  'use strict';

  const num=v=>{const n=Number(String(v==null?'':v).replace(/\s/g,'').replace(/,(?=\d{3}(\D|$))/g,'').replace(',','.'));return Number.isFinite(n)?n:0;};
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const normPres=t=>norm(t).replace(/\s+/g,'');
  /* Formato de una presentación: lo que identifica el producto para una orden de venta (volumen + caja/bidón). Una orden dice «Scala 625 ml», no «pack x15 / x6 / la / ln»:
     por eso se compara por formato y no por el texto completo de la presentación. Si no se reconoce un volumen se usa el texto tal cual. */
  function formatoDe(t){
    let x=norm(t).replace(/[_\/]+/g,' ').replace(/(\d)[\s-]+(\d)[\s-]*(?=l\b|lt|litro)/g,'$1.$2 ').replace(/(\d),(\d)/g,'$1.$2');
    let m=x.match(/(\d+(?:\.\d+)?)\s*-?\s*ml(?=\b|x\d)/),vol='';
    if(m)vol=String(Number(m[1]))+'ml';
    else if((m=x.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:lts?|litros?|l)(?=\b|x\d)/)))vol=String(Number(m[1]))+'l';
    if(!vol)return normPres(t);
    const tipo=/\bcaja\b|\bcj\b|\bcjx/.test(x)?'caja':/\bbidon\b|\bbd\b/.test(x)?'bidon':'';
    return (tipo==='bidon'&&(vol==='7l'||vol==='10l')?'':tipo)+vol;      // el bidón de 7 y 10 L es simplemente «7 Litros» / «10 Litros»
  }
  const claveProducto=(marca,presentacion)=>norm(marca)+'|'+formatoDe(presentacion);
  /* Una orden = N.º (la OC) + producto: una misma OC trae varias líneas. */
  /* Incluye el texto del producto de la hoja: dos productos distintos de la misma OC pueden equivaler a la misma marca y formato (p. ej. «625ML PK X 6» y «625 ML»)
     y son dos líneas distintas. La cobertura sí compara por marca + formato (claveProducto). */
  const claveOrden=o=>norm(o.numero)+'|'+claveProducto(o.marca,o.presentacion)+'|'+norm(o.producto);
  const DIA_MS=86400000;
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))&&!Number.isNaN(new Date(f+'T00:00:00').getTime());
  const diasEntre=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/DIA_MS);

  /* Estados que se guardan (los demás se calculan): ABIERTA, CANCELADA (a mano o desde la fuente) y RETIRADA (la fuente ya no la trae). */
  const ESTADOS_GUARDADOS=['ABIERTA','CANCELADA','RETIRADA'];

  /* ---------------- columnas de la fuente (Excel, CSV o Google Sheets) ---------------- */
  const COLUMNAS=[
    {clave:'numero',etq:'N.º orden (OC)',obligatoria:true,alias:['n.º orden','nº orden','n° orden','no orden','numero','número','orden','orden de venta','pedido','n.º pedido','oc','orden de compra','id']},
    {clave:'cliente',etq:'Cliente / tienda',obligatoria:true,alias:['cliente','tienda','cd','razon social','razón social','destinatario','local']},
    {clave:'producto',etq:'Producto (texto de la hoja)',obligatoria:false,alias:['producto','descripcion del producto','descripción del producto','descripcion','descripción','articulo','artículo','item']},
    {clave:'marca',etq:'Marca (si viene separada)',obligatoria:false,alias:['marca']},
    {clave:'presentacion',etq:'Presentación (si viene separada)',obligatoria:false,alias:['presentacion','presentación','formato','envase']},
    {clave:'cantidad',etq:'Cantidad solicitada (UND)',obligatoria:true,alias:['cantidad','cantidad und','und','unidades','cant','cantidad pedida','und solicitadas','unidades solicitadas','und pedido','und pedidas']},
    {clave:'fechaEntrega',etq:'Fecha de entrega',obligatoria:true,alias:['fecha de entrega','fecha entrega','entrega','fecha','fecha compromiso']},
    {clave:'despachado',etq:'Despachado (UND, opcional)',obligatoria:false,alias:['und despacho','und enviada','und enviado','und enviadas','und despachadas','despachado','enviado','cantidad despachada','und despachado']},
    {clave:'cadena',etq:'Cadena (opcional)',obligatoria:false,alias:['cadena','canal']},
    {clave:'linea',etq:'Línea de producción (opcional)',obligatoria:false,alias:['linea','línea']},
    {clave:'fechaPedido',etq:'Fecha del pedido (opcional)',obligatoria:false,alias:['fecha pedido','fecha del pedido','fecha de pedido','fecha emision','fecha emisión','emision','emisión']},
    {clave:'estado',etq:'Estado (opcional)',obligatoria:false,alias:['estado','situacion','situación']},
    {clave:'observaciones',etq:'Observaciones (opcional)',obligatoria:false,alias:['observaciones','observacion','observación','obs','nota','notas','comentario','devolucion','devolución']}
  ];


  /* Une los encabezados reales de la fuente con las columnas del sistema: primero el mapa configurado {clave: 'Encabezado'}, luego los nombres habituales. */
  function mapearColumnas(encabezados,mapaConfigurado){
    const hdr=(encabezados||[]).map(h=>({orig:String(h==null?'':h),n:norm(h)}));
    const mapa={},faltan=[];
    COLUMNAS.forEach(c=>{
      const cfg=mapaConfigurado&&mapaConfigurado[c.clave];
      let h=cfg?hdr.find(x=>x.n===norm(cfg)):null;
      for(let k=0;!h&&k<c.alias.length;k++)h=hdr.find(x=>x.n===norm(c.alias[k]));   // por prioridad de alias (UND DESPACHO antes que DEVOLUCION…)
      if(h)mapa[c.clave]=h.orig;else if(c.obligatoria)faltan.push(c.etq);
    });
    if(!mapa.producto&&!(mapa.marca&&mapa.presentacion))faltan.push('Producto (o marca y presentación)');
    return {mapa,faltan};
  }

  /* ---------------- producto de la hoja → (marca, presentación, línea) ---------------- */
  /* equivalencias: {[norm(texto)]:{marca,presentacion,linea?}} (tabla editable por el usuario). */
  const resolverProducto=(texto,eq)=>{const e=eq&&eq[norm(texto)];return e&&e.marca&&e.presentacion?e:null;};
  /* Sugerencia (solo ayuda para llenar la tabla; el usuario confirma): marca = la del vocabulario que aparece como palabra suelta; presentación queda vacía si no se reconoce. */
  const MARCAS_TEXTO=[['bells',/\bbell\s?s\b|\bbells\b/],['scala',/\bscala\b/],['aro',/\baro\b/],['cuisine',/cuisine|\bc&co\b|\bc ?& ?co\b/],['fontlife',/font\s?life/],
    ['glacial',/\bglacial\b/],['merkat',/\bmerkat\b/],['yaqua',/\byaqua\b/],['san jorge',/san jor/]];
  const SABORES=[['manzana',/manzana/],['maracuya',/maracu/],['pina kion',/pi[nñ]a|kion/]];
  function sugerirProducto(texto,marcas){
    const x=norm(String(texto).replace(/[_\-\/]+/g,' '));
    const base=(MARCAS_TEXTO.find(([,r])=>r.test(x))||[''])[0];
    const conGas=/\bcon gas\b/.test(x),sabor=(SABORES.find(([,r])=>r.test(x))||[''])[0];
    const vocab=(marcas||[]).map(m=>({m,n:norm(m.replace(/_/g,' '))}));
    const hallar=n=>{const v=vocab.find(o=>o.n===n);return v?v.m:'';};
    // «Bells con gas» → Bells_Gas · «Scala con gas sabor manzana» → Scala_Manzana (si el sistema tiene esa marca), si no la marca base
    let marca=base?(sabor?hallar(base+' '+sabor):conGas?hallar(base+' gas'):'')||hallar(base):'';
    return {marca,base,formato:formatoDe(x),conGas,sabor};
  }

  /* ---------------- fecha ---------------- */
  function leerFecha(v,hoyISO){
    if(v==null||v==='')return '';
    if(v instanceof Date&&!Number.isNaN(v.getTime()))return iso(v);
    if(typeof v==='number'&&v>20000&&v<80000)return iso(new Date(Math.round((v-25569)*DIA_MS)+new Date().getTimezoneOffset()*60000));   // serie de Excel
    const t=String(v).trim();
    let m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m)return fmt(m[1],m[2],m[3]);
    m=t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if(m)return fmt(m[3].length===2?'20'+m[3]:m[3],m[2],m[1]);
    m=t.match(/^(\d{1,2})[\/.\-](\d{1,2})$/);
    if(m&&hoyISO)return fmt(hoyISO.slice(0,4),m[2],m[1]);
    return '';
    function fmt(a,b,c){const f=a+'-'+String(b).padStart(2,'0')+'-'+String(c).padStart(2,'0');return fechaOk(f)?f:'';}
  }

  /* ---------------- validar una orden ---------------- */
  function validarOrden(o,opc){
    const e=[];
    if(!String(o.numero||'').trim())e.push('Falta el N.º de orden.');
    if(!String(o.cliente||'').trim())e.push('Falta el cliente.');
    if(!String(o.marca||'').trim()||!String(o.presentacion||'').trim())e.push('Falta el producto (marca y presentación).');
    if(!(num(o.cantidad)>0))e.push('La cantidad debe ser mayor que cero.');
    if(!fechaOk(o.fechaEntrega))e.push('La fecha de entrega no es válida.');
    if(o.estado&&!ESTADOS_GUARDADOS.includes(o.estado))e.push('Estado no válido.');
    if(o.despachado!==undefined&&o.despachado!==''&&num(o.despachado)<0)e.push('Lo despachado no puede ser negativo.');
    const otros=(opc&&opc.existentes)||[];
    if(String(o.numero||'').trim()&&otros.some(x=>x.id!==o.id&&claveOrden(x)===claveOrden(o)))e.push('Ya existe una orden con ese N.º y ese producto.');
    return e;
  }

  /* ---------------- cobertura ---------------- */
  /* ordenes: [{id,numero,marca,presentacion,linea?,cantidad,fechaEntrega,fechaPedido?,estado,creadoEn?}]
     programaciones: [{clave,linea,fecha,turno,marca,presentacion,cantidadProgramada,estadoOperacion?}]
     opc.producidoDe(prog) → UND producidas de esa programación (null/undefined = 0) · opc.hoy 'YYYY-MM-DD' · opc.ventanaDias (si la orden no trae fecha del pedido, se miran las programaciones desde hoy − N días; por defecto 30) */
  function coberturaOrdenes(ordenes,programaciones,opc){
    opc=opc||{};
    const hoy=opc.hoy||iso(new Date()),maxAtraso=Number.isFinite(opc.diasMaxAtraso)?opc.diasMaxAtraso:Infinity,ventana=Number.isFinite(opc.ventanaDias)?opc.ventanaDias:30;
    const prod=typeof opc.producidoDe==='function'?opc.producidoDe:()=>0;
    const progs=(programaciones||[]).filter(p=>p&&num(p.cantidadProgramada)>0&&p.marca&&p.presentacion&&fechaOk(p.fecha)&&!(p.estadoOperacion&&p.estadoOperacion.estado==='CANCELADA'))
      .map(p=>({p,producto:claveProducto(p.marca,p.presentacion),restoProg:num(p.cantidadProgramada),restoProd:Math.max(0,Math.min(num(p.cantidadProgramada),num(prod(p))||0))}))
      .sort((a,b)=>String(a.p.fecha).localeCompare(String(b.p.fecha))||String(a.p.turno).localeCompare(String(b.p.turno)));
    const abiertas=(ordenes||[]).filter(o=>o&&(o.estado||'ABIERTA')==='ABIERTA'&&num(o.cantidad)-num(o.despachado)>0&&!(fechaOk(o.fechaEntrega)&&diasEntre(hoy,o.fechaEntrega)<-maxAtraso))   // una orden vencida hace mucho ya no reserva programaciones
      .sort((a,b)=>String(a.fechaEntrega).localeCompare(String(b.fechaEntrega))||num(a.creadoEn)-num(b.creadoEn)||String(a.numero).localeCompare(String(b.numero)));
    const res=new Map();
    abiertas.forEach(o=>{
      const pedido=Math.max(0,num(o.cantidad)-num(o.despachado)),desde=fechaOk(o.fechaPedido)?o.fechaPedido:iso(new Date(new Date(hoy+'T00:00:00').getTime()-ventana*DIA_MS));
      const key=claveProducto(o.marca,o.presentacion);
      let falta=pedido,programado=0,producido=0;const detalle=[];
      progs.forEach(x=>{
        if(falta<=0)return;
        if(x.producto!==key||x.restoProg<=0)return;
        if(o.linea&&x.p.linea!==o.linea)return;
        if(String(x.p.fecha)<desde)return;
        const toma=Math.min(falta,x.restoProg);
        const prodTomado=Math.min(toma,x.restoProd);
        x.restoProg-=toma;x.restoProd-=prodTomado;falta-=toma;programado+=toma;producido+=prodTomado;
        detalle.push({clave:x.p.clave,linea:x.p.linea,fecha:x.p.fecha,turno:x.p.turno,cantidad:toma,producido:prodTomado});
      });
      res.set(o.id,{solicitado:num(o.cantidad),despachado:num(o.despachado),pedido,programado,producido,falta:Math.max(0,pedido-programado),detalle});
    });
    return res;
  }

  /* Estado que ve el usuario (se calcula; solo ABIERTA/CANCELADA/RETIRADA se guardan). nivel: verde · azul · ambar · rojo · gris */
  function estadoOrden(o,cob,hoy,diasMax){
    const e=o.estado||'ABIERTA';
    if(e==='CANCELADA')return {clave:'CANCELADA',etiqueta:'Cancelada',nivel:'gris',cerrada:true};
    if(e==='RETIRADA')return {clave:'RETIRADA',etiqueta:'Retirada de la fuente',nivel:'gris',cerrada:true};
    if(num(o.cantidad)>0&&num(o.despachado)>=num(o.cantidad))return {clave:'DESPACHADA',etiqueta:'Despachada',nivel:'verde',cerrada:true};
    const pend=Math.max(0,num(o.cantidad)-num(o.despachado));
    const c=cob||{pedido:pend,programado:0,producido:0,falta:pend};
    if(c.pedido>0&&c.producido>=c.pedido)return {clave:'COMPLETA',etiqueta:'Completa',nivel:'verde',cerrada:true};
    const dias=fechaOk(o.fechaEntrega)?diasEntre(hoy,o.fechaEntrega):null;
    if(dias!==null&&Number.isFinite(diasMax)&&dias<-diasMax)return {clave:'VENCIDA',etiqueta:'Vencida sin atender',nivel:'gris',cerrada:true,dias};   // histórico: no cuenta como atraso ni reserva programación
    if(dias!==null&&dias<0)return {clave:'ATRASADA',etiqueta:'Atrasada',nivel:'rojo',cerrada:false,dias};
    const extra=dias!==null&&dias<=3?{porVencer:true,dias}:{dias};
    if(c.producido>0)return Object.assign({clave:'EN_PRODUCCION',etiqueta:'En producción',nivel:'azul',cerrada:false},extra);
    if(c.programado>=c.pedido&&c.pedido>0)return Object.assign({clave:'PROGRAMADA',etiqueta:'Programada',nivel:'verde',cerrada:false},extra);
    if(c.programado>0)return Object.assign({clave:'PARCIAL',etiqueta:'Programada en parte',nivel:'ambar',cerrada:false},extra);
    return Object.assign({clave:'SIN_PROGRAMAR',etiqueta:'Sin programar',nivel:'gris',cerrada:false},extra);
  }

  /* ventanaDias (opcional): el nivel de servicio cuenta solo las líneas cuya entrega cayó en los últimos N días (hasta hoy): así no lo sesga la historia cerrada que no se guarda. */
  function resumenOrdenes(ordenes,cobMap,hoy,diasMax,ventanaDias){
    const r={abiertas:0,pedidas:0,programado:0,producido:0,falta:0,atrasadas:0,porVencer:0,sinCubrir:0,vencidas:0,solicitado:0,despachado:0,nivelServicio:null};
    (ordenes||[]).forEach(o=>{
      const c=cobMap.get(o.id),st=estadoOrden(o,c,hoy,diasMax);
      if(st.clave==='VENCIDA')r.vencidas++;
      const enVentana=!Number.isFinite(ventanaDias)||(fechaOk(o.fechaEntrega)&&diasEntre(hoy,o.fechaEntrega)<=0&&diasEntre(hoy,o.fechaEntrega)>=-ventanaDias);
      if(enVentana&&st.clave!=='CANCELADA'&&st.clave!=='RETIRADA'){r.solicitado+=num(o.cantidad);r.despachado+=Math.min(num(o.despachado),num(o.cantidad));}
      if(st.cerrada)return;
      r.abiertas++;r.pedidas+=Math.max(0,num(o.cantidad)-num(o.despachado));
      if(c){r.programado+=c.programado;r.producido+=c.producido;r.falta+=c.falta;if(c.falta>0)r.sinCubrir++;}
      if(st.clave==='ATRASADA')r.atrasadas++;
      if(st.porVencer)r.porVencer++;
    });
    if(r.solicitado>0)r.nivelServicio=r.despachado/r.solicitado;
    return r;
  }

  /* ---------------- importar (Excel · CSV · Google Sheets) ---------------- */
  /* filas: [{encabezado: valor}] · existentes: órdenes guardadas · opc: {mapa (columnas configuradas), origen:'excel'|'sheets'|'csv', usuario, ahora (ms), hoy, retirarAusentes}
     Devuelve {crear[], actualizar[{id,cambios,antes}], retirar[], sinCambio, errores[{fila,mensaje}], faltanColumnas[]} — NO guarda nada. */
  function importarFilas(filas,existentes,opc){
    opc=opc||{};
    const ahora=opc.ahora||Date.now(),hoy=opc.hoy||iso(new Date(ahora)),origen=opc.origen||'excel';
    const encabezados=filas&&filas.length?[...new Set(filas.flatMap(f=>Object.keys(f)))]:(opc.encabezados||[]);
    const {mapa,faltan}=mapearColumnas(encabezados,opc.mapa);
    const out={crear:[],actualizar:[],retirar:[],sinCambio:0,errores:[],faltanColumnas:faltan,vistos:0};
    if(faltan.length)return out;
    const porNumero=new Map();(existentes||[]).forEach(o=>porNumero.set(claveOrden(o),o));
    const corte=fechaOk(opc.fechaCorte)?opc.fechaCorte:'';
    out.fueraDeCorte=0;out.sinEquivalencia=[];const faltaEq=new Map();
    const vistos=new Set();
    const cand=[];
    (filas||[]).forEach((f,i)=>{
      const v=c=>mapa[c]?f[mapa[c]]:'';
      const vacia=['numero','cliente','producto','marca','presentacion','cantidad','fechaEntrega'].every(c=>String(v(c)==null?'':v(c)).trim()==='');
      if(vacia)return;
      if(['numero','cliente'].every(c=>String(v(c)==null?'':v(c)).trim()===''))return void (out.filasAjenas=(out.filasAjenas||0)+1);   // sin OC ni tienda: totales, notas o una tabla ajena pegada en la hoja
      const estadoTxt=norm(v('estado')),obsTxt=norm(v('observaciones'));
      let marca=String(v('marca')||'').trim(),presentacion=String(v('presentacion')||'').trim(),lineaEq='';
      const textoProd=String(v('producto')||'').trim();
      if((!marca||!presentacion)&&textoProd){
        const eq=resolverProducto(textoProd,opc.equivalencias);
        if(!eq){
          const fe0=leerFecha(v('fechaEntrega'),hoy);
          if(corte&&fe0&&fe0<corte){out.fueraDeCorte++;return;}
          faltaEq.set(textoProd,(faltaEq.get(textoProd)||0)+1);return;
        }
        marca=eq.marca;presentacion=eq.presentacion;lineaEq=eq.linea||'';
      }
      const fechaE=leerFecha(v('fechaEntrega'),hoy);
      if(corte&&fechaE&&fechaE<corte){out.fueraDeCorte++;return;}
      out.vistos++;
      let numero=String(v('numero')).trim();
      const clienteTxt=String(v('cliente')).trim();
      if(!numero&&clienteTxt&&fechaE){numero='S/OC '+fechaE+' '+norm(clienteTxt).replace(/[^a-z0-9]/g,'').slice(0,8).toUpperCase();out.sinOC=(out.sinOC||0)+1;}   // pedido sin N.º de OC en la hoja: se identifica por fecha y tienda
      const orden={
        numero,cliente:clienteTxt,marca,presentacion,producto:textoProd,
        despachado:Math.max(0,num(v('despachado'))),cadena:String(v('cadena')||opc.cadena||'').trim(),
        cantidad:num(v('cantidad')),fechaEntrega:fechaE,linea:String(v('linea')||lineaEq||'').trim(),
        fechaPedido:leerFecha(v('fechaPedido'),hoy),observaciones:String(v('observaciones')||'').trim(),
        estado:/cancel|anulad|duplicad/.test(estadoTxt+' '+obsTxt)?'CANCELADA':'ABIERTA'
      };
      if(!(num(orden.cantidad)>0)&&orden.numero&&orden.cliente&&fechaE){out.sinCantidad=(out.sinCantidad||0)+1;return;}     // línea de la hoja con 0 solicitadas: no hay nada que producir
      /* Historia ya cerrada: una línea completamente despachada hace más de N días no se guarda (miles de filas que no cambian y que el servidor tarda en escribir). */
      if(Number.isFinite(opc.diasDespachadas)&&orden.estado!=='CANCELADA'&&num(orden.cantidad)>0&&num(orden.despachado)>=num(orden.cantidad)&&fechaE&&diasEntre(hoy,fechaE)<-opc.diasDespachadas){out.despachadasAntiguas=(out.despachadasAntiguas||0)+1;return;}
      cand.push({orden,fila:f.__fila||i+2,hoja:f.__hoja||''});
    });
    /* «OC DUPLICADA» / anulada: si la misma línea (OC + producto) también viene vigente, la anulada se omite en vez de contarla como repetida. */
    const vivas=new Set(cand.filter(c=>c.orden.estado!=='CANCELADA'&&c.orden.numero).map(c=>claveOrden(c.orden)));
    cand.forEach(({orden,fila,hoja})=>{
      const kOrden=claveOrden(orden);
      if(orden.estado==='CANCELADA'&&vivas.has(kOrden)){out.duplicadasOmitidas=(out.duplicadasOmitidas||0)+1;return;}
      const errores=validarOrden(Object.assign({id:'_'},orden),{existentes:[]});
      if(vistos.has(kOrden)&&orden.numero)errores.push('Esa OC con ese producto aparece repetida en el archivo.');
      if(errores.length){out.errores.push({fila,hoja,numero:orden.numero,mensaje:errores.join(' ')});return;}
      vistos.add(kOrden);
      const previa=porNumero.get(kOrden);
      if(!previa){out.crear.push(Object.assign({},orden,{origen,idExterno:orden.numero,sincronizadoEn:ahora}));return;}
      const campos=['cliente','cantidad','despachado','fechaEntrega','linea','cadena','producto','fechaPedido','observaciones'];
      const cambios={};
      campos.forEach(c=>{if(String(previa[c]==null?'':previa[c])!==String(orden[c]==null?'':orden[c]))cambios[c]=orden[c];});
      // Una orden cancelada a mano en el sistema no se reabre desde la fuente; sí se cancela o se recupera si la fuente la devuelve.
      if(orden.estado==='CANCELADA'&&previa.estado!=='CANCELADA')cambios.estado='CANCELADA';
      else if(previa.estado==='RETIRADA')cambios.estado='ABIERTA';
      if(Object.keys(cambios).length){
        out.actualizar.push({id:previa.id,numero:previa.numero,cambios:Object.assign(cambios,{origen,idExterno:previa.idExterno||orden.numero,sincronizadoEn:ahora}),antes:Object.fromEntries(Object.keys(cambios).filter(k=>k in previa).map(k=>[k,previa[k]]))});
      }else out.sinCambio++;
    });
    out.sinEquivalencia=[...faltaEq].map(([texto,filas])=>({texto,filas,sugerencia:sugerirProducto(texto,opc.marcas)}));
    if(opc.retirarAusentes){
      (existentes||[]).forEach(o=>{
        if((o.estado||'ABIERTA')==='ABIERTA'&&(o.origen==='excel'||o.origen==='csv'||o.origen==='sheets')&&!vistos.has(claveOrden(o))&&!(corte&&o.fechaEntrega<corte))out.retirar.push({id:o.id,numero:o.numero});
      });
    }
    return out;
  }

  /* Varias pestañas (una por cadena): hojas=[{nombre,filas}]. Cada pestaña se lee con SUS encabezados (unas traen «UND DESPACHO», otras «UND ENVIADA»)
     y se junta todo en filas con las columnas del sistema; la cadena sale de la columna Cadena o, si no hay, del nombre de la pestaña.
     Devuelve lo mismo que importarFilas + hojasSinColumnas[{hoja,faltan}]. */
  function importarHojas(hojas,existentes,opc){
    opc=opc||{};const canon=[],hojasSinColumnas=[];
    (hojas||[]).forEach(h=>{
      const enc=[...new Set((h.filas||[]).flatMap(f=>Object.keys(f)))];
      const {mapa,faltan}=mapearColumnas(enc,opc.mapa);
      if(faltan.length){hojasSinColumnas.push({hoja:h.nombre,faltan});return;}
      (h.filas||[]).forEach((f,i)=>{
        const r={__hoja:h.nombre,__fila:i+2};
        COLUMNAS.forEach(c=>{r[c.clave]=mapa[c.clave]?f[mapa[c.clave]]:'';});
        if(!String(r.cadena||'').trim())r.cadena=h.nombre;
        canon.push(r);
      });
    });
    const ident={};COLUMNAS.forEach(c=>{ident[c.clave]=c.clave;});
    const r=importarFilas(canon,existentes,Object.assign({},opc,{mapa:ident,cadena:''}));
    r.hojasSinColumnas=hojasSinColumnas;
    return r;
  }

  /* Aplica el resultado de importarFilas a la lista de órdenes (puro). Devuelve la lista nueva. */
  function aplicarImportacion(existentes,r,opc){
    opc=opc||{};const ahora=opc.ahora||Date.now(),quien=opc.usuario||'';
    const lista=(existentes||[]).map(o=>Object.assign({},o));
    const porId=new Map(lista.map(o=>[o.id,o]));
    (r.actualizar||[]).forEach(a=>{const o=porId.get(a.id);if(o)Object.assign(o,a.cambios,{actualizadoPor:quien,actualizadoEn:ahora,version:(num(o.version)||1)+1});});
    (r.retirar||[]).forEach(a=>{const o=porId.get(a.id);if(o)Object.assign(o,{estado:'RETIRADA',actualizadoPor:quien,actualizadoEn:ahora,version:(num(o.version)||1)+1});});
    (r.crear||[]).forEach((c,i)=>lista.push(Object.assign({id:'ov_'+ahora.toString(36)+'_'+i+Math.random().toString(36).slice(2,6),creadoPor:quien,creadoEn:ahora,actualizadoPor:quien,actualizadoEn:ahora,version:1},c)));
    return lista;
  }

  const API={num,norm,formatoDe,claveProducto,claveOrden,resolverProducto,sugerirProducto,fechaOk,leerFecha,diasEntre,COLUMNAS,ESTADOS_GUARDADOS,mapearColumnas,importarHojas,validarOrden,coberturaOrdenes,estadoOrden,resumenOrdenes,importarFilas,aplicarImportacion};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof window!=='undefined')window.glacialOrdenesVentaNucleo=API;
})(typeof window!=='undefined'?window:globalThis);
