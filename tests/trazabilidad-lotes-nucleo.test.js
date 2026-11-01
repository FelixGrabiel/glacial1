/* Trazabilidad de lotes (Etapa 1) — núcleo puro: llaves de unicidad, leyenda, artículo sugerido, crear lote/unidad desde una evidencia, máquina de estados,
   búsqueda y línea de tiempo. No toca stock SAP. node tests/trazabilidad-lotes-nucleo.test.js */
'use strict';
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const E=require('../js/asistente/84-evidencias-insumos-nucleo.js');
const T=require('../js/asistente/87-trazabilidad-lotes-nucleo.js');

/* Evidencia aprobada de ejemplo del prompt: film termocontraíble 17µ, lote 2410-118, bobina 07, neto 25.40, bruto 26.90. */
function evidencia(campos={},extra={}){
  const base=Object.fromEntries(E.CAMPOS.map(c=>[c.campo,{literal:null,valor:null,estado:'ausente',origen:'imagen',historial:[]}]));
  const poner=(k,v)=>{base[k]={literal:String(v),valor:v,estado:'legible',origen:'imagen',historial:[]};};
  poner('proveedor','PLASTICOS DEL SUR S.A.');poner('producto','FILM TERMOCONTRAIBLE 17 MICRAS');poner('marca','');poner('lote','2410-118');poner('numero_caja_bobina','07');
  poner('orden_interna','OI-4411');poner('orden_compra','OC-9021');poner('fecha_produccion','2026-10-10');poner('fecha_vencimiento','2027-10-10');
  poner('peso_neto_kg',25.4);poner('peso_bruto_kg',26.9);poner('cantidad_valor',1);poner('cantidad_unidad','UND');
  Object.entries(campos).forEach(([k,v])=>{if(v===null)base[k]={literal:null,valor:null,estado:'ausente',origen:'imagen',historial:[]};else poner(k,v);});
  return {id:'a'.repeat(64),estado:'aprobado_dato',rev:3,categoria:'polietileno',tipoDocumento:'etiqueta_insumo',campos:base,historialEstados:[],...extra};
}
const plan=(extra={})=>T.planCrearLote({doc:evidencia(),lotePrevio:null,unidadPrevia:null,correlativo:231,articulo:null,leyenda:T.interpretarLeyenda(''),usuario:'Ana',uid:'u1',en:1000,...extra});

/* ================= identificadores y llaves ================= */
ok(T.idLote(231)==='LI-000231'&&T.idLote(1)==='LI-000001'&&T.idLote(1234567)==='LI-1234567'&&T.esIdLote('LI-000231')&&!T.esIdLote('X-1'),'ID de lote: LI- + 6 dígitos (crece sin truncar)');
ok(T.numeroUnidad('7')==='07'&&T.numeroUnidad('07')==='07'&&T.numeroUnidad(' 007 ')==='07'&&T.numeroUnidad(12)==='12'&&T.numeroUnidad('b-3')==='B-3'&&T.numeroUnidad('')==='','n.º de unidad: «7», «07» y «007» son la misma; letras en mayúscula; vacío no sirve');
ok(T.idUnidad('LI-000231','07')==='LI-000231-07'&&T.idUnidad('LI-000231',7)==='LI-000231-07','ID de unidad: lote + n.º (LI-000231-07)');
{
  const a=T.claveLote({proveedor:'Plásticos del Sur S.A.',loteProveedor:'2410-118',producto:'Film termocontraíble 17 micras'});
  const b=T.claveLote({proveedor:'PLASTICOS  DEL SUR S.A.',loteProveedor:' 2410-118 ',producto:'FILM TERMOCONTRAIBLE 17 MICRAS'});
  ok(a===b&&!/[\/\s]/.test(a),'la llave del lote ignora tildes, mayúsculas, espacios y puntuación, y no trae «/» ni espacios (sirve de id)');
  ok(a!==T.claveLote({proveedor:'PLASTICOS DEL SUR S.A.',loteProveedor:'2410-119',producto:'FILM TERMOCONTRAIBLE 17 MICRAS'})&&a!==T.claveLote({proveedor:'PLASTICOS DEL SUR S.A.',loteProveedor:'2410-118',producto:'FILM 20 MICRAS'}),'otro lote del proveedor u otro producto = otra llave');
}

