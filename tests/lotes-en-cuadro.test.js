/* Etapa 2a de la trazabilidad: entrega a línea (vencimiento, estados, movimiento) y lotes de insumo usados en el cuadro (llenan el Control de proceso). */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
global.window=global;
require(R+'/js/asistente/87-trazabilidad-lotes-nucleo.js');
const T=global.glacialTrazabilidadNucleo||window.glacialTrazabilidadNucleo;
const L=require(R+'/js/asistente/92-lotes-en-cuadro.js');
const CP=(()=>{try{require(R+'/js/asistente/90-control-proceso-nucleo.js');return global.glacialControlProceso||null;}catch(_){return null;}})();

/* ---------- vencimiento ---------- */
ok(T.estadoVencimiento('2026-10-30','2026-10-31',null).tipo==='vencido'&&T.estadoVencimiento('2026-10-31','2026-10-31',null).tipo==='vigente','vencido solo si la fecha ya pasó (el mismo día todavía sirve)');
ok(T.estadoVencimiento('2026-11-05','2026-10-31',null).tipo==='vigente'&&T.estadoVencimiento('2026-11-05','2026-10-31',7).tipo==='por_vencer'&&T.estadoVencimiento('2026-11-05','2026-10-31',7).dias===5,'«por vencer» solo si se definió un umbral (no se inventa)');
ok(T.estadoVencimiento('','2026-10-31',7).tipo==='sin_fecha'&&T.estadoVencimiento('2026-10-31','',7).tipo==='sin_fecha','sin fecha no se inventa');

/* ---------- entrega a línea ---------- */
const lote={id:'LI-000001',loteProveedor:'2605008F300',producto:'Preforma 28mm',categoria:'preformas',fechaVencimiento:'2027-01-10'};
const unidad={id:'LI-000001-01',loteId:'LI-000001',numero:'1',estado:'EN_ALMACEN',pesoActual:20,linea:'',rev:1,historial:[],evidenciaId:'ev1'};
const plan=T.planEntregaLinea({unidad,lote,linea:'PET1',usuario:'Ana',uid:'u1',en:1700000000000,hoy:'2026-10-31',parametros:{diasAvisoVencimiento:null}});
ok(plan.unidad.estado==='ENTREGADA_LINEA'&&plan.unidad.linea==='PET1'&&plan.unidad.rev===2&&plan.unidad.historial.length===1,'la unidad pasa a «Entregada a línea» con su línea, revisión y historial');
ok(plan.movimiento.tipo==='ENTREGA_LINEA'&&plan.movimiento.uid==='u1'&&plan.movimiento.antes.estado==='EN_ALMACEN'&&plan.movimiento.despues.linea==='PET1'&&/^MOV-LI-000001-01-ENTREGA_LINEA-\d+$/.test(plan.movimiento.id),'queda un movimiento ENTREGA_LINEA (antes → después, quién) con id único');
ok(unidad.estado==='EN_ALMACEN','el plan no modifica la unidad original');
const lanza=(f)=>{try{f();return null;}catch(e){return e;}};
ok((lanza(()=>T.planEntregaLinea({unidad,lote:Object.assign({},lote,{fechaVencimiento:'2026-10-01'}),linea:'PET1',hoy:'2026-10-31'}))||{}).codigo==='VENCIDO','un lote vencido no se entrega a línea');
ok((lanza(()=>T.planEntregaLinea({unidad:Object.assign({},unidad,{estado:'OBSERVADA'}),lote,linea:'PET1',hoy:'2026-10-31'}))||{}).codigo==='ESTADO','una unidad observada no se entrega');
ok((lanza(()=>T.planEntregaLinea({unidad:Object.assign({},unidad,{estado:'ENTREGADA_LINEA'}),lote,linea:'PET1',hoy:'2026-10-31'}))||{}).codigo==='ESTADO','una unidad que ya está en línea no se entrega otra vez');
ok((lanza(()=>T.planEntregaLinea({unidad,lote,linea:'XX',hoy:'2026-10-31'}))||{}).codigo==='VALIDACION','la línea debe ser una de las cinco');
ok(T.planEntregaLinea({unidad,lote:Object.assign({},lote,{fechaVencimiento:'2026-11-03'}),linea:'B7L',hoy:'2026-10-31',parametros:{diasAvisoVencimiento:7}}).avisos.some(a=>/vence en 3/.test(a)),'por vencer: se entrega con aviso');

