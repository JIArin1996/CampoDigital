"use client"

import { Input } from "@/components/ui/input"
import { CAMPO } from "@/components/shared/estilos"
import { formatearMonto } from "@/components/economia/formato"
import { cn } from "@/lib/utils"

/**
 * Campo de monto en formato moneda: "US$ 1.234,50" o "$ 1.234,50". Separa los miles mientras se
 * escribe; la coma es el decimal (un punto recién escrito al final también). El valor es el texto
 * formateado: se lee con parsearMonto.
 */
export function CampoMonto({ id, valor, onCambio, moneda, className, ...resto }: {
  id?: string
  valor: string
  onCambio: (texto: string) => void
  moneda: "USD" | "UYU"
  className?: string
  "aria-label"?: string
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
        {moneda === "USD" ? "US$" : "$"}
      </span>
      <Input id={id} type="text" inputMode="decimal" autoComplete="off" placeholder="0,00"
        className={cn(CAMPO, "text-right tabular-nums", moneda === "USD" ? "pl-12" : "pl-8", className)}
        value={valor} onChange={e => onCambio(formatearMonto(e.target.value, valor))} {...resto} />
    </div>
  )
}