/* ================= leyenda ================= */
{
  const I=T.interpretarLeyenda;
  ok(I('RECEPCIÓN').tipo==='RECEPCION'&&I('recepcion').leyenda==='RECEPCION'&&I('Recepción de hoy').tipo==='RECEPCION','RECEPCIÓN se reconoce con o sin tilde, en cualquier caja y dentro de una frase');
  ok(I('PET2').linea==='PET2'&&I('pet 2').linea==='PET2'&&I('Pet-2').linea==='PET2'&&I('para PET1 turno día').linea==='PET1','PET1/PET2 se reconocen aunque tengan espacio o guion');
  ok(I('b7l').tipo==='LINEA'&&I('C20L').linea==='C20L'&&I('B 20 L').linea==='B20L'&&I('c-20-l').linea==='C20L','B7L, C20L y B20L se reconocen (con espacios o guiones entre letras y números)');
  ok(I('DEVOLUCIÓN').tipo==='DEVOLUCION'&&I('devolucion parcial').leyenda==='DEVOLUCION','DEVOLUCIÓN se reconoce');
  ok(I('').leyenda===''&&I('hola buenos días').leyenda===''&&I(null).leyenda==='','sin leyenda o con texto cualquiera: vacío');
  const amb=I('PET1 y PET2');
  ok(amb.ambigua===true&&amb.leyenda===''&&amb.tipo==='','dos leyendas distintas = ambigua, no se interpreta');
  ok(I('PET1 PET1').leyenda==='PET1'&&!I('PET1 PET1').ambigua,'la misma leyenda repetida no es ambigua');
  ok(I('PETROLEO').leyenda===''&&I('XPET2').leyenda==='','solo palabras completas: «PETROLEO» y «XPET2» no valen');
  ok(I('PET2',{leyendasValidas:['RECEPCION']}).leyenda==='','solo valen las leyendas de Parámetros');
}

/* ================= datos y validación ================= */
{
  const d=T.datosDeEvidencia(evidencia());
  ok(d.loteProveedor==='2410-118'&&d.numero==='07'&&d.pesoNeto===25.4&&d.pesoBruto===26.9&&d.fechaProduccion==='2026-10-10'&&d.ordenInterna==='OI-4411','los datos del lote salen de la evidencia validada');
  ok(T.datosDeEvidencia(evidencia({peso_neto_kg:null,peso_declarado_kg:30})).pesoNeto===30&&T.datosDeEvidencia(evidencia({fecha_produccion:null,fecha_proceso:'2026-10-09'})).fechaProduccion==='2026-10-09','sin peso neto usa el declarado; sin fecha de producción usa la de proceso');
  ok(T.validarParaLote(evidencia()).errores.length===0,'la evidencia completa del ejemplo no tiene errores');
  const v=(c,o)=>T.validarParaLote(evidencia(c),o).errores.join(' ');
  ok(/lote del proveedor/.test(v({lote:null}))&&/n\.º de caja/.test(v({numero_caja_bobina:null}))&&/proveedor/.test(v({proveedor:null}))&&/producto/.test(v({producto:null})),'sin proveedor, producto, lote o n.º de unidad no se crea el lote (llave incompleta)');
  ok(/peso neto o la cantidad/.test(v({peso_neto_kg:null,cantidad_valor:null})),'sin peso ni cantidad no se crea');
  ok(/mayor que 0/.test(v({peso_neto_kg:0}))&&/peso bruto/.test(v({peso_neto_kg:30,peso_bruto_kg:20})),'peso neto 0 o bruto menor que neto: error');
  ok(T.validarParaLote(evidencia({peso_neto_kg:null,cantidad_valor:1000})).errores.length===0&&T.validarParaLote(evidencia({peso_neto_kg:null,cantidad_valor:1000})).avisos.some(x=>/cantidad/.test(x)),'solo con cantidad (bolsas, tapas) sí se crea y avisa que no cerrará por peso');
  ok(T.validarParaLote(evidencia({fecha_vencimiento:null})).avisos.some(x=>/vencimiento/.test(x)),'sin vencimiento solo avisa');
  ok(/leyenda es obligatoria/.test(T.validarParaLote(evidencia(),{parametros:{leyendaObligatoria:true}}).errores.join(' '))&&!T.validarParaLote(evidencia({},{leyenda:'RECEPCION'}),{parametros:{leyendaObligatoria:true}}).errores.length,'leyenda obligatoria (Parámetros): sin leyenda no se crea, con leyenda sí');
}

