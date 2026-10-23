"use client"

import { useState } from "react"
import area from "@turf/area"
import { AlertTriangle, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CAMPO } from "@/components/shared/estilos"
import { numero } from "@/components/potreros/ocupacion"
import type { Potrero } from "@/types/database"

// Hectáreas de una forma (área geodésica, como la calcula la base al guardar)
export const hectareas = (forma: GeoJSON.MultiPolygon) => Math.round(area(forma) / 100) / 100

/**
 * Barra del dibujo de un potrero, sobre el mapa: instrucciones, área en vivo, la superficie propuesta
 * (editable, con aviso si difiere más de 10 % de la cargada) y Guardar, Empezar de nuevo y Cancelar.
 */
export function BarraDibujo({ potrero, forma, guardando, onGuardar, onReiniciar, onCancelar }: {
  potrero: Potrero
  forma: GeoJSON.MultiPolygon | null
  guardando: boolean
  onGuardar: (superficie: number) => void
  onReiniciar: () => void
  onCancelar: () => void
}) {
  const cargada = Number(potrero.superficie)
  const ha = forma ? hectareas(forma) : null
  // La superficie propuesta es el área dibujada, hasta que el usuario la escriba a mano
  const [escrita, setEscrita] = useState<string | null>(null)
  const superficie = escrita ?? (ha !== null ? String(ha) : "")
  const diferencia = ha !== null && cargada > 0 ? (ha - cargada) / cargada : 0
  const valor = Number(superficie.replace(",", "."))
  const valida = Number.isFinite(valor) && valor > 0

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
        <>
          <p className="text-sm">
            Área dibujada: <span className="font-semibold tabular-nums">{numero(ha, 2)} ha</span>
            <span className="text-muted-foreground"> · cargada: {numero(cargada, 2)} ha</span>
          </p>
          {Math.abs(diferencia) > 0.1 && (
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              Difiere {numero(Math.abs(diferencia) * 100, 0)} % de la superficie cargada. Revisá el dibujo o corregí la superficie.
            </p>
          )}
          <div className="flex items-end gap-2">
            <div className="space-y-1.5 flex-1 max-w-48">
              <Label htmlFor="dib-superficie">Superficie del potrero (ha)</Label>
              <Input id="dib-superficie" inputMode="decimal" className={CAMPO} value={superficie} onChange={e => setEscrita(e.target.value)} />
            </div>
            {escrita !== null && (
              <Button type="button" variant="ghost" size="sm" className="h-11 md:h-9" onClick={() => setEscrita(null)}>
                Usar el área
              </Button>
            )}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="h-11 md:h-9" disabled={!forma || !valida || guardando} onClick={() => onGuardar(Math.round(valor * 100) / 100)}>
          {guardando ? "Guardando..." : "Guardar forma"}
        </Button>
        {forma && (
          <Button variant="outline" className="h-11 md:h-9" disabled={guardando} onClick={() => { setEscrita(null); onReiniciar() }}>
            <RotateCcw className="h-4 w-4 mr-1" /> Empezar de nuevo
          </Button>
        )}
        <Button variant="ghost" className="h-11 md:h-9" disabled={guardando} onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
