"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, MapPin, Ruler, TreePine, Droplets, Trash2, Edit2 } from "lucide-react"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PotreroForm } from "@/components/forms/PotreroForm"
import { ParcelaForm } from "@/components/forms/ParcelaForm"
import { desactivarParcela } from "@/lib/queries/parcelas"
import { desactivarPotrero, borrarPotreroFisico } from "@/lib/queries/potreros"
import { desactivarEstablecimiento, borrarEstablecimientoFisico } from "@/lib/queries/establecimientos"
import type { Establecimiento, Potrero, Parcela } from "@/types/database"
import { toast } from "sonner"
import { DeleteConfirmationModal } from "@/components/shared/DeleteConfirmationModal"

interface EstablecimientoDetalleProps {
  establecimiento: Establecimiento
  potreros: Potrero[]
  parcelas: Parcela[]
}

// Colores por uso actual del potrero
const badgeUso: Record<string, string> = {
  "Ganadería": "bg-green-100 text-green-800",
  "Agricultura": "bg-yellow-100 text-yellow-800",
  "Mixto": "bg-blue-100 text-blue-800",
  "Reserva": "bg-purple-100 text-purple-800",
  "Sin uso": "bg-gray-100 text-gray-600",
}

export function EstablecimientoDetalle({
  establecimiento,
  potreros,
  parcelas,
}: EstablecimientoDetalleProps) {
  const router = useRouter()
  const [dialogAbierto, setDialogAbierto] = useState(false)
  const [dialogParcelaAbierto, setDialogParcelaAbierto] = useState(false)
  const [potreroActivoParaParcela, setPotreroActivoParaParcela] = useState<number | null>(null)

  const [potreroAEditar, setPotreroAEditar] = useState<Potrero | null>(null)
  const [parcelaAEditar, setParcelaAEditar] = useState<Parcela | null>(null)

  // Estados de Delete Fuerte
  const [deleteModalEstablecimiento, setDeleteModalEstablecimiento] = useState(false)
  const [deleteModalPotrero, setDeleteModalPotrero] = useState<number | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Calcula la superficie total ocupada por potreros
  const superficieOcupada = potreros.reduce((sum, p) => sum + p.superficie, 0)

  const handlePotreroCreado = () => {
    setDialogAbierto(false)
    setPotreroAEditar(null)
    // Recarga los datos del Server Component
    router.refresh()
  }

  const abrirDialogPotrero = (potrero?: Potrero) => {
    setPotreroAEditar(potrero || null)
    setDialogAbierto(true)
  }

  const handleDesactivarParcela = async (parcelaId: number) => {
    if (!window.confirm("¿Estás seguro de que deseas desactivar esta parcela?")) return;
    try {
      await desactivarParcela(parcelaId);
      toast.success("Parcela desactivada correctamente");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar la parcela");
    }
  }

  const handleParcelaCreada = () => {
    setDialogParcelaAbierto(false)
    setPotreroActivoParaParcela(null)
    setParcelaAEditar(null)
    router.refresh()
  }

  const abrirDialogParcela = (potreroId: number, parcela?: Parcela) => {
    setPotreroActivoParaParcela(potreroId)
    setParcelaAEditar(parcela || null)
    setDialogParcelaAbierto(true)
  }

  // ACCIONES ESTABLECIMIENTO
  const handleDesactivarEstablecimiento = async () => {
    if (!window.confirm(`¿Estás seguro de que deseas desactivar el establecimiento ${establecimiento.nombre}? (Baja lógica)`)) return
    try {
      await desactivarEstablecimiento(establecimiento.id)
      toast.success("Establecimiento desactivado correctamente")
      router.push("/establecimientos")
    } catch (err: any) {
      toast.error(err.message || "Error al desactivar")
    }
  }

  const handleHardDeleteEstablecimiento = async () => {
    setIsDeleting(true)
    try {
      await borrarEstablecimientoFisico(establecimiento.id)
      toast.success("Establecimiento eliminado definitivamente")
      router.push("/establecimientos")
    } catch (err: any) {
      toast.error(err.message || "No se pudo eliminar")
      setDeleteModalEstablecimiento(false)
    } finally {
      setIsDeleting(false)
    }
  }

  // ACCIONES POTRERO
  const handleDesactivarPotrero = async (id: number) => {
    if (!window.confirm("¿Estás seguro de desactivar este potrero?")) return
    try {
      await desactivarPotrero(id)
      toast.success("Potrero desactivado correctamente")
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || "Error al desactivar potrero")
    }
  }

  const handleHardDeletePotrero = async (id: number) => {
    setIsDeleting(true)
    try {
      await borrarPotreroFisico(id)
      toast.success("Potrero eliminado definitivamente")
      setDeleteModalPotrero(null)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || "No se pudo eliminar")
      setDeleteModalPotrero(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Tarjeta de información del establecimiento */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl">{establecimiento.nombre}</CardTitle>
              <Badge variant="outline">{establecimiento.tipo}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/establecimientos/${establecimiento.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Edit2 className="h-4 w-4 mr-2" /> Editar
              </Link>
              <Button variant="secondary" size="sm" onClick={handleDesactivarEstablecimiento}>
                Desactivar
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteModalEstablecimiento(true)}>
                Eliminar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Departamento</dt>
              <dd className="font-medium">{establecimiento.departamento}</dd>
            </div>
            {establecimiento.localidad && (
              <div>
                <dt className="text-muted-foreground">Localidad</dt>
                <dd className="font-medium">{establecimiento.localidad}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Superficie total</dt>
              <dd className="font-medium">{establecimiento.superficie_total} ha</dd>
            </div>
            {establecimiento.propietario && (
              <div>
                <dt className="text-muted-foreground">Propietario</dt>
                <dd className="font-medium">{establecimiento.propietario}</dd>
              </div>
            )}
            {establecimiento.dicose && (
              <div>
                <dt className="text-muted-foreground">DICOSE</dt>
                <dd className="font-medium font-mono">{establecimiento.dicose}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Fecha de alta</dt>
              <dd className="font-medium">
                {new Date(establecimiento.fecha_alta + "T00:00:00").toLocaleDateString("es-UY")}
              </dd>
            </div>
          </dl>
          {establecimiento.observaciones && (
            <p className="mt-3 text-sm text-muted-foreground border-t pt-3">
              {establecimiento.observaciones}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sección de potreros */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold">Potreros</h2>
            {potreros.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {superficieOcupada.toFixed(1)} ha mapeadas de {establecimiento.superficie_total} ha totales
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => abrirDialogPotrero()}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>

        {potreros.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No hay potreros registrados todavía
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {potreros.map((potrero) => {
              const potreroParcelas = parcelas.filter((p) => p.potrero_id === potrero.id)
              
              return (
              <div
                key={potrero.id}
                className="flex flex-col rounded-lg border bg-card overflow-hidden"
              >
                {/* Cabecera del potrero */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border/10">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{potrero.nombre}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      badgeUso[potrero.uso_actual] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {potrero.uso_actual}
                  </span>
                  
                  <div className="flex items-center space-x-1 shrink-0 ml-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => abrirDialogPotrero(potrero)} title="Editar potrero">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => abrirDialogParcela(potrero.id)} className="h-7 px-2 text-xs border border-dashed rounded-md bg-secondary/30">
                      <Plus className="h-3 w-3 mr-1" /> Parcela
                    </Button>
                    <div className="w-[1px] h-4 bg-border mx-1"></div>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:bg-yellow-100/50 hover:text-yellow-700" onClick={() => handleDesactivarPotrero(potrero.id)}>
                      Desactivar
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteModalPotrero(potrero.id)} title="Borrar definitivo">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Lista de parcelas */}
                {potreroParcelas.length > 0 && (
                  <div className="bg-muted/30 px-4 py-3 space-y-2">
                    {potreroParcelas.map(parcela => (
                      <div key={parcela.id} className="flex items-center justify-between rounded border bg-background px-3 py-2 text-sm shadow-sm">
                        <div className="flex items-center">
                           <span className="font-medium">{parcela.nombre}</span>
                           <span className="text-muted-foreground ml-3">{parcela.superficie} ha</span>
                           <span className={`text-[10px] ml-3 px-1.5 py-0.5 rounded-full font-medium border ${badgeUso[parcela.uso_actual] ?? "bg-gray-100 text-gray-600"}`}>
                             {parcela.uso_actual}
                           </span>
                        </div>
                        <div className="flex border-l pl-2 space-x-1">
                           <Button title="Editar parcela" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => abrirDialogParcela(potrero.id, parcela)}>
                             <Edit2 className="h-3.5 w-3.5" />
                           </Button>
                           <Button title="Desactivar parcela" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => handleDesactivarParcela(parcela.id)}>
                             <Trash2 className="h-3.5 w-3.5" />
                           </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </div>

      {/* Dialog para agregar potrero */}
      <Dialog open={dialogAbierto} onOpenChange={(open) => {
        setDialogAbierto(open)
        if (!open) setPotreroAEditar(null)
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{potreroAEditar ? "Editar Potrero" : "Nuevo Potrero"}</DialogTitle>
          </DialogHeader>
          <PotreroForm
            establecimiento_id={establecimiento.id}
            initialData={potreroAEditar || undefined}
            onSuccess={handlePotreroCreado}
            onCancel={() => {
              setDialogAbierto(false)
              setPotreroAEditar(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog para agregar parcela */}
      <Dialog open={dialogParcelaAbierto} onOpenChange={(open) => {
        setDialogParcelaAbierto(open)
        if (!open) {
          setPotreroActivoParaParcela(null)
          setParcelaAEditar(null)
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{parcelaAEditar ? "Editar Parcela" : "Nueva Parcela"}</DialogTitle>
          </DialogHeader>
          {potreroActivoParaParcela && (
            <ParcelaForm
              establecimiento_id={establecimiento.id}
              potrero_id={potreroActivoParaParcela}
              initialData={parcelaAEditar || undefined}
              onSuccess={handleParcelaCreada}
              onCancel={() => {
                setDialogParcelaAbierto(false)
                setPotreroActivoParaParcela(null)
                setParcelaAEditar(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Modales de Delete Físico */}
      <DeleteConfirmationModal
        open={deleteModalEstablecimiento}
        onOpenChange={setDeleteModalEstablecimiento}
        onConfirm={handleHardDeleteEstablecimiento}
        title="Eliminar Establecimiento"
        description="Esta acción eliminará físicamente el establecimiento de la base de datos de manera definitiva. Esto requiere que el establecimiento NO tenga NINGÚN potrero ni animal dentro. Si tiene, se rechazará. Por favor, escriba 'ELIMINAR' para confirmar."
        isDeleting={isDeleting}
      />

      <DeleteConfirmationModal
        open={deleteModalPotrero !== null}
        onOpenChange={(open) => !open && setDeleteModalPotrero(null)}
        onConfirm={() => {
          if (deleteModalPotrero) handleHardDeletePotrero(deleteModalPotrero)
        }}
        title="Eliminar Potrero"
        description="Esta acción eliminará físicamente el potrero de la base de datos de manera definitiva. Requiere que no posea parcelas ni animales adentro. Escriba 'ELIMINAR' para confirmar."
        isDeleting={isDeleting}
      />
    </div>
  )
}
