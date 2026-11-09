// Períodos del filtro general: ejercicios (julio a junio, como Economía), años calendario y los últimos 12 meses.
// La fecha final nunca pasa de hoy: "stock al cierre" del ejercicio en curso es el de hoy.

export interface Rango {
  desde: string   // aaaa-mm-dd
  hasta: string
}

const iso = (d: Date) => d.toLocaleDateString("en-CA")
const hoy = () => iso(new Date())
const menor = (a: string, b: string) => (a < b ? a : b)

// Año en que empieza el ejercicio de una fecha (julio a junio)
export const ejercicioDe = (fecha: string) => {
  const [a, m] = fecha.split("-").map(Number)
  return m >= 7 ? a : a - 1
}

export const etiquetaEjercicio = (e: number) => `Ejercicio ${e}/${String(e + 1).slice(2)}`

export interface OpcionPeriodo {
  clave: string
  etiqueta: string
}

// Opciones del selector: los últimos 5 ejercicios, los últimos 3 años y los últimos 12 meses
export function opcionesPeriodo(): OpcionPeriodo[] {
  const h = hoy()
  const e = ejercicioDe(h)
  const a = Number(h.slice(0, 4))
  return [
    ...[0, 1, 2, 3, 4].map(i => ({ clave: `ej-${e - i}`, etiqueta: etiquetaEjercicio(e - i) })),
    ...[0, 1, 2].map(i => ({ clave: `an-${a - i}`, etiqueta: `Año ${a - i}` })),
    { clave: "u12", etiqueta: "Últimos 12 meses" },
  ]
}

export const periodoPorDefecto = () => `ej-${ejercicioDe(hoy())}`

// Rango de una clave (null si la clave no es válida)
export function rangoDe(clave: string): Rango | null {
  const h = hoy()
  const ej = /^ej-(\d{4})$/.exec(clave)
  if (ej) {
    const e = Number(ej[1])
    return { desde: `${e}-07-01`, hasta: menor(`${e + 1}-06-30`, h) }
  }
  const an = /^an-(\d{4})$/.exec(clave)
  if (an) return { desde: `${an[1]}-01-01`, hasta: menor(`${an[1]}-12-31`, h) }
  if (clave === "u12") {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    d.setDate(d.getDate() + 1)
    return { desde: iso(d), hasta: h }
  }
  return null
}

// El período propio de una tarjeta: los últimos n ejercicios hasta el que termina en el período de arriba
export function rangoEjercicios(general: Rango, n: number): Rango {
  const e = ejercicioDe(general.hasta)
  return { desde: `${e - n + 1}-07-01`, hasta: general.hasta }
}

// Comparar con el año anterior: las mismas fechas, un año antes (el 29 de febrero pasa al 28)
function unAnioAntes(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number)
  const ultimo = new Date(a - 1, m, 0).getDate()
  return `${a - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`
}
export const rangoAnioAnterior = (r: Rango): Rango => ({ desde: unAnioAntes(r.desde), hasta: unAnioAntes(r.hasta) })

// Cómo se llama el período con el que se compara ("Ejercicio 2024/25", "Año 2025", "los 12 meses anteriores")
export function etiquetaComparada(clave: string): string {
  const ej = /^ej-(\d{4})$/.exec(clave)
  if (ej) return etiquetaEjercicio(Number(ej[1]) - 1)
  const an = /^an-(\d{4})$/.exec(clave)
  if (an) return `Año ${Number(an[1]) - 1}`
  return "los 12 meses anteriores"
}

// Rótulo corto de un período devuelto por la base: "2025-10" → "oct 25", "2025/26" queda igual
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"]
export function rotuloPeriodo(p: string | null): string {
  if (!p) return "Total"
  const m = /^(\d{4})-(\d{2})$/.exec(p)
  return m ? `${MESES[Number(m[2]) - 1]} ${m[1].slice(2)}` : p
}
