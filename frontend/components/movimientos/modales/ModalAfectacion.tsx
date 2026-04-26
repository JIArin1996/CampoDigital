"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ExcelUploadAnimales, type FilaEgreso } from "../ExcelUploadAnimales"
import { validarDicosePropiedad } from "@/lib/utils/snig"
import { createMovimiento } from "@/lib/queries/movimientos"
import type { Establecimiento } from "@/types/database"

interface Props {
  establecimiento: Establecimiento
  subtipo: 'Afectación a Fideicomiso' | 'Afectación a Capitalización' | 'Afectación a Consignación sin Movimiento'
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

export function ModalAfectacion({ establecimiento, subtipo, caravanasActivas, onSuccess, onCancel }: Props) {
  const [enviando, setEnviando] = useState(false)
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [guiaSerie, setGuiaSerie] = useState('')
  const [guiaNumero, setGuiaNumero] = useState('')
  const [autorizacion, setAutorizacion] = useState('')
  const [dicosePropNuevo, setDicosePropNuevo] = useState('')
  const [comentario, setComentario] = useState('')
  const [filas, setFilas] = useState<FilaEgreso[]>([])

  const cantidad = filas.filter(f => !f.error).length

  const guardar = async () => {
    if (!fecha) { toast.error('La fecha es requerida'); return }
    if (!guiaSerie || !guiaNumero) { toast.error('Serie y Número de Guía son requeridos'); return }
    if (!autorizacion) { toast.error('El Número de Autorización es requerido'); return }
    if (!dicosePropNuevo) { toast.error('El DICOSE Propiedad del nuevo titular es requerido'); return }
    if (!validarDicosePropiedad(dicosePropNuevo)) { toast.error('DICOSE Propiedad Nuevo Titular inválido'); return }
    if (filas.length === 0) { toast.error('Cargá el archivo Excel con las caravanas'); return }
    if (filas.some(f => f.error)) { toast.error('El Excel tiene errores. Corregílos antes de guardar.'); return }

    setEnviando(true)
    try {
      const guia = `${guiaSerie}/${guiaNumero}`
      const obsJSON = JSON.stringify({ subtipo, dicose_propiedad_nuevo_titular: dicosePropNuevo, caravanas: filas.map(f => f.caravana) })

      await createMovimiento({
        establecimiento_id: establecimiento.id,
        fecha, tipo_movimiento: 'Ajuste',
        categoria: 'Varios', cantidad,
        peso_promedio: null, peso_total: null,
        origen_tipo: null, origen_id: null,
        destino_tipo: null, destino_id: null,
        precio_unitario: null, precio_base: null, precio_total: null,
        contraparte: dicosePropNuevo,
        remito: autorizacion, guia_dgt: guia, finanza_id: null,
        observaciones: comentario ? `${comentario}\n${obsJSON}` : obsJSON,
        user_id: null,
      })

      toast.success(`${cantidad} animal(es) afectados: ${subtipo}`)
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
          <Label>Fecha <span className="text-destructive">*</span></Label>
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

      <Seccion titulo="Cambio de Titularidad">
        <div className="space-y-1.5">
          <Label>DICOSE Propiedad Actual</Label>
          <Input value="Se toma de las caravanas del Excel" readOnly className="bg-muted/50 text-muted-foreground text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label>DICOSE Propiedad Nuevo Titular <span className="text-destructive">*</span></Label>
          <Input placeholder="9 dígitos o XX0000000" value={dicosePropNuevo} onChange={e => setDicosePropNuevo(e.target.value)} className="font-mono" />
          {dicosePropNuevo && !validarDicosePropiedad(dicosePropNuevo) && <p className="text-xs text-destructive">Formato inválido (9 dígitos o 2 letras + 7 números)</p>}
        </div>
      </Seccion>

      <Seccion titulo={`Caravanas a afectar${cantidad > 0 ? ` — ${cantidad} animales` : ''}`}>
        <ExcelUploadAnimales modo="egreso" caravanasActivas={caravanasActivas} onChange={rows => setFilas(rows as FilaEgreso[])} />
      </Seccion>

      <div className="space-y-1.5">
        <Label>Comentario</Label>
        <textarea rows={2} placeholder="Notas adicionales..." value={comentario} onChange={e => setComentario(e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none" />
      </div>

      <div className="flex gap-3 pt-1 sticky bottom-0 bg-background pb-1 border-t">
        <Button onClick={guardar} disabled={enviando} className="flex-1">
          {enviando ? 'Registrando...' : `Registrar Afectación${cantidad > 0 ? ` (${cantidad})` : ''}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={enviando}>Cancelar</Button>
      </div>
    </div>
  )
}
