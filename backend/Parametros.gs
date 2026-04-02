// ==========================================================
// Parametros.gs — Lectura de la hoja de parámetros
// Los selects del frontend se alimentan de aquí dinámicamente
// ==========================================================

/**
 * Lee la hoja "parametros" y devuelve un objeto con la forma:
 * {
 *   categorias_ganado: ["Ternero", "Ternera", ...],
 *   departamentos: ["Artigas", "Canelones", ...],
 *   ...
 * }
 *
 * La hoja "parametros" tiene 3 columnas: clave | valores | descripcion
 * Los valores son una cadena separada por comas.
 *
 * @returns {Object} - Mapa clave → array de valores
 */
function getParametros() {
  var hoja = getHoja('parametros');
  var ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return respuestaError('La hoja de parámetros está vacía. Ejecutá setupSheets() primero.');
  }

  // Lee desde fila 2 (saltea cabecera): columnas A (clave), B (valores)
  var datos = hoja.getRange(2, 1, ultimaFila - 1, 2).getValues();
  var parametros = {};

  datos.forEach(function(fila) {
    var clave = String(fila[0]).trim();
    var valoresStr = String(fila[1]).trim();

    if (clave && valoresStr) {
      // Separa por coma y limpia espacios
      parametros[clave] = valoresStr.split(',').map(function(v) {
        return v.trim();
      }).filter(function(v) {
        return v.length > 0;
      });
    }
  });

  return respuestaOk(parametros, 'Parámetros cargados correctamente');
}
