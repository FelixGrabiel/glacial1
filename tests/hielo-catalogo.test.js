/* Hielo · catálogo de productos de la planta (js/nucleo/01-config.js › PRODUCTOS_HIELO) y filtro de marcas por presentación. */
'use strict';
const fs=require('fs'),vm=require('vm');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../js/nucleo/01-config.js','utf8').match(/const PRODUCTOS_HIELO[\s\S]*?const PRESENTACIONES_HIELO = \[[\s\S]*?\];/)[0]+';this.P=PRODUCTOS_HIELO;this.M=MARCAS_HIELO;this.R=PRESENTACIONES_HIELO;',ctx);
ok(ctx.P.length===16&&ctx.P.filter(x=>x[1]==='3 kg').length===10&&ctx.P.filter(x=>x[1]==='1.5 kg').length===6&&ctx.M.includes('San Fernando'),'16 productos: 10 de 3 kg y 6 de 1.5 kg (incluye San Fernando en ambas)');
ok(ctx.R.join()==='1.5 kg,3 kg'&&ctx.M.includes('Rappi')&&ctx.M.includes('Precio Uno')&&new Set(ctx.M).size===ctx.M.length,'presentaciones 1.5 y 3 kg; marcas sin repetir (Glacial y Listo salen en ambas)');
global.PRODUCTOS_HIELO=ctx.P;
const H=require('../js/hielo/97-hielo.js');
const cfg={marcas:ctx.M.slice()};
ok(H.marcasDe(cfg,'1.5 kg').slice().sort().join()==='Austral,Glacial,Listo,Precio Uno,San Fernando,Scala','1.5 kg: solo sus 6 marcas');
ok(H.marcasDe(cfg,'3 kg').includes('Rappi')&&H.marcasDe(cfg,'3 kg').includes('San Fernando')&&!H.marcasDe(cfg,'3 kg').includes('Scala'),'3 kg: sus 10 marcas, sin Scala');
ok(H.marcasDe(cfg,'5 kg').length===cfg.marcas.length,'una presentación fuera del catálogo muestra todas las marcas');
process.exit(fallas?1:0);
