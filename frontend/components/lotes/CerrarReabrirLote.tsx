"use client"

import { useState } from "react"
import { toast } from "sonner"

import { cerrarLote, reabrirLote } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO, hoyLocal } from "@/components/lotes/formato"
import type { Lote } from "@/types/lotes"

/**
 * Cerrar un lote abierto (solo con stock en cero) o reabrir uno cerrado, con fecha y motivo.
 * Nada se borra: el lote cerrado conserva su historial y queda registro del cambio de estado.
 */
export function CerrarReabrirLote({ lote, cabezas, abierto, onCerrar, onHecho }: {
  lote: Lote
  cabezas: number            // stock actual del lote (para cerrar tiene que ser 0)
  abierto: boolean
  onCerrar: () => void
  onHecho: () => void
}) {
  const cerrar = lote.estado === "activo"
  const [fecha, setFecha] = useState(hoyLocal())
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await (cerrar ? cerrarLote : reabrirLote)(lote.id, fecha, motivo.trim() || null)
      toast.success(cerrar ? "Lote cerrado" : "Lote reabierto")
      onHecho()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={abre => { if (!abre) onCerrar() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{cerrar ? "Cerrar lote" : "Reabrir lote"}</DialogTitle>
          <DialogDescription>
            {cerrar
              ? "El lote deja de estar activo. No se borra: conserva su historial y sus archivos, y se puede reabrir."
              : "El lote vuelve a estar activo y se puede volver a cargar y editar."}
          </DialogDescription>
        </DialogHeader>

        {cerrar && cabezas > 0 ? (
          <div className="space-y-4">
            <p className="text-sm">
              El lote todavía tiene {cabezas} {cabezas === 1 ? "animal" : "animales"}. Para cerrarlo, el stock tiene que quedar en cero:
              con una venta, mortandad, división, unión o un ajuste.
            </p>
            <Button type="button" variant="outline" className={BOTON} onClick={onCerrar}>Entendido</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="estado-fecha">{cerrar ? "Fecha de cierre" : "Fecha de reapertura"}</Label>
              <Input id="estado-fecha" type="date" max={hoyLocal()} className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estado-motivo">Motivo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="estado-motivo" className={CAMPO} placeholder={cerrar ? "Ej: lote de prueba" : "Ej: se cerró por error"}
                value={motivo} onChange={e => setMotivo(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" className={BOTON} variant={cerrar ? "destructive" : "default"} disabled={enviando}>
                {enviando ? "Guardando..." : cerrar ? "Cerrar lote" : "Reabrir"}
              </Button>
              <Button type="button" variant="outline" className={BOTON} onClick={onCerrar} disabled={enviando}>Cancelar</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
