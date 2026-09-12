const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAO86_KLoblDvHq-65q2xbD53-zj_L0tUY",
  authDomain: "jefaturaopglacial-fdb95.firebaseapp.com",
  projectId: "jefaturaopglacial-fdb95",
  storageBucket: "jefaturaopglacial-fdb95.firebasestorage.app",
  messagingSenderId: "949615984456",
  appId: "1:949615984456:web:6664bb183ee09930ad3d7d"
};

firebase.initializeApp(FIREBASE_CONFIG);

const db = firebase.firestore();


const LINES = [
  { key:'PET1', name:'PET 1', ratioDefault:1920 },
  { key:'PET2', name:'PET 2', ratioDefault:1920 },
  { key:'B7L',  name:'B7L',   ratioDefault:600 },
  { key:'C20L', name:'C20L',  ratioDefault:250 },
  { key:'B20L', name:'B20L', ratioDefault:55 },
];


/* =========================================================
   LISTAS MAESTRAS GLACIAL
   ========================================================= */

const MARCAS_POR_LINEA = {

  PET1: [
    'Bells',
    'Scala',
    'Glacial',
    'Aro',
    'Cuisine'
  ],

  PET2: [
    'Bells_Gas',
    'Bells_Manzana',
    'Scala_Gas',
    'Bells',
    'Scala',
    'scala_Manzana',
    'Scala_Maracuya',
    'Scala_Piña_Kion',
    'Cuisine',
    'Glacial',
    'Aro',
    'San Jorgue',
    'Yaqua Farmacias',
    'Cuisine',
    'Merkat'
  ],

  B7L: [
    'BELLS',
    'SCALA',
    'GLACIAL',
    'ARO',
    'FONTLIFE',
    'MERKAT',
    'CUISINE'
  ],

  C20L: [
    'Bells',
    'Scala',
    'Glacial',
    'Aro',
    'Merkat',
    'San Jorge',
    'Cuisine',
    'San Fernando'
  ],

  B20L: [
    'Glacial'
  ]

};


/*
   RATIO NOMINAL (BPH) POR PRESENTACIÓN

   Trasladado directamente de las fórmulas de Excel
   (SI.CONJUNTO / SI.ND) de PET1 y PET2.

   Las claves de este objeto son, a la vez, la lista de
   presentaciones que aparecen en el selector — así el
   dropdown y la tabla de ratios nunca quedan desincronizados.

   Si una presentación no está en esta tabla, el ratio es 0
   (igual que el SI.ND(...;0) de la fórmula original).
*/

const RATIOS_PRESENTACION_PET1 = {

  'Pack_Regular_2.5Lx6und': 1920,
  'Pack_Alcalina_2.5Lx6und': 1920,
  'Pack c/Sticker_Alcalina_2.5Lx6und': 1920,
  'Pack_Alcalina_SC_1Lx12und/lN': 2400

};

const RATIOS_PRESENTACION_PET2 = {

  'Pack_Regular_380mlx24und/la': 3300,
  'Pack_Regular_380mlx24und/ln': 6000,
  'Pack_Regular_625mlx6und/la': 3300,
  'Pack_Regular_625mlx6und/ln': 4500,
  'Pack_Regular_625mlx15und/la': 3300,
  'Pack_Regular_625mlx15und/ln': 5000,
  'Pack_Alcalina_625mlx6und/la': 2800,
  'Pack_Alcalina_625mlx6und/ln': 4500,
  'Pack_Alcalina_625mlx15und/la': 3300,
  'Pack_Alcalina_625mlx15und/ln': 5000,
  'Pack_Alcalina(Y)_625mlx15und/la': 3300,
  'Pack_Alcalina(Y)_625mlx15und/ln': 5000,
  'Pack_Regular_1.5Lx6und': 2400,
  'Pack_Regular_SC_1Lx12und/la': 2400,
  'Pack_Regular_SC_1Lx12und/ln': 4500,
  'Pack_Alcalina_SC_1Lx6und/la': 2200,
  'Pack_Alcalina_SC_1Lx6und/ln': 4000,
  'Pack_Alcalina_SC_1Lx12und/la': 2400,
  'Pack_Alcalina_SC_1Lx12und/ln': 4500,
  'Pack_Alcalina_TP_1Lx6und/la': 2200,
  'Pack_Alcalina_TP_1Lx6und/ln': 4500,
  'Pack_Regular_2.5Lx6und': 1920,
  'Pack_Alcalina_2.5Lx6und': 1920,
  'Pack c/Sticker_Alcalina_2.5Lx6und': 1920,
  'Pack_Alcalina_380mlx24und/LN': 6000

};


