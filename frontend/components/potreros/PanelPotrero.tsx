"use client"

import Link from "next/link"
import { AlertTriangle, ChevronDown, Clock, Droplets, Edit2, History, LogIn, PenLine, RotateCcw, Ruler, TreePine, Trash2, Umbrella, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { diasDesde, numero, textoDias, totales, type AccionesPotrero, type LoteEnPotrero } from "@/components/potreros/ocupacion"
import { fechaCorta } from "@/components/lotes/formato"
import type { Potrero } from "@/types/database"

/**
 * Todo lo de un potrero: datos (con sombra y observaciones), superficie (la del dibujo), lotes adentro con especie,
 * categorías, cabezas y días en el potrero, dotación en UG/ha (o los días de descanso si está vacío) y las acciones según el rol.
 * En el mapa: panel al costado (escritorio) o desde abajo (celular). En el celular arranca resumido (nombre,
 * superficie, animales y acciones) para no tapar el mapa; "Ver detalle" lo despliega.
 */
export function PanelPotrero({ potrero, areaDibujada, ultimaSalida, lotes, puedeOperar, acciones, onCerrar, onDibujar, onBorrarForma, resumido = false, onVerDetalle }: {
  potrero: Potrero
  areaDibujada: number | null       // hectáreas de la forma dibujada (null: sin dibujar)
  ultimaSalida: string | null       // última salida de un lote (desde cuándo descansa si está vacío)
  lotes: LoteEnPotrero[]
  puedeOperar: boolean
  acciones: AccionesPotrero
  onCerrar: () => void
  onDibujar?: () => void            // dibujar o editar la forma en el mapa
  onBorrarForma?: () => void
  resumido?: boolean
  onVerDetalle?: () => void
}) {
  // La superficie es la del polígono; sin dibujar, la cargada
  const superficie = areaDibujada ?? Number(potrero.superficie)
  const { cabezas, ug, sinUg } = totales(lotes)
  const dotacion = superficie > 0 ? `${numero(ug / superficie, 2)} UG/ha` : null
  const inactivo = potrero.estado === "inactivo"
  const descanso = ultimaSalida ? `Descanso: ${textoDias(diasDesde(ultimaSalida))}` : "Sin animales registrados"

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

      {/* Resumen (celular): una línea con lo principal */}
      {resumido && (
        <p className="text-sm">
          <span className="font-medium">{numero(superficie, 2)} ha</span>
          {!inactivo && (lotes.length === 0 ? <span className="text-muted-foreground"> · vacío · {descanso.toLowerCase()}</span> : (
            <>
              {" · "}<span className="font-semibold tabular-nums">{cabezas}</span> {cabezas === 1 ? "animal" : "animales"}
              {dotacion && <span className="text-muted-foreground"> · {dotacion}</span>}
              <span className="text-muted-foreground"> · {lotes.length === 1 ? "1 lote" : `${lotes.length} lotes`}</span>
            </>
          ))}
        </p>
      )}

      {!resumido && (
        <>
          {/* Datos */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="flex items-center gap-1 text-muted-foreground"><Ruler className="h-3.5 w-3.5" /> Superficie</dt>
              <dd className="font-medium">
                {numero(superficie, 2)} ha
                {areaDibujada === null && <span className="font-normal text-muted-foreground"> (sin dibujar)</span>}
              </dd>
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
          {potrero.observaciones && <p className="text-sm text-muted-foreground">{potrero.observaciones}</p>}

          {/* Lotes adentro */}
          {!inactivo && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {lotes.length === 0 ? "Vacío" : (
                  <>
                    <span className="tabular-nums">{cabezas}</span> {cabezas === 1 ? "cabeza" : "cabezas"}
                    <span className="font-normal text-muted-foreground"> · {numero(ug, 1)} UG</span>
                    {dotacion && <span className="font-normal text-muted-foreground"> · {dotacion}</span>}
                  </>
                )}
              </h3>
              {lotes.length === 0 && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {descanso}{ultimaSalida && ` (desde el ${fechaCorta(ultimaSalida)})`}
                </p>
              )}
              {sinUg.length > 0 && (
                <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  Sin equivalencia en UG: {sinUg.join(", ")} (no suman).
                </p>
              )}
              {lotes.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {lotes.map(({ lote, especie, cabezas: c, ug: u, categorias, desde }) => (
                    <li key={lote.id} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <Link href={`/lotes/${lote.id}`} className="font-medium text-primary truncate">{lote.nombre}</Link>
                        <span className="shrink-0 text-sm tabular-nums">{c} cab. · {numero(u, 1)} UG</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {[especie, categorias.map(x => `${x.nombre} ${x.cabezas}`).join(" · ")].filter(Boolean).join(": ")}
                      </p>
                      {desde && (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" /> Lleva {textoDias(diasDesde(desde))} (desde el {fechaCorta(desde)})
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

        </>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        {resumido && onVerDetalle && (
          <Button variant="secondary" size="sm" className="h-11 md:h-8" onClick={onVerDetalle}>
            <ChevronDown className="h-4 w-4 mr-1" /> Ver detalle
          </Button>
        )}
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
        {puedeOperar && !inactivo && onDibujar && (
          <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={onDibujar}>
            <PenLine className="h-4 w-4 mr-1" /> {areaDibujada ? "Editar forma" : "Dibujar en el mapa"}
          </Button>
        )}
        {puedeOperar && !inactivo && areaDibujada && onBorrarForma && (
          <Button variant="ghost" size="sm" className="h-11 md:h-8 text-muted-foreground" onClick={onBorrarForma}>
            <Trash2 className="h-4 w-4 mr-1" /> Borrar forma
          </Button>
        )}
        {puedeOperar && inactivo && (
          <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => acciones.reactivar(potrero)}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reactivar
          </Button>
        )}
      </div>
    </div>
  )
}