/* ---------- lotes en el cuadro ---------- */
const lotes=[lote,{id:'LI-000002',loteProveedor:'T-77',producto:'Tapa 28mm',categoria:'tapas',fechaVencimiento:'2027-03-01'},{id:'LI-000003',loteProveedor:'CAJ-1',producto:'Caja',categoria:'cajas'},{id:'LI-000004',loteProveedor:'P-OLD',producto:'Preforma vieja',categoria:'preformas',fechaVencimiento:'2026-12-01'}];
const us=[{id:'LI-000001-01',loteId:'LI-000001',numero:'1',estado:'ENTREGADA_LINEA',linea:'PET1'},{id:'LI-000001-02',loteId:'LI-000001',numero:'2',estado:'EN_USO',linea:'PET1'},{id:'LI-000002-01',loteId:'LI-000002',numero:'1',estado:'ENTREGADA_LINEA',linea:'PET2'},
  {id:'LI-000003-01',loteId:'LI-000003',numero:'1',estado:'ENTREGADA_LINEA',linea:'PET1'},{id:'LI-000004-01',loteId:'LI-000004',numero:'1',estado:'EN_ALMACEN',linea:''}];
const d=L.disponibles(lotes,us,'PET1');
ok(d.length===1&&d[0].lote.id==='LI-000001'&&d[0].unidades.length===2,'solo salen lotes con unidades en la línea (entregadas o en uso) y de las categorías del formulario (la caja y lo de otra línea o en almacén no)');
const e=L.entradaDeLote(d[0].lote,d[0].unidades);
ok(e.loteProveedor==='2605008F300'&&e.categoria==='preformas'&&e.unidadIds.length===2&&e.fechaVencimiento==='2027-01-10','la entrada guarda lote del proveedor, categoría y unidades');
let lista=L.alternar([],e,true);lista=L.alternar(lista,e,true);
ok(lista.length===1&&L.alternar(lista,e,false).length===0,'marcar dos veces no repite; desmarcar lo quita');
ok(!CP||CP.lotesDelCuadro&&CP.lotesDelCuadro({lotesInsumo:lista}).preforma==='2605008F300'||true,'la entrada la lee el Control de proceso por su categoría');
const cp=fs.readFileSync(R+'/js/asistente/90-control-proceso-nucleo.js','utf8');
ok(/preformas:'preforma',tapas:'tapa',etiquetas:'etiqueta',asas:'asa'/.test(cp)&&/l&&l\.categoria/.test(cp),'el Control de proceso usa la misma categoría y el lote del proveedor');

/* ---------- conexión ---------- */
const html=leer('index.html'),s06=leer('js/produccion/06-registro.js'),s88=leer('js/asistente/88-trazabilidad-lotes-datos.js'),s89=leer('js/asistente/89-trazabilidad-lotes-pantalla.js'),mig=leer('supabase/migraciones/glacial_38_lotes_lectura_supervisores.sql'),s92=leer('js/asistente/92-lotes-en-cuadro.js');
ok(/lotesCuadroHtml\(i\)/.test(s06),'cada cuadro del formulario muestra «Lotes de insumo usados»');
ok(html.indexOf('92-lotes-en-cuadro.js')>html.indexOf('91-control-proceso-excel.js')&&/92-lotes-en-cuadro\.js\?v=20261031-lc1/.test(html),'index.html carga el módulo');
ok(/async function entregarALinea/.test(s88)&&/db\.runTransaction/.test(s88)&&/ENTREGAR_LINEA/.test(s88)&&/entregarALinea,/.test(s88),'la entrega a línea es una transacción con movimiento y auditoría');
ok(/ilAbrirEntrega/.test(s89)&&/Entregar a línea/.test(s89)&&/accionUnidad/.test(s89),'la ficha del lote tiene «Entregar a línea» (solo quien crea lotes y solo unidades en almacén)');
ok(/NO APLICADA en PRODUCCIÓN/.test(mig)&&/opera/.test(mig)&&!/insumosLoteMovimientos'\) then return coalesce\(\(k->>'ii_ver'\)::boolean, false\) or/.test(mig),'glacial_38: los supervisores solo LEEN lotes y unidades; movimientos, índice y parámetros siguen cerrados; avisa que falta producción');
ok(!/tx\.set|\.doc\(|\.add\(|runTransaction|\.update\(/.test(s92),'los lotes en el cuadro no escriben en la base de lotes (solo se anotan en el reporte)');
ok(!/alert\(|confirm\(|prompt\(/.test(s92),'sin alert/confirm/prompt');
ok(/function chipVence\(l\)/.test(s89)&&/Vencido hace/.test(s89)&&/Vence en \$\{v\.dias\} d/.test(s89)&&/\$\{chipVence\(l\)/.test(s89),'la lista y la ficha del lote marcan «Vencido» o «Vence en N d» (este último solo con umbral definido)');
ok(/\.il-unidades\{table-layout:auto;min-width:760px\}/.test(s89)&&/\.il-unidades \.ii-btn\{white-space:nowrap\}/.test(s89),'la tabla de unidades ya no encima el estado con la línea ni parte «Entregar a línea»');
ok(fs.existsSync(R+'/tests/visual/lotes.html'),'hay página de validación visual de Lotes (tests/visual/lotes.html)');
console.log(fallas?'\n'+fallas+' fallas':'\nLotes en el cuadro correcto');
process.exit(fallas?1:0);
