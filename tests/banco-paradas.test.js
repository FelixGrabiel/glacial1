/* Banco de paradas (Mantenimiento): lista las paradas por clasificar y las ya reclasificadas, solo lectura; permiso «ver_banco_paradas» en el panel de usuarios y regla del servidor (glacial_37). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const html=leer('index.html'),src=leer('js/mantenimiento/70-banco-paradas.js'),est=leer('js/nucleo/02-estado.js'),b67=leer('js/mantenimiento/67b-intervenciones-datos.js'),hub=leer('js/mantenimiento/68-mantenimiento-inicio.js');
const mig=leer('supabase/migraciones/glacial_37_permiso_banco_paradas.sql');

ok(/key:'ver_banco_paradas',area:'mantenimiento'/.test(est),'el panel de gestionar usuarios ofrece el permiso «ver_banco_paradas» (área Mantenimiento)');
ok(/tiene\('ver_banco_paradas'\)/.test(b67),'quien tiene ese permiso entra al panel de Mantenimiento (lectura)');
ok(/ver_banco_paradas/.test(mig)&&/ver_bitacora_mantenimiento/.test(mig)&&/NO APLICADA en PRODUCCIÓN/.test(mig),'migración glacial_37: lectura para el permiso nuevo, avisa que falta aplicarla en producción');
ok(html.indexOf('70-banco-paradas.js')>html.indexOf('67h-reclasificacion-pantalla.js')&&/70-banco-paradas\.js\?v=20261030-bp1/.test(html),'index.html carga el banco después de 67h');
ok(/Banco de paradas/.test(hub)&&/tab:'banco-paradas'/.test(hub),'el inicio de Mantenimiento tiene la tarjeta «Banco de paradas»');
ok(!/\.set\(|\.update\(|\.add\(|runTransaction|reclasificar\(/.test(src.replace(/R\.puedeReclasificar/g,'')),'el banco no escribe nada (solo lectura)');
ok(!/alert\(|confirm\(|prompt\(/.test(src)&&!/toISOString\(\)\.slice\(0,10\)/.test(src),'sin alert/confirm/prompt ni fechas en UTC');

/* ---------- datos: pendientes + reclasificadas, filtros ---------- */
const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setTimeout,clearTimeout,URL,Blob};vm.createContext(sb);sb.window=sb;sb.globalThis=sb;
const pestanas=[];
const docs=new Map();
sb.document={addEventListener(){},getElementById:()=>null,querySelector:()=>null,body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
sb.glacialMantPestanas=pestanas;sb.tareoAhoraServidor=()=>Date.UTC(2026,9,30,15);sb.LINES=[{key:'PET1',name:'PET 1'},{key:'PET2',name:'PET 2'}];
let puedeVer=true;
sb.glacialReclasificaciones={esCandidata:it=>!it.causa||it.causa==='Otro'||!it.motivoCat,de:id=>docs.get(id)||null,asegurarRango(){},estado:()=>({}),alCambiar(){},puedeReclasificar:()=>false,puedeVer:()=>puedeVer};
const base={clasif:'NO_PROGRAMADA',origen:'AVANCE',causa:'Otro',motivoCat:'',minutos:10};
sb.glacialAnalisisParadas={listarUnidades:()=>({unidades:[
  {linea:'PET1',fecha:'2026-10-20',turno:'DÍA',npItems:[Object.assign({},base,{id:'a',minutos:30,motivo:'parada por env'}),Object.assign({},base,{id:'b',minutos:20,motivo:'escasez de agua'}),
    Object.assign({},base,{id:'c',minutos:45,motivo:'ok',causa:'Falla de máquina',motivoCat:'Falla de máquina'}),
    Object.assign({},base,{id:'d',minutos:25,motivo:'calibración env',causa:'Ajuste o calibración',motivoCat:'',reclasificada:true,original:{causa:'Otro',motivoCat:'',motivo:''}})]},
  {linea:'PET2',fecha:'2026-10-22',turno:'NOCHE',npItems:[Object.assign({},base,{id:'e',minutos:15,motivo:'sin luz',causa:''})]}]})};
docs.set('d',{actualizadaPor:'Carla',actualizadaEn:1700000000000});
vm.runInContext(src,sb);
const B=sb.glacialBancoParadas;
const d=B.calcular();
ok(d.filas.length===4&&d.pendN===3&&d.pendMin===65&&d.reclN===1&&d.reclMin===25,'el banco trae las pendientes (3 · 65 min) y la ya reclasificada (1 · 25 min); la que ya tiene motivo de catálogo no entra');
ok(d.filas[0].fecha==='2026-10-22'&&d.filas.find(f=>f.id==='d').por==='Carla'&&d.filas.find(f=>f.id==='d').estado==='RECLASIFICADA','más recientes primero; la reclasificada conserva quién la reclasificó');
B.UI.estado='pendientes';ok(B.visibles(d).length===3,'filtro «Pendientes»');
B.UI.estado='reclasificadas';ok(B.visibles(d).length===1&&B.visibles(d)[0].id==='d','filtro «Reclasificadas»');
B.UI.estado='todas';B.UI.texto='AGUA';ok(B.visibles(d).length===1&&B.visibles(d)[0].id==='b','la búsqueda ignora mayúsculas y tildes');
const p=pestanas.find(t=>t.clave==='banco-paradas');
ok(!!p&&p.visible()===true,'la pestaña existe y es visible para quien puede ver');
puedeVer=false;ok(p.visible()===false,'sin permiso la pestaña no aparece');

console.log(fallas?'\n'+fallas+' fallas':'\nBanco de paradas correcto');
process.exit(fallas?1:0);
