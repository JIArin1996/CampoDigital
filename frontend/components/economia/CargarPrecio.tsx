"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { cargarPrecioActividad, getConceptos, getGruposConcepto, getTitulares } from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CamposPrecio } from "@/components/economia/CamposPrecio"
import { OpcionesConcepto } from "@/components/economia/OpcionesConcepto"
import { RepartoTitulares } from "@/components/economia/RepartoTitulares"
import { leerPrecio, leerTitulares, parsearMonto, precioVacio, type PrecioForm, type TitularForm } from "@/components/economia/formato"
import { nuevoId } from "@/components/actividades/formato"
import { BOTON, SELECT_NATIVO } from "@/components/shared/estilos"
import type { Concepto, GrupoConcepto, Titular } from "@/types/economia"

/**
 * El precio que faltó en una compra o venta. Fecha, lote, concepto y contraparte salen de la
 * actividad; el rubro, por defecto, el de la especie del lote; el concepto, por defecto, "Compra de
 * ganado" o "Venta de ganado vacuno/ovino".
 */
export function CargarPrecio({ actividadId, establecimientoId, fecha, venta, rubros, onHecho }: {
  actividadId: string
  establecimientoId: string
  fecha: string
  venta: boolean
  rubros: { id: string; nombre: string }[]
  onHecho: () => void
}) {
  const [id] = useState(nuevoId)
  const [abierto, setAbierto] = useState(false)
  const [precio, setPrecio] = useState<PrecioForm>(precioVacio)
  const [rubroId, setRubroId] = useState("")
  const [conceptoId, setConceptoId] = useState("")
  const [titulares, setTitulares] = useState<TitularForm[]>([])
  const [catalogos, setCatalogos] = useState<{ conceptos: Concepto[]; grupos: GrupoConcepto[]; titulares: Titular[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    Promise.all([getConceptos(establecimientoId), getGruposConcepto(establecimientoId), getTitulares(establecimientoId)])
      .then(([conceptos, grupos, titulares]) => {
        if (vigente) setCatalogos({ conceptos: conceptos.filter(c => c.activo), grupos, titulares: titulares.filter(t => t.activo) })
      })
      .catch(() => { if (vigente) setCatalogos({ conceptos: [], grupos: [], titulares: [] }) })   // opcionales: quedan los de por defecto
    return () => { vigente = false }
  }, [abierto, establecimientoId])

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
    const leido = leerPrecio(precio, fecha)
    if ("error" in leido) return setError(leido.error)
    const reparto = leerTitulares(titulares, leido.precio.monto)
    if ("error" in reparto) return setError(reparto.error)
    setEnviando(true)
    try {
      const precioCompleto = {
        ...leido.precio,
        ...(conceptoId ? { concepto_id: conceptoId } : {}),
        ...(reparto.titulares.length > 0 ? { titulares: reparto.titulares } : {}),
      }
      await cargarPrecioActividad(id, actividadId, precioCompleto, rubroId || null)
      toast.success("Precio cargado")
      onHecho()
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-4">
      <CamposPrecio id="precio" valor={precio} onCambio={setPrecio} ingreso={venta} fecha={fecha} />
      <div className="space-y-1.5">
        <Label htmlFor="precio-rubro">Rubro</Label>
        <select id="precio-rubro" className={SELECT_NATIVO} value={rubroId} onChange={e => setRubroId(e.target.value)}>
          <option value="">El de la especie</option>
          {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="precio-concepto">Concepto</Label>
        <select id="precio-concepto" className={SELECT_NATIVO} value={conceptoId} onChange={e => setConceptoId(e.target.value)}>
          <option value="">{venta ? "Venta de ganado (según la especie)" : "Compra de ganado"}</option>
          {catalogos && <OpcionesConcepto conceptos={catalogos.conceptos} grupos={catalogos.grupos} tipo={venta ? "ingreso" : "egreso"} />}
        </select>
      </div>
      {catalogos && catalogos.titulares.length > 0 && (
        <div className="space-y-1.5">
          <Label>Titulares <span className="font-normal text-muted-foreground">(opcional: uno, o repartido entre varios)</span></Label>
          <RepartoTitulares titulares={catalogos.titulares} filas={titulares} onCambio={setTitulares}
            total={parsearMonto(precio.monto)} moneda={precio.moneda} disabled={enviando} />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" className={BOTON} disabled={enviando} onClick={() => void guardar()}>{enviando ? "Guardando..." : "Guardar precio"}</Button>
        <Button type="button" variant="outline" className={BOTON} disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
    </div>
  )
}