/* ================= artículo sugerido ================= */
{
  const cat=[
    {id:'a1',itemCode:'105-001',nombre:'LAMINA TERMOENCOGIBLE 17 MICRAS',categoria:'LAMINA TERMOENCOGIBLE',marca:'',activo:true},
    {id:'a2',itemCode:'105-002',nombre:'LAMINA TERMOENCOGIBLE 20 MICRAS',categoria:'LAMINA TERMOENCOGIBLE',marca:'',activo:true},
    {id:'a3',itemCode:'105-003',nombre:'TAPA 38 MM AZUL',categoria:'TAPA',marca:'',activo:true},
    {id:'a4',itemCode:'105-004',nombre:'FILM TERMOCONTRAIBLE 17 MICRAS VIEJO',categoria:'LAMINA TERMOENCOGIBLE',marca:'',activo:false}];
  const d=T.datosDeEvidencia(evidencia());
  const s=T.sugerirArticulos(cat,d,{});
  ok(s.length>=1&&s[0].id==='a1'&&!s.some(x=>x.id==='a3')&&!s.some(x=>x.id==='a4'),'sugiere el artículo de la misma categoría con más palabras en común; no sugiere otra categoría ni artículos inactivos');
  ok(s[0].razones.some(r=>/categor/.test(r)),'dice por qué lo sugiere');
  const mem={[T.claveMemoria(d)]:'a2'};
  ok(T.sugerirArticulos(cat,d,mem)[0].id==='a2'&&/elegido antes/.test(T.sugerirArticulos(cat,d,mem)[0].razones[0]),'recuerda la elección anterior del mismo proveedor y producto y la pone primero');
  ok(T.sugerirArticulos([],d,{}).length===0&&T.sugerirArticulos(cat,{...d,producto:'ZZZ',categoria:'otro'},{}).length===0,'sin catálogo o sin coincidencias no inventa sugerencias');
  ok(T.sugerirArticulos(cat,d,{},1).length===1,'respeta el máximo de candidatos');
}

