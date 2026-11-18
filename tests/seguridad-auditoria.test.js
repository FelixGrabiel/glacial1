/* Medidas de la auditoría de seguridad del 18/11/2026: cabeceras, contraseñas, correo de login privado, copias de documentos.
   node tests/seguridad-auditoria.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const v=JSON.parse(leer('vercel.json')),h={};((v.headers||[])[0]||{headers:[]}).headers.forEach(x=>h[x.key]=x.value);
ok(h['X-Frame-Options']==='DENY'&&/frame-ancestors 'none'/.test(h['Content-Security-Policy']||''),'cabeceras: anti-clickjacking');
ok(h['X-Content-Type-Options']==='nosniff'&&!!h['Referrer-Policy']&&!!h['Strict-Transport-Security'],'cabeceras: nosniff, referrer, HSTS');
ok(/camera=\(self\)/.test(h['Permissions-Policy']||''),'la cámara sigue permitida para el propio sitio (fotos de mantenimiento)');
ok(!/script-src|default-src/.test(h['Content-Security-Policy']||''),'la CSP no restringe scripts (la página usa scripts en línea)');
const a=leer('js/accesos/36-seguridad-auth.js');
ok(/fs_acceso_correo/.test(a)&&/async function correoDeAcceso/.test(a),'login: pide el correo de un solo usuario al servidor');
ok(/doc\('accesos'\)\.get\(\)/.test(a)&&/se prueba el método anterior/.test(a),'login: si la función no existe, cae al método anterior');
ok(!/__accesosPrevio/.test(a),'login: ya no se descarga el listado completo al abrir la página');
ok(/n\.length<10/.test(a)&&/mínimo 10 caracteres/.test(a),'cambio de clave: mínimo 10');
ok(/clave\.length < 10/.test(leer('supabase/functions/fs-cuentas/index.ts')),'fs-cuentas: mínimo 10');
const m62=leer('supabase/migraciones/glacial_62_acceso_correo_privado.sql');
ok(/fs_acceso_correo/.test(m62)&&/return \(d = ''accesos'' and aut\)/.test(m62)&&/cuenta <> 1/.test(m62),'migración 62: función + guardia + ancla única');
const m63=leer('supabase/migraciones/glacial_63_respaldo_documentos.sql');
ok(/enable row level security/.test(m63)&&/revoke all on function glacial_fs.respaldo_tomar/.test(m63)&&/interval '10 days'/.test(m63)&&/v_ult >= r.version/.test(m63),'migración 63: tabla privada, copia solo si cambió, retención 10 días');
console.log(fallas?'\n'+fallas+' fallas':'\nTodo bien');
