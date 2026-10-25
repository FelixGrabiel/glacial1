/**
 * GLACIAL · Control de proceso en el envasado (CF - CA - F - 047) → Google Sheets
 * ---------------------------------------------------------------------------------
 * Aplicación web de Google Apps Script que corre con TU cuenta de Google (sirve para cuentas personales).
 * La llama la función de Supabase «control-proceso-drive» con los cuadros del mes; este script
 *   1) crea el libro del mes en tu carpeta de Drive (si no existe) y una hoja por marca con el formato del formulario;
 *   2) busca cada fila por su CLAVE (columna R, oculta): si existe la actualiza, si no la agrega. Nunca duplica;
 *   3) escribe SOLO las columnas de GLACIAL (A, E, G, H, I, K, M, O, P, Q y R). Nunca toca MAN, LAV, LLEN, CIERRE, CONF ni ROTUL
 *      (B, C, D, F, J, L, N): lo que planta anote ahí se respeta.
 * Un cuadro que desaparece del reporte NO borra su fila: se vacían las columnas de GLACIAL y se conserva la clave (y lo que planta anotó).
 *
 * PUESTA EN MARCHA (una sola vez): ver docs/asistente/control-proceso-drive.md, sección «Conectar con Drive».
 *   · Propiedades del script (Configuración del proyecto › Propiedades del script):
 *       GLACIAL_SECRETO  = una clave larga que inventas (mínimo 24 caracteres); la misma va en Supabase (APPS_SCRIPT_SECRETO).
 *       CARPETA_ID       = el id de la carpeta de Drive donde irán los libros (lo que sigue a /folders/ en su dirección).
 *   · Implementar › Nueva implementación › Aplicación web · Ejecutar como: Yo · Quién tiene acceso: Cualquier persona.
 *     (La seguridad es la clave GLACIAL_SECRETO: sin ella el script no hace nada.)
 */

/* Columnas que GLACIAL escribe (1 = A). El resto de la fila es de planta. */
var COL_LOTE = 1, COL_PREFORMA = 5, COL_SOPLADO = 7, COL_ENVASADO = 8, COL_TAPA = 9, COL_ETIQUETA = 11, COL_ASA = 13, COL_EMPAQUETADO = 15, COL_FECHA = 16, COL_TURNO = 17, COL_CLAVE = 18;
var COLUMNAS_GLACIAL = [COL_LOTE, COL_PREFORMA, COL_SOPLADO, COL_ENVASADO, COL_TAPA, COL_ETIQUETA, COL_ASA, COL_EMPAQUETADO, COL_FECHA, COL_TURNO, COL_CLAVE];
var PRIMERA_FILA = 9;
var FILAS_INICIALES = 22;
var ANCHOS = [12.89, 5.33, 5.33, 5.33, 13, 6.89, 7.89, 8, 11.55, 6.11, 9, 6.89, 9.44, 6.89, 9.89, 11.89, 10.66, 14];
var ENCABEZADOS = ['LOTE PROD', 'MAN', 'LAV', 'LLEN', 'L.PREFORMA', 'CIERRE', 'CANT', 'CANT', 'L. TAPA', 'CONF', 'LOTE ', 'ROTUL', 'LOTE ASA', 'CONF', 'CANT', 'FECHA', 'TURNO', 'CLAVE GLACIAL'];
var GRUPOS = [['B7:G7', 'SOPLADO '], ['H7:J7', 'ENVASADO '], ['K7:L7', 'ETIQUETADO'], ['M7:O7', 'EMPAQUETADO']];
var MIN_SECRETO = 24;

function doGet() {
  return respuesta_({ ok: true, servicio: 'glacial-control-proceso' });
}

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var esperado = props.getProperty('GLACIAL_SECRETO') || '';
    if (esperado.length < MIN_SECRETO) return respuesta_({ ok: false, codigo: 'sin_configurar', error: 'Falta GLACIAL_SECRETO (mínimo ' + MIN_SECRETO + ' caracteres).' });
    var cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '');
    if (!iguales_(String(cuerpo && cuerpo.secreto || ''), esperado)) return respuesta_({ ok: false, codigo: 'secreto', error: 'Secreto no válido.' });
    var carpetaId = props.getProperty('CARPETA_ID') || '';
    if (!carpetaId) return respuesta_({ ok: false, codigo: 'sin_configurar', error: 'Falta CARPETA_ID.' });
    var error = validar_(cuerpo);
    if (error) return respuesta_({ ok: false, codigo: 'formato', error: error });
    var cerrojo = LockService.getScriptLock();
    cerrojo.waitLock(30000);
    try {
      return respuesta_(sincronizar_(cuerpo, carpetaId));
    } finally {
      cerrojo.releaseLock();
    }
  } catch (err) {
    return respuesta_({ ok: false, codigo: 'interno', error: String(err && err.message || err) });
  }
}

