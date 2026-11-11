import type { Unidad } from "@/components/tablero/catalogo"

// En los ejes: corto y sin unidad (la unidad va una sola vez, arriba del gráfico): 1.234 · 12,5 mil · 1,2 M
export function corto(n: number) {
  const a = Math.abs(n)
  const f = (x: number, d: number) => x.toLocaleString("es-UY", { maximumFractionDigits: d })
  if (a >= 1e6) return `${f(n / 1e6, 1)} M`
  if (a >= 1e4) return `${f(n / 1e3, 1)} mil`
  return f(n, a < 10 ? 2 : a < 100 ? 1 : 0)
}

// La unidad, en palabras, para poner junto al eje ("" si no tiene)
export const unidadEje = (u: Unidad) => (u === "cab" ? "cabezas" : u === "razón" ? "" : u)

// Un valor del tablero con su unidad, como se muestra en las tarjetas ("—" si no hay valor)
export function formato(n: number | null, unidad: Unidad) {
  if (n === null || Number.isNaN(n)) return "—"
  switch (unidad) {
    case "%": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} %`
    case "kg": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} kg`
    case "kg/día": return `${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg/día`
    case "kg/vaca": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} kg/vaca`
    case "kg/cab": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 2 })} kg/cab`
    case "razón": return n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case "USD": return `${n < 0 ? "−" : ""}USD ${Math.abs(n).toLocaleString("es-UY", { maximumFractionDigits: 0 })}`
    case "USD/kg": return `USD ${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg`
    case "UG-día/ha": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} UG-día/ha`
    case "tareas": return `${n.toLocaleString("es-UY")} ${n === 1 ? "tarea" : "tareas"}`
    case "lotes": return `${n.toLocaleString("es-UY")} ${n === 1 ? "lote" : "lotes"}`
    case "dosis": return `${n.toLocaleString("es-UY")} dosis`
    case "potreros": return `${n.toLocaleString("es-UY")} ${n === 1 ? "potrero" : "potreros"}`
    case "UG/ha": return `${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UG/ha`
    case "UG": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} UG`
    case "ha": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} ha`
    case "días": return `${n.toLocaleString("es-UY")} ${n === 1 ? "día" : "días"}`
    case "cab": return n.toLocaleString("es-UY", { maximumFractionDigits: 1 })
    // Medidas propias: la unidad que eligió el administrador ("USD/ha"), o ninguna
    default: return `${n.toLocaleString("es-UY", { maximumFractionDigits: 2 })}${unidad ? ` ${unidad}` : ""}`
  }
}
