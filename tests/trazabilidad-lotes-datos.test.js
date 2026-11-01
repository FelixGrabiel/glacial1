/* Trazabilidad de lotes (Etapa 1) — datos (base de documentos simulada), pantalla e integración. Una sola transacción al confirmar (evidencia + lote + unidad +
   movimiento + índice + correlativo + auditoría), duplicados, concurrencia, permisos, tiempo real y nada de stock SAP. node tests/trazabilidad-lotes-datos.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const N=require('../js/asistente/84-evidencias-insumos-nucleo.js');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

/* ---------- evidencia lista (todo legible) ---------- */
function evidencia(o={}){
  const base=Object.fromEntries(N.CAMPOS.map(c=>[c.campo,{literal:null,valor:null,estado:'ausente',origen:'imagen',historial:[]}]));
  const poner=(k,v,estado='legible')=>{base[k]={literal:String(v),valor:v,estado,origen:'imagen',historial:[]};};
  poner('proveedor','PLASTICOS DEL SUR S.A.');poner('producto','FILM TERMOCONTRAIBLE 17 MICRAS');poner('lote',o.lote||'2410-118');poner('numero_caja_bobina',o.bobina||'07');
  poner('orden_interna','OI-4411');poner('fecha_produccion','2026-10-10');poner('fecha_vencimiento','2027-10-10');poner('peso_neto_kg',25.4);poner('peso_bruto_kg',26.9);
  if(o.dudoso)base.peso_neto_kg.estado='requiere_revision';
  const id=sha('foto-'+(o.id||'1'));
  return {id,estado:o.estado||'pendiente',rev:o.rev||1,leyenda:o.leyenda||'',categoria:'polietileno',tipoDocumento:'etiqueta_insumo',campos:base,
    foto:{url:'supabase:glacial-fotos/asistente/evidencias/'+id+'.jpg',mimetype:'image/jpeg',bytes:100},archivoOriginal:'film.jpg',historialEstados:[{estado:'pendiente',accion:'importado',por:'Ana',en:1}],creadoPor:'Ana',creadoEn:1000+(Number(o.id)||0),actualizadoEn:1000};
}
const CATALOGO=[{id:'a1',itemCode:'105-001',nombre:'LAMINA TERMOENCOGIBLE 17 MICRAS',categoria:'LAMINA TERMOENCOGIBLE',marca:'',activo:true},{id:'a3',itemCode:'105-003',nombre:'TAPA 38 MM AZUL',categoria:'TAPA',marca:'',activo:true}];

