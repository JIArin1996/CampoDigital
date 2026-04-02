// ==========================================================
// Utils.gs — Helpers compartidos de Campo Digital
// Generación de IDs, respuestas JSON estandarizadas, acceso a hojas
// ==========================================================

/**
 * Obtiene una hoja del spreadsheet activo por nombre.
 * Lanza un error si la hoja no existe.
 * @param {string} nombre - Nombre de la hoja (ej: "establecimientos")
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getHoja(nombre) {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!hoja) {
    throw new Error('Hoja no encontrada: ' + nombre);
  }
  return hoja;
}

/**
 * Genera un ID único del tipo PREFIJO-NNN.
 * Recorre la hoja buscando el mayor correlativo existente y suma 1.
 * Los IDs nunca se reutilizan (monotónicamente crecientes).
 *
 * @param {string} prefijo - Prefijo del ID (ej: "EST", "POT", "MOV")
 * @param {string} nombreHoja - Nombre de la hoja donde se almacenan los registros
 * @returns {string} - Nuevo ID (ej: "EST-001")
 */
function generarId(prefijo, nombreHoja) {
  var hoja = getHoja(nombreHoja);
  var ultimaFila = hoja.getLastRow();

  // Si solo hay cabecera (fila 1) o la hoja está vacía, es el primer registro
  if (ultimaFila <= 1) {
    return prefijo + '-001';
  }

  // Busca todos los IDs existentes en la columna A (columna de IDs)
  var ids = hoja.getRange(2, 1, ultimaFila - 1, 1).getValues();
  var maxCorrelativo = 0;

  ids.forEach(function(fila) {
    var id = String(fila[0]);
    // Formato esperado: PREFIJO-NNN
    var partes = id.split('-');
    if (partes.length === 2 && partes[0] === prefijo) {
      var num = parseInt(partes[1], 10);
      if (!isNaN(num) && num > maxCorrelativo) {
        maxCorrelativo = num;
      }
    }
  });

  // Formatea el nuevo correlativo con ceros a la izquierda (mínimo 3 dígitos)
  var nuevoCorrelativo = maxCorrelativo + 1;
  var correlativoFormateado = String(nuevoCorrelativo).padStart(3, '0');
  return prefijo + '-' + correlativoFormateado;
}

/**
 * Construye una respuesta JSON de éxito.
 * @param {Object} data - Datos a devolver
 * @param {string} message - Mensaje descriptivo
 * @param {string} [id] - ID del registro creado (opcional)
 * @returns {Object}
 */
function respuestaOk(data, message, id) {
  var resp = {
    success: true,
    data: data || {},
    message: message || 'Operación exitosa'
  };
  if (id) resp.id = id;
  return resp;
}

/**
 * Construye una respuesta JSON de error.
 * @param {string} error - Mensaje de error
 * @param {string} [field] - Campo que causó el error (opcional)
 * @returns {Object}
 */
function respuestaError(error, field) {
  var resp = {
    success: false,
    error: error || 'Error desconocido'
  };
  if (field) resp.field = field;
  return resp;
}

/**
 * Serializa un objeto a JSON y lo envuelve en ContentService para Apps Script.
 * Siempre agrega cabeceras para permitir CORS desde el frontend.
 * @param {Object} objeto - Objeto a serializar
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonResponse(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Convierte un array de filas (de getValues()) en array de objetos,
 * usando la primera fila del rango como cabecera.
 * Útil para leer hojas completas de forma legible.
 *
 * @param {Array[]} cabeceras - Array con los nombres de columna
 * @param {Array[]} filas - Datos (sin la fila de cabecera)
 * @returns {Object[]}
 */
function filasAObjetos(cabeceras, filas) {
  return filas.map(function(fila) {
    var obj = {};
    cabeceras.forEach(function(col, i) {
      obj[col] = fila[i] !== undefined ? fila[i] : '';
    });
    return obj;
  });
}

/**
 * Devuelve la fecha actual en formato YYYY-MM-DD (zona horaria de Uruguay UTC-3).
 * @returns {string}
 */
function fechaHoy() {
  var ahora = new Date();
  // Apps Script trabaja en UTC; ajustamos a Uruguay (UTC-3)
  var uruguayOffset = -3 * 60;
  var localTime = new Date(ahora.getTime() + (uruguayOffset - ahora.getTimezoneOffset()) * 60000);
  var yyyy = localTime.getFullYear();
  var mm = String(localTime.getMonth() + 1).padStart(2, '0');
  var dd = String(localTime.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

/**
 * Valida que un string no sea nulo ni vacío.
 * @param {*} valor
 * @returns {boolean}
 */
function esRequerido(valor) {
  return valor !== null && valor !== undefined && String(valor).trim() !== '';
}

/**
 * Valida que un número sea mayor que cero.
 * @param {*} valor
 * @returns {boolean}
 */
function esMayorQueCero(valor) {
  var num = parseFloat(valor);
  return !isNaN(num) && num > 0;
}
