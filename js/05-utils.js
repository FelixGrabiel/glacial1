/* =============================================================
   UTILIDADES (fechas, turnos, lotes, códigos, cajas)
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */


/* =========================================================
   UTILIDADES NUMÉRICAS
   ========================================================= */

function num(v){

  const n = parseFloat(v);

  return isNaN(n) ? 0 : n;

}


function pct(v){

  return (
    v * 100
  ).toFixed(1) + '%';

}


/* =========================================================
   DÍA JULIANO
   ========================================================= */

function obtenerDiaDelAño(fecha){

  if(!fecha){

    return '';

  }


  const partes =
    String(fecha).split('-');


  if(partes.length !== 3){

    return '';

  }


  const año =
    Number(partes[0]);


  const mes =
    Number(partes[1]);


  const dia =
    Number(partes[2]);


  if(
    !año ||
    !mes ||
    !dia
  ){

    return '';

  }


  const fechaActual =
    Date.UTC(
      año,
      mes - 1,
      dia
    );


  const inicioAño =
    Date.UTC(
      año,
      0,
      1
    );


  return Math.floor(

    (
      fechaActual -
      inicioAño
    ) / 86400000

  ) + 1;

}


/* =========================================================
   NORMALIZAR TEXTO
   ========================================================= */

function normalizarTexto(valor){

  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

}


/* =========================================================
   CÓDIGO DE TURNO
   =========================================================

   DÍA   = 2
   NOCHE = 1

   TARDE:
   No tiene código definido por la regla entregada.
   Por eso se deja vacío.
   ========================================================= */

function obtenerCodigoTurno(turno){

  const t = normalizarTexto(turno);

  if(t === 'dia'){
    return '2';
  }

  if(t === 'noche'){
    return '1';
  }

  return '';

}


/* =========================================================
   CALCULAR HORAS DE TURNO
   =========================================================

   Calcula automáticamente las horas de turno a partir
   de la hora de inicio y la hora de fin.

   Si la hora de fin es menor o igual a la hora de inicio,
   se asume que el turno cruza la medianoche (ej: 19:00 a
   07:00 = 12 horas).

   Ejemplos:

   07:00 → 19:00  =  12
   19:00 → 07:00  =  12
   22:00 → 06:00  =   8
   ========================================================= */

function calcularHorasTurno(horaInicio, horaFin){

  if(
    !horaInicio ||
    !horaFin
  ){

    return 0;

  }


  const partesInicio =
    String(horaInicio).split(':');

  const partesFin =
    String(horaFin).split(':');


  if(
    partesInicio.length < 2 ||
    partesFin.length < 2
  ){

    return 0;

  }


  const hInicio =
    Number(partesInicio[0]);

  const mInicio =
    Number(partesInicio[1]);

  const hFin =
    Number(partesFin[0]);

  const mFin =
    Number(partesFin[1]);


  if(
    isNaN(hInicio) ||
    isNaN(mInicio) ||
    isNaN(hFin) ||
    isNaN(mFin)
  ){

    return 0;

  }


  const minutosInicio =
    (hInicio * 60) + mInicio;

  let minutosFin =
    (hFin * 60) + mFin;


  /*
     Si el turno cruza la medianoche,
     sumamos 24 horas al final.
  */

  if(minutosFin <= minutosInicio){

    minutosFin += (24 * 60);

  }


  const horas =
    (minutosFin - minutosInicio) / 60;


  /*
     Redondeamos a 2 decimales
     para evitar errores de coma flotante.
  */

  return Math.round(horas * 100) / 100;

}


/* =========================================================
   SEMANA TIPO EXCEL
   =========================================================

   Equivalente a:

   =WEEKNUM(fecha,1)

   - La semana comienza el DOMINGO.
   - El 1 de enero pertenece a la semana 1.
   ========================================================= */

function obtenerSemana(fecha){

  if(!fecha){
    return '';
  }

  const partes = String(fecha).split('-');

  if(partes.length !== 3){
    return '';
  }

  const año = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);

  if(!año || !mes || !dia){
    return '';
  }

  const fechaActual =
    new Date(
      año,
      mes - 1,
      dia
    );

  const inicioAño =
    new Date(
      año,
      0,
      1
    );

  const diferenciaDias =
    Math.floor(
      (
        fechaActual.getTime() -
        inicioAño.getTime()
      ) / 86400000
    );

  const diaDelAño =
    diferenciaDias + 1;

  const diaSemanaInicioAño =
    inicioAño.getDay();

  const semana =
    Math.floor(
      (
        diaDelAño +
        diaSemanaInicioAño -
        1
      ) / 7
    ) + 1;

  return semana;

}