/* ---------- utilidades ---------- */
function respuesta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
/** Comparación en tiempo constante. */
function iguales_(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function validar_(c) {
  if (!c || typeof c !== 'object') return 'Cuerpo no válido.';
  if (!c.libro || typeof c.libro.nombre !== 'string' || !/^[\w .\-()]{3,120}$/.test(c.libro.nombre)) return 'Nombre de libro no válido.';
  if (!Array.isArray(c.hojas) || c.hojas.length > 40) return 'Lista de hojas no válida.';
  for (var i = 0; i < c.hojas.length; i++) {
    var h = c.hojas[i];
    if (!h || typeof h.nombre !== 'string' || !h.nombre || h.nombre.length > 31 || /[\\\/?*\[\]:]/.test(h.nombre)) return 'Nombre de hoja no válido: ' + (h && h.nombre);
    if (!Array.isArray(h.filas) || h.filas.length > 3000) return 'Filas no válidas en ' + h.nombre;
    for (var j = 0; j < h.filas.length; j++) if (!h.filas[j] || typeof h.filas[j].clave !== 'string' || !h.filas[j].clave) return 'Fila sin clave en ' + h.nombre;
  }
  return '';
}
function fechaDe_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
}

/* ---------- libro y hojas ---------- */
function obtenerLibro_(nombre, carpetaId) {
  var carpeta = DriveApp.getFolderById(carpetaId);
  var existentes = carpeta.getFilesByName(nombre);
  if (existentes.hasNext()) return { libro: SpreadsheetApp.open(existentes.next()), nuevo: false };
  var libro = SpreadsheetApp.create(nombre);
  DriveApp.getFileById(libro.getId()).moveTo(carpeta);
  return { libro: libro, nuevo: true };
}