/* ================= crear lote y unidad ================= */
{
  const p=plan();
  ok(p.nuevo&&p.accion==='lote_nuevo'&&p.lote.id==='LI-000231'&&p.unidad.id==='LI-000231-07'&&p.unidad.loteId==='LI-000231','lote nuevo: LI-000231 y unidad LI-000231-07');
  ok(p.lote.loteProveedor==='2410-118'&&p.lote.proveedor==='PLASTICOS DEL SUR S.A.'&&p.lote.unidades===1&&p.lote.clave===T.claveLote(T.datosDeEvidencia(evidencia())),'el lote guarda los datos de la etiqueta, la llave y el conteo de unidades');
  ok(p.unidad.estado==='EN_ALMACEN'&&p.unidad.pesoNeto===25.4&&p.unidad.pesoBruto===26.9&&p.unidad.pesoActual===25.4&&p.unidad.linea===''&&p.unidad.evidenciaId===evidencia().id,'sin leyenda de línea la unidad nace EN_ALMACEN con su peso actual = neto y su evidencia de origen');
  ok(p.movimiento.tipo==='RECEPCION'&&p.movimiento.antes.estado===null&&p.movimiento.despues.estado==='EN_ALMACEN'&&p.movimiento.unidadId==='LI-000231-07'&&p.movimiento.por==='Ana','movimiento RECEPCION (antes → después, quién)');
  ok(p.movimiento.id==='MOV-'+evidencia().id+'-RECEPCION','el id del movimiento sale de la evidencia: un doble clic cae en el mismo documento');
  const l=plan({leyenda:T.interpretarLeyenda('PET2')});
  ok(l.unidad.estado==='ENTREGADA_LINEA'&&l.unidad.linea==='PET2'&&l.movimiento.tipo==='ENTREGA_LINEA'&&l.movimiento.despues.linea==='PET2','con leyenda de línea la unidad nace ENTREGADA_LINEA en esa línea (movimiento ENTREGA_LINEA)');
  ok(plan({leyenda:T.interpretarLeyenda('RECEPCIÓN')}).unidad.estado==='EN_ALMACEN','con leyenda RECEPCIÓN queda en almacén');
  const art=plan({articulo:{id:'a1',itemCode:'105-001',nombre:'LAMINA TERMOENCOGIBLE 17 MICRAS'}});
  ok(art.lote.itemId==='a1'&&art.lote.itemCode==='105-001'&&art.lote.itemNombre.startsWith('LAMINA'),'guarda el artículo del catálogo elegido');
  /* mismo lote, otra bobina: se suma una unidad */
  const otra=T.planCrearLote({doc:evidencia({numero_caja_bobina:'08'},{id:'b'.repeat(64)}),lotePrevio:p.lote,unidadPrevia:null,correlativo:999,articulo:null,leyenda:T.interpretarLeyenda(''),usuario:'Ana',uid:'u1',en:2000});
  ok(!otra.nuevo&&otra.accion==='unidad_agregada'&&otra.lote.id==='LI-000231'&&otra.unidad.id==='LI-000231-08'&&otra.lote.unidades===2&&otra.lote.rev===2,'mismo lote con otro n.º de unidad: se suma una unidad al lote existente (no usa otro correlativo)');
  ok(p.lote.unidades===1&&p.lote.rev===1,'el lote previo no se muta');
  /* duplicado */
  let e;try{T.planCrearLote({doc:evidencia({},{id:'c'.repeat(64)}),lotePrevio:p.lote,unidadPrevia:p.unidad,correlativo:1,articulo:null,leyenda:T.interpretarLeyenda(''),usuario:'Ana',uid:'u1',en:1});}catch(x){e=x;}
  ok(e&&e.codigo==='DUPLICADO'&&/ya existe/.test(e.message),'misma unidad (lote + n.º) otra vez: DUPLICADO y no se crea');
  try{plan({doc:evidencia({},{loteId:'LI-000100'})});e=null;}catch(x){e=x;}
  ok(e&&e.codigo==='DUPLICADO'&&/ya creó el lote/.test(e.message),'una evidencia que ya creó su lote no crea otro (doble clic)');
  try{plan({doc:evidencia({lote:null})});e=null;}catch(x){e=x;}
  ok(e&&e.codigo==='VALIDACION','con la evidencia incompleta lanza VALIDACION');
  try{plan({correlativo:0});e=null;}catch(x){e=x;}
  ok(e&&e.codigo==='CORRELATIVO','sin correlativo válido no crea un lote nuevo');
  try{T.planCrearLote({doc:evidencia({lote:'OTRO'}),lotePrevio:p.lote,unidadPrevia:null,correlativo:5,articulo:null,leyenda:T.interpretarLeyenda(''),usuario:'Ana',uid:'u1',en:1});e=null;}catch(x){e=x;}
  ok(e&&e.codigo==='CLAVE','un lote previo de otra llave no se mezcla');
  const marcada=T.evidenciaConLote(evidencia(),{loteId:'LI-000231',unidadId:'LI-000231-07',usuario:'Ana',en:5});
  ok(marcada.loteId==='LI-000231'&&marcada.unidadId==='LI-000231-07'&&marcada.rev===4&&marcada.estado==='aprobado_dato'&&marcada.historialEstados.at(-1).accion==='lote_creado','la evidencia queda marcada con su lote y unidad, sube la revisión y conserva su estado');
  ok(evidencia().rev===3&&!evidencia().loteId,'la evidencia original no se muta');
}

