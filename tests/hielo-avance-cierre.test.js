/* Reporte Hielo · Avance y cierre: modelo y texto para WhatsApp (js/hielo/97-hielo.js › modeloAvanceCierre / textoAvanceCierre). */
'use strict';
const H=require('../js/hielo/97-hielo.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const R=(turno,estado,prod,extra)=>Object.assign({id:'2026-11-09_'+turno,fecha:'2026-11-09',turno,estado,supervisor:'Ana',horaInicio:turno==='DÍA'?'07:00':'14:00',horaFin:estado==='FINALIZADO'?(turno==='DÍA'?'14:00':'19:00'):'',produccion:prod,paradas:[],mermas:[],observaciones:''},extra||{});
const dia=R('DÍA','FINALIZADO',[{marca:'Glacial',presentacion:'3 kg',bolsas:800},{marca:'Glacial',presentacion:'1.5 kg',bolsas:400}],{paradas:[{inicio:'09:10',equipo:'Compresor',motivo:'Falla de equipo',minutos:20,nota:''}],mermas:[{item:'Bolsas',cantidad:12,unidad:'UND'}],observaciones:'Cambio de bobina a las 10:00'});
const inter=R('INTERMEDIO','EN_REGISTRO',[{marca:'Glacial',presentacion:'3 kg',bolsas:200}]);
const progs=[{fecha:'2026-11-09',turno:'DÍA',items:[{marca:'Glacial',presentacion:'3 kg',bolsas:1500},{marca:'Glacial',presentacion:'1.5 kg',bolsas:500}]}];
const base={fecha:'2026-11-09',turnoTxt:'Turno Día + Intermedio',hora:'14:05',generadoPor:'Ana'};

let m=H.modeloAvanceCierre({...base,reportes:[dia],programas:progs});
ok(m.tipo==='CIERRE'&&m.titulo==='CIERRE DE PRODUCCIÓN HIELO'&&m.bolsas===1200&&m.kg===3000&&m.programado===2000&&Math.round(m.cumplimiento*100)===60,'todos finalizados = CIERRE: 1 200 bolsas, 3 000 kg, 60 % de 2 000');
m=H.modeloAvanceCierre({...base,reportes:[dia,inter],programas:progs});
ok(m.tipo==='AVANCE'&&m.titulo==='AVANCE DE PRODUCCIÓN HIELO'&&m.bolsas===1400,'si algún reporte sigue en registro = AVANCE');
ok(H.modeloAvanceCierre({...base,reportes:[],programas:progs}).tipo==='AVANCE'&&H.modeloAvanceCierre({...base,reportes:[],programas:[]}).reportes===0,'sin reportes no hay cierre');
ok(m.presentaciones.map(p=>p.presentacion+':'+p.bolsas+':'+p.kg).join()==='3 kg:1000:3000,1.5 kg:400:600'&&m.marcas.length===1&&m.marcas[0].bolsas===1400,'3 kg y 1.5 kg por separado con sus kilos, y total por marca');
const dia2=R('DÍA','FINALIZADO',[{marca:'Listo',presentacion:'1.5 kg',estacion:'Tolva manual',bolsas:1200},{marca:'Glacial',presentacion:'3 kg',estacion:'Tolva manual',bolsas:240},{marca:'Tottus',presentacion:'3 kg',estacion:'Env. automática',bolsas:660}],{caidas:true,observaciones:'M7 apagada',paradas:[{inicio:'09:10',equipo:'Compresor',motivo:'Falla de equipo',minutos:20,nota:''}],mermas:[{item:'Bolsas',cantidad:12,unidad:'UND'}]});
const t=H.textoAvanceCierre(H.modeloAvanceCierre({...base,turnoCod:'TD',reportes:[dia2],programas:[]}));
ok(/^Cierre de produccion HIELO TD\n09_11_26\nHora: 14:05\n/.test(t),'encabezado como el de la planta: «… HIELO TD» y fecha DD_MM_AA');
ok(/\nTOLVA MANUAL\nGlacial 3kg: 240\nListo 1\.5kg: 1200\n/.test(t)&&/\nENV\. AUTOMÁTICA\nTottus 3kg: 660\n/.test(t),'bloques por estación con marca, presentación y bolsas');
ok(/Producción de bolsas 3kg: 900\nProducción de 3kg: 2700kg\n/.test(t)&&/Producción de bolsas 1\.5kg: 1200\nProducción de 1\.5kg: 1800kg/.test(t.replace(/,/g,'.')),'totales por presentación en bolsas y kg');
ok(/\n🚨SE VIENE TRABAJANDO POR CAÍDAS\n/.test(t),'aviso de caídas cuando la casilla está marcada');
ok(/\nObservaciones\nM7 apagada\nCompresor – Falla de equipo \(20 min\)\nMerma Bolsas: 12 UND$/.test(t),'observaciones libres, paradas y merma al final');
const sinCaidas=H.textoAvanceCierre(H.modeloAvanceCierre({...base,reportes:[dia],programas:progs}));
ok(!/CAÍDAS/.test(sinCaidas)&&/Programado: 2000 bolsas · Cumplimiento: 60 %/.test(sinCaidas)&&!/^[A-ZÁÉÍÓÚ. ]+$/m.test(sinCaidas.split('\n').slice(3).join('\n').split('\n').filter(l=>/^[A-Z. ]{4,}$/.test(l)).join('')),'sin caídas no hay aviso; con programación se muestra el cumplimiento; sin estación no hay encabezado de estación');
const a=H.textoAvanceCierre(H.modeloAvanceCierre({...base,reportes:[dia,inter],programas:progs}));
ok(/^Avance de produccion HIELO/.test(a),'con algún reporte en registro = Avance');
const vacio=H.textoAvanceCierre(H.modeloAvanceCierre({...base,reportes:[],programas:[]}));
ok(/Todavía no hay reporte de hielo en este turno\./.test(vacio),'sin reporte: lo dice en vez de inventar ceros');

/* Último registro: la mayor actualizadoEn (hora de Lima) entre los reportes del turno; sin marca de tiempo no se muestra. */
const ur1={...dia,actualizadoEn:Date.UTC(2026,10,10,4,47)},ur2={...inter,actualizadoEn:Date.UTC(2026,10,10,2,5)};
const mu=H.modeloAvanceCierre({...base,reportes:[ur2,ur1],programas:[]});
ok(mu.ultimoRegistro==='23:47','último registro = el guardado más reciente, en hora de Lima (04:47 UTC = 23:47)');
ok(/\nHora: 14:05\nÚltimo registro: 23:47\n/.test(H.textoAvanceCierre(mu)),'el texto lo trae justo debajo de «Hora:»');
ok(H.modeloAvanceCierre({...base,reportes:[dia],programas:[]}).ultimoRegistro===''&&!/Último registro/.test(H.textoAvanceCierre(H.modeloAvanceCierre({...base,reportes:[dia],programas:[]}))),'sin marca de tiempo: no se inventa la hora');

process.exit(fallas?1:0);
