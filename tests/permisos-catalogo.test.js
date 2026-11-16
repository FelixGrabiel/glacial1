/* Catálogo de permisos de Usuarios (js/nucleo/02-estado.js › PERMISOS_APP / AREAS_PERMISOS). Hielo separado de Agua (glacial_50). */
'use strict';
const fs=require('fs'),vm=require('vm');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const src=fs.readFileSync(__dirname+'/../js/nucleo/02-estado.js','utf8');
const ctx={};vm.createContext(ctx);
vm.runInContext(src.match(/const PERMISOS_APP=\[[\s\S]*?\];/)[0]+src.match(/const AREAS_PERMISOS=\[[\s\S]*?\];/)[0]+';this.P=PERMISOS_APP;this.A=AREAS_PERMISOS;',ctx);

ok(ctx.A.some(a=>a.clave==='hielo'&&/Hielo/.test(a.titulo)),'el catálogo tiene un área «Hielo» propia');
ok(new Set(ctx.A.map(a=>a.clave)).size===ctx.A.length,'cada área aparece una sola vez');

const hielo=ctx.P.filter(p=>p.area==='hielo');
ok(hielo.length===2&&hielo.some(p=>p.key==='hielo')&&hielo.some(p=>p.key==='programarHielo'),'el área Hielo tiene los permisos «hielo» (registrar) y «programarHielo» (programar/configurar)');
ok(!ctx.P.some(p=>p.area==='produccion'&&/hielo/i.test(p.key)),'ningún permiso de Hielo quedó mezclado dentro del área de Producción (Agua)');

const claves=ctx.P.map(p=>p.key);
ok(new Set(claves).size===claves.length,'ninguna clave de permiso se repite en el catálogo');
ok(ctx.P.every(p=>ctx.A.some(a=>a.clave===p.area)),'todo permiso pertenece a un área que existe en AREAS_PERMISOS');

const tit=ctx.A.map(a=>a.clave).join();
ok(['inicio','produccion','planificacion','hielo','tareo','mantenimiento','rrhh','asistente','almacen','reportes','administracion'].every(k=>ctx.A.some(a=>a.clave===k)),'los permisos se reparten en módulos: '+tit);
ok(!ctx.A.some(a=>a.clave==='visualizacion')&&!ctx.P.some(p=>p.area==='visualizacion'),'ya no existe el cajón mezclado «Visualización»');
ok(ctx.P.filter(p=>p.area==='produccion').length<=12,'Producción (Agua) ya no acumula permisos de otros módulos');
ok(ctx.P.find(p=>p.key==='planificacion').area==='planificacion'&&ctx.P.find(p=>p.key==='exportarExcel').area==='reportes'&&ctx.P.find(p=>p.key==='recibirAlertasProduccion').area==='inicio','planificación, exportación y avisos viven en su propio módulo');
process.exit(fallas?1:0);
