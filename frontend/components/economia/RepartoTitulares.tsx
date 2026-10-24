"use client"

import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CampoMonto } from "@/components/economia/CampoMonto"
import { montoATexto, parsearMonto, type TitularForm } from "@/components/economia/formato"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { Titular } from "@/types/economia"

/**
 * A nombre de quién va el movimiento: ninguno, uno (con el monto entero) o varios, cada uno con su
 * parte (ej.: USD 240 → titular 1: 40, titular 2: 200). Muestra cuánto falta o sobra repartir.
 */
export function RepartoTitulares({ titulares, filas, onCambio, total, moneda, disabled }: {
  titulares: Titular[]          // los que se pueden elegir (activos y los que ya tenía el movimiento)
  filas: TitularForm[]
  onCambio: (filas: TitularForm[]) => void
  total: number | null          // el monto del movimiento (null si todavía no es válido)
  moneda: "USD" | "UYU"
  disabled?: boolean
}) {
  const cambiar = (i: number, c: Partial<TitularForm>) => onCambio(filas.map((f, j) => (j === i ? { ...f, ...c } : f)))
  const repartido = filas.reduce((s, f) => s + Math.round((parsearMonto(f.monto) ?? 0) * 100), 0) / 100
  const resta = total === null ? null : Math.round((total - repartido) * 100) / 100
  const simbolo = moneda === "USD" ? "US$" : "$"

  // Con un titular no se carga monto (es el total); al repartir, cada uno carga su parte
  const agregar = () => onCambio([...filas, { titularId: "", monto: "" }])

  return (
    <div className="space-y-2">
      {filas.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <select aria-label={`Titular ${i + 1}`} className={cn(SELECT_NATIVO, "flex-1 min-w-0")} value={f.titularId} disabled={disabled}
            onChange={e => cambiar(i, { titularId: e.target.value })}>
            <option value="">Elegí</option>
            {titulares.filter(t => t.id === f.titularId || !filas.some(o => o.titularId === t.id)).map(t =>
              <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          {filas.length > 1 && (
            <div className="w-40 shrink-0">
              <CampoMonto aria-label={`Monto del titular ${i + 1}`} valor={f.monto} moneda={moneda} disabled={disabled}
                onCambio={monto => cambiar(i, { monto })} />
            </div>
          )}
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9 shrink-0" aria-label={`Sacar titular ${i + 1}`}
            disabled={disabled} onClick={() => onCambio(filas.filter((_, j) => j !== i))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {filas.length > 1 && resta !== null && resta !== 0 && (
        <p className={cn("text-sm tabular-nums", resta > 0 ? "text-amber-700 dark:text-amber-400" : "text-destructive")}>
          {resta > 0 ? `Falta repartir ${simbolo} ${montoATexto(resta)}` : `Sobran ${simbolo} ${montoATexto(-resta)}`}
        </p>
      )}
      {filas.length > 1 && resta === 0 && <p className="text-sm text-muted-foreground">Repartido completo.</p>}

      <Button type="button" variant="outline" size="sm" className="h-10 md:h-8" disabled={disabled || filas.length >= titulares.length}
        onClick={agregar}>
        <Plus className="h-4 w-4 mr-1" /> {filas.length === 0 ? "Agregar titular" : "Repartir con otro titular"}
      </Button>
    </div>
  )
}
