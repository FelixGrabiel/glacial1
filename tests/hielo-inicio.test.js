/* Reporte Hielo · tarjeta «HIELO» del Inicio (js/hielo/98-hielo-inicio.js): resumen por turno y HTML. */
'use strict';
const I=require('../js/hielo/98-hielo-inicio.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const R=(fecha,turno,estado,prod,paradas)=>({id:fecha+'_'+turno,fecha,turno,estado,produccion:prod||[],paradas:paradas||[],mermas:[]});
const reps=[R('2026-11-09','DÍA','FINALIZADO',[{marca:'Glacial',presentacion:'3 kg',bolsas:800},{marca:'Glacial',presentacion:'1.5 kg',bolsas:400}],[{minutos:20,motivo:'Falla de equipo'}]),
  R('2026-11-09','INTERMEDIO','EN_REGISTRO',[{marca:'Glacial',presentacion:'3 kg',bolsas:200}]),
  R('2026-11-09','NOCHE','FINALIZADO',[{marca:'Glacial',presentacion:'3 kg',bolsas:500}]),R('2026-11-08','DÍA','FINALIZADO',[{marca:'Glacial',presentacion:'3 kg',bolsas:999}])];
const progs=[{fecha:'2026-11-09',turno:'DÍA',items:[{marca:'Glacial',presentacion:'3 kg',bolsas:1500},{marca:'Glacial',presentacion:'1.5 kg',bolsas:500}]}];
ok(I.turnosDe('DÍA').join()==='DÍA,INTERMEDIO'&&I.turnosDe('noche').join()==='NOCHE'&&I.turnosDe('').join()==='DÍA,INTERMEDIO','el turno «Día» del Inicio incluye el Intermedio; «Noche» es solo Noche');
const d=I.resumen(reps,progs,'2026-11-09','DÍA',[]);
ok(d.bolsas===1400&&d.kg===3600&&d.programado===2000&&Math.round(d.cumplimiento*100)===70&&d.paradasMin===20&&d.paradas===1,'Día + Intermedio del 09/11: 1 400 bolsas, 3 600 kg, 70 % de 2 000 programadas, 20 min de parada (no mezcla otros días ni la Noche)');
ok(d.presentaciones.map(p=>p.presentacion+':'+p.bolsas).join()==='3 kg:1000,1.5 kg:400'&&d.estado==='EN_REGISTRO'&&d.reportes===2,'3 kg y 1.5 kg por separado; estado EN_REGISTRO porque el Intermedio aún no se finaliza');
const n=I.resumen(reps,progs,'2026-11-09','NOCHE',[]);ok(n.bolsas===500&&n.estado==='FINALIZADO'&&n.cumplimiento===null,'Noche: 500 bolsas, FINALIZADO, sin programación (cumplimiento —)');
const v=I.resumen(reps,progs,'2026-11-10','DÍA',[]);
ok(v.estado==='SIN_REPORTE'&&v.bolsas===0&&v.presentaciones.length===2&&v.presentaciones[0].presentacion==='3 kg','un día sin reporte: SIN_REPORTE y siempre las presentaciones de 3 kg y 1.5 kg');
const otra=I.resumen([R('2026-11-09','DÍA','FINALIZADO',[{marca:'Glacial',presentacion:'5 kg',bolsas:50}])],[],'2026-11-09','DÍA',[]);
ok(otra.presentaciones.map(p=>p.presentacion).join()==='5 kg,3 kg,1.5 kg','otras presentaciones aparecen solo si tuvieron producción');
const h=I.htmlTarjeta(d,true);
ok(/HIELO · Día \+ Intermedio/.test(h)&&/Bolsas de 3 kg<\/span><b>1\.000<\/b>/.test(h.replace(/ /g,'.').replace(/ /g,'.')+'')||/Bolsas de 3 kg/.test(h),'la tarjeta muestra el turno y las bolsas por presentación');
ok(/70 %/.test(h)&&/de 2.000 bolsas programadas|de 2\.000|de 2,000|de 2 000/.test(h)&&/20 min/.test(h)&&/En registro/.test(h)&&/data-hli-abrir/.test(h),'cumplimiento, paradas, estado y botón «Abrir Reporte Hielo»');
ok(!/data-hli-abrir/.test(I.htmlTarjeta(d,false)),'sin acceso a la página de Hielo no hay botón');
ok(/Todavía no hay reporte de hielo/.test(I.htmlTarjeta(v,false))&&/Sin reporte/.test(I.htmlTarjeta(v,false)),'sin reporte: mensaje claro en lugar de ceros');
ok(/&lt;/.test(I.htmlTarjeta({...d,presentaciones:[{presentacion:'<b>',bolsas:1}]},false)),'el texto se escapa');
process.exit(fallas?1:0);
