/* Genera supabase/functions/control-proceso-drive/nucleo.mjs y logo.mjs a partir del núcleo de la página (js/asistente/90-control-proceso-nucleo.js) y del logo,
   para que la copia a Drive use EXACTAMENTE las mismas reglas que el Excel (una sola fuente). Las funciones de Supabase solo pueden importar archivos de su carpeta.
   Uso: node scripts/generar-nucleo-drive.js          (reescribe los archivos)        node scripts/generar-nucleo-drive.js --verificar   (falla si están desactualizados) */
'use strict';
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..'),DEST=R+'/supabase/functions/control-proceso-drive';
const fuente=fs.readFileSync(R+'/js/asistente/90-control-proceso-nucleo.js','utf8').replace(/\r\n/g,'\n');
const logo=(/GLACIAL_LOGO_BASE64\s*=\s*"([^"]+)"/.exec(fs.readFileSync(R+'/js/nucleo/00-logo.js','utf8'))||[])[1];
if(!logo)throw new Error('No se encontró GLACIAL_LOGO_BASE64.');
const AVISO='// ARCHIVO GENERADO por scripts/generar-nucleo-drive.js: NO se edita a mano (cambia js/asistente/90-control-proceso-nucleo.js y vuelve a generar).\n';
const nucleo=AVISO+fuente+"\nexport default globalThis.glacialControlProcesoNucleo;\n";
const logoMjs=AVISO+'export const LOGO_BASE64 = "'+logo+'";\n';
const salidas={'nucleo.mjs':nucleo,'logo.mjs':logoMjs};
if(process.argv.includes('--verificar')){
  const malos=Object.entries(salidas).filter(([n,t])=>!fs.existsSync(DEST+'/'+n)||fs.readFileSync(DEST+'/'+n,'utf8').replace(/\r\n/g,'\n')!==t).map(([n])=>n);
  if(malos.length){console.error('Desactualizados: '+malos.join(', ')+'. Ejecuta: node scripts/generar-nucleo-drive.js');process.exit(1);}
  console.log('nucleo.mjs y logo.mjs al día');
}else{
  Object.entries(salidas).forEach(([n,t])=>fs.writeFileSync(DEST+'/'+n,t));
  console.log('Generados: '+Object.keys(salidas).join(', '));
}
