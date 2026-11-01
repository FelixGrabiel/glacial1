/* Avance / Cierre: «Último registro» (hora del último ingreso de información) en la imagen y en el texto de WhatsApp.
   node tests/avance-ultimo-registro.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const s=fs.readFileSync(R+'/js/produccion/29-avance-produccion.js','utf8');
ok(/ultimoRegistroMs:avUltimoRegistroMs\(ahoraMs\)/.test(s),'el snapshot guarda la hora del último registro (congelada)');
ok(/Último registro: \$\{avTextoUltimoRegistro\(s\)\}`,480,154/.test(s),'la imagen muestra «Último registro» junto a la Hora');
ok(/\*Último registro: \$\{avTextoUltimoRegistro\(s\)\}\*/.test(s),'el texto de WhatsApp lo incluye');
ok(/function avUltimoRegistroMs[\s\S]{0,400}avPaletas\(\)\.forEach\(ver\)[\s\S]{0,80}avRegistros\(\)\.forEach\(ver\)/.test(s),'toma paletas y registros del turno');
console.log(fallas?'\n'+fallas+' falla(s)':'\ntodo correcto');
