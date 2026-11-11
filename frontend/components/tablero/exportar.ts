import { medidaDe } from "@/components/tablero/catalogo"
import { rotuloPeriodo } from "@/components/tablero/periodos"
import type { DatosTarjeta } from "@/components/tablero/Tarjeta"
import type { TarjetaTablero } from "@/types/tablero"

// Nombre de hoja válido para Excel: sin []:*?/\, 31 letras como mucho y sin repetir
function nombreHoja(titulo: string, usados: Set<string>) {
  const base = titulo.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Tarjeta"
  let nombre = base
  for (let i = 2; usados.has(nombre.toLowerCase()); i++) nombre = `${base.slice(0, 28)} (${i})`
  usados.add(nombre.toLowerCase())
  return nombre
}

/**
 * Exporta la página del tablero a un .xlsx (SheetJS, cargado solo al exportar): una hoja "Filtros" con el
 * establecimiento, la página, el período y los filtros, y una hoja por tarjeta con los mismos números que se ven, en
 * filas (período, grupo, medida, valor, numerador y denominador). Si se compara, también las filas del año anterior.
 */
export async function exportarExcel(archivo: string, encabezado: [string, string][], tarjetas: TarjetaTablero[], datos: Map<string, DatosTarjeta>) {
  const XLSX = await import("xlsx")
  const libro = XLSX.utils.book_new()
  const usados = new Set<string>()

  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(encabezado), nombreHoja("Filtros", usados))

  for (const t of [...tarjetas].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const d = datos.get(t.id)
    const filas: (string | number | null)[][] = [["Período", "Grupo", "Medida", "Valor", "Unidad", "Numerador", "Denominador"]]
    if (!d) {
      filas.push(["(la tarjeta no terminó de calcular)"])
    } else {
      const agregar = (resultados: DatosTarjeta["resultados"], sufijo: string) => {
        for (const r of resultados) {
          const m = medidaDe(t.definicion.fuente, r.medida)
          for (const f of r.filas) {
            filas.push([rotuloPeriodo(f.periodo), f.etiqueta ?? "", `${m?.etiqueta ?? r.medida}${sufijo}`, f.valor, m?.unidad ?? "",
                        f.numerador, f.denominador])
          }
          // El total de una tabla abierta, el que calculó la base (no la suma de las filas)
          if (r.total !== undefined) filas.push(["", "Total", `${m?.etiqueta ?? r.medida}${sufijo}`, r.total, m?.unidad ?? "", null, null])
        }
      }
      agregar(d.resultados, "")
      if (d.comparados) agregar(d.comparados, ` (${d.etiquetaComparada ?? "año anterior"})`)
      const meta = t.definicion.meta
      if (meta) filas.push(["", meta.mejor === "baja" ? "Meta (cumple si queda en la meta o abajo)" : "Meta (cumple si llega o pasa)", "", meta.valor, d.unidad, null, null])
    }
    const hoja = XLSX.utils.aoa_to_sheet(filas)
    hoja["!cols"] = [{ wch: 12 }, { wch: 24 }, { wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja(t.titulo, usados))
  }

  XLSX.writeFile(libro, archivo)
}
