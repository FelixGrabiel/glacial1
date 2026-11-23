/* Maquinistas registrados por Mantenimiento cuando no hay Tareo de Producción (28b-maquinistas-mantenimiento.js, 23/11/2026). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,isFinite,Boolean};vm.createContext(sb);sb.window=sb;
sb.recalcularPersonaTareo=(p)=>{p.horasTrabajadas=p.asistencia==='Asistió'&&p.horaIngreso&&p.horaSalida?11:0;};
vm.runInContext(leer('js/personal/28b-maquinistas-mantenimiento.js'),sb);
const M=sb.glacialMaquinistasMtto;
const ana={trabajadorId:'w1',nombre:'Ana Soplado',dni:'40000001',linea:'PET1'},beto={trabajadorId:'w2',nombre:'Beto Envase',dni:'40000002',linea:'B7L'},
  caro={trabajadorId:'w3',nombre:'Caro Paz',dni:'',linea:'PET2'},dani={trabajadorId:'w4',nombre:'Dani Ruiz',linea:'C20L'};
ok(M.claveMaq(ana)==='id:w1'&&M.claveMaq({dni:'40.000.002',nombre:'X'})==='dni:40000002'&&M.claveMaq({nombre:'Éle Ñu'})==='n:'+'éle ñu'.normalize('NFD').replace(/[̀-ͯ]/g,''),'clave del maquinista: id, si no DNI, si no nombre');
ok(M.mismaPersona({trabajadorId:'w1',nombre:'A'},{trabajadorId:'w1',nombre:'B'})&&M.mismaPersona({dni:'1'},{dni:'1'})&&M.mismaPersona({nombre:'Ana  Soplado'.replace('  ',' ')},{nombre:'ana soplado'})&&!M.mismaPersona(ana,beto),'misma persona por id, DNI o nombre');
const rot={tieneRotacion:true,trabajan:[ana,beto],descansan:[caro,dani],intermedio:[beto]};
let r=M.filasPanel(rot,[]);
ok(r.filas.map(f=>f.nombre).join(',')==='Ana Soplado,Beto Envase'&&r.descanso.length===2&&r.filas[1]._intermedio&&!r.filas[0]._registrado,'panel: los que trabajan según la rotación (Intermedio marcado) y los que descansan aparte');
r=M.filasPanel(rot,[{trabajadorId:'w1',nombre:'Ana Soplado',asistencia:'Asistió',horaIngreso:'07:00'},{trabajadorId:'w3',nombre:'Caro Paz',trabajoEnDescanso:true,asistencia:'Asistió'},{trabajadorId:'w9',nombre:'Eva Extra',asistencia:'Asistió'}]);
ok(r.filas[0]._registrado&&r.filas[0].horaIngreso==='07:00'&&r.filas.some(f=>f.nombre==='Caro Paz'&&f._enDescanso)&&r.filas.some(f=>f.nombre==='Eva Extra'&&f._fueraRotacion)&&r.descanso.length===1,'lo registrado se ve en su fila; quien trabajó en descanso y quien no está en la rotación también');

/* copia al Tareo de Producción */
const mtto={maquinistasMtto:[{trabajadorId:'w1',nombre:'Ana Soplado',dni:'40000001',asistencia:'Asistió',horaIngreso:'07:00',horaSalida:'19:00',registradoPor:'Cristian Meza',actualizadoEn:100},
  {trabajadorId:'w2',nombre:'Beto Envase',asistencia:'Asistió',horaIngreso:'07:05',registradoPor:'Cristian Meza',actualizadoEn:100},
  {trabajadorId:'w4',nombre:'Dani Ruiz',asistencia:'',registradoPor:'Cristian Meza',actualizadoEn:100},
  {trabajadorId:'w5',nombre:'Nuevo Maq',asistencia:'Falta por justificar',registradoPor:'Cristian Meza',actualizadoEn:100}]};
const prod={personal:[{trabajadorId:'w1',nombre:'Ana Soplado',cargo:'Maquinista',asistencia:''},{trabajadorId:'w2',nombre:'Beto Envase',cargo:'Maquinista',asistencia:'Asistió',horaIngreso:'07:10'},{trabajadorId:'x',nombre:'Operario',cargo:'Operario',asistencia:'Asistió'}]};
let n=M.copiarAProduccion(prod,mtto,'Félix López',500);
const a=prod.personal.find(p=>p.trabajadorId==='w1'),b=prod.personal.find(p=>p.trabajadorId==='w2'),nu=prod.personal.find(p=>p.trabajadorId==='w5');
ok(n===2&&a.asistencia==='Asistió'&&a.horaIngreso==='07:00'&&a.horaSalida==='19:00'&&a.registradoPorArea==='Mantenimiento'&&a.horasTrabajadas===11,'se copia a la fila sin asistencia (y se recalculan sus horas)');
ok(b.horaIngreso==='07:10'&&!b.registradoPorArea,'lo que Producción ya tenía manda (07:10 se queda)');
ok(nu&&nu.asistencia==='Falta por justificar'&&nu.cargo==='Maquinista de Producción','un maquinista que no estaba en el Tareo de Producción se agrega');
ok(!prod.personal.some(p=>p.trabajadorId==='w4'),'sin datos registrados (Dani) no se copia nada');
ok(prod.maquinistasDesdeMtto.copiados===2&&prod.maquinistasDesdeMtto.deMtto==='Cristian Meza'&&prod.maquinistasDesdeMtto.por==='Félix López','queda la marca de la copia (cuántos, quién registró y quién abrió)');
ok(M.copiarAProduccion(prod,mtto,'Félix López',600)===0,'una segunda vez no vuelve a copiar');
a.horaIngreso='07:15';
ok(M.copiarAProduccion(prod,mtto,'Félix López',700)===0&&a.horaIngreso==='07:15'&&a.valoresMtto.horaIngreso==='07:00','si Producción corrige después, no se pisa; se guarda lo que puso Mantenimiento para mostrarlo tachado');
mtto.maquinistasMtto[0].actualizadoEn=200;mtto.maquinistasMtto[0].horaSalida='19:30';
ok(M.copiarAProduccion(prod,mtto,'Félix López',800)===0&&a.horaSalida==='19:00','un cambio posterior de Mantenimiento tampoco pisa lo de Producción');

/* conexión */
const html=leer('index.html'),f=leer('js/personal/28b-maquinistas-mantenimiento.js');
ok(html.indexOf('28b-maquinistas-mantenimiento.js?v=')>html.indexOf('37f-tareo-por-tecnico.js?v=')&&html.indexOf('28b-maquinistas-mantenimiento.js?v=')<html.indexOf('12-init.js'),'index.html carga 28b después de 28/33/37f y antes de 12-init');
ok(/tareoPuedeEditarSalidaMaquinistas\(\)/.test(f)&&/esMantCompartido/.test(f)&&/Producción ya tiene su Tareo de este turno/.test(f),'solo quien puede editar la salida de maquinistas; nunca la cuenta compartida; con Tareo de Producción no se registra en Mantenimiento');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
