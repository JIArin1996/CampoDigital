import { COLOR_ESPECIE, ordenarCategorias, ordenarEspecies } from "@/components/lotes/agrupacion"
import { cn } from "@/lib/utils"
import type { CategoriaAnimal, Especie, Lote, StockLote } from "@/types/lotes"

interface Props {
  lotes: Lote[]                                // lotes activos
  stock: StockLote[]                           // v_stock_lote
  potreros: { id: string; nombre: string }[]
  especies: Especie[]
  categorias: CategoriaAnimal[]
}

const SIN_POTRERO = "sin-potrero"

/**
 * Stock por potrero, compacto: un bloque por potrero con su total; adentro, por especie
 * (bovinos, ovinos, otros) y una línea por categoría (cría, recría, engorde, toros) con una
 * barra proporcional al total de esa especie en ese potrero. Sin potreros vacíos ni
 * categorías en cero. El potrero sale del lote (lotes.potrero_id): es el stock de los lotes
 * activos agrupado por el potrero donde está cada lote.
 */
export function StockPorPotrero({ lotes, stock, potreros, especies, categorias }: Props) {
  // potrero → especie → categoría → cabezas
  const porPotrero = new Map<string, Map<string, Map<string, number>>>()
  for (const lote of lotes) {
    const filas = stock.filter(s => s.lote_id === lote.id && s.cabezas > 0)
    if (filas.length === 0) continue
    const clave = lote.potrero_id ?? SIN_POTRERO
    const especiesDelPotrero = porPotrero.get(clave) ?? new Map<string, Map<string, number>>()
    const cats = especiesDelPotrero.get(lote.especie_id) ?? new Map<string, number>()
    for (const f of filas) cats.set(f.categoria_id, (cats.get(f.categoria_id) ?? 0) + f.cabezas)
    especiesDelPotrero.set(lote.especie_id, cats)
    porPotrero.set(clave, especiesDelPotrero)
  }

  if (porPotrero.size === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay animales en los lotes activos.</p>
  }

  // Potreros por nombre; los lotes sin potrero, al final
  const nombre = (clave: string) =>
    clave === SIN_POTRERO ? "Sin potrero" : potreros.find(p => p.id === clave)?.nombre ?? "Potrero inactivo"
  const claves = [...porPotrero.keys()].sort((a, b) =>
    a === SIN_POTRERO ? 1 : b === SIN_POTRERO ? -1 : nombre(a).localeCompare(nombre(b), "es", { numeric: true }))

  const suma = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0)
  const especiesOrdenadas = ordenarEspecies(especies)

  return (
    <div className="space-y-3">
      {claves.map(clave => {
        const especiesDelPotrero = porPotrero.get(clave)!
        const total = [...especiesDelPotrero.values()].reduce((s, m) => s + suma(m), 0)
        // Especies del potrero en el orden fijo; una especie que no esté en el catálogo activo va al final
        const ids = [
          ...especiesOrdenadas.map(e => e.id).filter(id => especiesDelPotrero.has(id)),
          ...[...especiesDelPotrero.keys()].filter(id => !especies.some(e => e.id === id)),
        ]
        return (
          <section key={clave} className="rounded-lg border bg-card px-4 py-3">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h3 className="font-semibold truncate">{nombre(clave)}</h3>
              <p className="text-sm text-muted-foreground shrink-0">
                <span className="text-base font-bold text-foreground tabular-nums">{total}</span> {total === 1 ? "cabeza" : "cabezas"}
              </p>
            </div>

            <div className="space-y-3">
              {ids.map(especieId => {
                const especie = especies.find(e => e.id === especieId)
                const grupo = especie?.grupo ?? "otro"
                const cats = especiesDelPotrero.get(especieId)!
                const totalEspecie = suma(cats)
                // Categorías del catálogo activo en orden lógico; una inactiva con stock va al final, para que el total cierre
                const filas = [
                  ...ordenarCategorias(categorias.filter(c => cats.has(c.id))).map(c => ({ id: c.id, nombre: c.nombre })),
                  ...[...cats.keys()].filter(id => !categorias.some(c => c.id === id)).map(id => ({ id, nombre: "Otra categoría" })),
                ]
                return (
                  <div key={especieId}>
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      <span aria-hidden className={cn("h-2 w-2 rounded-full", COLOR_ESPECIE[grupo].solido)} />
                      {especie?.nombre ?? "Otra especie"} · {totalEspecie}
                    </p>
                    <ul className="space-y-1.5">
                      {filas.map(c => {
                        const n = cats.get(c.id) ?? 0
                        return (
                          <li key={c.id}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="truncate">{c.nombre}</span>
                              <span className="font-semibold tabular-nums">{n}</span>
                            </div>
                            <div className={cn("mt-0.5 h-1 rounded-full overflow-hidden", COLOR_ESPECIE[grupo].suave)}>
                              <div className={cn("h-full rounded-full", COLOR_ESPECIE[grupo].solido)}
                                style={{ width: `${(n / totalEspecie) * 100}%` }} />
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
