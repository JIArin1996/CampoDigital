"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ExcelUploadAnimales, type FilaEgreso } from "../ExcelUploadAnimales"
import { validarDicoseFisico, validarDicosePropiedad } from "@/lib/utils/snig"
import { createMovimiento, darBajaAnimalPorSNIG } from "@/lib/queries/movimientos"
import { getPotreroOrigenBySNIG } from "@/lib/queries/animales"
import type { Establecimiento } from "@/types/database"

interface Props {
  establecimiento: Establecimiento
  subtipo: 'Venta a Productor' | 'Venta a Frigorífico' | 'Venta en Consignación'
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

export function ModalVenta({ establecimiento, subtipo, caravanasActivas, onSuccess, onCancel }: Props) {
  const [enviando, setEnviando] = useState(false)
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [guiaSerie, setGuiaSerie] = useState('')
  const [guiaNumero, setGuiaNumero] = useState('')
  const [autorizacion, setAutorizacion] = useState('')
  const [dicosePropComprador, setDicosePropComprador] = useState('')
  const [dicoseFisicoComprador, setDicoseFisicoComprador] = useState('')
  const [pesoPromedio, setPesoPromedio] = useState('')
  const [precioTotal, setPrecioTotal] = useState('')
  const [nroTropa, setNroTropa] = useState('')
  const [comentario, setComentario] = useState('')
  const [filas, setFilas] = useState<FilaEgreso[]>([])

  const dicoseFisicoEstab = establecimiento.dicose_fisico ?? ''
  const esFrigorifico = subtipo === 'Venta a Frigorífico'
  const cantidad = filas.filter(f => !f.error).length
  const pesoTotal = pesoPromedio && cantidad ? +(parseFloat(pesoPromedio) * cantidad).toFixed(2) : null

  const guardar = async () => {
    if (!fecha) { toast.error('La fecha de venta es requerida'); return }
    if (!guiaSerie || !guiaNumero) { toast.error('Serie y Número de Guía son requeridos'); return }
    if (!autorizacion) { toast.error('El Número de Autorización es requerido'); return }
    if (!dicosePropComprador) { toast.error('El DICOSE Propiedad del Comprador es requerido'); return }
    if (!validarDicosePropiedad(dicosePropComprador)) { toast.error('DICOSE Propiedad Comprador inválido'); return }
    if (!dicoseFisicoComprador) { toast.error('El DICOSE Físico del Comprador es requerido'); return }
    if (!validarDicoseFisico(dicoseFisicoComprador)) { toast.error('DICOSE Físico Comprador inválido (9 dígitos)'); return }
    if (esFrigorifico && !nroTropa) { toast.error('El Número de Tropa es requerido para Venta a Frigorífico'); return }
    if (filas.length === 0) { toast.error('Cargá el archivo Excel con las caravanas'); return }
    if (filas.some(f => f.error)) { toast.error('El Excel tiene errores. Corregílos antes de guardar.'); return }

    setEnviando(true)
    try {
      const snigs = filas.map(f => f.caravana)

      // Obtener potrero de origen de los animales que se venden
      const origenPotreroId = await getPotreroOrigenBySNIG(establecimiento.id, snigs)

      await darBajaAnimalPorSNIG(establecimiento.id, snigs, 'vendido', fecha)

      const guia = `${guiaSerie}/${guiaNumero}`
      const obsJSON = JSON.stringify({
        subtipo,
        dicose_fisico_comprador: dicoseFisicoComprador,
        dicose_propiedad_comprador: dicosePropComprador,
        dicose_fisico_estab: dicoseFisicoEstab,
        nro_tropa: esFrigorifico ? nroTropa : undefined,
      })

      await createMovimiento({
        establecimiento_id: establecimiento.id,
        fecha, tipo_movimiento: 'Venta',
        categoria: 'Varios', cantidad,
        peso_promedio: pesoPromedio ? parseFloat(pesoPromedio) : null,
        peso_total: pesoTotal,
        origen_tipo: origenPotreroId ? 'potrero' : null,
        origen_id: origenPotreroId,
        destino_tipo: null, destino_id: null,
        precio_unitario: null, precio_base: null,
        precio_total: precioTotal ? parseFloat(precioTotal) : null,
        contraparte: dicosePropComprador,
        remito: autorizacion, guia_dgt: guia, finanza_id: null,
        observaciones: comentario ? `${comentario}\n${obsJSON}` : obsJSON,
        user_id: null,
      })

      toast.success(`${cantidad} animal(es) registrado(s) como ${subtipo}`)
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
          <Label>Fecha de Venta <span className="text-destructive">*</span></Label>
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
        {esFrigorifico && (
          <div className="space-y-1.5">
            <Label>Número de Tropa <span className="text-destructive">*</span></Label>
            <Input placeholder="Ej: 12345" value={nroTropa} onChange={e => setNroTropa(e.target.value)} />
          </div>
        )}
      </Seccion>

      <Seccion titulo="Comprador">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>DICOSE Propiedad <span className="text-destructive">*</span></Label>
            <Input placeholder="9 dígitos o XX0000000" value={dicosePropComprador} onChange={e => setDicosePropComprador(e.target.value)} className="font-mono" />
            {dicosePropComprador && !validarDicosePropiedad(dicosePropComprador) && <p className="text-xs text-destructive">Formato inválido</p>}
          </div>
          <div className="space-y-1.5">
            <Label>DICOSE Físico <span className="text-destructive">*</span></Label>
            <Input placeholder="9 dígitos" value={dicoseFisicoComprador} onChange={e => setDicoseFisicoComprador(e.target.value)} className="font-mono" />
            {dicoseFisicoComprador && !validarDicoseFisico(dicoseFisicoComprador) && <p className="text-xs text-destructive">Debe ser 9 dígitos</p>}
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Establecimiento">
        <div className="space-y-1.5">
          <Label>DICOSE Físico</Label>
          <Input value={dicoseFisicoEstab || '—'} readOnly className="bg-muted/50 text-muted-foreground font-mono" />
          <p className="text-xs text-muted-foreground">Del establecimiento activo (automático)</p>
        </div>
      </Seccion>

      <Seccion titulo="Peso y Precio">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Peso promedio (kg)</Label>
            <Input type="number" min={0} step={0.1} placeholder="Ej: 380" value={pesoPromedio} onChange={e => setPesoPromedio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Peso total (kg)</Label>
            <Input value={pesoTotal !== null ? pesoTotal.toFixed(2) : '—'} readOnly className="bg-muted/50 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label>Precio total (USD)</Label>
            <Input type="number" min={0} step={0.01} placeholder="Ej: 20000" value={precioTotal} onChange={e => setPrecioTotal(e.target.value)} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo={`Caravanas a vender${cantidad > 0 ? ` — ${cantidad} animales` : ''}`}>
        <ExcelUploadAnimales modo="egreso" caravanasActivas={caravanasActivas} onChange={rows => setFilas(rows as FilaEgreso[])} />
      </Seccion>

      <div className="space-y-1.5">
        <Label>Comentario</Label>
        <textarea rows={2} placeholder="Notas adicionales..." value={comentario} onChange={e => setComentario(e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none" />
      </div>

      <div className="flex gap-3 pt-1 sticky bottom-0 bg-background pb-1 border-t">
        <Button onClick={guardar} disabled={enviando} className="flex-1">
          {enviando ? 'Registrando...' : `Registrar ${subtipo}${cantidad > 0 ? ` (${cantidad})` : ''}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={enviando}>Cancelar</Button>
      </div>
    </div>
  )
}
