"use client"

import area from "@turf/area"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { numero } from "@/components/potreros/ocupacion"
import type { Potrero } from "@/types/database"

// Hectáreas de una forma (área geodésica, como la calcula la base al guardar)
export const hectareas = (forma: GeoJSON.MultiPolygon) => Math.round(area(forma) / 100) / 100

/**
 * Barra del dibujo de un potrero, sobre el mapa: instrucciones, área en vivo (que al guardar pasa a ser
 * la superficie del potrero) y Guardar, Empezar de nuevo y Cancelar.
 */
export function BarraDibujo({ potrero, forma, guardando, onGuardar, onReiniciar, onCancelar }: {
  potrero: Potrero
  forma: GeoJSON.MultiPolygon | null
  guardando: boolean
  onGuardar: () => void
  onReiniciar: () => void
  onCancelar: () => void
}) {
  const anterior = potrero.superficie === null ? null : Number(potrero.superficie)
  const ha = forma ? hectareas(forma) : null

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold">Dibujando {potrero.nombre}</p>
        <p className="text-sm text-muted-foreground">
          {forma
            ? "Arrastrá las esquinas para ajustar. Tocá un punto del medio de un lado para agregar una esquina; tocá una esquina con el dedo apretado (o clic derecho) para sacarla."
            : "Tocá las esquinas del potrero siguiendo el alambrado y cerrá tocando el primer punto. Los bordes se pegan a los potreros vecinos."}
        </p>
      </div>

      {ha !== null && (
        <p className="text-sm">
          Superficie: <span className="font-semibold tabular-nums">{numero(ha, 2)} ha</span>
          {anterior !== null && anterior !== ha && <span className="text-muted-foreground"> · antes: {numero(anterior, 2)} ha</span>}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="h-11 md:h-9" disabled={!forma || guardando} onClick={onGuardar}>
          {guardando ? "Guardando..." : "Guardar forma"}
        </Button>
        {forma && (
          <Button variant="outline" className="h-11 md:h-9" disabled={guardando} onClick={onReiniciar}>
            <RotateCcw className="h-4 w-4 mr-1" /> Empezar de nuevo
          </Button>
        )}
        <Button variant="ghost" className="h-11 md:h-9" disabled={guardando} onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
