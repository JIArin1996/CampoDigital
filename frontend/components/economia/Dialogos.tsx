"use client"

import { useState } from "react"
import { toast } from "sonner"

import { anularMovimiento, marcarPagado } from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO } from "@/components/shared/estilos"
import { hoyLocal } from "@/components/lotes/formato"

interface MovimientoBasico {
  id: string
  concepto: string
  sentido: "ingreso" | "egreso"
  fecha: string
}

// Pendiente → cobrado o pagado, con la fecha (entre la del movimiento y hoy)
export function DialogoPagar({ movimiento, onCerrar, onHecho }: {
  movimiento: MovimientoBasico | null
  onCerrar: () => void
  onHecho: () => void
}) {
  const [fecha, setFecha] = useState(hoyLocal())
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const ingreso = movimiento?.sentido === "ingreso"

  const confirmar = async () => {
    if (!movimiento) return
    setEnviando(true)
    setError(null)
    try {
      await marcarPagado(movimiento.id, fecha)
      toast.success(ingreso ? "Marcado como cobrado" : "Marcado como pagado")
      onHecho()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={movimiento !== null} onOpenChange={abre => { if (!abre) onCerrar() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{ingreso ? "Marcar cobrado" : "Marcar pagado"}</DialogTitle>
          <DialogDescription>{movimiento?.concepto}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="pagar-fecha">Fecha de {ingreso ? "cobro" : "pago"}</Label>
          <Input id="pagar-fecha" type="date" min={movimiento?.fecha} max={hoyLocal()} className={CAMPO}
            value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" className={BOTON} disabled={enviando} onClick={() => void confirmar()}>Confirmar</Button>
          <Button type="button" variant="outline" className={BOTON} onClick={onCerrar}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Anular un movimiento cargado a mano, con motivo. No se borra: queda anulado y deja de contar.
export function DialogoAnular({ movimiento, onCerrar, onHecho }: {
  movimiento: MovimientoBasico | null
  onCerrar: () => void
  onHecho: () => void
}) {
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const confirmar = async () => {
    if (!movimiento) return
    if (!motivo.trim()) return setError("Indicá el motivo")
    setEnviando(true)
    setError(null)
    try {
      await anularMovimiento(movimiento.id, motivo.trim())
      toast.success("Movimiento anulado")
      setMotivo("")
      onHecho()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={movimiento !== null} onOpenChange={abre => { if (!abre) onCerrar() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular movimiento</DialogTitle>
          <DialogDescription>
            {movimiento?.concepto}. No se borra: queda anulado, con el motivo, y deja de contar en el resultado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="anular-motivo">Motivo</Label>
          <Input id="anular-motivo" className={CAMPO} placeholder="Ej: cargado dos veces" value={motivo} onChange={e => setMotivo(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="destructive" className={BOTON} disabled={enviando} onClick={() => void confirmar()}>Anular</Button>
          <Button type="button" variant="outline" className={BOTON} onClick={onCerrar}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