/* ================= máquina de estados ================= */
{
  const u=e=>({id:'LI-000231-07',estado:e});
  const m=T.motivoNoPermitido;
  ok(m(u('EN_ALMACEN'),'ENTREGA_LINEA')===''&&m(u('ENTREGADA_LINEA'),'USO_CUADRO')===''&&m(u('EN_USO'),'CONSUMO')===''&&m(u('EN_USO'),'DEVOLUCION')==='','camino normal: EN_ALMACEN → ENTREGADA_LINEA → EN_USO → CONSUMIDA / devolución parcial a EN_ALMACEN');
  ok(m(u('EN_ALMACEN'),'OBSERVAR')===''&&m(u('OBSERVADA'),'LIBERAR')===''&&m(u('OBSERVADA'),'DEVOLUCION_PROVEEDOR')==='','EN_ALMACEN ↔ OBSERVADA y OBSERVADA → DEVUELTA_PROVEEDOR');
  ok(/observada/.test(m(u('OBSERVADA'),'ENTREGA_LINEA')),'una unidad observada NO se entrega a línea');
  ok(m(u('EN_ALMACEN'),'USO_CUADRO')!==''&&m(u('EN_ALMACEN'),'CONSUMO')!==''&&m(u('ENTREGADA_LINEA'),'CONSUMO')!==''&&m(u('CONSUMIDA'),'DEVOLUCION')!==''&&m(u('DEVUELTA_PROVEEDOR'),'LIBERAR')!=='','saltos inválidos (usar sin entregar, consumir sin usar, mover una consumida o devuelta) se rechazan');
  ok(m(u('EN_USO'),'ENTREGA_LINEA')!==''&&m(u('EN_ALMACEN'),'OBSERVAR')===''&&m(u('ENTREGADA_LINEA'),'OBSERVAR')!=='','solo se observa una unidad que está en almacén');
  ok(/desconocido/.test(m(u('EN_ALMACEN'),'INVENTADO'))&&/no existe/.test(m(null,'CONSUMO'))&&m(null,'ANULACION')==='','movimiento desconocido, unidad inexistente y la anulación (se valida aparte)');
  ok(T.transicionPermitida('EN_USO','EN_ALMACEN')&&!T.transicionPermitida('CONSUMIDA','EN_ALMACEN')&&!T.transicionPermitida('EN_ALMACEN','CONSUMIDA'),'tabla de transiciones');
  ok(Object.keys(T.TRANSICIONES).every(k=>T.ESTADOS[k])&&Object.values(T.MOVIMIENTOS).every(x=>x.a===null||T.ESTADOS[x.a]),'todos los estados de la tabla existen');
}

/* ================= búsqueda, resumen y línea de tiempo ================= */
{
  const p1=plan(),p2=T.planCrearLote({doc:evidencia({lote:'2410-200',numero_caja_bobina:'01',producto:'TAPA 38 MM'},{id:'d'.repeat(64),categoria:'tapas'}),lotePrevio:null,unidadPrevia:null,correlativo:232,articulo:null,leyenda:T.interpretarLeyenda('PET1'),usuario:'Luis',uid:'u2',en:5000});
  const lotes=[p1.lote,p2.lote],unidades=[p1.unidad,p2.unidad];
  ok(T.filtrarLotes(lotes,unidades,{texto:'2410-118'}).length===1&&T.filtrarLotes(lotes,unidades,{texto:'li-000232'})[0].id==='LI-000232'&&T.filtrarLotes(lotes,unidades,{texto:'oi-4411'}).length===2,'buscador: lote del proveedor, ID LI, OI');
  ok(T.filtrarLotes(lotes,unidades,{texto:'LI-000231-07'}).length===1&&T.filtrarLotes(lotes,unidades,{texto:'termocontraible'}).length===1,'buscador: ID de unidad y producto (sin tildes ni mayúsculas)');
  ok(T.filtrarLotes(lotes,unidades,{estado:'ENTREGADA_LINEA'})[0].id==='LI-000232'&&T.filtrarLotes(lotes,unidades,{linea:'PET1'}).length===1&&T.filtrarLotes(lotes,unidades,{categoria:'tapas'}).length===1,'filtros por estado, línea y categoría');
  ok(T.filtrarLotes(lotes,unidades,{})[0].id==='LI-000232','los lotes más recientes salen primero');
  const r=T.resumenLote(p1.lote,unidades);
  ok(r.total===1&&r.porEstado.EN_ALMACEN===1&&r.pesoActualKg===25.4&&r.lineas.length===0,'resumen del lote: unidades por estado y peso actual');
  const mov=[p1.movimiento,{...p2.movimiento,enMs:9000},{id:'MOV-x',tipo:'OBSERVAR',loteId:'LI-000231',unidadId:'LI-000231-07',antes:{estado:'EN_ALMACEN'},despues:{estado:'OBSERVADA'},enMs:3000,motivo:'Bobina golpeada'}];
  const lt=T.lineaDeTiempo(mov,{loteId:'LI-000231'});
  ok(lt.length===2&&lt[0].tipo==='OBSERVAR'&&lt[1].tipo==='RECEPCION','línea de tiempo del lote: movimientos más recientes primero');
  ok(T.lineaDeTiempo(mov,{unidadId:'LI-000232-01'}).length===1,'línea de tiempo por unidad');
  ok(/Observada.*Bobina golpeada/.test(T.textoMovimiento(lt[0]))&&/Recepción en almacén/.test(T.textoMovimiento(lt[1]))&&/→ PET1/.test(T.textoMovimiento(p2.movimiento)),'texto legible de cada movimiento');
}

console.log(fallas?('\n'+fallas+' fallas'):'\ntodo correcto');
