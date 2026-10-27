"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import { toast } from "sonner"

import { crearPagador, getNombresFactura, getPagadores, getTitulares, getUltimoPagador } from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { PrecioCarga } from "@/types/actividades"
import type { Pagador, Titular } from "@/types/economia"

// ── Datos del formulario ──────────────────────────────────────────────────────

export interface PagoFacturaForm {
  pagadorId: string       // "" = sin indicar
  facturaNombre: string
  facturaRut: string
  comprobante: string
}

export const pagoFacturaVacio = (): PagoFacturaForm => ({ pagadorId: "", facturaNombre: "", facturaRut: "", comprobante: "" })

// Opción del selector de pagador que abre el alta de uno nuevo
const NUEVO = "__nuevo"

// RUT uruguayo: 12 dígitos; al escribirlo se aceptan espacios, puntos y guiones
const limpiarRut = (rut: string) => rut.replace(/[\s.-]/g, "")

// Lo que va en el precio. Al editar, una clave que no va borra el dato.
export function leerPagoFactura(v: PagoFacturaForm):
  { datos: Pick<PrecioCarga, "pagador_id" | "factura_nombre" | "factura_rut" | "numero_comprobante"> } | { error: string } {
  if (v.pagadorId === NUEVO) return { error: "Agregá el pagador nuevo o elegí otro" }
  const rut = limpiarRut(v.facturaRut)
  if (rut && !/^[0-9]{12}$/.test(rut)) return { error: "El RUT de la factura tiene 12 dígitos" }
  if (v.facturaNombre.trim().length > 120) return { error: "El nombre de la factura tiene hasta 120 caracteres" }
  if (v.comprobante.trim().length > 50) return { error: "El número de comprobante tiene hasta 50 caracteres" }
  return {
    datos: {
      ...(v.pagadorId ? { pagador_id: v.pagadorId } : {}),
      ...(v.facturaNombre.trim() ? { factura_nombre: v.facturaNombre.trim() } : {}),
      ...(rut ? { factura_rut: rut } : {}),
      ...(v.comprobante.trim() ? { numero_comprobante: v.comprobante.trim() } : {}),
    },
  }
}

// ── "Pagado por" / "Cobrado por" ──────────────────────────────────────────────

/**
 * De qué bolsillo salió (gasto) o a cuál entró (ingreso) la plata: define los saldos entre titulares.
 * Al cargar uno nuevo, viene elegido el último que usó quien carga (`recordarUltimo`). Desde acá se
 * puede crear un pagador (administrador u operador).
 */
