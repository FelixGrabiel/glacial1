/* =============================================================
   PLANIFICACIÓN · ÓRDENES DE VENTAS — NÚCLEO DE CÁLCULO (puro: sin Firestore ni pantalla)
   -------------------------------------------------------------
   Una orden de venta es un pedido: N.º, cliente, producto (marca + presentación; la línea es opcional), cantidad en UND y fecha de entrega.
   Este archivo solo calcula; guardar y dibujar está en 66v-planificacion-ordenes-venta.js.

   · coberturaOrdenes: cuánto de cada orden está programado y producido. Las órdenes de un mismo producto se cubren con las programaciones
     de ese producto por FECHA DE ENTREGA (la más urgente primero). No se modifica ninguna programación.
   · estadoOrden / resumenOrdenes: estado derivado y tarjetas.
   · importarFilas: la MISMA lógica sirve para Excel/CSV hoy y para Google Sheets mañana (cualquier fuente entrega filas {encabezado: valor}).
     Crea las órdenes nuevas, actualiza las que ya existen (por N.º, sin duplicar) y, si se pide, marca como «retirada» la que ya no está en la fuente.
   Se usa en el navegador (window.glacialOrdenesVentaNucleo) y en las pruebas de Node (module.exports).
   ============================================================= */
(function(raiz){
  'use strict';

  const num=v=>{const n=Number(String(v==null?'':v).replace(/\s/g,'').replace(/,(?=\d{3}(\D|$))/g,'').replace(',','.'));return Number.isFinite(n)?n:0;};
  const norm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const normPres=t=>norm(t).replace(/\s+/g,'');
  const claveProducto=(marca,presentacion)=>norm(marca)+'|'+normPres(presentacion);
  const DIA_MS=86400000;
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const fechaOk=f=>/^\d{4}-\d{2}-\d{2}$/.test(String(f||''))&&!Number.isNaN(new Date(f+'T00:00:00').getTime());
  const diasEntre=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/DIA_MS);

  /* Estados que se guardan (los demás se calculan): ABIERTA, CANCELADA (a mano o desde la fuente) y RETIRADA (la fuente ya no la trae). */
  const ESTADOS_GUARDADOS=['ABIERTA','CANCELADA','RETIRADA'];

  /* ---------------- columnas de la fuente (Excel, CSV o Google Sheets) ---------------- */
  const COLUMNAS=[
    {clave:'numero',etq:'N.º orden',obligatoria:true,alias:['n.º orden','nº orden','n° orden','no orden','numero','número','orden','orden de venta','pedido','n.º pedido','id']},
    {clave:'cliente',etq:'Cliente',obligatoria:true,alias:['cliente','razon social','razón social','destinatario']},
    {clave:'marca',etq:'Marca',obligatoria:true,alias:['marca','producto','articulo','artículo']},
    {clave:'presentacion',etq:'Presentación',obligatoria:true,alias:['presentacion','presentación','formato','envase']},
    {clave:'cantidad',etq:'Cantidad (UND)',obligatoria:true,alias:['cantidad','cantidad und','und','unidades','cant','cantidad pedida']},
    {clave:'fechaEntrega',etq:'Fecha de entrega',obligatoria:true,alias:['fecha de entrega','fecha entrega','entrega','fecha','fecha compromiso']},
    {clave:'linea',etq:'Línea (opcional)',obligatoria:false,alias:['linea','línea']},
    {clave:'fechaPedido',etq:'Fecha del pedido (opcional)',obligatoria:false,alias:['fecha pedido','fecha del pedido','fecha de pedido','emision','emisión']},
    {clave:'estado',etq:'Estado (opcional)',obligatoria:false,alias:['estado','situacion','situación']},
    {clave:'observaciones',etq:'Observaciones (opcional)',obligatoria:false,alias:['observaciones','observacion','observación','nota','notas','comentario']}
  ];

  /* Une los encabezados reales de la fuente con las columnas del sistema: primero el mapa configurado {clave: 'Encabezado'}, luego los nombres habituales. */
  function mapearColumnas(encabezados,mapaConfigurado){
    const hdr=(encabezados||[]).map(h=>({orig:String(h==null?'':h),n:norm(h)}));
    const mapa={},faltan=[];
    COLUMNAS.forEach(c=>{
      const cfg=mapaConfigurado&&mapaConfigurado[c.clave];
      let h=cfg?hdr.find(x=>x.n===norm(cfg)):null;
      if(!h)h=hdr.find(x=>c.alias.some(a=>norm(a)===x.n));
      if(h)mapa[c.clave]=h.orig;else if(c.obligatoria)faltan.push(c.etq);
    });
    return {mapa,faltan};
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
    const otros=(opc&&opc.existentes)||[];
    if(String(o.numero||'').trim()&&otros.some(x=>x.id!==o.id&&norm(x.numero)===norm(o.numero)))e.push('Ya existe una orden con ese N.º.');
    return e;
  }

  /* ---------------- cobertura ---------------- */
  /* ordenes: [{id,numero,marca,presentacion,linea?,cantidad,fechaEntrega,fechaPedido?,estado,creadoEn?}]
     programaciones: [{clave,linea,fecha,turno,marca,presentacion,cantidadProgramada,estadoOperacion?}]
     opc.producidoDe(prog) → UND producidas de esa programación (null/undefined = 0) · opc.hoy 'YYYY-MM-DD' · opc.ventanaDias (si la orden no trae fecha del pedido, se miran las programaciones desde hoy − N días; por defecto 30) */
  function coberturaOrdenes(ordenes,programaciones,opc){
    opc=opc||{};
    const hoy=opc.hoy||iso(new Date()),ventana=Number.isFinite(opc.ventanaDias)?opc.ventanaDias:30;
    const prod=typeof opc.producidoDe==='function'?opc.producidoDe:()=>0;
    const progs=(programaciones||[]).filter(p=>p&&num(p.cantidadProgramada)>0&&p.marca&&p.presentacion&&fechaOk(p.fecha)&&!(p.estadoOperacion&&p.estadoOperacion.estado==='CANCELADA'))
      .map(p=>({p,producto:claveProducto(p.marca,p.presentacion),restoProg:num(p.cantidadProgramada),restoProd:Math.max(0,Math.min(num(p.cantidadProgramada),num(prod(p))||0))}))
      .sort((a,b)=>String(a.p.fecha).localeCompare(String(b.p.fecha))||String(a.p.turno).localeCompare(String(b.p.turno)));
    const abiertas=(ordenes||[]).filter(o=>o&&(o.estado||'ABIERTA')==='ABIERTA')
      .sort((a,b)=>String(a.fechaEntrega).localeCompare(String(b.fechaEntrega))||num(a.creadoEn)-num(b.creadoEn)||String(a.numero).localeCompare(String(b.numero)));
    const res=new Map();
    abiertas.forEach(o=>{
      const pedido=num(o.cantidad),desde=fechaOk(o.fechaPedido)?o.fechaPedido:iso(new Date(new Date(hoy+'T00:00:00').getTime()-ventana*DIA_MS));
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
      res.set(o.id,{pedido,programado,producido,falta:Math.max(0,pedido-programado),detalle});
    });
    return res;
  }

  /* Estado que ve el usuario (se calcula; solo ABIERTA/CANCELADA/RETIRADA se guardan). nivel: verde · azul · ambar · rojo · gris */
  function estadoOrden(o,cob,hoy){
    const e=o.estado||'ABIERTA';
    if(e==='CANCELADA')return {clave:'CANCELADA',etiqueta:'Cancelada',nivel:'gris',cerrada:true};
    if(e==='RETIRADA')return {clave:'RETIRADA',etiqueta:'Retirada de la fuente',nivel:'gris',cerrada:true};
    const c=cob||{pedido:num(o.cantidad),programado:0,producido:0,falta:num(o.cantidad)};
    if(c.pedido>0&&c.producido>=c.pedido)return {clave:'COMPLETA',etiqueta:'Completa',nivel:'verde',cerrada:true};
    const dias=fechaOk(o.fechaEntrega)?diasEntre(hoy,o.fechaEntrega):null;
    if(dias!==null&&dias<0)return {clave:'ATRASADA',etiqueta:'Atrasada',nivel:'rojo',cerrada:false,dias};
    const extra=dias!==null&&dias<=3?{porVencer:true,dias}:{dias};
    if(c.producido>0)return Object.assign({clave:'EN_PRODUCCION',etiqueta:'En producción',nivel:'azul',cerrada:false},extra);
    if(c.programado>=c.pedido&&c.pedido>0)return Object.assign({clave:'PROGRAMADA',etiqueta:'Programada',nivel:'verde',cerrada:false},extra);
    if(c.programado>0)return Object.assign({clave:'PARCIAL',etiqueta:'Programada en parte',nivel:'ambar',cerrada:false},extra);
    return Object.assign({clave:'SIN_PROGRAMAR',etiqueta:'Sin programar',nivel:'gris',cerrada:false},extra);
  }

  function resumenOrdenes(ordenes,cobMap,hoy){
    const r={abiertas:0,pedidas:0,programado:0,producido:0,falta:0,atrasadas:0,porVencer:0,sinCubrir:0};
    (ordenes||[]).forEach(o=>{
      const c=cobMap.get(o.id),st=estadoOrden(o,c,hoy);
      if(st.cerrada)return;
      r.abiertas++;r.pedidas+=num(o.cantidad);
      if(c){r.programado+=c.programado;r.producido+=c.producido;r.falta+=c.falta;if(c.falta>0)r.sinCubrir++;}
      if(st.clave==='ATRASADA')r.atrasadas++;
      if(st.porVencer)r.porVencer++;
    });
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
    const porNumero=new Map();(existentes||[]).forEach(o=>porNumero.set(norm(o.numero),o));
    const vistos=new Set();
    (filas||[]).forEach((f,i)=>{
      const v=c=>mapa[c]?f[mapa[c]]:'';
      const vacia=['numero','cliente','marca','presentacion','cantidad','fechaEntrega'].every(c=>String(v(c)==null?'':v(c)).trim()==='');
      if(vacia)return;
      out.vistos++;
      const estadoTxt=norm(v('estado'));
      const orden={
        numero:String(v('numero')).trim(),cliente:String(v('cliente')).trim(),marca:String(v('marca')).trim(),presentacion:String(v('presentacion')).trim(),
        cantidad:num(v('cantidad')),fechaEntrega:leerFecha(v('fechaEntrega'),hoy),linea:String(v('linea')||'').trim(),
        fechaPedido:leerFecha(v('fechaPedido'),hoy),observaciones:String(v('observaciones')||'').trim(),
        estado:/cancel|anulad/.test(estadoTxt)?'CANCELADA':'ABIERTA'
      };
      const errores=validarOrden(Object.assign({id:'_'},orden),{existentes:[]});
      if(vistos.has(norm(orden.numero))&&orden.numero)errores.push('El N.º aparece repetido en el archivo.');
      if(errores.length){out.errores.push({fila:i+2,numero:orden.numero,mensaje:errores.join(' ')});return;}
      vistos.add(norm(orden.numero));
      const previa=porNumero.get(norm(orden.numero));
      if(!previa){out.crear.push(Object.assign({},orden,{origen,idExterno:orden.numero,sincronizadoEn:ahora}));return;}
      const campos=['cliente','marca','presentacion','cantidad','fechaEntrega','linea','fechaPedido','observaciones'];
      const cambios={};
      campos.forEach(c=>{if(String(previa[c]==null?'':previa[c])!==String(orden[c]==null?'':orden[c]))cambios[c]=orden[c];});
      // Una orden cancelada a mano en el sistema no se reabre desde la fuente; sí se cancela o se recupera si la fuente la devuelve.
      if(orden.estado==='CANCELADA'&&previa.estado!=='CANCELADA')cambios.estado='CANCELADA';
      else if(previa.estado==='RETIRADA')cambios.estado='ABIERTA';
      if(Object.keys(cambios).length){
        out.actualizar.push({id:previa.id,numero:previa.numero,cambios:Object.assign(cambios,{origen,idExterno:previa.idExterno||orden.numero,sincronizadoEn:ahora}),antes:Object.fromEntries(Object.keys(cambios).filter(k=>k in previa).map(k=>[k,previa[k]]))});
      }else out.sinCambio++;
    });
    if(opc.retirarAusentes){
      (existentes||[]).forEach(o=>{
        if((o.estado||'ABIERTA')==='ABIERTA'&&(o.origen==='excel'||o.origen==='csv'||o.origen==='sheets')&&!vistos.has(norm(o.numero)))out.retirar.push({id:o.id,numero:o.numero});
      });
    }
    return out;
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

  const API={num,norm,claveProducto,fechaOk,leerFecha,diasEntre,COLUMNAS,ESTADOS_GUARDADOS,mapearColumnas,validarOrden,coberturaOrdenes,estadoOrden,resumenOrdenes,importarFilas,aplicarImportacion};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  if(typeof window!=='undefined')window.glacialOrdenesVentaNucleo=API;
})(typeof window!=='undefined'?window:globalThis);