function crearHoja_(libro, h, meta) {
  var hoja = libro.insertSheet(h.nombre);
  for (var i = 0; i < ANCHOS.length; i++) hoja.setColumnWidth(i + 1, Math.round(ANCHOS[i] * 7 + 5));
  hoja.hideColumns(COL_CLAVE);
  hoja.setRowHeights(1, 3, 34);                                                  // el título (2 líneas) y el logo necesitan alto: con el alto por defecto se cortaban
  hoja.getRange('B1:J3').merge().setValue(meta.titulo).setFontSize(24).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  hoja.getRange('K1:O3').merge().setValue(meta.codigo).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  hoja.getRange('B1:J3').setBorder(true, true, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  hoja.getRange('K1:O3').setBorder(true, true, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  hoja.getRange('B5:C5').merge().setValue('PRODUCTO:').setFontWeight('bold').setHorizontalAlignment('center');
  hoja.getRange('E5:F5').merge().setValue(h.marca || h.nombre).setFontWeight('bold').setHorizontalAlignment('center');
  hoja.getRange('I5:K5').merge().setValue('PRESENTACION:').setFontWeight('bold').setHorizontalAlignment('center');
  hoja.getRange('L5').setValue(h.presentacion || '').setFontWeight('bold');
  hoja.getRange('D5:H5').setBorder(null, null, true, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  hoja.getRange('L5:O5').setBorder(null, null, true, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  for (var g = 0; g < GRUPOS.length; g++) {
    hoja.getRange(GRUPOS[g][0]).merge().setValue(GRUPOS[g][1]).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true, true, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
  hoja.getRange(8, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]).setFontWeight('bold').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  hoja.getRange(PRIMERA_FILA, 1, FILAS_INICIALES, 17).setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  hoja.getRange(PRIMERA_FILA, COL_FECHA, FILAS_INICIALES, 1).setNumberFormat('dd/mm/yyyy');
  hoja.setFrozenRows(8);
  hoja.setHiddenGridlines(true);
  if (meta.logo) {
    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(meta.logo), 'image/png', 'glacial.png');
      var img = hoja.insertImage(blob, 2, 2);
      img.setWidth(73).setHeight(46);
    } catch (e) { hoja.getRange('A1').setNote('No se pudo poner el logo: ' + String(e && e.message || e).slice(0, 200)); }   // sin logo el formulario igual funciona; la nota dice por qué
  }
  return hoja;
}

/**
 * Escribe las filas de una hoja. Lee el bloque A:R una sola vez, cambia en memoria SOLO las columnas de GLACIAL y lo vuelve a escribir:
 * las columnas de planta salen con el mismo valor que tenían.
 */
function escribirHoja_(hoja, filas) {
  var ultima = Math.max(hoja.getLastRow(), PRIMERA_FILA + FILAS_INICIALES - 1);
  var alto = ultima - PRIMERA_FILA + 1;
  var bloque = hoja.getRange(PRIMERA_FILA, 1, alto, COL_CLAVE).getValues();
  var filaDe = {}, ultimaConClave = PRIMERA_FILA - 1;
  for (var i = 0; i < bloque.length; i++) {
    var k = String(bloque[i][COL_CLAVE - 1] || '');
    if (k) { filaDe[k] = i; ultimaConClave = PRIMERA_FILA + i; }
  }
  var vistas = {}, creadas = 0, actualizadas = 0, vaciadas = 0, i2, c;
  for (var n = 0; n < filas.length; n++) {
    var f = filas[n], idx = filaDe[f.clave];
    if (idx === undefined) {                                      // fila nueva: debajo de la última con clave
      ultimaConClave++;
      idx = ultimaConClave - PRIMERA_FILA;
      while (bloque.length <= idx) bloque.push(new Array(COL_CLAVE).fill(''));
      filaDe[f.clave] = idx;
      creadas++;
    } else actualizadas++;
    vistas[f.clave] = true;
    var r = bloque[idx];
    r[COL_LOTE - 1] = f.lotePT || '';
    r[COL_PREFORMA - 1] = f.preforma || '';
    r[COL_SOPLADO - 1] = f.soplado || '';
    r[COL_ENVASADO - 1] = f.envasado || '';
    r[COL_TAPA - 1] = f.tapa || '';
    r[COL_ETIQUETA - 1] = f.etiqueta || '';
    r[COL_ASA - 1] = f.asa || '';
    r[COL_EMPAQUETADO - 1] = f.empaquetado || '';
    r[COL_FECHA - 1] = fechaDe_(f.fecha);
    r[COL_TURNO - 1] = f.turno || '';
    r[COL_CLAVE - 1] = f.clave;
  }
  for (var clave in filaDe) {                                     // cuadros que ya no están: se vacía lo de GLACIAL, se conserva la clave y lo de planta
    if (vistas[clave]) continue;
    var fila = bloque[filaDe[clave]], tenia = false;
    for (c = 0; c < COLUMNAS_GLACIAL.length; c++) {
      var col = COLUMNAS_GLACIAL[c];
      if (col === COL_CLAVE) continue;
      if (fila[col - 1] !== '' && fila[col - 1] !== null) { tenia = true; fila[col - 1] = ''; }
    }
    if (tenia) vaciadas++;
  }
  var destino = hoja.getRange(PRIMERA_FILA, 1, bloque.length, COL_CLAVE);
  destino.setValues(bloque);
  if (bloque.length > FILAS_INICIALES) hoja.getRange(PRIMERA_FILA + FILAS_INICIALES, 1, bloque.length - FILAS_INICIALES, 17).setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  hoja.getRange(PRIMERA_FILA, COL_FECHA, bloque.length, 1).setNumberFormat('dd/mm/yyyy');
  hoja.getRange(PRIMERA_FILA, COL_SOPLADO, bloque.length, 2).setNumberFormat('#,##0');
  hoja.getRange(PRIMERA_FILA, COL_EMPAQUETADO, bloque.length, 1).setNumberFormat('#,##0');
  return { nombre: hoja.getName(), creadas: creadas, actualizadas: actualizadas, vaciadas: vaciadas };
}

function sincronizar_(cuerpo, carpetaId) {
  var abierto = obtenerLibro_(cuerpo.libro.nombre, carpetaId), libro = abierto.libro;
  var meta = { titulo: (cuerpo.formulario && cuerpo.formulario.titulo) || 'CONTROL DE PORCESO EN EL ENVASADO', codigo: (cuerpo.formulario && cuerpo.formulario.codigo) || 'CF - CA - F - 047', logo: cuerpo.logo || '' };
  var resultado = [], hojasNuevas = [];
  for (var v = 0; v < cuerpo.hojas.length; v++) {                 // ANTES de escribir nada: una hoja que ya existe pero no la creó GLACIAL (p. ej. el libro llenado a mano) no se toca
    var previa = libro.getSheetByName(cuerpo.hojas[v].nombre);
    if (previa && String(previa.getRange(8, COL_CLAVE).getValue()) !== ENCABEZADOS[COL_CLAVE - 1]) {
      return { ok: false, codigo: 'hoja_ajena', error: 'La hoja «' + cuerpo.hojas[v].nombre + '» del libro «' + cuerpo.libro.nombre + '» ya existe y no fue creada por GLACIAL: no se modifica. Cambia el nombre del libro o de la hoja.' };
    }
  }
  for (var i = 0; i < cuerpo.hojas.length; i++) {
    var h = cuerpo.hojas[i], hoja = libro.getSheetByName(h.nombre);
    if (!hoja) { hoja = crearHoja_(libro, h, meta); hojasNuevas.push(h.nombre); }
    resultado.push(escribirHoja_(hoja, h.filas));
  }
  var enviadas = {};
  for (var q = 0; q < cuerpo.hojas.length; q++) enviadas[cuerpo.hojas[q].nombre] = true;
  var todas = libro.getSheets();                                  // hojas de GLACIAL que ya no reciben filas (la marca desapareció del mes): se vacían sus columnas
  for (var t = 0; t < todas.length; t++) {
    if (enviadas[todas[t].getName()]) continue;
    if (String(todas[t].getRange(8, COL_CLAVE).getValue()) !== ENCABEZADOS[COL_CLAVE - 1]) continue;
    resultado.push(escribirHoja_(todas[t], []));
  }
  if (abierto.nuevo && hojasNuevas.length) {                      // el libro recién creado trae una «Hoja 1» vacía
    var sobrante = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
    if (sobrante && libro.getSheets().length > 1) libro.deleteSheet(sobrante);
  }
  return { ok: true, libro: { id: libro.getId(), url: libro.getUrl(), nombre: libro.getName(), nuevo: abierto.nuevo }, hojas: resultado };
}
