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
              allow read, write: if doc in ['users', 'records', 'workers', 'rotaciones', 'rotacionesMantenimiento', 'rotacionMaquinistas', 'tecnicosMant', 'borradoresNuevoRegistro', 'tareos', 'precios', 'paletas', 'programaciones', 'avancesTurno'];
            }
            match /auditoriaTareos/{evento} {
              allow read, create: if true;
              allow update, delete: if false;
            }
            match /{document=**} {
              allow read, write: if false;
            }
          }
        }

      Para activar la auditoría, publicar también la regla
      /auditoriaTareos/{evento} mostrada arriba. Esta regla solo
      bloquea edición/borrado de eventos; sin Firebase Authentication
      no puede verificar quién escribió un evento ni restringir su
      lectura a RRHH. La identidad/rol del navegador no es seguridad.

      ⚠⚠ ACCIÓN REQUERIDA AHORA (20260922, actualizado): la
      regla que hay publicada hoy en la consola de Firebase
      todavía dice "if doc in ['users', 'records', 'workers']"
      — SIN 'rotaciones', 'tareos', 'precios', 'paletas' NI
      'programaciones' (este último es nuevo: lo usa el módulo
      "Paletas" para guardar la CANTIDAD PROGRAMADA de cada
      combinación línea+fecha+turno+marca+presentación, contra
      la cual se compara lo registrado en 'paletas' —
      16-paletas.js). Eso es exactamente lo que causaba que el
      Excel de rotación semanal y los tareos creados en Tareo
      "se borraran" al abrir el sistema desde otra computadora
      o celular: Firestore rechazaba en silencio cualquier
      intento de guardar esos dos documentos (el navegador que
      los creó los mostraba igual, porque los guarda primero en
      memoria, pero nunca llegaban de verdad a la nube, así que
      ningún otro equipo — ni ese mismo tras recargar la página —
      podía verlos). Si no se agrega 'paletas' y 'programaciones'
      a esta regla, pasará exactamente lo mismo: se verán en la
      computadora que los creó, pero desaparecerán al recargar o
      al abrir el sistema desde otro equipo.

      Copiar y pegar la regla de arriba en el código NO alcanza:
      hay que ir a Firebase Console > Firestore Database > Reglas,
      reemplazar la regla publicada por la de arriba (agregando
      'rotaciones', 'tareos', 'precios', 'paletas' y
      'programaciones') y hacer clic en "Publicar". Es un cambio
      de una sola vez.

      ⚠ SEGURIDAD (parche intermedio, 20260912): esta regla
      solo limita las reglas a los documentos que usa la
      app (users/records/workers/rotaciones/tareos) — sigue
      sin exigir haber iniciado sesión, porque el sistema
      todavía no usa Firebase Authentication. Mientras tanto,
      las contraseñas YA se guardan con hash + salt (nunca en
      texto plano), y se recomienda activar Firebase App Check
      (App Check > reCAPTCHA v3) y luego "Enforce" para
      Firestore, para que solo esta página pueda leer/escribir
      estos documentos. La solución definitiva a futuro es
      migrar el login a Firebase Authentication.

   4. Ve a Configuración del proyecto (ícono de engranaje) >
      "Tus apps" > icono web (</>) > registra la app.
   5. Copia el objeto "firebaseConfig" que te muestra y
      pégalo reemplazando el de abajo.
*/

/* =========================================================
   ENTORNOS: PRODUCCION y PRUEBAS (se elige solo, y falla hacia el lado seguro)
   - PRODUCCION únicamente si el dominio de la página está en
     DOMINIOS_PRODUCCION (lista explícita).
   - CUALQUIER otra dirección usa PRUEBAS: localhost, 127.0.0.1, file://,
     IPs de red local (192.168.x.x, 10.x.x.x, 172.16-31.x.x), otros dominios.
   - En PRUEBAS: Google Sheets queda desactivado (SHEETS_URL y SHEETS_CLAVE
     vacías) y se ve una franja roja "BASE DE PRUEBAS" en toda la app.
   Los datos de cada entorno viven en proyectos de Firebase distintos y nunca
   se mezclan. Si un dominio nuevo no está en la lista, la app abre en
   PRUEBAS (se nota por la franja roja) en vez de tocar los datos de planta.
   ========================================================= */

