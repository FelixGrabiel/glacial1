/* Salud del sistema (glacial_40): revisión diaria en el servidor y aviso solo para el Administrador en la campana. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const s46=leer('js/produccion/46-proyeccion-avisos.js'),mig=leer('supabase/migraciones/glacial_40_salud_sistema.sql'),html=leer('index.html');

ok(/\{tipos:TODOS\.concat\(\['sistema'\]\)/.test(s46)&&!/JEFATURA\.includes\(rol\)\)return \{tipos:TODOS\.slice\(\)\.concat/.test(s46),'el aviso «sistema» es solo del Administrador (Jefatura y supervisores no lo ven)');
ok(/db\.collection\('saludSistema'\)\.doc\('actual'\)\.onSnapshot/.test(s46)&&/String\(state\.user\.rol\|\|''\)\.trim\(\)!=='Administrador'/.test(s46),'solo el Administrador abre la escucha del documento de salud');
ok(/x\.tipo==='sistema'\)return;/.test(s46),'tocar el aviso no abre pantallas (se resuelve en el servidor)');
/* avisosSalud con la función real */
const cuerpo=s46.slice(s46.indexOf('const HORAS_SIN_REVISION'),s46.indexOf('function detenerConfig'));
const sb={};vm.createContext(sb);
vm.runInContext(cuerpo.replace(/let salud=null,desubSalud=null;/,'').replace(/function escucharSalud\(\)\{[\s\S]*?\n  \}\n/,'')+';this.f=avisosSalud;',sb);
const ahora=Date.UTC(2026,10,1,15,0);
const doc={revisadoEn:ahora-3600000,dbMb:90,problemas:[{nivel:'roja',texto:'Base casi llena'},{nivel:'ambar',texto:'Tareas fallidas'}]};
const l=sb.f(doc,ahora);
ok(l.length===2&&l[0].severidad==='roja'&&l[1].severidad==='ambar'&&l[0].id!==l[1].id,'un aviso por problema, con su severidad');
ok(sb.f({revisadoEn:ahora-3600000,problemas:[]},ahora).length===0,'sin problemas no hay avisos');
const viejo=sb.f({revisadoEn:ahora-40*3600000,problemas:[]},ahora);
ok(viejo.length===1&&/no se ha ejecutado/.test(viejo[0].texto),'si la revisión diaria deja de correr (más de 36 h), avisa de eso');
ok(sb.f(null,ahora).length===0&&sb.f(undefined,ahora).length===0&&sb.f({problemas:'x'},ahora).length===0,'sin documento (migración sin aplicar) no pasa nada');
ok(/create or replace function public\.salud_revisar/.test(mig)&&/security definer set search_path = ''/.test(mig)&&/revoke all on function public\.salud_revisar\(\) from public, anon, authenticated/.test(mig),'la función del servidor es SECURITY DEFINER y nadie puede llamarla desde la página');
ok(/cron\.schedule\('glacial-salud-diaria', '30 12 \* \* \*'/.test(mig)&&/saludSistema' then return coalesce\(\(k->>'admin'\)::boolean, false\)/.test(mig),'se programa cada día a las 07:30 de Lima y la lectura es solo del Administrador');
ok(!/insert into public\.fs_items|delete from|truncate|drop table/i.test(mig),'la migración no toca datos de la planta ni borra nada');
ok(/46-proyeccion-avisos\.js\?v=20261101-sa1/.test(html),'index.html: versión subida');
const ps=leer('docs/migracion/respaldo-semanal.ps1');
ok(/DATABASE_URL/.test(ps)&&!/postgresql:\/\//.test(ps)&&!/password/i.test(ps.replace(/Falta la variable[^']*/,'')),'el respaldo semanal no lleva la clave: la toma de la variable de usuario DATABASE_URL');
ok(/Select-Object -Skip \$Conservar/.test(ps)&&/MANIFIESTO\.json/.test(ps)&&/exit 1/.test(ps),'conserva las últimas copias, verifica el manifiesto y termina con error si falla');
console.log(fallas?'\n'+fallas+' fallas':'\nSalud del sistema correcta');process.exit(fallas?1:0);
