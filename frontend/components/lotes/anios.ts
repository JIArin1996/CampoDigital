// Años de nacimiento de un lote (lotes.anios_nacimiento): reglas de la base, repetidas en la app
// para avisar antes de enviar. La base los valida igual (trigger validar_anios_nacimiento).

export const ANIO_MINIMO = 1990
export const MAXIMO_ANIOS = 10

// Año actual en el huso del teléfono (la base usa la fecha de Montevideo)
export const anioActual = () => new Date().getFullYear()

// "2025", "2024 y 2025", "2023, 2024 y 2025". Vacío: "".
export function formatoAnios(anios: number[] | null | undefined): string {
  const lista = [...(anios ?? [])].sort((a, b) => a - b).map(String)
  if (lista.length <= 1) return lista.join("")
  return `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}`
}

// Sin repetir y ordenados de menor a mayor, como los guarda la base
export const normalizarAnios = (anios: number[]) => [...new Set(anios)].sort((a, b) => a - b)