/* =========================================================
   CÓDIGO DE MARCA / PRESENTACIÓN
   =========================================================

   REGLAS (explícitas por marca, según lo indicado):

   PET1:
   - CF1: SCALA, ARO, FONTLIFE, MERKAT, BELLS, GLACIAL
   - CUISINE = 2

   PET2:
   - Scala Gas / Manzana / Maracuya / Piña Kion = 3
   - Bells Gas / Manzana / Maracuya = 6
   - Cuisine = 2
   - CF4: SCALA, FONTLIFE, BELLS, GLACIAL (presentación regular,
     sin gas/sabor)

   B7L:
   - Cuisine = 2
   - CF3: SCALA, ARO, FONTLIFE, MERKAT, BELLS, GLACIAL

   C20L:
   - San Fernando = 12
   - CF2: SCALA, ARO, CUISINE, MERKAT, BELLS, GLACIAL

   B20L:
   - Glacial = 1
   ========================================================= */

/*
   Listas de marcas por código, normalizadas
   (minúsculas, sin tildes, sin guiones bajos).
*/

const MARCAS_CF1_PET1 = [
  'scala',
  'aro',
  'fontlife',
  'merkat',
  'bells',
  'glacial'
];

const MARCAS_CF4_PET2 = [
  'scala',
  'fontlife',
  'bells',
  'glacial'
];

const MARCAS_CF3_B7L = [
  'scala',
  'aro',
  'fontlife',
  'merkat',
  'bells',
  'glacial'
];

const MARCAS_CF2_C20L = [
  'scala',
  'aro',
  'cuisine',
  'merkat',
  'bells',
  'glacial',
  'san fernando'
];


function obtenerCodigoMarca(linea, marca, presentacion){

  const m = normalizarTexto(marca);

  const combinado = normalizarTexto(
    `${marca || ''} ${presentacion || ''}`
  );


  /* =====================================================
     PET1
     ===================================================== */

  if(linea === 'PET1'){

    if(m === 'cuisine'){
      return '2';
    }

    if(MARCAS_CF1_PET1.includes(m)){
      return 'CF1';
    }

    return 'CF1';
  }


  /* =====================================================
     PET2
     ===================================================== */

  if(linea === 'PET2'){

    if(
      combinado.includes('scala gas') ||
      combinado.includes('scala manzana') ||
      combinado.includes('scala maracuya') ||
      combinado.includes('scala pina kion')
    ){

      return '3';
    }

    if(
      combinado.includes('bells gas') ||
      combinado.includes('bells manzana') ||
      combinado.includes('bells maracuya')
    ){

      return '6';
    }

    if(
      m === 'cuisine' ||
      combinado.includes('cuisine regular') ||
      combinado.includes('cuisine gas')
    ){

      return '2';
    }

    if(MARCAS_CF4_PET2.includes(m)){
      return 'CF4';
    }

    return 'CF4';
  }


  /* =====================================================
     B7L
     ===================================================== */

  if(linea === 'B7L'){

    if(m === 'cuisine'){
      return '2';
    }

    if(MARCAS_CF3_B7L.includes(m)){
      return 'CF3';
    }

    return 'CF3';
  }


  /* =====================================================
     C20L
     ===================================================== */

  if(linea === 'C20L'){

    if(
      m === 'san fernando' ||
      combinado.includes('san fernando')
    ){

      return '12';
    }

    if(MARCAS_CF2_C20L.includes(m)){
      return 'CF2';
    }

    return 'CF2';
  }


  /* =====================================================
     B20L
     ===================================================== */

  if(linea === 'B20L'){

    if(m === 'glacial'){
      return '1';
    }

    return '';
  }


  return '';
}


