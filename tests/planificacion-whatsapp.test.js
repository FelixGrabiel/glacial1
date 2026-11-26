/* Planificación · programación desde WhatsApp (66w-planificacion-whatsapp.js): lectura del mensaje del grupo (25/11/2026).
   Mensaje real del 24 y 25/11/2026 en tests/datos/programacion-whatsapp-24-25-11.txt. node tests/planificacion-whatsapp.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
// catálogos reales de 01-config.js
const c=fs.readFileSync(R+'/js/nucleo/01-config.js','utf8');
const bloque=n=>{const i=c.indexOf('const '+n);return c.slice(i,c.indexOf('};',i)+2);};
const ctx={};vm.createContext(ctx);
vm.runInContext(['RATIOS_PRESENTACION_PET1','RATIOS_PRESENTACION_PET2','MARCAS_POR_LINEA','PRESENTACIONES_POR_LINEA'].map(bloque).join('\n')+';__c={MARCAS_POR_LINEA,PRESENTACIONES_POR_LINEA};',ctx);
const cat={marcas:ctx.__c.MARCAS_POR_LINEA,presentaciones:ctx.__c.PRESENTACIONES_POR_LINEA,hoy:'2026-11-24'};
const W=require(R+'/js/produccion/66w-planificacion-whatsapp.js');
const msg=fs.readFileSync(__dirname+'/datos/programacion-whatsapp-24-25-11.txt','utf8');
const r=W.leer(msg,cat);
ok(r.errores.length===0&&r.avisos.length===0,'el mensaje real se lee sin errores ni avisos'+(r.errores.length?': '+r.errores.join(' | '):''));
const [p1,p2]=r.programaciones;
ok(r.programaciones.length===2&&p1.fecha==='2026-11-24'&&p1.turno==='NOCHE'&&p2.fecha==='2026-11-25'&&p2.turno==='DÍA','dos programaciones: 24/11 Noche y 25/11 Día');
const L=(p,l)=>p.lineas.find(x=>x.linea===l);
const pasos=s=>s.filas.map(f=>f.marca+'|'+f.presentacion+'|'+(f.tipoFin==='CANTIDAD'?f.cantidad:f.tipoFin==='HORA'?'≤'+f.hora:'CIERRE')).join(' ; ');
ok(pasos(L(p1,'PET1'))==='Cuisine|Pack c/Sticker_Regular_2.5Lx6und|972 ; Cuisine|Pack_Regular_2.5Lx6und|9000 ; Scala|Pack_Regular_2.5Lx6und|CIERRE'&&L(p1,'PET1').horario==='21:00–07:00','PET1 24/11: Cuisine con sticker 972, Cuisine 9,000, Scala hasta el cierre; horario 21:00–07:00');
ok(pasos(L(p1,'PET2'))==='Cuisine|Pack_Regular_TP_1Lx6und/ln|8000 ; Bells|Pack_Regular_TP_1Lx6und/ln|6000 ; Scala|Pack_Regular_TP_1Lx6und/ln|CIERRE'&&L(p1,'PET2').notas.includes('Tapa plana celeste'),'PET2 = línea nueva: TP 1L x6 /ln, con la nota «Tapa plana celeste»');
ok(pasos(L(p1,'B7L'))==='SCALA|7 Litros|≤02:00 ; CUISINE|7 Litros|2600 ; ARO|7 Litros|600 ; SCALA|7 Litros|CIERRE'&&L(p1,'B7L').notas.includes('NO PARA')&&L(p1,'B7L').horario==='19:00–07:00','B7L: Scala hasta 02:00 → Cuisine 2,600 → Aro 600 → Scala hasta el cierre · NO PARA');
ok(pasos(L(p1,'C20L'))==='Cuisine|Caja 20 Litros|CIERRE'&&pasos(L(p1,'B20L'))==='Glacial|Bidón 20 Litros|CIERRE','Cajas 20L Cuisine y Bidones 20L Glacial: todo el turno');
ok(p1.notas.length===1&&/Hielo: Todas las máquinas formadoras operativas/.test(p1.notas[0])&&!p1.lineas.some(x=>x.linea==='HIELO'),'Hielo: queda como nota del plan, sin filas');
ok(pasos(L(p2,'PET1'))==='Bells|Pack_Regular_2.5Lx6und|6000 ; Scala|Pack_Regular_2.5Lx6und|CIERRE'&&L(p2,'PET1').horario==='07:00–18:30','PET1 25/11: Bells 6,000 y Scala el resto (07:00–18:30)');
ok(pasos(L(p2,'PET2'))==='Fontlife|Pack_Regular_TP_1Lx6und/ln|42000'&&L(p2,'PET2').filas[0].notas[0]==='Tapa plana azul','PET2 25/11: Fontlife 42,000 TP 1L /ln con «Tapa plana azul»');
ok(pasos(L(p2,'B7L'))==='SCALA|7 Litros|CIERRE','B7L 25/11: Scala todo el turno');
const t=W.resumen(r);
ok(/\*24\/11 · Turno NOCHE\*/.test(t)&&/1\. SCALA .*: hasta 02:00/.test(t)&&/4\. SCALA .*: resto del turno/.test(t)&&/1\. Cuisine .*Caja.*: todo el turno/.test(t)&&/Responde \*OK\*/.test(t),'resumen para el privado: pasos en orden y «Responde OK / NO»');
// variantes
const v=s=>W.leer('*Programación 26/11 Turno Dia\n'+s,cat);
ok(v('*PET2 1L*\n. Bells: 5000').errores.some(e=>/PET2 1L: indica cuál/.test(e)),'PET2 1L sin «tapa plana»: pide elegir (sport cap x6 o x12)');
ok(W.leer('*Programación 26/11 Turno Dia\n*PET2 1L x12*\n. Bells: 5000',cat).programaciones[0].lineas[0].filas[0].presentacion==='Pack_Regular_SC_1Lx12und/ln','PET2 1L x12 → sport cap x12 /ln');
ok(v('*Bidones 7L*\n* Marca Rara: 300').errores.some(e=>/no conozco la marca «Marca Rara»/.test(e)),'marca desconocida: error claro y no se carga');
ok(v('*Bidones 7L*\n* Scala: resto del turno\n* Aro: 600').errores.some(e=>/no es el último/.test(e)),'«resto del turno» que no es el último paso: error');
ok(v('*Pet 2.5L*\n. Cuisine: 1.500').programaciones[0].lineas[0].filas[0].cantidad===1500&&v('*Pet 2.5L*\n. Cuisine: 12,000').programaciones[0].lineas[0].filas[0].cantidad===12000,'cantidades con separador de miles (1.500 / 12,000)');
ok(v('*Bidones 7L*\n* Scala: hasta las 3 pm\n* Aro: resto').programaciones[0].lineas[0].filas[0].hora==='15:00','«hasta las 3 pm» → 15:00');
ok(W.leer('hola equipo',cat).errores.some(e=>/No encontré «Programación/.test(e)),'un mensaje sin «Programación dd/mm Turno …» no se toma como programación');
ok(W.leer('*Programación 31/12 Turno Noche\n*Bidones 20L*\n* Glacial',{...cat,hoy:'2027-01-02'}).programaciones[0].fecha==='2026-12-31','año: el 31/12 leído el 2 de enero es del año anterior');
ok(W.mismoNumero('+51 987 654 321','987654321')&&!W.mismoNumero('987654321','987654322'),'número de WhatsApp: se compara por los últimos 9 dígitos');
// 25/11/2026: WhatsApp usa «・» como viñeta (mensaje real del grupo)
{const w=W.leer('*Programación 24/11 Turno Noche\n*Bidones 7L*( De 07:00 PM a 07:00 AM)\n  ・Scala: Hasta las 2 AM\n  ・Cuisine Co: 2600\n  ・Aro: 600\n  ・Scala: Resto del turno.\n*Bidones 7L NO PARA*\n*Cajas 20L*\n  ・Cuisine Co',cat);
 ok(!w.errores.length&&!w.avisos.length&&pasos(w.programaciones[0].lineas[0])==='SCALA|7 Litros|≤02:00 ; CUISINE|7 Litros|2600 ; ARO|7 Litros|600 ; SCALA|7 Litros|CIERRE'&&w.programaciones[0].lineas[1].filas[0].marca==='Cuisine','viñetas «・» de WhatsApp: se leen igual');}
