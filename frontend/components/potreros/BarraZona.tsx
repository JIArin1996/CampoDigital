"use client"

import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { hectareas } from "@/components/potreros/BarraDibujo"
import { numero } from "@/components/potreros/ocupacion"
import type { TipoZona } from "@/lib/queries/zonas"

/**
 * Barra del dibujo de una zona no aprovechable, sobre el mapa: instrucciones, tipo, nota, área dibujada y Guardar,
 * Empezar de nuevo y Cancelar. La base recorta la zona al potrero: solo cuenta lo de adentro.
 */
export function BarraZona({ potrero, nueva, tipos, tipoId, nota, forma, guardando, onTipo, onNota, onGuardar, onReiniciar, onCancelar }: {
  potrero: string                    // nombre del potrero
  nueva: boolean
  tipos: TipoZona[]                  // los activos (y el que ya tenía la zona, aunque esté de baja)
  tipoId: string
  nota: string
  forma: GeoJSON.MultiPolygon | null
  guardando: boolean
  onTipo: (id: string) => void
  onNota: (nota: string) => void
  onGuardar: () => void
  onReiniciar: () => void
  onCancelar: () => void
}) {
  const ha = forma ? hectareas(forma) : null

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold">{nueva ? "Nueva zona no aprovechable" : "Editando zona"} · {potrero}</p>
        <p className="text-sm text-muted-foreground">
          {forma
            ? "Arrastrá las esquinas para ajustar. Lo que quede fuera del potrero no cuenta."
            : "Tocá las esquinas de la zona (monte, bañado…) y cerrá tocando el primer punto. Los bordes se pegan al potrero."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="zona-tipo">Tipo</Label>
          <select id="zona-tipo" className={SELECT_NATIVO} value={tipoId} onChange={e => onTipo(e.target.value)}>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}{t.activo ? "" : " (de baja)"}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zona-nota">Nota (opcional)</Label>
          <Input id="zona-nota" className="h-11 md:h-9" maxLength={200} value={nota} placeholder="Ej. monte del arroyo"
            onChange={e => onNota(e.target.value)} />
        </div>
      </div>

      {ha !== null && (
        <p className="text-sm">Dibujado: <span className="font-semibold tabular-nums">{numero(ha, 2)} ha</span></p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="h-11 md:h-9" disabled={!forma || !tipoId || guardando} onClick={onGuardar}>
          {guardando ? "Guardando..." : "Guardar zona"}
        </Button>
        {forma && (
          <Button variant="outline" className="h-11 md:h-9" disabled={guardando} onClick={onReiniciar}>
            <RotateCcw className="mr-1 h-4 w-4" /> Empezar de nuevo
          </Button>
        )}
        <Button variant="ghost" className="h-11 md:h-9" disabled={guardando} onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
