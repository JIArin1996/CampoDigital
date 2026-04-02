// ==========================================================
// Stock.gs — Gestión de movimientos ganaderos y stock
// Registra movimientos y calcula el stock actual por categoría
// ==========================================================

// Cabeceras de la hoja "movimientos_ganado"
var CABECERAS_MOVIMIENTOS = [
  'id', 'establecimiento_id', 'fecha', 'tipo_movimiento', 'categoria',
  'cantidad', 'peso_promedio', 'potrero_origen', 'potrero_destino',
  'precio_unitario', 'precio_total', 'comprador_vendedor', 'observaciones'
];

// Tipos de movimiento que reducen el stock
var TIPOS_QUE_RESTAN = ['Venta', 'Muerte'];

// Tipos de movimiento que suman al stock
var TIPOS_QUE_SUMAN = ['Compra', 'Nacimiento'];

// Tipos válidos de movimiento
var TIPOS_MOVIMIENTO_VALIDOS = ['Compra', 'Venta', 'Nacimiento', 'Muerte', 'Traslado', 'Ajuste'];

// ─────────────────────────────────────────────
// MOVIMIENTOS
// ─────────────────────────────────────────────

/**
 * Registra un nuevo movimiento ganadero.
 * Aplica todas las validaciones del modelo de datos.
 *
 * @param {Object} datos - Datos del movimiento recibidos del frontend
 * @returns {Object} - Respuesta estándar
 */
function crearMovimiento(datos) {
  // — Validaciones que bloquean —

  if (!esRequerido(datos.establecimiento_id)) {
    return respuestaError('El establecimiento_id es obligatorio.', 'establecimiento_id');
  }
  if (!esRequerido(datos.fecha)) {
    return respuestaError('La fecha del movimiento es obligatoria.', 'fecha');
  }
  if (!esRequerido(datos.tipo_movimiento)) {
    return respuestaError('El tipo de movimiento es obligatorio.', 'tipo_movimiento');
  }
  if (TIPOS_MOVIMIENTO_VALIDOS.indexOf(datos.tipo_movimiento) === -1) {
    return respuestaError('Tipo de movimiento inválido: ' + datos.tipo_movimiento, 'tipo_movimiento');
  }
  if (!esRequerido(datos.categoria)) {
    return respuestaError('La categoría ganadera es obligatoria.', 'categoria');
  }
  if (!esMayorQueCero(datos.cantidad)) {
    return respuestaError('La cantidad debe ser mayor que 0.', 'cantidad');
  }

  // — Traslado requiere origen Y destino —
  if (datos.tipo_movimiento === 'Traslado') {
    if (!esRequerido(datos.potrero_origen)) {
      return respuestaError('El traslado requiere especificar el potrero de origen.', 'potrero_origen');
    }
    if (!esRequerido(datos.potrero_destino)) {
      return respuestaError('El traslado requiere especificar el potrero de destino.', 'potrero_destino');
    }
    if (datos.potrero_origen === datos.potrero_destino) {
      return respuestaError('El potrero de origen y destino no pueden ser el mismo.', 'potrero_destino');
    }
  }

  // — Verificar que el establecimiento existe —
  var estResp = getEstablecimiento(datos.establecimiento_id);
  if (!estResp.success) {
    return respuestaError('El establecimiento especificado no existe o está inactivo.', 'establecimiento_id');
  }

  // — Advertencia: fecha futura (no bloquea) —
  var fechaMovimiento = new Date(datos.fecha);
  var hoy = new Date(fechaHoy());
  if (fechaMovimiento > hoy) {
    Logger.log('ADVERTENCIA: La fecha del movimiento (' + datos.fecha + ') es futura.');
  }

  // — Generación de ID —
  var nuevoId = generarId('MOV', 'movimientos_ganado');

  // — Escritura en la hoja —
  var hoja = getHoja('movimientos_ganado');
  var fila = [
    nuevoId,
    datos.establecimiento_id,
    datos.fecha,
    datos.tipo_movimiento,
    datos.categoria,
    parseInt(datos.cantidad, 10),
    datos.peso_promedio ? parseFloat(datos.peso_promedio) : '',
    datos.potrero_origen || '',
    datos.potrero_destino || '',
    datos.precio_unitario ? parseFloat(datos.precio_unitario) : '',
    datos.precio_total ? parseFloat(datos.precio_total) : '',
    datos.comprador_vendedor || '',
    datos.observaciones || ''
  ];

  hoja.appendRow(fila);

  return respuestaOk(
    { id: nuevoId, tipo_movimiento: datos.tipo_movimiento, categoria: datos.categoria, cantidad: datos.cantidad },
    'Movimiento registrado correctamente.',
    nuevoId
  );
}

/**
 * Lee los últimos N movimientos de un establecimiento.
 * Permite filtrar por tipo_movimiento y/o categoría.
 *
 * @param {Object} params
 * @param {string} params.establecimiento_id
 * @param {number} [params.limit=20] - Máximo de registros a devolver
 * @param {string} [params.tipo] - Filtro por tipo_movimiento
 * @param {string} [params.categoria] - Filtro por categoría
 * @returns {Object} - Respuesta estándar con array de movimientos
 */
