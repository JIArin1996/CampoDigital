"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  editarMovimiento, getConceptos, getGruposConcepto, getRubrosTodos, getTitulares, registrarMovimiento,
} from "@/lib/queries/economia"
import { subirArchivoAMovimiento } from "@/lib/queries/archivos"
import { getLotes, getLotesPorIds } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CamposPrecio } from "@/components/economia/CamposPrecio"
import { OpcionesConcepto } from "@/components/economia/OpcionesConcepto"
import { RepartoTitulares } from "@/components/economia/RepartoTitulares"
import { ElegirArchivosMovimiento, type ArchivoElegido } from "@/components/economia/ArchivosMovimiento"
import { CampoPagador, DatosFactura, leerPagoFactura, pagoFacturaVacio, type PagoFacturaForm } from "@/components/economia/PagoYFactura"
import {
  leerPrecio, leerTitulares, montoATexto, parsearMonto, precioVacio, tipoCambioATexto, type PrecioForm, type TitularForm,
} from "@/components/economia/formato"
import { nuevoId } from "@/components/actividades/formato"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import { BOTON, CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { Concepto, GrupoConcepto, Movimiento, MovimientoTitular, Rubro, Sentido, Titular } from "@/types/economia"
import type { Lote } from "@/types/lotes"

interface Catalogos {
  rubros: Rubro[]
  lotes: Lote[]
  conceptos: Concepto[]
  grupos: GrupoConcepto[]
  titulares: Titular[]
}

// El precio de un movimiento existente, como se carga en el formulario
const precioDe = (m: Movimiento): PrecioForm => ({
  monto: montoATexto(Number(m.monto_original)),
  moneda: m.moneda_original,
  tipoCambio: {
    texto: m.tipo_cambio ? tipoCambioATexto(Number(m.tipo_cambio)) : "",
    fechaBcu: m.tipo_cambio_fuente === "BCU" ? m.tipo_cambio_fecha ?? "" : "",
    guardada: true,
  },
  estado: m.estado,
  vencimiento: m.fecha_vencimiento ?? "",
})

// Quién pagó o cobró y los datos de factura de un movimiento existente
const pagoFacturaDe = (m: Movimiento): PagoFacturaForm => ({
  pagadorId: m.pagador_id ?? "",
  facturaNombre: m.factura_nombre ?? "",
  facturaRut: m.factura_rut ?? "",
  comprobante: m.numero_comprobante ?? "",
})

/**
 * Formulario de un ingreso o gasto: carga nueva o edición (`inicial`). En orden: tipo, fecha, concepto
 * (del catálogo, filtrado por el tipo), rubro, monto y moneda, titulares, "Pagado por" o "Cobrado por"
 * (al cargar, el último que usó quien carga) y, plegados al final, los datos de factura. Al editar uno
 * que viene de una compra o venta, la fecha, el tipo y el lote son los de la actividad.
 */
export function FormularioMovimiento({ establecimientoId, inicial, onListo, onCancelar }: {
  establecimientoId: string
  inicial?: { movimiento: Movimiento; titulares: MovimientoTitular[] }
  onListo: () => void
  onCancelar: () => void
}) {
  const m = inicial?.movimiento
  const editando = !!m
  const deActividad = !!m?.actividad_id

  const [id] = useState(() => m?.id ?? nuevoId())
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null)
  const [sentido, setSentido] = useState<Sentido>(m?.sentido ?? "egreso")
  const [fecha, setFecha] = useState(m?.fecha ?? hoyLocal())
  const [rubroId, setRubroId] = useState(m?.rubro_id ?? "")
  const [conceptoId, setConceptoId] = useState(m?.concepto_id ?? "")
  const [contraparte, setContraparte] = useState(m?.contraparte ?? "")
  const [loteId, setLoteId] = useState(m?.lote_id ?? "")
  const [precio, setPrecio] = useState<PrecioForm>(() => (m ? precioDe(m) : precioVacio()))
  const [titulares, setTitulares] = useState<TitularForm[]>(() =>
    (inicial?.titulares ?? []).map(t => ({ titularId: t.titular_id, monto: montoATexto(Number(t.monto)) })))
  const [pagoFactura, setPagoFactura] = useState<PagoFacturaForm>(() => (m ? pagoFacturaDe(m) : pagoFacturaVacio()))
  const [archivos, setArchivos] = useState<ArchivoElegido[]>([])
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vigente = true
    Promise.all([
      getRubrosTodos(establecimientoId), getLotes(establecimientoId, "activo"), getConceptos(establecimientoId),
      getGruposConcepto(establecimientoId), getTitulares(establecimientoId),
      m?.lote_id ? getLotesPorIds([m.lote_id]) : Promise.resolve([] as Lote[]),
    ])
      .then(([rubros, lotes, conceptos, grupos, todosTitulares, loteActual]) => {
        if (!vigente) return
        // Para cargar, los activos; al editar, también los que ya tenía (aunque estén dados de baja o el lote cerrado)
        const usados = new Set((inicial?.titulares ?? []).map(t => t.titular_id))
        setCatalogos({
          rubros: rubros.filter(r => r.activo || r.id === m?.rubro_id),
          lotes: [...lotes, ...loteActual.filter(l => !lotes.some(o => o.id === l.id))],
          conceptos: conceptos.filter(c => c.activo || c.id === m?.concepto_id),
          grupos,
          titulares: todosTitulares.filter(t => t.activo || usados.has(t.id)),
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los catálogos")) })
    return () => { vigente = false }
  }, [establecimientoId, m?.rubro_id, m?.concepto_id, m?.lote_id, inicial?.titulares])

  if (!catalogos) {
    return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <div className="h-96 rounded-lg border bg-muted/30 animate-pulse" />
  }

  const ingreso = sentido === "ingreso"
  const total = parsearMonto(precio.monto)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!rubroId) return setError("Elegí el rubro")
    if (!conceptoId) return setError("Elegí el concepto")
    const leido = leerPrecio(precio, fecha, m?.fecha_pago)
    if ("error" in leido) return setError(leido.error)
    const reparto = leerTitulares(titulares, leido.precio.monto)
    if ("error" in reparto) return setError(reparto.error)
    const pago = leerPagoFactura(pagoFactura)
    if ("error" in pago) return setError(pago.error)
    setEnviando(true)
    try {
      const datos = {
        fecha, sentido, rubro_id: rubroId, concepto_id: conceptoId, precio: { ...leido.precio, ...pago.datos },
        contraparte: contraparte.trim() || null, lote_id: loteId || null, titulares: reparto.titulares,
      }
      if (editando) {
        await editarMovimiento({ id, ...datos })
        toast.success("Movimiento actualizado")
      } else {
        await registrarMovimiento({ id, establecimiento_id: establecimientoId, ...datos })
        // Los archivos, después: si alguno falla, el movimiento ya quedó y se adjunta desde la lista
        const fallidos: string[] = []
        for (const a of archivos) {
          try {
            await subirArchivoAMovimiento(establecimientoId, id, a)
          } catch {
            fallidos.push(a.file.name)
          }
        }
        toast.success(ingreso ? "Ingreso cargado" : "Gasto cargado")
        if (fallidos.length > 0) toast.error(`No se pudo subir ${fallidos.join(", ")}: adjuntalo desde Movimientos`)
      }
      onListo()
    } catch (err) {
      // Al cargar, el id se conserva: si llegó a guardarse, reintentar no lo duplica
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  const chip = (activo: boolean) => cn("min-h-11 md:min-h-9 rounded-full border px-4 text-sm font-medium transition-colors",
    activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")
  const nombreLote = catalogos.lotes.find(l => l.id === loteId)?.nombre

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
      {deActividad ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Viene de {m!.concepto}: la fecha ({fechaCorta(fecha)}), el tipo{nombreLote ? " y el lote" : ""} son los de la actividad.
        </p>
      ) : (
        <div className="flex gap-2" role="group" aria-label="Ingreso o gasto">
          <button type="button" aria-pressed={!ingreso} className={chip(!ingreso)} onClick={() => { setSentido("egreso"); setConceptoId("") }}>Gasto</button>
          <button type="button" aria-pressed={ingreso} className={chip(ingreso)} onClick={() => { setSentido("ingreso"); setConceptoId("") }}>Ingreso</button>
        </div>
      )}

      {!deActividad && (
        <div className="space-y-1.5">
          <Label htmlFor="mov-fecha">Fecha</Label>
          <Input id="mov-fecha" type="date" max={hoyLocal()} className={cn(CAMPO, "sm:max-w-56")} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="mov-concepto">Concepto</Label>
        <select id="mov-concepto" className={SELECT_NATIVO} value={conceptoId} onChange={e => setConceptoId(e.target.value)}>
          <option value="">Elegí</option>
          <OpcionesConcepto conceptos={catalogos.conceptos} grupos={catalogos.grupos} tipo={sentido} />
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mov-rubro">Rubro</Label>
        <select id="mov-rubro" className={SELECT_NATIVO} value={rubroId} onChange={e => setRubroId(e.target.value)}>
          <option value="">Elegí</option>
          {catalogos.rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </div>

      {!deActividad && (
        <div className="space-y-1.5">
          <Label htmlFor="mov-contraparte">{ingreso ? "De quién" : "A quién"} <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Input id="mov-contraparte" className={CAMPO} value={contraparte} onChange={e => setContraparte(e.target.value)} />
        </div>
      )}

      <CamposPrecio id="mov" valor={precio} onCambio={setPrecio} ingreso={ingreso} fecha={fecha}
        consultarTipoCambioAlInicio={!editando || m?.moneda_original !== "UYU"} />

      {catalogos.titulares.length > 0 && (
        <div className="space-y-1.5">
          <Label>Titulares <span className="font-normal text-muted-foreground">(opcional: uno, o repartido entre varios)</span></Label>
          <RepartoTitulares titulares={catalogos.titulares} filas={titulares} onCambio={setTitulares}
            total={total !== null && !Number.isNaN(total) ? total : null} moneda={precio.moneda} disabled={enviando} />
        </div>
      )}

      <CampoPagador id="mov" establecimientoId={establecimientoId} ingreso={ingreso} valor={pagoFactura.pagadorId}
        onCambio={pagadorId => setPagoFactura(v => ({ ...v, pagadorId }))} actual={m?.pagador_id} recordarUltimo={!editando} />

      {!deActividad && (
        <div className="space-y-1.5">
          <Label htmlFor="mov-lote">Lote <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <select id="mov-lote" className={SELECT_NATIVO} value={loteId} onChange={e => setLoteId(e.target.value)}>
            <option value="">Sin lote</option>
            {catalogos.lotes.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
      )}

      <DatosFactura id="mov" establecimientoId={establecimientoId} valor={pagoFactura} onCambio={setPagoFactura} />

      {!editando && (
        <div className="space-y-1.5">
          <Label>Archivos <span className="font-normal text-muted-foreground">(opcional: factura, recibo...)</span></Label>
          <ElegirArchivosMovimiento elegidos={archivos} onCambio={setArchivos} disabled={enviando} />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Guardando..." : editando ? "Guardar cambios" : "Guardar"}</Button>
        <Button type="button" variant="outline" className={BOTON} onClick={onCancelar} disabled={enviando}>Cancelar</Button>
      </div>
    </form>
  )
}