/* =========================================================
   GENERAR LOTE AUTOMÁTICO
   =========================================================

   DOS CASOS:

   1) Código de marca NUMÉRICO (1, 2, 3, 6, 12):
      El lote se arma completo:

      DIA JULIANO - TURNO + CÓDIGO + SEMANA

      Ejemplos:
      Scala Manzana PET2   → código 3  → 249-2337
      Bells Gas PET2       → código 6  → 249-2637
      Cuisine (cualquier línea) → código 2 → 249-2237
      San Fernando C20L    → código 12 → 249-21237
      Glacial B20L         → código 1  → 249-2137

   2) Código de marca ALFANUMÉRICO (CF1, CF2, CF3, CF4):
      El lote es SOLO ese código, sin día juliano,
      turno ni semana.

      Ejemplos:
      PET1 (Scala/Aro/Fontlife/Merkat/Bells/Glacial) → CF1
      PET2 (Scala/Fontlife/Bells/Glacial regular)    → CF4
      B7L  (Scala/Aro/Fontlife/Merkat/Bells/Glacial) → CF3
      C20L (Scala/Aro/Cuisine/Merkat/Bells/Glacial)  → CF2
   ========================================================= */

function generarLote(){

  if(!draft){
    return '';
  }


  /* =====================================================
     CÓDIGO DE MARCA (numérico o CFx)
     ===================================================== */

  const codigoMarca =
    obtenerCodigoMarca(
      draft.linea,
      draft.marca,
      draft.presentacion
    );


  /*
     Si el código es alfanumérico (CF1, CF2, CF3, CF4),
     el lote es SOLO ese código.
  */

  const esAlfanumerico =
    codigoMarca !== '' &&
    !/^\d+$/.test(
      String(codigoMarca)
    );


  if(esAlfanumerico){

    return String(codigoMarca);

  }


  /* =====================================================
     DÍA JULIANO
     ===================================================== */

  const diaJuliano =
    obtenerDiaDelAño(
      draft.fecha
    );


  /* =====================================================
     SEMANA
     ===================================================== */

  const semana =
    obtenerSemana(
      draft.fecha
    );


  /* =====================================================
     TURNO
     ===================================================== */

  const codigoTurno =
    obtenerCodigoTurno(
      draft.turno
    );


  /* =====================================================
     VALIDACIÓN
     ===================================================== */

  if(
    diaJuliano === '' ||
    semana === '' ||
    codigoTurno === ''
  ){

    return '';
  }


  /* =====================================================
     CONSTRUCCIÓN DEL LOTE (código numérico)
     ===================================================== */

  return (
    String(diaJuliano) +
    '-' +
    String(codigoTurno) +
    String(codigoMarca) +
    String(semana)
  );

}


/* =========================================================
   ACTUALIZAR LOTE
   ========================================================= */

function actualizarLoteDraft(){

  if(!draft){
    return;
  }


  draft.lote =
    generarLote();


  const campoLote =
    document.getElementById('f_lote');


  if(campoLote){

    campoLote.value =
      draft.lote || '';

  }

}


function actualizarLote(){

  if(!draft){
    return;
  }


  draft.lote =
    generarLote();

}


/* =========================================================
   UNIDADES POR PALET

   Se usa para calcular automáticamente el N° de paletas
   (producción efectiva ÷ unidades por palet) según
   línea + marca + presentación.

   Reglas entregadas:

   PET1 y PET2:
   - 2.5L                                   : 324 x palet
   - 1L                                      : 720 x palet
   - 625ml (Scala, Aro, Merkat, Bells,
     Glacial, Cuisine — sin sabor)           : 1500 x palet
   - 625ml (Scala Gas/Manzana/Maracuya/
     Piña Kion, Bells Gas/Manzana/Maracuya)  : 1350 x palet
   - 380ml                                   : 2184 x palet
   - 1.5L                                    : 600 x palet

   B7L:
   - Scala, Cuisine, Merkat, Glacial, Aro,
     Bells                                   : 126 x palet
   - Fontlife                                : 85 x palet

   C20L:
   - Cuisine, San Jorge                      : 40 x palet
   - Aro, Scala, Merkat, Bells, Glacial       : 50 x palet

   B20L:
   - Cualquier marca                         : 32 x palet
   ========================================================= */

   /* =========================================================
   DIVISOR DE CAJAS DE PREFORMAS POR PRESENTACIÓN
   =========================================================
   Trasladado de la fórmula de Excel (SI.CONJUNTO anidado).
   cajasPreformas = producción efectiva ÷ divisor
   Si la presentación no está en la tabla, el valor es 0
   (igual que el " " del Excel original).
   ========================================================= */

