/* Rotación de maquinistas con turno INTERMEDIO: el Intermedio se agrupa con el Día en la consulta del Tareo de Producción. */
const fs = require('fs'), vm = require('vm');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
const src = fs.readFileSync(__dirname + '/../js/mantenimiento/33-rotacion-maquinistas.js', 'utf8');
const sem = [{ fechaInicio: '2026-10-19', personal: [
  { trabajadorId: '1', nombre: 'Ana', linea: 'PET1', dias: ['DÍA', 'DÍA', 'INTERMEDIO', 'NOCHE', 'DESCANSO', 'DÍA', 'DÍA'] },
  { trabajadorId: '2', nombre: 'Beto', linea: 'PET2', dias: ['INTERMEDIO', 'INTERMEDIO', 'INTERMEDIO', 'DESCANSO', 'NOCHE', 'NOCHE', 'NOCHE'] }] }];
const win = {};
const ctx = vm.createContext({ window: win, document: { getElementById: () => null, head: { appendChild() {} } }, console, tareoNormalizarTexto: t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(),
  escaparHTML: String, loadRotacionMaquinistas: () => sem });
vm.runInContext(src, ctx);
const f = win.rotacionMaquinistasDia;
const nombres = l => l.map(p => p.nombre).join();
const lun = f('2026-10-19', 'Día');          // lunes: Ana DÍA, Beto INTERMEDIO
ok(nombres(lun.trabajan) === 'Ana,Beto' && nombres(lun.intermedio) === 'Beto' && lun.descansan.length === 0, 'el Intermedio trabaja en el Día y queda marcado como intermedio');
ok(f('2026-10-19', 'Noche').trabajan.length === 0, 'el Intermedio no entra en la Noche');
const mie = f('2026-10-21', 'Día');          // miércoles: Ana INTERMEDIO, Beto INTERMEDIO
ok(nombres(mie.trabajan) === 'Ana,Beto' && mie.intermedio.length === 2, 'miércoles: los dos son Intermedio y cuentan con el Día');
const jue = f('2026-10-22', 'Noche');        // jueves: Ana NOCHE, Beto DESCANSO
ok(nombres(jue.trabajan) === 'Ana' && nombres(jue.descansan) === 'Beto', 'Noche y Descanso siguen igual');
ok(f('2026-10-26', 'Día').tieneRotacion === false, 'sin rotación guardada: tieneRotacion = false');
ok(/VALORES=\['DÍA','INTERMEDIO','NOCHE','DESCANSO'\]/.test(src) && /'INTERMEDIO':'intermedio'/.test(src), 'el ciclo de la celda incluye INTERMEDIO y tiene su color');
console.log(fallas ? fallas + ' fallas' : 'todo correcto'); process.exit(fallas ? 1 : 0);
