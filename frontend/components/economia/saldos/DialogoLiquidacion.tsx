"use client"

import { useState } from "react"
import { toast } from "sonner"

import { registrarLiquidacion } from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { CampoMonto } from "@/components/economia/CampoMonto"
import { CampoTipoCambio } from "@/components/economia/CampoTipoCambio"
import { leerPrecio, montoATexto, tipoCambioVacio, type TipoCambioForm } from "@/components/economia/formato"
import { hoyLocal } from "@/components/lotes/formato"
import { nuevoId } from "@/components/actividades/formato"
import type { Moneda } from "@/types/actividades"
import type { TipoParte } from "@/types/economia"

export interface Parte { clave: string; tipo: TipoParte; id: string; nombre: string }

// "titular:<id>" o "pagador:<id>"
export const claveParte = (tipo: string, id: string) => `${tipo}:${id}`

/**
 * Registrar que una parte le pasó plata a otra ("Juan le pasó USD 2.000 a Madre"). Desde el detalle de un
 * saldo viene precargada: el que debe le pasa al que le deben el saldo entero. No se edita: se anula y se carga de nuevo.
 */
export function DialogoLiquidacion({ abierto, establecimientoId, partes, inicial, onCerrar, onHecho }: {
  abierto: boolean
  establecimientoId: string
  partes: Parte[]
  inicial?: { de: string; a: string; montoUsd: number } | null
  onCerrar: () => void
  onHecho: () => void
}) {
  // Un id por formulario abierto (idempotencia: un doble toque no la registra dos veces)
  const [id] = useState(nuevoId)
  const [fecha, setFecha] = useState(hoyLocal())
  const [de, setDe] = useState(inicial?.de ?? "")
  const [a, setA] = useState(inicial?.a ?? "")
  const [monto, setMonto] = useState(inicial ? montoATexto(inicial.montoUsd) : "")
  const [moneda, setMoneda] = useState<Moneda>("USD")
  const [tipoCambio, setTipoCambio] = useState<TipoCambioForm>(tipoCambioVacio)
  const [observacion, setObservacion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const guardar = async () => {
    const parteDe = partes.find(p => p.clave === de)
    const parteA = partes.find(p => p.clave === a)
    if (!parteDe || !parteA) return setError("Elegí quién pasó la plata y quién la recibió")
    if (parteDe.clave === parteA.clave) return setError("Quien paga y quien recibe no pueden ser el mismo")
    if (!fecha || fecha > hoyLocal()) return setError("La fecha no puede estar vacía ni ser futura")
    const leido = leerPrecio({ monto, moneda, tipoCambio, estado: "pagado", vencimiento: "" }, fecha)
    if ("error" in leido) return setError(leido.error)
    if (observacion.trim().length > 500) return setError("La observación tiene hasta 500 caracteres")
    setEnviando(true)
    setError(null)
    try {
      await registrarLiquidacion({
        id, establecimiento_id: establecimientoId, fecha, de: { tipo: parteDe.tipo, id: parteDe.id }, a: { tipo: parteA.tipo, id: parteA.id },
        precio: leido.precio, observacion: observacion.trim(),
      })
      toast.success("Liquidación registrada")
      onHecho()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const opciones = (excluir: string) => partes.filter(p => p.clave !== excluir).map(p => <option key={p.clave} value={p.clave}>{p.nombre}</option>)

  return (
    <Dialog open={abierto} onOpenChange={abre => { if (!abre) onCerrar() }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar liquidación</DialogTitle>
          <DialogDescription>Una parte le pasó plata a otra. No es ingreso ni gasto: solo cambia los saldos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="liq-fecha">Fecha</Label>
            <Input id="liq-fecha" type="date" max={hoyLocal()} className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="liq-de">Pasó la plata</Label>
              <select id="liq-de" className={SELECT_NATIVO} value={de} onChange={e => setDe(e.target.value)}>
                <option value="">Elegí</option>
                {opciones(a)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="liq-a">La recibió</Label>
              <select id="liq-a" className={SELECT_NATIVO} value={a} onChange={e => setA(e.target.value)}>
                <option value="">Elegí</option>
                {opciones(de)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="liq-monto">Monto</Label>
              <CampoMonto id="liq-monto" valor={monto} moneda={moneda} onCambio={setMonto} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="liq-moneda">Moneda</Label>
              <select id="liq-moneda" className={SELECT_NATIVO} value={moneda} onChange={e => setMoneda(e.target.value as Moneda)}>
                <option value="USD">Dólares (USD)</option>
                <option value="UYU">Pesos (UYU)</option>
              </select>
            </div>
          </div>
          {moneda === "UYU" && (
            <div className="space-y-1.5">
              <Label htmlFor="liq-tc">Tipo de cambio (pesos por dólar)</Label>
              <CampoTipoCambio id="liq-tc" fecha={fecha} valor={tipoCambio} onCambio={setTipoCambio} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="liq-obs">Observación <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input id="liq-obs" className={CAMPO} maxLength={500} placeholder="Ej: transferencia del 20/10" value={observacion}
              onChange={e => setObservacion(e.target.value)} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" className={BOTON} disabled={enviando} onClick={() => void guardar()}>{enviando ? "Guardando..." : "Registrar"}</Button>
          <Button type="button" variant="outline" className={BOTON} onClick={onCerrar} disabled={enviando}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
