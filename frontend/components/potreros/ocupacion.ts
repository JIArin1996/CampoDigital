import type { Estadia, Potrero } from "@/types/database"
import type { CategoriaAnimal, Especie, Lote, StockLote } from "@/types/lotes"

// Un lote adentro de un potrero, con su especie y sus cabezas por categoría
export interface LoteEnPotrero {
  lote: Lote
  especie: string
  cabezas: number
  categorias: { nombre: string; cabezas: number }[]
}

// Lotes activos agrupados por el potrero de su estadía abierta
export function armarOcupacion(
  lotes: Lote[], stock: StockLote[], estadias: Map<string, Estadia>, especies: Especie[], categorias: CategoriaAnimal[],
): Map<string, LoteEnPotrero[]> {
  const porPotrero = new Map<string, LoteEnPotrero[]>()
  for (const lote of lotes) {
    const potreroId = estadias.get(lote.id)?.potrero_id
    if (!potreroId) continue
    const filas = stock
      .filter(s => s.lote_id === lote.id && s.cabezas > 0)
      .map(s => ({ cat: categorias.find(c => c.id === s.categoria_id), cabezas: s.cabezas }))
      .sort((a, b) => (a.cat?.orden ?? 0) - (b.cat?.orden ?? 0))
    porPotrero.set(potreroId, [...(porPotrero.get(potreroId) ?? []), {
      lote,
      especie: especies.find(e => e.id === lote.especie_id)?.nombre ?? "",
      cabezas: filas.reduce((s, f) => s + f.cabezas, 0),
      categorias: filas.map(f => ({ nombre: f.cat?.nombre ?? "Categoría", cabezas: f.cabezas })),
    }])
  }
  return porPotrero
}

// Lo que se puede hacer con un potrero (los diálogos viven en la pantalla)
export interface AccionesPotrero {
  editar: (p: Potrero) => void
  ingresar: (p: Potrero) => void
  historial: (p: Potrero) => void
  desactivar: (p: Potrero) => void
  reactivar: (p: Potrero) => void
}

export const numero = (n: number, decimales = 1) => n.toLocaleString("es-UY", { maximumFractionDigits: decimales })
