/* Calculadora de conversión de Evidencias (13/11/2026): kg ↔ UND con el peso de 1 unidad. Solo calcula. node tests/evidencias-calculadora.test.js */
'use strict';
const fs=require('fs'),R=require('path').resolve(__dirname,'..');
const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)process.exitCode=1;};
const N=require('../js/asistente/84-evidencias-insumos-nucleo.js');

ok(N.gramajeDeTexto('42.7gr. Cr.1881')===42.7&&N.gramajeDeTexto('21,7 g')===21.7&&N.gramajeDeTexto('Preforma 90 gramos')===90,'gramaje del Producto: «42.7gr.», «21,7 g», «90 gramos»');
ok(N.gramajeDeTexto('Y35')===null&&N.gramajeDeTexto('')===null&&N.gramajeDeTexto(null)===null&&N.gramajeDeTexto('BOLSA 3KG')===null,'sin gramaje (o en kg) → null');
ok(N.convertir({gramos:42.7,kg:346.59}).und===8117,'346.59 kg de preformas de 42.7 g → 8117 UND (misma fórmula del Registro: kg × 1000 ÷ g, redondeado)');
ok(N.convertir({gramos:42.7,und:8141}).kg===347.621,'8141 UND de 42.7 g → 347.621 kg');
ok(N.convertir({gramos:42.7,kg:'346,59'}).und===8117,'acepta coma decimal');
ok(N.convertir({gramos:0,kg:10}).und===null&&N.convertir({gramos:5,kg:''}).und===null&&N.convertir({gramos:5,kg:-1,und:''}).und===null,'sin peso de unidad o sin cantidad válida no calcula');
ok(N.diferenciaPct(8117,8141)===-0.3&&N.diferenciaPct(100,0)===null,'diferencia con la etiqueta en % (sin cantidad en la etiqueta no compara)');
const P=fs.readFileSync(R+'/js/asistente/86-evidencias-insumos-pantalla.js','utf8');
ok(/calculadoraHtml\(d\)/.test(P)&&/Solo calcula: no cambia los datos de la evidencia/.test(P)&&!/ieCalc[^\n]*borrador\(\)/.test(P),'la pantalla muestra la calculadora y no escribe en el borrador de la evidencia');
/* Conversión escrita a mano (13/11/2026). */
ok(/✍ Escribir a mano/.test(P)&&/value="m"/.test(P)&&/manual=st\.modo==='manual'\|\|!ops\.length/.test(P),'si no hay conversión guardada (o se elige «Escribir a mano») se escribe la conversión a mano');
ok(/Peso de 1 unidad \(g\)/.test(P)&&/Unidades en 1 kg/.test(P)&&/m\.modo==='undkg'\?1000\/n:m\.modo==='g'\?n:n\*1000/.test(P),'a mano: kilos de 1 UND (por defecto), gramos de 1 UND o UND en 1 kg (1000 ÷ UND por kg = gramos)');
ok(/glacial-calc-manual/.test(P)&&/try\{localStorage\.setItem/.test(P)&&/catch\(_\)\{\/\* sin almacenamiento/.test(P),'la conversión a mano se recuerda por categoría (sin romper si el navegador no guarda)');
ok(/\$\(id\)\.disabled=!o\.gramos/.test(P),'kilos y unidades se habilitan apenas hay conversión');

/* 17/11/2026: en kilos por defecto, sin «Línea» cuando no aplica, y «Confirmar» que guarda. */
ok(/<option value="kg" \$\{o\.man\.modo!=='undkg'&&o\.man\.modo!=='g'\?'selected':''\}>Peso de 1 unidad \(kg\)<\/option>/.test(P)&&/mem\.modo\|\|'kg'/.test(P)&&/Kilos de 1 UND/.test(P),'a mano se escribe en KILOS por defecto (Peso de 1 unidad (kg)); gramos y «UND en 1 kg» siguen como opciones');
ok(/glacial-calc-manual-v2/.test(P),'la memoria anterior en gramos se descarta (clave v2) para que el kilo sea el valor por defecto');
ok(/hayGuardadas=lineas\.some\(l=>opsDe\(l\)\.length\)/.test(P)&&/fuente=\(!o\.hayGuardadas\?'':/.test(P)&&/const conv=!o\.hayGuardadas\?'':/.test(P),'si ninguna línea tiene conversión guardada de esa categoría, no se muestra «Línea» ni el aviso: solo la conversión a mano');
ok(/if\(b&&b\[campo\]!==undefined\)\{[^}]*guardarEdiciones\(d\.id,d\.rev,\{cambios:\{\[campo\]:b\[campo\]\}\}\)/s.test(P)&&!/Guarda primero el valor que escribiste/.test(P),'«Confirmar» con un valor escrito lo guarda y lo confirma en un solo paso (ya no pide «guarda primero»)');
const L=fs.readFileSync(R+'/js/asistente/89-trazabilidad-lotes-pantalla.js','utf8');
ok(/Nada se confirma solo/.test(L)&&/únicamente cuando tú pulsas/.test(L)&&/desmarca/.test(L),'«Otras fotos del mismo lote»: aclara que solo se aprueban cuando el usuario confirma y que se pueden desmarcar');
/* 21/11/2026: más fácil de usar. */
ok(N.valorDeEntrada('cantidad_unidad','24682').error&&/no un número/.test(N.valorDeEntrada('cantidad_unidad','24682').error)&&N.valorDeEntrada('cantidad_unidad','UND').valor==='UND','«Unidad de la cantidad» no acepta un número (va la unidad; el número va en «Cantidad»)');
ok(N.opcionesUnidad('').join()===N.UNIDADES_CANTIDAD.join()&&N.opcionesUnidad('rollos').join()===N.UNIDADES_CANTIDAD.join()&&N.opcionesUnidad('SOBRES').slice(-1)[0]==='SOBRES'&&N.UNIDADES_CANTIDAD.includes('UND')&&N.UNIDADES_CANTIDAD.includes('MILLARES'),'la unidad se elige de una lista (UND, MILLARES, KG…); si la etiqueta trae otra se conserva para corregirla');
ok(/<select class="ie-in" data-campo="\$\{def\.campo\}" onchange="ieCampo/.test(P)&&/Solo el número, sin la unidad/.test(P)&&/no un número/.test(P),'en la pantalla la unidad es una lista y cada campo trae su ayuda corta');
ok(/Calculadora: kilos ↔ unidades/.test(P)&&/Escribe los <b>kilos<\/b>/.test(P)&&/id="ie-calc-res"/.test(P)&&/ie-calc-conv/.test(P)&&/ieCalc\('cambiar',1\)/.test(P),'calculadora en lenguaje simple: guía de una línea, resultado «kg ≈ UND» y conversión resumida con «Cambiar»');
ok(/Coincide con la etiqueta/.test(P)&&/La etiqueta dice <b>/.test(P)&&/MILLAR\|MILLARES/.test(P),'compara con la etiqueta en frases claras y entiende «millares»');
ok(/window\.ieUsarCalc=/.test(P)&&/Poner \$\{esc\(fmtN\(Math\.round\(undN\),0\)\)\} UND en «Cantidad»/.test(P)&&/b\.cantidad_unidad='UND'/.test(P),'botón «Poner N UND en Cantidad»: pasa el resultado al borrador sin guardar');
ok(/aún no está en el banco de proveedores; se guarda igual/.test(L)&&/Estas fotos tienen el mismo lote del proveedor/.test(L)&&/el número se pone solo/.test(L),'ventana «Confirmar y crear lote»: textos más claros');
const V=fs.readFileSync(R+'/js/asistente/98-validar-rapido.js','utf8');
ok(/def\.campo==='cantidad_unidad'\?`<select/.test(V),'la validación rápida también usa la lista de unidades');
process.exit(process.exitCode||0);
