// ==========================================================
// Code.gs — Router principal de Campo Digital
// Entry points: doGet() y doPost()
// Todos los endpoints pasan por aquí y se rutean por "action"
// ==========================================================

/**
 * Maneja todas las peticiones GET (lectura de datos).
 * Parámetro de ruteo: ?action=nombre_de_accion
 *
 * Acciones disponibles:
 *   get_parametros      → Parámetros dinámicos para los selects
 *   get_establecimiento → Datos de un establecimiento (o todos)
 *   get_potreros        → Potreros de un establecimiento
 *   get_movimientos     → Últimos N movimientos con filtros opcionales
 *   get_stock           → Stock actual por categoría
 *   get_stock_potrero   → Stock actual por potrero
 *
 * @param {Object} e - Evento de Apps Script con parámetros de URL
 * @returns {GoogleAppsScript.Content.TextOutput} - JSON
 */
function doGet(e) {
  try {
    var action = e.parameter.action;

    if (!action) {
      return jsonResponse(respuestaError('Parámetro "action" requerido.'));
    }

    var resultado;

    switch (action) {

      case 'get_parametros':
        resultado = getParametros();
        break;

      case 'get_establecimiento':
        resultado = getEstablecimiento(e.parameter.establecimiento_id || null);
        break;

      case 'get_potreros':
        resultado = getPotreros(e.parameter.establecimiento_id || null);
        break;

      case 'get_movimientos':
        resultado = getMovimientos({
          establecimiento_id: e.parameter.establecimiento_id || null,
          limit:              e.parameter.limit || 20,
          tipo:               e.parameter.tipo || null,
          categoria:          e.parameter.categoria || null
        });
        break;

      case 'get_stock':
        resultado = getStock(e.parameter.establecimiento_id);
        break;

      case 'get_stock_potrero':
        resultado = getStockPorPotrero(e.parameter.establecimiento_id);
        break;

      default:
        resultado = respuestaError('Acción no reconocida: ' + action);
    }

    return jsonResponse(resultado);

  } catch (err) {
    // Error inesperado: lo logueamos y devolvemos un error genérico
    Logger.log('ERROR en doGet: ' + err.message + '\n' + err.stack);
    return jsonResponse(respuestaError('Error interno del servidor: ' + err.message));
  }
}

/**
 * Maneja todas las peticiones POST (escritura de datos).
 * El body debe ser un JSON con al menos el campo "action".
 *
 * Importante: Apps Script no soporta Content-Type: application/json desde
 * clientes web. El frontend debe enviar Content-Type: text/plain y el body
 * como string JSON. Aquí se parsea con JSON.parse(e.postData.contents).
 *
 * Acciones disponibles:
 *   crear_establecimiento → Alta de establecimiento
 *   crear_potrero         → Alta de potrero vinculado a un establecimiento
 *   crear_movimiento      → Registro de movimiento ganadero
 *   desactivar_registro   → Baja lógica (estado = inactivo)
 *
 * @param {Object} e - Evento de Apps Script con postData
 * @returns {GoogleAppsScript.Content.TextOutput} - JSON
 */
function doPost(e) {
  try {
    // Parsear el body (viene como text/plain)
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse(respuestaError('El body no es un JSON válido.'));
    }

    var action = body.action;
    if (!action) {
      return jsonResponse(respuestaError('Campo "action" requerido en el body.'));
    }

    var resultado;

    switch (action) {

      case 'crear_establecimiento':
        resultado = crearEstablecimiento(body);
        break;

      case 'crear_potrero':
        resultado = crearPotrero(body);
        break;

      case 'crear_movimiento':
        resultado = crearMovimiento(body);
        break;

      case 'desactivar_registro':
        resultado = desactivarRegistro(body);
        break;

      default:
        resultado = respuestaError('Acción no reconocida: ' + action);
    }

    return jsonResponse(resultado);

  } catch (err) {
    Logger.log('ERROR en doPost: ' + err.message + '\n' + err.stack);
    return jsonResponse(respuestaError('Error interno del servidor: ' + err.message));
  }
}

/**
 * Baja lógica genérica: setea estado = "inactivo" en el registro indicado.
 * Nunca borra filas. La historia se preserve siempre.
 *
 * @param {Object} datos - { hoja, id }
 * @returns {Object} - Respuesta estándar
 */
function desactivarRegistro(datos) {
  if (!esRequerido(datos.hoja)) {
    return respuestaError('El campo "hoja" es obligatorio.', 'hoja');
  }
  if (!esRequerido(datos.id)) {
    return respuestaError('El campo "id" es obligatorio.', 'id');
  }

  var hoja = getHoja(datos.hoja);
  var ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return respuestaError('No se encontró el registro ' + datos.id);
  }

  // Busca el ID en la columna A
  var ids = hoja.getRange(2, 1, ultimaFila - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(datos.id)) {
      // Fila en la hoja = i + 2 (por el offset de cabecera)
      var filaHoja = i + 2;

      // Busca la columna "estado" en la fila 1
      var cabeceras = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
      var colEstado = cabeceras.indexOf('estado') + 1; // +1 porque Sheets es 1-indexed

      if (colEstado < 1) {
        return respuestaError('La hoja "' + datos.hoja + '" no tiene columna "estado".');
      }

      hoja.getRange(filaHoja, colEstado).setValue('inactivo');
      return respuestaOk({ id: datos.id, hoja: datos.hoja }, 'Registro desactivado correctamente.', datos.id);
    }
  }

  return respuestaError('Registro no encontrado: ' + datos.id);
}
