"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowRight, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getContextoLote, recategorizarLote, type CambioCategoria } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { BOTON, CAMPO, SELECT_NATIVO, TEXTAREA } from "@/components/shared/estilos"
import { hoyLocal } from "@/components/lotes/formato"

type Contexto = NonNullable<Awaited<ReturnType<typeof getContextoLote>>>

interface CambioForm {
  clave: number
  desde: string
  hacia: string
  cabezas: string
}

let siguienteClave = 1
const cambioVacio = (): CambioForm => ({ clave: siguienteClave++, desde: "", hacia: "", cabezas: "" })

export default function RecategorizarLotePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { puedeOperarEn, cargando: cargandoCtx } = useEstablecimiento()

  const [ctx, setCtx] = useState<Contexto | null | undefined>(undefined)
  const [fecha, setFecha] = useState(hoyLocal())
  const [notas, setNotas] = useState("")
  const [cambios, setCambios] = useState<CambioForm[]>(() => [cambioVacio()])
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vigente = true
    getContextoLote(id)
      .then(c => { if (vigente) setCtx(c) })
      .catch(err => { if (vigente) { setCtx(null); setError(mensajeDeError(err, "No se pudo cargar el lote")) } })
    return () => { vigente = false }
  }, [id])

  const volver = <VolverAlLote href={`/lotes/${id}`} />

  if (ctx === undefined || cargandoCtx) {
    return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }
  if (!ctx) {
    return <PageContainer>{volver}<p className="text-muted-foreground">{error ?? "No se encontró el lote."}</p></PageContainer>
  }
  if (!puedeOperarEn(ctx.lote.establecimiento_id) || ctx.lote.estado !== "activo") {
    return <PageContainer>{volver}<p className="text-muted-foreground">Este lote no se puede recategorizar (está cerrado o no tenés permiso de carga).</p></PageContainer>
  }

  const { lote, categorias, stock } = ctx
  const conStock = categorias.filter(c => (stock.get(c.id) ?? 0) > 0)

  const cambiar = (clave: number, cambio: Partial<CambioForm>) =>
    setCambios(prev => prev.map(c => (c.clave === clave ? { ...c, ...cambio } : c)))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const armados: CambioCategoria[] = []
    for (const c of cambios) {
      if (!c.desde || !c.hacia) return setError("En cada cambio elegí la categoría de origen y la de destino")
      if (c.desde === c.hacia) return setError("La categoría de origen y la de destino tienen que ser distintas")
      const n = Number(c.cabezas)
      if (!Number.isInteger(n) || n <= 0) return setError("Las cabezas tienen que ser un número entero mayor a 0")
      armados.push({ desde_categoria_id: c.desde, hacia_categoria_id: c.hacia, cabezas: n })
    }

    setEnviando(true)
    try {
      await recategorizarLote({ lote_id: lote.id, fecha, cambios: armados, notas: notas.trim() || null })
      toast.success("Lote recategorizado")
      router.push(`/lotes/${lote.id}`)
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold">Recategorizar {lote.nombre}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Pasá cabezas de una categoría a otra dentro del mismo lote (por ejemplo, terneros que pasan a novillos).
      </p>

      {conStock.length === 0 ? (
        <p className="text-muted-foreground">El lote no tiene animales.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
          <div className="space-y-1.5">
            <Label htmlFor="rec-fecha">Fecha</Label>
            <Input id="rec-fecha" type="date" max={hoyLocal()} min={lote.fecha_apertura} className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>

          {cambios.map((c, i) => (
            <div key={c.clave} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Cambio {cambios.length > 1 ? i + 1 : ""}</p>
                {cambios.length > 1 && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar este cambio"
                    onClick={() => setCambios(prev => prev.filter(x => x.clave !== c.clave))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`rec-desde-${c.clave}`}>De</Label>
                  <select id={`rec-desde-${c.clave}`} className={SELECT_NATIVO} value={c.desde} onChange={e => cambiar(c.clave, { desde: e.target.value })}>
                    <option value="">Elegir</option>
                    {conStock.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre} ({stock.get(cat.id)})</option>)}
                  </select>
                </div>
                <ArrowRight className="h-5 w-5 mb-3 text-muted-foreground" />
                <div className="space-y-1.5">
                  <Label htmlFor={`rec-hacia-${c.clave}`}>A</Label>
                  <select id={`rec-hacia-${c.clave}`} className={SELECT_NATIVO} value={c.hacia} onChange={e => cambiar(c.clave, { hacia: e.target.value })}>
                    <option value="">Elegir</option>
                    {categorias.filter(cat => cat.id !== c.desde).map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`rec-cab-${c.clave}`}>Cabezas</Label>
                <Input id={`rec-cab-${c.clave}`} type="number" inputMode="numeric" min="1" step="1"
                  className={`${CAMPO} w-32 tabular-nums`} value={c.cabezas} onChange={e => cambiar(c.clave, { cabezas: e.target.value })} />
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" className="w-full" onClick={() => setCambios(prev => [...prev, cambioVacio()])}>
            <Plus className="h-4 w-4 mr-1" /> Agregar otro cambio
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="rec-notas">Notas</Label>
            <textarea id="rec-notas" rows={2} className={TEXTAREA} value={notas} onChange={e => setNotas(e.target.value)} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Guardando..." : "Recategorizar"}</Button>
            <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>Cancelar</Button>
          </div>
        </form>
      )}
    </PageContainer>
  )
}
