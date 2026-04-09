/**
 * Lógica de categorización automática del ganado.
 * Función pura — no depende de estado ni de Supabase.
 * Usada tanto en formularios (preview en tiempo real) como en inserts.
 */

/**
 * Calcula la cantidad de meses completos transcurridos entre dos fechas.
 */
function mesesEntre(desde: Date, hasta: Date): number {
  const anios = hasta.getFullYear() - desde.getFullYear()
  const meses = hasta.getMonth() - desde.getMonth()
  return anios * 12 + meses
}

/**
 * Calcula la categoría actual del animal según sexo, edad de ingreso,
 * fecha de ingreso al sistema y si está marcado como toro.
 *
 * @param sexo             "Macho" | "Hembra"
 * @param edadMesesIngreso Edad en meses al momento del primer ingreso
 * @param fechaIngreso     Fecha ISO (YYYY-MM-DD) en que ingresó al sistema
 * @param esToro           true solo para machos con marca manual de toro
 * @returns                Categoría calculada como string
 */
export function calcularCategoria(
  sexo: string,
  edadMesesIngreso: number,
  fechaIngreso: string,
  esToro?: boolean | null
): string {
  const ingreso = new Date(fechaIngreso + "T12:00:00")
  const hoy = new Date()
  const mesesTranscurridos = mesesEntre(ingreso, hoy)
  const edadActual = edadMesesIngreso + mesesTranscurridos

  if (sexo === "Macho") {
    if (esToro) {
      return edadActual >= 36 ? "Toro" : "Torito"
    }
    if (edadActual < 12)  return "Ternero"
    if (edadActual < 24)  return "Novillo 1-2"
    if (edadActual < 36)  return "Novillo 2-3"
    return "Novillo +3"
  }

  // Hembra
  if (edadActual < 12)  return "Ternera"
  if (edadActual < 24)  return "Vaquillona 1-2"
  if (edadActual < 36)  return "Vaquillona +2"
  return "Vaca de Invernada"
}

/**
 * Versión simplificada para preview en tiempo real en el formulario.
 * Usa la fecha de hoy como fecha de ingreso (el animal recién está siendo registrado).
 */
export function calcularCategoriaPreview(
  sexo: string,
  edadMeses: number,
  esToro?: boolean | null
): string {
  const hoy = new Date().toISOString().split("T")[0]
  return calcularCategoria(sexo, edadMeses, hoy, esToro)
}
