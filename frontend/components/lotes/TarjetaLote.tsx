import Link from "next/link"
import { ChevronRight, MapPin } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { fechaCorta } from "@/components/lotes/formato"
import { formatoAnios } from "@/components/lotes/anios"
import { cn } from "@/lib/utils"
import type { Lote } from "@/types/lotes"

/**
 * Tarjeta de un lote en la lista: franja del color de la especie, nombre, potrero (con la fecha en que
 * entró) o la apertura, año de nacimiento (chip) y cabezas grandes a la derecha. Si el lote tiene crías al pie
 * y otras categorías, las crías van aparte ("100 cabezas + 20 crías al pie"). Los cerrados muestran
 * la fecha de cierre en lugar de las cabezas. Con onCambiarPotrero, un botón aparte (fuera del enlace)
 * abre el cambio de potrero.
 */
export function TarjetaLote({ lote, color, cabezas, crias = 0, potrero, enPotreroDesde, onCambiarPotrero }: {
  lote: Lote
  color: string                 // color de la especie (colorDeEspecie)
  cabezas: number               // sin las crías al pie, si se separan
  crias?: number                // crías al pie (separarCrias)
  potrero: string | null
  enPotreroDesde?: string | null   // ingreso al potrero actual (estadía abierta)
  onCambiarPotrero?: () => void
}) {
  const cerrado = lote.estado === "cerrado"
  const ubicacion = potrero && enPotreroDesde && !cerrado
    ? `${potrero} desde ${fechaCorta(enPotreroDesde)}`
    : [potrero ?? (cerrado ? null : "Sin potrero"), `abierto el ${fechaCorta(lote.fecha_apertura)}`].filter(Boolean).join(" · ")

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border bg-card">
      <Link
        href={`/lotes/${lote.id}`}
        className="flex flex-1 min-w-0 items-stretch hover:bg-muted/30 active:bg-muted/50 transition-colors"
      >
        <span aria-hidden className={cn("w-1.5 shrink-0", cerrado && "opacity-40")} style={{ backgroundColor: color }} />
        <div className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{lote.nombre}</p>
            <p className="text-sm text-muted-foreground truncate">{ubicacion}</p>
            {lote.anios_nacimiento.length > 0 && <Badge variant="outline" className="mt-1.5">{formatoAnios(lote.anios_nacimiento)}</Badge>}
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
                {crias > 0 && (
                  <p className="text-xs font-medium mt-0.5 tabular-nums">+ {crias} {crias === 1 ? "cría" : "crías"} al pie</p>
                )}
              </>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </div>
      </Link>
      {onCambiarPotrero && !cerrado && (
        <button type="button" onClick={onCambiarPotrero} aria-label={`Cambiar de potrero a ${lote.nombre}`} title="Cambiar de potrero"
          className="flex w-12 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-muted/50 hover:text-foreground active:bg-muted">
          <MapPin className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
