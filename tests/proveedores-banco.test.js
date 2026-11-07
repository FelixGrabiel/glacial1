/* Banco de proveedores (Asistente › Proveedores · js/asistente/96-proveedores.js) y su uso al crear lotes (87/88/89).
   Con nombres reales leídos en las fotos pendientes (07/11/2026). */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const P=require(R+'/js/asistente/96-proveedores.js');
const T=require(R+'/js/asistente/87-trazabilidad-lotes-nucleo.js');

/* ---------- normalización y resolución ---------- */
ok(P.normProveedor('Corporación ASK S.A.C.')==='CORPORACION ASK'&&P.normProveedor('CORPORACION ASK S.R.')==='CORPORACION ASK'&&P.normProveedor("FULL PACK' S.A.C.")==='FULL PACK',
  'normProveedor: sin tildes, signos ni terminación de razón social');
const mk=(datos,lista)=>{const r=P.planGuardar({previo:null,datos,proveedores:lista||[],usuario:'Prueba',en:1});if(r.errores)throw new Error(r.errores.join(' '));return r.doc;};
const smi=mk({nombre:'SAN MIGUEL INDUSTRIAS PET S.A.',nombreCorto:'SMI',alias:['SM INDUSTRIAS PET S.A.','SW'],categorias:['preformas']});
const ask=mk({nombre:'Corporación ASK S.A.C.',alias:['Corpacim ASK','COMPONO???ACION ASK']},[smi]);
const frap=mk({nombre:'Consorcio FRAP S.A.C.',tipo:'CLIENTE'},[smi,ask]);
const banco=[smi,ask,frap];
ok(smi.id==='PRV-SAN-MIGUEL-INDUSTRIAS-PET'&&smi.rev===1&&smi.historial.length===1&&smi.historial[0].accion==='CREAR','planGuardar: id del nombre, versión 1 e historial');
ok(P.resolver('SAN MIGUEL INDUSTRIAS PET SA.',banco)===smi&&P.resolver('SM INDUSTRIAS PET S.A.',banco)===smi&&P.resolver('SW',banco)===smi,'resolver: variantes y alias de San Miguel (SW incluido)');
ok(['CORPORACION ASK S.A.','Corporacion ASK S.A.C','CORPORACION ASK','Corpacim ASK','COMPONO???ACION ASK'].every(n=>P.resolver(n,banco)===ask),'resolver: 5 formas de ASK → un proveedor');
ok(P.resolver('CONSORCIO FRAP',banco)===frap&&P.resolver('CONSORCIO FRAP',banco).tipo==='CLIENTE','resolver: Consorcio FRAP es el cliente');
ok(P.resolver('SUPERMASK / CONSORCIO FRAP',banco)===frap&&P.resolver('CORPORACION ASK / CONSORCIO FRAP',banco)===ask,'resolver: «A / B» prefiere al proveedor; si solo está el cliente, devuelve el cliente');
ok(P.resolver('FIBRAPRINT S.A.C.',banco)===null&&P.resolver('',banco)===null,'resolver: sin coincidencia exacta → null (no adivina)');
ok(P.resolver('SAN MIGUEL INDUSTRIAS PET',[Object.assign({},smi,{activo:false})])===null,'resolver: un proveedor inactivo no se usa');
ok(P.sugerir('SAN MIGUEL INDUSTRIA PET',banco)[0]===smi,'sugerir: nombre parecido → sugiere San Miguel');

/* ---------- validaciones ---------- */
const err=(d,l)=>(P.planGuardar({previo:null,datos:d,proveedores:l||banco,usuario:'x',en:1}).errores||[]).join(' ');
ok(/mínimo 3/.test(err({nombre:'AB'})),'planGuardar: nombre muy corto');
ok(/ya es un nombre de/.test(err({nombre:'Otro proveedor',alias:['Corpacim ASK']})),'planGuardar: un alias no puede pertenecer a otro proveedor');
ok(/Ya existe/.test(err({nombre:'San Miguel Industrias PET'},banco))||/ya es un nombre de/.test(err({nombre:'San Miguel Industrias PET'},banco)),'planGuardar: no se duplica un proveedor');
const ed=P.planGuardar({previo:ask,datos:{nombre:ask.nombre,alias:ask.alias.concat(['CORPORACION ASK SMC'])},proveedores:banco,usuario:'y',en:2,motivo:'Unificar nombres'});
ok(!ed.errores&&ed.doc.rev===2&&ed.doc.id===ask.id&&ed.doc.historial.length===2&&ed.doc.historial[1].antes.alias.length===2&&ed.doc.creadoPor==='Prueba','planGuardar: editar sube la versión y guarda antes/después');

