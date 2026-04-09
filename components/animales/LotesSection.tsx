"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Layers } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import {
  getLotesManejo,
  createLoteManejo,
  deleteLoteManejo,
  type LoteManejo,
} from "@/lib/queries/lotes_manejo"

export function LotesSection() {
  const { establecimientoActivo } = useEstablecimiento()
  const [lotes, setLotes] = useState<LoteManejo[]>([])
  const [cargando, setCargando] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [creando, setCreando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)

  const cargar = async () => {
    if (!establecimientoActivo) return
    setCargando(true)
    try {
      setLotes(await getLotesManejo(establecimientoActivo.id))
    } catch (e: any) {
      toast.error(e.message || "Error al cargar lotes")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [establecimientoActivo?.id])

  const handleCrear = async () => {
    if (!establecimientoActivo || !nombre.trim()) return
    setCreando(true)
    try {
      await createLoteManejo({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        establecimiento_id: establecimientoActivo.id,
        estado: "activo",
        user_id: null,
      })
      toast.success("Lote creado")
      setNombre("")
      setDescripcion("")
      setDialogOpen(false)
      cargar()
    } catch (e: any) {
      toast.error(e.message || "Error al crear lote")
    } finally {
      setCreando(false)
    }
  }

  const handleEliminar = async (lote: LoteManejo) => {
    if (!window.confirm(`¿Eliminar el lote "${lote.nombre}"? Solo es posible si no tiene animales activos.`)) return
    setEliminandoId(lote.id)
    try {
      await deleteLoteManejo(lote.id)
      toast.success("Lote eliminado")
      cargar()
    } catch (e: any) {
      toast.error(e.message || "No se pudo eliminar el lote")
    } finally {
      setEliminandoId(null)
    }
  }

  if (!establecimientoActivo) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground text-sm">
        Seleccioná un establecimiento para gestionar lotes.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Lotes de Manejo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Agrupaciones temporales de animales para manejo a campo
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo Lote
        </Button>
      </div>

      {cargando ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-14 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : lotes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Layers className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            No hay lotes de manejo activos.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Creá un lote para agrupar animales temporalmente.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lotes.map(lote => (
            <div
              key={lote.id}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
            >
              <div>
                <p className="font-medium text-sm">{lote.nombre}</p>
                {lote.descripcion && (
                  <p className="text-xs text-muted-foreground mt-0.5">{lote.descripcion}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                disabled={eliminandoId === lote.id}
                onClick={() => handleEliminar(lote)}
                title="Eliminar lote"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) { setNombre(""); setDescripcion("") } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo Lote de Manejo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Ej: Lote A — Invernada"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCrear()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input
                placeholder="Opcional..."
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creando}>
              Cancelar
            </Button>
            <Button onClick={handleCrear} disabled={creando || !nombre.trim()}>
              {creando ? "Creando..." : "Crear Lote"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
