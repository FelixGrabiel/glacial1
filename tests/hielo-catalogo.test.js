/* Hielo · catálogo de productos de la planta (js/nucleo/01-config.js › PRODUCTOS_HIELO) y filtro de marcas por presentación. */
'use strict';
const fs=require('fs'),vm=require('vm');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../js/nucleo/01-config.js','utf8').match(/const PRODUCTOS_HIELO[\s\S]*?const PRESENTACIONES_HIELO = \[[\s\S]*?\];/)[0]+';this.P=PRODUCTOS_HIELO;this.M=MARCAS_HIELO;this.R=PRESENTACIONES_HIELO;',ctx);
ok(ctx.P.length===14&&ctx.P.filter(x=>x[1]==='3 kg').length===9&&ctx.P.filter(x=>x[1]==='1.5 kg').length===5,'14 productos: 9 de 3 kg y 5 de 1.5 kg');
ok(ctx.R.join()==='1.5 kg,3 kg'&&ctx.M.includes('Rappi')&&ctx.M.includes('Precio Uno')&&new Set(ctx.M).size===ctx.M.length,'presentaciones 1.5 y 3 kg; marcas sin repetir (Glacial y Listo salen en ambas)');
global.PRODUCTOS_HIELO=ctx.P;
const H=require('../js/hielo/97-hielo.js');
const cfg={marcas:ctx.M.slice()};
ok(H.marcasDe(cfg,'1.5 kg').join()==='Precio Uno,Glacial,Scala,Listo,Austral'||H.marcasDe(cfg,'1.5 kg').slice().sort().join()==='Austral,Glacial,Listo,Precio Uno,Scala','1.5 kg: solo sus 5 marcas');
ok(H.marcasDe(cfg,'3 kg').includes('Rappi')&&!H.marcasDe(cfg,'3 kg').includes('Scala'),'3 kg: sus 9 marcas, sin Scala');
ok(H.marcasDe(cfg,'5 kg').length===cfg.marcas.length,'una presentación fuera del catálogo muestra todas las marcas');
process.exit(fallas?1:0);
