/* =============================================================
   GLACIAL · TRAZABILIDAD DE LOTES DE INSUMOS — NÚCLEO (puro: sin Firestore ni pantalla; se prueba con node)
   -------------------------------------------------------------
   Convierte la evidencia validada de una etiqueta (84-evidencias-insumos-nucleo.js) en un LOTE rastreable:
     Recepción (foto) → Validación → Lote y unidad en almacén → Entrega a línea → Uso en el cuadro → Cierre por peso.
   Este archivo define el modelo (lote → unidades → movimientos), las reglas de unicidad (un lote por proveedor+lote+producto; una unidad por
   lote+n.º de caja/bobina), la máquina de estados de la unidad, la lectura de la leyenda que acompaña a la foto y la sugerencia del artículo del
   catálogo del Inventario. NO conoce el stock SAP, el cálculo de producción, el Avance/Cierre ni el tareo: no mueve inventario.
   Etapa 1 usa: recepción, duplicados, artículo sugerido, ficha y línea de tiempo. Entrega a línea, uso en cuadro y cierre por peso (Etapa 2) y la copia
   a Google Drive (Etapa 3) reutilizan este modelo y esta máquina de estados.
   Documento de diseño: docs/asistente/trazabilidad-lotes.md.
   ============================================================= */
(function instalarTrazabilidadNucleo(global){
  'use strict';

  const LINEAS=['PET1','PET2','B7L','C20L','B20L'];
  const ESTADOS={EN_ALMACEN:'En almacén',ENTREGADA_LINEA:'Entregada a línea',EN_USO:'En uso',CONSUMIDA:'Consumida',OBSERVADA:'Observada',DEVUELTA_PROVEEDOR:'Devuelta al proveedor'};
  /* Transiciones permitidas de la unidad (las exige el núcleo, no solo la pantalla). */
  const TRANSICIONES={
    EN_ALMACEN:['ENTREGADA_LINEA','OBSERVADA'],
    ENTREGADA_LINEA:['EN_USO','EN_ALMACEN'],          // ENTREGADA_LINEA → EN_ALMACEN = vuelve sin usar (T4)
    EN_USO:['CONSUMIDA','EN_ALMACEN'],               // EN_USO → EN_ALMACEN = devolución parcial con peso
    OBSERVADA:['EN_ALMACEN','DEVUELTA_PROVEEDOR'],
    CONSUMIDA:[],DEVUELTA_PROVEEDOR:[]
  };
  /* Movimientos: cada uno pasa la unidad de un estado a otro. Son inmutables; una corrección es un movimiento nuevo (ANULACION) que apunta al anterior. */
  const MOVIMIENTOS={
    RECEPCION:{txt:'Recepción en almacén',de:[null],a:'EN_ALMACEN'},
    ENTREGA_LINEA:{txt:'Entrega a línea',de:['EN_ALMACEN',null],a:'ENTREGADA_LINEA'},       // «null»: la leyenda de línea la entrega al validar
    USO_CUADRO:{txt:'Uso en el cuadro',de:['ENTREGADA_LINEA'],a:'EN_USO'},
    RETORNO_ALMACEN:{txt:'Devuelta a almacén sin usar',de:['ENTREGADA_LINEA'],a:'EN_ALMACEN'},
    CONSUMO:{txt:'Consumo completo',de:['EN_USO'],a:'CONSUMIDA'},
    DEVOLUCION:{txt:'Devolución parcial a almacén',de:['EN_USO'],a:'EN_ALMACEN'},
    OBSERVAR:{txt:'Observada',de:['EN_ALMACEN'],a:'OBSERVADA'},
    LIBERAR:{txt:'Liberada',de:['OBSERVADA'],a:'EN_ALMACEN'},
    DEVOLUCION_PROVEEDOR:{txt:'Devuelta al proveedor',de:['OBSERVADA'],a:'DEVUELTA_PROVEEDOR'},
    ANULACION:{txt:'Anulación de un movimiento',de:null,a:null},
    UNION_LOTE:{txt:'Unida a otro lote (corrección de lote repetido)',de:null,a:null}       // no cambia el estado: la caja/bobina pasa a otro lote
  };
  /* Categorías de un lote (las mismas de Evidencias, 84-evidencias-insumos-nucleo.js). */
  const CATEGORIAS_LOTE=['preformas','tapas','etiquetas','bolsas','polietileno','cajas','asas','otro'];
  const LEYENDAS_DEFECTO=['RECEPCION','PET1','PET2','B7L','C20L','B20L','DEVOLUCION'];
  /* Parámetros editables (Etapa 2/3 los usan). No se inventan umbrales: sin configurar quedan en null y la pantalla pide definirlos. */
  const PARAMETROS_DEFECTO={version:1,toleranciaConsumoPct:null,diasAvisoVencimiento:null,leyendasValidas:LEYENDAS_DEFECTO.slice(),leyendaObligatoria:false};
  const CATEGORIAS_CATALOGO={
    preformas:['PREFORMA'],tapas:['TAPA'],etiquetas:['ETIQUETA','STICKER'],bolsas:['BOLSA','BOLSON'],
    polietileno:['LAMINA TERMOENCOGIBLE','STRETCH FILM','BOBINA'],cajas:['CAJA','CARTON'],asas:['ASA']
  };

  /* ---------- utilidades ---------- */
  const texto=v=>(typeof v==='string'?v:(typeof v==='number'?String(v):''));
  const norm=v=>String(v==null?'':v).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const recortar=(v,n)=>texto(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,n);
  const clonar=o=>JSON.parse(JSON.stringify(o));
  const falla=(codigo,msg)=>{const e=new Error(msg);e.codigo=codigo;return e;};
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const red=(n,d)=>{const f=Math.pow(10,d==null?3:d);return Math.round(num(n)*f)/f;};
  const valorDe=(doc,campo)=>{const c=doc&&doc.campos&&doc.campos[campo];return c&&c.valor!==undefined?c.valor:null;};

  /* ---------- identificadores y llaves de unicidad ---------- */
  const idLote=n=>'LI-'+String(Math.max(1,Math.floor(num(n)))).padStart(6,'0');
  const esIdLote=s=>/^LI-\d{6,}$/.test(String(s||''));
  /** Llave de unicidad del lote: proveedor + lote del proveedor + producto, normalizados (sin tildes, mayúsculas, sin separadores raros). Sirve de id del índice. */
  function claveLote({proveedor,loteProveedor,producto}){
    const p=[proveedor,loteProveedor,producto].map(x=>norm(x).replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60));
    return p.join('__');
  }
  /** N.º de caja/bobina normalizado: «7» y «07» son la misma; letras en mayúscula. Devuelve '' si no hay número utilizable. */
  function numeroUnidad(v){
    const s=norm(v).replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,20);
    if(!s)return '';
    if(/^\d+$/.test(s)){const sin=s.replace(/^0+/,'')||'0';return sin.padStart(2,'0');}
    return s;
  }
  const idUnidad=(loteId,numero)=>loteId+'-'+numeroUnidad(numero);

  /* ---------- leyenda que acompaña a la foto ---------- */
  /**
   * texto: lo que escribió quien mandó la foto. Reconoce, sin importar mayúsculas ni tildes, las leyendas válidas (RECEPCIÓN, PET1, PET2, B7L, C20L, B20L, DEVOLUCIÓN).
   * «PET 2», «pet-2» y «Pet2» valen como PET2. Si aparecen dos leyendas distintas es ambigua y no se interpreta.
   * Devuelve {leyenda, tipo:'RECEPCION'|'LINEA'|'DEVOLUCION'|'', linea, ambigua}.
   */
  function interpretarLeyenda(t,parametros){
    const validas=((parametros&&Array.isArray(parametros.leyendasValidas))?parametros.leyendasValidas:LEYENDAS_DEFECTO).map(x=>norm(x).replace(/[^A-Z0-9]/g,''));
    const s=' '+norm(t)+' ';
    /* Cada leyenda admite espacios o guiones entre sus letras y números («PET 2», «c-20-l»), pero solo como palabra completa. */
    const flexible=l=>(l.match(/[A-Z]+|\d+/g)||[]).join('[\\s-]*');
    const halladas=[...new Set(validas.filter(l=>l&&new RegExp('(^|[^A-Z0-9])'+flexible(l)+'($|[^A-Z0-9])').test(s)))];
    if(halladas.length>1)return {leyenda:'',tipo:'',linea:'',ambigua:true};
    const l=halladas[0]||'';
    return {leyenda:l,tipo:!l?'':l==='RECEPCION'?'RECEPCION':l==='DEVOLUCION'?'DEVOLUCION':LINEAS.includes(l)?'LINEA':'',linea:LINEAS.includes(l)?l:'',ambigua:false};
  }

  /* ---------- datos del lote desde la evidencia ---------- */
  /** Datos planos que se copian de la evidencia (ya validada por una persona). */
  function datosDeEvidencia(doc){
    const v=c=>valorDe(doc,c),s=c=>{const x=v(c);return x===null||x===undefined?'':String(x).trim();};
    const neto=v('peso_neto_kg'),decl=v('peso_declarado_kg');
    return {
      proveedor:s('proveedor'),producto:s('producto'),marca:s('marca'),categoria:(doc&&doc.categoria)||'otro',loteProveedor:s('lote'),numero:numeroUnidad(v('numero_caja_bobina')),
      ordenInterna:s('orden_interna'),ordenCompra:s('orden_compra'),fechaProduccion:s('fecha_produccion')||s('fecha_proceso')||s('fecha_etiqueta'),fechaVencimiento:s('fecha_vencimiento'),
      cantidad:v('cantidad_valor')!==null&&v('cantidad_valor')!==undefined?num(v('cantidad_valor')):null,unidadCantidad:s('cantidad_unidad'),
      pesoNeto:neto!==null&&neto!==undefined?num(neto):(decl!==null&&decl!==undefined?num(decl):null),pesoBruto:v('peso_bruto_kg')!==null&&v('peso_bruto_kg')!==undefined?num(v('peso_bruto_kg')):null,
      medidas:s('medidas'),codigoProducto:s('codigo_producto')
    };
  }
  /** Errores que impiden crear el lote (además de los de aprobar la evidencia) y avisos que no lo impiden. */
  function validarParaLote(doc,{parametros}={}){
    const errores=[],avisos=[];
    if(!doc||!doc.campos)return {errores:['Evidencia no válida.'],avisos,datos:null};
    const d=datosDeEvidencia(doc);
    if(!d.proveedor)errores.push('Falta el proveedor: es parte de la llave única del lote.');
    if(!d.producto)errores.push('Falta el producto.');
    if(!d.loteProveedor)errores.push('Falta el lote del proveedor: sin él no se puede crear un lote rastreable.');
    if(!d.numero)errores.push('Falta el n.º de caja o bobina: cada unidad se identifica por lote + n.º.');
    if(d.pesoNeto===null&&d.cantidad===null)errores.push('Falta el peso neto o la cantidad de la unidad.');
    if(d.pesoNeto!==null&&d.pesoNeto<=0)errores.push('El peso neto debe ser mayor que 0.');
    if(d.pesoNeto!==null&&d.pesoBruto!==null&&d.pesoBruto<d.pesoNeto)errores.push('El peso bruto no puede ser menor que el peso neto.');
    if(d.pesoNeto===null)avisos.push('No hay peso neto: la unidad se controlará por cantidad y no se podrá cerrar por peso.');
    if(!d.fechaVencimiento)avisos.push('No hay fecha de vencimiento: no se podrá avisar el vencimiento de esta unidad.');
    if(parametros&&parametros.leyendaObligatoria&&!doc.leyenda)errores.push('Esta foto llegó sin leyenda y la leyenda es obligatoria (Parámetros).');
    return {errores,avisos,datos:d};
  }

  /* ---------- artículo sugerido del catálogo del Inventario ---------- */
  const claveMemoria=d=>norm(d.proveedor).replace(/[^A-Z0-9]+/g,'-')+'|'+norm(d.producto).replace(/[^A-Z0-9]+/g,'-');
  const PALABRAS_VACIAS=new Set(['DE','DEL','LA','EL','CON','SIN','PARA','Y','X','POR','UND','UNIDAD','UNIDADES','KG','MM','CM','MICRAS','MILS']);
  const tokens=v=>norm(v).replace(/[^A-Z0-9.]+/g,' ').split(' ').filter(t=>t.length>1&&!PALABRAS_VACIAS.has(t));
  /**
   * catalogo: lista de artículos del Inventario ({id,itemCode,nombre,categoria,marca,activo}); memoria: {claveMemoria: itemId} de elecciones anteriores.
   * Devuelve hasta `max` candidatos ordenados por puntaje: lo ya elegido antes para ese proveedor+producto va primero.
   */
  function sugerirArticulos(catalogo,datos,memoria,max){
    max=max||5;
    const recordado=memoria&&memoria[claveMemoria(datos)];
    const cats=CATEGORIAS_CATALOGO[datos.categoria]||[];
    const tp=tokens(datos.producto+' '+(datos.medidas||'')),marca=norm(datos.marca);
    const out=[];
    (catalogo||[]).forEach(a=>{
      if(!a||a.activo===false)return;
      let p=0;const razones=[];
      if(recordado&&a.id===recordado){p+=1000;razones.push('elegido antes para este proveedor y producto');}
      if(cats.length&&cats.includes(a.categoria)){p+=40;razones.push('misma categoría');}
      else if(cats.length)p-=15;
      const ta=new Set(tokens(a.nombre));let comunes=0;tp.forEach(t=>{if(ta.has(t))comunes++;});
      if(comunes){p+=comunes*12;razones.push(comunes+' palabra'+(comunes>1?'s':'')+' en común');}
      if(marca&&norm(a.marca)===marca){p+=15;razones.push('misma marca');}
      if(datos.codigoProducto&&norm(a.itemCode)===norm(datos.codigoProducto)){p+=500;razones.push('mismo código');}
      if(p>0)out.push({id:a.id,itemCode:a.itemCode||'',nombre:a.nombre,categoria:a.categoria||'',puntaje:p,razones});
    });
    return out.sort((x,y)=>y.puntaje-x.puntaje||String(x.nombre).localeCompare(String(y.nombre),'es')).slice(0,max);
  }

  /** Búsqueda libre en TODO el catálogo (cuando el artículo no está entre los sugeridos): por nombre o código, palabras en cualquier orden. */
  function buscarArticulos(catalogo,consulta,max){
    const todas=v=>norm(v).replace(/[^A-Z0-9.]+/g,' ').split(' ').filter(Boolean);       // aquí cuentan también «3» y «KG» (3 kg ≠ 1 kg)
    const q=todas(consulta);if(!q.length)return [];
    return (catalogo||[]).filter(a=>a&&a.activo!==false).map(a=>{
      const tn=todas(a.nombre+' '+(a.itemCode||'')),cod=norm(a.itemCode);
      const ok=q.every(t=>tn.some(x=>x.startsWith(t))||cod===t);
      return ok?{id:a.id,itemCode:a.itemCode||'',nombre:a.nombre,categoria:a.categoria||'',razones:['búsqueda']}:null;
    }).filter(Boolean).sort((x,y)=>String(x.nombre).localeCompare(String(y.nombre),'es')).slice(0,max||8);
  }

  /* ---------- crear lote y unidad desde una evidencia ---------- */
  /**
   * Plan de la transacción «Confirmar y crear lote». Es PURO: recibe lo leído dentro de la transacción y devuelve los documentos a escribir.
   *  doc: evidencia (ya con los datos aprobados o por aprobar); lotePrevio: lote existente de esa llave o null; unidadPrevia: unidad con ese id o null;
   *  correlativo: siguiente número de lote (si el lote es nuevo); articulo: {id,itemCode,nombre} elegido del catálogo (opcional); leyenda: resultado de interpretarLeyenda.
   * Reglas: un lote por proveedor+lote+producto (mismo lote con otro n.º de unidad suma una unidad); una unidad por lote+n.º (si ya existe, DUPLICADO y no se crea).
   * Con leyenda de línea, la unidad nace ENTREGADA_LINEA (movimiento ENTREGA_LINEA); si no, EN_ALMACEN (RECEPCION).
   * fotoEn: cuándo se envió la foto (ms). Es la fecha del HECHO (recepción o entrega a línea) y la que vale para la trazabilidad; `en` es cuándo se validó y registró.
   */
  function planCrearLote({doc,lotePrevio,unidadPrevia,correlativo,articulo,leyenda,usuario,uid,en,parametros,fotoEn,fotoEnOrigen,unirAlLote,proveedorBanco}){
    const v=validarParaLote(doc,{parametros});
    if(v.errores.length)throw falla('VALIDACION',v.errores.join(' '));
    const d=v.datos,ahora=Number(en)||Date.now(),por=recortar(usuario,80);
    // Banco de proveedores (96-proveedores.js): el lote usa el nombre del banco (la llave ya no depende de cómo se leyó la etiqueta).
    if(proveedorBanco&&proveedorBanco.tipo==='CLIENTE')throw falla('VALIDACION','«'+d.proveedor+'» es el cliente ('+proveedorBanco.nombre+'), no el proveedor. Corrige el proveedor en la evidencia.');
    const proveedorLeido=d.proveedor;
    if(proveedorBanco&&proveedorBanco.nombre)d.proveedor=texto(proveedorBanco.nombre);
    const foto=Number(fotoEn)>0?Number(fotoEn):ahora,fotoOrigen=Number(fotoEn)>0?recortar(fotoEnOrigen||'whatsapp',20):'importacion';
    if(doc.loteId)throw falla('DUPLICADO','Esta evidencia ya creó el lote '+doc.loteId+'.');
    const clave=claveLote(d);
    let lote;const nuevo=!lotePrevio;
    if(nuevo){
      if(!Number.isFinite(Number(correlativo))||Number(correlativo)<1)throw falla('CORRELATIVO','No se pudo obtener el número de lote.');
      lote={id:idLote(correlativo),clave,proveedor:recortar(d.proveedor,120),proveedorId:proveedorBanco?recortar(proveedorBanco.id,80):'',proveedorLeido:recortar(proveedorLeido,120),producto:recortar(d.producto,160),marca:recortar(d.marca,60),categoria:d.categoria,loteProveedor:recortar(d.loteProveedor,60),
        fechaProduccion:d.fechaProduccion,fechaVencimiento:d.fechaVencimiento,ordenInterna:recortar(d.ordenInterna,60),ordenCompra:recortar(d.ordenCompra,60),
        itemId:articulo?recortar(articulo.id,80):'',itemCode:articulo?recortar(articulo.itemCode,40):'',itemNombre:articulo?recortar(articulo.nombre,160):'',
        unidades:0,recibidoEn:foto,rev:1,creadoPor:por,creadoUid:recortar(uid,80),creadoEn:ahora,actualizadoPor:por,actualizadoEn:ahora,historial:[]};
    }else{
      lote=clonar(lotePrevio);
      const clavesDelLote=[lote.clave].concat(Array.isArray(lote.clavesUnidas)?lote.clavesUnidas:[]);
      if(!clavesDelLote.includes(clave)){
        // La persona eligió agregarla a un lote parecido (posible repetido: el proveedor se leyó distinto). Se recuerda la llave para la próxima foto.
        if(!unirAlLote)throw falla('CLAVE','El lote existente no corresponde a esta llave (proveedor, lote y producto).');
        if(norm(lote.loteProveedor).replace(/[^A-Z0-9]/g,'')!==norm(d.loteProveedor).replace(/[^A-Z0-9]/g,''))throw falla('CLAVE','Solo se puede agregar a un lote con el mismo lote del proveedor.');
        lote.clavesUnidas=(Array.isArray(lote.clavesUnidas)?lote.clavesUnidas:[]).concat([clave]).slice(-50);
      }
      if(proveedorBanco&&!lote.proveedorId)lote.proveedorId=recortar(proveedorBanco.id,80);
      if(articulo&&!lote.itemId){lote.itemId=recortar(articulo.id,80);lote.itemCode=recortar(articulo.itemCode,40);lote.itemNombre=recortar(articulo.nombre,160);}
      if(!lote.fechaVencimiento&&d.fechaVencimiento)lote.fechaVencimiento=d.fechaVencimiento;
      if(!(Number(lote.recibidoEn)>0)||foto<Number(lote.recibidoEn))lote.recibidoEn=foto;          // primera foto del lote
    }
    const uId=idUnidad(lote.id,d.numero);
    if(unidadPrevia)throw falla('DUPLICADO','La unidad '+d.numero+' del lote '+d.loteProveedor+' ya existe ('+uId+'). No se crea otra.');
    const aLinea=!!(leyenda&&leyenda.tipo==='LINEA');
    const estado=aLinea?'ENTREGADA_LINEA':'EN_ALMACEN';
    const tipoMov=aLinea?'ENTREGA_LINEA':'RECEPCION';
    const unidad={id:uId,loteId:lote.id,numero:d.numero,pesoNeto:d.pesoNeto,pesoBruto:d.pesoBruto,cantidad:d.cantidad,unidadCantidad:recortar(d.unidadCantidad,20),pesoActual:d.pesoNeto,
      estado,linea:aLinea?leyenda.linea:'',bloque:'',fecha:'',cuadro:'',evidenciaId:recortar(doc.id,80),leyenda:recortar(doc.leyenda||'',40),observacion:'',
      recibidaEn:foto,recibidaOrigen:fotoOrigen,
      rev:1,creadoPor:por,creadoUid:recortar(uid,80),creadoEn:ahora,actualizadoPor:por,actualizadoEn:ahora,historial:[{estado,accion:tipoMov,por,en:foto,registradoEn:ahora}]};
    const mov={id:'MOV-'+recortar(doc.id,64)+'-'+tipoMov,tipo:tipoMov,loteId:lote.id,unidadId:uId,
      antes:{estado:null,pesoActual:null,linea:''},despues:{estado,pesoActual:d.pesoNeto,linea:unidad.linea},evidenciaId:recortar(doc.id,80),
      por,uid:recortar(uid,80),enMs:ahora,ocurridoEnMs:foto,ocurridoOrigen:fotoOrigen,motivo:'',anula:''};
    lote.unidades=num(lote.unidades)+1;lote.rev=(Number(lote.rev)||1)+(nuevo?0:1);lote.actualizadoPor=por;lote.actualizadoEn=ahora;
    lote.historial=(lote.historial||[]).concat([{accion:nuevo?'lote_creado':'unidad_agregada',unidadId:uId,por,en:ahora}]).slice(-200);
    return {lote,unidad,movimiento:mov,clave,nuevo,accion:nuevo?'lote_nuevo':'unidad_agregada',avisos:v.avisos};
  }

  /* ---------- entrega a línea (Etapa 2) ---------- */
  /** Estado de vencimiento de un lote. fecha y hoy en AAAA-MM-DD. diasAviso null = no hay umbral definido (solo se distingue vencido / vigente). */
  function estadoVencimiento(fecha,hoy,diasAviso){
    const f=texto(fecha).slice(0,10),h=texto(hoy).slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(f)||!/^\d{4}-\d{2}-\d{2}$/.test(h))return {tipo:'sin_fecha',dias:null};
    const dias=Math.round((Date.UTC(+f.slice(0,4),+f.slice(5,7)-1,+f.slice(8,10))-Date.UTC(+h.slice(0,4),+h.slice(5,7)-1,+h.slice(8,10)))/86400000);
    if(dias<0)return {tipo:'vencido',dias};
    if(Number.isFinite(Number(diasAviso))&&diasAviso!==null&&dias<=Number(diasAviso))return {tipo:'por_vencer',dias};
    return {tipo:'vigente',dias};
  }
  /**
   * Plan de «Entregar a línea» (puro): la unidad pasa de EN_ALMACEN a ENTREGADA_LINEA en la línea elegida y queda un movimiento ENTREGA_LINEA.
   * Un lote vencido NO se entrega (se puede marcar la unidad como observada); uno por vencer se entrega con aviso.
   */
  function planEntregaLinea({unidad,lote,linea,usuario,uid,en,hoy,parametros,motivo:nota}){
    if(!LINEAS.includes(linea))throw falla('VALIDACION','Elige la línea a la que se entrega.');
    const motivo=motivoNoPermitido(unidad,'ENTREGA_LINEA');
    if(motivo)throw falla('ESTADO',motivo);
    const venc=estadoVencimiento(lote&&lote.fechaVencimiento,hoy,parametros&&parametros.diasAvisoVencimiento);
    if(venc.tipo==='vencido')throw falla('VENCIDO','El lote '+(lote&&lote.loteProveedor||'')+' venció hace '+Math.abs(venc.dias)+' día(s): no se entrega a línea. Si la unidad sigue en almacén, márcala como observada.');
    const ahora=Number(en)||Date.now(),por=recortar(usuario,80),nueva=clonar(unidad);
    const antes={estado:unidad.estado,pesoActual:unidad.pesoActual===undefined?null:unidad.pesoActual,linea:unidad.linea||''};
    nueva.estado='ENTREGADA_LINEA';nueva.linea=linea;nueva.rev=(Number(unidad.rev)||1)+1;nueva.actualizadoPor=por;nueva.actualizadoEn=ahora;
    const m=recortar(nota||'',200);
    nueva.historial=(unidad.historial||[]).concat([Object.assign({estado:'ENTREGADA_LINEA',accion:'ENTREGA_LINEA',por,en:ahora},m?{motivo:m}:{})]).slice(-200);
    const mov={id:'MOV-'+recortar(unidad.id,60)+'-ENTREGA_LINEA-'+ahora,tipo:'ENTREGA_LINEA',loteId:unidad.loteId,unidadId:unidad.id,antes,
      despues:{estado:'ENTREGADA_LINEA',pesoActual:antes.pesoActual,linea},evidenciaId:recortar(unidad.evidenciaId||'',80),por,uid:recortar(uid,80),enMs:ahora,motivo:m,anula:''};
    const avisos=[];
    if(venc.tipo==='por_vencer')avisos.push('El lote vence en '+venc.dias+' día(s).');
    if(venc.tipo==='sin_fecha')avisos.push('El lote no tiene fecha de vencimiento registrada.');
    return {unidad:nueva,movimiento:mov,vencimiento:venc,avisos};
  }

  /* ---------- movimientos de almacén (T4): observar, liberar, devolver al proveedor, devolver a almacén sin usar ---------- */
  const MOV_SIMPLES={OBSERVAR:{motivo:true},LIBERAR:{motivo:false},DEVOLUCION_PROVEEDOR:{motivo:true},RETORNO_ALMACEN:{motivo:false}};
  /** Plan de un movimiento que solo cambia el estado (y, al volver a almacén, deja la línea). Puro. */
  function planMovimientoUnidad({unidad,tipo,motivo,usuario,uid,en}){
    const cfg=MOV_SIMPLES[tipo];
    if(!cfg)throw falla('VALIDACION','Movimiento no permitido aquí: '+tipo+'.');
    const no=motivoNoPermitido(unidad,tipo);
    if(no)throw falla('ESTADO',no);
    const m=recortar(motivo||'',200).trim();
    if(cfg.motivo&&m.length<5)throw falla('VALIDACION','Escribe el motivo (al menos 5 caracteres).');
    const ahora=Number(en)||Date.now(),por=recortar(usuario,80),nueva=clonar(unidad),destino=MOVIMIENTOS[tipo].a;
    const antes={estado:unidad.estado,pesoActual:unidad.pesoActual===undefined?null:unidad.pesoActual,linea:unidad.linea||''};
    nueva.estado=destino;
    if(destino==='EN_ALMACEN'){nueva.linea='';nueva.bloque='';nueva.fecha='';nueva.cuadro='';}
    if(tipo==='OBSERVAR')nueva.observacion=m;
    if(tipo==='LIBERAR')nueva.observacion='';
    nueva.rev=(Number(unidad.rev)||1)+1;nueva.actualizadoPor=por;nueva.actualizadoEn=ahora;
    nueva.historial=(unidad.historial||[]).concat([Object.assign({estado:destino,accion:tipo,por,en:ahora},m?{motivo:m}:{})]).slice(-200);
    const mov={id:'MOV-'+recortar(unidad.id,60)+'-'+tipo+'-'+ahora,tipo,loteId:unidad.loteId,unidadId:unidad.id,antes,
      despues:{estado:destino,pesoActual:antes.pesoActual,linea:nueva.linea||''},evidenciaId:recortar(unidad.evidenciaId||'',80),por,uid:recortar(uid,80),enMs:ahora,motivo:m,anula:''};
    return {unidad:nueva,movimiento:mov};
  }

  /* ---------- uso en el cuadro y peso final (Etapa 2b) ---------- */
  const textoCuadro=c=>String((c&&(c.texto||c.clave))||'').slice(0,160);
  /**
   * El supervisor marca que la unidad entró en uso en un cuadro: ENTREGADA_LINEA → EN_USO (misma línea) con el movimiento USO_CUADRO.
   * cuadro = {clave, fecha, bloque, texto}. Puro.
   */
  function planUsoEnCuadro({unidad,cuadro,usuario,uid,en}){
    const motivo=motivoNoPermitido(unidad,'USO_CUADRO');
    if(motivo)throw falla('ESTADO',motivo);
    if(!cuadro||!texto(cuadro.clave))throw falla('VALIDACION','Falta el cuadro en el que se usa la unidad.');
    const ahora=Number(en)||Date.now(),por=recortar(usuario,80),nueva=clonar(unidad);
    const antes={estado:unidad.estado,pesoActual:num(unidad.pesoActual),linea:unidad.linea||''};
    nueva.estado='EN_USO';nueva.bloque=recortar(cuadro.bloque,20);nueva.fecha=recortar(cuadro.fecha,10);nueva.cuadro=recortar(cuadro.clave,200);
    nueva.rev=(Number(unidad.rev)||1)+1;nueva.actualizadoPor=por;nueva.actualizadoEn=ahora;
    nueva.historial=(unidad.historial||[]).concat([{estado:'EN_USO',accion:'USO_CUADRO',por,en:ahora,motivo:textoCuadro(cuadro)}]).slice(-200);
    const mov={id:'MOV-'+recortar(unidad.id,60)+'-USO_CUADRO-'+ahora,tipo:'USO_CUADRO',loteId:unidad.loteId,unidadId:unidad.id,antes,
      despues:{estado:'EN_USO',pesoActual:antes.pesoActual,linea:antes.linea},evidenciaId:recortar(unidad.evidenciaId||'',80),por,uid:recortar(uid,80),enMs:ahora,motivo:textoCuadro(cuadro),anula:''};
    return {unidad:nueva,movimiento:mov};
  }
  /**
   * Cierre de una unidad en uso: «CONSUMIDA» (se terminó: peso 0) o «EN_ALMACEN» (devolución parcial con su peso final, mayor que 0 y no mayor que el que tenía).
   * Devuelve además cuánto se consumió (kg). Puro.
   */
  function planCierreUnidad({unidad,destino,pesoFinal,usuario,uid,en}){
    const tipo=destino==='CONSUMIDA'?'CONSUMO':destino==='EN_ALMACEN'?'DEVOLUCION':'';
    if(!tipo)throw falla('VALIDACION','Elige si la unidad se consumió o se devuelve a almacén.');
    const motivo=motivoNoPermitido(unidad,tipo);
    if(motivo)throw falla('ESTADO',motivo);
    const antesKg=num(unidad.pesoActual);
    let peso=0;
    if(tipo==='DEVOLUCION'){
      peso=Number(String(pesoFinal==null?'':pesoFinal).replace(',','.'));
      if(String(pesoFinal==null?'':pesoFinal).trim()===''||!Number.isFinite(peso))throw falla('VALIDACION','Escribe el peso final que queda, en kg.');
      if(peso<=0)throw falla('VALIDACION','Una devolución parcial debe tener peso mayor que 0. Si no queda nada, marca la unidad como consumida.');
      if(peso>antesKg+1e-9)throw falla('VALIDACION','El peso final ('+red(peso)+' kg) no puede ser mayor que el que tenía la unidad ('+red(antesKg)+' kg).');
    }
    const ahora=Number(en)||Date.now(),por=recortar(usuario,80),nueva=clonar(unidad);
    const antes={estado:unidad.estado,pesoActual:antesKg,linea:unidad.linea||''};
    nueva.estado=destino;nueva.pesoActual=red(peso);
    if(tipo==='DEVOLUCION'){nueva.linea='';nueva.bloque='';nueva.fecha='';nueva.cuadro='';}
    nueva.rev=(Number(unidad.rev)||1)+1;nueva.actualizadoPor=por;nueva.actualizadoEn=ahora;
    const consumidoKg=red(antesKg-peso);
    nueva.historial=(unidad.historial||[]).concat([{estado:destino,accion:tipo,por,en:ahora,motivo:'Consumido '+consumidoKg+' kg'}]).slice(-200);
    const mov={id:'MOV-'+recortar(unidad.id,60)+'-'+tipo+'-'+ahora,tipo,loteId:unidad.loteId,unidadId:unidad.id,antes,
      despues:{estado:destino,pesoActual:red(peso),linea:nueva.linea},evidenciaId:recortar(unidad.evidenciaId||'',80),por,uid:recortar(uid,80),enMs:ahora,
      motivo:'Consumido '+consumidoKg+' kg',consumidoKg,anula:''};
    return {unidad:nueva,movimiento:mov,consumidoKg};
  }

  /** Marca la evidencia con el lote y la unidad que nacieron de ella (no cambia su estado). */
  function evidenciaConLote(doc,{loteId,unidadId,usuario,en}){
    const n=clonar(doc),ahora=Number(en)||Date.now();
    n.loteId=loteId;n.unidadId=unidadId;n.rev=(Number(n.rev)||1)+1;n.actualizadoPor=recortar(usuario,80);n.actualizadoEn=ahora;
    n.historialEstados=(n.historialEstados||[]).concat([{estado:n.estado,accion:'lote_creado',por:recortar(usuario,80),en:ahora,motivo:loteId+' · '+unidadId}]);
    return n;
  }

  /* ---------- máquina de estados de la unidad ---------- */
  const transicionPermitida=(de,a)=>(TRANSICIONES[de]||[]).includes(a);
  /** ¿Puede el movimiento `tipo` aplicarse a esta unidad? Devuelve '' si sí o el motivo. «Una unidad OBSERVADA no se entrega a línea.» */
  function motivoNoPermitido(unidad,tipo){
    const m=MOVIMIENTOS[tipo];
    if(!m)return 'Movimiento desconocido: '+tipo+'.';
    if(tipo==='ANULACION'||tipo==='UNION_LOTE')return '';
    if(!unidad)return 'La unidad no existe.';
    if(tipo==='ENTREGA_LINEA'&&unidad.estado==='OBSERVADA')return 'Una unidad observada no se puede entregar a línea: libérala primero.';
    if(!m.de.includes(unidad.estado))return 'No se puede registrar «'+m.txt+'» en una unidad «'+(ESTADOS[unidad.estado]||unidad.estado)+'».';
    if(unidad.estado&&!transicionPermitida(unidad.estado,m.a))return 'Transición no permitida: '+(ESTADOS[unidad.estado]||unidad.estado)+' → '+(ESTADOS[m.a]||m.a)+'.';
    return '';
  }

  /* ---------- búsqueda y resúmenes ---------- */
  function unidadesDeLote(lote,unidades){return (unidades||[]).filter(u=>u.loteId===(lote&&lote.id)).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'es',{numeric:true}));}
  function resumenLote(lote,unidades){
    const us=unidadesDeLote(lote,unidades),porEstado={};
    Object.keys(ESTADOS).forEach(k=>{porEstado[k]=0;});
    us.forEach(u=>{if(porEstado[u.estado]!==undefined)porEstado[u.estado]++;});
    const lineas=[...new Set(us.map(u=>u.linea).filter(Boolean))];
    return {total:us.length,porEstado,lineas,pesoActualKg:red(us.reduce((s,u)=>s+(u.estado==='CONSUMIDA'||u.estado==='DEVUELTA_PROVEEDOR'?0:num(u.pesoActual)),0),3)};
  }
  /** f: {texto (lote del proveedor, ID LI, producto, proveedor, OI), estado (de alguna unidad), categoria, linea}. Más recientes primero. */
  function filtrarLotes(lotes,unidades,f){
    f=f||{};const q=norm(f.texto||'');
    const porLote=new Map();(unidades||[]).forEach(u=>{if(!porLote.has(u.loteId))porLote.set(u.loteId,[]);porLote.get(u.loteId).push(u);});
    return (lotes||[]).filter(l=>{
      if(l.unidoEn&&!(q&&norm(l.id)===q))return false;            // un lote unido a otro solo aparece si se busca por su ID
      const us=porLote.get(l.id)||[];
      if(f.categoria&&l.categoria!==f.categoria)return false;
      if(f.estado&&!us.some(u=>u.estado===f.estado))return false;
      if(f.linea&&!us.some(u=>u.linea===f.linea))return false;
      if(q&&![l.id,l.loteProveedor,l.producto,l.proveedor,l.ordenInterna,l.ordenCompra,l.itemNombre,l.itemCode].some(x=>norm(x).includes(q))&&!us.some(u=>norm(u.id).includes(q)))return false;
      return true;
    }).sort((a,b)=>(num(b.recibidoEn)||num(b.creadoEn))-(num(a.recibidoEn)||num(a.creadoEn))||String(b.id).localeCompare(String(a.id)));
  }
  /** Línea de tiempo de un lote o de una unidad: movimientos más recientes primero. */
  /** Cuándo ocurrió un movimiento: la foto para la recepción o entrega que nació de una foto; si no, cuándo se registró. */
  const ocurrido=m=>num(m&&m.ocurridoEnMs)>0?num(m.ocurridoEnMs):num(m&&m.enMs);
  function lineaDeTiempo(movimientos,{loteId,unidadId}={}){
    return (movimientos||[]).filter(m=>(!loteId||m.loteId===loteId)&&(!unidadId||m.unidadId===unidadId)).sort((a,b)=>ocurrido(b)-ocurrido(a)||String(b.id).localeCompare(String(a.id)));
  }
  /* ---------- cómo se llama la unidad física según la categoría (para no confundir «unidad» con lo que trae dentro) ---------- */
  const FISICA={preformas:['caja','cajas'],tapas:['caja','cajas'],cajas:['paquete','paquetes'],asas:['caja','cajas'],etiquetas:['bobina','bobinas'],bolsas:['bobina','bobinas'],polietileno:['bobina','bobinas']};
  /** {uno, varios, titulo} de la unidad física del lote: «bobina» para etiquetas, bolsas y polietileno; «caja» para preformas, tapas y asas. */
  function unidadFisica(categoria){
    const f=FISICA[String(categoria||'').toLowerCase()]||['caja / bobina','cajas / bobinas'];
    return {uno:f[0],varios:f[1],titulo:f[0].charAt(0).toUpperCase()+f[0].slice(1)};
  }
  /** Contenido total según las etiquetas (p. ej. 1026 UND), agrupado por la unidad escrita en la etiqueta. Solo unidades que siguen en planta. */
  function contenidoLote(unidades){
    const m=new Map();
    (unidades||[]).forEach(u=>{
      if(!u||u.estado==='CONSUMIDA'||u.estado==='DEVUELTA_PROVEEDOR'||u.cantidad===null||u.cantidad===undefined||u.cantidad==='')return;
      const k=String(u.unidadCantidad||'UND').trim().toUpperCase()||'UND';
      m.set(k,red((m.get(k)||0)+num(u.cantidad),3));
    });
    return [...m.entries()].map(([unidad,cantidad])=>({unidad,cantidad}));
  }
  /** Texto legible de un movimiento para la línea de tiempo. */
  function textoMovimiento(m){
    const t=(MOVIMIENTOS[m.tipo]||{txt:m.tipo}).txt,a=m.antes||{},d=m.despues||{};
    const partes=[t];
    if(d.linea&&d.linea!==a.linea)partes.push('→ '+d.linea);
    if(a.estado||d.estado)partes.push('('+(a.estado?ESTADOS[a.estado]||a.estado:'nueva')+' → '+(ESTADOS[d.estado]||d.estado||'—')+')');
    if(m.motivo)partes.push('— '+m.motivo);
    return partes.join(' ');
  }

  /* ---------- correcciones del lote (T3, auditoría 2026-11-06) ---------- */
  const alnum=v=>norm(v).replace(/[^A-Z0-9]/g,'');
  /** Sigue las uniones: un lote unido a otro (unidoEn) apunta al lote que lo recibió. Devuelve el id final (o el mismo). */
  function resolverLoteId(id,lotes){
    const porId=new Map((lotes||[]).map(l=>[l.id,l]));
    let actual=String(id||'');
    for(let i=0;i<10;i++){const l=porId.get(actual);if(!l||!l.unidoEn)break;actual=String(l.unidoEn);}
    return actual;
  }
  /**
   * Lotes que parecen el MISMO lote del proveedor aunque su llave sea otra (la lectura de la foto escribió distinto al proveedor o al producto):
   * mismo lote del proveedor (sin separadores) y misma categoría o palabras del producto en común. Sin los lotes unidos a otro.
   */
  function posiblesDuplicados(datos,lotes,{excepto}={}){
    const lp=alnum(datos&&datos.loteProveedor);if(!lp)return [];
    const clave=datos&&datos.clave?datos.clave:claveLote(datos||{});
    const tp=new Set(tokens(datos&&datos.producto));
    return (lotes||[]).filter(l=>{
      if(!l||l.unidoEn||l.id===excepto)return false;
      const claves=[l.clave].concat(Array.isArray(l.clavesUnidas)?l.clavesUnidas:[]);
      if(claves.includes(clave))return false;                    // es su propio lote, no un posible repetido
      if(alnum(l.loteProveedor)!==lp)return false;
      if(datos.categoria&&l.categoria===datos.categoria)return true;
      const ta=tokens(l.producto);
      return ta.length>0&&ta.filter(t=>tp.has(t)).length>=Math.ceil(Math.min(ta.length,tp.size||1)/2);
    }).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  }
  /** Cambiar la categoría de un lote mal clasificado (p. ej. una etiqueta guardada como preforma). Puro. */
  function planCambiarCategoria({lote,categoria,motivo,usuario,en}){
    if(!lote)throw falla('VALIDACION','El lote no existe.');
    if(lote.unidoEn)throw falla('ESTADO','Este lote se unió al '+lote.unidoEn+': corrige ese lote.');
    const cat=String(categoria||'').toLowerCase();
    if(!CATEGORIAS_LOTE.includes(cat))throw falla('VALIDACION','Elige una categoría válida.');
    if(cat===lote.categoria)throw falla('VALIDACION','El lote ya tiene esa categoría.');
    const m=recortar(motivo,200).trim();
    if(m.length<5)throw falla('VALIDACION','Escribe el motivo del cambio (al menos 5 caracteres).');
    const ahora=Number(en)||Date.now(),por=recortar(usuario,80),n=clonar(lote);
    n.categoria=cat;n.rev=(Number(lote.rev)||1)+1;n.actualizadoPor=por;n.actualizadoEn=ahora;
    n.historial=(lote.historial||[]).concat([{accion:'categoria_cambiada',por,en:ahora,motivo:(lote.categoria||'—')+' → '+cat+' · '+m}]).slice(-200);
    return {lote:n,antes:{categoria:lote.categoria||''},despues:{categoria:cat},motivo:m};
  }
  /**
   * Unir un lote repetido (origen) a otro (destino): sus cajas/bobinas pasan al destino (conservan su id, estado, pesos e historial), el origen queda
   * «unido a» el destino con 0 unidades (no se borra) y cada caja/bobina deja un movimiento UNION_LOTE. Exige el mismo lote del proveedor.
   * Si el destino ya tiene una caja/bobina con el mismo n.º, no se une (sería la misma etiqueta dos veces): se corrige primero. Puro.
   */
  function planUnirLotes({origen,destino,unidadesOrigen,unidadesDestino,motivo,usuario,uid,en}){
    if(!origen||!destino)throw falla('VALIDACION','Falta uno de los lotes.');
    if(origen.id===destino.id)throw falla('VALIDACION','Elige dos lotes distintos.');
    if(origen.unidoEn)throw falla('ESTADO','El lote '+origen.id+' ya se unió al '+origen.unidoEn+'.');
    if(destino.unidoEn)throw falla('ESTADO','El lote '+destino.id+' ya se unió al '+destino.unidoEn+': únelo a ese.');
    if(alnum(origen.loteProveedor)!==alnum(destino.loteProveedor))throw falla('VALIDACION','Solo se unen lotes con el mismo lote del proveedor ('+origen.loteProveedor+' ≠ '+destino.loteProveedor+').');
    const m=recortar(motivo,200).trim();
    if(m.length<5)throw falla('VALIDACION','Escribe el motivo de la unión (al menos 5 caracteres).');
    const usO=(unidadesOrigen||[]).filter(u=>u&&u.loteId===origen.id),usD=(unidadesDestino||[]).filter(u=>u&&u.loteId===destino.id);
    const numD=new Set(usD.map(u=>numeroUnidad(u.numero)));
    const choque=usO.filter(u=>numD.has(numeroUnidad(u.numero)));
    if(choque.length)throw falla('DUPLICADO','El lote '+destino.id+' ya tiene '+choque.map(u=>'el n.º '+u.numero).join(', ')+': revisa si es la misma etiqueta repetida antes de unir.');
    const ahora=Number(en)||Date.now(),por=recortar(usuario,80);
    const d=clonar(destino),o=clonar(origen);
    d.unidades=num(d.unidades)+usO.length;
    d.clavesUnidas=[...new Set((Array.isArray(d.clavesUnidas)?d.clavesUnidas:[]).concat([o.clave],Array.isArray(o.clavesUnidas)?o.clavesUnidas:[]).filter(Boolean))].slice(-50);
    d.lotesUnidos=[...new Set((Array.isArray(d.lotesUnidos)?d.lotesUnidos:[]).concat([o.id],Array.isArray(o.lotesUnidos)?o.lotesUnidos:[]))].slice(-50);
    if(!d.fechaVencimiento&&o.fechaVencimiento)d.fechaVencimiento=o.fechaVencimiento;
    if(!d.itemId&&o.itemId){d.itemId=o.itemId;d.itemCode=o.itemCode||'';d.itemNombre=o.itemNombre||'';}
    if(num(o.recibidoEn)>0&&(!(num(d.recibidoEn)>0)||num(o.recibidoEn)<num(d.recibidoEn)))d.recibidoEn=num(o.recibidoEn);
    d.rev=(Number(destino.rev)||1)+1;d.actualizadoPor=por;d.actualizadoEn=ahora;
    d.historial=(destino.historial||[]).concat([{accion:'lote_unido',por,en:ahora,motivo:'Recibe '+usO.length+' de '+o.id+' · '+m}]).slice(-200);
    o.unidoEn=d.id;o.unidades=0;o.rev=(Number(origen.rev)||1)+1;o.actualizadoPor=por;o.actualizadoEn=ahora;
    o.historial=(origen.historial||[]).concat([{accion:'unido_a',por,en:ahora,motivo:'Unido a '+d.id+' · '+m}]).slice(-200);
    const unidades=[],movimientos=[];
    usO.forEach(u=>{
      const n=clonar(u);
      n.loteId=d.id;n.loteOrigen=u.loteOrigen||o.id;n.rev=(Number(u.rev)||1)+1;n.actualizadoPor=por;n.actualizadoEn=ahora;
      n.historial=(u.historial||[]).concat([{estado:u.estado,accion:'UNION_LOTE',por,en:ahora,motivo:o.id+' → '+d.id}]).slice(-200);
      unidades.push(n);
      movimientos.push({id:'MOV-'+recortar(u.id,60)+'-UNION_LOTE-'+ahora,tipo:'UNION_LOTE',loteId:d.id,unidadId:u.id,
        antes:{estado:u.estado,pesoActual:u.pesoActual===undefined?null:u.pesoActual,linea:u.linea||'',loteId:o.id},
        despues:{estado:u.estado,pesoActual:u.pesoActual===undefined?null:u.pesoActual,linea:u.linea||'',loteId:d.id},
        evidenciaId:recortar(u.evidenciaId||'',80),por,uid:recortar(uid,80),enMs:ahora,motivo:'Unida desde '+o.id+' · '+m,anula:''});
    });
    return {destino:d,origen:o,unidades,movimientos,motivo:m};
  }

  const API={LINEAS,CATEGORIAS_LOTE,MOV_SIMPLES,planMovimientoUnidad,resolverLoteId,posiblesDuplicados,planCambiarCategoria,planUnirLotes,ESTADOS,TRANSICIONES,MOVIMIENTOS,LEYENDAS_DEFECTO,PARAMETROS_DEFECTO,CATEGORIAS_CATALOGO,idLote,esIdLote,claveLote,numeroUnidad,idUnidad,interpretarLeyenda,datosDeEvidencia,
    validarParaLote,claveMemoria,sugerirArticulos,buscarArticulos,planCrearLote,estadoVencimiento,planEntregaLinea,planUsoEnCuadro,planCierreUnidad,evidenciaConLote,transicionPermitida,motivoNoPermitido,unidadesDeLote,resumenLote,filtrarLotes,lineaDeTiempo,textoMovimiento,norm,ocurrido,unidadFisica,contenidoLote};
  global.glacialTrazabilidadNucleo=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
