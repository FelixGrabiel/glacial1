/* Mantenimiento · Registro CFA-CA-F-023 · impreso A4 horizontal de 1 hoja (js/mantenimiento/77-registro-impresion.js), con datos reales de la Sopladora. */
'use strict';
const fs=require('fs'),path=require('path');
const N=require('../js/mantenimiento/71-plan-anual-nucleo.js');
const I=require('../js/mantenimiento/77-registro-impresion.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const M=JSON.parse(fs.readFileSync(path.join(__dirname,'datos','mtto-plan-muestra.json'),'utf8'));
const sop=M.maquinas.find(m=>m.codigo_hoja==='SOP'),plan=M.actividades.filter(a=>a.maquina_id===sop.id);
const reg={fecha:'2026-11-07',semana:45,tipo_mtto:'PREVENTIVO',condicion:'INTERNO',proxima_revision:'2026-11-14',tecnico_senior:'CESAR ALPELIMA',maquinista:'ELISEO ARVI',hora_inicio_prog:'07:00:00',hora_fin_prog:'16:00:00',horas_prog:8,informe_final:N.INFORME_DEFECTO};

/* actividades del registro (núcleo) */
const a45=N.actividadesParaRegistro(plan,45),a13=N.actividadesParaRegistro(plan,13);
ok(a45.length===18&&a45[0].item===1&&a45[0].equipo==='BOCINAS DE LAS GUÍAS DE LAS VARILLAS DE ESTIRAMIENTO'&&a45[0].actividad==='LUBRICACIÓN'&&a45[0].frecuencia==='SEMANAL','semana 45: 18 actividades; equipo = antes de « / », actividad = después');
ok(a13.length===25&&N.excedeImpreso(a13.length)&&!N.excedeImpreso(22)&&a13.map(a=>a.item).join()===Array.from({length:25},(_,i)=>i+1).join(),'semana 13: 25 actividades (más de 22), numeradas 1..25, semanales primero');
ok(N.proximaRevision('2026-11-07')==='2026-11-14'&&N.proximaRevision('2026-12-28')==='2027-01-04','próxima revisión = fecha + 7 días');

const html=I.htmlRegistro(reg,sop,a45.map(a=>({...a,realizado:true})),[{orden:1,descripcion:'O-ring tobera N° 3'}],{},'file:///logo.png');
ok((html.match(/<div class="hoja">/g)||[]).length===1&&/@page\{size:A4 landscape/.test(html)&&/font-family:Arial/.test(html),'una sola hoja A4 horizontal, letra Arial');
ok(/REGISTRO DE MANTENIMIENTO Y CALIBRACION/.test(html)&&/CFA - CA - F - 023/.test(html)&&/<img src="file:\/\/\/logo.png"/.test(html),'cabecera: logo · título · código');
ok(/<i>Técnico Ejecutor:<\/i><\/td><td><u>CESAR ALPELIMA<\/u>/.test(html)&&/<i>Maquinista Ejecutor:<\/i><\/td><td><u>ELISEO ARVI<\/u>/.test(html)&&/<u>07\/11\/2026<\/u>/.test(html)&&/<u>SEM_45<\/u>/.test(html)&&/<u>14\/11\/2026<\/u>/.test(html),'datos: etiquetas en cursiva y valores subrayados (técnico, maquinista, fecha, SEM_45, próxima revisión)');
ok(/<u>SOPLADORA<\/u>/.test(html)&&/<u>AGUA<\/u>/.test(html)&&/<u>PET<\/u>/.test(html)&&!/PET1|PET2/.test(html),'máquina SOPLADORA · ubicación AGUA · línea solo «PET»');
const marca=op=>{const m=new RegExp('\\.- '+op+'(?:</td><td>| )<span class="raya">(x|&nbsp;)</span>').exec(html);return m&&m[1]==='x';};
ok(marca('Preventivo')&&marca('Interno')&&marca('Predictivo')===false&&marca('Correctivo')===false&&marca('Externo')===false,'la «x» va sobre la raya del tipo (Preventivo) y de la condición (Interno) elegidos');
const html2=I.htmlRegistro({...reg,tipo_mtto:'CORRECTIVO',condicion:'EXTERNO'},sop,[],[],{}, '');
ok(/Correctivo<\/td><td><span class="raya">x</.test(html2)&&/Externo <span class="raya">x</.test(html2)&&/Interno <span class="raya">&nbsp;/.test(html2),'con Correctivo y Externo la «x» cambia de raya');
const filas=(html.match(/<table class="act">[\s\S]*?<\/table>/)[0].match(/<tr>/g)||[]).length;
ok(filas===12,'exactamente 11 filas de actividades (más la fila de títulos)');
ok(/<td class="c">1<\/td><td class="t">BOCINAS[^<]*<\/td><td class="t">LUBRICACIÓN<\/td><td class="t">SEMANAL<\/td><td class="c">12<\/td><td class="t">FILTROS DE AIRE DE ALTA PRESIÓN<\/td>/.test(html),'bloque izquierdo = ítems 1–11, derecho = 12–22, con equipo, actividad y frecuencia');
ok(/<td class="c">19<\/td><td><\/td><td><\/td><td><\/td>/.test(html)&&/<td class="c">22<\/td><td><\/td>/.test(html),'las filas sin actividad se imprimen vacías, solo con su número de ítem (19–22)');
const h25=I.htmlRegistro(reg,sop,a13,[],{},'');
ok(!/<td class="c">23<\/td><td class="t">/.test(h25)&&!/<td class="c">25<\/td><td class="t">/.test(h25)&&(h25.match(/<div class="hoja">/g)||[]).length===1,'con 25 actividades solo se imprimen las 22 primeras y no hay segunda hoja');
ok(/<u>Inicio:<\/u> 07:00 a\.m\./.test(html)&&/<u>Fin:<\/u> 04:00 p\.m\./.test(html)&&/<u>Horas:<\/u> 8/.test(html)&&/Tiempo Programado/.test(html),'Tiempo Programado: Inicio 07:00 a.m. · Fin 04:00 p.m. · Horas 8');
ok(I.hora12('00:30')==='12:30 a.m.'&&I.hora12('12:00')==='12:00 p.m.'&&I.hora12('13:05')==='01:05 p.m.','formato a.m./p.m.');
ok(/1\.- O-ring tobera N° 3/.test(html)&&/<td>2\.- <\/td>/.test(html)&&/1\.- Grasa Multipropósito Sanitaria\./.test(html)&&/2\.- Limpiacontacto\./.test(html)&&/3\.- Aflojatodo\./.test(html)&&/4\.- Lubricatodo\./.test(html),'piezas (1.- a 4.-) e insumos químicos fijos');
ok(/Se han realizado las actividades mencionadas en la tabla superior cumpliendo con lo programado\. Máquina en condiciones normales de operación\./.test(html)&&/INFORME FINAL \/ ESTATUS DE EQUIPO - MAQUINARIA - INSTRUMENTO/.test(html),'informe final con su texto por defecto');
ok(/<th>VB° GG<\/th><th>Jefe Mantenimiento<\/th><th>Supervisor Mantenimiento<\/th><th>Técnico Mantenimiento Senior<\/th><th>Maquinista \/ Técnico Mant\. Junior<\/th>/.test(html)&&/<td>ÁLVARO HIDALGO<\/td><td>ADRIÁN MARTÍNEZ<\/td><td>CRISTIAN MEZA<\/td><td>CESAR ALPELIMA<\/td><td>ELISEO ARVI<\/td>/.test(html),'firmas: cargos y nombres (los tres fijos de la configuración y el técnico y maquinista del registro)');
const hc=I.htmlRegistro(reg,sop,[],[],{firmas:{vbGG:'OTRO GG'},insumosQuimicos:['A','B','C','D']},'');
ok(/OTRO GG/.test(hc)&&/4\.- D/.test(hc),'las firmas e insumos salen de la configuración editable');
ok(!/GLACIAL|Generado|Página|OK|✓|firma digital/i.test(html.replace(/<title>[\s\S]*?<\/title>/,'').replace(/<img[^>]*>/,'')),'el impreso no agrega columnas OK, sellos de firma, hora real ni marcas de GLACIAL');
process.exit(fallas?1:0);
