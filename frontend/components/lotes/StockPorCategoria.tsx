import type { CategoriaAnimal } from "@/types/lotes"

interface Fila {
  categoria_id: string
  cabezas: number
}

/**
 * Lista de cabezas por categoría, en el orden del catálogo, con el total al final.
 * Solo muestra las categorías con stock distinto de cero. Con separarCrias (ficha del lote), si hay crías
 * al pie y además otras categorías (vacas con sus terneros), las crías van aparte: "100 + 20 crías al pie".
 */
export function StockPorCategoria({ filas, categorias, separarCrias = false }: {
  filas: Fila[]
  categorias: CategoriaAnimal[]
  separarCrias?: boolean
}) {
  const porCategoria = new Map<string, number>()
  filas.forEach(f => porCategoria.set(f.categoria_id, (porCategoria.get(f.categoria_id) ?? 0) + f.cabezas))

  const visibles = categorias.filter(c => (porCategoria.get(c.id) ?? 0) !== 0)
  const suma = (lista: CategoriaAnimal[]) => lista.reduce((s, c) => s + (porCategoria.get(c.id) ?? 0), 0)

  if (visibles.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin animales</p>
  }

  const crias = visibles.filter(c => c.cria_al_pie)
  const resto = visibles.filter(c => !c.cria_al_pie)
  const separar = separarCrias && crias.length > 0 && resto.length > 0

  const fila = (c: CategoriaAnimal) => (
    <div key={c.id} className="flex items-center justify-between py-2">
      <dt className="text-sm">{c.nombre}</dt>
      <dd className="text-base font-semibold tabular-nums">{porCategoria.get(c.id)}</dd>
    </div>
  )

  return (
    <dl className="divide-y">
      {(separar ? resto : visibles).map(fila)}
      {separar && (
        <>
          <div className="pt-3 pb-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Crías al pie</dt>
          </div>
          {crias.map(fila)}
        </>
      )}
      <div className="flex items-center justify-between py-2">
        <dt className="text-sm font-semibold">Total</dt>
        <dd className="text-lg font-bold tabular-nums">
          {separar ? <>{suma(resto)} <span className="text-sm font-semibold">+ {suma(crias)} crías al pie</span></> : suma(visibles)}
        </dd>
      </div>
    </dl>
  )
}
