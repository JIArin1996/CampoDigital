/**
 * Validadores reutilizables para el dominio de Campo Digital.
 * Cada función retorna true si el valor es válido, false si no.
 * Se pueden usar directamente en schemas Zod con .refine() o en lógica imperativa.
 */

/**
 * Caravana SNIG: 15 dígitos numéricos, empieza por "8580000".
 * Formato SNIG Uruguay — identificador único del animal a nivel nacional.
 */
export function validarCaravanaSNIG(valor: string): boolean {
  return /^\d{15}$/.test(valor) && valor.startsWith("8580000")
}

/**
 * DICOSE Físico: exactamente 9 dígitos numéricos.
 * Identifica la ubicación geográfica del predio ante el MGAP.
 */
export function validarDicoseFisico(valor: string): boolean {
  return /^\d{9}$/.test(valor)
}

/**
 * DICOSE Propiedad: 9 caracteres.
 * Puede ser:
 *   - Todo numérico (ej: 123456789)
 *   - 2 letras mayúsculas seguidas de 7 dígitos (ej: AB1234567)
 * Identifica al titular legal de los animales.
 */
export function validarDicosePropiedad(valor: string): boolean {
  return /^\d{9}$/.test(valor) || /^[A-Z]{2}\d{7}$/.test(valor)
}

// ── Mensajes de error estándar ────────────────────────────────────────────────
// Para usar con .refine(validarX, MENSAJES.X) en schemas Zod

export const MENSAJES_VALIDACION = {
  caravana_snig: "Debe tener 15 dígitos y comenzar con 8580000",
  dicose_fisico: "Debe tener exactamente 9 dígitos numéricos",
  dicose_propiedad: "Debe ser 9 dígitos o 2 letras seguidas de 7 dígitos (ej: AB1234567)",
} as const
