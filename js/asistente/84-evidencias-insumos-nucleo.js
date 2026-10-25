/* =============================================================
   GLACIAL · EVIDENCIAS DE INSUMOS — NÚCLEO (puro: sin Firestore ni pantalla; se prueba con node)
   -------------------------------------------------------------
   Bandeja de validación de las fotografías de etiquetas que llegan del grupo de WhatsApp y que OpenAI Vision ya leyó (proyecto aparte
   «glacial-whatsapp»: vision-v2/v3 + validador). Principio innegociable: WhatsApp aporta EVIDENCIA, OpenAI PROPONE datos, una persona
   autorizada los VALIDA y solo una operación explícitamente aprobada (Fase 4, otro permiso y otra pantalla) toca el inventario.
   Este archivo NO conoce el stock: aprobar los DATOS de una etiqueta no es registrar una entrada, transferencia ni consumo.

   Estados: pendiente → aprobado_dato | requiere_correccion | rechazado. «registrado» queda RESERVADO para la Fase 4 (no se puede alcanzar aquí).
   Cada dato importante es { literal, valor, estado, origen, historial }: el literal de la IA nunca se sobrescribe y cada cambio deja quién, cuándo y
   el valor anterior. Un dato dudoso (p. ej. 100 vs 1000) exige una confirmación humana explícita antes de aprobar.
   Documento de diseño: docs/asistente/evidencias-insumos.md.
   ============================================================= */
