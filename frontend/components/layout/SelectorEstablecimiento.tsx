"use client"

import { ChevronDown } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { cn } from "@/lib/utils"

/**
 * Elige el establecimiento activo. Es un select nativo: en el celular abre el selector
 * del sistema, que es el más cómodo de usar con una mano.
 */
export function SelectorEstablecimiento({ compacto = false }: { compacto?: boolean }) {
  const { establecimientos, establecimientoActivo, setEstablecimientoActivo, cargando } = useEstablecimiento()

  if (cargando) {
    return <div className={cn("rounded-lg bg-muted animate-pulse", compacto ? "h-9 w-40" : "h-9")} />
  }

  if (establecimientos.length === 0) {
    return <p className="text-sm text-muted-foreground px-1">Sin establecimientos</p>
  }

  // Con uno solo no hay nada que elegir
  if (establecimientos.length === 1) {
    return (
      <p className={cn("font-semibold truncate px-1", compacto ? "text-base" : "text-sm")}>
        {establecimientos[0].nombre}
      </p>
    )
  }

  return (
    <div className="relative">
      <select
        aria-label="Establecimiento activo"
        className={cn(
          "w-full appearance-none truncate rounded-lg bg-transparent pr-8 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          compacto ? "h-11 pl-1 text-base" : "h-9 border border-input pl-2.5 text-sm"
        )}
        value={establecimientoActivo?.id ?? ""}
        onChange={e => {
          const est = establecimientos.find(x => x.id === e.target.value)
          if (est) setEstablecimientoActivo(est)
        }}
      >
        {establecimientos.map(est => (
          <option key={est.id} value={est.id}>{est.nombre}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    </div>
  )
}
