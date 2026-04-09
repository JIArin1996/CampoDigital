"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getLotesManejo,
  asignarAnimalALote,
  type LoteManejo,
} from "@/lib/queries/lotes_manejo"

interface AsignarLoteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  animalesIds: number[]
  establecimientoId: number
  onSuccess: () => void
}

export function AsignarLoteModal({
  open,
  onOpenChange,
  animalesIds,
  establecimientoId,
  onSuccess,
}: AsignarLoteModalProps) {
  const [lotes, setLotes] = useState<LoteManejo[]>([])
  const [loteId, setLoteId] = useState("")
  const [fechaEntrada, setFechaEntrada] = useState(() => new Date().toISOString().split("T")[0])
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    if (open && establecimientoId) {
      getLotesManejo(establecimientoId).then(setLotes).catch(() => {})
    }
  }, [open, establecimientoId])

  const handleAsignar = async () => {
    if (!loteId) {
      toast.error("Seleccioná un lote")
      return
    }
    setProcesando(true)
    let errores = 0
    for (const id of animalesIds) {
      try {
        await asignarAnimalALote(id, Number(loteId), fechaEntrada)
      } catch {
        errores++
      }
    }
    setProcesando(false)
    const asignados = animalesIds.length - errores
    if (errores === 0) {
      toast.success(`${asignados} animal${asignados !== 1 ? "es" : ""} asignado${asignados !== 1 ? "s" : ""} al lote`)
    } else {
      toast.warning(`${asignados} asignado(s), ${errores} con error`)
    }
    setLoteId("")
    onSuccess()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar a Lote de Manejo</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {animalesIds.length} animal{animalesIds.length !== 1 ? "es" : ""} seleccionado{animalesIds.length !== 1 ? "s" : ""}
        </p>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Lote de Manejo <span className="text-destructive">*</span></Label>
            {lotes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No hay lotes creados. Creá uno primero en la pestaña "Lotes".
              </p>
            ) : (
              <Select value={loteId} onValueChange={v => v !== null && setLoteId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(val: string | null) =>
                      val
                        ? (lotes.find(l => l.id.toString() === val)?.nombre ?? val)
                        : <span className="text-muted-foreground">Seleccionar lote...</span>
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {lotes.map(l => (
                    <SelectItem key={l.id} value={l.id.toString()}>
                      {l.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de Entrada</Label>
            <Input
              type="date"
              value={fechaEntrada}
              onChange={e => setFechaEntrada(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={procesando}>
            Cancelar
          </Button>
          <Button onClick={handleAsignar} disabled={procesando || !loteId || lotes.length === 0}>
            {procesando ? "Asignando..." : "Confirmar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
