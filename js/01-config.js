/* =============================================================
   CONFIGURACIÓN Y LISTAS MAESTRAS (Firebase, líneas, marcas, ratios)
   Parte del sistema GLACIAL — dividido a partir de app.js
   ============================================================= */

/* VERSION: usuarios-puestos-permisos-v2-20260912 */
/* =========================================================
   CONFIGURACIÓN DE FIREBASE (BASE DE DATOS EN LA NUBE)
   =========================================================

   Esto es lo que permite que los datos (usuarios, reportes
   y trabajadores) se vean EN TIEMPO REAL en cualquier
   computadora, y no solo en la que los registró.

   PASOS PARA ACTIVARLO (una sola vez):

   1. Ve a https://console.firebase.google.com y crea un
      proyecto gratuito (plan "Spark").
   2. Dentro del proyecto: Compilación > Firestore Database >
      Crear base de datos (modo producción, la región más
      cercana, ej. "southamerica-east1").
   3. En Firestore > Reglas, pega:

        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /sync/{doc} {
              allow read, write: if doc in ['users', 'records', 'workers'];
            }
            match /{document=**} {
              allow read, write: if false;
            }
          }
        }

      ⚠ SEGURIDAD (parche intermedio, 20260912): esta regla
      solo limita las reglas a los 3 documentos que usa la
      app (users/records/workers) — sigue sin exigir haber
      iniciado sesión, porque el sistema todavía no usa
      Firebase Authentication. Mientras tanto, las contraseñas
      YA se guardan con hash + salt (nunca en texto plano), y
      se recomienda activar Firebase App Check (App Check >
      reCAPTCHA v3) y luego "Enforce" para Firestore, para que
      solo esta página pueda leer/escribir estos documentos.
      La solución definitiva a futuro es migrar el login a
      Firebase Authentication.

   4. Ve a Configuración del proyecto (ícono de engranaje) >
      "Tus apps" > icono web (</>) > registra la app.
   5. Copia el objeto "firebaseConfig" que te muestra y
      pégalo reemplazando el de abajo.
*/

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
const storage = firebase.storage();


/* =========================================================
   FIREBASE APP CHECK (OPCIONAL, RECOMENDADO)
   =========================================================

   Restringe el acceso a Firestore para que solo esta página
   web pueda usarlo (bloquea scripts o herramientas externas
   que intenten conectarse directo con la configuración de
   arriba). No sustituye un login real, pero reduce mucho el
   riesgo mientras se migra a Firebase Authentication.

   CÓMO ACTIVARLO:
   1. En la consola de Firebase: App Check > Apps > registra
      esta app web > proveedor "reCAPTCHA v3" > copia la
      "Site key" que te entrega.
   2. Agrega este script en index.html, ANTES de este archivo:
        <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-check-compat.js"></script>
   3. Reemplaza 'TU_SITE_KEY_DE_RECAPTCHA_V3' abajo por la
      Site key del paso 1, y descomenta las líneas.
   4. Prueba el sistema normalmente unos días con la app
      registrada (en modo "no forzado").
   5. Cuando confirmes que todo funciona bien, en la consola:
      App Check > Firestore > "Aplicar" (Enforce). Desde ese
      momento, Firestore rechazará cualquier lectura/escritura
      que no venga de esta página.
*/

// firebase.appCheck().activate(
//   'TU_SITE_KEY_DE_RECAPTCHA_V3',
//   true // refresca el token automáticamente
// );


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