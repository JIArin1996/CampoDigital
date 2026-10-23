"use client"

import { useState } from "react"
import { toast } from "sonner"

import { cambiarPotreroLote } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import { sumarDias } from "@/components/calendario/fechas"
import type { Estadia, Potrero } from "@/types/database"

// Valor de "Sin potrero" en el selector ("" = todavía no se eligió a dónde va)
const SIN_POTRERO = "sin"

export interface LoteParaMover {
  id: string
  nombre: string
  fecha_apertura: string
}

interface Props {
  abierto: boolean
  onCerrar: () => void
  onHecho: () => void
  lotes: LoteParaMover[]                 // uno solo (desde el lote) o los elegibles (desde el potrero)
  potreros: Potrero[]                    // los activos
  estadias: Map<string, Estadia>         // estadía abierta de cada lote
  potreroDestino?: string                // "Ingresar lote" desde un potrero: el destino queda fijo
}

/**
 * Cambia un lote de potrero: sale de donde está y entra a otro (o queda sin potrero).
 * Por defecto, una sola fecha (hoy): sale y entra el mismo día. Con "Hubo días sin potrero" se
 * cargan la salida y el ingreso por separado (los días del medio, el lote estuvo sin potrero).
 * Se monta con una key por apertura: cada vez arranca limpio.
 */
export function CambiarPotreroDialog({ abierto, onCerrar, onHecho, lotes, potreros, estadias, potreroDestino }: Props) {
  const hoy = hoyLocal()
  const [loteId, setLoteId] = useState(lotes.length === 1 ? lotes[0].id : "")
  const [destino, setDestino] = useState(potreroDestino ?? "")
  const [fecha, setFecha] = useState(hoy)
  const [separado, setSeparado] = useState(false)
  const [salida, setSalida] = useState(hoy)
  const [ingreso, setIngreso] = useState(hoy)
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const lote = lotes.find(l => l.id === loteId)
  const actual = lote ? estadias.get(lote.id) : undefined
  const nombrePotrero = (id: string) => potreros.find(p => p.id === id)?.nombre ?? "otro potrero"
  const opciones = potreros.filter(p => p.id !== actual?.potrero_id)
  const sinPotrero = destino === SIN_POTRERO
  const conSalidaEIngreso = !!actual && !!destino && !sinPotrero

  // Límites: la salida, después del ingreso al potrero actual; el ingreso, desde la apertura del lote
  const minSalida = actual ? sumarDias(actual.fecha_ingreso, 1) : undefined
  const minIngreso = lote?.fecha_apertura

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!lote) return setError("Elegí el lote")
    if (!destino || (!actual && sinPotrero)) return setError(actual ? "Elegí a dónde pasa" : "Elegí a qué potrero entra")

    const fSalida = actual ? (conSalidaEIngreso && separado ? salida : fecha) : null
    const fIngreso = sinPotrero ? null : (conSalidaEIngreso && separado ? ingreso : fecha)
    if ((actual && !fSalida) || (!sinPotrero && !fIngreso)) return setError("Completá las fechas")
    if (fSalida && fIngreso && fIngreso < fSalida) return setError("El ingreso no puede ser anterior a la salida")

    setEnviando(true)
    try {
      await cambiarPotreroLote({ lote_id: lote.id, potrero_id: sinPotrero ? null : destino, fecha_salida: fSalida, fecha_ingreso: fIngreso, motivo: motivo.trim() || null })
      toast.success(sinPotrero ? `${lote.nombre} quedó sin potrero` : `${lote.nombre} pasó a ${nombrePotrero(destino)}`)
      onHecho()
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{potreroDestino ? `Ingresar lote a ${nombrePotrero(potreroDestino)}` : "Cambiar de potrero"}</DialogTitle>
          {lote && !potreroDestino && (
            <DialogDescription>
              {lote.nombre}: {actual ? `está en ${nombrePotrero(actual.potrero_id)} desde el ${fechaCorta(actual.fecha_ingreso)}` : "está sin potrero"}.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {lotes.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-lote">Lote</Label>
              <select id="cp-lote" className={SELECT_NATIVO} value={loteId}
                onChange={e => { setLoteId(e.target.value); if (!potreroDestino) setDestino("") }}>
                <option value="">Elegí un lote</option>
                {lotes.map(l => {
                  const est = estadias.get(l.id)
                  return <option key={l.id} value={l.id}>{l.nombre}{est ? ` (en ${nombrePotrero(est.potrero_id)})` : " (sin potrero)"}</option>
                })}
              </select>
            </div>
          )}

          {!potreroDestino && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-destino">Pasa a</Label>
              <select id="cp-destino" className={SELECT_NATIVO} value={destino} onChange={e => setDestino(e.target.value)}>
                <option value="" disabled>{actual ? "Elegí a dónde pasa" : "Elegí un potrero"}</option>
                {opciones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                {actual && <option value={SIN_POTRERO}>Sin potrero (corral, camión, venta...)</option>}
              </select>
            </div>
          )}

          {conSalidaEIngreso && separado ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp-salida">Salió el</Label>
                <Input id="cp-salida" type="date" className={CAMPO} min={minSalida} max={hoy} value={salida} onChange={e => setSalida(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-ingreso">Entró el</Label>
                <Input id="cp-ingreso" type="date" className={CAMPO} min={salida || minIngreso} max={hoy} value={ingreso} onChange={e => setIngreso(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="cp-fecha">{!actual ? "Entró el" : sinPotrero ? "Salió el" : "Fecha del cambio"}</Label>
              <Input id="cp-fecha" type="date" className={CAMPO} min={actual ? minSalida : minIngreso} max={hoy} value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
          )}

          {conSalidaEIngreso && (
            <label className="flex items-center gap-2 min-h-11 cursor-pointer select-none w-fit">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={separado}
                onChange={e => { setSeparado(e.target.checked); setSalida(fecha); setIngreso(fecha) }} />
              <span className="text-sm">Hubo días sin potrero (salida e ingreso en fechas distintas)</span>
            </label>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cp-motivo">Motivo (opcional)</Label>
            <Input id="cp-motivo" className={CAMPO} placeholder="Ej: rotación, falta de pasto, aguada seca" value={motivo} onChange={e => setMotivo(e.target.value)} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Guardando..." : "Guardar"}</Button>
            <Button type="button" variant="outline" className={BOTON} onClick={onCerrar} disabled={enviando}>Cancelar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
