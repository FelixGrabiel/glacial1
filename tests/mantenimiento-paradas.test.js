/* Mantenimiento ↔ Producción: paradas por falla por máquina del plan. Datos inventados (hoy = 2026-11-07). */
const fs=require('fs'),path=require('path');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const N=require('../js/mantenimiento/71-plan-anual-nucleo.js');
const leer=f=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');

const maquinas=[{id:'m1',codigo_hoja:'SOP',nombre:'SOPLADORA'},{id:'m2',codigo_hoja:'SOP CARB',nombre:'SOPLADORA 8 CAVIDADES'},{id:'m3',codigo_hoja:'ENV',nombre:'ENVASADORA'},
  {id:'m4',codigo_hoja:'ETIQ',nombre:'ETIQUETADORA'},{id:'m5',codigo_hoja:'HORNO',nombre:'HORNO TERMOCONTRAÍBLE'},{id:'m6',codigo_hoja:'B7L-LLEN-AB',nombre:'LLENADORA',linea:'B7L',activo:true}];
ok(N.maquinaDeParada('PET1','Sopladora',maquinas).codigo_hoja==='SOP'&&N.maquinaDeParada('PET2','Sopladora',maquinas).codigo_hoja==='SOP CARB','PET1 → SOP; PET2 → SOP CARB (tabla de equivalencias)');
ok(N.maquinaDeParada('PET2','etiquetadora',maquinas).codigo_hoja==='ETIQ'&&N.maquinaDeParada('PET1','Etiquetadora ',maquinas).codigo_hoja==='ETIQ','la etiquetadora sirve a las dos líneas; mayúsculas y espacios no importan');
ok(N.maquinaDeParada('PET1','Horno',maquinas).codigo_hoja==='HORNO','un equipo que no está en la tabla se asocia por nombre si hay una sola coincidencia (Horno → HORNO TERMOCONTRAÍBLE)');
ok(N.maquinaDeParada('PET1','Compresor',maquinas)===null&&N.maquinaDeParada('PET1','',maquinas)===null,'sin coincidencia o sin equipo: ninguna');
ok(N.maquinaDeParada('B7L','Llenadora',maquinas).codigo_hoja==='B7L-LLEN-AB','una máquina creada en B7L se asocia por nombre a las paradas de B7L');
ok(N.maquinaDeParada('PET1','Sopladora',maquinas,[{linea:'PET1',equipo:'Sopladora',hoja:''}])===null,'una equivalencia con hoja vacía deja ese equipo fuera a propósito');
ok(N.maquinaDeParada('PET1','Sopladora',maquinas,[{linea:'PET1',equipo:'Sopladora',hoja:'SOP CARB'}]).codigo_hoja==='SOP CARB','la tabla guardada manda sobre la de partida');

const equipoDe=it=>/falla/i.test(it.causa||'')?(it.equipo||'Equipo sin indicar'):null;
const u=(fecha,linea,items)=>({fecha,linea,turno:'DÍA',npItems:items});
const it=(equipo,min,causa)=>({equipo,minutos:min,causa:causa||'Falla de máquina',motivo:'x'});
const unidades=[u('2026-11-03','PET1',[it('Sopladora',30)]),u('2026-11-05','PET1',[it('Sopladora',20),it('Etiquetadora',10)]),u('2026-11-06','PET1',[it('Sopladora',45)]),u('2026-10-20','PET1',[it('Sopladora',60)]),
  u('2026-11-06','PET2',[it('Sopladora',15),it('Envasadora',5,'Cambio de formato')]),u('2026-11-06','PET2',[it('Sopladora',0,'Falla de máquina')])];
const por=N.paradasPorMaquina(unidades,maquinas,null,equipoDe,{fallasUmbral:3,fallasDias:7},'2026-11-07');
const g1=por.get('m1');
ok(g1.fallas===4&&g1.minutos===155&&g1.ultima==='2026-11-06','SOP: 4 paradas por falla (155 min), la última el 06/11');
ok(g1.repetitiva&&g1.repetitiva.n===3&&g1.repetitiva.minutos===95&&g1.repetitiva.desde==='2026-11-03','falla repetitiva: 3 paradas en los últimos 7 días (la del 20/10 no cuenta)');
ok(por.get('m2').fallas===2&&por.get('m2').repetitiva===null,'SOP CARB (PET2): 2 paradas, sin falla repetitiva');
ok(!por.has('m3')&&por.get('m4').fallas===1,'las paradas que no son falla no cuentan; la etiquetadora tiene 1');
ok(N.paradasPorMaquina([u('2026-11-06','PET1',[{equipo:'Equipo sin indicar',minutos:9,causa:'Falla de máquina'}])],maquinas,null,equipoDe,{},'2026-11-07').size===0,'«Equipo sin indicar» no se atribuye a ninguna máquina');

/* estado del preventivo */
const act=[{id:'a1',maquina_id:'m1',anio:2026,semanas:[44,45,46],actividad:'LUBRICACIÓN'},{id:'a2',maquina_id:'m1',anio:2026,semanas:[44],actividad:'LIMPIEZA'}];
const ejec=new Map([['a1',new Map([[44,{estado:'ok'}],[45,{estado:'no',motivo:'Falta de repuesto'}]])]]);
const pv=N.estadoPreventivo('m1',act,ejec,{anio:2026,semana:47},44);
ok(pv.vencidas===3&&pv.noRealizadas.length===1&&pv.noRealizadas[0].motivo==='Falta de repuesto'&&pv.ultimaHecha.semana===44,'preventivo de SOP: 3 vencidas (S45 no realizada, S46 y la de limpieza de S44 sin hacer), última hecha S44');

/* conexión */
const p79=leer('js/mantenimiento/79-paradas-mantenimiento.js'),p73=leer('js/mantenimiento/73-plan-anual-pantalla.js'),p76=leer('js/mantenimiento/76-registro-pantalla.js'),p68=leer('js/mantenimiento/68-mantenimiento-inicio.js'),idx=leer('index.html'),d72=leer('js/mantenimiento/72-plan-anual-datos.js');
ok(/htmlTarjetaPlan\(maq/.test(p73)&&/htmlPanelRegistro\(maq,reg\)/.test(p76)&&/glacialMttoParadas\.htmlInicio\(\)/.test(p68),'el Plan anual, el Registro y el Inicio usan las paradas de Producción');
ok(/guardarEquivalencias/.test(d72)&&/equiposPlan/.test(d72)&&/79-paradas-mantenimiento\.js\?v=\d{8}-pr\d/.test(idx),'las equivalencias se guardan en mtto_config.datos.equiposPlan y el script está en la página');
ok(!/ejecutar|\.insert\(|\.update\(/.test(p79.replace(/guardarEquivalencias/g,'')),'el módulo de paradas solo lee: no escribe paradas');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
