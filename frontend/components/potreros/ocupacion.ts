import type { Estadia, Potrero } from "@/types/database"
import type { CategoriaAnimal, Especie, Lote, StockLote } from "@/types/lotes"
import { ugPorCabeza } from "@/components/potreros/ug"
import { hoyLocal } from "@/components/lotes/formato"

// Un lote adentro de un potrero, con su especie y sus cabezas por categoría
export interface LoteEnPotrero {
  lote: Lote
  especie: string
  cabezas: number
  ug: number                   // las categorías sin equivalencia no suman
  categorias: { nombre: string; cabezas: number; ug: number | null }[]
  desde: string | null         // fecha de ingreso al potrero (estadía abierta)
}

// Lotes activos agrupados por el potrero de su estadía abierta
export function armarOcupacion(
  lotes: Lote[], stock: StockLote[], estadias: Map<string, Estadia>, especies: Especie[], categorias: CategoriaAnimal[],
): Map<string, LoteEnPotrero[]> {
  const porPotrero = new Map<string, LoteEnPotrero[]>()
  for (const lote of lotes) {
    const estadia = estadias.get(lote.id)
    const potreroId = estadia?.potrero_id
    if (!potreroId) continue
    const filas = stock
      .filter(s => s.lote_id === lote.id && s.cabezas > 0)
      .map(s => ({ cat: categorias.find(c => c.id === s.categoria_id), cabezas: s.cabezas }))
      .sort((a, b) => (a.cat?.orden ?? 0) - (b.cat?.orden ?? 0))
      .map(f => ({ nombre: f.cat?.nombre ?? "Categoría", cabezas: f.cabezas, ug: f.cat ? ugPorCabeza(f.cat.nombre) : null }))
    porPotrero.set(potreroId, [...(porPotrero.get(potreroId) ?? []), {
      lote,
      especie: especies.find(e => e.id === lote.especie_id)?.nombre ?? "",
      cabezas: filas.reduce((s, f) => s + f.cabezas, 0),
      ug: filas.reduce((s, f) => s + f.cabezas * (f.ug ?? 0), 0),
      categorias: filas,
      desde: estadia.fecha_ingreso,
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

// Cabezas y UG de varios lotes, y las categorías que no tienen equivalencia en UG
export function totales(lotes: LoteEnPotrero[]) {
  const sinUg = new Set<string>()
  for (const l of lotes) for (const c of l.categorias) if (c.ug === null) sinUg.add(c.nombre)
  return { cabezas: lotes.reduce((s, l) => s + l.cabezas, 0), ug: lotes.reduce((s, l) => s + l.ug, 0), sinUg: [...sinUg] }
}

// Días enteros desde una fecha (aaaa-mm-dd) hasta hoy
export function diasDesde(fecha: string) {
  const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return Math.max(0, Math.round((dia(hoyLocal()) - dia(fecha)) / 86_400_000))
}

export const textoDias = (n: number) => (n === 1 ? "1 día" : `${n} días`)
