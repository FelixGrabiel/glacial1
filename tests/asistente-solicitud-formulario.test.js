/* «Preparar solicitud a Almacén»: cantidades enteras para piezas, columna SAP omitida si ninguno tiene código, línea quitable. */
const fs=require('fs'),path=require('path');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const p72=fs.readFileSync(path.resolve(__dirname,'..','js/asistente/72-asistente-pantalla.js'),'utf8');
const ent=/const UNIDAD_ENTERA=(u=>[^\n]+);\n\s*const redondeoSol=(\(u,v\)=>[^\n]+);/.exec(p72);
ok(!!ent,'existen UNIDAD_ENTERA y redondeoSol');
const U=eval(ent[1]),R=(()=>{const UNIDAD_ENTERA=U;return eval(ent[2]);})();
ok(R('plancha',1313.33)===1314&&R('caja',7)===7&&R('caja',7.0000000001)===7&&R('UND',67840)===67840,'cajas, planchas y UND se piden enteras');
ok(R('kg',363.271)===363.28&&R('kg',68.97)===68.97,'kg conserva 2 decimales hacia arriba');
ok(/apSolQuitar/.test(p72)&&/AP\.solQuit=\[\];\n/.test(p72)&&/aria-label="Quitar/.test(p72),'cada línea se puede quitar y se limpia al crear la solicitud');
ok(/const sinSap=/.test(p72)&&/aún no tienen código SAP/.test(p72),'sin ningún código SAP: columna omitida y un solo aviso');
ok(/redondeoSol\(x\.insumo\.unidad,x\.neto\)/.test(p72),'«Solicitar todos los faltantes» usa el mismo redondeo');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
