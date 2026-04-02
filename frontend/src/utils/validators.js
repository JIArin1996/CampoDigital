/**
 * validators.js — Validaciones de formularios del frontend
 * Replica las reglas definidas en el modelo de datos (02-MODELO-DE-DATOS.md)
 */

// ─── Helpers base ──────────────────────────────────────────────────────────

/** Verifica que un valor no sea nulo, undefined ni vacío */
export const esRequerido = (valor) =>
  valor !== null && valor !== undefined && String(valor).trim() !== '';

/** Verifica que un número sea mayor que cero */
export const esMayorQueCero = (valor) => {
  const num = parseFloat(valor);
  return !isNaN(num) && num > 0;
};

/** Verifica formato DICOSE: XX.XXX.XXX */
export const esDicoseValido = (valor) =>
  !valor || /^\d{2}\.\d{3}\.\d{3}$/.test(String(valor).trim());

/** Verifica que una fecha no sea futura */
export const noEsFuturo = (fechaStr) => {
  if (!fechaStr) return true;
  return new Date(fechaStr) <= new Date();
};

// ─── Validadores de entidades ──────────────────────────────────────────────

/**
 * Valida los datos del formulario de establecimiento.
 * @param {Object} datos
 * @returns {{ valido: boolean, errores: Object }} - errores: { campo: "mensaje" }
 */
export function validarEstablecimiento(datos) {
  const errores = {};

  if (!esRequerido(datos.nombre)) {
    errores.nombre = 'El nombre es obligatorio';
  }
  if (!esRequerido(datos.departamento)) {
    errores.departamento = 'El departamento es obligatorio';
  }
  if (!esMayorQueCero(datos.superficie_total)) {
    errores.superficie_total = 'La superficie debe ser mayor que 0';
  }
  if (!esRequerido(datos.tipo)) {
    errores.tipo = 'El tipo de establecimiento es obligatorio';
  }
  if (datos.dicose && !esDicoseValido(datos.dicose)) {
    errores.dicose = 'Formato inválido. Usar XX.XXX.XXX (ej: 12.345.678)';
  }

  return { valido: Object.keys(errores).length === 0, errores };
}

/**
 * Valida los datos del formulario de potrero.
 * @param {Object} datos
 * @returns {{ valido: boolean, errores: Object }}
 */
export function validarPotrero(datos) {
  const errores = {};

  if (!esRequerido(datos.nombre)) {
    errores.nombre = 'El nombre del potrero es obligatorio';
  }
  if (!esMayorQueCero(datos.superficie)) {
    errores.superficie = 'La superficie debe ser mayor que 0';
  }
  if (!esRequerido(datos.uso_actual)) {
    errores.uso_actual = 'El uso actual es obligatorio';
  }

  return { valido: Object.keys(errores).length === 0, errores };
}

/**
 * Valida los datos del formulario de movimiento ganadero.
 * @param {Object} datos
 * @returns {{ valido: boolean, errores: Object }}
 */
export function validarMovimiento(datos) {
  const errores = {};

  if (!esRequerido(datos.fecha)) {
    errores.fecha = 'La fecha es obligatoria';
  }
  if (!esRequerido(datos.tipo_movimiento)) {
    errores.tipo_movimiento = 'El tipo de movimiento es obligatorio';
  }
  if (!esRequerido(datos.categoria)) {
    errores.categoria = 'La categoría es obligatoria';
  }
  if (!esMayorQueCero(datos.cantidad)) {
    errores.cantidad = 'La cantidad debe ser mayor que 0';
  }

  // Reglas de potreros
  const requiereOrigen = ['Venta', 'Muerte', 'Consumo', 'Traslado', 'Cambio Categoría'].includes(datos.tipo_movimiento);
  const requiereDestino = ['Compra', 'Nacimiento', 'Traslado'].includes(datos.tipo_movimiento);

  if (requiereOrigen && !esRequerido(datos.potrero_origen)) {
    errores.potrero_origen = 'El potrero de origen es obligatorio para este movimiento';
  }
  if (requiereDestino && !esRequerido(datos.potrero_destino)) {
    errores.potrero_destino = 'El potrero de destino es obligatorio para este movimiento';
  }

  // Traslado requiere origen Y destino distintos
  if (
    datos.tipo_movimiento === 'Traslado' &&
    datos.potrero_origen &&
    datos.potrero_destino &&
    datos.potrero_origen === datos.potrero_destino
  ) {
    errores.potrero_destino = 'El origen y destino no pueden ser el mismo';
  }

  return { valido: Object.keys(errores).length === 0, errores };
}
