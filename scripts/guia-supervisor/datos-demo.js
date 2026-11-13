/* Datos de EJEMPLO para la guía del supervisor: nombres y cifras inventados (no son de la planta). */
'use strict';
function fechaLima(ms){ return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); }
/* Hora fija de la demostración: hoy 10:30 en Lima (turno DÍA en curso). */
function horaDemo(){ const f = fechaLima(Date.now()); return { fecha: f, ms: Date.parse(f + 'T10:30:00-05:00') }; }

const NOMBRES = ['Luis Torres','Carla Ríos','Jorge Paredes','María Salas','Pedro Quispe','Rosa Medina','Iván Castro','Lucía Vega','Raúl Campos','Elena Flores','Diego Soto','Pilar Núñez'];
const CARGOS = ['MAQUINISTA SOPLADOR','MAQUINISTA ENVASADOR','MAQUINISTA ETIQUETADOR','MAQUINISTA EMPAQUETADOR','OPERARIO DE PRODUCCION','OPERARIO DE PRODUCCION'];

function sembrarDemo({ S, sembrar, lista }){
  const { fecha, ms } = horaDemo();
  S.reloj = ms;
  const t = ms - 3 * 3600000;
  const prog = (id, linea, marca, presentacion, cantidad, upp) => ({ id, clave: [linea, fecha, 'DÍA', marca, presentacion].join('|'), fecha, linea, marca, turno: 'DÍA', presentacion,
    cantidadProgramada: cantidad, unidadesPorPaleta: upp, paletasProgramadas: cantidad / upp, creadoEn: t, creadoPor: 'Planificación (ejemplo)', actualizadoEn: t, actualizadoPor: 'Planificación (ejemplo)' });
  lista('programaciones', [
    prog('demo_p1', 'PET1', 'Bells', 'Pack_Regular_2.5Lx6und', 16200, 324),
    prog('demo_p2', 'PET2', 'Scala', 'Pack_Regular_625mlx15und/ln', 27000, 1350),
    prog('demo_p3', 'B7L', 'Cuisine', '7 Litros', 2520, 126)
  ]);
  const pal = (id, linea, marca, presentacion, hora, paletas, upp) => ({ id, hora, fecha, linea, marca, turno: 'DÍA', paletas, usuario: 'Ana Supervisora', creadoEn: t, tipoPaleta: 'COMPLETA',
    presentacion, actualizadoEn: t, observaciones: '', totalUnidades: paletas * upp, actualizadoPor: 'Ana Supervisora', usuarioUsername: 'ana', unidadesPorPaleta: upp, unidadesIncompleta: 0 });
  lista('paletas', [
    pal('demo_pal1', 'PET1', 'Bells', 'Pack_Regular_2.5Lx6und', '08:15', 6, 324),
    pal('demo_pal2', 'PET1', 'Bells', 'Pack_Regular_2.5Lx6und', '09:30', 7, 324),
    pal('demo_pal3', 'PET2', 'Scala', 'Pack_Regular_625mlx15und/ln', '09:45', 5, 1350)
  ]);
  lista('workers', NOMBRES.map((n, i) => ({ id: 'demo_w' + (i + 1), dni: String(70000001 + i), cargo: CARGOS[i % CARGOS.length], linea: i < 6 ? 'PET1' : 'PET2', estado: 'Activo', nombre: n.toUpperCase() })));
  const lunes = (() => { const d = new Date(fecha + 'T12:00:00'); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return d; })();
  const iso = d => d.toLocaleDateString('en-CA');
  const dias = {}; for (let i = 0; i < 7; i++) { const d = new Date(lunes); d.setDate(d.getDate() + i); dias[iso(d)] = i === 6 ? { estado: 'DESCANSO', turno: 'DESCANSO', inicio: '', fin: '' } : { estado: 'DÍA', turno: 'DÍA', inicio: '07:00', fin: '19:00' }; }
  const domingo = new Date(lunes); domingo.setDate(domingo.getDate() + 6);
  lista('rotaciones', [{ id: 'ROT-SUP-' + iso(lunes), tipo: 'SUPERVISORES', semana: 1, desde: iso(lunes), hasta: iso(domingo), estado: 'PUBLICADA', publicadaEn: t, actualizadoEn: t,
    detalles: [{ username: 'ana', nombre: 'Ana Supervisora', linea: 'PET1', dias }], excepciones: [], auditoria: [], creadoEn: t, creadoPor: 'admin' }]);
  return { fecha, ms };
}
module.exports = { sembrarDemo, horaDemo };
