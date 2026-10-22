/* glacialAvancePreparar: el reporte generado SIN abrir la pestaña Avance (bot de WhatsApp) incluye las paradas que el supervisor guardó en
   sync/avancesTurno, y si no se puede leer falla en vez de dar «0 paradas». Datos inventados, aislados. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const FECHA='2026-10-22';
const ms=(h,m)=>new Date(2026,9,22,h,m||0).getTime();

function entorno(docDatos,falla){
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,setInterval:()=>0,Infinity,isFinite,Boolean};
  vm.createContext(sb);sb.window=sb;sb.addEventListener=()=>{};
  sb.document={createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){}}),getElementById:()=>null,querySelector:()=>null,body:{classList:{add(){},remove(){}}},addEventListener(){}};
  sb.state={user:{username:'bot',nombre:'Supervisor de turno (WhatsApp)',rol:'Supervisor',uid:'u1',permisos:['avanceProduccion'],fechaOperativa:FECHA,turnoOperativo:'DÍA'},currentTab:''};
  sb.ahora=ms(15,24);sb.tareoAhoraServidor=()=>sb.ahora;
  sb.loadProgramaciones=()=>[];sb.loadRecords=()=>[];sb.loadPaletas=()=>[];
  sb.normalizarCuadros=r=>r.cuadros||[];sb.normalizarMotivoParada=t=>String(t||'').toLowerCase().trim();sb.estandarMotivoParada=()=>0;
  sb.tienePermiso=p=>p==='avanceProduccion';
  sb.lecturas=0;sb.escuchas=0;
  sb.db={collection:()=>({doc:()=>({
    get:async()=>{sb.lecturas++;if(falla)throw new Error('sin conexión');return {exists:!!docDatos,data:()=>docDatos};},
    onSnapshot:()=>{sb.escuchas++;return()=>{};}
  })})};
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  vm.runInContext(leer('js/produccion/23b-tiempos-linea.js'),sb);
  vm.runInContext(leer('js/produccion/29-avance-produccion.js'),sb);
  return sb;
}

(async()=>{
  const paradas=[
    {id:'avp_1',fecha:FECHA,turno:'DÍA',linea:'PET1',descripcion:'Falla de máquina',minutos:20,tipo:'NO_PROGRAMADA'},
    {id:'avp_2',fecha:FECHA,turno:'DÍA',linea:'PET2',descripcion:'Charla',minutos:10,tipo:'PROGRAMADA'},
    {id:'avp_3',fecha:FECHA,turno:'DÍA',linea:'PET2',descripcion:'Borrada',minutos:5,tipo:'NO_PROGRAMADA',eliminada:true},
    {id:'avp_4',fecha:'2026-10-21',turno:'DÍA',linea:'PET1',descripcion:'De ayer',minutos:30,tipo:'NO_PROGRAMADA'}
  ];

  let sb=entorno({paradasOperativas:paradas,updatedAt:123});
  const antes=vm.runInContext('avParadasLinea("PET1","15:24","AVANCE",0).length',sb);
  ok(antes===0,'1 · sin preparar (como el bot hoy) la lista oficial de PET1 llega vacía');
  const r=await sb.glacialAvancePreparar();
  ok(r.ok&&r.fecha===FECHA&&r.turno==='DÍA','2 · fija la fecha y el turno operativos');
  ok(r.paradasOperativas===2,'3 · cuenta solo las paradas del turno (sin la eliminada ni la de otro día)');
  ok(sb.lecturas===1&&sb.escuchas===1,'4 · hace una lectura fresca y activa la escucha para los cambios siguientes');
  ok(vm.runInContext('avParadasLinea("PET1","15:24","AVANCE",0).map(p=>p.minutos)',sb).join()==='20','5 · PET1 ya tiene su parada de 20 min');
  ok(vm.runInContext('avParadasLinea("PET2","15:24","AVANCE",0).map(p=>p.minutos)',sb).join()==='10','6 · PET2 ya tiene su parada de 10 min (la eliminada no cuenta)');
  ok(vm.runInContext('avanceEstado.avancesUpdatedAt',sb)===123,'7 · guarda la versión leída');
  await sb.glacialAvancePreparar();
  ok(sb.escuchas===1&&sb.lecturas===2,'8 · una segunda llamada vuelve a leer pero no duplica la escucha');

  sb=entorno(null);
  const r2=await sb.glacialAvancePreparar();
  ok(r2.ok&&r2.paradasOperativas===0,'9 · si el documento no existe, devuelve 0 paradas sin error');

  sb=entorno({paradasOperativas:paradas},true);
  let error=null;try{await sb.glacialAvancePreparar();}catch(e){error=e;}
  ok(error&&/sin conexión/.test(error.message),'10 · si la lectura falla, lanza el error (no se genera un reporte con 0 paradas)');

  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})();
