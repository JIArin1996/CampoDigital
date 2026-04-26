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
import { calcularCategoria, calcularEdadMeses, validarSNIG } from "@/lib/utils/snig"
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

type ModoEntrada = 'manual' | 'excel'
interface FilaManual { caravana: string; sexo: 'Macho' | 'Hembra' | '' }

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1">{titulo}</p>
      {children}
    </div>
  )
}

export function ModalNacimiento({ establecimiento, potreros, onSuccess, onCancel }: Props) {
  const [enviando, setEnviando] = useState(false)
  const [modo, setModo] = useState<ModoEntrada>('manual')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [fechaRegistro, setFechaRegistro] = useState(new Date().toISOString().split('T')[0])
  const [dicosePropiedad, setDicosePropiedad] = useState('')
  const [dicosesPrecargados, setDicosesPrecargados] = useState<DicosePropiedad[]>([])
  const [potreroId, setPotreroId] = useState<number | null>(null)
  const [filasExcel, setFilasExcel] = useState<FilaIngreso[]>([])
  const [filasManual, setFilasManual] = useState<FilaManual[]>([{ caravana: '', sexo: '' }])

  const dicoseFisico = establecimiento.dicose_fisico ?? ''
  const potrerosActivos = potreros.filter(p => p.estado === 'activo')

  useEffect(() => {
    getDicosesPropiedad(establecimiento.id).then(setDicosesPrecargados).catch(() => {})
  }, [establecimiento.id])

  const agregarFila = () => setFilasManual(prev => [...prev, { caravana: '', sexo: '' }])
  const eliminarFila = (i: number) => setFilasManual(prev => prev.filter((_, idx) => idx !== i))
  const actualizarFila = (i: number, campo: keyof FilaManual, valor: string) =>
    setFilasManual(prev => prev.map((f, idx) => idx === i ? { ...f, [campo]: valor } : f))

  const validarManual = (): string | null => {
    for (const f of filasManual) {
      if (!f.caravana) return 'Completá todas las caravanas'
      if (!validarSNIG(f.caravana)) return `Caravana inválida: ${f.caravana}`
      if (!f.sexo) return 'Seleccioná el sexo en todas las filas'
    }
    const snigs = filasManual.map(f => f.caravana)
    if (new Set(snigs).size !== snigs.length) return 'Hay caravanas duplicadas'
    return null
  }

  const guardar = async () => {
    if (!fechaNacimiento) { toast.error('La fecha de nacimiento es requerida'); return }
    if (!fechaRegistro) { toast.error('La fecha de registro es requerida'); return }
    if (!dicosePropiedad.trim()) { toast.error('El DICOSE Propiedad es requerido'); return }
    if (!potreroId) { toast.error('Seleccioná el potrero de destino'); return }

    const fechaNac = new Date(fechaNacimiento + 'T12:00:00')
    const fechaReg = new Date(fechaRegistro + 'T12:00:00')
    let filas: { caravana: string; sexo: 'Macho' | 'Hembra' }[] = []

    if (modo === 'manual') {
      const err = validarManual()
      if (err) { toast.error(err); return }
      filas = filasManual.map(f => ({ caravana: f.caravana.trim(), sexo: f.sexo as 'Macho' | 'Hembra' }))
    } else {
      if (filasExcel.length === 0) { toast.error('Cargá un archivo Excel con las caravanas'); return }
      if (filasExcel.some(f => f.error)) { toast.error('El Excel tiene errores. Corregílos antes de guardar.'); return }
      filas = filasExcel.map(f => ({ caravana: f.caravana, sexo: f.sexo }))
    }

    setEnviando(true)
    try {
      const edadMeses = calcularEdadMeses(fechaNac, fechaReg)
      const animales: AnimalInsert[] = filas.map(f => ({
        establecimiento_id: establecimiento.id,
        caravana_snig: f.caravana,
        caravana_propia: null,
        categoria: calcularCategoria(f.sexo, edadMeses),
        sexo: f.sexo,
        raza: null,
        fecha_nacimiento: fechaNacimiento,
        madre_id: null,
        potrero_actual: potreroId,
        parcela_actual: null,
        lote_actual: null,
        peso_entrada: null,
        fecha_peso_entrada: null,
        origen: 'Nacido en campo',
        movimiento_origen_id: null,
        estado: 'activo',
        fecha_baja: null,
        observaciones: JSON.stringify({ subtipo: 'Nacimiento', dicose_propiedad: dicosePropiedad, dicose_fisico: dicoseFisico }),
        user_id: null,
      }))

      await createAnimalesBulk(animales)

      const categorias = animales.reduce<Record<string, number>>((acc, a) => {
        acc[a.categoria] = (acc[a.categoria] ?? 0) + 1; return acc
      }, {})

      await createMovimiento({
        establecimiento_id: establecimiento.id,
        fecha: fechaRegistro,
        tipo_movimiento: 'Nacimiento',
        categoria: Object.keys(categorias).length === 1 ? Object.keys(categorias)[0] : 'Varios',
        cantidad: animales.length,
        peso_promedio: null, peso_total: null,
        origen_tipo: null, origen_id: null,
        destino_tipo: 'potrero', destino_id: potreroId,
        precio_unitario: null, precio_base: null, precio_total: null,
        contraparte: dicosePropiedad, remito: null, guia_dgt: null, finanza_id: null,
        observaciones: JSON.stringify({
          subtipo: 'Nacimiento',
          categorias,
          dicose_propiedad: dicosePropiedad,
          dicose_fisico: dicoseFisico,
          fecha_nacimiento: fechaNacimiento,
        }),
        user_id: null,
      }).catch(e => console.warn('movimientos_ganado no registrado:', e))

      toast.success(`${animales.length} animal(es) registrado(s) por nacimiento`)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setEnviando(false)
    }
  }

  const totalAnimales = modo === 'manual' ? filasManual.filter(f => f.caravana).length : filasExcel.filter(f => !f.error).length

  return (
    <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">

      <Seccion titulo="Fechas">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Fecha de Nacimiento <span className="text-destructive">*</span></Label>
            <Input type="date" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} max={fechaRegistro} />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de Registro <span className="text-destructive">*</span></Label>
            <Input type="date" value={fechaRegistro} onChange={e => setFechaRegistro(e.target.value)} max={new Date().toISOString().split('T')[0]} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="DICOSE">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>DICOSE Propiedad <span className="text-destructive">*</span></Label>
            {dicosesPrecargados.length > 0 ? (
              <Select value={dicosePropiedad} onValueChange={v => v && setDicosePropiedad(v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar titular..." /></SelectTrigger>
                <SelectContent>
                  {dicosesPrecargados.map(d => (
                    <SelectItem key={d.id} value={d.dicose_propiedad}>
                      <span className="font-mono">{d.dicose_propiedad}</span>
                      {d.razon_social && <span className="ml-2 text-muted-foreground text-xs">{d.razon_social}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input placeholder="9 dígitos o XX0000000" value={dicosePropiedad} onChange={e => setDicosePropiedad(e.target.value)} className="font-mono" />
                <p className="text-xs text-amber-600">Cargá DICOSE en el módulo Potreros para seleccionar.</p>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>DICOSE Físico</Label>
            <Input value={dicoseFisico || '—'} readOnly className="bg-muted/50 text-muted-foreground font-mono" />
            <p className="text-xs text-muted-foreground">Del establecimiento activo</p>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Destino">
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

      <Seccion titulo="Animales">
        <div className="flex gap-2 items-center">
          <Button type="button" size="sm" variant={modo === 'manual' ? 'default' : 'outline'} onClick={() => setModo('manual')}>Manual</Button>
          <Button type="button" size="sm" variant={modo === 'excel' ? 'default' : 'outline'} onClick={() => setModo('excel')}>Excel</Button>
          {totalAnimales > 0 && <Badge variant="outline" className="ml-auto">{totalAnimales} animal{totalAnimales !== 1 ? 'es' : ''}</Badge>}
        </div>

        {modo === 'manual' && (
          <div className="space-y-2">
            {filasManual.map((fila, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="858000000000000"
                    value={fila.caravana}
                    onChange={e => actualizarFila(i, 'caravana', e.target.value)}
                    maxLength={15}
                    className="font-mono text-sm"
                  />
                  {fila.caravana && !validarSNIG(fila.caravana) && (
                    <p className="text-xs text-destructive">Formato inválido (15 dígitos, empieza por 8580000)</p>
                  )}
                </div>
                <Select value={fila.sexo} onValueChange={v => v && actualizarFila(i, 'sexo', v)}>
                  <SelectTrigger className="w-32"><SelectValue placeholder="Sexo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hembra">H — Hembra</SelectItem>
                    <SelectItem value="Macho">M — Macho</SelectItem>
                  </SelectContent>
                </Select>
                {filasManual.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => eliminarFila(i)}>×</Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={agregarFila}>+ Agregar caravana</Button>
          </div>
        )}

        {modo === 'excel' && (
          <ExcelUploadAnimales modo="ingreso_simple" onChange={rows => setFilasExcel(rows as FilaIngreso[])} />
        )}
      </Seccion>

      <div className="flex gap-3 pt-1 sticky bottom-0 bg-background pb-1 border-t">
        <Button onClick={guardar} disabled={enviando} className="flex-1">
          {enviando ? 'Registrando...' : `Registrar ${totalAnimales > 0 ? totalAnimales + ' nacimiento(s)' : 'Nacimientos'}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={enviando}>Cancelar</Button>
      </div>
    </div>
  )
}
