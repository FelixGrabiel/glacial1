/* Almacén: corte repetido, selector sin duplicados y exportación del Stock (74-inventario-insumos-nucleo.js). */
'use strict';
const N=require('../js/asistente/74-inventario-insumos-nucleo.js');
const fs=require('fs');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const cortes=[{id:'c3',fechaCorte:'2026-10-20',archivo:'Stock.xlsx',articulos:237},{id:'c2',fechaCorte:'2026-10-20',archivo:'stock.xlsx ',articulos:237},
  {id:'c1',fechaCorte:'2026-10-13',archivo:'Stock.xlsx',articulos:230}];
ok(N.corteRepetido(cortes,'2026-10-20','STOCK.xlsx',237)?.id==='c3','detecta el mismo archivo, fecha y artículos (sin importar mayúsculas)');
ok(N.corteRepetido(cortes,'2026-10-21','Stock.xlsx',237)===null&&N.corteRepetido(cortes,'2026-10-20','Stock.xlsx',238)===null,'otra fecha u otro número de artículos no es repetido');
const u=N.cortesUnicos(cortes);
ok(u.length===2&&u[0].id==='c3'&&u[0].repetidos===1&&u[1].repetidos===0,'el selector deja un corte por grupo idéntico y cuenta los repetidos');
ok(cortes[0].repetidos===undefined,'no modifica la lista original');
const filas=[{codigo:'INS-0001',itemCode:'I1',nombre:'BOLSA "A"',categoria:'Insumos',marca:'X',enCorte:true,total:10.5,stockMinimo:5,puntoReorden:8,semaforo:'verde',w:[10.5,0]},
  {codigo:'INS-0002',itemCode:'',nombre:'TAPA',categoria:'Insumos',enCorte:false,total:0,stockMinimo:0,puntoReorden:0,semaforo:'gris',w:[0,0]}];
const csv=N.csvStock(filas,[{corto:'AP1'},{corto:'AP2'}]);const l=csv.split('\r\n');
ok(l[0]==='Código;Código SAP;Artículo;Categoría;Marca;Total SAP;Stock mínimo;Punto de reorden;Semáforo;AP1;AP2','encabezado con un almacén por columna');
ok(l[1]==='INS-0001;I1;"BOLSA ""A""";"Insumos";"X";10.5;5;8;OK;10.5;0'.replace(';OK;',';'+N.SEMAFORO_TXT.verde+';'),'fila con comillas protegidas y semáforo en texto');
ok(/Sin corte;;$/.test(l[2]),'artículo sin corte sale con celdas vacías, no con ceros');
const idx=fs.readFileSync(__dirname+'/../index.html','utf8');
ok(!/id="btn-almacen"/.test(idx),'el botón «Almacén · Próximamente» ya no está en el menú');
process.exit(fallas?1:0);
