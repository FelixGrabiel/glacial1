/* Supervisor en turno (js/personal/45-supervisor-en-turno.js): núcleo puro — área por supervisor, solo nombres, una entrada por persona. */
'use strict';
const fs = require('fs');
const S = require('../js/personal/45-supervisor-en-turno.js');
let fallas = 0; const ok = (c, t) => { console.log((c ? '✔ ' : '✘ FALLA ') + t); if (!c) fallas++; };
ok(Object.keys(S.AREAS).join() === 'AGUA,HIELO' && /PET1, PET2, B7L, Cajas 20L y B20L/.test(S.AREAS.AGUA.detalle) && /cubos, premium y vasos/.test(S.AREAS.HIELO.detalle), 'solo dos áreas: Agua (PET1, PET2, B7L, Cajas 20L, B20L) y Hielo (cubos, premium y vasos)');
ok(S.clave('2026-11-21', 'DÍA') === 'supervisores_2026-11-21_DIA' && S.clave('2026-11-21', 'INTERMEDIO') === 'supervisores_2026-11-21_DIA' && S.clave('2026-11-21', 'NOCHE') === 'supervisores_2026-11-21_NOCHE', 'un documento por fecha y bloque (Intermedio comparte con Día)');
let d = S.aplicar(null, { uid: 'u1', nombre: 'Ana Pérez', area: 'HIELO', turno: 'DÍA', desdeMs: 10 });
d = S.aplicar(d, { uid: 'u2', nombre: 'Luis Rojas', area: 'AGUA', turno: 'DÍA', desdeMs: 5 });
ok(JSON.stringify(S.porArea(d)) === JSON.stringify({ AGUA: ['Luis Rojas'], HIELO: ['Ana Pérez'] }), 'cada nombre aparece en su área');
d = S.aplicar(d, { uid: 'u1', nombre: 'Ana Pérez', area: 'AGUA', turno: 'DÍA', desdeMs: 20 });
ok(JSON.stringify(S.porArea(d)) === JSON.stringify({ AGUA: ['Luis Rojas', 'Ana Pérez'], HIELO: [] }) && Object.keys(d.supervisores).length === 2, 'quien cambia de área reemplaza su entrada (no se duplica) y los nombres salen por hora de ingreso');
ok(JSON.stringify(S.porArea(null)) === JSON.stringify({ AGUA: [], HIELO: [] }), 'sin datos: ningún nombre (la barra dice «sin indicar»)');
const err = f => { try { f(); return ''; } catch (e) { return e.message; } };
ok(/Agua o Hielo/.test(err(() => S.aplicar(null, { uid: 'u', nombre: 'X', area: 'PET1' }))) && /nombre/.test(err(() => S.aplicar(null, { uid: 'u', nombre: ' ', area: 'AGUA' }))) && /usuario/.test(err(() => S.aplicar(null, { nombre: 'X', area: 'AGUA' }))), 'rechaza un área distinta de Agua/Hielo, un nombre vacío y la falta de usuario');
ok(S.propia(d, 'u1').area === 'AGUA' && S.propia(d, 'zz') === null, 'cada quien reconoce su propia entrada');
const idx = fs.readFileSync(__dirname + '/../index.html', 'utf8');
ok(/id="sup-turno-barra"/.test(idx) && /45-supervisor-en-turno\.js\?v=/.test(idx) && /glacialSupervisorTurno\.htmlBarraHielo/.test(fs.readFileSync(__dirname + '/../js/hielo/97-hielo.js', 'utf8')), 'la barra está en la pantalla de Agua (index.html) y en la de Hielo');
process.exit(fallas ? 1 : 0);
