"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ExcelUploadAnimales, type FilaEgreso } from "../ExcelUploadAnimales"
import { createMovimiento, trasladarAnimales } from "@/lib/queries/movimientos"
import { getEstablecimientos } from "@/lib/queries/establecimientos"
import { getPotreroOrigenBySNIG } from "@/lib/queries/animales"
import type { Establecimiento } from "@/types/database"

interface Props {
  establecimiento: Establecimiento
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

export function ModalTraslado({ establecimiento, caravanasActivas, onSuccess, onCancel }: Props) {
  const [enviando, setEnviando] = useState(false)
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([])
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [guiaSerie, setGuiaSerie] = useState('')
  const [guiaNumero, setGuiaNumero] = useState('')
  const [autorizacion, setAutorizacion] = useState('')
  const [destinoId, setDestinoId] = useState<number | null>(null)
  const [dicosePropDestino, setDicosePropDestino] = useState('')
  const [comentario, setComentario] = useState('')
  const [filas, setFilas] = useState<FilaEgreso[]>([])

  const dicoseFisicoOrigen = establecimiento.dicose_fisico ?? ''
  const destinoEstab = establecimientos.find(e => e.id === destinoId) ?? null
  const dicoseFisicoDestino = destinoEstab?.dicose_fisico ?? ''
  const cantidad = filas.filter(f => !f.error).length

  useEffect(() => {
    getEstablecimientos()
      .then(data => setEstablecimientos((data as Establecimiento[]).filter(e => e.id !== establecimiento.id)))
      .catch(() => {})
  }, [establecimiento.id])

  const guardar = async () => {
    if (!fecha) { toast.error('La fecha de traslado es requerida'); return }
    if (!guiaSerie || !guiaNumero) { toast.error('Serie y Número de Guía son requeridos'); return }
    if (!autorizacion) { toast.error('El Número de Autorización es requerido'); return }
    if (!destinoId) { toast.error('Seleccioná el establecimiento destino'); return }
    if (!dicosePropDestino) { toast.error('El DICOSE Propiedad Destino es requerido'); return }
    if (filas.length === 0) { toast.error('Cargá el archivo Excel con las caravanas'); return }
    if (filas.some(f => f.error)) { toast.error('El Excel tiene errores. Corregílos antes de guardar.'); return }

    setEnviando(true)
    try {
      const snigs = filas.map(f => f.caravana)
      const origenPotreroId = await getPotreroOrigenBySNIG(establecimiento.id, snigs)
      await trasladarAnimales(establecimiento.id, destinoId, snigs)

      const guia = `${guiaSerie}/${guiaNumero}`
      const obsJSON = JSON.stringify({
        subtipo: 'Traslado entre Establecimientos',
        establecimiento_origen_id: establecimiento.id,
        establecimiento_destino_id: destinoId,
        dicose_fisico_origen: dicoseFisicoOrigen,
        dicose_fisico_destino: dicoseFisicoDestino,
        dicose_propiedad_destino: dicosePropDestino,
      })

      await createMovimiento({
        establecimiento_id: establecimiento.id,
        fecha, tipo_movimiento: 'Traslado',
        categoria: 'Varios', cantidad,
        peso_promedio: null, peso_total: null,
        origen_tipo: origenPotreroId ? 'potrero' : null,
        origen_id: origenPotreroId,
        destino_tipo: null, destino_id: null,
        precio_unitario: null, precio_base: null, precio_total: null,
        contraparte: destinoEstab?.nombre ?? '',
        remito: autorizacion, guia_dgt: guia, finanza_id: null,
        observaciones: comentario ? `${comentario}\n${obsJSON}` : obsJSON,
        user_id: null,
      })

      toast.success(`${cantidad} animal(es) trasladados a ${destinoEstab?.nombre}`)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">

      <Seccion titulo="Fecha y Documentación">
        <div className="space-y-1.5">
          <Label>Fecha de Traslado <span className="text-destructive">*</span></Label>
          <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} max={new Date().toISOString().split('T')[0]} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Serie Guía <span className="text-destructive">*</span></Label>
            <Input placeholder="A" value={guiaSerie} onChange={e => setGuiaSerie(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Número Guía <span className="text-destructive">*</span></Label>
            <Input placeholder="123456" value={guiaNumero} onChange={e => setGuiaNumero(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Nro. Autorización <span className="text-destructive">*</span></Label>
            <Input placeholder="000000" value={autorizacion} onChange={e => setAutorizacion(e.target.value)} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Origen">
        <div className="space-y-1.5">
          <Label>DICOSE Físico</Label>
          <Input value={dicoseFisicoOrigen || '—'} readOnly className="bg-muted/50 text-muted-foreground font-mono" />
          <p className="text-xs text-muted-foreground">Del establecimiento activo (automático)</p>
        </div>
      </Seccion>

      <Seccion titulo="Destino">
        <div className="space-y-1.5">
          <Label>Establecimiento Destino <span className="text-destructive">*</span></Label>
          <Select value={destinoId?.toString() ?? ''} onValueChange={v => { if (v) { setDestinoId(Number(v)); setDicosePropDestino('') } }}>
            <SelectTrigger><SelectValue placeholder="Seleccionar establecimiento..." /></SelectTrigger>
            <SelectContent>
              {establecimientos.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>DICOSE Físico Destino</Label>
            <Input value={dicoseFisicoDestino || '—'} readOnly className="bg-muted/50 text-muted-foreground font-mono" />
            <p className="text-xs text-muted-foreground">Del establecimiento seleccionado</p>
          </div>
          <div className="space-y-1.5">
            <Label>DICOSE Propiedad Destino <span className="text-destructive">*</span></Label>
            <Input placeholder="9 dígitos o XX0000000" value={dicosePropDestino} onChange={e => setDicosePropDestino(e.target.value)} className="font-mono" />
          </div>
        </div>
      </Seccion>

      <Seccion titulo={`Caravanas a trasladar${cantidad > 0 ? ` — ${cantidad} animales` : ''}`}>
        <ExcelUploadAnimales modo="egreso" caravanasActivas={caravanasActivas} onChange={rows => setFilas(rows as FilaEgreso[])} />
      </Seccion>

      <div className="space-y-1.5">
        <Label>Comentario</Label>
        <textarea rows={2} placeholder="Notas adicionales..." value={comentario} onChange={e => setComentario(e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none" />
      </div>

      <div className="flex gap-3 pt-1 sticky bottom-0 bg-background pb-1 border-t">
        <Button onClick={guardar} disabled={enviando} className="flex-1">
          {enviando ? 'Registrando...' : `Registrar Traslado${cantidad > 0 ? ` (${cantidad})` : ''}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={enviando}>Cancelar</Button>
      </div>
    </div>
  )
}
