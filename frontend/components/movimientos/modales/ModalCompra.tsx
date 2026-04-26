"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ExcelUploadAnimales, type FilaIngreso } from "../ExcelUploadAnimales"
import { calcularCategoria, validarDicoseFisico, validarDicosePropiedad } from "@/lib/utils/snig"
import { createMovimiento } from "@/lib/queries/movimientos"
import { createAnimalesBulk } from "@/lib/queries/animales"
import { getDicosesPropiedad, type DicosePropiedad } from "@/lib/queries/dicoses_propiedad"
import type { AnimalInsert, Establecimiento, Potrero } from "@/types/database"

interface Props {
  establecimiento: Establecimiento
  potreros: Potrero[]
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

export function ModalCompra({ establecimiento, potreros, onSuccess, onCancel }: Props) {
  const [enviando, setEnviando] = useState(false)
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [guiaSerie, setGuiaSerie] = useState('')
  const [guiaNumero, setGuiaNumero] = useState('')
  const [autorizacion, setAutorizacion] = useState('')
  const [dicosePropVendedor, setDicosePropVendedor] = useState('')
  const [dicoseFisicoVendedor, setDicoseFisicoVendedor] = useState('')
  const [dicosePropEstab, setDicosePropEstab] = useState('')
  const [dicosesPrecargados, setDicosesPrecargados] = useState<DicosePropiedad[]>([])
  const [potreroId, setPotreroId] = useState<number | null>(null)
  const [pesoPromedio, setPesoPromedio] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [comentario, setComentario] = useState('')
  const [filas, setFilas] = useState<FilaIngreso[]>([])

  const dicoseFisicoEstab = establecimiento.dicose_fisico ?? ''
  const potrerosActivos = potreros.filter(p => p.estado === 'activo')
  const cantidad = filas.filter(f => !f.error).length
  const pesoTotal = pesoPromedio && cantidad ? +(parseFloat(pesoPromedio) * cantidad).toFixed(2) : null

  useEffect(() => {
    getDicosesPropiedad(establecimiento.id).then(setDicosesPrecargados).catch(() => {})
  }, [establecimiento.id])

  const guardar = async () => {
    if (!fecha) { toast.error('La fecha de compra es requerida'); return }
    if (!guiaSerie || !guiaNumero) { toast.error('Serie y Número de Guía son requeridos'); return }
    if (!autorizacion) { toast.error('El Número de Autorización es requerido'); return }
    if (!dicosePropVendedor) { toast.error('El DICOSE Propiedad del Vendedor es requerido'); return }
    if (!validarDicosePropiedad(dicosePropVendedor)) { toast.error('DICOSE Propiedad Vendedor inválido'); return }
    if (!dicoseFisicoVendedor) { toast.error('El DICOSE Físico del Vendedor es requerido'); return }
    if (!validarDicoseFisico(dicoseFisicoVendedor)) { toast.error('DICOSE Físico Vendedor inválido (9 dígitos)'); return }
    if (!dicosePropEstab) { toast.error('El DICOSE Propiedad del Establecimiento es requerido'); return }
    if (!validarDicosePropiedad(dicosePropEstab)) { toast.error('DICOSE Propiedad Establecimiento inválido'); return }
    if (!potreroId) { toast.error('Seleccioná el potrero de destino'); return }
    if (filas.length === 0) { toast.error('Cargá el archivo Excel con las caravanas'); return }
    if (filas.some(f => f.error)) { toast.error('El Excel tiene errores. Corregílos antes de guardar.'); return }

    setEnviando(true)
    try {
      const animales: AnimalInsert[] = filas.map(f => ({
        establecimiento_id: establecimiento.id,
        caravana_snig: f.caravana,
        caravana_propia: null,
        categoria: calcularCategoria(f.sexo, f.edadMeses ?? 0),
        sexo: f.sexo,
        raza: null,
        fecha_nacimiento: null,
        madre_id: null,
        potrero_actual: potreroId,
        parcela_actual: null,
        lote_actual: null,
        peso_entrada: pesoPromedio ? parseFloat(pesoPromedio) : null,
        fecha_peso_entrada: fecha,
        origen: 'Comprado',
        movimiento_origen_id: null,
        estado: 'activo',
        fecha_baja: null,
        observaciones: JSON.stringify({ subtipo: 'Compra', edad_meses_entrada: f.edadMeses, dicose_propiedad: dicosePropEstab, dicose_fisico: dicoseFisicoEstab }),
        user_id: null,
      }))

      await createAnimalesBulk(animales)

      const categorias = animales.reduce<Record<string, number>>((acc, a) => {
        acc[a.categoria] = (acc[a.categoria] ?? 0) + 1; return acc
      }, {})

      const guia = `${guiaSerie}/${guiaNumero}`
      const obsJSON = JSON.stringify({
        subtipo: 'Compra',
        categorias,
        dicose_fisico_vendedor: dicoseFisicoVendedor,
        dicose_propiedad_vendedor: dicosePropVendedor,
        dicose_fisico_estab: dicoseFisicoEstab,
        dicose_propiedad_estab: dicosePropEstab,
        ...(comentario ? { comentario } : {}),
      })

      await createMovimiento({
        establecimiento_id: establecimiento.id,
        fecha, tipo_movimiento: 'Compra',
        categoria: Object.keys(categorias).length === 1 ? Object.keys(categorias)[0] : 'Varios',
        cantidad: animales.length,
        peso_promedio: pesoPromedio ? parseFloat(pesoPromedio) : null,
        peso_total: pesoTotal,
        origen_tipo: null, origen_id: null,
        destino_tipo: 'potrero', destino_id: potreroId,
        precio_unitario: null, precio_base: null,
        precio_total: valorTotal ? parseFloat(valorTotal) : null,
        contraparte: dicosePropVendedor,
        remito: autorizacion, guia_dgt: guia, finanza_id: null,
        observaciones: obsJSON,
        user_id: null,
      }).catch(e => console.warn('movimientos_ganado no registrado:', e))

      toast.success(`${animales.length} animal(es) ingresados por compra`)
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
          <Label>Fecha de Compra <span className="text-destructive">*</span></Label>
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

      <Seccion titulo="Vendedor">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>DICOSE Propiedad <span className="text-destructive">*</span></Label>
            <Input placeholder="9 dígitos o XX0000000" value={dicosePropVendedor} onChange={e => setDicosePropVendedor(e.target.value)} className="font-mono" />
            {dicosePropVendedor && !validarDicosePropiedad(dicosePropVendedor) && <p className="text-xs text-destructive">Formato inválido</p>}
          </div>
          <div className="space-y-1.5">
            <Label>DICOSE Físico <span className="text-destructive">*</span></Label>
            <Input placeholder="9 dígitos" value={dicoseFisicoVendedor} onChange={e => setDicoseFisicoVendedor(e.target.value)} className="font-mono" />
            {dicoseFisicoVendedor && !validarDicoseFisico(dicoseFisicoVendedor) && <p className="text-xs text-destructive">Debe ser 9 dígitos</p>}
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Establecimiento Comprador">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>DICOSE Propiedad <span className="text-destructive">*</span></Label>
            {dicosesPrecargados.length > 0 ? (
              <Select value={dicosePropEstab} onValueChange={v => v && setDicosePropEstab(v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar titular..." /></SelectTrigger>
                <SelectContent>
                  {dicosesPrecargados.map(d => (
                    <SelectItem key={d.id} value={d.dicose_propiedad}>
                      <span className="font-mono">{d.dicose_propiedad}</span>
                      {d.razon_social && <span className="ml-2 text-xs text-muted-foreground">{d.razon_social}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input placeholder="9 dígitos o XX0000000" value={dicosePropEstab} onChange={e => setDicosePropEstab(e.target.value)} className="font-mono" />
                {dicosePropEstab && !validarDicosePropiedad(dicosePropEstab) && <p className="text-xs text-destructive">Formato inválido</p>}
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>DICOSE Físico</Label>
            <Input value={dicoseFisicoEstab || '—'} readOnly className="bg-muted/50 text-muted-foreground font-mono" />
            <p className="text-xs text-muted-foreground">Del establecimiento activo</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Potrero de destino <span className="text-destructive">*</span></Label>
          <Select value={potreroId?.toString() ?? ''} onValueChange={v => v && setPotreroId(Number(v))}>
            <SelectTrigger><SelectValue placeholder="Seleccionar potrero..." /></SelectTrigger>
            <SelectContent>
              {potrerosActivos.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.nombre} ({p.superficie} ha)</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Seccion>

      <Seccion titulo="Peso y Valor">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Peso promedio (kg)</Label>
            <Input type="number" min={0} step={0.1} placeholder="Ej: 320" value={pesoPromedio} onChange={e => setPesoPromedio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Peso total (kg)</Label>
            <Input value={pesoTotal !== null ? pesoTotal.toFixed(2) : '—'} readOnly className="bg-muted/50 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label>Valor total (USD)</Label>
            <Input type="number" min={0} step={0.01} placeholder="Ej: 15000" value={valorTotal} onChange={e => setValorTotal(e.target.value)} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo={`Caravanas Excel${cantidad > 0 ? ` — ${cantidad} animales` : ''}`}>
        <ExcelUploadAnimales modo="ingreso_completo" onChange={rows => setFilas(rows as FilaIngreso[])} />
      </Seccion>

      <div className="space-y-1.5">
        <Label>Comentario</Label>
        <textarea
          rows={2}
          placeholder="Notas adicionales..."
          value={comentario}
          onChange={e => setComentario(e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-1 sticky bottom-0 bg-background pb-1 border-t">
        <Button onClick={guardar} disabled={enviando} className="flex-1">
          {enviando ? 'Registrando...' : `Registrar Compra${cantidad > 0 ? ` (${cantidad} animales)` : ''}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={enviando}>Cancelar</Button>
      </div>
    </div>
  )
}
