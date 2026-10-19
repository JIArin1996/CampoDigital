import { AlertTriangle } from "lucide-react"

import { fechaCorta } from "@/components/lotes/formato"
import type { Carencia } from "@/types/actividades"

/**
 * Aviso de carencia (no bloquea): un renglón por producto, con la fecha de fin más lejana.
 * Las heredadas vienen de una sanidad del lote del que salió este (división, unión o destete).
 */
export function AvisoCarencia({ carencias, texto }: { carencias: Carencia[]; texto: string }) {
  const porProducto = new Map<string, Carencia>()
  for (const c of carencias) {
    const actual = porProducto.get(c.producto)
    if (!actual || c.fin_carencia > actual.fin_carencia) porProducto.set(c.producto, c)
  }
  const lista = [...porProducto.values()].sort((a, b) => b.fin_carencia.localeCompare(a.fin_carencia))

  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        {texto}
      </p>
      <ul className="mt-1 ml-6 list-disc space-y-0.5">
        {lista.map(c => (
          <li key={c.producto}>
            {c.producto}: hasta el {fechaCorta(c.fin_carencia)}
            {c.heredada && <span className="text-amber-800"> (del lote de origen)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