const CAJAS_PREFORMAS_DIVISOR = {
  'pack_alcalina_380mlx24und/ln': 21500,
  'pack_regular_380mlx24und/ln': 21500,

  'pack_regular_625mlx6und/la': 18750,
  'pack_regular_625mlx6und/ln': 18750,
  'pack_regular_625mlx15und/la': 18750,
  'pack_regular_625mlx15und/ln': 18750,
  'pack_alcalina_625mlx6und/la': 18750,
  'pack_alcalina_625mlx6und/ln': 18750,
  'pack_alcalina_625mlx15und/la': 18750,
  'pack_alcalina_625mlx15und/ln': 18750,
  'pack_alcalina(y)_625mlx15und/la': 18750,
  'pack_alcalina(y)_625mlx15und/ln': 18750,

  'pack_regular_sc_1lx12und/la': 14250,
  'pack_regular_sc_1lx12und/ln': 14250,
  'pack_alcalina_sc_1lx6und/la': 14250,
  'pack_alcalina_sc_1lx6und/ln': 14250,
  'pack_alcalina_sc_1lx12und/la': 14250,
  'pack_alcalina_sc_1lx12und/ln': 14250,
  'pack_alcalina_tp_1lx6und/la': 14250,
  'pack_alcalina_tp_1lx6und/ln': 14250,

  'pack_regular_1.5lx6und': 9928,

  'pack_regular_2.5lx6und': 7900,
  'pack_alcalina_2.5lx6und': 7900,
  'pack c/sticker_alcalina_2.5lx6und': 7900
};


/* =========================================================
   FACTOR DE CARTÓN POR PRESENTACIÓN (PET1/PET2)
   =========================================================
   planchasCarton = N° de paletas × factor
   ========================================================= */

const FACTOR_CARTON_PET = {
  'pack_alcalina_380mlx24und/ln': 6,
  'pack_regular_380mlx24und/ln': 6,

  'pack_regular_625mlx6und/la': 5,
  'pack_regular_625mlx6und/ln': 5,
  'pack_regular_625mlx15und/la': 5,
  'pack_regular_625mlx15und/ln': 5,
  'pack_alcalina_625mlx6und/la': 5,
  'pack_alcalina_625mlx6und/ln': 5,
  'pack_alcalina_625mlx15und/la': 5,
  'pack_alcalina_625mlx15und/ln': 5,

  'pack_alcalina(y)_625mlx15und/la': 4,
  'pack_alcalina(y)_625mlx15und/ln': 4,
  'pack_regular_sc_1lx12und/la': 4,
  'pack_regular_sc_1lx12und/ln': 4,
  'pack_alcalina_sc_1lx6und/la': 4,
  'pack_alcalina_sc_1lx6und/ln': 4,
  'pack_alcalina_sc_1lx12und/la': 4,
  'pack_alcalina_sc_1lx12und/ln': 4,
  'pack_alcalina_tp_1lx6und/la': 4,
  'pack_alcalina_tp_1lx6und/ln': 4,
  'pack_regular_1.5lx6und': 4,

  'pack_regular_2.5lx6und': 3,
  'pack_alcalina_2.5lx6und': 3,
  'pack c/sticker_alcalina_2.5lx6und': 3
};


/* =========================================================
   FACTOR DE POLIETILENO (KG) POR PRESENTACIÓN (PET1/PET2)
   =========================================================
   polietilenoKg = N° de paletas × factor
   ========================================================= */

const FACTOR_POLIETILENO_PET = {
  'pack_alcalina_380mlx24und/ln': 2.73,
  'pack_regular_380mlx24und/ln': 2.73,

  'pack_regular_625mlx6und/la': 2.93,
  'pack_regular_625mlx6und/ln': 2.93,
  'pack_regular_625mlx15und/la': 2.8,
  'pack_regular_625mlx15und/ln': 2.8,
  'pack_alcalina_625mlx6und/la': 2.93,
  'pack_alcalina_625mlx6und/ln': 2.93,
  'pack_alcalina_625mlx15und/la': 2.8,
  'pack_alcalina_625mlx15und/ln': 2.8,
  'pack_alcalina(y)_625mlx15und/la': 2.8,
  'pack_alcalina(y)_625mlx15und/ln': 2.8,

  'pack_regular_sc_1lx12und/la': 1.8,
  'pack_regular_sc_1lx12und/ln': 1.8,
  'pack_alcalina_sc_1lx6und/la': 3.6,
  'pack_alcalina_sc_1lx6und/ln': 3.6,
  'pack_alcalina_sc_1lx12und/la': 1.8,
  'pack_alcalina_sc_1lx12und/ln': 1.8,
  'pack_alcalina_tp_1lx6und/la': 3.6,
  'pack_alcalina_tp_1lx6und/ln': 3.6,

  'pack_regular_1.5lx6und': 1.89,
  'pack_regular_2.5lx6und': 1.89,
  'pack_alcalina_2.5lx6und': 1.89,
  'pack c/sticker_alcalina_2.5lx6und': 1.89
};


