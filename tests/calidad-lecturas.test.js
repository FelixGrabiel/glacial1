/* Calidad › Lotes leídos: datos y foto de lo que lee el bot de WhatsApp (js/calidad/99b-lecturas-lotes.js, glacial_64). node tests/calidad-lecturas.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const L=require('../js/calidad/99b-lecturas-lotes.js');

/* Fila con la misma forma que devuelve calidad_lecturas_listar (extraccion sin nulos, como jsonb_strip_nulls). */
const fila={sha256:'30a429b70650f3301f725aa76b41e5f6e0e78773696f71859bee065d0fd4c262',foto_ruta:'asistente/evidencias/30a429b70650f3301f725aa76b41e5f6e0e78773696f71859bee065d0fd4c262.jpg',mime:'image/jpeg',leyenda:null,
  recibido_en:'2026-11-18T23:52:25Z',importada:false,estado:'pendiente_validacion',requiere_confirmacion:true,campos_en_duda:['peso_neto_kg'],cambios_sugeridos:['peso_neto_kg: la etiqueta dice PESO, no PESO NETO'],
  extraccion:{lote:'11102',marca:'CONSORCIO FRAP',proveedor:'Competencia Ash',producto:'PRODUCTO CONFORME',presentacion:'BOBINA HIELO EN CUBO PRECIO UNO1.5 KG',fecha_impresa:'10/04/2026',cantidad_valor:1.5,cantidad_unidad:'KG',peso_declarado_kg:8.3,numero_caja_bobina:'55',
    advertencias:['La etiqueta está girada.','Este revisor utiliza la transcripcion anterior; NO relee la fotografia.','PENDIENTE DE VALIDACION: prohibido modificar inventarios automaticamente.'],texto_relevante:'CONSORCIO FRAP; Lote: 11102'}};
const x=L.normalizar(fila);
ok(x.lote==='11102'&&x.proveedor==='Competencia Ash'&&x.marca==='CONSORCIO FRAP'&&x.fechaImpresa==='10/04/2026','normalizar: lote, proveedor, marca y fecha');
ok(x.campos.cantidad==='1.5 KG'&&x.campos.peso_declarado_kg==='8.3'&&!('cliente' in x.campos),'normalizar: cantidad con unidad y sin campos vacíos');
ok(x.advertencias.length===1&&/girada/.test(x.advertencias[0]),'normalizar: quita las advertencias fijas del procesador');
ok(x.enDuda[0]==='peso_neto_kg'&&x.pideMirada&&!x.sinLote,'normalizar: campo en duda → pide mirada');
ok(x.ms===Date.parse('2026-11-18T23:52:25Z'),'normalizar: fecha de recepción');
const vacia=L.normalizar({sha256:'a'.repeat(64),recibido_en:'2026-11-18T10:00:00Z',extraccion:{}});
ok(vacia.sinLote&&vacia.pideMirada,'sin lote legible → marcado');
const limpia=L.normalizar({sha256:'b'.repeat(64),recibido_en:'2026-11-17T10:00:00Z',extraccion:{lote:'L7',proveedor:'Plastipak',advertencias:[]}});
ok(!limpia.pideMirada&&!limpia.sinLote,'lectura limpia no pide mirada');
ok(L.normalizar(null).sinLote&&L.normalizar('x').lote==='','normalizar no lanza con basura');
const lista=[x,vacia,limpia];
const r=L.resumen(lista);ok(r.total===3&&r.lotes===2&&r.sinLote===1&&r.conAviso===2&&r.conFoto===1,'resumen: totales');
ok(L.filtrar(lista,{estado:'SINLOTE'}).length===1&&L.filtrar(lista,{estado:'AVISO'}).length===2&&L.filtrar(lista,{estado:'LIMPIA'}).length===1,'filtros por estado');
ok(L.filtrar(lista,{texto:'plástipak'}).length===1&&L.filtrar(lista,{texto:'frap'}).length===1&&L.filtrar(lista,{texto:'l-7'}).length===1,'búsqueda sin tildes ni símbolos');
ok(L.filtrar(lista,{})[0].sha===x.sha,'orden: la más reciente primero');
ok(L.refFoto(fila.foto_ruta)==='supabase:glacial-fotos/'+fila.foto_ruta,'ruta de foto → referencia del bucket');
ok(L.refFoto('../secreto.jpg')===''&&L.refFoto('mantenimiento/x.jpg')===''&&L.refFoto('asistente/evidencias/../x.jpg')===''&&L.refFoto('')==='','la ruta fuera de asistente/evidencias/ no se acepta');
/* Servidor */
const m=leer('supabase/migraciones/glacial_64_calidad_lecturas.sql');
ok(/cal_ver/.test(m)&&/errcode = '42501'/.test(m)&&/security definer/.test(m)&&/set search_path = ''/.test(m),'migración: exige cal_ver y fija search_path');
ok(/revoke all on function public\.calidad_lecturas_listar[^;]*from public, anon/.test(m)&&/grant execute[^;]*to authenticated/.test(m),'migración: sin acceso anónimo');
ok(/like 'asistente\/evidencias\/%'/.test(m)&&!/importada_por/.test(m),'migración: solo rutas de evidencias y no expone quién importó');
ok(!/\b(insert|update|delete)\b/i.test(m.replace(/--.*$/gm,'')),'migración: solo lectura');
/* Pantalla */
const c=leer('js/calidad/100-calidad-pantalla.js'),i=leer('index.html'),v=leer('js/calidad/99-validacion-lotes.js');
ok(/\['lecturas','Lotes leídos'\]/.test(c)&&/btn-calidad-lecturas/.test(c)&&/btn-calidad-lecturas/.test(i),'menú y pestaña «Lotes leídos»');
ok(i.indexOf('99b-lecturas-lotes.js')>0&&i.indexOf('99b-lecturas-lotes.js')<i.indexOf('99-validacion-lotes.js')+80&&i.indexOf('99b-lecturas-lotes.js')<i.indexOf('100-calidad-pantalla.js'),'index.html carga el módulo antes de la pantalla');
ok(/evidenciaHtml/.test(v)&&/porSha/.test(v)&&/asegurar/.test(v),'Validación de lotes muestra la foto cuando hay lectura');
const l=leer('js/calidad/99b-lecturas-lotes.js');
ok(!/\.(insert|update|upsert|delete)\(/.test(l)&&/calidad_lecturas_listar/.test(l),'la pantalla solo lee');
console.log(fallas?'\n'+fallas+' fallas':'\nTodo bien');