/*
   RATIO FIJO (no depende de la presentación)

   B7L    = 600
   C20L   = 250
   B20L   = 55 (pendiente de confirmar; se mantiene el
            valor que ya existía en el sistema)
*/

const RATIO_FIJO_B7L = 600;
const RATIO_FIJO_C20L = 250;
const RATIO_FIJO_B20L = 55;

/*
   CASO ESPECIAL B7L:
   Fontlife en presentación de 10 Litros
   tiene un ratio nominal distinto al resto de B7L.
*/
const RATIO_FONTLIFE_10L = 85;


/* =========================================================
   PRESENTACIONES POR LÍNEA

   Para PET1 y PET2, las opciones del selector son
   exactamente las claves de la tabla de ratios de arriba,
   así el ratio siempre coincide con la presentación elegida.
   ========================================================= */

const PRESENTACIONES_POR_LINEA = {

  PET1: Object.keys(RATIOS_PRESENTACION_PET1),

  PET2: Object.keys(RATIOS_PRESENTACION_PET2),

  B7L: [
    '7 Litros',
    '10 Litros'
  ],

  C20L: [
    'Caja 20 Litros'
  ],

  B20L: [
    'Bidón 20 Litros'
  ]

};


/* =========================================================
   OBTENER RATIO NOMINAL SEGÚN LÍNEA Y PRESENTACIÓN
   ========================================================= */

function obtenerRatioNominal(linea, presentacion, marca){

  if(linea === 'PET1'){

    return RATIOS_PRESENTACION_PET1[presentacion] ?? 0;

  }

  if(linea === 'PET2'){

    return RATIOS_PRESENTACION_PET2[presentacion] ?? 0;

  }

  if(linea === 'B7L'){

    const m = normalizarTexto(marca);

    const p = normalizarTexto(presentacion);


    /*
       Caso especial: Fontlife en presentación
       de 10 Litros tiene ratio 85 (no el fijo
       de B7L).
    */

    if(
      m === 'fontlife' &&
      p.includes('10')
    ){

      return RATIO_FONTLIFE_10L;

    }


    return RATIO_FIJO_B7L;

  }

  if(linea === 'C20L'){

    return RATIO_FIJO_C20L;

  }

  if(linea === 'B20L'){

    return RATIO_FIJO_B20L;

  }

  return 0;

}


/* =========================================================
   LISTAS DE HIELO
   ========================================================= */

const MARCAS_HIELO = [
  'Bells',
  'Scala',
  'Glacial',
  'Listo',
  'Cuisine',
  'Tottus',
  'Aro',
  'Certificado',
  'Austral'
];


const PRESENTACIONES_HIELO = [
  '1.5 kg',
  '3 kg',
  '5 kg'
];


/* =========================================================
   PERSONAL
   ========================================================= */

const PERSONAL_POSICIONES = [
  'Sopladora',
  'Envasadora',
  'Etiquetadora',
  'Empaquetadora',
  'Apoyo Sopladora',
  'Revisión de tapas',
  'Pantallista',
  'Paletizado'
];


/* =========================================================
   CARGOS DE TRABAJADORES (BASE DE DATOS DE PERSONAL)
   ========================================================= */

const CARGOS_TRABAJADOR = [
  'Operario',
  'Operario Polivalente',
  'Supervisor',
  'Técnico de Mantenimiento',
  'Técnico de Calidad',
  'Almacenero',
  'Montacarguista',
  'Practicante',
  'Otro'
];


/* =========================================================
   MERMAS
   ========================================================= */

const MERMA_ITEMS = [
  'Botellas',
  'Preformas',
  'Tapa Plana',
  'Tapa Sport Cap',
  'Etiqueta',
  'Polietileno'
];


/* =========================================================
   PARADAS PROGRAMADAS (LISTA MAESTRA)
   ========================================================= */

const PARADAS_PROGRAMADAS = [
  'Charla de Ingreso Sup. Prod.',
  'Charla de Ingreso Sup. Calid.',
  'Refrigerio',
  'Limpieza de planta',
  'Inicio de turno (Encendido de Máquinas)',
  'Culminación de formato',
  'Llenado de Tanques',
  'Cambio de formato',
  'Cambio de cliente',
  'Reposición de insumos (Bobinas)',
  'Cierre de turno',
  'Encendido de máquinas'
];

