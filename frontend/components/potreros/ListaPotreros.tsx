"use client"

import { useState } from "react"
import Link from "next/link"
import { MapPin, Ruler, TreePine, Droplets, Edit2, LogIn, History, RotateCcw, Umbrella } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { numero, type AccionesPotrero, type LoteEnPotrero } from "@/components/potreros/ocupacion"
import { cn } from "@/lib/utils"
import type { Potrero } from "@/types/database"

interface ListaPotrerosProps {
  potreros: Potrero[]                          // activos e inactivos
  ocupacion: Map<string, LoteEnPotrero[]>      // lotes adentro de cada potrero
  puedeOperar: boolean                         // administrador u operador
  acciones: AccionesPotrero
}

/**
 * Vista Lista de Potreros: qué lotes tiene cada uno, cabezas y cabezas por hectárea, con sus acciones.
 * Los inactivos se muestran a pedido, con Reactivar.
 */
export function ListaPotreros({ potreros, ocupacion, puedeOperar, acciones }: ListaPotrerosProps) {
  const [verInactivos, setVerInactivos] = useState(false)

  const activos = potreros.filter(p => p.estado === "activo")
  const visibles = verInactivos ? potreros : activos
  const inactivos = potreros.length - activos.length

  return (
    <div>
      {inactivos > 0 && (
        <label className="flex items-center gap-2 min-h-11 cursor-pointer select-none w-fit mb-2">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />
          <span className="text-sm">Incluir inactivos ({inactivos})</span>
        </label>
      )}

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <MapPin className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No hay potreros registrados todavía</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map(potrero => {
            const inactivo = potrero.estado === "inactivo"
            const enPotrero = ocupacion.get(potrero.id) ?? []
            const cabezas = enPotrero.reduce((s, x) => s + x.cabezas, 0)
            const superficie = Number(potrero.superficie)
            return (
              <div key={potrero.id} className={cn("rounded-lg border bg-card px-4 py-3", inactivo && "border-dashed bg-muted/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{potrero.nombre}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Ruler className="h-3.5 w-3.5" />
                        {numero(superficie, 2)} ha
                      </span>
                      {potrero.tipo_pastura && (
                        <span className="flex items-center gap-1">
                          <TreePine className="h-3.5 w-3.5" />
                          {potrero.tipo_pastura}
                        </span>
                      )}
                      {potrero.aguada && (
                        <span className="flex items-center gap-1">
                          <Droplets className="h-3.5 w-3.5" />
                          Aguada
                        </span>
                      )}
                      {potrero.sombra && (
                        <span className="flex items-center gap-1">
                          <Umbrella className="h-3.5 w-3.5" />
                          Sombra
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {inactivo && <Badge variant="secondary">Inactivo</Badge>}
                    {potrero.uso_actual && <Badge variant="outline">{potrero.uso_actual}</Badge>}
                  </div>
                </div>

                {/* Lotes adentro y carga */}
                {!inactivo && (
                  enPotrero.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Vacío</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-sm">
                        <span className="font-semibold tabular-nums">{cabezas}</span> {cabezas === 1 ? "cabeza" : "cabezas"}
                        {superficie > 0 && <span className="text-muted-foreground"> · {numero(cabezas / superficie, 2)} cab/ha</span>}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {enPotrero.map(({ lote, cabezas: c }) => (
                          <Link key={lote.id} href={`/lotes/${lote.id}`}
                            className="inline-flex min-h-11 items-center rounded-full bg-muted px-3 text-sm font-medium hover:bg-accent md:min-h-9">
                            {lote.nombre} <span className="ml-1 text-muted-foreground tabular-nums">· {c}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )
                )}
                {potrero.observaciones && <p className="mt-2 text-sm text-muted-foreground">{potrero.observaciones}</p>}

                <div className="flex flex-wrap gap-2 mt-3">
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
                  {puedeOperar && (inactivo ? (
                    <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => acciones.reactivar(potrero)}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Reactivar
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-11 md:h-8 text-muted-foreground" onClick={() => acciones.desactivar(potrero)}>
                      Desactivar
                    </Button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