// 25/11/2026: PET2 625 ml (x6 o x15 se indica), «Scala con gas» = Scala_Gas y «Cambio a CON GAS»
{const base='*Programación 26/11 Turno Dia\n*PET2 625 mL x15 S/G (tapa plana azul):\n';
 const a=W.leer(base+'. Scala: 55000\n. Scala con gas: 60000',cat);
 ok(!a.errores.length&&pasos(a.programaciones[0].lineas[0])==='Scala|Pack_Regular_625mlx15und/ln|55000 ; Scala_Gas|Pack_Regular_625mlx15und/ln|60000','PET2 625 x15: «Scala con gas» → Scala_Gas (la tapa plana de 625 es solo nota)'+(a.errores.length?': '+a.errores.join(' | '):''));
 const b=W.leer(base+'. Scala: 55000\n. Cambio a CON GAS\n. Scala: 60000',cat);
 ok(!b.errores.length&&pasos(b.programaciones[0].lineas[0])==='Scala|Pack_Regular_625mlx15und/ln|55000 ; Scala_Gas|Pack_Regular_625mlx15und/ln|60000','«Cambio a CON GAS»: las marcas siguientes pasan a su variante con gas');
 const c2=W.leer('*Programación 26/11 Turno Dia\n*PET2 625 mL x6 S/G:\n. Bells gas: 100\n. Bells piña kion: 200\n. Scala manzana: 300',cat);
 ok(!c2.errores.length&&pasos(c2.programaciones[0].lineas[0])==='Bells_Gas|Pack_Regular_625mlx6und/ln|100 ; Bells_Piña_Kion|Pack_Regular_625mlx6und/ln|200 ; scala_Manzana|Pack_Regular_625mlx6und/ln|300','PET2 625 x6: «Bells gas», «Bells piña kion», «Scala manzana» → sus variantes');
 ok(W.leer(base+'. Scala: 55000',cat).errores.length===0&&W.leer('*Programación 26/11 Turno Dia\n*PET2 625 mL S/G:\n. Scala: 55000',cat).errores.some(e=>/625ml: indica cuál/.test(e)),'PET2 625 sin x6/x15: sigue pidiendo indicar cuál');
 ok(W.leer('*Programación 26/11 Turno Dia\n*Bidones 7L*\n* Scala con gas: 300',cat).errores.some(e=>/no conozco la marca «Scala con gas»/.test(e)),'una marca sin variante con gas en esa línea: error claro (no cambia de marca en silencio)');}
console.log(fallas?fallas+' falla(s)':'todo correcto');process.exit(fallas?1:0);
