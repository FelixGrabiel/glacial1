/* Hielo · ítems de merma por producto (27/11/2026): Cubos = Bolsas, Bobinas, Precintos, Bolsones · Premium = Bolsas, Bolsones · Vasos = Vasos, Tapas, Stickers. */
'use strict';
const N = require('../js/hielo/97-hielo.js');
let fallas = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ FALLA ') + m); if (!c) fallas++; };
ok(N.PRODUCTOS.CUBOS.mermas.join() === 'Bolsas,Bobinas,Precintos,Bolsones' && N.DEFECTO.mermas.join() === 'Bolsas,Bobinas,Precintos,Bolsones', 'Cubos: Bolsas, Bobinas, Precintos y Bolsones');
ok(N.PRODUCTOS.PREMIUM.mermas.join() === 'Bolsas,Bolsones', 'Premium: solo Bolsas y Bolsones');
ok(N.PRODUCTOS.VASOS.mermas.join() === 'Vasos,Tapas,Stickers', 'Vasos: solo Vasos, Tapas y Stickers');
const vc = N.validarConfig({ marcas: ['Glacial'], presentaciones: ['3 kg'], motivos: ['Otros'], mermas: ['Bolsas', 'Bobinas'] }, 'CUBOS');
ok(!vc.errores.length && vc.config.mermasCubos.join() === 'Bolsas,Bobinas' && !('mermas' in vc.config), 'Configuración de Cubos: se guarda en «mermasCubos» (la lista vieja común «mermas» ya no se usa)');
const vv = N.validarConfig({ marcas: ['OXXO'], presentaciones: ['Vaso'], motivos: ['Otros'], mermas: ['Vasos', 'Tapas'] }, 'VASOS');
ok(!vv.errores.length && vv.producto.mermas.join() === 'Vasos,Tapas' && !('mermas' in vv.config), 'Configuración de Vasos: sus mermas van en su producto, no en las listas compartidas');
ok(N.validarConfig({ marcas: ['G'], presentaciones: ['2 kg'], motivos: ['x'], mermas: [] }, 'PREMIUM').producto.mermas.join() === 'Bolsas,Bolsones' && N.validarConfig({ marcas: ['G'], presentaciones: ['3 kg'], motivos: ['x'] }, 'CUBOS').config.mermasCubos.join() === 'Bolsas,Bobinas,Precintos,Bolsones', 'lista vacía = la de fábrica del producto');
console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