(function instalarEvidenciasInsumosNucleo(global){
  'use strict';

  const ESTADOS={pendiente:'Pendiente',requiere_correccion:'Requiere corrección',aprobado_dato:'Datos aprobados',rechazado:'Rechazado',registrado:'Registrado'};
  /* Transiciones permitidas en esta fase. «registrado» NO figura: lo habilita la Fase 4 desde otra operación. */
  const TRANSICIONES={
    pendiente:['aprobado_dato','requiere_correccion','rechazado'],
    requiere_correccion:['pendiente','rechazado'],
    aprobado_dato:['pendiente'],
    rechazado:['pendiente']
  };
  const EDITABLES=['pendiente','requiere_correccion'];
  const ESTADOS_CAMPO=['legible','dudoso','ausente','requiere_revision'];
  const SIN_CONFIRMAR=['dudoso','requiere_revision'];
  const CATEGORIAS=['preformas','tapas','etiquetas','bolsas','polietileno','cajas','asas','otro'];
  const TIPOS_DOCUMENTO=['etiqueta_insumo','hoja_produccion','otro'];
  const MOTIVO_MIN=5;

  /* Campos con procedencia, en el orden en que se muestran. tipo: texto | fecha | numero. */
  const CAMPOS=[
    {campo:'proveedor',etiqueta:'Proveedor',tipo:'texto',grupo:'Identificación'},
    {campo:'cliente',etiqueta:'Cliente',tipo:'texto',grupo:'Identificación'},
    {campo:'marca',etiqueta:'Marca',tipo:'texto',grupo:'Identificación'},
    {campo:'producto',etiqueta:'Producto',tipo:'texto',grupo:'Identificación'},
    {campo:'presentacion',etiqueta:'Presentación',tipo:'texto',grupo:'Identificación'},
    {campo:'codigo_producto',etiqueta:'Código del producto',tipo:'texto',grupo:'Identificación'},
    {campo:'lote',etiqueta:'Lote',tipo:'texto',grupo:'Trazabilidad'},
    {campo:'numero_caja_bobina',etiqueta:'N.º de caja / bobina',tipo:'texto',grupo:'Trazabilidad'},
    {campo:'orden_interna',etiqueta:'Orden interna (OI)',tipo:'texto',grupo:'Trazabilidad'},
    {campo:'orden_compra',etiqueta:'Orden de compra',tipo:'texto',grupo:'Trazabilidad'},
    {campo:'fecha_produccion',etiqueta:'Fecha de producción',tipo:'fecha',grupo:'Fechas'},
    {campo:'fecha_proceso',etiqueta:'Fecha de proceso',tipo:'fecha',grupo:'Fechas'},
    {campo:'fecha_etiqueta',etiqueta:'Fecha de la etiqueta (sin rótulo)',tipo:'fecha',grupo:'Fechas'},
    {campo:'fecha_vencimiento',etiqueta:'Fecha de vencimiento',tipo:'fecha',grupo:'Fechas'},
    {campo:'cantidad_valor',etiqueta:'Cantidad',tipo:'numero',grupo:'Cantidad y pesos'},
    {campo:'cantidad_unidad',etiqueta:'Unidad de la cantidad',tipo:'texto',grupo:'Cantidad y pesos'},
    {campo:'peso_neto_kg',etiqueta:'Peso neto (kg)',tipo:'numero',grupo:'Cantidad y pesos'},
    {campo:'peso_bruto_kg',etiqueta:'Peso bruto (kg)',tipo:'numero',grupo:'Cantidad y pesos'},
    {campo:'peso_declarado_kg',etiqueta:'Peso declarado (kg, sin «neto»)',tipo:'numero',grupo:'Cantidad y pesos'},
    {campo:'medidas',etiqueta:'Medidas',tipo:'texto',grupo:'Cantidad y pesos'}
  ];
  const DEF=Object.fromEntries(CAMPOS.map(c=>[c.campo,c]));
  /* El validador usa nombres planos de la v2; en `campos` v3 la cantidad se llama cantidad_valor. */
  const ALIAS={cantidad_unidades:'cantidad_valor',unidad_cantidad:'cantidad_unidad'};
  const campoDe=n=>ALIAS[n]||n;

  /* ---------- utilidades ---------- */
  const texto=v=>(typeof v==='string'?v:'');
  const recortar=(v,n)=>texto(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,n);
  const esFechaIso=v=>{
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
    const [a,m,d]=v.split('-').map(Number),f=new Date(Date.UTC(a,m-1,d));
    return f.getUTCFullYear()===a&&f.getUTCMonth()===m-1&&f.getUTCDate()===d;
  };
  const fechaPantalla=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(iso||'');};
  const clonar=o=>JSON.parse(JSON.stringify(o));
  const falla=(codigo,msg)=>{const e=new Error(msg);e.codigo=codigo;return e;};

  /** SHA-256 en hexadecimal de un ArrayBuffer (crypto.subtle: navegador y Node). */
  async function sha256Hex(buffer){
    const c=(global.crypto||{}).subtle;
    if(!c)throw falla('SIN_CRYPTO','Este navegador no puede calcular la huella de la foto.');
    const h=new Uint8Array(await c.digest('SHA-256',buffer));
    return [...h].map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  /** Normaliza lo escrito por una persona al tipo del campo. Devuelve {valor} o {error}. */
  function valorDeEntrada(campo,entrada){
    const def=DEF[campo];
    if(!def)return {error:'Campo desconocido: '+campo+'.'};
    const s=typeof entrada==='number'?String(entrada):texto(entrada).trim();
    if(s==='')return {valor:null};
    if(def.tipo==='numero'){
      const n=Number(s.replace(',','.'));
      if(!Number.isFinite(n)||n<0||n>1e9)return {error:def.etiqueta+': escribe un número válido (0 o más).'};
      return {valor:Math.round(n*10000)/10000};
    }
    if(def.tipo==='fecha')return esFechaIso(s)?{valor:s}:{error:def.etiqueta+': usa una fecha válida (AAAA-MM-DD).'};
    return {valor:recortar(s,200)};
  }

  /* ---------- construir el documento desde el resultado del validador ---------- */
  function campoSaneado(def,c){
    c=c&&typeof c==='object'?c:{};
    let valor=c.valor===undefined?null:c.valor;
    if(def.tipo==='numero')valor=Number.isFinite(Number(valor))&&valor!==null&&valor!==''?Number(valor):null;
    else if(def.tipo==='fecha')valor=esFechaIso(valor)?valor:null;
    else valor=valor===null||valor===undefined||valor===''?null:recortar(String(valor),200);
    const literal=c.literal===undefined||c.literal===null?null:recortar(String(c.literal),300);
    const estado=ESTADOS_CAMPO.includes(c.estado)?c.estado:(valor===null&&literal===null?'ausente':'legible');
    const origen=/^(imagen|humano|regla:[a-z0-9-]{1,40})$/.test(texto(c.origen))?c.origen:'imagen';
    const historial=(Array.isArray(c.historial)?c.historial:[]).slice(0,50).map(h=>({valor:h&&h.valor!==undefined?h.valor:null,origen:recortar(h&&h.origen,60),
      reemplazado_por:recortar(h&&h.reemplazado_por,60),razon:recortar(h&&h.razon,200),usuario:recortar(h&&h.usuario,80),en:recortar(h&&h.en,40)}));
    const s={literal,valor,estado,origen,historial};
    if(c.duda)s.duda=recortar(c.duda,400);
    if(c.valor_sugerido!==undefined&&c.valor_sugerido!==null)s.valor_sugerido=recortar(String(c.valor_sugerido),200);
    return s;
  }
  /**
   * registro: contenido de un «-revisado.json» (v2 o v3). Exige que la huella de la foto coincida con registro.sha256: una foto que no es la
   * de ese JSON no se importa (evita mezclar datos de una etiqueta con la imagen de otra).
   */
  function construirDocumento(registro,{sha256,foto,usuario,uid,ahora,leyenda}){
    if(!registro||typeof registro!=='object'||!registro.extraccion||typeof registro.extraccion!=='object')throw falla('FORMATO','El archivo no es un resultado de lectura de etiquetas (falta «extraccion»).');
    if(!/^[a-f0-9]{64}$/.test(texto(sha256)))throw falla('FORMATO','Falta la huella (SHA-256) de la foto.');
    if(registro.sha256&&String(registro.sha256).toLowerCase()!==sha256)throw falla('FOTO_NO_COINCIDE','La foto no corresponde a este resultado (la huella SHA-256 es distinta).');
    const x=registro.extraccion,fuente=x.campos&&typeof x.campos==='object'?x.campos:(registro.campos&&typeof registro.campos==='object'?registro.campos:null);
    const campos={};
    CAMPOS.forEach(def=>{
      let c=fuente&&fuente[def.campo];
      if(!c){                                                       // v2 plana: se construye el campo con la lectura original
        const literal=def.campo==='cantidad_valor'?x.cantidad_literal:def.campo==='peso_neto_kg'?x.peso_neto_literal:def.campo==='peso_bruto_kg'?x.peso_bruto_literal:x[def.campo];
        const respaldo=def.campo==='cantidad_valor'?x.cantidad_unidades:def.campo==='cantidad_unidad'?x.unidad_cantidad:undefined;     // v2 sin validar: la cantidad se llamaba cantidad_unidades
        c={literal,valor:x[def.campo]!==undefined&&x[def.campo]!==null?x[def.campo]:respaldo};
      }
      campos[def.campo]=campoSaneado(def,c);
    });
    const dudas=(registro.revision_local&&Array.isArray(registro.revision_local.campos_en_duda)?registro.revision_local.campos_en_duda:[]).slice(0,30);
    dudas.forEach(d=>{
      const k=campoDe(texto(d&&d.campo));
      if(campos[k]){campos[k].estado='requiere_revision';campos[k].duda=recortar(d.motivo,400);
        if(d.valor_sugerido!==undefined&&d.valor_sugerido!==null)campos[k].valor_sugerido=recortar(String(d.valor_sugerido),200);}
    });
    const en=Number(ahora)||Date.now();
    return {
      id:sha256,estado:'pendiente',rev:1,leyenda:recortar(leyenda||registro.leyenda,40),     // texto que acompañó la foto en WhatsApp (RECEPCIÓN, PET2…); lo interpreta la trazabilidad de lotes
      versionProcesador:recortar(registro.version_procesador,30),archivoOriginal:recortar(String(registro.archivo_original||'').split(/[\\/]/).pop(),120),
      analizadoEn:recortar(registro.analizado_en,40),modelo:recortar(registro.modelo,60),
      foto:{url:recortar(foto&&foto.url,300),mimetype:recortar(foto&&foto.mimetype,40),bytes:Number(foto&&foto.bytes)||0},
      tipoDocumento:TIPOS_DOCUMENTO.includes(x.tipo_documento)?x.tipo_documento:'otro',
      categoria:CATEGORIAS.includes(x.categoria)?x.categoria:'otro',
      textoRelevante:recortar(x.texto_relevante,4000),
      advertencias:(Array.isArray(x.advertencias)?x.advertencias:[]).slice(0,30).map(a=>recortar(a,400)),
      reglas:(registro.revision_local&&Array.isArray(registro.revision_local.reglas_aplicadas)?registro.revision_local.reglas_aplicadas:[]).slice(0,20).map(r=>recortar(r,40)),
      campos,
      historialEstados:[{estado:'pendiente',accion:'importado',por:recortar(usuario,80),en}],
      creadoPor:recortar(usuario,80),creadoUid:recortar(uid,80),creadoEn:en,actualizadoPor:recortar(usuario,80),actualizadoEn:en
    };
  }

  /* ---------- confirmaciones y ediciones ---------- */
  const camposSinConfirmar=doc=>CAMPOS.filter(def=>doc&&doc.campos&&doc.campos[def.campo]&&SIN_CONFIRMAR.includes(doc.campos[def.campo].estado)).map(def=>def.campo);
  const etiquetaCampo=c=>(DEF[c]||{etiqueta:c}).etiqueta;

  /**
   * Aplica ediciones y confirmaciones a una copia del documento. cambios: {campo: textoEscrito} (también «categoria» y «tipoDocumento»);
   * confirmar: [campo]. Devuelve {doc, eventos:[{tipo, campo, antes, despues}], errores}. Solo en estados editables.
   */
  function aplicarEdiciones(doc,{cambios={},confirmar=[]},usuario,en){
    const errores=[];
    if(!EDITABLES.includes(doc.estado))return {doc,eventos:[],errores:[`No se puede editar una evidencia «${ESTADOS[doc.estado]||doc.estado}»: reábrela primero.`]};
    const n=clonar(doc),eventos=[],ahora=recortar(typeof en==='string'?en:new Date(en||Date.now()).toISOString(),40);
    for(const [campo,entrada] of Object.entries(cambios)){
      if(campo==='categoria'||campo==='tipoDocumento'){
        const lista=campo==='categoria'?CATEGORIAS:TIPOS_DOCUMENTO;
        if(!lista.includes(entrada)){errores.push((campo==='categoria'?'Categoría':'Tipo de documento')+': valor no válido.');continue;}
        if(n[campo]!==entrada){eventos.push({tipo:'EDITAR_EVIDENCIA',campo,antes:n[campo],despues:entrada});n[campo]=entrada;}
        continue;
      }
      const r=valorDeEntrada(campo,entrada);
      if(r.error){errores.push(r.error);continue;}
      const c=n.campos[campo];if(!c){errores.push('Campo desconocido: '+campo+'.');continue;}
      if(c.valor===r.valor&&!SIN_CONFIRMAR.includes(c.estado))continue;      // sin cambio real
      if(c.valor!==r.valor){
        c.historial.push({valor:c.valor,origen:c.origen,reemplazado_por:'humano',usuario:recortar(usuario,80),en:ahora});
        eventos.push({tipo:'EDITAR_EVIDENCIA',campo,antes:c.valor,despues:r.valor});
        c.valor=r.valor;c.origen='humano';
      }else{                                                                  // mismo valor en un campo dudoso: es una confirmación
        c.historial.push({valor:c.valor,origen:c.origen,reemplazado_por:'confirmado',usuario:recortar(usuario,80),en:ahora});
        eventos.push({tipo:'CONFIRMAR_CAMPO',campo,antes:c.valor,despues:c.valor});
      }
      c.estado=r.valor===null&&c.literal===null?'ausente':'legible';delete c.duda;delete c.valor_sugerido;
    }
    for(const campo of confirmar){
      const c=n.campos[campo];
      if(!c){errores.push('Campo desconocido: '+campo+'.');continue;}
      if(!SIN_CONFIRMAR.includes(c.estado))continue;
      c.historial.push({valor:c.valor,origen:c.origen,reemplazado_por:'confirmado',usuario:recortar(usuario,80),en:ahora});
      eventos.push({tipo:'CONFIRMAR_CAMPO',campo,antes:c.valor,despues:c.valor});
      c.estado=c.valor===null&&c.literal===null?'ausente':'legible';delete c.duda;delete c.valor_sugerido;
    }
    if(errores.length)return {doc,eventos:[],errores};
    if(!eventos.length)return {doc,eventos:[],errores:[]};
    n.rev=(Number(n.rev)||1)+1;n.actualizadoPor=recortar(usuario,80);n.actualizadoEn=Number(en)||Date.now();
    if(n.estado==='requiere_correccion'){                                    // al corregir vuelve a la bandeja de pendientes
      n.estado='pendiente';n.historialEstados=(n.historialEstados||[]).concat([{estado:'pendiente',accion:'corregido',por:recortar(usuario,80),en:n.actualizadoEn}]);
    }
    return {doc:n,eventos,errores:[]};
  }

  /** Errores que impiden aprobar los datos y avisos que no lo impiden. */
  function validarAprobacion(doc){
    const errores=[],avisos=[];
    if(!doc||!doc.campos)return {errores:['Evidencia no válida.'],avisos};
    if(!EDITABLES.includes(doc.estado))errores.push('Solo se aprueba una evidencia pendiente o corregida.');
    const dudosos=camposSinConfirmar(doc);
    if(dudosos.length)errores.push('Confirma o corrige antes de aprobar: '+dudosos.map(etiquetaCampo).join(', ')+'.');
    const c=doc.campos;
    if(!c.producto||c.producto.valor===null)errores.push('Falta el producto.');
    if(doc.categoria==='otro')errores.push('Elige la categoría del material (no puede quedar en «otro»).');
    if(doc.tipoDocumento!=='etiqueta_insumo')errores.push('El documento debe ser una etiqueta de insumo.');
    if(c.peso_neto_kg.valor!==null&&c.peso_bruto_kg.valor!==null&&c.peso_bruto_kg.valor<c.peso_neto_kg.valor)errores.push('El peso bruto no puede ser menor que el peso neto.');
    if(c.cantidad_valor.valor!==null&&c.cantidad_unidad.valor===null)errores.push('Indica la unidad de la cantidad (UND, KG…).');
    if(c.lote.valor===null)avisos.push('No hay lote: la trazabilidad quedará incompleta.');
    if(c.cantidad_valor.valor===null&&c.peso_neto_kg.valor===null&&c.peso_declarado_kg.valor===null)avisos.push('No hay cantidad ni peso: no servirá para un movimiento de inventario más adelante.');
    return {errores,avisos};
  }

  const soloAdmin=(de,a)=>a==='pendiente'&&(de==='aprobado_dato'||de==='rechazado');          // reabrir
  const exigeMotivo=(de,a)=>a==='requiere_correccion'||a==='rechazado'||soloAdmin(de,a);

  /**
   * Cambia el estado. Devuelve {doc, evento:{antes, despues, motivo}}; lanza Error (con .codigo) si no corresponde:
   * transición no permitida, «registrado» (reservado a la Fase 4), motivo corto, reapertura sin ser Administrador o aprobación con datos sin confirmar.
   */
  function cambiarEstado(doc,a,{usuario,motivo,esAdmin,en}){
    const de=doc.estado;
    if(a==='registrado')throw falla('RESERVADO','«Registrado» se habilita en la Fase 4 desde otra operación y otro permiso. Aprobar los datos no registra stock.');
    if(de===a)throw falla('SIN_CAMBIO','La evidencia ya estaba en «'+(ESTADOS[a]||a)+'».');
    if(!(TRANSICIONES[de]||[]).includes(a))throw falla('TRANSICION','No se puede pasar de «'+(ESTADOS[de]||de)+'» a «'+(ESTADOS[a]||a)+'».');
    if(soloAdmin(de,a)&&!esAdmin)throw falla('PERMISO','Solo un Administrador puede reabrir una evidencia '+(de==='rechazado'?'rechazada':'aprobada')+'.');
    const m=recortar(motivo,300).trim();
    if(exigeMotivo(de,a)&&m.length<MOTIVO_MIN)throw falla('MOTIVO','Escribe el motivo (mínimo '+MOTIVO_MIN+' caracteres).');
    if(a==='aprobado_dato'){const v=validarAprobacion(doc);if(v.errores.length)throw falla('VALIDACION',v.errores.join(' '));}
    const ahora=Number(en)||Date.now(),n=clonar(doc);
    n.estado=a;n.rev=(Number(n.rev)||1)+1;n.actualizadoPor=recortar(usuario,80);n.actualizadoEn=ahora;
    n.historialEstados=(n.historialEstados||[]).concat([{estado:a,accion:a==='aprobado_dato'?'aprobado':a==='rechazado'?'rechazado':a==='requiere_correccion'?'correccion_solicitada':'reabierto',por:recortar(usuario,80),en:ahora,...(m?{motivo:m}:{})}]);
    return {doc:n,evento:{antes:{estado:de},despues:{estado:a,...(m?{motivo:m}:{})}}};
  }

  /* ---------- lista ---------- */
  const ORDEN_ESTADO={requiere_correccion:0,pendiente:1,aprobado_dato:2,rechazado:3,registrado:4};
  function contarPorEstado(lista){
    const r={total:lista.length};Object.keys(ESTADOS).forEach(k=>{r[k]=0;});
    lista.forEach(d=>{if(r[d.estado]!==undefined)r[d.estado]++;});
    return r;
  }
  const norm=v=>String(v==null?'':v).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  function filtrar(lista,{estado='',texto:t=''}={}){
    const q=norm(t);
    return lista.filter(d=>(!estado||d.estado===estado)&&(!q||[d.archivoOriginal,d.campos&&d.campos.producto&&d.campos.producto.valor,d.campos&&d.campos.proveedor&&d.campos.proveedor.valor,
      d.campos&&d.campos.lote&&d.campos.lote.valor,d.categoria].some(v=>norm(v).includes(q))));
  }
  const ordenar=lista=>lista.slice().sort((a,b)=>(ORDEN_ESTADO[a.estado]-ORDEN_ESTADO[b.estado])||(Number(b.creadoEn)||0)-(Number(a.creadoEn)||0));

  /* Escoge, por huella, el mejor resultado cuando se seleccionan varios JSON de la misma foto (revisado v3 > v2, y el más reciente). */
  function elegirPorFoto(registros){
    const puntaje=r=>(r&&r.campos?4:0)+(r&&r.revision_local&&r.revision_local.version==='validador-v3'?2:0)+(r&&r.revision_local?1:0);
    const mejor=new Map();
    registros.forEach(r=>{
      const h=String(r&&r.sha256||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(h))return;
      const a=mejor.get(h);
      if(!a||puntaje(r)>puntaje(a)||(puntaje(r)===puntaje(a)&&String(r.analizado_en||'')>String(a.analizado_en||'')))mejor.set(h,r);
    });
    return mejor;
  }

  const API={ESTADOS,TRANSICIONES,EDITABLES,ESTADOS_CAMPO,SIN_CONFIRMAR,CATEGORIAS,TIPOS_DOCUMENTO,CAMPOS,DEF,MOTIVO_MIN,sha256Hex,valorDeEntrada,construirDocumento,camposSinConfirmar,
    etiquetaCampo,aplicarEdiciones,validarAprobacion,soloAdmin,exigeMotivo,cambiarEstado,contarPorEstado,filtrar,ordenar,elegirPorFoto,fechaPantalla,esFechaIso,campoDe};
  global.glacialEvidenciasNucleo=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
