/* GLACIAL · Guía del supervisor de producción: escenas de los videos (12/11/2026).
   Cada escena tiene el TEXTO que se lee en voz (y sale como subtítulo), qué pantalla abrir (ir), qué resaltar (marca) y,
   si corresponde, qué tocar (clic) o escribir. El mismo texto arma el guion de voz (guion.md) y el PDF.
   marca / clic: texto visible en pantalla (se busca el elemento más pequeño que lo contiene) o 'css:selector'. */
'use strict';
const SECCIONES = [
  {
    n: 1, titulo: 'Antes de empezar', archivo: '01-antes-de-empezar',
    escenas: [
      { texto: 'Bienvenido a la guía del supervisor de producción de GLACIAL. En este video verás cómo entrar al sistema y cómo está organizada la pantalla.', ir: 'login' },
      { texto: 'Para entrar, escribe tu usuario y tu contraseña, y pulsa Ingresar al sistema.', escribir: true, marca: 'css:#login-user' },
      { texto: 'Al entrar, el sistema te pregunta cómo vas a trabajar. Elige Trabajar para registrar datos. Visualizar es solo para consultar.', marca: 'css:.modo-modal-card[onclick*="trabajar"]', clic: 'css:.modo-modal-card[onclick*="trabajar"]' },
      { texto: 'Luego elige el reporte que vas a usar: Reporte Agua para las líneas de agua, o Reporte Hielo para la planta de hielo.', marca: 'css:[aria-label="Abrir Reporte Agua"]' },
      { texto: 'Arriba puedes cambiar el modo en cualquier momento: Visualizar para consultar o Trabajar para registrar.', ir: 'agua', marca: 'css:#modo-switch' },
      { texto: 'Este recuadro muestra tu turno: el horario, el tiempo que llevas y cuánto falta para el cierre.', marca: 'css:#cronometro-turno' },
      { texto: 'Cuando termina tu horario, lo que estabas escribiendo se guarda como borrador y la cuenta pasa a Visualizar. Si necesitas más tiempo, pídelo al Administrador.', marca: 'css:#cronometro-turno' },
      { texto: 'A la izquierda está el menú con todas las pantallas. En el celular, el menú se abre con el botón de las tres rayas.', marca: 'css:#glacial-sidebar' },
      { texto: 'Para terminar, pulsa Salir. Si cierras la pestaña del navegador, la sesión también se cierra.', marca: 'css:.topbar-logout' }
    ]
  },
  {
    n: 2, titulo: 'Inicio de Producción', archivo: '02-inicio-de-produccion',
    escenas: [
      { texto: 'Lo primero al llegar al turno es abrir Inicio de Producción, dentro del menú Producción.', ir: 'goProduccionInicio()', marca: 'Producción' },
      { texto: 'Arriba aparecen los avisos del día. Por ejemplo, aquí avisa que la línea PET 1 tiene programación y todavía no inicia.', marca: 'Atención de hoy' },
      { texto: 'Si quedaron reportes sin finalizar de turnos anteriores, también aparecen aquí con un botón Abrir. Ábrelos y finalízalos antes de empezar.', marca: 'Atención de hoy' },
      { texto: 'Desde esta pantalla entras a lo que usas en cada turno: Avance y cierre, Entrega de turno y Resúmenes de turno.', marca: 'Cada turno' },
      { texto: 'Más abajo están el Tareo de producción, la Bitácora y el Horario de producción.', marca: 'Personal', bajar: 360 }
    ]
  },
  {
    n: 3, titulo: 'Producción actual', archivo: '03-produccion-actual',
    escenas: [
      { texto: 'Producción actual muestra, en tiempo real, cómo van todas las líneas.', ir: 'goProduccionActual()', marca: 'Producción actual' },
      { texto: 'Estos contadores indican cuántas líneas están produciendo, cuántas están detenidas y cuántas siguen pendientes.', marca: 'Líneas en producción' },
      { texto: 'Cada tarjeta muestra la línea, la marca en curso, lo programado, la producción acumulada y el cumplimiento.', marca: 'PROGRAMACIÓN VIGENTE', bajar: 120 },
      { texto: 'Si una línea programada no está produciendo, informa el motivo con este botón. Así Jefatura y Mantenimiento lo saben al momento.', marca: 'Informar motivo de no producción' },
      { texto: 'Las paletas se registran en Registro de producción, pestaña Paletas, cada vez que se completa una. Ese dato alimenta esta pantalla y tu reporte.', ir: "setTab('paletas')", marca: 'css:[onclick="setTab(\'paletas\')"]' }
    ]
  },
  {
    n: 4, titulo: 'Registro de producción', archivo: '04-registro-de-produccion',
    escenas: [
      { texto: 'El reporte del turno se llena en Registro de producción, pestaña Nuevo registro. Cada línea y cada turno tienen un solo reporte.', ir: "setTab('nuevo')", marca: 'Nuevo registro' },
      { texto: 'Arriba ves la programación del turno: la marca, la presentación y las unidades programadas.', marca: 'Programación del turno' },
      { texto: 'En Datos generales revisa la fecha y el turno. En el turno Noche el día operativo va de siete de la mañana a siete de la mañana.', marca: 'Datos generales · PET 1', bajar: 300 },
      { texto: 'Cada marca que produces es un cuadro. El primero llega desde la programación. Si cambias de marca, pulsa Agregar marca.', marca: '+ Agregar marca' },
      { texto: 'En cada cuadro completa el lote, la hora de inicio y la hora de fin.', marca: 'Hora inicio', bajar: 160 },
      { texto: 'La producción y las paletas se llenan solas con lo que registraste en Paletas. Revisa que coincidan con lo que salió de la línea.', marca: 'Efectiva (bot)', bajar: 160 },
      { texto: 'Registra las paradas programadas, como el refrigerio o un cambio de formato, y las no programadas con su causa y sus minutos.', marca: 'Paradas no programadas', bajar: 240 },
      { texto: 'En Mermas anota las unidades o los kilos perdidos de cada componente: botellas, preformas, tapas, etiquetas y polietileno.', marca: 'Mermas', bajar: 260 },
      { texto: 'En Lotes de insumo marca los lotes que usaste. Con eso se sabe qué lote de tapas o de preformas fue a cada producción.', marca: 'Lotes de insumo usados', bajar: 200 },
      { texto: 'En Personal del turno registra quién trabajó en cada posición: sopladora, envasadora, etiquetadora y las demás.', marca: 'Personal del turno', bajar: 380 },
      { texto: 'Todo lo que escribes se guarda solo como borrador. Si se corta la conexión o cierras la pantalla, no se pierde.', marca: 'css:.reg-barra' },
      { texto: 'Al terminar una marca, pulsa Finalizar marca. Al final del turno, pulsa Finalizar reporte. El sistema revisa que no falte ningún dato antes de finalizar.', marca: 'css:button[onclick*="finalizarCuadroProduccion"]' },
      { texto: 'No dejes reportes en registro ni crees dos reportes del mismo turno y línea. Si ya existe, ábrelo desde la pestaña Historial.', marca: 'css:[onclick="setTab(\'historial\')"]', arriba: true }
    ]
  },
  {
    n: 5, titulo: 'Avance y cierre, y Entrega de turno', archivo: '05-avance-cierre-y-entrega',
    escenas: [
      { texto: 'En Avance y cierre informas cómo va el turno y, al terminar, generas el cierre.', ir: 'goAvanceProduccion()', marca: 'AVANCE Y CIERRE DE TURNO' },
      { texto: 'Con Generar avance ahora se guarda una foto del turno en ese momento: producción, paletas, paradas y personal.', marca: 'GENERAR AVANCE AHORA' },
      { texto: 'Si falta algo, agrégalo antes: las paradas con Agregar paradas y el personal con Ajustar personal.', marca: '+ AGREGAR PARADAS' },
      { texto: 'Al terminar el turno, pulsa Generar cierre de turno. El cierre queda guardado en Resúmenes de turno.', marca: 'GENERAR CIERRE DE TURNO' },
      { texto: 'En Entrega de turno dejas por escrito lo que el siguiente supervisor debe saber.', ir: 'goEntregaTurno()', marca: 'Entrega de turno' },
      { texto: 'Agrega una novedad por línea o una general, y al final pulsa Entregar turno.', marca: 'Entregar turno' }
    ]
  },
  {
    n: 6, titulo: 'Tareo y rotación', archivo: '06-tareo-y-rotacion',
    escenas: [
      { texto: 'En Tareo de producción registras la asistencia del personal de tu turno.', ir: 'goTareo()', marca: 'Tareo de Producción' },
      { texto: 'Toca tu turno y pulsa Iniciar tareo. Luego marca quién llegó y a qué hora.', marca: 'Iniciar tareo' },
      { texto: 'Durante el turno marca la salida y el regreso del refrigerio, y al final la salida de cada persona.', marca: 'Turnos del día' },
      { texto: 'En la pestaña Distribución de personal asignas a cada persona a su línea y a su posición.', marca: 'Distribución de personal' },
      { texto: 'En Rotación semanal ves tu turno de cada día de la semana y los reemplazos.', marca: 'Rotación semanal' }
    ]
  },
  {
    n: 7, titulo: 'Planificación', archivo: '07-planificacion',
    escenas: [
      { texto: 'En Planificación ves lo que se debe producir en el turno. Para el supervisor es solo de consulta.', ir: 'goPlanificacion()', marca: 'Planificación' },
      { texto: 'Arriba están el total programado, lo producido y lo pendiente del turno.', marca: 'PROGRAMADO' },
      { texto: 'Por cada línea ves la marca, la presentación, las unidades programadas, lo producido y lo que falta.', marca: 'CANTIDAD DEL BLOQUE (UND)' },
      { texto: 'En Programación semanal ves los días siguientes. Si la programación necesita un cambio, coordínalo con Planificación.', marca: 'Programación semanal' }
    ]
  },
  {
    n: 8, titulo: 'Reporte Hielo', archivo: '08-reporte-hielo',
    escenas: [
      { texto: 'El Reporte Hielo se abre con el botón Ir a Reporte de Hielo, arriba de la pantalla.', marca: 'Ir a Reporte de Hielo' },
      { texto: 'En el Inicio de Hielo ves las bolsas de tres kilos y de kilo y medio producidas, los kilos totales y las paradas del turno.', ir: 'goReporteHielo()', marca: 'Bolsas de 3 kg' },
      { texto: 'En Nuevo registro anotas la producción por marca y presentación, las paradas y las mermas. Al terminar, lo finalizas.', marca: 'Nuevo registro' },
      { texto: 'Para volver a las líneas de agua, pulsa Volver a Reporte Agua.', marca: 'Volver a Reporte Agua' }
    ]
  },
  {
    n: 9, titulo: 'Bitácora y resúmenes de turno', archivo: '09-bitacora-y-resumenes',
    escenas: [
      { texto: 'En Bitácora de producción consultas todas las paradas: por día, por línea, por técnico y por motivo.', ir: 'goBitacoraProduccion()', marca: 'Bitácora de producción' },
      { texto: 'Con estos botones eliges el período: hoy, ayer, esta semana, este mes o un rango personalizado.', marca: 'Esta semana' },
      { texto: 'En Resúmenes de turno encuentras los cierres guardados de los turnos anteriores.', ir: 'goResumenesTurno()', marca: 'Resúmenes de turno' },
      { texto: 'Con esto terminas la guía. Ante cualquier duda, consulta a Jefatura de Producción.', marca: 'Resúmenes guardados' }
    ]
  }
];
/* Duración de una escena sin audio: unas 2,6 palabras por segundo + pausa. */
const duracion = t => Math.max(3800, Math.round(String(t).split(/\s+/).length / 2.6 * 1000) + 1200);
module.exports = { SECCIONES, duracion };
