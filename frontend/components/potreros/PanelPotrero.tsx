"use client"

import Link from "next/link"
import { AlertTriangle, Droplets, Edit2, History, LogIn, RotateCcw, Ruler, TreePine, Umbrella, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { numero, type AccionesPotrero, type LoteEnPotrero } from "@/components/potreros/ocupacion"
import type { Potrero } from "@/types/database"

/**
 * Todo lo de un potrero: datos (con sombra y observaciones), área dibujada, lotes adentro con especie,
 * categorías y cabezas, total, cabezas por hectárea y las acciones según el rol.
 * En el mapa: panel al costado (escritorio) o desde abajo (celular).
 */
export function PanelPotrero({ potrero, areaDibujada, lotes, puedeOperar, acciones, onCerrar }: {
  potrero: Potrero
  areaDibujada: number | null       // hectáreas de la forma dibujada (null: sin dibujar)
  lotes: LoteEnPotrero[]
  puedeOperar: boolean
  acciones: AccionesPotrero
  onCerrar: () => void
}) {
  const superficie = Number(potrero.superficie)
  const cabezas = lotes.reduce((s, l) => s + l.cabezas, 0)
  const inactivo = potrero.estado === "inactivo"
  // Aviso si la forma dibujada difiere más de 10 % de la superficie cargada
  const diferencia = areaDibujada && superficie > 0 ? (areaDibujada - superficie) / superficie : 0

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{potrero.nombre}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {inactivo && <Badge variant="secondary">Inactivo</Badge>}
            {potrero.uso_actual && <Badge variant="outline">{potrero.uso_actual}</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Cerrar" onClick={onCerrar}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Datos */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="flex items-center gap-1 text-muted-foreground"><Ruler className="h-3.5 w-3.5" /> Superficie</dt>
          <dd className="font-medium">{numero(superficie, 2)} ha</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dibujado</dt>
          <dd className="font-medium">{areaDibujada ? `${numero(areaDibujada, 2)} ha` : "Sin dibujar"}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-muted-foreground"><TreePine className="h-3.5 w-3.5" /> Pastura</dt>
          <dd className="font-medium">{potrero.tipo_pastura ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Aguada y sombra</dt>
          <dd className="flex items-center gap-2 font-medium">
            <span className="inline-flex items-center gap-1"><Droplets className="h-3.5 w-3.5" />{potrero.aguada ? "Sí" : "No"}</span>
            <span className="inline-flex items-center gap-1"><Umbrella className="h-3.5 w-3.5" />{potrero.sombra ? "Sí" : "No"}</span>
          </dd>
        </div>
      </dl>
      {Math.abs(diferencia) > 0.1 && (
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          La forma dibujada mide {numero(Math.abs(diferencia) * 100, 0)} % {diferencia > 0 ? "más" : "menos"} que la superficie cargada.
        </p>
      )}
      {potrero.observaciones && <p className="text-sm text-muted-foreground">{potrero.observaciones}</p>}

      {/* Lotes adentro */}
      {!inactivo && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            {lotes.length === 0 ? "Vacío" : (
              <>
                <span className="tabular-nums">{cabezas}</span> {cabezas === 1 ? "cabeza" : "cabezas"}
                {superficie > 0 && <span className="font-normal text-muted-foreground"> · {numero(cabezas / superficie, 2)} cab/ha</span>}
              </>
            )}
          </h3>
          {lotes.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {lotes.map(({ lote, especie, cabezas: c, categorias }) => (
                <li key={lote.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/lotes/${lote.id}`} className="font-medium text-primary truncate">{lote.nombre}</Link>
                    <span className="shrink-0 text-sm tabular-nums">{c} cab.</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[especie, categorias.map(x => `${x.nombre} ${x.cabezas}`).join(" · ")].filter(Boolean).join(": ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        {puedeOperar && !inactivo && (
          <>
            <Button size="sm" className="h-11 md:h-8" onClick={() => acciones.ingresar(potrero)}>
              <LogIn className="h-4 w-4 mr-1" /> Ingresar lote
            </Button>
            <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => acciones.editar(potrero)}>
              <Edit2 className="h-4 w-4 mr-1" /> Editar
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => acciones.historial(potrero)}>
          <History className="h-4 w-4 mr-1" /> Historial
        </Button>
        {puedeOperar && inactivo && (
          <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => acciones.reactivar(potrero)}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reactivar
          </Button>
        )}
      </div>
    </div>
  )
}
