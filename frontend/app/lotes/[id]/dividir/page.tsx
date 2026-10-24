"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { dividirLote, getContextoLote, type DestinoDivision } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { BOTON, CAMPO, SELECT_NATIVO, TEXTAREA } from "@/components/shared/estilos"
import { hoyLocal } from "@/components/lotes/formato"
import { SelectorAnios } from "@/components/lotes/SelectorAnios"

type Contexto = NonNullable<Awaited<ReturnType<typeof getContextoLote>>>

interface DestinoForm {
  clave: number
  nombre: string
  potrero_id: string
  anios: number[] | null   // null = sin tocar: los del origen (precargados)
  cantidades: Record<string, string>
}

let siguienteClave = 1
const destinoVacio = (): DestinoForm => ({ clave: siguienteClave++, nombre: "", potrero_id: "", anios: null, cantidades: {} })

export default function DividirLotePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { puedeOperarEn, cargando: cargandoCtx } = useEstablecimiento()

  const [ctx, setCtx] = useState<Contexto | null | undefined>(undefined)
  const [fecha, setFecha] = useState(hoyLocal())
  const [notas, setNotas] = useState("")
  const [destinos, setDestinos] = useState<DestinoForm[]>(() => [destinoVacio()])
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
    return <PageContainer>{volver}<p className="text-muted-foreground">Este lote no se puede dividir (está cerrado o no tenés permiso de carga).</p></PageContainer>
  }

  const { lote, categorias, stock, potreros } = ctx
  const conStock = categorias.filter(c => (stock.get(c.id) ?? 0) > 0)

  // Cuánto se lleva cada categoría entre todos los destinos
  const movido = (catId: string) => destinos.reduce((s, d) => s + (Number(d.cantidades[catId]) || 0), 0)
  const totalDestino = (d: DestinoForm) => conStock.reduce((s, c) => s + (Number(d.cantidades[c.id]) || 0), 0)

  const cambiarDestino = (clave: number, cambio: Partial<DestinoForm>) =>
    setDestinos(prev => prev.map(d => (d.clave === clave ? { ...d, ...cambio } : d)))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const armados: DestinoDivision[] = []
    for (const d of destinos) {
      if (!d.nombre.trim()) return setError("Cada lote nuevo necesita un nombre")
      const composicion = conStock
        .map(c => ({ categoria_id: c.id, cabezas: Number(d.cantidades[c.id] || 0) }))
        .filter(x => x.cabezas !== 0)
      if (composicion.some(x => !Number.isInteger(x.cabezas) || x.cabezas < 0)) {
        return setError("Las cabezas tienen que ser números enteros, sin decimales ni negativos")
      }
      if (composicion.length === 0) return setError(`El lote "${d.nombre.trim()}" no tiene animales`)
      armados.push({
        nombre: d.nombre.trim(),
        potrero_id: d.potrero_id || null,
        // Lo que muestra la pantalla: los del origen si no se tocaron
        anios_nacimiento: d.anios ?? lote.anios_nacimiento,
        composicion,
      })
    }
    const excedida = conStock.find(c => movido(c.id) > (stock.get(c.id) ?? 0))
    if (excedida) return setError(`Se llevan más ${excedida.nombre.toLowerCase()} de las que hay en el lote`)

    setEnviando(true)
    try {
      await dividirLote({ lote_id: lote.id, fecha, destinos: armados, notas: notas.trim() || null })
      toast.success(armados.length === 1 ? "Lote dividido" : `Lote dividido en ${armados.length} lotes nuevos`)
      router.push(`/lotes/${lote.id}`)
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold">Dividir {lote.nombre}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Separá animales en uno o más lotes nuevos. Lo que no muevas queda en este lote; si no queda nada, se cierra solo.
      </p>

      {conStock.length === 0 ? (
        <p className="text-muted-foreground">El lote no tiene animales para dividir.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
          <div className="space-y-1.5">
            <Label htmlFor="div-fecha">Fecha</Label>
            <Input id="div-fecha" type="date" max={hoyLocal()} min={lote.fecha_apertura} className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
            <p className="text-xs text-muted-foreground">Puede ser de días anteriores, mientras ese día hubiera los animales.</p>
          </div>

          {destinos.map((d, i) => (
            <Card key={d.clave}>
              <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Lote nuevo {destinos.length > 1 ? i + 1 : ""}</CardTitle>
                {destinos.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Quitar este lote nuevo"
                    onClick={() => setDestinos(prev => prev.filter(x => x.clave !== d.clave))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`div-nombre-${d.clave}`}>Nombre</Label>
                  <Input id={`div-nombre-${d.clave}`} className={CAMPO} placeholder="Ej: Terneros pesados"
                    value={d.nombre} onChange={e => cambiarDestino(d.clave, { nombre: e.target.value })} />
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium mb-1">Cabezas que pasan</legend>
                  <div className="rounded-lg border divide-y">
                    {conStock.map(c => {
                      const hay = stock.get(c.id) ?? 0
                      const queda = hay - movido(c.id)
                      return (
                        <label key={c.id} htmlFor={`div-${d.clave}-${c.id}`} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block text-base md:text-sm">{c.nombre}</span>
                            <span className={`block text-xs ${queda < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                              Hay {hay} · quedan {queda}
                            </span>
                          </span>
                          <Input id={`div-${d.clave}-${c.id}`} type="number" inputMode="numeric" min="0" step="1" placeholder="0"
                            className={`${CAMPO} w-24 text-right tabular-nums`}
                            value={d.cantidades[c.id] ?? ""}
                            onChange={e => cambiarDestino(d.clave, { cantidades: { ...d.cantidades, [c.id]: e.target.value } })} />
                        </label>
                      )
                    })}
                    <div className="flex items-center justify-between px-3 py-3 bg-muted/30">
                      <span className="font-semibold">Total</span>
                      <span className="text-lg font-bold tabular-nums">{totalDestino(d)}</span>
                    </div>
                  </div>
                </fieldset>

                <div className="space-y-1.5">
                  <Label htmlFor={`div-potrero-${d.clave}`}>Potrero</Label>
                  <select id={`div-potrero-${d.clave}`} className={SELECT_NATIVO} value={d.potrero_id}
                    onChange={e => cambiarDestino(d.clave, { potrero_id: e.target.value })}>
                    <option value="">Sin potrero</option>
                    {potreros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`div-anios-${d.clave}`}>Año de nacimiento</Label>
                  <SelectorAnios id={`div-anios-${d.clave}`} valor={d.anios ?? lote.anios_nacimiento}
                    onCambio={anios => cambiarDestino(d.clave, { anios })} />
                  {d.anios === null && lote.anios_nacimiento.length > 0 && (
                    <p className="text-xs text-muted-foreground">Precargado con los del lote de origen.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          <Button type="button" variant="outline" className="w-full" onClick={() => setDestinos(prev => [...prev, destinoVacio()])}>
            <Plus className="h-4 w-4 mr-1" /> Agregar otro lote nuevo
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="div-notas">Notas</Label>
            <textarea id="div-notas" rows={2} className={TEXTAREA} value={notas} onChange={e => setNotas(e.target.value)} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Dividiendo..." : "Dividir"}</Button>
            <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>Cancelar</Button>
          </div>
        </form>
      )}
    </PageContainer>
  )
}
