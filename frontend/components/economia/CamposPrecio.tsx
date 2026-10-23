"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { hoyLocal } from "@/components/lotes/formato"
import type { PrecioForm } from "@/components/economia/formato"

/**
 * Monto, moneda (con tipo de cambio si son pesos), estado y fecha de pago. Ingreso: "cobrado";
 * egreso: "pagado". La fecha de pago solo va si está pagado.
 */
export function CamposPrecio({ id, valor, onCambio, ingreso }: {
  id: string
  valor: PrecioForm
  onCambio: (v: PrecioForm) => void
  ingreso: boolean
}) {
  const cambiar = (c: Partial<PrecioForm>) => onCambio({ ...valor, ...c })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-monto`}>Monto total</Label>
          <Input id={`${id}-monto`} type="text" inputMode="decimal" className={CAMPO} value={valor.monto}
            onChange={e => cambiar({ monto: e.target.value })} />
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
            onChange={e => cambiar({ estado: e.target.value as PrecioForm["estado"], fechaPago: "" })}>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">{ingreso ? "Cobrado" : "Pagado"}</option>
          </select>
        </div>
        {valor.estado === "pagado" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-fecha-pago`}>Fecha de {ingreso ? "cobro" : "pago"}</Label>
            <Input id={`${id}-fecha-pago`} type="date" max={hoyLocal()} className={CAMPO} value={valor.fechaPago}
              onChange={e => cambiar({ fechaPago: e.target.value })} />
          </div>
        )}
      </div>
    </div>
  )
}
