"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, MapPin, Ruler, TreePine, Droplets, Edit2, LogIn, History, RotateCcw, Umbrella } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PotreroForm } from "@/components/forms/PotreroForm"
import { CambiarPotreroDialog } from "@/components/potreros/CambiarPotreroDialog"
import { HistorialPotrero } from "@/components/potreros/HistorialPotrero"
import { desactivarPotrero, reactivarPotrero } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { cn } from "@/lib/utils"
import type { Establecimiento, Estadia, Potrero } from "@/types/database"
import type { Lote, StockLote } from "@/types/lotes"

interface ListaPotrerosProps {
  establecimiento: Establecimiento
  potreros: Potrero[]                  // activos e inactivos
  lotes: Lote[]                        // los activos
  stock: StockLote[]
  estadias: Map<string, Estadia>       // estadía abierta de cada lote
  puedeOperar: boolean                 // administrador u operador
  onRefresh: () => void
}

const numero = (n: number, decimales = 1) => n.toLocaleString("es-UY", { maximumFractionDigits: decimales })

/**
 * Potreros del establecimiento: qué lotes tienen adentro, cabezas y cabezas por hectárea.
 * Alta, edición, ingresar un lote, historial, baja lógica (solo vacíos) y reactivación.
 * (Los datos del establecimiento se ven en el Inicio.)
 */
export function ListaPotreros({ establecimiento, potreros, lotes, stock, estadias, puedeOperar, onRefresh }: ListaPotrerosProps) {
  const [dialogAbierto, setDialogAbierto] = useState(false)
  const [potreroAEditar, setPotreroAEditar] = useState<Potrero | null>(null)
  const [ingresarA, setIngresarA] = useState<Potrero | null>(null)
  const [historialDe, setHistorialDe] = useState<Potrero | null>(null)
  const [verInactivos, setVerInactivos] = useState(false)

  const activos = potreros.filter(p => p.estado === "activo")
  const visibles = verInactivos ? potreros : activos
  const inactivos = potreros.length - activos.length

  // Superficie total de los potreros activos
  const superficieOcupada = activos.reduce((sum, p) => sum + Number(p.superficie), 0)

  // Lotes adentro de cada potrero, con sus cabezas
  const cabezasDe = (loteId: string) => stock.filter(s => s.lote_id === loteId).reduce((s, x) => s + x.cabezas, 0)
  const adentro = (potreroId: string) =>
    lotes.filter(l => estadias.get(l.id)?.potrero_id === potreroId).map(l => ({ lote: l, cabezas: cabezasDe(l.id) }))

  const abrirDialogPotrero = (potrero?: Potrero) => {
    setPotreroAEditar(potrero ?? null)
    setDialogAbierto(true)
  }

  const cerrarDialog = () => {
    setDialogAbierto(false)
    setPotreroAEditar(null)
  }

  // Baja lógica (no hay borrado). Con lotes adentro no se puede: primero se mueven.
  const handleDesactivarPotrero = async (potrero: Potrero) => {
    const conLotes = adentro(potrero.id)
    if (conLotes.length > 0) {
      toast.error(`${potrero.nombre} tiene lotes adentro (${conLotes.map(x => x.lote.nombre).join(", ")}): primero movelos a otro potrero`)
      return
    }
    if (!window.confirm(`¿Desactivar el potrero "${potrero.nombre}"? Se puede reactivar después.`)) return
    try {
      await desactivarPotrero(potrero.id)
      toast.success("Potrero desactivado")
      onRefresh()
    } catch (err) {
      toast.error(mensajeDeError(err, "Error al desactivar el potrero"))
    }
  }

  const handleReactivar = async (potrero: Potrero) => {
    try {
      await reactivarPotrero(potrero.id)
      toast.success(`${potrero.nombre} reactivado`)
      onRefresh()
    } catch (err) {
      toast.error(mensajeDeError(err, "Error al reactivar el potrero"))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold">Potreros</h1>
            {activos.length > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {numero(superficieOcupada)} ha
                {establecimiento.superficie_total ? ` de ${numero(establecimiento.superficie_total)} ha totales` : " en total"}
              </p>
            )}
          </div>
          {puedeOperar && (
            <Button className="h-11 md:h-8" size="sm" onClick={() => abrirDialogPotrero()}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          )}
        </div>

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
              const enPotrero = adentro(potrero.id)
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
                              className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 text-sm font-medium hover:bg-accent">
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
                        <Button size="sm" className="h-11 md:h-8" onClick={() => setIngresarA(potrero)}>
                          <LogIn className="h-4 w-4 mr-1" /> Ingresar lote
                        </Button>
                        <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => abrirDialogPotrero(potrero)}>
                          <Edit2 className="h-4 w-4 mr-1" /> Editar
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => setHistorialDe(potrero)}>
                      <History className="h-4 w-4 mr-1" /> Historial
                    </Button>
                    {puedeOperar && (inactivo ? (
                      <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => handleReactivar(potrero)}>
                        <RotateCcw className="h-4 w-4 mr-1" /> Reactivar
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-11 md:h-8 text-muted-foreground" onClick={() => handleDesactivarPotrero(potrero)}>
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

      {/* Alta y edición de potrero */}
      <Dialog open={dialogAbierto} onOpenChange={open => (open ? setDialogAbierto(true) : cerrarDialog())}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{potreroAEditar ? "Editar potrero" : "Nuevo potrero"}</DialogTitle>
          </DialogHeader>
          <PotreroForm
            establecimiento_id={establecimiento.id}
            initialData={potreroAEditar ?? undefined}
            onSuccess={() => {
              cerrarDialog()
              onRefresh()
            }}
            onCancel={cerrarDialog}
          />
        </DialogContent>
      </Dialog>

      {/* Ingresar un lote al potrero: los lotes activos que no están en él */}
      {ingresarA && (
        <CambiarPotreroDialog key={ingresarA.id} abierto potreroDestino={ingresarA.id}
          onCerrar={() => setIngresarA(null)}
          onHecho={() => { setIngresarA(null); onRefresh() }}
          lotes={lotes.filter(l => estadias.get(l.id)?.potrero_id !== ingresarA.id)}
          potreros={activos} estadias={estadias} />
      )}

      {historialDe && <HistorialPotrero potrero={historialDe} onCerrar={() => setHistorialDe(null)} />}
    </div>
  )
}
