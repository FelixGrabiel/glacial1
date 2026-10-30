/* Personal del turno desde el Tareo de Producción: presentes del bloque, posición por cargo, completar solo filas vacías sin repetir ni pisar. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const P=require(R+'/js/produccion/35b-personal-desde-tareo.js');

ok(P.posicionDeCargo('MAQUINISTA SOPLADOR T2')==='Sopladora'&&P.posicionDeCargo('MAQUINISTA ENVASADOR JR')==='Envasadora'&&P.posicionDeCargo('MAQUINISTA ETIQUETADOR SENIOR')==='Etiquetadora'&&P.posicionDeCargo('MAQUINISTA EMPAQUETADOR')==='Empaquetadora'&&P.posicionDeCargo('OPERARIO DE PRODUCCION')===null,'el cargo del tareo da la posición (el operario genérico no tiene posición)');

const per=(id,nombre,cargo,asistencia)=>({trabajadorId:id,nombre,cargo,asistencia});
const tareos=[
  {fecha:'2026-10-20',turno:'DÍA',area:'Producción',personal:[per('w1','LUNA RUIZ ANA','MAQUINISTA SOPLADOR T1','ASISTIO'),per('w2','PEREZ SOTO LUIS','MAQUINISTA ENVASADOR','TARDANZA'),per('w3','DIAZ MORA ROSA','OPERARIO DE PRODUCCION','ASISTIO'),per('w4','FALTO JUAN','MAQUINISTA ETIQUETADOR','FALTA')]},
  {fecha:'2026-10-20',turno:'INTERMEDIO',area:'Producción',personal:[per('w3','DIAZ MORA ROSA','OPERARIO DE PRODUCCION','ASISTIO'),per('w5','CRUZ VEGA PEDRO','',' ASISTIO'.trim())]},
  {fecha:'2026-10-20',turno:'NOCHE',area:'Producción',personal:[per('w6','NOCHE UNO','MAQUINISTA SOPLADOR','ASISTIO')]},
  {fecha:'2026-10-20',turno:'DÍA',area:'Mantenimiento',personal:[per('t1','TECNICO UNO','TECNICO DE MANTENIMIENTO','ASISTIO')]}
];
const workers=[{id:'w5',nombre:'CRUZ VEGA PEDRO',cargo:'MAQUINISTA EMPAQUETADOR',linea:''},{id:'w1',nombre:'LUNA RUIZ ANA',cargo:'MAQUINISTA SOPLADOR T1',linea:'PET2'}];
const dia=P.presentes(tareos,'2026-10-20','DÍA',workers);
ok(dia.length===4&&!dia.some(p=>p.nombre==='FALTO JUAN')&&!dia.some(p=>p.nombre==='TECNICO UNO'),'presentes del bloque Día + Intermedio: sin faltas ni Mantenimiento; una persona en dos turnos cuenta una vez');
ok(dia.find(p=>p.id==='w5').cargo==='MAQUINISTA EMPAQUETADOR'&&dia.find(p=>p.id==='w5').posicion==='Empaquetadora','si el tareo no trae el cargo se toma del trabajador');
ok(P.presentes(tareos,'2026-10-20','NOCHE',workers).length===1,'la Noche es otro bloque');
ok(P.presentes(tareos,'2026-10-21','DÍA',workers)===null,'sin tareo de ese día: null (no se inventa que nadie vino)');

const filas=()=>['Sopladora','Envasadora','Etiquetadora','Empaquetadora','Paletizado','Paletizado'].map(p=>({posicion:p,nombre:'',cargo:''}));
const a=P.proponer(dia,filas(),'PET2');
ok(a.length===3&&a.find(x=>x.i===0).nombre==='LUNA RUIZ ANA'&&a.find(x=>x.i===1).nombre==='PEREZ SOTO LUIS'&&a.find(x=>x.i===3).nombre==='CRUZ VEGA PEDRO'&&!a.some(x=>x.i===2),'en PET 2 completa Sopladora, Envasadora y Empaquetadora; Etiquetadora queda vacía (nadie presente con ese cargo)');
const b=P.proponer(dia,filas(),'PET1');
ok(b.length===2&&!b.some(x=>x.nombre==='LUNA RUIZ ANA'),'Ana está fijada a PET 2: en PET 1 no se propone en Sopladora');
const f2=filas();f2[0].nombre='Escrito a mano';
ok(!P.proponer(dia,f2,'PET1').some(x=>x.i===0),'no pisa lo que el supervisor ya escribió');
const f3=filas();f3[1].nombre='PEREZ SOTO LUIS';
ok(P.proponer(dia,f3,'PET1').every(x=>x.nombre!=='PEREZ SOTO LUIS'),'no repite a una persona ya puesta');
const sin=P.sinUbicar(dia,filas(),'PET1');
ok(sin.some(p=>p.nombre==='DIAZ MORA ROSA')&&!sin.some(p=>p.nombre==='LUNA RUIZ ANA'),'sin ubicar: el resto de presentes, sin los de otra línea fija');

const s06=leer('js/produccion/06-registro.js'),html=leer('index.html');
ok(/personalTareoHtml\(linea\)/.test(s06),'el formulario «Personal del turno» muestra la pieza del tareo');
ok(html.indexOf('35b-personal-desde-tareo.js')>html.indexOf('35-autollenado-registro.js')&&/35b-personal-desde-tareo\.js\?v=20261030-pt1/.test(html),'index.html carga el módulo');
console.log(fallas?'\n'+fallas+' fallas':'\nPersonal desde el tareo correcto');
process.exit(fallas?1:0);