/* =========================================================
   FACTOR DE STRETCH FILM (KG) POR PRESENTACIÓN (PET1/PET2)
   ========================================================= */

const FACTOR_STRETCHFILM_PET = {
  'pack_alcalina_380mlx24und/ln': 0.66,
  'pack_regular_380mlx24und/ln': 0.66,

  'pack_regular_625mlx6und/la': 0.6,
  'pack_regular_625mlx6und/ln': 0.6,
  'pack_regular_625mlx15und/la': 0.6,
  'pack_regular_625mlx15und/ln': 0.6,
  'pack_alcalina_625mlx6und/la': 0.6,
  'pack_alcalina_625mlx6und/ln': 0.6,
  'pack_alcalina_625mlx15und/la': 0.6,
  'pack_alcalina_625mlx15und/ln': 0.6,
  'pack_alcalina(y)_625mlx15und/la': 0.6,
  'pack_alcalina(y)_625mlx15und/ln': 0.6,

  'pack_regular_sc_1lx12und/la': 0.55,
  'pack_regular_sc_1lx12und/ln': 0.55,
  'pack_alcalina_sc_1lx6und/la': 0.55,
  'pack_alcalina_sc_1lx6und/ln': 0.55,
  'pack_alcalina_sc_1lx12und/la': 0.55,
  'pack_alcalina_sc_1lx12und/ln': 0.55,
  'pack_alcalina_tp_1lx6und/la': 0.55,
  'pack_alcalina_tp_1lx6und/ln': 0.55,

  'pack_regular_1.5lx6und': 0.33,
  'pack_regular_2.5lx6und': 0.33,
  'pack_alcalina_2.5lx6und': 0.33,
  'pack c/sticker_alcalina_2.5lx6und': 0.33
};


/* =========================================================
   REGLAS DE CARTÓN — B7L / C20L / B20L
   ========================================================= */

const CARTON_FIJO_B7L = 18;
const CARTON_C20L_SAN_FERNANDO = 2;
const CARTON_C20L_DEFAULT = 1;
const CARTON_FIJO_B20L = 1;


/* =========================================================
   REGLAS DE POLIETILENO — B7L / C20L / B20L
   ========================================================= */

const POLIETILENO_B7L_FACTOR = 2.02;
const POLIETILENO_C20L_FACTOR = 1.65;
const MARCAS_POLIETILENO_B7L_SI = [
  'scala',
  'merkat',
  'cuisine',
  'glacial'
];


/* =========================================================
   REGLAS DE STRETCH FILM — B7L / C20L / B20L
   ========================================================= */

const STRETCHFILM_B7L_FACTOR = 0.25;
const STRETCHFILM_C20L_FACTOR = 0.5;
const STRETCHFILM_B20L_FACTOR = 0.75;


function obtenerDivisorCajasPreformas(presentacion){

  const key = String(presentacion || '').toLowerCase();

  return CAJAS_PREFORMAS_DIVISOR[key] ?? null;

}


function calcularCajasPreformas(){

  if(!draft){
    return 0;
  }

  const efectiva =
    num(draft.produccion?.efectiva);


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const divisor =
      obtenerDivisorCajasPreformas(draft.presentacion);

    if(!divisor){
      return 0;
    }

    return Math.round(
      (efectiva / divisor) * 100
    ) / 100;

  }


  if(draft.linea === 'B7L'){

    return Math.round(
      (efectiva / 2900) * 100
    ) / 100;

  }


  /*
     C20L y B20L no usan cajas de preformas.
  */

  return 0;

}


function actualizarCajasPreformas(){

  if(!draft){
    return;
  }

  if(!draft.insumos){
    draft.insumos = {};
  }

  draft.insumos.cajasPreformas =
    calcularCajasPreformas();

}


function obtenerFactorCartonPET(presentacion){

  const key = String(presentacion || '').toLowerCase();

  return FACTOR_CARTON_PET[key] ?? null;

}


