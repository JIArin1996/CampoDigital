import { colorDeEspecie, ordenarCategorias, ordenarEspecies } from "@/components/lotes/agrupacion"
import type { CategoriaAnimal, Especie, GrupoEspecie, Lote, StockLote } from "@/types/lotes"

interface Props {
  lotes: Lote[]                                // lotes activos
  stock: StockLote[]                           // v_stock_lote
  potreros: { id: string; nombre: string }[]
  especies: Especie[]
  categorias: CategoriaAnimal[]
}

interface Fila {
  categoria: string
  orden: number      // posición de la categoría (cría, recría, engorde, toros, otras)
  potrero: string
  cabezas: number
}

/**
 * Stock por especie: un cuadro por especie (Bovinos, Ovinos, Otros), uno al lado del otro,
 * con tres columnas: Categoría, Cantidad y Potrero. Una fila por categoría y potrero
 * (si una categoría está en dos potreros, son dos filas). El potrero sale del lote
 * (lotes.potrero_id). Sin categorías en cero.
 */
export function StockPorEspecie({ lotes, stock, potreros, especies, categorias }: Props) {
  const nombrePotrero = (id: string | null) =>
    id ? potreros.find(p => p.id === id)?.nombre ?? "Potrero inactivo" : "Sin potrero"

  // especie → (categoría + potrero) → fila
  const porEspecie = new Map<string, Map<string, Fila>>()
  for (const lote of lotes) {
    for (const s of stock) {
      if (s.lote_id !== lote.id || s.cabezas <= 0) continue
      const filas = porEspecie.get(lote.especie_id) ?? new Map<string, Fila>()
      const clave = `${s.categoria_id}:${lote.potrero_id ?? ""}`
      const fila = filas.get(clave)
      if (fila) {
        fila.cabezas += s.cabezas
      } else {
        const categoria = categorias.find(c => c.id === s.categoria_id)
        const ordenadas = ordenarCategorias(categorias.filter(c => c.especie_id === lote.especie_id))
        const pos = categoria ? ordenadas.findIndex(c => c.id === categoria.id) : Number.MAX_SAFE_INTEGER
        filas.set(clave, {
          categoria: categoria?.nombre ?? "Otra categoría",
          orden: pos,
          potrero: nombrePotrero(lote.potrero_id),
          cabezas: s.cabezas,
        })
      }
      porEspecie.set(lote.especie_id, filas)
    }
  }

  if (porEspecie.size === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay animales en los lotes activos.</p>
  }

  // Especies en orden fijo; una que no esté en el catálogo activo, al final
  const cuadros: { id: string; nombre: string; color: string }[] = [
    ...ordenarEspecies(especies).filter(e => porEspecie.has(e.id)).map(e => ({ id: e.id, nombre: e.nombre, color: colorDeEspecie(e) })),
    ...[...porEspecie.keys()].filter(id => !especies.some(e => e.id === id))
      .map(id => ({ id, nombre: "Otra especie", color: colorDeEspecie({ grupo: "otro" as GrupoEspecie }) })),
  ]

  return (
    // Uno al lado del otro; en pantallas angostas se deslizan de costado
    <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-3 overflow-x-auto snap-x pb-1">
      {cuadros.map(especie => {
        const filas = [...porEspecie.get(especie.id)!.values()].sort((a, b) =>
          a.orden - b.orden || a.potrero.localeCompare(b.potrero, "es", { numeric: true }))
        const total = filas.reduce((s, f) => s + f.cabezas, 0)
        return (
          <section key={especie.id}
            className="snap-start shrink-0 w-[85%] sm:w-auto sm:flex-1 sm:min-w-72 overflow-hidden rounded-lg border bg-card">
            <div aria-hidden className="h-1.5" style={{ backgroundColor: especie.color }} />
            <div className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h3 className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: especie.color }} />
                  {especie.nombre}
                </h3>
                <p className="text-sm text-muted-foreground shrink-0">
                  <span className="text-base font-bold text-foreground tabular-nums">{total}</span> {total === 1 ? "cabeza" : "cabezas"}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th scope="col" className="py-1 pr-2 text-left font-medium">Categoría</th>
                    <th scope="col" className="py-1 px-2 text-right font-medium">Cantidad</th>
                    <th scope="col" className="py-1 pl-2 text-left font-medium">Potrero</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filas.map(f => (
                    <tr key={`${f.categoria}:${f.potrero}`}>
                      <td className="py-1.5 pr-2">{f.categoria}</td>
                      <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{f.cabezas}</td>
                      <td className="py-1.5 pl-2 text-muted-foreground">{f.potrero}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <th scope="row" className="py-1.5 pr-2 text-left font-semibold">Total</th>
                    <td className="py-1.5 px-2 text-right font-bold tabular-nums">{total}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
