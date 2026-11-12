/* Reporte Hielo (js/hielo/97-hielo.js · glacial_46). Núcleo puro y conexiones. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const H=require(R+'/js/hielo/97-hielo.js');

ok(H.kgDe('1.5 kg')===1.5&&H.kgDe('3 kg')===3&&H.kgDe('5 kg')===5&&H.kgDe('1,5 kg')===1.5&&H.kgDe('bolsa')===0,'kgDe: lee los kg de la presentación');
ok(H.ordenPres(['1.5 kg','5 kg','3 kg','3 kg']).join()==='5 kg,3 kg,1.5 kg','ordenPres: de mayor a menor, sin repetidos');
ok(H.TURNOS.join()==='DÍA,INTERMEDIO,NOCHE'&&H.idReporte('2026-11-07','NOCHE')==='2026-11-07_NOCHE','turnos de Agua e id por fecha y turno');
ok(H.DEFECTO.equipos.length===0,'los equipos de la planta no se inventan: empiezan vacíos');

const r1={fecha:'2026-11-07',turno:'DÍA',produccion:[{marca:'Glacial',presentacion:'3 kg',bolsas:2600},{marca:'Tottus',presentacion:'3 kg',bolsas:'1700'},{marca:'Glacial',presentacion:'1.5 kg',bolsas:400},{marca:'Glacial',presentacion:'5 kg',bolsas:0}],
  paradas:[{inicio:'09:10',equipo:'Embolsadora',motivo:'Mantenimiento',minutos:15},{motivo:'Otros',minutos:'30',nota:'Falta de agua'}],mermas:[{item:'Bolsas',cantidad:50,unidad:'UND'},{item:'Bobina',cantidad:'1.8',unidad:'KG'}]};
const r2={fecha:'2026-11-07',turno:'NOCHE',produccion:[{marca:'Glacial',presentacion:'3 kg',bolsas:1000}],paradas:[],mermas:[{item:'Bolsas',cantidad:10,unidad:'UND'}]};
const t=H.totales([r1,r2]);
ok(t.porPres['3 kg']===5300&&t.porPres['1.5 kg']===400&&!t.porPres['5 kg'],'totales: bolsas separadas por presentación (3 kg y 1.5 kg)');
ok(t.bolsas===5700&&t.kg===5300*3+400*1.5,'totales: bolsas y kilos (bolsas × kg)');
ok(t.paradasMin===45&&t.paradas===2,'totales: paradas en minutos y eventos');
ok(t.merma.find(m=>m.item==='Bolsas'&&m.unidad==='UND').cantidad===60&&t.merma.find(m=>m.item==='Bobina').cantidad===1.8,'totales: merma por ítem y unidad');

const prog=[{items:[{marca:'Glacial',presentacion:'3 kg',bolsas:3000},{marca:'Tottus',presentacion:'3 kg',bolsas:2000},{marca:'Glacial',presentacion:'5 kg',bolsas:1000}]}];
const av=H.avance([r1],prog);
const fila=(m,p)=>av.filas.find(x=>x.marca===m&&x.presentacion===p);
ok(av.programado===6000&&av.producido===4700&&Math.abs(av.cumplimiento-4700/6000)<1e-12,'avance: cumplimiento = producido ÷ programado');
ok(fila('Glacial','5 kg').producido===0&&fila('Glacial','1.5 kg').programado===0&&fila('Glacial','1.5 kg').pct===null,'avance: incluye lo programado sin producir y lo producido sin programar');
ok(av.filas[0].presentacion==='5 kg'&&H.avance([],[]).cumplimiento===null,'avance: ordena por presentación; sin programación no hay cumplimiento');

const cfg={equipos:['Embolsadora'],motivos:['Mantenimiento','Otros']};
const errs=r=>H.validarFinalizar(r,cfg).join(' ');
ok(!H.validarFinalizar(Object.assign({},r1,{paradas:[{inicio:'09:10',equipo:'Embolsadora',motivo:'Mantenimiento',minutos:15}]}),cfg).length,'validarFinalizar: un reporte completo se puede finalizar');
ok(/al menos una producción/.test(errs(Object.assign({},r1,{produccion:[]}))),'validarFinalizar: pide producción');
ok(/número entero/.test(errs(Object.assign({},r1,{produccion:[{marca:'Glacial',presentacion:'3 kg',bolsas:2.5}]}))),'validarFinalizar: bolsas enteras');
ok(/elige el equipo/.test(errs(Object.assign({},r1,{paradas:[{motivo:'Mantenimiento',minutos:5}]}))),'validarFinalizar: con equipos configurados, la parada pide equipo');
ok(!/equipo/.test(H.validarFinalizar(Object.assign({},r1,{paradas:[{motivo:'Mantenimiento',minutos:5}]}),{equipos:[],motivos:['Mantenimiento']}).join(' ')),'validarFinalizar: sin equipos configurados no los exige');
ok(/describe la parada/.test(errs(Object.assign({},r1,{paradas:[{equipo:'Embolsadora',motivo:'Otros',minutos:5,nota:'x'}]}))),'validarFinalizar: «Otros» pide detalle');
ok(/turno/.test(errs(Object.assign({},r1,{turno:'TARDE'}))),'validarFinalizar: turno válido');

const d1=H.planGuardar({previo:null,r:r1,accion:'GUARDAR',usuario:'Ana',uid:'u1',en:100});
ok(d1.id==='2026-11-07_DÍA'&&d1.rev===1&&d1.estado==='EN_REGISTRO'&&d1.actualizadoUid==='u1'&&d1.historial.length===1,'planGuardar: crea el reporte (versión 1, autor, historial)');
ok(d1.produccion[1].bolsas===1700&&typeof d1.produccion[1].bolsas==='number'&&d1.mermas[1].cantidad===1.8,'planGuardar: guarda números');
const d2=H.planGuardar({previo:d1,r:r1,accion:'GUARDAR',usuario:'Ana',uid:'u1',en:200});
ok(d2.rev===2&&d2.historial.length===1&&d2.creadoEn===100,'planGuardar: el guardado automático sube la versión sin llenar el historial');
const d3=H.planGuardar({previo:d2,r:r1,accion:'FINALIZAR',usuario:'Ana',uid:'u1',en:300});
const d4=H.planGuardar({previo:d3,r:r1,accion:'REABRIR',usuario:'Admin',uid:'a',en:400,motivo:'Corregir bolsas'});
ok(d3.estado==='FINALIZADO'&&d4.estado==='EN_REGISTRO'&&d4.historial.map(h=>h.accion).join()==='GUARDAR,FINALIZAR,REABRIR'&&d4.historial[2].motivo==='Corregir bolsas','planGuardar: finalizar y reabrir quedan en el historial');

const vc=H.validarConfig({marcas:['Glacial',' Glacial','Tottus'],presentaciones:['1.5 kg','3 kg'],equipos:['Embolsadora',''],motivos:['Otros'],mermas:['Bolsas']});
ok(!vc.errores.length&&vc.config.marcas.join()==='Glacial,Tottus'&&vc.config.presentaciones.join()==='3 kg,1.5 kg'&&vc.config.equipos.join()==='Embolsadora','validarConfig: limpia y ordena');
ok(/debe tener los kg/.test(H.validarConfig({marcas:['G'],presentaciones:['bolsa'],motivos:['x']}).errores.join(' ')),'validarConfig: una presentación sin kg no se acepta');

const fx=H.filasExcel([r2,Object.assign({estado:'FINALIZADO',supervisor:'Ana'},r1)]);
ok(fx.length===4&&fx[0][1]==='DÍA'&&fx[0][6]===2600&&fx[0][7]===7800&&fx[0][9]==='Finalizado'&&fx[3][1]==='NOCHE','filasExcel: una fila por producción, en orden de fecha y turno');

/* ---------- conexiones ---------- */
const html=leer('index.html'),js=leer('js/hielo/97-hielo.js'),mg=leer('supabase/migraciones/glacial_46_reporte_hielo.sql');
ok(/js\/hielo\/97-hielo\.js\?v=\d{8}-\w+/.test(html),'index.html carga 97-hielo.js');
ok(/window\.goReporteHielo=abrir/.test(js)&&/onclick="goReporteHielo\(\)"/.test(html)&&!/Ver disponibilidad/.test(html),'la tarjeta «Reporte Hielo» abre la página');
ok(/Bolsas de \$\{esc\(p\)\}/.test(js)&&/p==='3 kg'\|\|p==='1\.5 kg'/.test(js),'Inicio: una tarjeta de bolsas por presentación (3 kg y 1.5 kg siempre)');
ok(/hieloReportes','hieloProgramacion','hieloParametros/.test(mg)&&/v->>'estado' = 'FINALIZADO' and not adm/.test(mg)&&/accion = 'delete'/.test(mg)&&/position\('glacial_46' in def\) = 0/.test(mg),'glacial_46: reportes (opera), finalizado solo Administrador, sin borrar, idempotente');

