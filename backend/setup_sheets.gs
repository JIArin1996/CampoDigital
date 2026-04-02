// ==========================================================
// setup_sheets.gs — Inicialización del spreadsheet
// EJECUTAR UNA SOLA VEZ al crear el proyecto.
// Crea todas las hojas con sus cabeceras y puebla los parámetros.
// ==========================================================

/**
 * Función principal de inicialización.
 * Ejecutar desde el editor de Apps Script: Ejecutar → setupSheets()
 *
 * Qué hace:
 *   1. Crea las hojas: establecimientos, potreros, movimientos_ganado, parametros
 *   2. Escribe las cabeceras en cada hoja
 *   3. Pobla la hoja "parametros" con todos los valores del modelo de datos
 *   4. Da formato visual a las cabeceras (negrita, color de fondo)
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('=== Iniciando setup de Campo Digital ===');

  // Definición de hojas y sus cabeceras
  var hojas = [
    {
      nombre: 'establecimientos',
      cabeceras: [
        'id', 'nombre', 'departamento', 'localidad', 'superficie_total',
        'tipo', 'propietario', 'dicose', 'fecha_alta', 'estado', 'observaciones'
      ]
    },
    {
      nombre: 'potreros',
      cabeceras: [
        'id', 'establecimiento_id', 'nombre', 'superficie', 'uso_actual',
        'tipo_pastura', 'aguada', 'estado', 'observaciones'
      ]
    },
    {
      nombre: 'movimientos_ganado',
      cabeceras: [
        'id', 'establecimiento_id', 'fecha', 'tipo_movimiento', 'categoria',
        'cantidad', 'peso_promedio', 'potrero_origen', 'potrero_destino',
        'precio_unitario', 'precio_total', 'comprador_vendedor', 'observaciones'
      ]
    },
    {
      nombre: 'parametros',
      cabeceras: ['clave', 'valores', 'descripcion']
    }
  ];

  // ——————————————————————————————————————————
  // 1. Crear hojas y escribir cabeceras
  // ——————————————————————————————————————————
  hojas.forEach(function(def) {
    var hoja = ss.getSheetByName(def.nombre);

    if (!hoja) {
      hoja = ss.insertSheet(def.nombre);
      Logger.log('✓ Hoja creada: ' + def.nombre);
    } else {
      Logger.log('~ Hoja ya existe: ' + def.nombre + ' (se respetan los datos existentes)');
    }

    // Solo escribe cabeceras si la primera fila está vacía
    var primeraFila = hoja.getRange(1, 1, 1, def.cabeceras.length).getValues()[0];
    var estaVacia = primeraFila.every(function(c) { return c === '' || c === null; });

    if (estaVacia) {
      hoja.getRange(1, 1, 1, def.cabeceras.length).setValues([def.cabeceras]);
      Logger.log('  → Cabeceras escritas: ' + def.cabeceras.join(', '));
    } else {
      Logger.log('  → Cabeceras ya presentes, no se sobreescriben.');
    }

    // Formato visual: cabeceras en negrita con fondo verde oscuro y texto blanco
    var rangoCabeceras = hoja.getRange(1, 1, 1, def.cabeceras.length);
    rangoCabeceras.setFontWeight('bold');
    rangoCabeceras.setBackground('#1a7f4b');
    rangoCabeceras.setFontColor('#ffffff');

    // Congelar la primera fila para que las cabeceras queden fijas al hacer scroll
    hoja.setFrozenRows(1);

    // Ajustar ancho de columnas automáticamente
    hoja.autoResizeColumns(1, def.cabeceras.length);
  });

  // ——————————————————————————————————————————
  // 2. Poblar hoja de parámetros
  // ——————————————————————————————————————————
  poblarParametros(ss);

  // ——————————————————————————————————————————
  // 3. Eliminar la hoja por defecto "Hoja 1" si existe y está vacía
  // ——————————————————————————————————————————
  var hojaDefault = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hojaDefault && ss.getSheets().length > 1) {
    ss.deleteSheet(hojaDefault);
    Logger.log('~ Hoja por defecto eliminada.');
  }

  Logger.log('=== Setup completado correctamente ===');
  Logger.log('Hojas creadas: ' + ss.getSheets().map(function(h) { return h.getName(); }).join(', '));
}

/**
 * Pobla la hoja "parametros" con todos los valores del modelo de datos.
 * Si los parámetros ya existen, los sobreescribe para mantener consistencia.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 */
