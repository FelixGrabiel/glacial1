/* glacial_67: fs_consulta devuelve las listas partidas (fs_items) — comprobación de la propia migración (el efecto real se probó en PRUEBAS con un usuario autenticado). */
'use strict';
const fs=require('fs');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const s=fs.readFileSync(__dirname+'/../supabase/migraciones/glacial_67_consulta_con_listas.sql','utf8');
ok(/security definer/i.test(s)&&/glacial_fs\.puede_leer\(glacial_fs\.ctx\(\), p_c, p_d, p_datos\)/.test(s),'la función auxiliar comprueba el permiso de lectura del documento antes de devolver sus listas');
ok(/revoke all on function glacial_fs\.listas_de/i.test(s)&&/grant execute on function glacial_fs\.listas_de\(text, text, jsonb\) to authenticated/i.test(s),'solo usuarios con sesión pueden ejecutarla (no queda abierta a todos)');
ok(/eliminado_en is null/.test(s)&&/order by i\.pos, i\.id/.test(s),'solo filas vivas y en su orden (igual que fs_leer)');
ok(/if cuenta <> 1 then raise exception/.test(s)&&/position\('glacial_fs\.listas_de' in def\) = 0/.test(s),'cambio por ancla única y repetible (no se aplica dos veces)');
ok(/s\.datos \|\| glacial_fs\.listas_de\(\$1, s\.id, s\.datos\)/.test(s),'fs_consulta mezcla las listas sobre los datos del documento');
process.exit(fallas?1:0);
