const assert=require('assert');
global.window={};global.document={};
try{require('../js/mantenimiento/37d-equipos-maestro.js');}catch(e){}
const E=window.glacialEquiposMaestro;
assert(E&&E.capacidadHora,'capacidadHora exportada');
assert.strictEqual(E.capacidadHora({datos:{cicloSeg:12,porCiclo:4}}),1200);
assert.strictEqual(E.capacidadHora({datos:{cicloSeg:0,porCiclo:4}}),0);
assert.strictEqual(E.capacidadHora({}),0);
console.log('ok equipos-ciclo');
process.exit(0);