/* ---------- unificar nombres ---------- */
const leidos=[['CORPORACION ASK S.A.',3],['Corporación ASK S.A.',1],['FilPack PLAST SAC',2],['FiPack PLAST SAC',3],['FULL PACK S.A.C.',4],["FULL PACK' S.A.C.",1],['FIBRAPRINT S.A.C.',4],['SAN MIGUEL INDUSTRIAS PET S.A.',16]].map(([texto,veces])=>({texto,veces}));
const g=P.agruparNombres(leidos,[smi]);
const de=t=>g.find(x=>x.nombres.some(n=>n.texto===t));
ok(!de('SAN MIGUEL INDUSTRIAS PET S.A.'),'agruparNombres: lo que ya está en el banco no aparece');
ok(de('FilPack PLAST SAC')===de('FiPack PLAST SAC')&&de('FULL PACK S.A.C.')===de("FULL PACK' S.A.C.")&&de('FULL PACK S.A.C.')!==de('FilPack PLAST SAC'),'agruparNombres: FilPack/FiPack juntos, Full Pack aparte');
ok(de('FIBRAPRINT S.A.C.').nombres.length===1,'agruparNombres: Fibraprint queda solo');

/* ---------- historial de lotes ---------- */
const L=[{id:'LI-1',proveedor:'SAN MIGUEL INDUSTRIAS PET S.A.',loteProveedor:'260929F320',producto:'90gr. Cr.3H CM',itemId:'P90',itemNombre:'Preforma 90 g',recibidoEn:10},
  {id:'LI-2',proveedor:'SM INDUSTRIAS PET S.A.',loteProveedor:'261011F320',producto:'90gr. Cr.3H CM',itemId:'P90',itemNombre:'Preforma 90 g',recibidoEn:20},
  {id:'LI-3',proveedorId:smi.id,proveedor:'x',loteProveedor:'261014G270',producto:'21.7 gr',recibidoEn:15},
  {id:'LI-4',proveedor:'SAN MIGUEL INDUSTRIAS PET S.A.',loteProveedor:'260929F320',producto:'90gr',itemId:'P90',unidoEn:'LI-1',recibidoEn:12},
  {id:'LI-5',proveedor:'FIBRAPRINT',loteProveedor:'0272-26',producto:'Etiqueta',recibidoEn:5}];
const U=[{id:'LI-1-01',loteId:'LI-1',recibidaEn:10,pesoNeto:276.99,estado:'CONSUMIDA'},{id:'LI-2-01',loteId:'LI-2',recibidaEn:20,pesoNeto:253.27,estado:'EN_USO'},
  {id:'LI-2-02',loteId:'LI-2',recibidaEn:30,pesoNeto:253.27,estado:'OBSERVADA'},{id:'LI-3-01',loteId:'LI-3',recibidaEn:15,pesoNeto:330.44,estado:'EN_ALMACEN'}];
const h=P.historialLotes(smi,L,U,banco),p90=h.find(x=>x.articulo==='I:P90');
ok(P.lotesDe(smi,L,banco).map(l=>l.id).join()==='LI-1,LI-2,LI-3','lotesDe: por id o por cualquiera de sus nombres; sin los unidos ni los de otro proveedor');
ok(p90.lotes.map(f=>f.lote.loteProveedor).join()==='260929F320,261011F320'&&!p90.lotes[0].cambio&&p90.lotes[1].cambio,'historialLotes: orden de llegada y cambio de lote marcado');
ok(p90.lotes[1].cajas===2&&Math.abs(p90.lotes[1].kg-506.54)<1e-9&&p90.lotes[1].observadas===1,'historialLotes: cajas, kg y observadas por lote');
const rs=P.resumen(smi,L,U,banco);
ok(rs.lotes===3&&rs.cajas===4&&rs.observadas===1&&rs.ultima===30&&rs.cambios===1,'resumen: lotes, cajas, observadas, última recepción y cambios');

/* ---------- resumen de evidencias pendientes ---------- */
const ev=(prov,lote,caja,tipo,cat)=>({estado:'pendiente',tipoDocumento:tipo||'etiqueta_insumo',categoria:cat||'preformas',campos:{proveedor:{valor:prov},lote:{valor:lote},numero_caja_bobina:{valor:caja}}});
const E=[ev('SAN MIGUEL INDUSTRIAS PET S.A.','261011F320','1'),ev('SM INDUSTRIAS PET S.A.','261011f320','2'),ev('Corpacim ASK','12158','3','etiqueta_insumo','bolsas'),ev('CORPORACION ASK','12158','4','etiqueta_insumo','polietileno'),
  ev('FLEXBAG','L2 275/26','','hoja_produccion','bolsas'),ev('BERIS','',''),ev('','',''),Object.assign(ev('X','1','1'),{estado:'aprobado_dato'})];