/* Solo el NOMBRE del dominio (sin https:// ni ruta). Hoy la app está publicada en
   GitHub Pages: https://felixgrabiel.github.io/glacial1/
   → AGREGAR AQUÍ el dominio propio cuando exista (por ejemplo 'glacial.miempresa.com'). */
const DOMINIOS_PRODUCCION = [
  'felixgrabiel.github.io'
];

const CONFIG_PRUEBAS = {
  apiKey: "AIzaSyDu-PrKL0Zacynobn_iLc7EVFIiC7Rk96A",
  authDomain: "pruebas-b11b7.firebaseapp.com",
  projectId: "pruebas-b11b7",
  storageBucket: "pruebas-b11b7.firebasestorage.app",
  messagingSenderId: "492367398973",
  appId: "1:492367398973:web:80bbe223b737cba90cc254",
  measurementId: "G-409QMFQT53"
};

const ENTORNO_PRUEBAS = !DOMINIOS_PRODUCCION
  .includes(String(window.location.hostname || '').trim().toLowerCase());

const ENTORNO = ENTORNO_PRUEBAS ? 'PRUEBAS' : 'PRODUCCION';

const CONFIG_PRODUCCION = {
  apiKey: "AIzaSyAO86_KLoblDvHq-65q2xbD53-zj_L0tUY",
  authDomain: "jefaturaopglacial-fdb95.firebaseapp.com",
  projectId: "jefaturaopglacial-fdb95",
  storageBucket: "jefaturaopglacial-fdb95.firebasestorage.app",
  messagingSenderId: "949615984456",
  appId: "1:949615984456:web:6664bb183ee09930ad3d7d"
};

const FIREBASE_CONFIG = ENTORNO_PRUEBAS ? CONFIG_PRUEBAS : CONFIG_PRODUCCION;

firebase.initializeApp(FIREBASE_CONFIG);

/* Qué proyecto se está usando (visible en la consola del navegador). */
console.info(
  '%cGLACIAL · entorno: ' + ENTORNO + ' · proyecto Firebase: ' + FIREBASE_CONFIG.projectId +
  ' · página: ' + window.location.origin,
  'font-weight:bold;padding:2px 8px;border-radius:4px;color:#fff;background:' +
  (ENTORNO_PRUEBAS ? '#c62828' : '#1b6e3a')
);

/* Franja roja fija en toda la app cuando se usa la base de PRUEBAS. */
if (ENTORNO_PRUEBAS) {
  const pintarFranjaPruebas = () => {
    if (document.getElementById('franja-entorno')) return;
    const franja = document.createElement('div');
    franja.id = 'franja-entorno';
    franja.textContent = 'BASE DE PRUEBAS · ' + FIREBASE_CONFIG.projectId + ' · no son datos de planta';
    franja.style.cssText =
      'position:fixed;top:0;left:0;right:0;height:22px;line-height:22px;z-index:2147483000;' +
      'background:#c62828;color:#fff;text-align:center;font:700 12px/22px system-ui,Arial,sans-serif;' +
      'letter-spacing:.06em;pointer-events:none;';
    document.body.appendChild(franja);
    document.body.style.paddingTop = '22px';
    document.body.classList.add('entorno-pruebas');
    document.title = '[PRUEBAS] ' + document.title;
  };
  if (document.body) pintarFranjaPruebas();
  else document.addEventListener('DOMContentLoaded', pintarFranjaPruebas);
}

const db = firebase.firestore();
const storage = firebase.storage();

