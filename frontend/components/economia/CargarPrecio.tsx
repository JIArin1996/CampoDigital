"use client"

import { useState } from "react"
import { toast } from "sonner"

import { cargarPrecioActividad } from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CamposPrecio } from "@/components/economia/CamposPrecio"
import { leerPrecio, precioVacio, type PrecioForm } from "@/components/economia/formato"
import { nuevoId } from "@/components/actividades/formato"
import { BOTON, SELECT_NATIVO } from "@/components/shared/estilos"

/**
 * El precio que faltó en una compra o venta. Fecha, lote, concepto y contraparte salen de la
 * actividad; el rubro, por defecto, el de la especie del lote.
 */
export function CargarPrecio({ actividadId, venta, rubros, onHecho }: {
  actividadId: string
  venta: boolean
  rubros: { id: string; nombre: string }[]
  onHecho: () => void
}) {
  const [id] = useState(nuevoId)
  const [abierto, setAbierto] = useState(false)
  const [precio, setPrecio] = useState<PrecioForm>(precioVacio)
  const [rubroId, setRubroId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (!abierto) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Sin precio cargado: el resultado económico no la cuenta.</p>
        <Button type="button" variant="outline" className={BOTON} onClick={() => setAbierto(true)}>Cargar precio</Button>
      </div>
    )
  }

  const guardar = async () => {
    setError(null)
    const leido = leerPrecio(precio)
    if ("error" in leido) return setError(leido.error)
    setEnviando(true)
    try {
      await cargarPrecioActividad(id, actividadId, leido.precio, rubroId || null)
      toast.success("Precio cargado")
      onHecho()
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-4">
      <CamposPrecio id="precio" valor={precio} onCambio={setPrecio} ingreso={venta} />
      <div className="space-y-1.5">
        <Label htmlFor="precio-rubro">Rubro</Label>
        <select id="precio-rubro" className={SELECT_NATIVO} value={rubroId} onChange={e => setRubroId(e.target.value)}>
          <option value="">El de la especie</option>
          {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" className={BOTON} disabled={enviando} onClick={() => void guardar()}>{enviando ? "Guardando..." : "Guardar precio"}</Button>
        <Button type="button" variant="outline" className={BOTON} disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
    </div>
  )
}