const mob=leer('css/mobile-glacial.css');
ok(/class="btn btn-topbar topbar-hielo"[\s\S]{0,80}onclick="goReporteHielo\(\)"/.test(html)&&/id="btn-ir-hielo"[\s\S]{0,120}goReporteHielo\(\)/.test(html),'Reporte Agua: botón «Ir a Reporte de Hielo» en el encabezado (PC) y en el menú lateral (teléfono)');
ok(/\.btn-topbar\.topbar-hielo\{display:none!important\}/.test(mob)&&/\.sidebar-hielo\{display:none\}/.test(mob),'en el teléfono el acceso va en el menú (el encabezado no tiene lugar)');
ok(/S\.desdeAgua=/.test(js)&&/Volver a Reporte Agua/.test(js),'desde Hielo se vuelve al Reporte Agua si se entró desde ahí');
/* ---------- guardado con la base lenta: dos guardados del MISMO usuario no chocan; otro usuario sí ---------- */
(async()=>{
  const vm=require('vm');
  function entorno(uid){
    const docs={};let ver=0;
    const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,RegExp,Promise,setTimeout,clearTimeout};vm.createContext(sb);sb.window=sb;
    sb.state={user:{rol:'Supervisor',nombre:'Ana',username:'ana',permisos:[]}};
    sb.firebase={auth:()=>({currentUser:{uid}})};
    sb.document={getElementById:()=>null,createElement:()=>({style:{}}),body:{appendChild(){}},activeElement:null};
    /* Como el servidor: lee, calcula y al confirmar revisa que el documento no cambió; si cambió, REINTENTA la función (Firestore). */
    sb.db={collection:c=>({doc:id=>({k:c+'/'+id}),where:()=>({onSnapshot:()=>()=>{}})}),
      runTransaction:async fn=>{for(let i=0;i<5;i++){const leido={};const w=[];
        const tx={get:async r=>{leido[r.k]=docs[r.k]?docs[r.k].__v:0;await new Promise(x=>setTimeout(x,5));return {exists:!!docs[r.k],data:()=>JSON.parse(JSON.stringify(docs[r.k]))};},set:(r,d)=>w.push([r,d])};
        const res=await fn(tx);
        if(Object.keys(leido).some(k=>(docs[k]?docs[k].__v:0)!==leido[k]))continue;      // otro guardó entre medio: reintento
        w.forEach(([r,d])=>{docs[r.k]=Object.assign(JSON.parse(JSON.stringify(d)),{__v:++ver});});return res;}
        throw new Error('aborted');}};
    vm.runInContext(leer('js/hielo/97-hielo.js'),sb);
    return {D:sb.glacialHieloDatos,docs,sb};
  }
  const base={fecha:'2026-11-11',turno:'DÍA',estado:'EN_REGISTRO',produccion:[{marca:'Glacial',presentacion:'3 kg',bolsas:100}],paradas:[],mermas:[],rev:0};
  const e1=entorno('u1');
  await e1.D.guardarReporte(Object.assign({},base),'GUARDAR');                         // versión 1
  const vista=Object.assign({},base,{rev:1});
  // dos guardados seguidos con la misma versión vista (el segundo sale antes de que llegue la respuesta del primero)
  const [a,b2]=await Promise.allSettled([e1.D.guardarReporte(Object.assign({},vista,{produccion:[{marca:'Glacial',presentacion:'3 kg',bolsas:200}]}),'GUARDAR'),
    e1.D.guardarReporte(Object.assign({},vista,{produccion:[{marca:'Glacial',presentacion:'3 kg',bolsas:300}]}),'GUARDAR')]);
  ok(a.status==='fulfilled'&&b2.status==='fulfilled','base lenta: dos guardados seguidos del mismo usuario no dan «otra persona guardó»');
  const final=e1.docs['hieloReportes/2026-11-11_DÍA'];
  ok(final.rev===3&&[200,300].includes(final.produccion[0].bolsas),'quedan las dos versiones en orden (versión 3)');
  // otro usuario guardó entre medio → sí es conflicto
  final.actualizadoUid='otro';
  let err=null;try{await e1.D.guardarReporte(Object.assign({},base,{rev:2}),'GUARDAR');}catch(x){err=x;}
  ok(err&&err.codigo==='CONFLICTO','si otra persona guardó entre medio, sigue el aviso de conflicto');
  const js2=leer('js/hielo/97-hielo.js');
  ok(/let guardandoAhora=null,repetirAuto=false/.test(js2)&&/if\(auto\)\{repetirAuto=true;return;\}/.test(js2),'los guardados automáticos van de a uno (el siguiente espera al anterior)');
  console.log(fallas?`\n${fallas} falla(s)`:'\nTodo correcto');
  process.exit(fallas?1:0);
})();
/* (el resultado final lo imprime la prueba asíncrona de arriba) */
