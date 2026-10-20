"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CAMPO } from "@/components/shared/estilos"
import { ANIO_MINIMO, MAXIMO_ANIOS, anioActual, formatoAnios, normalizarAnios } from "@/components/lotes/anios"
import { cn } from "@/lib/utils"

/**
 * Selector múltiple de años de nacimiento: chips con los últimos años (tocar para marcar o
 * desmarcar) y un campo para agregar otro. Devuelve los años sin repetir y ordenados.
 */
export function SelectorAnios({ id, valor, onCambio, ultimos = 6 }: {
  id: string
  valor: number[]
  onCambio: (anios: number[]) => void
  ultimos?: number
}) {
  const [otro, setOtro] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)

  const hoy = anioActual()
  const recientes = Array.from({ length: ultimos }, (_, i) => hoy - i)
  // Los elegidos fuera de los recientes también se muestran (y se pueden desmarcar)
  const chips = normalizarAnios([...recientes, ...valor]).reverse()

  const alternar = (anio: number) => {
    setAviso(null)
    if (valor.includes(anio)) return onCambio(valor.filter(a => a !== anio))
    if (valor.length >= MAXIMO_ANIOS) return setAviso(`Hasta ${MAXIMO_ANIOS} años por lote`)
    onCambio(normalizarAnios([...valor, anio]))
  }

  const agregar = () => {
    const anio = Number(otro.trim())
    if (!Number.isInteger(anio) || anio < ANIO_MINIMO || anio > hoy) {
      return setAviso(`El año tiene que estar entre ${ANIO_MINIMO} y ${hoy}`)
    }
    if (!valor.includes(anio)) {
      if (valor.length >= MAXIMO_ANIOS) return setAviso(`Hasta ${MAXIMO_ANIOS} años por lote`)
      onCambio(normalizarAnios([...valor, anio]))
    }
    setOtro("")
    setAviso(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Años de nacimiento">
        {chips.map(anio => {
          const elegido = valor.includes(anio)
          return (
            <button key={anio} type="button" aria-pressed={elegido} onClick={() => alternar(anio)}
              className={cn("min-h-11 md:min-h-9 rounded-full border px-4 text-sm font-medium tabular-nums transition-colors",
                elegido ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {anio}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <Input id={id} type="number" inputMode="numeric" min={ANIO_MINIMO} max={hoy} step="1" placeholder="Otro año"
          className={`${CAMPO} w-32`} value={otro} onChange={e => setOtro(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); agregar() } }} />
        <Button type="button" variant="outline" className="h-11 md:h-9" onClick={agregar} disabled={!otro.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Agregar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {valor.length > 0 ? `Nacidos en ${formatoAnios(valor)}` : "Sin año de nacimiento"}
      </p>
      {aviso && <p role="alert" className="text-sm text-destructive">{aviso}</p>}
    </div>
  )
}