export function CampoPagador({ id, establecimientoId, ingreso, valor, onCambio, actual, recordarUltimo }: {
  id: string
  establecimientoId: string
  ingreso: boolean
  valor: string
  onCambio: (pagadorId: string) => void
  actual?: string | null          // al editar: el que ya tiene (se ofrece aunque esté dado de baja)
  recordarUltimo: boolean
}) {
  const [datos, setDatos] = useState<{ pagadores: Pagador[]; titulares: Titular[] } | null>(null)
  const [nuevo, setNuevo] = useState({ nombre: "", titularId: "" })
  const [creando, setCreando] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vigente = true
    Promise.all([getPagadores(establecimientoId), getTitulares(establecimientoId), recordarUltimo ? getUltimoPagador(establecimientoId) : null])
      .then(([pagadores, titulares, ultimo]) => {
        if (!vigente) return
        setDatos({ pagadores, titulares: titulares.filter(t => t.activo) })
        // El último usado, si sigue activo y todavía no se eligió otro
        if (ultimo && pagadores.some(p => p.id === ultimo && p.activo)) onCambio(ultimo)
      })
      .catch(() => { if (vigente) setDatos({ pagadores: [], titulares: [] }) })   // opcional: se puede cargar sin pagador
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el último se aplica una sola vez, al abrir
  }, [establecimientoId, version])

  const opciones = (datos?.pagadores ?? []).filter(p => p.activo || p.id === actual)
  const nombreTitular = (t: string | null) => datos?.titulares.find(x => x.id === t)?.nombre

  const agregar = async () => {
    setCreando(true)
    try {
      const p = await crearPagador(establecimientoId, nuevo.nombre.trim(), nuevo.titularId || null)
      toast.success("Pagador agregado")
      setNuevo({ nombre: "", titularId: "" })
      onCambio(p.id)
      setVersion(v => v + 1)
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-pagador`}>{ingreso ? "Cobrado por" : "Pagado por"} <span className="font-normal text-muted-foreground">(opcional)</span></Label>
      <select id={`${id}-pagador`} className={SELECT_NATIVO} value={valor} disabled={!datos}
        onChange={e => onCambio(e.target.value)}>
        <option value="">Sin indicar</option>
        {opciones.map(p => (
          <option key={p.id} value={p.id}>{p.nombre}{nombreTitular(p.titular_id) && nombreTitular(p.titular_id) !== p.nombre ? ` (de ${nombreTitular(p.titular_id)})` : ""}</option>
        ))}
        <option value={NUEVO}>+ Nuevo pagador…</option>
      </select>
      <p className="text-xs text-muted-foreground">
        {ingreso ? "A qué bolsillo entró la plata" : "De qué bolsillo salió la plata"} (no a nombre de quién está la factura).
      </p>
      {valor === NUEVO && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto]">
          <Input aria-label="Nombre del pagador nuevo" className={CAMPO} placeholder="Ej: Juan tarjeta" value={nuevo.nombre}
            onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} />
          <select aria-label="Titular del pagador nuevo" className={SELECT_NATIVO} value={nuevo.titularId}
            onChange={e => setNuevo(n => ({ ...n, titularId: e.target.value }))}>
            <option value="">No es de un titular</option>
            {(datos?.titulares ?? []).map(t => <option key={t.id} value={t.id}>Es de {t.nombre}</option>)}
          </select>
          <Button type="button" variant="outline" className="h-11 md:h-9" disabled={creando || !nuevo.nombre.trim()} onClick={() => void agregar()}>
            {creando ? "Agregando..." : "Agregar"}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Datos de factura (plegado) ────────────────────────────────────────────────

/**
 * A nombre de quién está la factura, el RUT y el número de comprobante. Es solo un dato del comprobante:
 * no cambia los saldos ni el resultado. Se sugieren los nombres ya usados (y su RUT).
 */
export function DatosFactura({ id, establecimientoId, valor, onCambio }: {
  id: string
  establecimientoId: string
  valor: PagoFacturaForm
  onCambio: React.Dispatch<React.SetStateAction<PagoFacturaForm>>
}) {
  const conDatos = !!(valor.facturaNombre || valor.facturaRut || valor.comprobante)
  const [abierto, setAbierto] = useState(conDatos)
  const [usados, setUsados] = useState<{ nombre: string; rut: string | null }[]>([])

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    getNombresFactura(establecimientoId)
      .then(n => { if (vigente) setUsados(n) })
      .catch(() => { /* sin sugerencias: se escribe igual */ })
    return () => { vigente = false }
  }, [abierto, establecimientoId])

  const cambiar = (c: Partial<PagoFacturaForm>) => onCambio(v => ({ ...v, ...c }))
  const elegirNombre = (nombre: string) => {
    const conocido = usados.find(u => u.nombre === nombre)
    // Un nombre ya usado trae su RUT, si no se escribió otro
    onCambio(v => ({ ...v, facturaNombre: nombre, facturaRut: !v.facturaRut && conocido?.rut ? conocido.rut : v.facturaRut }))
  }
  const rut = limpiarRut(valor.facturaRut)
  const rutMal = rut !== "" && !/^[0-9]{12}$/.test(rut)

  return (
    <div className="rounded-lg border">
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-sm font-medium">
        <span>Datos de factura <span className="font-normal text-muted-foreground">(opcional)</span></span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-factura`}>A nombre de</Label>
            <Input id={`${id}-factura`} list={`${id}-factura-usados`} className={CAMPO} placeholder="Ej: Padre, la sociedad…"
              value={valor.facturaNombre} onChange={e => elegirNombre(e.target.value)} />
            <datalist id={`${id}-factura-usados`}>
              {usados.map(u => <option key={u.nombre} value={u.nombre} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-rut`}>RUT</Label>
              <Input id={`${id}-rut`} inputMode="numeric" className={cn(CAMPO, rutMal && "border-destructive")} placeholder="12 dígitos"
                value={valor.facturaRut} onChange={e => cambiar({ facturaRut: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-comprobante`}>N.º de comprobante</Label>
              <Input id={`${id}-comprobante`} className={CAMPO} value={valor.comprobante} onChange={e => cambiar({ comprobante: e.target.value })} />
            </div>
          </div>
          {rutMal && <p className="text-sm text-destructive">El RUT tiene 12 dígitos.</p>}
          <p className="text-xs text-muted-foreground">Es un dato del comprobante: no cambia los saldos ni el resultado.</p>
        </div>
      )}
    </div>
  )
}
