"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { CampoMonto } from "@/components/economia/CampoMonto"
import type { PrecioForm } from "@/components/economia/formato"

/**
 * Monto, moneda (con tipo de cambio si son pesos) y estado. Ingreso: "cobrado"; egreso: "pagado".
 * Pagado o cobrado: en la fecha del movimiento. Pendiente: la fecha en que se espera cobrar o pagar.
 */
export function CamposPrecio({ id, valor, onCambio, ingreso, fecha }: {
  id: string
  valor: PrecioForm
  onCambio: (v: PrecioForm) => void
  ingreso: boolean
  fecha: string           // la del movimiento: mínimo de la fecha prevista
}) {
  const cambiar = (c: Partial<PrecioForm>) => onCambio({ ...valor, ...c })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-monto`}>Monto total</Label>
          <CampoMonto id={`${id}-monto`} valor={valor.monto} moneda={valor.moneda} onCambio={monto => cambiar({ monto })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-moneda`}>Moneda</Label>
          <select id={`${id}-moneda`} className={SELECT_NATIVO} value={valor.moneda}
            onChange={e => cambiar({ moneda: e.target.value as PrecioForm["moneda"] })}>
            <option value="USD">Dólares (USD)</option>
            <option value="UYU">Pesos (UYU)</option>
          </select>
        </div>
      </div>
      {valor.moneda === "UYU" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-tc`}>Tipo de cambio (pesos por dólar)</Label>
          <Input id={`${id}-tc`} type="text" inputMode="decimal" placeholder="Ej: 40,5" className={CAMPO}
            value={valor.tipoCambio} onChange={e => cambiar({ tipoCambio: e.target.value })} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-estado`}>Estado</Label>
          <select id={`${id}-estado`} className={SELECT_NATIVO} value={valor.estado}
            onChange={e => cambiar({ estado: e.target.value as PrecioForm["estado"], vencimiento: "" })}>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">{ingreso ? "Cobrado" : "Pagado"}</option>
          </select>
        </div>
        {valor.estado === "pendiente" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-vence`}>
              {ingreso ? "Fecha de cobro" : "Fecha de pago"} <span className="font-normal text-muted-foreground">(prevista)</span>
            </Label>
            <Input id={`${id}-vence`} type="date" min={fecha || undefined} className={CAMPO} value={valor.vencimiento}
              onChange={e => cambiar({ vencimiento: e.target.value })} />
          </div>
        )}
      </div>
    </div>
  )
}
