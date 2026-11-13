/* Trazabilidad (auditoría 13/11/2026, punto 4): aviso de cajas/bobinas EN USO sin peso final al finalizar el reporte y al generar el cierre del turno. */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
global.window=global;
require(R+'/js/asistente/87-trazabilidad-lotes-nucleo.js');
const L=require(R+'/js/asistente/92-lotes-en-cuadro.js');
const lotes=[{id:'LI-000002',loteProveedor:'PG10016320',producto:'Preforma 90 g',categoria:'preformas'},{id:'LI-000007',loteProveedor:'12158',producto:'Etiqueta Cielo',categoria:'etiquetas'}];
const us=[{id:'LI-000007-03',loteId:'LI-000007',numero:'03',estado:'EN_USO',linea:'PET2',pesoActual:12.5},
  {id:'LI-000002-10',loteId:'LI-000002',numero:'10',estado:'EN_USO',linea:'B7L',pesoActual:20},
  {id:'LI-000002-02',loteId:'LI-000002',numero:'2',estado:'EN_USO',linea:'B7L',pesoActual:8},
  {id:'LI-000002-03',loteId:'LI-000002',numero:'3',estado:'ENTREGADA_LINEA',linea:'B7L'},{id:'LI-000002-04',loteId:'LI-000002',numero:'4',estado:'CONSUMIDA',linea:'B7L'}];
let r=L.enUsoSinPeso(us,lotes,'B7L');
ok(r.length===2&&r[0].numero==='2'&&r[1].numero==='10','solo las EN USO de la línea (no las entregadas sin usar ni las consumidas), en orden de n.º');
ok(r[0].titulo==='Caja'&&r[0].loteProveedor==='PG10016320','dice si es caja o bobina y el lote del proveedor');
r=L.enUsoSinPeso(us,lotes,'');
ok(r.length===3&&r[0].linea==='B7L'&&r[2].linea==='PET2'&&r[2].titulo==='Bobina','sin línea: todas, por línea');
ok(L.textoEnUso(r[2])==='PET2 · Bobina 03 del lote 12158 (Etiqueta Cielo)','texto del aviso');
ok(L.enUsoSinPeso(us,[], 'PET2')[0].titulo&&L.textoEnUso(L.enUsoSinPeso(us,[], 'PET2')[0])==='PET2 · Caja / bobina 03','sin el lote leído todavía, no falla');
const s06=fs.readFileSync(R+'/js/produccion/06-registro.js','utf8'),s29=fs.readFileSync(R+'/js/produccion/29-avance-produccion.js','utf8'),s93=fs.readFileSync(R+'/js/asistente/93-lotes-uso-cuadro.js','utf8'),s92=fs.readFileSync(R+'/js/asistente/92-lotes-en-cuadro.js','utf8');
ok(/function unidadesEnUsoReporte/.test(s06)&&/En uso en \$\{escaparHtml\(draft\.linea\)\} sin peso final/.test(s06)&&/En uso sin peso final:/.test(s06),'el Registro avisa en el estado del reporte y al confirmar «Finalizar reporte»');
ok(!/tómalos del almacén/.test(s06),'el aviso de lotes ya no dice «tómalos del almacén» (se quitó del Registro)');
ok(/lotesEnUsoTodas\(\)/.test(s29)&&/Si alguna se acabó en este turno/.test(s29)&&/if\(!confirm\('¿Deseas generar el cierre definitivo del turno\?'\+aviso\)\)return;/.test(s29),'Avance y cierre recuerda las cajas/bobinas en uso al generar el cierre (no bloquea)');
ok(/where\('estado','==','EN_USO'\)/.test(s93)&&/setTimeout\(\(\)=>r\(null\),4000\)/.test(s93)&&/catch\(_\)\{return null;\}/.test(s93),'la lectura del cierre es puntual, con tiempo máximo y sin romper el cierre si falla');
ok(/raiz\.lotesEnUsoLinea=function/.test(s92)&&/cache\.linea!==linea\|\|!cache\.listo\|\|cache\.error\)return null/.test(s92),'el Registro usa las cajas/bobinas de la línea que ya leyó el panel');
console.log(fallas?'\n'+fallas+' fallas':'\nAviso de peso final correcto');
process.exit(fallas?1:0);