/* ---------- entorno: base de documentos simulada con onSnapshot de colección y de documento, where y transacciones ---------- */
function entorno(rol,{cargarLotes=true}={}){
  const sb={console,Math,Number,Array,Object,String,Set,Map,JSON,Date,Promise,Error,setTimeout,clearTimeout,setInterval:()=>0,Uint8Array,ArrayBuffer,crypto:crypto.webcrypto};
  vm.createContext(sb);sb.window=sb;
  const docs=new Map(),oyentes=[];let auto=0;
  const snapDoc=k=>({exists:docs.has(k),data:()=>JSON.parse(JSON.stringify(docs.get(k)))});
  const avisar=()=>oyentes.slice().forEach(f=>f());
  const guardar=(k,d)=>docs.set(k,JSON.parse(JSON.stringify(d)));
  const ref=(c,id)=>({c,id,k:c+'/'+id,get:async()=>snapDoc(c+'/'+id),set:async d=>{guardar(c+'/'+id,d);avisar();},
    onSnapshot(cb){const f=()=>cb(snapDoc(c+'/'+id));oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}});
  const consulta=(c,filtro)=>({where:(campo,op,v)=>consulta(c,x=>filtro(x)&&x[campo]===v),
    onSnapshot(cb){const f=()=>cb({docs:[...docs.entries()].filter(([k,v])=>k.startsWith(c+'/')&&filtro(v)).map(([,v])=>({data:()=>JSON.parse(JSON.stringify(v))}))});oyentes.push(f);f();return()=>{const i=oyentes.indexOf(f);if(i>=0)oyentes.splice(i,1);};}});
  sb.docs=docs;sb.escrituras=[];sb.avisar=avisar;
  sb.db={collection:c=>Object.assign(consulta(c,()=>true),{doc:id=>ref(c,id||('auto'+(++auto)))}),
    runTransaction:async fn=>{const w=[];const t={get:async r=>snapDoc(r.k),set:(r,d)=>w.push([r,d])};await fn(t);w.forEach(([r,d])=>{guardar(r.k,d);sb.escrituras.push(r.k);});avisar();}};
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}},auth:()=>({currentUser:{uid:'u1'}})};
  sb.state={user:{rol,permisos:[],nombre:'Ana',username:'ana'},currentTab:'asistente'};
  sb.PERMISOS_APP=[];
  sb.glacialFotos={PREFIJO:'supabase:glacial-fotos/',disponible:()=>true,atributosImg:u=>`src="px" data-foto-ref="${u}"`,atributosEnlace:u=>`href="#" data-foto-ref="${u}"`};
  sb.modal={innerHTML:''};
  sb.document={getElementById:id=>id==='modal-root'?sb.modal:null,querySelector:()=>null};
  sb.AP_set=(k,v)=>{sb.apSet=[k,v];};
  vm.runInContext('function tienePermiso(p){return false;}',sb);
  const archivos=['74-inventario-insumos-nucleo','75-inventario-insumos-datos','84-evidencias-insumos-nucleo','85-evidencias-insumos-datos','86-evidencias-insumos-pantalla'];
  if(cargarLotes)archivos.push('87-trazabilidad-lotes-nucleo','88-trazabilidad-lotes-datos','89-trazabilidad-lotes-pantalla');
  archivos.forEach(n=>vm.runInContext(leer('js/asistente/'+n+'.js'),sb));
  return sb;
}
const sembrar=(sb,ev)=>{sb.docs.set('insumosEvidencias/'+ev.id,JSON.parse(JSON.stringify(ev)));sb.avisar();};
const ejecutar=async f=>{try{return {r:await f()};}catch(e){return {e};}};
const coleccion=(sb,c)=>[...sb.docs.entries()].filter(([k])=>k.startsWith(c+'/')).map(([,v])=>v);
const auditoria=sb=>coleccion(sb,'insumosAuditoria');