/* =========================================================
   FIREBASE AUTHENTICATION (SEGURIDAD) — ver js/36-seguridad-auth.js
   =========================================================
   - Cada usuario tiene una cuenta real de Firebase Authentication.
     El "usuario" de siempre se convierte en un correo interno:
     usuario@AUTH_DOMINIO (no necesita ser un correo real).
   - La sesión dura mientras la pestaña esté abierta (como antes).
   - LOGIN_LEGACY_PERMITIDO: mientras haya usuarios que todavía no se
     migraron, pueden entrar con su contraseña anterior. Cuando todos
     estén migrados, cámbialo a false.
   Requiere habilitar "Correo electrónico/contraseña" en la consola de
   Firebase (Authentication > Método de acceso).
   ========================================================= */

const AUTH_DOMINIO = 'glacial.app';

const LOGIN_LEGACY_PERMITIDO = true;

/* ETAPA 2: true = la lectura de datos exige sesión (reglas estrictas, ver
   firestore.rules.etapa2.txt). Mantener false hasta publicar esas reglas. */
const REGLAS_ESTRICTAS = false;

const auth = (typeof firebase.auth === 'function') ? firebase.auth() : null;

if (auth) {
  auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => {});
}

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
    'Cuisine',
    'Fontlife'
     
  ],

  PET2: [
    'Bells_Gas',
    'Bells_Manzana',
    'Bells_Maracuya',
    'Bells_Piña_Kion',
    'Scala_Gas',
    'Bells',
    'Scala',
    'scala_Manzana',
    'Scala_Maracuya',
    'Scala_Piña_Kion',
    'Cuisine',
    'Cuisine_Gas',
    'Glacial',
    'Aro',
    'San Jorgue',
    'Yaqua Farmacias',
    'Cuisine',
    'Merkat',
    'Fontlife'
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

  // ! IMPORTANTE: las presentaciones de agua se muestran como REGULAR.
  'Pack_Regular_2.5Lx6und': 1920,
  'Pack c/Sticker_Regular_2.5Lx6und': 1920,
  'Pack_Regular_SC_1Lx12und/lN': 2400

};

const RATIOS_PRESENTACION_PET2 = {

  // ! IMPORTANTE: PET2 ya no expone presentaciones con la palabra ALCALINA.
  // * Los formatos equivalentes quedan centralizados bajo la denominación REGULAR.
  'Pack_Regular_380mlx24und/la': 3300,
  'Pack_Regular_380mlx24und/ln': 6000,
  'Pack_Regular_625mlx6und/la': 3300,
  'Pack_Regular_625mlx6und/ln': 4500,
  'Pack_Regular_625mlx15und/la': 3300,
  'Pack_Regular_625mlx15und/ln': 5000,
  'Pack_Regular_1.5Lx6und': 2400,
  'Pack_Regular_SC_1Lx6und/la': 2200,
  'Pack_Regular_SC_1Lx6und/ln': 4000,
  'Pack_Regular_SC_1Lx12und/la': 2400,
  'Pack_Regular_SC_1Lx12und/ln': 4500,
  'Pack_Regular_TP_1Lx6und/la': 2200,
  'Pack_Regular_TP_1Lx6und/ln': 4500,
  'Pack_Regular_2.5Lx6und': 1920,
  'Pack c/Sticker_Regular_2.5Lx6und': 1920

};

