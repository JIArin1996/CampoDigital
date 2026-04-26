"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ExcelUploadAnimales, type FilaEgreso } from "../ExcelUploadAnimales"
import { createMovimiento, cambiarPotreroAnimales } from "@/lib/queries/movimientos"
import type { Establecimiento, Potrero } from "@/types/database"

interface Props {
  establecimiento: Establecimiento
  potreros: Potrero[]
  caravanasActivas: string[]
  onSuccess: () => void
  onCancel: () => void
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1">{titulo}</p>
      {children}
    </div>
  )
}

export function ModalCambioPotrero({ establecimiento, potreros, caravanasActivas, onSuccess, onCancel }: Props) {
  const [enviando, setEnviando] = useState(false)
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [potreroDestino, setPotreroDestino] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [filas, setFilas] = useState<FilaEgreso[]>([])

  const potrerosActivos = potreros.filter(p => p.estado === 'activo')
  const cantidad = filas.filter(f => !f.error).length

  const guardar = async () => {
    if (!fecha) { toast.error('La fecha es requerida'); return }
    if (!potreroDestino) { toast.error('Seleccioná el potrero destino'); return }
    if (filas.length === 0) { toast.error('Cargá el archivo Excel con las caravanas'); return }
    if (filas.some(f => f.error)) { toast.error('El Excel tiene errores. Corregílos antes de guardar.'); return }

    setEnviando(true)
    try {
      await cambiarPotreroAnimales(establecimiento.id, filas.map(f => f.caravana), potreroDestino)

      await createMovimiento({
        establecimiento_id: establecimiento.id,
        fecha, tipo_movimiento: 'Traslado',
        categoria: 'Varios', cantidad,
        peso_promedio: null, peso_total: null,
        origen_tipo: null, origen_id: null,
        destino_tipo: 'potrero', destino_id: potreroDestino,
        precio_unitario: null, precio_base: null, precio_total: null,
        contraparte: null, remito: null, guia_dgt: null, finanza_id: null,
        observaciones: JSON.stringify({ subtipo: 'Cambio de Potrero', potrero_destino_id: potreroDestino, ...(comentario ? { comentario } : {}) }),
        user_id: null,
      })

      const nombrePotrero = potrerosActivos.find(p => p.id === potreroDestino)?.nombre ?? potreroDestino
      toast.success(`${cantidad} animal(es) movidos al potrero ${nombrePotrero}`)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">

      <Seccion titulo="Fecha y Destino">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Fecha <span className="text-destructive">*</span></Label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} max={new Date().toISOString().split('T')[0]} />
          </div>
          <div className="space-y-1.5">
            <Label>Potrero Destino <span className="text-destructive">*</span></Label>
            <Select value={potreroDestino?.toString() ?? ''} onValueChange={v => v && setPotreroDestino(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Seleccionar potrero..." /></SelectTrigger>
              <SelectContent>
                {potrerosActivos.length === 0 && <SelectItem value="__none__" disabled>Sin potreros activos</SelectItem>}
                {potrerosActivos.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.nombre} ({p.superficie} ha)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Seccion>

      <Seccion titulo={`Caravanas a mover${cantidad > 0 ? ` — ${cantidad} animales` : ''}`}>
        <ExcelUploadAnimales modo="egreso" caravanasActivas={caravanasActivas} onChange={rows => setFilas(rows as FilaEgreso[])} />
      </Seccion>

      <div className="space-y-1.5">
        <Label>Comentario</Label>
        <textarea rows={2} placeholder="Notas adicionales..." value={comentario} onChange={e => setComentario(e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none" />
      </div>

      <div className="flex gap-3 pt-1 sticky bottom-0 bg-background pb-1 border-t">
        <Button onClick={guardar} disabled={enviando} className="flex-1">
          {enviando ? 'Registrando...' : `Cambiar Potrero${cantidad > 0 ? ` (${cantidad} animales)` : ''}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={enviando}>Cancelar</Button>
      </div>
    </div>
  )
}
