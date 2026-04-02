// ==========================================================
// Establecimientos.gs — Gestión de establecimientos y potreros
// CRUD con validaciones según modelo de datos de Campo Digital
// ==========================================================

// Cabeceras para la hoja "establecimientos" (deben coincidir con setup_sheets.gs)
var CABECERAS_ESTABLECIMIENTOS = [
  'id', 'nombre', 'departamento', 'localidad', 'superficie_total',
  'tipo', 'propietario', 'dicose', 'fecha_alta', 'estado', 'observaciones'
];

// Cabeceras para la hoja "potreros"
var CABECERAS_POTREROS = [
  'id', 'establecimiento_id', 'nombre', 'superficie', 'uso_actual',
  'tipo_pastura', 'aguada', 'estado', 'observaciones'
];

// Departamentos válidos de Uruguay
var DEPARTAMENTOS_VALIDOS = [
  'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno',
  'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo',
  'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto',
  'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres'
];

// ─────────────────────────────────────────────
// ESTABLECIMIENTOS
// ─────────────────────────────────────────────

/**
 * Crea un nuevo establecimiento en la hoja "establecimientos".
 * Valida campos obligatorios y reglas de negocio.
 *
 * @param {Object} datos - Datos recibidos del frontend
 * @returns {Object} - Respuesta estándar { success, data, message, id } o { success: false, error }
 */
function crearEstablecimiento(datos) {
  // — Validaciones que bloquean —

  if (!esRequerido(datos.nombre)) {
    return respuestaError('El nombre del establecimiento es obligatorio.', 'nombre');
  }
  if (!esRequerido(datos.departamento)) {
    return respuestaError('El departamento es obligatorio.', 'departamento');
  }
  if (DEPARTAMENTOS_VALIDOS.indexOf(datos.departamento) === -1) {
    return respuestaError('Departamento inválido: ' + datos.departamento, 'departamento');
  }
  if (!esMayorQueCero(datos.superficie_total)) {
    return respuestaError('La superficie total debe ser mayor que 0.', 'superficie_total');
  }
  if (!esRequerido(datos.tipo)) {
    return respuestaError('El tipo de establecimiento es obligatorio.', 'tipo');
  }

  // — Nombre único por establecimiento —
  var hoja = getHoja('establecimientos');
  var existe = buscarEstablecimientoPorNombre(datos.nombre);
  if (existe) {
    return respuestaError('Ya existe un establecimiento con el nombre "' + datos.nombre + '".', 'nombre');
  }

  // — Advertencia DICOSE (no bloquea, solo se registra en observaciones si está mal formateado) —
  var advertencias = [];
  if (datos.dicose && !/^\d{2}\.\d{3}\.\d{3}$/.test(String(datos.dicose).trim())) {
    advertencias.push('El formato de DICOSE no es válido (se esperaba XX.XXX.XXX). Se guardó de todas formas.');
  }

  // — Generación de ID —
  var nuevoId = generarId('EST', 'establecimientos');

  // — Escritura en la hoja —
  var fila = [
    nuevoId,
    String(datos.nombre).trim(),
    datos.departamento,
    datos.localidad || '',
    parseFloat(datos.superficie_total),
    datos.tipo,
    datos.propietario || '',
    datos.dicose || '',
    datos.fecha_alta || fechaHoy(),
    'activo',
    datos.observaciones || ''
  ];

  hoja.appendRow(fila);

  var mensaje = 'Establecimiento creado correctamente.';
  if (advertencias.length > 0) mensaje += ' Advertencias: ' + advertencias.join(' ');

  return respuestaOk(
    { id: nuevoId, nombre: datos.nombre },
    mensaje,
    nuevoId
  );
}

/**
 * Obtiene uno o todos los establecimientos activos.
 *
 * @param {string} [establecimiento_id] - Si se provee, filtra por ID
 * @returns {Object} - Respuesta estándar con array de establecimientos
 */
function getEstablecimiento(establecimiento_id) {
  var hoja = getHoja('establecimientos');
  var ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return respuestaOk([], 'No hay establecimientos registrados');
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, CABECERAS_ESTABLECIMIENTOS.length).getValues();
  var registros = filasAObjetos(CABECERAS_ESTABLECIMIENTOS, datos);

  // Filtra inactivos
  registros = registros.filter(function(r) { return r.estado === 'activo'; });

  if (establecimiento_id) {
    registros = registros.filter(function(r) { return r.id === establecimiento_id; });
    if (registros.length === 0) {
      return respuestaError('Establecimiento no encontrado: ' + establecimiento_id);
    }
    return respuestaOk(registros[0], 'Establecimiento encontrado');
  }

  return respuestaOk(registros, registros.length + ' establecimiento(s) encontrado(s)');
}

/**
 * Busca un establecimiento por nombre (case-insensitive).
 * Devuelve el objeto si existe, null si no.
 * @param {string} nombre
 * @returns {Object|null}
 */
