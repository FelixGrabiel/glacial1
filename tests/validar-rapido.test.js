/* Evidencias › Validar rápido (auditoría de trazabilidad 13/11/2026, punto 3). node tests/validar-rapido.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const V=require('../js/asistente/98-validar-rapido.js');
const N=require('../js/asistente/84-evidencias-insumos-nucleo.js');

/* clasificar */
let k=V.clasificar([],[]);
ok(k.tipo==='lista','sin dudas ni errores: lista');
k=V.clasificar(['cantidad_valor'],['Confirma o corrige antes de aprobar: Cantidad.']);
ok(k.tipo==='dudas'&&k.errores.length===0&&k.dudosos[0]==='cantidad_valor','solo datos por confirmar: «con dudas» (el error de confirmar no cuenta como faltante)');
k=V.clasificar(['cantidad_valor'],['Confirma o corrige antes de aprobar: Cantidad.','Falta el proveedor: es parte de la llave única del lote.']);
ok(k.tipo==='incompleta'&&k.errores.length===1&&/proveedor/.test(k.errores[0]),'falta un dato de la llave: incompleta, con el motivo');

/* ordenarCola */
const c=V.ordenarCola([
  {id:'d1',tipo:'dudas',categoria:'tapas',lote:'T-1',fotoMs:1},
  {id:'i1',tipo:'incompleta',categoria:'tapas',lote:'',fotoMs:0},
  {id:'l2',tipo:'lista',categoria:'tapas',lote:'T-2',fotoMs:5},
  {id:'l1',tipo:'lista',categoria:'etiquetas',lote:'E 9',fotoMs:2},
  {id:'l3',tipo:'lista',categoria:'tapas',lote:'t2',fotoMs:9},
  {id:'l4',tipo:'lista',categoria:'etiquetas',lote:'E-9',fotoMs:7}]);
ok(c.map(x=>x.id).join()==='l1,l4,l2,l3,d1,i1','orden: listas, con dudas, incompletas; las del mismo lote del proveedor juntas (sin separadores), la más antigua primero');

/* cambiosDe */
const doc={categoria:'tapas',campos:{proveedor:{valor:'PROV',estado:'legible'},cantidad_valor:{valor:12000,estado:'requiere_revision'},lote:{valor:'T-1',estado:'requiere_revision'},peso_neto_kg:{valor:null,estado:'ausente'}}};
const defs=[{campo:'proveedor'},{campo:'cantidad_valor'},{campo:'lote'},{campo:'peso_neto_kg'}];
let r=V.cambiosDe(doc,{proveedor:'PROV',cantidad_valor:'1200',lote:'T-1',peso_neto_kg:''},'tapas',defs,N.SIN_CONFIRMAR);
ok(r.cambios.cantidad_valor==='1200'&&Object.keys(r.cambios).length===1&&r.confirmar.join()==='lote','lo corregido va como cambio; lo dudoso que se deja igual se confirma; lo legible no se toca');
r=V.cambiosDe(doc,{proveedor:' PROV ',cantidad_valor:'12000',lote:'T-1',peso_neto_kg:''},'etiquetas',defs,N.SIN_CONFIRMAR);
ok(!r.cambios.proveedor&&r.cambios.categoria==='etiquetas'&&r.confirmar.join()==='cantidad_valor,lote','espacios sobrantes no son un cambio; la categoría cambiada sí');
/* Con las reglas reales: tras aplicar los cambios ya no queda nada por confirmar. */
const vacio=()=>({literal:null,valor:null,estado:'ausente',origen:'imagen',historial:[]});
const campos=Object.fromEntries(N.CAMPOS.map(x=>[x.campo,vacio()]));
const poner=(k2,v)=>{campos[k2]={literal:String(v),valor:v,estado:'legible',origen:'imagen',historial:[]};};
poner('proveedor','PROV SAC');poner('producto','TAPA');poner('lote','T-1');poner('cantidad_valor',12000);poner('cantidad_unidad','UND');
const d=N.construirDocumento({estado:'pendiente_validacion',sha256:'a'.repeat(64),extraccion:{tipo_documento:'etiqueta_insumo',categoria:'tapas'},campos,
  revision_local:{campos_en_duda:[{campo:'cantidad_unidades',motivo:'¿12000 o 1200?'}]}},{sha256:'a'.repeat(64),foto:{url:''},usuario:'Bot',ahora:1});
ok(N.camposSinConfirmar(d).join()==='cantidad_valor','la foto de prueba tiene la cantidad por revisar');
const val=Object.fromEntries(N.CAMPOS_VISIBLES.map(x=>[x.campo,d.campos[x.campo].valor===null?'':String(d.campos[x.campo].valor)]));val.cantidad_valor='1200';
r=V.cambiosDe(d,val,'tapas',N.CAMPOS_VISIBLES,N.SIN_CONFIRMAR);
const ap=N.aplicarEdiciones(d,r,'Ana',2);
ok(!ap.errores.length&&N.camposSinConfirmar(ap.doc).length===0&&ap.doc.campos.cantidad_valor.valor===1200&&ap.doc.campos.cantidad_valor.origen==='humano','con las reglas de Evidencias: la corrección queda como dato de una persona y ya no hay nada por confirmar');
ok(N.validarAprobacion(ap.doc).errores.length===0,'la evidencia queda lista para aprobar');

/* pantalla e integración */
const P=fs.readFileSync(R+'/js/asistente/98-validar-rapido.js','utf8'),P86=fs.readFileSync(R+'/js/asistente/86-evidencias-insumos-pantalla.js','utf8'),P89=fs.readFileSync(R+'/js/asistente/89-trazabilidad-lotes-pantalla.js','utf8'),H=fs.readFileSync(R+'/index.html','utf8');
ok(/ev\.guardarEdiciones\(id,d\.rev,\{cambios,confirmar\}\)/.test(P)&&/z\.crearLoteDesdeEvidencia\(id,doc\.rev,\{articuloId\}\)/.test(P),'usa los dos pasos existentes: guardar ediciones (auditoría por dato) y crear el lote (mismas reglas)');
ok(/g\.duplicados&&g\.duplicados\.length\)\{S\.ocupado=false/.test(P)&&/bloqueo\|\|S\.ocupado\?'disabled'/.test(P),'con un posible lote repetido no se crea con un clic: se abre completo');
ok(/elegido antes/.test(P)&&/articuloId=art&&art\.razones/.test(P),'solo usa el artículo del catálogo ya elegido antes para ese proveedor y producto');
ok(/d\.tipoDocumento==='etiqueta_insumo'/.test(P)&&/!d\.loteId/.test(P),'la cola son etiquetas de insumo pendientes sin lote');
ok(/Z\(\)\.escuchar\(\)/.test(P)&&/Consultando los lotes/.test(P),'espera a leer los lotes antes de decir a cuál va cada foto');
ok(/window\.ieVrBoton\(\)/.test(P86)&&/diagnostico,/.test(P89),'Evidencias muestra el botón y Lotes comparte su diagnóstico');
ok(/98-validar-rapido\.js\?v=20261113-/.test(H)&&H.indexOf('98-validar-rapido.js')>H.indexOf('89-trazabilidad-lotes-pantalla.js'),'index.html carga la vista después de Lotes');
console.log(fallas?'\n'+fallas+' fallas':'\nValidar rápido correcto');
process.exit(fallas?1:0);