// * Compatibilidad con registros históricos guardados con la denominación anterior.
// ? Esto evita modificar o borrar registros ya existentes en Firestore.
function normalizarPresentacionRegular(presentacion){

  return String(presentacion || '')
    .replace(/Alcalina\(Y\)/gi, 'Regular')
    .replace(/Alcalina/gi, 'Regular');

}


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

    return RATIOS_PRESENTACION_PET1[normalizarPresentacionRegular(presentacion)] ?? 0;

  }

  if(linea === 'PET2'){

    return RATIOS_PRESENTACION_PET2[normalizarPresentacionRegular(presentacion)] ?? 0;

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
   =========================================================

   Cada línea tiene su propio set de posiciones/estaciones de
   trabajo, en el orden en que deben aparecer en la tabla de
   "Personal del turno". Cuando una posición se repite (p.ej.
   "Paletizado" dos o tres veces) es porque hay más de una
   persona asignada a esa misma estación en esa línea.

   Usa posicionesPersonalLinea(lineKey) para obtenerlas — cae
   en PERSONAL_POSICIONES (genérico) si la línea no está en
   este mapa (por ejemplo, una línea nueva que todavía no se
   ha configurado aquí).
   ========================================================= */

const PERSONAL_POSICIONES_POR_LINEA = {

  PET1: [
    'Sopladora',
    'Envasadora',
    'Etiquetadora',
    'Empaquetadora',
    'Apoyo Sopladora',
    'Revisión de tapas',
    'Pantallista',
    'Paletizado',
    'Paletizado'
  ],

  PET2: [
    'Sopladora',
    'Envasadora',
    'Etiquetadora',
    'Empaquetadora',
    'Apoyo Sopladora',
    'Revisión de tapas',
    'Pantallista',
    'Paletizado',
    'Paletizado'
  ],

  B7L: [
    'Sopladora 1',
    'Sopladora 2',
    'Rinser',
    'Envasadora',
    'Tapado',
    'Pase de Bidones',
    'Etiquetado 1',
    'Etiquetado 2',
    'Empaquetadora',
    'Paletizado',
    'Paletizado',
    'Paletizado'
  ],

  C20L: [
    'Armado de Cajas',
    'Pegado de Cajas Armadas',
    'Envasadora 1',
    'Envasadora 2',
    'Recepción de bolsas',
    'Pegado de Cajas con Bolsas',
    'Empaquetadora',
    'Paletizado',
    'Paletizado'
  ],

  B20L: [
    'Lavado Primario',
    'Lavado Secundario',
    'Envasadora',
    'Paletizado',
    'Paletizado'
  ]

};

/*
   Lista genérica de respaldo (fallback), por si en el futuro
   se agrega una línea que todavía no tiene sus posiciones
   definidas arriba.
*/
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

function posicionesPersonalLinea(lineKey){

  return (
    PERSONAL_POSICIONES_POR_LINEA[lineKey] ||
    PERSONAL_POSICIONES
  );

}


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


/*
   COMPONENTES DE MERMA POR LÍNEA

   B7L tiene sus propios componentes (distintos a los de
   PET1/PET2): Bidones, Preformas, Tapa, Asa, Etiqueta y
   Polietileno 54cm. Las líneas que no aparecen aquí siguen
   usando la lista genérica (MERMA_ITEMS) de arriba.
*/

const MERMA_ITEMS_POR_LINEA = {

  B7L: [
    'Bidones',
    'Preformas',
    'Tapa',
    'Asa',
    'Etiqueta',
    'Polietileno 48cm'
  ],

  /*
     C20L (Caja 20 Litros): solo estos 4 componentes de
     merma, según lo indicado — antes usaba por error la
     lista genérica de PET (Botellas, Preformas, Tapa Plana,
     Tapa Sport Cap, Etiqueta, Polietileno), que no aplica a
     esta línea.
  */
  C20L: [
    'Cajas',
    'Bolsas Trilaminadas',
    'Tapa',
    'Polietileno 54 cm'
  ]

};


function obtenerItemsMerma(linea){

  return MERMA_ITEMS_POR_LINEA[linea] || MERMA_ITEMS;

}


/*
   DIVISORES DE CONVERSIÓN DE MERMA (peso en kg -> unidades)
   =========================================================

   ÚNICO lugar donde se define, por línea y componente, el
   número usado para convertir el peso ingresado (en kg) a
   unidades de merma. Si cambia el peso unitario de algún
   componente (por ejemplo, si la Tapa de B7L ya no pesa
   4.72 g), este es el único valor que hay que actualizar
   — 06-registro.js ya no repite estos números en ningún
   otro lado, los toma de aquí.

   Formas de definir cada componente:

   - Un número → fórmula estándar:
       unidades = round((peso × 1000) / número)

   - La palabra 'gramajePreforma' → el divisor no es fijo,
     es el gramaje de la preforma que se ingresa a mano en
     el cuadro de producción (Botellas/Preformas de PET).

   - Un objeto { divisor, sinMultiplicarPor1000, decimales }
     → para componentes cuyo peso ya viene expresado en la
     unidad que se necesita (ej. Polietileno, que se pesa en
     rollos de ~28 kg y no hay que multiplicar por 1000).
*/

const MERMA_DIVISORES_POR_LINEA = {

  PET1: {

    'Botellas':
      'gramajePreforma',

    'Preformas':
      'gramajePreforma',

    'Tapa Plana':
      1.34,

    'Tapa Sport Cap':
    
      1.34,

    'Etiqueta':
      { divisor: 0.00064, sinMultiplicarPor1000: true },

    'Polietileno':
      { divisor: 28, sinMultiplicarPor1000: true, decimales: 2 }

  },

  B7L: {

    'Bidones':
      90,

    'Preformas':
      90,

    'Tapa':
      4.72,

    'Asa':
      6.6,

    'Etiqueta':
      2.9,

    'Polietileno 48cm':
      { divisor: 28, sinMultiplicarPor1000: true, decimales: 2 }

  }

};

/* PET2 usa exactamente las mismas fórmulas que PET1. */
MERMA_DIVISORES_POR_LINEA.PET2 =
  MERMA_DIVISORES_POR_LINEA.PET1;


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


/* =========================================================
   INTEGRACIÓN CON GOOGLE SHEETS (Apps Script) — LLENAR AQUÍ
   =========================================================
   SHEETS_URL   : URL de la aplicación web de Apps Script (termina en /exec).
   SHEETS_CLAVE : clave que el script verifica antes de escribir.
   Vacías = el envío a Google Sheets queda desactivado (el resto del
   sistema funciona igual). Ver js/34-integraciones.js.
   ========================================================= */

// En PRUEBAS quedan vacías: nada se escribe en la hoja real.
const SHEETS_URL = ENTORNO_PRUEBAS
  ? ''
  : 'https://script.google.com/macros/s/AKfycbxyG6ylq9N20W_svlnZB9-zk5a-KaLSEPcAFamRTLjmMwcV9FxUa8LN4-AoclqhTYo1/exec';

const SHEETS_CLAVE = ENTORNO_PRUEBAS ? '' : 'jefatura_glacial2626';


/* =========================================================
   CATÁLOGO DE MOTIVOS DE PARADA CON DURACIÓN ESTÁNDAR
   (CONFIGURABLE — editar aquí)
   =========================================================

   Lo usan los botones PAUSA PROGRAMADA / DETENER LÍNEA de Producción
   Actual y el cálculo central de tiempos (23b-tiempos-linea.js).

   estandarMin > 0 : el EXCESO sobre esa duración se cuenta como parada
                     NO programada (ej.: refrigerio de 75 min = 60
                     programada + 15 no programada).
   estandarMin = 0 : sin duración estándar; todo cuenta como programada.
   ========================================================= */

const CATALOGO_MOTIVOS_PARADA = {

  programadas: [
    { nombre:'Recepción de personal', estandarMin:10 },
    { nombre:'Habilitación',          estandarMin:5  },
    { nombre:'Orden y limpieza',      estandarMin:10 },
    { nombre:'Refrigerio',            estandarMin:60 }
  ],

  noProgramadas: [
    'Falta de paletas',
    'Falla de máquina',
    'Falta de insumos',
    'Falta de personal',
    'Calidad / producto no conforme',
    'Otro'
  ]

};

/* Lista completa de programadas: las del catálogo + las ya existentes (sin estándar). */
function listaMotivosProgramados(){

  const nombres = new Set(CATALOGO_MOTIVOS_PARADA.programadas.map(m => m.nombre));

  return [
    ...CATALOGO_MOTIVOS_PARADA.programadas,
    ...PARADAS_PROGRAMADAS
      .filter(nombre => !nombres.has(nombre))
      .map(nombre => ({ nombre, estandarMin:0 }))
  ];
}

function normalizarMotivoParada(texto){
  return String(texto || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/* Duración estándar (min) de un motivo programado; 0 si no tiene. */
function estandarMotivoParada(nombre){

  const clave = normalizarMotivoParada(nombre);

  const m = listaMotivosProgramados()
    .find(item => normalizarMotivoParada(item.nombre) === clave);

  return m ? Number(m.estandarMin) || 0 : 0;
}


/* =========================================================
   CAUSA DE LA PARADA NO PROGRAMADA (LISTA MAESTRA)
   =========================================================

   Solo aplica a "Paradas no programadas" (las programadas ya
   son siempre administrativas: charlas, refrigerio, limpieza,
   cambios de formato, etc., así que no necesitan causa).

   Se agrega esta clasificación porque graficos/Excel la usan
   para desglosar minutos de parada por motivo. El reporte
   "Impacto Económico" (15-perdidas-soles.js) YA NO depende de
   este campo: desde el 20260922 valoriza en dinero TODAS las
   paradas no programadas, agrupándolas por la máquina/área que
   detecta en el texto de la descripción (Etiquetadora,
   Empaquetadora, Sopladora, Envasadora, Calidad, Producción),
   sin importar la "Causa" que tengan asignada aquí.

   Los registros guardados ANTES de este cambio no tienen
   "causa" en sus paradas no programadas, pero eso ya no importa
   para Impacto Económico: como ahora agrupa por texto de la
   descripción (no por este campo), esas paradas antiguas SÍ se
   cuentan en el total de soles — solo caen en "Otros / sin
   clasificar" si su descripción no menciona ninguna máquina
   conocida (se avisa esto en la propia pantalla).
   ========================================================= */

const CAUSAS_PARADA_NO_PROGRAMADA = [
  'Falla de máquina',
  'Falta de insumos',
  'Falta de personal',
  'Calidad / producto no conforme',
  'Otro'
];


/* =========================================================
   PRECIO UNITARIO POR LÍNEA (PARA VALORIZAR IMPACTO ECONÓMICO)
   =========================================================

   Precio de venta aproximado, en soles, de UNA unidad
   producida en cada línea (botella/bidón/caja/etc., según
   corresponda). Se usa SOLO para convertir a dinero las
   unidades que se dejaron de producir por paradas de máquina
   (15-perdidas-soles.js) — no afecta ningún cálculo de OEE.

   Estos son los valores INICIALES indicados por jefatura
   (dentro de los rangos que dieron):
     PET (PET1/PET2)........ S/ 1.00
     B7L (Bidón 7L)......... S/ 1.00 a S/ 2.00 -> se deja en 1.50
     C20L (Caja 20L)........ S/ 1.00 a S/ 9.00 -> se deja en 5.00
     B20L (Bidón 20L)....... no indicado -> se deja en 1.00
     Hielo (a futuro)........ S/ 0.00 a S/ 1.00 -> se deja en 0.50

   Un Administrador puede ajustar estos valores desde la
   pestaña "Impacto Económico" (quedan guardados en Firestore,
   documento sync/precios, y se sincronizan en tiempo real
   igual que usuarios/reportes/trabajadores).
   ========================================================= */

const PRECIOS_UNITARIOS_DEFAULT = {
  PET1: 1.00,
  PET2: 1.00,
  B7L: 1.50,
  C20L: 5.00,
  B20L: 1.00,

  /*
     HIELO no es una línea de LINES (todavía no existe el
     "Reporte Hielo", ver goReporteHielo en 03-auth.js) — se
     deja el precio ya cargado para cuando se implemente, pero
     hoy no se usa en ningún cálculo.
  */
  HIELO: 0.50
};
