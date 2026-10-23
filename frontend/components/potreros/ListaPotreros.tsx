"use client"

import { useState } from "react"
import { Plus, MapPin, Ruler, TreePine, Droplets, Edit2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PotreroForm } from "@/components/forms/PotreroForm"
import { desactivarPotrero } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import type { Establecimiento, Potrero } from "@/types/database"

interface ListaPotrerosProps {
  establecimiento: Establecimiento
  potreros: Potrero[]
  puedeOperar: boolean                 // administrador u operador
  onRefresh: () => void
}

/**
 * Potreros activos del establecimiento, con alta, edición y baja lógica.
 * (Los datos del establecimiento se ven en el Inicio.)
 */
export function ListaPotreros({ establecimiento, potreros, puedeOperar, onRefresh }: ListaPotrerosProps) {
  const [dialogAbierto, setDialogAbierto] = useState(false)
  const [potreroAEditar, setPotreroAEditar] = useState<Potrero | null>(null)

  // Superficie total ocupada por potreros
  const superficieOcupada = potreros.reduce((sum, p) => sum + Number(p.superficie), 0)

  const abrirDialogPotrero = (potrero?: Potrero) => {
    setPotreroAEditar(potrero ?? null)
    setDialogAbierto(true)
  }

  const cerrarDialog = () => {
    setDialogAbierto(false)
    setPotreroAEditar(null)
  }

  // Baja lógica (no hay borrado)
  const handleDesactivarPotrero = async (potrero: Potrero) => {
    if (!window.confirm(`¿Desactivar el potrero "${potrero.nombre}"?`)) return
    try {
      await desactivarPotrero(potrero.id)
      toast.success("Potrero desactivado")
      onRefresh()
    } catch (err) {
      toast.error(mensajeDeError(err, "Error al desactivar el potrero"))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold">Potreros</h1>
            {potreros.length > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {superficieOcupada.toFixed(1)} ha
                {establecimiento.superficie_total ? ` de ${establecimiento.superficie_total} ha totales` : " en total"}
              </p>
            )}
          </div>
          {puedeOperar && (
            <Button className="h-10 md:h-8" size="sm" onClick={() => abrirDialogPotrero()}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          )}
        </div>

        {potreros.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No hay potreros registrados todavía</p>
          </div>
        ) : (
          <div className="space-y-3">
            {potreros.map(potrero => (
              <div key={potrero.id} className="rounded-lg border bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{potrero.nombre}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Ruler className="h-3 w-3" />
                        {potrero.superficie} ha
                      </span>
                      {potrero.tipo_pastura && (
                        <span className="flex items-center gap-1">
                          <TreePine className="h-3 w-3" />
                          {potrero.tipo_pastura}
                        </span>
                      )}
                      {potrero.aguada && (
                        <span className="flex items-center gap-1">
                          <Droplets className="h-3 w-3" />
                          Aguada
                        </span>
                      )}
                    </div>
                  </div>
                  {potrero.uso_actual && <Badge variant="outline">{potrero.uso_actual}</Badge>}
                </div>

                {puedeOperar && (
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => abrirDialogPotrero(potrero)}>
                      <Edit2 className="h-4 w-4 mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-10 md:h-8 text-muted-foreground" onClick={() => handleDesactivarPotrero(potrero)}>
                      Desactivar
                    </Button>
                  </div>
                )}
              </div>
            ))}
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
    </div>
  )
}
