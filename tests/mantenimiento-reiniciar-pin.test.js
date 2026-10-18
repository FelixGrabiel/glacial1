/* Reinicio de PIN de técnicos: lo hace el Supervisor de Mantenimiento / Administrador desde «Identificación de técnicos». */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let f=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){f++;process.exitCode=1;}};
const s=fs.readFileSync(R+'/js/mantenimiento/37b-mantenimiento-identificacion.js','utf8'),fn=fs.readFileSync(R+'/_archivo/firebase/firebase-functions/mantenimiento-pin.js','utf8');
ok(/async reiniciar\(w\)[\s\S]*delete nuevo\.hash;delete nuevo\.salt;/.test(s),'modo local: el reinicio borra hash y sal (el técnico vuelve a crear su PIN)');
ok(/bloqueadoHasta:0/.test(s.slice(s.indexOf('async reiniciar'),s.indexOf('async verificar'))),'el reinicio también desbloquea');
ok(/reiniciar:w=>llamar\('mantReiniciarPin'/.test(s)&&/exports\.mantReiniciarPin/.test(fn),'modo functions: función mantReiniciarPin');
ok(/mantReiniciarPin[\s\S]*Administrador[\s\S]*supervisorMtto/.test(fn),'el servidor solo permite Administrador o Supervisor de Mantenimiento');
ok(/data-mant-reiniciar/.test(s)&&/if\(!w\|\|!puedeConfigurarIdent\(\)\)return;/.test(s),'botón por técnico, solo si puedeConfigurarIdent (Supervisor de Mtto / Administrador)');
console.log(f?f+' fallas':'todo correcto');
