import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { fechaCorta } from "@/components/lotes/formato"
import { cn } from "@/lib/utils"
import type { Lote } from "@/types/lotes"

/**
 * Tarjeta de un lote en la lista: franja del color de la especie, nombre, potrero y fecha
 * de inicio, campaña (chip) y cabezas grandes a la derecha. Los cerrados muestran la fecha
 * de cierre en lugar de las cabezas.
 */
export function TarjetaLote({ lote, color, cabezas, potrero }: {
  lote: Lote
  color: string          // color de la especie (colorDeEspecie)
  cabezas: number
  potrero: string | null
}) {
  const cerrado = lote.estado === "cerrado"

  return (
    <Link
      href={`/lotes/${lote.id}`}
      className="flex items-stretch overflow-hidden rounded-lg border bg-card hover:bg-muted/30 active:bg-muted/50 transition-colors"
    >
      <span aria-hidden className={cn("w-1.5 shrink-0", cerrado && "opacity-40")} style={{ backgroundColor: color }} />
      <div className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{lote.nombre}</p>
          <p className="text-sm text-muted-foreground truncate">
            {[potrero, `desde ${fechaCorta(lote.fecha_apertura)}`].filter(Boolean).join(" · ")}
          </p>
          {lote.campana && <Badge variant="outline" className="mt-1.5">{lote.campana}</Badge>}
        </div>
        <div className="text-right shrink-0">
          {cerrado ? (
            <>
              <p className="text-sm font-medium">cerrado</p>
              {lote.fecha_cierre && <p className="text-xs text-muted-foreground">{fechaCorta(lote.fecha_cierre)}</p>}
            </>
          ) : (
            <>
              <p className="text-2xl font-bold tabular-nums leading-none">{cabezas}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{cabezas === 1 ? "cabeza" : "cabezas"}</p>
            </>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
      </div>
    </Link>
  )
}
