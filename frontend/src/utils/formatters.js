/**
 * formatters.js — Utilitarios de formato para números, fechas y moneda
 */

/**
 * Formatea un número como moneda en USD.
 * @param {number} valor
 * @returns {string} - Ej: "$ 18.900"
 */
export function formatearMoneda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return '$ ' + Number(valor).toLocaleString('es-UY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatea un número con separadores de miles.
 * @param {number} valor
 * @returns {string} - Ej: "1.250"
 */
export function formatearNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('es-UY');
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) al formato local uruguayo (DD/MM/YYYY).
 * @param {string} fechaStr
 * @returns {string} - Ej: "01/04/2026"
 */
export function formatearFecha(fechaStr) {
  if (!fechaStr) return '—';
  // Parsear como fecha local (sin conversión de zona horaria)
  const [yyyy, mm, dd] = String(fechaStr).split('T')[0].split('-');
  if (!yyyy || !mm || !dd) return fechaStr;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Devuelve la fecha de hoy en formato YYYY-MM-DD (zona horaria local del browser).
 * Útil para el valor por defecto del campo de fecha.
 * @returns {string}
 */
export function fechaHoy() {
  const ahora = new Date();
  const yyyy = ahora.getFullYear();
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  const dd = String(ahora.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formatea hectáreas con símbolo.
 * @param {number} valor
 * @returns {string} - Ej: "850 ha"
 */
export function formatearHectareas(valor) {
  if (!valor && valor !== 0) return '—';
  return `${formatearNumero(valor)} ha`;
}

/**
 * Formatea cabezas de ganado.
 * @param {number} valor
 * @returns {string} - Ej: "250 cab."
 */
export function formatearCabezas(valor) {
  if (!valor && valor !== 0) return '0';
  return `${formatearNumero(valor)}`;
}

/**
 * Retorna la clase CSS Tailwind de color según el tipo de movimiento ganadero.
 * @param {string} tipo
 * @returns {string}
 */
export function colorTipoMovimiento(tipo) {
  const colores = {
    Compra:      'bg-blue-100 text-blue-800',
    Venta:       'bg-orange-100 text-orange-800',
    Nacimiento:  'bg-green-100 text-green-800',
    Muerte:      'bg-red-100 text-red-800',
    Traslado:    'bg-purple-100 text-purple-800',
    Ajuste:      'bg-gray-100 text-gray-700',
  };
  return colores[tipo] || 'bg-gray-100 text-gray-700';
}
