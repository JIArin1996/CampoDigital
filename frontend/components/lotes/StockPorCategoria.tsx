import type { CategoriaAnimal } from "@/types/lotes"

interface Fila {
  categoria_id: string
  cabezas: number
}

/**
 * Lista de cabezas por categoría, en el orden del catálogo, con el total al final.
 * Solo muestra las categorías con stock distinto de cero.
 */
export function StockPorCategoria({ filas, categorias }: { filas: Fila[]; categorias: CategoriaAnimal[] }) {
  const porCategoria = new Map<string, number>()
  filas.forEach(f => porCategoria.set(f.categoria_id, (porCategoria.get(f.categoria_id) ?? 0) + f.cabezas))

  const visibles = categorias.filter(c => (porCategoria.get(c.id) ?? 0) !== 0)
  const total = visibles.reduce((s, c) => s + (porCategoria.get(c.id) ?? 0), 0)

  if (visibles.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin animales</p>
  }

  return (
    <dl className="divide-y">
      {visibles.map(c => (
        <div key={c.id} className="flex items-center justify-between py-2">
          <dt className="text-sm">{c.nombre}</dt>
          <dd className="text-base font-semibold tabular-nums">{porCategoria.get(c.id)}</dd>
        </div>
      ))}
      <div className="flex items-center justify-between py-2">
        <dt className="text-sm font-semibold">Total</dt>
        <dd className="text-lg font-bold tabular-nums">{total}</dd>
      </div>
    </dl>
  )
}
