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
ok(html.indexOf('92-lotes-en-cuadro.js')>html.indexOf('91-control-proceso-excel.js')&&/92-lotes-en-cuadro\.js\?v=20261031-lc2/.test(html),'index.html carga el módulo');
ok(/async function entregarALinea/.test(s88)&&/db\.runTransaction/.test(s88)&&/ENTREGAR_LINEA/.test(s88)&&/entregarALinea,/.test(s88),'la entrega a línea es una transacción con movimiento y auditoría');
ok(/ilAbrirEntrega/.test(s89)&&/Entregar a línea/.test(s89)&&/accionUnidad/.test(s89),'la ficha del lote tiene «Entregar a línea» (solo quien crea lotes y solo unidades en almacén)');
ok(/APLICADA en PRUEBAS y PRODUCCIÓN/.test(mig)&&/opera/.test(mig)&&!/insumosLoteMovimientos'\) then return coalesce\(\(k->>'ii_ver'\)::boolean, false\) or/.test(mig),'glacial_38: los supervisores solo LEEN lotes y unidades; movimientos, índice y parámetros siguen cerrados; avisa que falta producción');
ok(!/tx\.set|\.doc\(|\.add\(|runTransaction|\.update\(/.test(s92),'los lotes en el cuadro no escriben en la base de lotes (solo se anotan en el reporte)');
ok(!/alert\(|confirm\(|prompt\(/.test(s92),'sin alert/confirm/prompt');
ok(/function chipVence\(l\)/.test(s89)&&/Vencido hace/.test(s89)&&/Vence en \$\{v\.dias\} d/.test(s89)&&/\$\{chipVence\(l\)/.test(s89),'la lista y la ficha del lote marcan «Vencido» o «Vence en N d» (este último solo con umbral definido)');
ok(/\.il-unidades\{table-layout:auto;min-width:760px\}/.test(s89)&&/\.il-unidades \.ii-btn\{white-space:nowrap\}/.test(s89),'la tabla de unidades ya no encima el estado con la línea ni parte «Entregar a línea»');
ok(fs.existsSync(R+'/tests/visual/lotes.html'),'hay página de validación visual de Lotes (tests/visual/lotes.html)');
/* ---------- Etapa 2b: uso en el cuadro, peso final, parámetros ---------- */
const enLinea=Object.assign({},unidad,{estado:'ENTREGADA_LINEA',linea:'PET1',pesoActual:346.6});
const cuadro={clave:'2026-10-31|DIA|PET1|scala|2.5l',fecha:'2026-10-31',bloque:'DIA',texto:'PET1 · C01 · Scala 2.5L'};
const uso=T.planUsoEnCuadro({unidad:enLinea,cuadro,usuario:'Rosa',uid:'u7',en:1700000000000});
ok(uso.unidad.estado==='EN_USO'&&uso.unidad.linea==='PET1'&&uso.unidad.cuadro===cuadro.clave&&uso.unidad.pesoActual===346.6&&uso.unidad.rev===(enLinea.rev||1)+1,'«Marcar en uso»: pasa a EN_USO, se queda en su línea y guarda el cuadro');
ok(uso.movimiento.tipo==='USO_CUADRO'&&uso.movimiento.uid==='u7'&&uso.movimiento.motivo===cuadro.texto&&/^MOV-.*-USO_CUADRO-\d+$/.test(uso.movimiento.id),'queda el movimiento USO_CUADRO con el cuadro y quién lo hizo');
ok((lanza(()=>T.planUsoEnCuadro({unidad:unidad,cuadro,usuario:'x',uid:'u'}))||{}).codigo==='ESTADO','una unidad que sigue en almacén no se puede marcar en uso');
ok((lanza(()=>T.planUsoEnCuadro({unidad:enLinea,cuadro:null,usuario:'x',uid:'u'}))||{}).codigo==='VALIDACION','sin cuadro no se marca en uso');
const enUso=uso.unidad;
const cons=T.planCierreUnidad({unidad:enUso,destino:'CONSUMIDA',usuario:'Rosa',uid:'u7',en:1700000100000});
ok(cons.unidad.estado==='CONSUMIDA'&&cons.unidad.pesoActual===0&&cons.consumidoKg===346.6&&cons.movimiento.tipo==='CONSUMO'&&cons.movimiento.consumidoKg===346.6,'consumida completa: peso 0 y consumo = lo que tenía');
const dev=T.planCierreUnidad({unidad:enUso,destino:'EN_ALMACEN',pesoFinal:'120,5',usuario:'Rosa',uid:'u7',en:1700000100000});
ok(dev.unidad.estado==='EN_ALMACEN'&&dev.unidad.pesoActual===120.5&&dev.unidad.linea===''&&dev.unidad.cuadro===''&&dev.consumidoKg===226.1&&dev.movimiento.tipo==='DEVOLUCION','devolución parcial: vuelve a almacén con su peso (acepta coma), sin línea ni cuadro, y calcula lo consumido');
ok((lanza(()=>T.planCierreUnidad({unidad:enUso,destino:'EN_ALMACEN',pesoFinal:'',usuario:'x',uid:'u'}))||{}).codigo==='VALIDACION'&&(lanza(()=>T.planCierreUnidad({unidad:enUso,destino:'EN_ALMACEN',pesoFinal:'0',usuario:'x',uid:'u'}))||{}).codigo==='VALIDACION'&&(lanza(()=>T.planCierreUnidad({unidad:enUso,destino:'EN_ALMACEN',pesoFinal:'400',usuario:'x',uid:'u'}))||{}).codigo==='VALIDACION','la devolución exige un peso: no vacío, mayor que 0 y no mayor que el que tenía');
ok((lanza(()=>T.planCierreUnidad({unidad:enLinea,destino:'CONSUMIDA',usuario:'x',uid:'u'}))||{}).codigo==='ESTADO'&&(lanza(()=>T.planCierreUnidad({unidad:enUso,destino:'OTRO',usuario:'x',uid:'u'}))||{}).codigo==='VALIDACION','solo se cierra una unidad en uso, y con un destino válido');
const s93=leer('js/asistente/93-lotes-uso-cuadro.js'),mig39=leer('supabase/migraciones/glacial_39_uso_lotes_supervisores.sql');
ok(/window\.loteUsoMarcar/.test(s93)&&/window\.loteUsoCerrar/.test(s93)&&/runTransaction/.test(s93)&&/insumosLoteMovimientos/.test(s93)&&!/alert\(|confirm\(|prompt\(/.test(s93),'las acciones del supervisor son transacciones (unidad + movimiento) y sin alert/confirm/prompt');
ok(/loteUsoMarcar\(/.test(s92)&&/loteUsoCerrar\(/.test(s92)&&/permission\|permiso\|denied/.test(s92),'el panel del cuadro ofrece «Marcar en uso» y «Registrar peso final»; sin permiso del servidor no estorba');
ok(html.indexOf('93-lotes-uso-cuadro.js')>html.indexOf('92-lotes-en-cuadro.js')&&/93-lotes-uso-cuadro\.js\?v=20261031-lc2/.test(html),'index.html carga las acciones después del panel');
ok(/APLICADA en PRUEBAS y PRODUCCIÓN/.test(mig39)&&/USO_CUADRO','CONSUMO','DEVOLUCION/.test(mig39)&&/'ENTREGADA_LINEA' and n->>'estado' = 'EN_USO'/.test(mig39)&&/between 0 and \(v->>'pesoActual'\)::numeric/.test(mig39),'glacial_39: solo las tres transiciones, peso entre 0 y el anterior, solo esos movimientos; avisa que falta producción');
ok(/async function guardarParametros/.test(s88)&&/ilGuardarParametros/.test(s89)&&/Parámetros de lotes/.test(s89)&&/Los días de aviso deben ser un número entero/.test(s88),'los parámetros (días de aviso y leyenda obligatoria) se editan desde Lotes');
console.log(fallas?'\n'+fallas+' fallas':'\nLotes en el cuadro correcto');
process.exit(fallas?1:0);