function calcularPlanchasCarton(){

  if(!draft){
    return 0;
  }

  const paletas =
    num(draft.produccion?.paletas);


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const factor =
      obtenerFactorCartonPET(draft.presentacion);

    if(!factor){
      return 0;
    }

    return Math.round(
      (paletas * factor) * 100
    ) / 100;

  }


  if(draft.linea === 'B7L'){

    return Math.round(
      (paletas * CARTON_FIJO_B7L) * 100
    ) / 100;

  }


  if(draft.linea === 'C20L'){

    const m = normalizarTexto(draft.marca);

    const factor =
      m === 'san fernando'
        ? CARTON_C20L_SAN_FERNANDO
        : CARTON_C20L_DEFAULT;

    return Math.round(
      (paletas * factor) * 100
    ) / 100;

  }


  if(draft.linea === 'B20L'){

    return Math.round(
      (paletas * CARTON_FIJO_B20L) * 100
    ) / 100;

  }


  return 0;

}


function actualizarPlanchasCarton(){

  if(!draft){
    return;
  }

  if(!draft.insumos){
    draft.insumos = {};
  }

  draft.insumos.planchasCarton =
    calcularPlanchasCarton();

}


function obtenerFactorPolietileno(presentacion){

  const key = String(presentacion || '').toLowerCase();

  return FACTOR_POLIETILENO_PET[key] ?? null;

}


function calcularPolietileno(){

  if(!draft){
    return 0;
  }

  const paletas =
    num(draft.produccion?.paletas);


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const factor =
      obtenerFactorPolietileno(draft.presentacion);

    if(!factor){
      return 0;
    }

    return Math.round(
      (paletas * factor) * 100
    ) / 100;

  }


  if(draft.linea === 'B7L'){

    const m = normalizarTexto(draft.marca);

    if(MARCAS_POLIETILENO_B7L_SI.includes(m)){

      return Math.round(
        (paletas * POLIETILENO_B7L_FACTOR) * 100
      ) / 100;

    }

    return 0;

  }


  if(draft.linea === 'C20L'){

    return Math.round(
      (paletas * POLIETILENO_C20L_FACTOR) * 100
    ) / 100;

  }


  /* B20L no usa polietileno. */
  return 0;

}


function actualizarPolietileno(){

  if(!draft){
    return;
  }

  if(!draft.insumos){
    draft.insumos = {};
  }

  draft.insumos.polietilenoKg =
    calcularPolietileno();

}


function obtenerFactorStretchFilm(presentacion){

  const key = String(presentacion || '').toLowerCase();

  return FACTOR_STRETCHFILM_PET[key] ?? null;

}


function calcularStretchFilm(){

  if(!draft){
    return 0;
  }

  const paletas =
    num(draft.produccion?.paletas);


  if(
    draft.linea === 'PET1' ||
    draft.linea === 'PET2'
  ){

    const factor =
      obtenerFactorStretchFilm(draft.presentacion);

    if(!factor){
      return 0;
    }

    return Math.round(
      (paletas * factor) * 100
    ) / 100;

  }


  if(draft.linea === 'B7L'){

    return Math.round(
      (paletas * STRETCHFILM_B7L_FACTOR) * 100
    ) / 100;

  }


  if(draft.linea === 'C20L'){

    return Math.round(
      (paletas * STRETCHFILM_C20L_FACTOR) * 100
    ) / 100;

  }


  if(draft.linea === 'B20L'){

    return Math.round(
      (paletas * STRETCHFILM_B20L_FACTOR) * 100
    ) / 100;

  }


  return 0;

}


function actualizarStretchFilm(){

  if(!draft){
    return;
  }

  if(!draft.insumos){
    draft.insumos = {};
  }

  draft.insumos.stretchFilmKg =
    calcularStretchFilm();

}

