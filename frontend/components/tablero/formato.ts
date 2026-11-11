import type { Unidad } from "@/components/tablero/catalogo"

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