function buscarEstablecimientoPorNombre(nombre) {
  var hoja = getHoja('establecimientos');
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return null;

  var datos = hoja.getRange(2, 1, ultimaFila - 1, CABECERAS_ESTABLECIMIENTOS.length).getValues();
  var nombreBuscado = String(nombre).trim().toLowerCase();

  for (var i = 0; i < datos.length; i++) {
    var nombreFila = String(datos[i][1]).trim().toLowerCase();
    var estado = datos[i][9]; // columna "estado"
    if (nombreFila === nombreBuscado && estado === 'activo') {
      return filasAObjetos(CABECERAS_ESTABLECIMIENTOS, [datos[i]])[0];
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// POTREROS
// ─────────────────────────────────────────────

/**
 * Crea un nuevo potrero vinculado a un establecimiento.
 *
 * @param {Object} datos - Datos recibidos del frontend
 * @returns {Object} - Respuesta estándar
 */
function crearPotrero(datos) {
  // — Validaciones que bloquean —

  if (!esRequerido(datos.establecimiento_id)) {
    return respuestaError('El establecimiento_id es obligatorio.', 'establecimiento_id');
  }
  if (!esRequerido(datos.nombre)) {
    return respuestaError('El nombre del potrero es obligatorio.', 'nombre');
  }
  if (!esMayorQueCero(datos.superficie)) {
    return respuestaError('La superficie del potrero debe ser mayor que 0.', 'superficie');
  }
  if (!esRequerido(datos.uso_actual)) {
    return respuestaError('El uso actual del potrero es obligatorio.', 'uso_actual');
  }

  // — Verificar que el establecimiento existe y está activo —
  var estResp = getEstablecimiento(datos.establecimiento_id);
  if (!estResp.success) {
    return respuestaError('El establecimiento especificado no existe o está inactivo.', 'establecimiento_id');
  }
  var establecimiento = estResp.data;

  // — Advertencia: suma de superficies de potreros vs total del establecimiento —
  var superficieUsada = calcularSuperficiePotreros(datos.establecimiento_id);
  var nuevaSuperficie = parseFloat(datos.superficie);
  if (superficieUsada + nuevaSuperficie > parseFloat(establecimiento.superficie_total)) {
    // Advertencia no bloqueante: se registra pero se guarda igual
    Logger.log('ADVERTENCIA: La suma de potreros (' + (superficieUsada + nuevaSuperficie) +
      ' ha) supera la superficie total del establecimiento (' + establecimiento.superficie_total + ' ha).');
  }

  // — Generación de ID —
  var nuevoId = generarId('POT', 'potreros');

  // — Escritura en la hoja —
  var hoja = getHoja('potreros');
  var fila = [
    nuevoId,
    datos.establecimiento_id,
    String(datos.nombre).trim(),
    nuevaSuperficie,
    datos.uso_actual,
    datos.tipo_pastura || '',
    datos.aguada || '',
    'activo',
    datos.observaciones || ''
  ];

  hoja.appendRow(fila);

  return respuestaOk(
    { id: nuevoId, nombre: datos.nombre, establecimiento_id: datos.establecimiento_id },
    'Potrero creado correctamente.',
    nuevoId
  );
}

/**
 * Obtiene todos los potreros activos de un establecimiento.
 *
 * @param {string} establecimiento_id - ID del establecimiento
 * @returns {Object} - Respuesta estándar con array de potreros
 */
function getPotreros(establecimiento_id) {
  var hoja = getHoja('potreros');
  var ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return respuestaOk([], 'No hay potreros registrados');
  }

  var datos = hoja.getRange(2, 1, ultimaFila - 1, CABECERAS_POTREROS.length).getValues();
  var registros = filasAObjetos(CABECERAS_POTREROS, datos);

  // Filtra por establecimiento y activos
  registros = registros.filter(function(r) {
    var mismoEstablecimiento = !establecimiento_id || r.establecimiento_id === establecimiento_id;
    return mismoEstablecimiento && r.estado === 'activo';
  });

  return respuestaOk(registros, registros.length + ' potrero(s) encontrado(s)');
}

/**
 * Calcula la superficie total de los potreros activos de un establecimiento.
 * Usado para la advertencia de superficie excedida.
 *
 * @param {string} establecimiento_id
 * @returns {number} - Superficie total en hectáreas
 */
function calcularSuperficiePotreros(establecimiento_id) {
  var hoja = getHoja('potreros');
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return 0;

  var datos = hoja.getRange(2, 1, ultimaFila - 1, CABECERAS_POTREROS.length).getValues();
  var total = 0;

  datos.forEach(function(fila) {
    // establecimiento_id está en columna B (índice 1), superficie en D (índice 3), estado en H (índice 7)
    if (String(fila[1]) === establecimiento_id && String(fila[7]) === 'activo') {
      total += parseFloat(fila[3]) || 0;
    }
  });

  return total;
}