const rp=P.resumenPendientes(E,banco);
ok(rp.total===7&&rp.grupos.completas.length===4&&rp.grupos.casi.length===1&&rp.grupos.sinLote.length===1&&rp.grupos.sinDatos.length===1,'resumenPendientes: completas, casi, sin lote y sin datos (solo pendientes)');
const r12=rp.repetidos.find(x=>x.lote==='12158'),r26=rp.repetidos.find(x=>/261011/i.test(x.lote));
ok(r26&&r26.fotos===2&&r26.proveedores.length===1&&r12.categorias.length===2&&rp.lotesDistintos===3,'resumenPendientes: el mismo lote con el proveedor escrito distinto cuenta una vez; avisa categorías distintas');
ok(rp.nombresSinBanco.map(x=>x.texto).sort().join()==='BERIS,FLEXBAG','resumenPendientes: nombres que faltan en el banco');

/* ---------- creación de lotes con el banco (87) ---------- */
const doc={id:'ev1',estado:'aprobado_dato',rev:1,categoria:'preformas',campos:{proveedor:{valor:'SM INDUSTRIAS PET S.A.'},producto:{valor:'90gr. Cr.3H CM'},lote:{valor:'261011F320'},numero_caja_bobina:{valor:'1062345455'},peso_neto_kg:{valor:253.27},fecha_vencimiento:{valor:'2027-10-11'}}};
const conBanco=T.planCrearLote({doc,correlativo:7,usuario:'Ana',uid:'u',en:100,proveedorBanco:smi});
const sinBanco=T.planCrearLote({doc,correlativo:7,usuario:'Ana',uid:'u',en:100});
const doc2=JSON.parse(JSON.stringify(doc));doc2.campos.proveedor.valor='SAN MIGUEL INDUSTRIAS PET SA.';
const otraForma=T.planCrearLote({doc:doc2,correlativo:8,usuario:'Ana',uid:'u',en:100,proveedorBanco:smi});
ok(conBanco.lote.proveedor===smi.nombre&&conBanco.lote.proveedorId===smi.id&&conBanco.lote.proveedorLeido==='SM INDUSTRIAS PET S.A.','planCrearLote: usa el nombre del banco y guarda el leído');
ok(conBanco.clave===otraForma.clave&&sinBanco.clave!==otraForma.clave,'planCrearLote: dos formas de escribir el proveedor → la MISMA llave de lote (sin banco eran distintas)');
let msg='';try{T.planCrearLote({doc,correlativo:7,usuario:'Ana',uid:'u',en:100,proveedorBanco:frap});}catch(e){msg=e.message;}
ok(/es el cliente/.test(msg),'planCrearLote: si el proveedor leído es el cliente, no crea el lote y lo dice');
const previo=Object.assign({},sinBanco.lote,{clavesUnidas:[]});
const agregado=T.planCrearLote({doc:doc2,lotePrevio:previo,unidadPrevia:null,usuario:'Ana',uid:'u',en:200,unirAlLote:true,proveedorBanco:smi});
ok(agregado.lote.id===previo.id&&agregado.lote.clavesUnidas.includes(otraForma.clave)&&agregado.lote.proveedorId===smi.id,'lote creado antes con el nombre leído: la foto se suma a ese lote y guarda la llave del banco');

/* ---------- conexiones ---------- */
const d88=leer('js/asistente/88-trazabilidad-lotes-datos.js'),p89=leer('js/asistente/89-trazabilidad-lotes-pantalla.js'),p72=leer('js/asistente/72-asistente-pantalla.js'),html=leer('index.html');
ok(/PB\.resolver\(datos\.proveedor\)/.test(d88)&&/sClaveLeida/.test(d88)&&/proveedorBanco:banco/.test(d88),'88: resuelve el proveedor del banco, busca también por la llave leída y la pasa al plan');
ok(/claveLeida/.test(p89)&&/no está en el banco de proveedores/.test(p89),'89: la ventana de crear lote muestra el proveedor del banco');
ok(/\['proveedores','Proveedores'/.test(p72)&&/proveedores:tabProveedores/.test(p72)&&/TZ_TABS/.test(p72),'Asistente: pestaña Proveedores con los permisos de Lotes');
ok(/96-proveedores\.js\?v=\d{8}-\w+/.test(html)&&html.indexOf('96-proveedores.js')>html.indexOf('89-trazabilidad-lotes-pantalla.js'),'index.html carga 96-proveedores.js después de Lotes');
const mg=leer('supabase/migraciones/glacial_45_banco_proveedores.sql');
ok(/'insumosProveedores'\) then  -- glacial_45/.test(mg)&&/ii_ver/.test(mg)&&/position\('glacial_45' in def\) = 0/.test(mg)&&/encontrado % veces/.test(mg),'glacial_45: lectura ii_ver, escritura como los lotes, idempotente');

console.log(fallas?`\n${fallas} falla(s)`:'\nTodo correcto');
process.exit(fallas?1:0);
