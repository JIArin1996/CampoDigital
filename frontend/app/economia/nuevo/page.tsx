"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getRubrosTodos, registrarMovimiento } from "@/lib/queries/economia"
import { getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { CamposPrecio } from "@/components/economia/CamposPrecio"
import { leerPrecio, precioVacio, type PrecioForm } from "@/components/economia/formato"
import { nuevoId } from "@/components/actividades/formato"
import { hoyLocal } from "@/components/lotes/formato"
import { BOTON, CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { Sentido, Rubro } from "@/types/economia"
import type { Lote } from "@/types/lotes"

/**
 * Carga manual de un ingreso o un gasto (arrendamiento forestal, sueldos, insumos, impuestos...).
 * Las compras y ventas de animales no van acá: su plata se carga con la actividad.
 */
export default function NuevoMovimientoPage() {
  const router = useRouter()
  const { establecimientoActivo, puedeOperar, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  const [id] = useState(nuevoId)
  const [catalogos, setCatalogos] = useState<{ estId: string; rubros: Rubro[]; lotes: Lote[] } | null>(null)
  const [sentido, setSentido] = useState<Sentido>("egreso")
  const [fecha, setFecha] = useState(hoyLocal())
  const [rubroId, setRubroId] = useState("")
  const [concepto, setConcepto] = useState("")
  const [contraparte, setContraparte] = useState("")
  const [loteId, setLoteId] = useState("")
  const [precio, setPrecio] = useState<PrecioForm>(precioVacio)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([getRubrosTodos(estId), getLotes(estId, "activo")])
      .then(([rubros, lotes]) => { if (vigente) setCatalogos({ estId, rubros: rubros.filter(r => r.activo), lotes }) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los rubros")) })
    return () => { vigente = false }
  }, [estId])

  const volver = <VolverAlLote href="/economia" texto="Volver a economía" />
  if (cargando) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) return <PageContainer>{volver}<p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  if (!puedeOperar) return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso de carga en este establecimiento.</p></PageContainer>

  const listos = catalogos?.estId === estId ? catalogos : null
  const ingreso = sentido === "ingreso"

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!rubroId) return setError("Elegí el rubro")
    if (!concepto.trim()) return setError("Indicá el concepto")
    const leido = leerPrecio(precio)
    if ("error" in leido) return setError(leido.error)
    setEnviando(true)
    try {
      await registrarMovimiento({
        id, establecimiento_id: estId!, fecha, sentido, rubro_id: rubroId, concepto: concepto.trim(), precio: leido.precio,
        contraparte: contraparte.trim() || null, lote_id: loteId || null,
      })
      toast.success(ingreso ? "Ingreso cargado" : "Gasto cargado")
      router.push("/economia")
    } catch (err) {
      // El id se conserva: si llegó a guardarse, reintentar no lo duplica
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  const chip = (activo: boolean) => cn("min-h-11 md:min-h-9 rounded-full border px-4 text-sm font-medium transition-colors",
    activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold">Cargar ingreso o gasto</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Las compras y ventas de animales se cargan con la actividad; acá va todo lo demás.
      </p>

      {!listos ? <div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /> : (
        <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
          <div className="flex gap-2" role="group" aria-label="Ingreso o gasto">
            <button type="button" aria-pressed={!ingreso} className={chip(!ingreso)} onClick={() => setSentido("egreso")}>Gasto</button>
            <button type="button" aria-pressed={ingreso} className={chip(ingreso)} onClick={() => setSentido("ingreso")}>Ingreso</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mov-fecha">Fecha</Label>
              <Input id="mov-fecha" type="date" max={hoyLocal()} className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-rubro">Rubro</Label>
              <select id="mov-rubro" className={SELECT_NATIVO} value={rubroId} onChange={e => setRubroId(e.target.value)}>
                <option value="">Elegí</option>
                {listos.rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mov-concepto">Concepto</Label>
            <Input id="mov-concepto" className={CAMPO} placeholder={ingreso ? "Ej: Arrendamiento forestal" : "Ej: Sueldos de octubre"}
              value={concepto} onChange={e => setConcepto(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mov-contraparte">{ingreso ? "De quién" : "A quién"} <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input id="mov-contraparte" className={CAMPO} value={contraparte} onChange={e => setContraparte(e.target.value)} />
          </div>

          <CamposPrecio id="mov" valor={precio} onCambio={setPrecio} ingreso={ingreso} />

          <div className="space-y-1.5">
            <Label htmlFor="mov-lote">Lote <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <select id="mov-lote" className={SELECT_NATIVO} value={loteId} onChange={e => setLoteId(e.target.value)}>
              <option value="">Sin lote</option>
              {listos.lotes.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Guardando..." : "Guardar"}</Button>
            <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>Cancelar</Button>
          </div>
        </form>
      )}
    </PageContainer>
  )
}