function obtenerUnidadesPorPalet(linea, marca, presentacion){

  const m = normalizarTexto(marca);

  const p = normalizarTexto(presentacion);


  /* =====================================================
     PET1 / PET2
     ===================================================== */

  if(
    linea === 'PET1' ||
    linea === 'PET2'
  ){

    if(p.includes('2.5l')){

      return 324;

    }


    if(p.includes('380ml')){

      return 2184;

    }


    if(p.includes('1.5l')){

      return 600;

    }


    if(p.includes('625ml')){

      const esSaborizada =

        m.includes('scala gas') ||
        m.includes('scala manzana') ||
        m.includes('scala maracuya') ||
        m.includes('scala pina kion') ||
        m.includes('bells gas') ||
        m.includes('bells manzana') ||
        m.includes('bells maracuya');


      return esSaborizada
        ? 1350
        : 1500;

    }


    if(p.includes('1l')){

      return 720;

    }


    return 0;

  }


  /* =====================================================
     B7L
     ===================================================== */

  if(linea === 'B7L'){
    if( m=='glacial' ||  m=='scala' || m=='merkat' || m=='cuisine'){
      
      return 126;

    }
    if(m === 'aro' || m === 'bells'){
      
      return 120;
    }
    if(m === 'fontlife'){

      return 85;

    }


    if(
      m === 'scala' ||
      m === 'cuisine' ||
      m === 'merkat' ||
      m === 'glacial' ||
      m === 'aro' ||
      m === 'bells'
    ){

      return 126;

    }


    return 0;

  }


  /* =====================================================
     C20L
     ===================================================== */

  if(linea === 'C20L'){

    if(
      m === 'cuisine' ||
      m === 'san jorge'
    ){

      return 40;

    }


    if(
      m === 'aro' ||
      m === 'scala' ||
      m === 'merkat' ||
      m === 'bells' ||
      m === 'glacial' ||
      m === 'san fernando'
    ){

      return 50;

    }


    return 0;

  }


  /* =====================================================
     B20L
     ===================================================== */

  if(linea === 'B20L'){

    return 32;

  }


  return 0;

}


/* =========================================================
   CALCULAR N° DE PALETAS (AUTOMÁTICO)

   N° de paletas = producción efectiva ÷ unidades por palet
   ========================================================= */

function calcularPaletas(){

  if(!draft){

    return 0;

  }


  const unidadesPorPalet =
    obtenerUnidadesPorPalet(
      draft.linea,
      draft.marca,
      draft.presentacion
    );


  if(!unidadesPorPalet){

    return 0;

  }


  const efectiva =
    num(
      draft.produccion?.efectiva
    );


  return Math.round(

    (
      efectiva /
      unidadesPorPalet
    ) * 100

  ) / 100;

}


function actualizarPaletas(){

  if(!draft){
    return;
  }


  if(!draft.produccion){

    draft.produccion = {};

  }


  draft.produccion.paletas =
    calcularPaletas();

}


/* =========================================================
   SEGURIDAD DE CONTRASEÑAS (HASH + SALT)
   =========================================================

   Las contraseñas ya NO se guardan en texto plano.

   Cada usuario guarda:
     - salt: 16 bytes aleatorios (en hexadecimal), distinto
       por usuario.
     - passwordHash: resultado de aplicar PBKDF2 (SHA-256,
       100 000 iteraciones) a la contraseña + su salt.

   Esto usa la Web Crypto API del navegador (crypto.subtle),
   que solo funciona en un "contexto seguro": localhost o
   un sitio servido por HTTPS. Si el sistema se aloja en un
   servidor sin HTTPS, esta parte dejará de funcionar y habrá
   que activar HTTPS (por ejemplo con Firebase Hosting, que
   lo trae incluido gratis).
   ========================================================= */

const PBKDF2_ITERACIONES = 100000;

function bytesAHex(bytes){

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

}

function hexABytes(hex){

  const bytes = new Uint8Array(hex.length / 2);

  for(let i = 0; i < bytes.length; i++){
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }

  return bytes;

}

async function generarSalt(){

  return bytesAHex(
    crypto.getRandomValues(new Uint8Array(16))
  );

}

async function calcularHashPassword(password, saltHex){

  const enc = new TextEncoder();

  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexABytes(saltHex),
      iterations: PBKDF2_ITERACIONES,
      hash: 'SHA-256'
    },
    material,
    256
  );

  return bytesAHex(new Uint8Array(bits));

}

/*
   A partir de una contraseña en texto plano, genera un
   salt nuevo y devuelve {salt, passwordHash} listos para
   guardar en Firestore. Usar siempre que se cree o cambie
   una contraseña.
*/

async function crearCredencialPassword(password){

  const salt = await generarSalt();

  const passwordHash =
    await calcularHashPassword(password, salt);

  return { salt, passwordHash };

}

/*
   Quita cualquier dato de contraseña (texto plano, hash o
   salt) de un objeto de usuario, para que nunca terminen en
   sessionStorage ni en el "state" de la app en memoria.
*/

function usuarioSinCredenciales(u){

  const {
    password,
    passwordHash,
    salt,
    ...resto
  } = u;

  return resto;

}