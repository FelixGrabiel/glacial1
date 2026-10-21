/* Protección de las listas completas (js/nucleo/02-estado.js + supabase/migraciones/glacial_30): incidente del 21/10/2026 (102 reportes de líneas dados de baja
   porque un equipo guardó «uno solo» sin haber terminado de cargar la lista). node tests/guardado-listas-protegido.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const src=fs.readFileSync(R+'/js/nucleo/02-estado.js','utf8').replace(/\r\n/g,'\n');
const tomar=nombre=>{const i=src.indexOf('function '+nombre+'(');if(i<0)throw new Error('falta '+nombre);let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}};

function entorno(listo,fallar){
  const llamadas={sets:[],alertas:[],errores:0};
  const sb={console:{error(){},log(){}},window:{},Promise,Date,Array};vm.createContext(sb);
  sb.alert=m=>llamadas.alertas.push(m);
  sb._avisarErrorGuardado=()=>{llamadas.errores++;};
  sb.db={collection:()=>({doc:n=>({set:d=>{llamadas.sets.push({n,d});return fallar?Promise.reject(new Error('permission-denied')):Promise.resolve();}})})};
  vm.runInContext('var _recordsReady='+(listo?'true':'false')+';var _recordsCache=[{id:"viejo"}];var _tareosReady='+(listo?'true':'false')+';var _tareosCache=[];var _paletasReady='+(listo?'true':'false')+';var _paletasCache=[];'+
    tomar('_puedeGuardarLista')+'\n'+tomar('saveRecords')+'\n'+tomar('saveTareos')+'\n'+tomar('savePaletas'),sb);
  return {sb,llamadas};
}
(async()=>{
  /* Lista aún sin cargar: no se guarda ni se toca la copia local */
  let e=entorno(false);
  const r=await vm.runInContext('saveRecords([{id:"nuevo"}])',e.sb);
  ok(r===false&&e.llamadas.sets.length===0,'con los reportes SIN cargar, guardar un reporte no envía nada al servidor (era lo que borraba el historial)');
  ok(e.llamadas.alertas.length===1&&/No se guardó nada/.test(e.llamadas.alertas[0]),'avisa a la persona, con palabras claras');
  ok(vm.runInContext('_recordsCache.length===1&&_recordsCache[0].id==="viejo"',e.sb),'la copia local no se pisa');
  vm.runInContext('saveTareos([{id:1}])',e.sb);vm.runInContext('savePaletas([{id:1}])',e.sb);
  ok(e.llamadas.sets.length===0,'lo mismo para tareos y paletas');

  /* Lista cargada: se guarda como siempre */
  e=entorno(true);
  await vm.runInContext('saveRecords([{id:"a"},{id:"b"}])',e.sb);
  ok(e.llamadas.sets.length===1&&e.llamadas.sets[0].n==='records'&&e.llamadas.sets[0].d.items.length===2&&e.llamadas.alertas.length===0,'con los reportes cargados, guarda igual que antes');

  /* El servidor lo rechaza (baja masiva): la copia local vuelve a lo que había */
  e=entorno(true,true);
  await vm.runInContext('saveRecords([{id:"solo"}])',e.sb);
  ok(e.llamadas.errores===1&&vm.runInContext('_recordsCache.length===1&&_recordsCache[0].id==="viejo"',e.sb),'si el servidor rechaza el guardado, se avisa y la copia local no se queda con la lista recortada');

  /* Archivos */
  const sql=fs.readFileSync(R+'/supabase/migraciones/glacial_30_protege_lista_reportes.sql','utf8');
  ok(/d = 'records'/.test(sql)&&/items_antes/.test(sql)&&/> 5/.test(sql)&&/accion = 'delete' then return false/.test(sql),'glacial_30: nunca se borra el documento y se rechazan bajas de más de 5 reportes por guardado');
  console.log(fallas?`\n${fallas} fallas`:'\nTodo en orden');
})();
