/* Avance y cierre de Hielo (97-hielo.js): los vasos van en su propio bloque, aparte de Hielo en cubos (24/11/2026).
   Caso real del 24/11/2026, turno Día + Intermedio: cubos (Bell's 1,200 · Glacial 3 kg 900 · Glacial 1.5 kg 960 · Listo 1.5 kg 600) y 105 vasos OXXO. */
'use strict';
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const N=require('../js/hielo/97-hielo.js');
const P=(marca,presentacion,bolsas,estacion)=>({marca,presentacion,bolsas,estacion});
const cubos={id:'2026-11-24_DÍA',fecha:'2026-11-24',turno:'DÍA',estado:'EN_REGISTRO',horaInicio:'07:00',
  produccion:[P("Bell's",'3 kg',1200,'Env. automática'),P('Glacial','3 kg',900,'Tolva manual'),P('Glacial','1.5 kg',960,'Tolva manual'),P('Listo','1.5 kg',600,'Tolva manual')],
  paradas:[{motivo:'Otros',minutos:60,nota:'Refrigerio'}],mermas:[],observaciones:'Merma 1 tapa'};
const vasos={id:'2026-11-24_DÍA_VASOS',producto:'VASOS',fecha:'2026-11-24',turno:'DÍA',estado:'EN_REGISTRO',produccion:[P('OXXO','Vaso',105,'Tolva manual')],paradas:[],mermas:[],observaciones:'Vasos ok'};
const prog={id:'2026-11-24_DÍA',fecha:'2026-11-24',turno:'DÍA',items:[{marca:"Bell's",presentacion:'3 kg',bolsas:1800},{marca:'Glacial',presentacion:'3 kg',bolsas:900},{marca:'Glacial',presentacion:'1.5 kg',bolsas:960},{marca:'Listo',presentacion:'1.5 kg',bolsas:600},{marca:'Molitalia',presentacion:'3 kg',bolsas:600},{marca:'Cusine & Co',presentacion:'3 kg',bolsas:600}]};
const base={fecha:'2026-11-24',turnoTxt:'Turno Día + Intermedio',turnoCod:'D+I',producto:'CUBOS',hora:'15:10'};

// 1) La página: reportes de cubos y, aparte, los de vasos del mismo turno
const m=N.modeloAvanceCierre(Object.assign({},base,{reportes:[cubos],programas:[prog],vasos:{reportes:[vasos],programas:[]}}));
ok(m.bolsas===3660&&m.kg===8640,'cubos: 3,660 bolsas y 8,640 kg (sin los vasos)');
ok(m.programado===5460&&Math.round(m.cumplimiento*100)===67,'cubos: programado 5,460 bolsas y cumplimiento 67 %');
ok(m.vasos&&m.vasos.bolsas===105&&m.vasos.unidad==='vasos'&&m.vasos.jabas===3&&Math.abs(m.vasos.kg-26.25)<1e-9,'vasos aparte: 105 vasos, 3 jabas, 26.25 kg aproximados');
ok(!m.estaciones.some(e=>e.filas.some(f=>/vaso/i.test(f.presentacion))),'ninguna estación de cubos lleva vasos');
const t=N.textoAvanceCierre(m);
ok(t.indexOf('*HIELO EN CUBOS*')<t.indexOf('TOTAL KILOS: 8640kg')&&t.indexOf('TOTAL KILOS: 8640kg')<t.indexOf('*VASOS DE HIELO*')&&t.indexOf('*VASOS DE HIELO*')<t.indexOf('TOTAL VASOS: 105'),'texto: primero cubos con su total de kilos, después vasos con su total');
ok(/Programado: 5460 bolsas · Cumplimiento: 67 %/.test(t)&&/OXXO: 105/.test(t)&&/Jabas: 3/.test(t),'texto: programado de cubos, OXXO 105 y jabas');
ok(/Observaciones[\s\S]*Merma 1 tapa[\s\S]*Vasos: Vasos ok/.test(t),'observaciones de vasos marcadas «Vasos:»');

// 2) El bot: pasa TODOS los reportes del turno (cubos + vasos) en la misma lista
const b=N.modeloAvanceCierre(Object.assign({},base,{reportes:[cubos,vasos],programas:[prog]}));
ok(b.bolsas===3660&&b.kg===8640&&b.vasos&&b.vasos.bolsas===105,'bot (todos los reportes juntos): también separa cubos y vasos');

// 3) Un vaso cargado por error dentro del reporte de cubos (lo que pasó a las 15:10)
const mezclado=Object.assign({},cubos,{produccion:cubos.produccion.concat([P('OXXO','Vaso',105,'Tolva manual')])});
const e=N.modeloAvanceCierre(Object.assign({},base,{reportes:[mezclado],programas:[prog]}));
ok(e.bolsas===3660&&e.kg===8640&&e.vasos&&e.vasos.bolsas===105,'vaso dentro del reporte de cubos: pasa al bloque de vasos');
ok(e.estaciones.find(x=>x.estacion==='Tolva manual').filas.length===3,'Tolva manual de cubos queda con 3 filas (2,460 bolsas)');

// 4) Sin vasos: igual que antes
const s=N.modeloAvanceCierre(Object.assign({},base,{reportes:[cubos],programas:[prog]}));
ok(s.vasos===null&&!/VASOS/.test(N.textoAvanceCierre(s))&&!/HIELO EN CUBOS/.test(N.textoAvanceCierre(s)),'sin vasos: no aparece el bloque ni los títulos nuevos');

// 5) CIERRE solo cuando cubos y vasos están finalizados
const fin=r=>Object.assign({},r,{estado:'FINALIZADO'});
ok(N.modeloAvanceCierre(Object.assign({},base,{reportes:[fin(cubos)],vasos:{reportes:[vasos]}})).tipo==='AVANCE','cubos finalizado y vasos en registro: sigue AVANCE');
ok(N.modeloAvanceCierre(Object.assign({},base,{reportes:[fin(cubos)],vasos:{reportes:[fin(vasos)]}})).tipo==='CIERRE','cubos y vasos finalizados: CIERRE');

// 6) El avance de Vasos (producto VASOS) no cambia
const v=N.modeloAvanceCierre(Object.assign({},base,{producto:'VASOS',reportes:[vasos]}));
ok(v.vasos===null&&v.bolsas===105&&v.titulo==='AVANCE DE PRODUCCIÓN HIELO VASOS','avance de Vasos: igual que antes');
console.log(fallas?fallas+' falla(s)':'todo correcto');process.exit(fallas?1:0);