(async()=>{
  const sb=entorno('Asistente de Producción'),Z=sb.glacialTrazabilidadDatos,EVD=sb.glacialEvidenciasDatos,Dinv=sb.glacialInventarioDatos;
  ok(!!Z&&!!sb.iiLotesUI&&!!sb.glacialTrazabilidadNucleo,'los módulos de trazabilidad se cargan sobre el Inventario y las Evidencias');
  sb.docs.set('insumosCatalogo/catalogo',{id:'catalogo',items:CATALOGO});           // el catálogo del Inventario llega por su propia escucha
  let cambios=0;Z.alCambiar(()=>cambios++);Z.escuchar();EVD.escuchar();

  /* ---------- crear el primer lote ---------- */
  const e1=evidencia({id:'1'});sembrar(sb,e1);
  const s=Z.sugerencias(EVD.porId(e1.id));
  ok(s.candidatos.length>=1&&s.candidatos[0].id==='a1'&&s.datos.loteProveedor==='2410-118','sugiere el artículo del catálogo del Inventario para esa etiqueta');
  let r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e1.id,1,{articuloId:'a1'}));
  ok(r.r&&r.r.loteId==='LI-000001'&&r.r.unidadId==='LI-000001-07'&&r.r.accion==='lote_nuevo'&&r.r.estado==='EN_ALMACEN','confirmar y crear: lote LI-000001 y unidad LI-000001-07 en almacén');
  const lote=sb.docs.get('insumosLotes/LI-000001'),un=sb.docs.get('insumosUnidades/LI-000001-07'),mov=sb.docs.get('insumosLoteMovimientos/MOV-'+e1.id+'-RECEPCION'),ev=sb.docs.get('insumosEvidencias/'+e1.id);
  ok(lote&&lote.itemId==='a1'&&lote.unidades===1&&un&&un.pesoActual===25.4&&un.evidenciaId===e1.id&&un.estado==='EN_ALMACEN','el lote guarda el artículo elegido y la unidad su peso y su evidencia de origen');
  ok(mov&&mov.tipo==='RECEPCION'&&mov.en==='__TS__'&&mov.uid==='u1'&&mov.por==='Ana'&&mov.despues.estado==='EN_ALMACEN','el movimiento RECEPCION lleva quién y la hora del servidor');
  ok(ev.estado==='aprobado_dato'&&ev.loteId==='LI-000001'&&ev.unidadId==='LI-000001-07'&&ev.rev===3,'en la misma transacción la evidencia queda aprobada y marcada con su lote (aprobar + crear)');
  const ind=sb.docs.get('insumosLotesClaves/'+lote.clave),cont=sb.docs.get('insumosParametros/contador'),mem=sb.docs.get('insumosParametros/memoriaArticulos');
  ok(ind&&ind.loteId==='LI-000001'&&cont.siguiente===2&&mem&&Object.values(mem.mapa)[0]==='a1','índice de unicidad, correlativo siguiente y memoria del artículo elegido');
  const aud=auditoria(sb);
  ok(aud.length===2&&aud.some(a=>a.tipo==='CAMBIAR_ESTADO_EVIDENCIA'&&a.antes.estado==='pendiente')&&aud.some(a=>a.tipo==='CREAR_LOTE'&&a.despues.loteId==='LI-000001'&&a.despues.estado==='EN_ALMACEN'&&a.usuario==='Ana'),'auditoría en la misma transacción: aprobación de la evidencia y lote creado (antes → después, quién)');
  ok(sb.escrituras.every(k=>/^(insumosLotes|insumosUnidades|insumosLoteMovimientos|insumosLotesClaves|insumosParametros|insumosEvidencias|insumosAuditoria)\//.test(k)),'todo lo escrito es de trazabilidad, evidencias o auditoría: ninguna colección de stock SAP');
  ok(Z.cache.lotes.length===1&&Z.cache.unidades.length===1&&cambios>0,'los lotes y unidades llegan en tiempo real a quien los mira');
  const antesDeDoble=sb.escrituras.length;

  /* ---------- doble clic y concurrencia ---------- */
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e1.id,1,{}));
  ok(r.e&&r.e.codigo==='CONCURRENCIA'&&sb.escrituras.length===antesDeDoble,'doble clic con la revisión vieja: se rechaza y no escribe nada');
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e1.id,3,{}));
  ok(r.e&&r.e.codigo==='DUPLICADO'&&/LI-000001/.test(r.e.message)&&sb.escrituras.length===antesDeDoble&&sb.docs.get('insumosParametros/contador').siguiente===2,'repetir con la revisión nueva: «ya creó el lote»; no se crea otro lote ni se gasta otro correlativo');

  /* ---------- mismo lote, otra bobina ---------- */
  const e2=evidencia({id:'2',bobina:'08'});sembrar(sb,e2);
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e2.id,1,{}));
  ok(r.r&&r.r.accion==='unidad_agregada'&&r.r.loteId==='LI-000001'&&r.r.unidadId==='LI-000001-08'&&sb.docs.get('insumosLotes/LI-000001').unidades===2&&sb.docs.get('insumosParametros/contador').siguiente===2,'mismo lote del proveedor con otro n.º: se suma una unidad al lote existente (mismo LI-, sin gastar correlativo)');
  ok(auditoria(sb).some(a=>a.tipo==='AGREGAR_UNIDAD_LOTE'&&a.despues.unidadId==='LI-000001-08'),'queda auditado como unidad agregada');

  /* ---------- duplicado: misma bobina de nuevo ---------- */
  const e3=evidencia({id:'3',bobina:'7'});sembrar(sb,e3);
  const antes=sb.escrituras.length;
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e3.id,1,{}));
  ok(r.e&&r.e.codigo==='DUPLICADO'&&/ya existe/.test(r.e.message)&&sb.escrituras.length===antes&&sb.docs.get('insumosEvidencias/'+e3.id).estado==='pendiente','la misma bobina («7» = «07») otra vez: duplicado, no crea nada y la evidencia sigue pendiente (ni se aprueba)');

  /* ---------- lote nuevo (otro lote del proveedor) con leyenda de línea ---------- */
  const e4=evidencia({id:'4',lote:'2410-200',leyenda:'Pet 2'});sembrar(sb,e4);
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e4.id,1,{}));
  const u4=sb.docs.get('insumosUnidades/LI-000002-07'),m4=sb.docs.get('insumosLoteMovimientos/MOV-'+e4.id+'-ENTREGA_LINEA');
  ok(r.r&&r.r.loteId==='LI-000002'&&r.r.estado==='ENTREGADA_LINEA'&&u4&&u4.linea==='PET2'&&m4&&m4.tipo==='ENTREGA_LINEA'&&sb.docs.get('insumosParametros/contador').siguiente===3,'otro lote del proveedor: LI-000002; con la leyenda «Pet 2» la unidad nace ENTREGADA_LINEA en PET2 (movimiento ENTREGA_LINEA)');

  /* ---------- validaciones del núcleo dentro de la transacción ---------- */
  const e5=evidencia({id:'5',lote:'2410-300',dudoso:true});sembrar(sb,e5);
  const a5=sb.escrituras.length;
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e5.id,1,{}));
  ok(r.e&&r.e.codigo==='VALIDACION'&&/Confirma o corrige/.test(r.e.message)&&sb.escrituras.length===a5,'con un dato dudoso sin confirmar no se crea el lote (lo impide el núcleo) y no se escribe nada');
  const e6=evidencia({id:'6',lote:'2410-400'});e6.campos.lote.valor=null;sembrar(sb,e6);
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e6.id,1,{}));
  ok(r.e&&r.e.codigo==='VALIDACION'&&/lote del proveedor/.test(r.e.message)&&sb.escrituras.length===a5,'sin lote del proveedor no se crea el lote');
  const e7=evidencia({id:'7',lote:'2410-500'});sembrar(sb,e7);
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e7.id,1,{articuloId:'no-existe'}));
  ok(r.e&&r.e.codigo==='VALIDACION'&&/catálogo/.test(r.e.message)&&sb.escrituras.length===a5,'un artículo que ya no está en el catálogo se rechaza antes de escribir');
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia('f'.repeat(64),1,{}));
  ok(r.e&&r.e.codigo==='VALIDACION'&&/ya no existe/.test(r.e.message),'una evidencia que ya no existe se avisa');

  /* ---------- evidencia aprobada antes de esta fase: solo se crea el lote ---------- */
  const e8=evidencia({id:'8',lote:'2410-600',estado:'aprobado_dato',rev:4});sembrar(sb,e8);
  const audAntes=auditoria(sb).length;
  r=await ejecutar(()=>Z.crearLoteDesdeEvidencia(e8.id,4,{}));
  const nuevos=auditoria(sb).slice(audAntes);
  ok(r.r&&r.r.loteId==='LI-000003'&&sb.docs.get('insumosEvidencias/'+e8.id).estado==='aprobado_dato'&&nuevos.length===1&&nuevos[0].tipo==='CREAR_LOTE','una evidencia ya aprobada sin lote crea su lote sin volver a aprobar (un solo evento: lote creado)');

  /* ---------- permisos ---------- */
  const jefe=entorno('Jefe de Operaciones'),Zj=jefe.glacialTrazabilidadDatos;
  Zj.escuchar();
  ok(Zj.puedeVer()&&!Zj.puedeEscribir(),'Jefe de Operaciones: ve los lotes, no los crea');
  const ej=evidencia({id:'9'});sembrar(jefe,ej);
  r=await ejecutar(()=>Zj.crearLoteDesdeEvidencia(ej.id,1,{}));
  ok(r.e&&r.e.codigo==='PERMISO'&&jefe.escrituras.length===0,'un usuario de solo consulta no crea lotes (y no escribe nada)');
  const otro=entorno('Supervisor');
  ok(!otro.glacialTrazabilidadDatos.puedeVer()&&!otro.glacialTrazabilidadDatos.puedeEscribir(),'otros roles ni ven ni crean');

  /* ---------- pantalla: Lotes ---------- */
  const UI=sb.iiLotesUI;
  sb.iiLotesUI.usar({pintar:()=>{},activo:()=>false});
  let h=UI.html();
  ok(/Lotes de insumos/.test(h)&&/LI-000001/.test(h)&&/LI-000002/.test(h)&&/2410-118/.test(h)&&/no mueve|trazabilidad/i.test(h),'la pestaña Lotes lista los lotes (ID LI-, lote del proveedor) con su resumen');
  ok(/placeholder="Lote del proveedor, LI-…, producto u OI"/.test(h)&&/Estado/.test(h)&&/Categoría/.test(h)&&/Línea/.test(h),'buscador por lote, ID, producto u OI y filtros por estado, categoría y línea');
  vm.runInContext("window.ilSel('LI-000001')",sb);
  h=UI.html();
  ok(/Datos de la etiqueta/.test(h)&&/OI-4411/.test(h)&&/LAMINA TERMOENCOGIBLE 17 MICRAS/.test(h)&&/10\/10\/2026/.test(h)&&/10\/10\/2027/.test(h),'ficha del lote: datos de la etiqueta, OI, fechas y artículo del catálogo');
  ok(/LI-000001-07/.test(h)&&/LI-000001-08/.test(h)&&/En almacén/.test(h)&&/25\.4 kg/.test(h)&&/data-foto-ref="supabase:glacial-fotos\/asistente\/evidencias\//.test(h),'ficha: unidades con estado, pesos y enlace a la foto de origen (enlace firmado)');
  ok(/Línea de tiempo/.test(h)&&/Recepción en almacén/.test(h)&&!/<script/i.test(h),'ficha: línea de tiempo con los movimientos (y todo escapado)');
  ok(/@media\(max-width:560px\)/.test(UI.css)&&/@media\(max-width:900px\)/.test(UI.css)&&/data-t=/.test(h),'celular 360 px: la tabla de unidades pasa a tarjetas y las columnas a una sola');
  vm.runInContext("window.ilFiltro('linea','PET2')",sb);
  h=UI.html();
  const lista=h.split('id="il-lista">')[1].split('</aside>')[0];
  ok(/LI-000002/.test(lista)&&!/LI-000001/.test(lista),'el filtro por línea deja en la lista solo los lotes con unidades en esa línea')
  vm.runInContext("window.ilFiltro('linea','')",sb);
  const mostrar=vm.runInContext("window.glacialTrazabilidadNucleo.filtrarLotes(window.glacialTrazabilidadDatos.cache.lotes,window.glacialTrazabilidadDatos.cache.unidades,{linea:'PET2'}).map(l=>l.id).join()",sb);
  ok(mostrar==='LI-000002','filtro por línea: solo LI-000002 tiene unidades en PET2');
  /* tiempo real entre dos pantallas abiertas: lo que cree una persona aparece en la otra sin recargar */
  let repintados=0;UI.usar({pintar:()=>{repintados++;},activo:()=>true});
  const e10=evidencia({id:'10',lote:'2410-700'});sembrar(sb,e10);
  await Z.crearLoteDesdeEvidencia(e10.id,1,{});
  ok(repintados>0&&Z.cache.lotes.length>=4,'al crearse un lote otra pestaña abierta se repinta sola (tiempo real)');

  /* ---------- pantalla: Confirmar y crear lote (desde Evidencias) ---------- */
  const e11=evidencia({id:'11',bobina:'01',leyenda:'RECEPCIÓN'});sembrar(sb,e11);
  vm.runInContext("window.ilAbrirCrear('"+e11.id+"')",sb);
  let m=sb.modal.innerHTML;
  ok(/Confirmar y crear lote/.test(m)&&/lote nuevo|Se agregará la unidad/.test(m)&&/Leyenda de la foto: <b>RECEPCION<\/b>/.test(m)&&/En almacén/.test(m)&&/name="il-art"/.test(m)&&/No se registra stock SAP/.test(m),'el diálogo muestra qué se creará, la leyenda con que llegó la foto, el artículo sugerido y que no hay stock SAP');
  const dup=evidencia({id:'12',bobina:'7',lote:'2410-118'});sembrar(sb,dup);
  vm.runInContext("window.ilAbrirCrear('"+dup.id+"')",sb);
  m=sb.modal.innerHTML;
  ok(/duplicado y no se crea otra/.test(m)&&/id="il-m-ok" onclick="ilCrearOk\(\)" disabled/.test(m),'si la unidad ya existe, el diálogo avisa del duplicado y bloquea el botón');
  const malo=evidencia({id:'13'});malo.campos.numero_caja_bobina.valor=null;sembrar(sb,malo);
  vm.runInContext("window.ilAbrirCrear('"+malo.id+"')",sb);
  ok(/No se puede crear todavía/.test(sb.modal.innerHTML)&&/n\.º de caja/.test(sb.modal.innerHTML)&&/disabled/.test(sb.modal.innerHTML),'con datos incompletos explica qué falta y no deja confirmar');
  vm.runInContext("window.ilAbrirCrear('"+e11.id+"')",sb);
  await vm.runInContext("window.ilCrearOk()",sb);
  ok(sb.docs.get('insumosEvidencias/'+e11.id).loteId&&/LI-0000\d\d/.test(sb.docs.get('insumosEvidencias/'+e11.id).loteId),'al confirmar en el diálogo se crea el lote desde la pantalla');

  /* ---------- pantalla: la bandeja de Evidencias ---------- */
  const U=sb.iiEvidenciasUI;
  const p1=evidencia({id:'14',lote:'2410-800'});sembrar(sb,p1);
  vm.runInContext("window.ieSel('"+p1.id+"')",sb);
  let he=U.html();
  ok(/Confirmar y crear lote<\/button>/.test(he)&&!/Aprobar datos<\/button>/.test(he)&&/ilAbrirCrear/.test(he),'con la trazabilidad cargada, «Aprobar datos» pasa a ser «Confirmar y crear lote»');
  vm.runInContext("window.ieSel('"+e1.id+"')",sb);
  he=U.html();
  ok(/Lote <b>LI-000001<\/b>/.test(he)&&/Ver el lote/.test(he)&&!/Reabrir/.test(he)&&/LI-000001/.test(he),'una evidencia que ya creó su lote muestra el lote y «Ver el lote»; no se reabre');
  vm.runInContext("window.ieSel('"+e8.id+"')",sb);
  const antesBoton=U.html();
  ok(/Lote <b>LI-000003<\/b>/.test(antesBoton),'la evidencia aprobada antes de esta fase ahora tiene su lote');
  const viejo=evidencia({id:'15',estado:'aprobado_dato',lote:'2410-900'});sembrar(sb,viejo);
  vm.runInContext("window.ieSel('"+viejo.id+"')",sb);
  ok(/Crear lote desde esta evidencia/.test(U.html()),'una evidencia aprobada sin lote ofrece «Crear lote desde esta evidencia»');
  const consulta=entorno('Jefe de Operaciones');sembrar(consulta,p1);
  vm.runInContext("window.ieSel('"+p1.id+"')",consulta);
  const hc=consulta.iiEvidenciasUI.html();
  ok(!/Confirmar y crear lote/.test(hc)&&/Solo consulta/.test(hc),'solo consulta: sin botón de crear lote');
  const sinLotes=entorno('Asistente de Producción',{cargarLotes:false});sembrar(sinLotes,p1);
  vm.runInContext("window.ieSel('"+p1.id+"')",sinLotes);
  ok(/Aprobar datos<\/button>/.test(sinLotes.iiEvidenciasUI.html())&&!/Confirmar y crear lote/.test(sinLotes.iiEvidenciasUI.html()),'sin los módulos de lotes la bandeja sigue funcionando como antes (Aprobar datos)');

  /* ---------- integración ---------- */
  const html=leer('index.html'),pos=n=>html.indexOf('js/asistente/'+n);
  ok(pos('87-trazabilidad-lotes-nucleo.js')>pos('86-evidencias-insumos-pantalla.js')&&pos('88-trazabilidad-lotes-datos.js')>pos('87-trazabilidad-lotes-nucleo.js')&&pos('89-trazabilidad-lotes-pantalla.js')>pos('88-trazabilidad-lotes-datos.js')&&pos('89-trazabilidad-lotes-pantalla.js')<html.indexOf('js/nucleo/12-init.js'),'index.html carga 87, 88 y 89 después de Evidencias y antes de 12-init');
  const p72=leer('js/asistente/72-asistente-pantalla.js'),p76=leer('js/asistente/76-inventario-insumos-pantalla.js');
  ok(/\['lotes','Lotes','cajas'\]/.test(p72)&&/lotes:tabLotes/.test(p72)&&/function tabLotes\(\)/.test(p72)&&/iiLotesUI/.test(p72)&&/glacialTrazabilidadDatos/.test(p72),'el Asistente de Producción tiene la pestaña «Lotes» y cierra su escucha al salir');
  ok(/iiLotesUI\.css/.test(p76),'los estilos de Lotes viajan con los del Inventario');
  const n74=vm.runInContext('window.glacialInventarioNucleo',sb);
  ok(['CREAR_LOTE','AGREGAR_UNIDAD_LOTE'].every(t=>n74.TIPOS_AUDITORIA[t]&&n74.GRUPOS_AUDITORIA[n74.TIPOS_AUDITORIA[t].grupo]==='Trazabilidad de lotes'),'los tipos de auditoría de lotes existen en el grupo «Trazabilidad de lotes»');
  const archivos=['87-trazabilidad-lotes-nucleo','88-trazabilidad-lotes-datos','89-trazabilidad-lotes-pantalla'].map(n=>leer('js/asistente/'+n+'.js')).join('\n');
  ok(!/insumosCortes|insumosConteos|insumosCatalogo|importarCorte|filasStock|stockMinimo|OnHand|apMovimientos/.test(archivos),'ninguno de los 3 archivos toca stock SAP, cortes, conteos, catálogo ni movimientos de producción');
  const sql=leer('supabase/migraciones/glacial_34_trazabilidad_lotes.sql');
  ok(/insumosLotes/.test(sql)&&/insumosUnidades/.test(sql)&&/insumosLoteMovimientos/.test(sql)&&/insumosLotesClaves/.test(sql)&&/insumosParametros/.test(sql)&&/ii_esc/.test(sql)&&/ii_ver/.test(sql),'la migración define las 5 colecciones con las marcas ii_esc / ii_ver');
  ok(/if accion = 'delete' then return false/.test(sql)&&/if accion <> 'create' then return false/.test(sql)&&/n->>'uid' = u and n->'en' = ahora/.test(sql)&&/accion = 'create' and n->>'id' = d/.test(sql),'migración: nada se borra; los movimientos son inmutables (solo create, con uid y hora del servidor); el índice solo se crea');
  ok(/add column if not exists leyenda/.test(sql)&&/'leyenda', t\.leyenda/.test(sql)&&/raise exception/.test(sql)&&/glacial_24/.test(sql)&&/glacial_31/.test(sql)&&/glacial_33/.test(sql),'migración: columna leyenda opcional, pendientes la devuelve, y se detiene sin cambiar nada si faltan las migraciones previas');
  ok(/APLICADA en PRUEBAS/.test(sql)&&/PRODUCCIÓN pendiente/.test(sql)&&!/stock_sap|OnHand/.test(sql),'migración marcada como aplicada en PRUEBAS (PRODUCCIÓN pendiente) y sin nada de stock');
  const ing=leer('supabase/functions/evidencias-ingesta/index.ts'),ingN=leer('supabase/functions/evidencias-ingesta/nucleo.mjs');
  ok(/\.\.\.\(v\.leyenda \? \{ leyenda: v\.leyenda \} : \{\}\)/.test(ing)&&/slice\(0, 40\)/.test(ingN)&&/leyenda/.test(ingN),'la ingesta acepta la leyenda opcional (limpia y de máximo 40 caracteres) y la guarda');

  console.log(fallas?('\n'+fallas+' fallas'):'\ntodo correcto');
})();