function poblarParametros(ss) {
  var hoja = ss.getSheetByName('parametros');
  if (!hoja) {
    Logger.log('ERROR: La hoja "parametros" no existe. Ejecutá setupSheets() completo primero.');
    return;
  }

  // Definición completa de parámetros según 02-MODELO-DE-DATOS.md
  var parametros = [
    {
      clave: 'categorias_ganado',
      valores: 'Ternero, Ternera, Novillo 1-2, Novillo +2, Vaquillona 1-2, Vaquillona +2, Vaca de cría, Vaca de invernada, Toro, Torito',
      descripcion: 'Categorías ganaderas estándar Uruguay'
    },
    {
      clave: 'departamentos',
      valores: 'Artigas, Canelones, Cerro Largo, Colonia, Durazno, Flores, Florida, Lavalleja, Maldonado, Montevideo, Paysandú, Río Negro, Rivera, Rocha, Salto, San José, Soriano, Tacuarembó, Treinta y Tres',
      descripcion: 'Los 19 departamentos de Uruguay'
    },
    {
      clave: 'tipos_movimiento',
      valores: 'Compra, Venta, Nacimiento, Muerte, Traslado, Ajuste',
      descripcion: 'Tipos de movimiento ganadero'
    },
    {
      clave: 'tipos_establecimiento',
      valores: 'Ganadero, Agrícola, Mixto',
      descripcion: 'Tipo de actividad del establecimiento'
    },
    {
      clave: 'usos_potrero',
      valores: 'Ganadería, Agricultura, Reserva, Sin uso',
      descripcion: 'Uso actual del potrero'
    },
    {
      clave: 'tipos_pastura',
      valores: 'Campo natural, Pradera, Verdeo, Rastrojo, Mejoramiento',
      descripcion: 'Tipo de pastura del potrero'
    },
    {
      clave: 'aguada',
      valores: 'Sí, No',
      descripcion: 'Presencia de aguada en el potrero'
    },
    {
      clave: 'tipos_labor',
      valores: 'Siembra, Fertilización, Herbicida, Insecticida, Fungicida, Cosecha, Laboreo, Otro',
      descripcion: 'Tipos de labor agrícola'
    },
    {
      clave: 'cultivos',
      valores: 'Soja, Trigo, Cebada, Maíz, Sorgo, Arroz, Girasol, Pradera, Verdeo invierno, Verdeo verano, Otro',
      descripcion: 'Cultivos principales Uruguay'
    },
    {
      clave: 'rubros_ingreso',
      valores: 'Venta de ganado, Venta de granos, Pastoreo, Arrendamiento, Otros ingresos',
      descripcion: 'Rubros de ingreso financiero'
    },
    {
      clave: 'rubros_egreso',
      valores: 'Compra de ganado, Insumos agrícolas, Veterinaria, Alimentación, Maquinaria, Personal, Fletes, Impuestos, Arrendamiento, Otros egresos',
      descripcion: 'Rubros de egreso financiero'
    },
    {
      clave: 'estados_lote',
      valores: 'En curso, Cosechado, Perdido',
      descripcion: 'Estados de un lote agrícola'
    },
    {
      clave: 'formas_pago',
      valores: 'Efectivo, Transferencia, Cheque, Crédito',
      descripcion: 'Formas de pago para finanzas'
    }
  ];

  // Limpia las filas de datos existentes (mantiene cabecera en fila 1)
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila > 1) {
    hoja.getRange(2, 1, ultimaFila - 1, 3).clearContent();
  }

  // Escribe los parámetros desde la fila 2
  var filas = parametros.map(function(p) {
    return [p.clave, p.valores, p.descripcion];
  });

  hoja.getRange(2, 1, filas.length, 3).setValues(filas);
  hoja.autoResizeColumns(1, 3);

  Logger.log('✓ Parámetros poblados: ' + parametros.length + ' categorías');
  parametros.forEach(function(p) {
    Logger.log('  - ' + p.clave);
  });
}

/**
 * Función de verificación: muestra en el Logger el estado del spreadsheet.
 * Útil para confirmar que el setup se realizó correctamente.
 * Ejecutar desde: Ejecutar → verificarSetup()
 */
function verificarSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojas = ss.getSheets();

  Logger.log('=== Verificación del setup ===');
  Logger.log('Spreadsheet: ' + ss.getName());
  Logger.log('Hojas encontradas: ' + hojas.length);

  hojas.forEach(function(hoja) {
    var ultima = hoja.getLastRow();
    Logger.log('  · ' + hoja.getName() + ': ' + (ultima > 0 ? ultima - 1 : 0) + ' registro(s) + cabecera');
  });

  // Verifica que la hoja de parámetros tiene datos
  var hojaParams = ss.getSheetByName('parametros');
  if (hojaParams && hojaParams.getLastRow() > 1) {
    Logger.log('✓ Parámetros: OK (' + (hojaParams.getLastRow() - 1) + ' entradas)');
  } else {
    Logger.log('✗ Parámetros: VACÍO - ejecutá poblarParametros()');
  }

  Logger.log('=== Fin de verificación ===');
}