function getMovimientos(params) {
  var hoja = getHoja('movimientos_ganado');
  var ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return respuestaOk([], 'No hay movimientos registrados');
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, CABECERAS_MOVIMIENTOS.length).getValues();
  var registros = filasAObjetos(CABECERAS_MOVIMIENTOS, datos);

  // Filtros opcionales
  if (params.establecimiento_id) {
    registros = registros.filter(function(r) {
      return r.establecimiento_id === params.establecimiento_id;
    });
  }
  if (params.tipo) {
    registros = registros.filter(function(r) {
      return r.tipo_movimiento === params.tipo;
    });
  }
  if (params.categoria) {
    registros = registros.filter(function(r) {
      return r.categoria === params.categoria;
    });
  }

  // Ordena por fecha descendente (más recientes primero)
  registros.sort(function(a, b) {
    return new Date(b.fecha) - new Date(a.fecha);
  });

  // Limita resultados
  var limite = params.limit ? parseInt(params.limit, 10) : 20;
  registros = registros.slice(0, limite);

  return respuestaOk(registros, registros.length + ' movimiento(s) encontrado(s)');
}

// ─────────────────────────────────────────────
// STOCK ACTUAL
// ─────────────────────────────────────────────

/**
 * Calcula el stock actual por categoría para un establecimiento.
 * El stock se deriva sumando/restando todos los movimientos.
 *
 * Lógica:
 *   - Compra / Nacimiento / Ajuste positivo → suma
 *   - Venta / Muerte / Ajuste negativo → resta
 *   - Traslado → neutro para el stock total (cambia de potrero, no el total)
 *
 * @param {string} establecimiento_id
 * @returns {Object} - Respuesta estándar con { categoria: cantidad }
 */
function getStock(establecimiento_id) {
  if (!esRequerido(establecimiento_id)) {
    return respuestaError('El establecimiento_id es obligatorio.', 'establecimiento_id');
  }

  var hoja = getHoja('movimientos_ganado');
  var ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return respuestaOk({}, 'Sin movimientos. Stock inicial = 0.');
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, CABECERAS_MOVIMIENTOS.length).getValues();
  var registros = filasAObjetos(CABECERAS_MOVIMIENTOS, datos);

  // Solo movimientos del establecimiento solicitado
  registros = registros.filter(function(r) {
    return r.establecimiento_id === establecimiento_id;
  });

  // Acumula el stock por categoría
  var stock = {};
  registros.forEach(function(mov) {
    var cat = mov.categoria;
    var cantidad = parseInt(mov.cantidad, 10) || 0;
    var tipo = mov.tipo_movimiento;

    if (!stock[cat]) stock[cat] = 0;

    if (TIPOS_QUE_SUMAN.indexOf(tipo) !== -1) {
      stock[cat] += cantidad;
    } else if (TIPOS_QUE_RESTAN.indexOf(tipo) !== -1) {
      stock[cat] -= cantidad;
    } else if (tipo === 'Ajuste') {
      // El ajuste puede ser positivo o negativo (el operador ingresa la cantidad con signo)
      stock[cat] += cantidad;
    }
    // Traslado no afecta el stock total por categoría
  });

  // Elimina categorías con stock 0 (opcional: mostrar solo las que tienen animales)
  // Dejamos todas para transparencia del historial
  var totalCabezas = Object.values(stock).reduce(function(acc, v) { return acc + v; }, 0);

  return respuestaOk(
    { por_categoria: stock, total_cabezas: totalCabezas },
    'Stock calculado correctamente para ' + establecimiento_id
  );
}

/**
 * Calcula el stock por potrero (suma de movimientos con potrero_destino).
 * Útil para saber cuántos animales hay en cada potrero.
 *
 * @param {string} establecimiento_id
 * @returns {Object} - Respuesta estándar con { potrero_id: { categoria: cantidad } }
 */
function getStockPorPotrero(establecimiento_id) {
  if (!esRequerido(establecimiento_id)) {
    return respuestaError('El establecimiento_id es obligatorio.', 'establecimiento_id');
  }

  var hoja = getHoja('movimientos_ganado');
  var ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return respuestaOk({}, 'Sin movimientos registrados.');
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, CABECERAS_MOVIMIENTOS.length).getValues();
  var registros = filasAObjetos(CABECERAS_MOVIMIENTOS, datos);
  registros = registros.filter(function(r) { return r.establecimiento_id === establecimiento_id; });

  var stockPorPotrero = {};

  registros.forEach(function(mov) {
    var cantidad = parseInt(mov.cantidad, 10) || 0;
    var tipo = mov.tipo_movimiento;

    // Para stock por potrero, consideramos el destino como el lugar actual
    if (mov.potrero_destino) {
      var pot = mov.potrero_destino;
      if (!stockPorPotrero[pot]) stockPorPotrero[pot] = {};
      if (!stockPorPotrero[pot][mov.categoria]) stockPorPotrero[pot][mov.categoria] = 0;

      if (TIPOS_QUE_SUMAN.indexOf(tipo) !== -1 || tipo === 'Traslado') {
        stockPorPotrero[pot][mov.categoria] += cantidad;
      }
    }

    // Si es traslado, también restamos del origen
    if (tipo === 'Traslado' && mov.potrero_origen) {
      var potOrigen = mov.potrero_origen;
      if (!stockPorPotrero[potOrigen]) stockPorPotrero[potOrigen] = {};
      if (!stockPorPotrero[potOrigen][mov.categoria]) stockPorPotrero[potOrigen][mov.categoria] = 0;
      stockPorPotrero[potOrigen][mov.categoria] -= cantidad;
    }
  });

  return respuestaOk(stockPorPotrero, 'Stock por potrero calculado correctamente');
}
