/* Hielo · programación desde WhatsApp (97w-hielo-programacion-whatsapp.js): interpreta la lectura de la imagen del 25 y 26/11/2026. node tests/hielo-programacion-whatsapp.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const c=fs.readFileSync(R+'/js/nucleo/01-config.js','utf8');
const bloque=n=>{const i=c.indexOf('const '+n);return c.slice(i,c.indexOf('];',i)+2);};
const ctx={};vm.createContext(ctx);
vm.runInContext(bloque('PRODUCTOS_HIELO')+';const MARCAS_HIELO=[...new Set(PRODUCTOS_HIELO.map(p=>p[0]))];__c={PRODUCTOS_HIELO,MARCAS_HIELO};',ctx);
const cat={marcas:ctx.__c.MARCAS_HIELO,presentaciones:['3 kg','1.5 kg'],vasos:{marcas:['Glacial','OXXO']},pares:ctx.__c.PRODUCTOS_HIELO,hoy:'2026-11-25'};
const W=require(R+'/js/hielo/97w-hielo-programacion-whatsapp.js');

// lo que se ve en la imagen enviada por Edith (25 y 26/11/2026)
const f=(maquina,texto,kg,cantidad,detalle)=>({maquina,texto,kg,cantidad,detalle:detalle||''});
const lectura={esProgramacion:true,tablas:[
  {titulo:'MIERCOLES - TURNO NOCHE',fecha:'25-nov-26',filas:[
    f('Maq 1','HIELO GLACIAL','1,5','600'),f('Maq 2','HIELO BELLS','3','600'),f('Maq 3','HIELO LISTO','1,5','600'),f('Maq 4','HIELO BELLS','3','1800'),
    f('Maq 5','HIELO MOLITALIA diferido (envasadora automatica)','3','600'),f('Maq 6','HIELO GLACIAL (envasadora automatica)','3','600'),f('Maq 7','HIELO RAPPI (envasadora automatica)','3','600'),
    f('','VASOS GLACIAL CON TAPA','','75'),f('','VASOS OXXO CON TAPA URGENTE','','350')]},
  {titulo:'JUEVES - TURNO DIA',fecha:'26-nov-26',filas:[
    f('Maq 1','HIELO GLACIAL','1,5','600'),f('Maq 2','HIELO TOTTUS','3','880'),f('Maq 3','HIELO LISTO','1,5','600'),f('Maq 4','HIELO TOTTUS','3','1760'),
    f('Maq 5','HIELO BELLS (envasadora automatica)','3','1500'),f('','VASOS OXXO CON TAPA URGENTE','','350')]}]};
const r=W.interpretar(lectura,cat);
ok(r.errores.length===0,'la imagen real se lee sin errores'+(r.errores.length?': '+r.errores.join(' | '):''));
const g=(fecha,turno,prod)=>r.programaciones.find(p=>p.fecha===fecha&&p.turno===turno&&p.producto===prod);
const it=p=>p.items.map(i=>i.marca+'|'+i.presentacion+'|'+i.bolsas).join(' ; ');
ok(r.programaciones.length===4,'cuatro programaciones: 25/11 Noche y 26/11 Día, cada una de cubos y de vasos');
ok(it(g('2026-11-25','NOCHE','CUBOS'))==='Glacial|1.5 kg|600 ; Bell\'s|3 kg|2400 ; Listo|1.5 kg|600 ; Molitalia|3 kg|600 ; Glacial|3 kg|600 ; Rappi|3 kg|600','25/11 Noche: Bells de dos máquinas se suman (600+1800)');
ok(it(g('2026-11-25','NOCHE','VASOS'))==='Glacial|Vaso|75 ; OXXO|Vaso|350','25/11 Noche vasos: Glacial 75 y OXXO 350');
ok(it(g('2026-11-26','DÍA','CUBOS'))==='Glacial|1.5 kg|600 ; Tottus CD|3 kg|2640 ; Listo|1.5 kg|600 ; Bell\'s|3 kg|1500','26/11 Día: Tottus 880+1760 = 2,640');
ok(it(g('2026-11-26','DÍA','VASOS'))==='OXXO|Vaso|350','26/11 Día vasos: OXXO 350');
const mol=g('2026-11-25','NOCHE','CUBOS').items.find(i=>i.marca==='Molitalia');
ok(mol.notas.includes('diferido')&&mol.notas.includes('envasadora automática')&&mol.maquinas[0]==='Maq 5','Molitalia: queda la nota «diferido» y «envasadora automática» (Maq 5)');
ok(g('2026-11-25','NOCHE','VASOS').items[1].notas.includes('URGENTE'),'OXXO: nota URGENTE');
const t=W.resumen(r);
ok(/\*25\/11 · Turno NOCHE\*/.test(t)&&/Bell's 3 kg: 2,400 bolsas \(Maq 2 · Maq 4\)/.test(t)&&/OXXO: 350 vasos \(URGENTE\)/.test(t),'resumen para el privado');
// errores: no se carga nada
const e=(tabla)=>W.interpretar({esProgramacion:true,tablas:[Object.assign({titulo:'JUEVES - TURNO DIA',fecha:'26-nov-26'},tabla)]},cat);
ok(e({filas:[f('Maq 1','HIELO MARCAXYZ','3','100')]}).errores.some(x=>/no conozco la marca «MARCAXYZ»/.test(x)),'marca desconocida: error');
ok(e({filas:[f('Maq 1','HIELO GLACIAL','2','100')]}).errores.some(x=>/peso que no es una presentación/.test(x)),'peso que no existe (2 kg): error');
ok(e({filas:[f('Maq 1','HIELO GLACIAL','3','abc')]}).errores.some(x=>/no entendí la cantidad/.test(x)),'cantidad ilegible: error');
ok(e({filas:[f('Maq 1','HIELO RAPPI','1,5','100')]}).errores.some(x=>/Rappi 1.5 kg no está en el catálogo/.test(x)),'Rappi 1.5 kg no existe en el catálogo: error');
ok(W.interpretar({esProgramacion:true,tablas:[{titulo:'TURNO DIA',fecha:'',filas:[f('Maq 1','HIELO GLACIAL','3','100')]}]},cat).errores.some(x=>/no leí la fecha/.test(x)),'sin fecha: error');
ok(W.interpretar({esProgramacion:true,tablas:[{titulo:'JUEVES',fecha:'26-nov-26',filas:[f('Maq 1','HIELO GLACIAL','3','100')]}]},cat).errores.some(x=>/no leí el turno/.test(x)),'sin turno: error');
ok(W.interpretar({esProgramacion:false,tablas:[]},cat).errores.length===1&&W.interpretar({},cat).errores.length===1,'una imagen que no es programación: error (el bot calla)');
ok(W.interpretar({esProgramacion:true,tablas:[lectura.tablas[1],lectura.tablas[1]]},cat).errores.some(x=>/ya hay otra tabla/.test(x)),'dos tablas del mismo turno: error');
ok(W.fechaDe('25-nov-26')==='2026-11-25'&&W.fechaDe('26/11/2026')==='2026-11-26'&&W.fechaDe('31-feb-26')==='','fechas: «25-nov-26», «26/11/2026», imposible');
ok(W.mismoNumero('+51 945 538 638','945538638'),'número de WhatsApp: últimos 9 dígitos');
// 26/11/2026: la programación también puede venir como TEXTO («PROGRAMACIÓN TN»)
const TXT='PROGRAMACIÓN TN\nGlacial 1.5kg - 600 bolsas \nCuisine 3kg - 900 bolsas \nBells 3kg - 900 bolsas \nTottus 3kg - 1100 bolsas \n\nEnvasadora Automática\nMolitalia diferido - 300 bolsas\nGlacial 3kg - 600 bolsas\nRappi 3kg - 900 bolsas\n\nVasos Glacial - 70 unidades\nVasos Oxxo - 350 unidades';
const rt=W.interpretarTexto(TXT,Object.assign({},cat,{hoy:'2026-11-26',hora:15}));
ok(rt.errores.length===0,'el texto «PROGRAMACIÓN TN» se lee sin errores'+(rt.errores.length?': '+rt.errores.join(' | '):''));
const gt=(prod)=>rt.programaciones.find(p=>p.producto===prod);
ok(rt.programaciones.length===2&&gt('CUBOS').fecha==='2026-11-26'&&gt('CUBOS').turno==='NOCHE','TN sin fecha: turno NOCHE del día de hoy (26/11), hielo y vasos');
ok(it(gt('CUBOS'))==="Glacial|1.5 kg|600 ; Cusine & Co|3 kg|900 ; Bell's|3 kg|900 ; Tottus CD|3 kg|1100 ; Molitalia|3 kg|300 ; Glacial|3 kg|600 ; Rappi|3 kg|900",'marcas, kg y bolsas (Cuisine = Cusine & Co, Bells = Bell\'s, Tottus = Tottus CD)');
const molt=gt('CUBOS').items.find(i=>i.marca==='Molitalia');
ok(molt.presentacion==='3 kg'&&molt.notas.includes('diferido')&&molt.notas.includes('envasadora automática'),'Molitalia sin kg toma su única presentación (3 kg); queda «diferido» y «envasadora automática»');
ok(gt('CUBOS').items.find(i=>i.marca==='Glacial'&&i.presentacion==='3 kg').notas.includes('envasadora automática')&&!gt('CUBOS').items[0].notas.includes('envasadora automática'),'«Envasadora Automática» solo vale para las líneas que siguen hasta la línea en blanco');
ok(it(gt('VASOS'))==='Glacial|Vaso|70 ; OXXO|Vaso|350','vasos: Glacial 70 y Oxxo 350');
const f1=(t,hoy,hora)=>W.leerTexto(t,{hoy,hora}).lectura.tablas[0].fecha;
ok(f1('PROGRAMACIÓN TN\nGlacial 3kg - 100 bolsas','2026-11-26',3)==='25/11/2026'&&f1('PROGRAMACIÓN TN\nGlacial 3kg - 100 bolsas','2026-11-26',19)==='26/11/2026'&&f1('PROGRAMACIÓN TD\nGlacial 3kg - 100 bolsas','2026-11-26',8)==='26/11/2026','sin fecha: TN de madrugada (antes de las 07:00) es del día anterior; TD, de hoy');
ok(f1('PROGRAMACIÓN TN 27/11\nGlacial 3kg - 100 bolsas','2026-11-26',15)==='27/11/2026'&&W.interpretarTexto('PROGRAMACIÓN TD 27/11/26\nGlacial 3kg - 100 bolsas',Object.assign({},cat,{hoy:'2026-11-26'})).programaciones[0].turno==='DÍA','fecha escrita en el encabezado (27/11 o 27/11/26) y TD = día');
ok(W.interpretarTexto('PROGRAMACIÓN TN\nMarcaXyz 3kg - 100 bolsas',Object.assign({},cat,{hoy:'2026-11-26'})).errores.some(x=>/no conozco la marca «MarcaXyz»/.test(x)),'marca desconocida en el texto: error');
ok(W.interpretarTexto('PROGRAMACIÓN TN\nGlacial 3kg - muchas',Object.assign({},cat,{hoy:'2026-11-26'})).errores.some(x=>/No entendí la línea/.test(x)),'línea sin cantidad: error');
ok(W.interpretarTexto('PROGRAMACIÓN TN\nGlacial - 100 bolsas',Object.assign({},cat,{hoy:'2026-11-26'})).errores.some(x=>/peso/.test(x)),'Glacial sin kg (tiene 3 kg y 1.5 kg): error, no adivina');
ok(W.esTextoProgramacion(TXT)&&W.esTextoProgramacion('programación td\nBells 3kg - 5')&&W.esTextoProgramacion('PROGRAMACIÓN TURNO NOCHE\nBells 3kg - 5')&&!W.esTextoProgramacion('*Programación 24/11 Turno Noche (Agua)')&&!W.esTextoProgramacion('buenas tardes'),'se reconoce el encabezado (TN, TD, TI, TURNO NOCHE)');
console.log(fallas?fallas+' falla(s)':'todo correcto');process.exit(fallas?1:0);
