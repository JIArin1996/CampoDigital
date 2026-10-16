"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getDestinosOperacion, getEspecies, getLotes, getStockLotes, unirLotes } from "@/lib/queries/lotes"
import { getPotreros } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { BOTON, CAMPO, SELECT_NATIVO, TEXTAREA } from "@/components/shared/estilos"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import { cn } from "@/lib/utils"
import type { Potrero } from "@/types/database"
import type { Especie, Lote, StockLote } from "@/types/lotes"

interface Datos {
  estId: string
  lotes: Lote[]
  stock: StockLote[]
  especies: Especie[]
  potreros: Potrero[]
}

export default function UnirLotesPage() {
  // useSearchParams necesita un Suspense alrededor
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <UnirLotes />
    </Suspense>
  )
}

function UnirLotes() {
  const router = useRouter()
  const loteInicial = useSearchParams().get("lote")
  const { establecimientoActivo, puedeOperar, cargando: cargandoCtx } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  const [datos, setDatos] = useState<Datos | null>(null)
  const [origenes, setOrigenes] = useState<string[]>(() => (loteInicial ? [loteInicial] : []))
  const [modo, setModo] = useState<"existente" | "nuevo">("existente")
  const [destinoId, setDestinoId] = useState("")
  const [nombre, setNombre] = useState("")
  const [potreroId, setPotreroId] = useState("")
  const [campana, setCampana] = useState("")
  const [fecha, setFecha] = useState(hoyLocal())
  const [notas, setNotas] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([getLotes(estId, "activo"), getStockLotes(estId), getEspecies(estId), getPotreros(estId)])
      .then(([lotes, stock, especies, potreros]) => {
        if (vigente) setDatos({ estId, lotes, stock, especies, potreros })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los lotes")) })
    return () => { vigente = false }
  }, [estId])

  const volver = <VolverAlLote href={loteInicial ? `/lotes/${loteInicial}` : "/lotes"} texto={loteInicial ? "Volver al lote" : "Volver a lotes"} />
  const listos = datos && datos.estId === estId ? datos : null

  if (cargandoCtx || (estId && !listos && !error)) {
    return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }
  if (!establecimientoActivo || !listos) {
    return <PageContainer>{volver}<p className="text-muted-foreground">{error ?? "Elegí un establecimiento."}</p></PageContainer>
  }
  if (!puedeOperar) {
    return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso de carga en este establecimiento.</p></PageContainer>
  }

  const total = (loteId: string) => listos.stock.filter(s => s.lote_id === loteId).reduce((s, x) => s + x.cabezas, 0)
  const nombreEspecie = (id: string) => listos.especies.find(e => e.id === id)?.nombre ?? ""
  // Solo se unen lotes de la misma especie: la del primer lote elegido
  const especieElegida = listos.lotes.find(l => l.id === origenes[0])?.especie_id ?? null
  const candidatos = listos.lotes.filter(l => !especieElegida || l.especie_id === especieElegida)
  const destinosPosibles = candidatos.filter(l => !origenes.includes(l.id))
  const totalOrigenes = origenes.reduce((s, id) => s + total(id), 0)

  const alternar = (id: string) => {
    setOrigenes(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    if (id === destinoId) setDestinoId("")
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (origenes.length === 0) return setError("Elegí al menos un lote para unir")
    if (modo === "existente" && !destinoId) return setError("Elegí el lote destino")
    if (modo === "nuevo" && origenes.length < 2) return setError("Para crear un lote nuevo elegí al menos dos lotes")
    if (modo === "nuevo" && !nombre.trim()) return setError("Poné un nombre al lote nuevo")

    setEnviando(true)
    try {
      const operacion = await unirLotes({
        lotes_origen: origenes,
        fecha,
        destino_id: modo === "existente" ? destinoId : null,
        nuevo: modo === "nuevo" ? { nombre: nombre.trim(), potrero_id: potreroId || null, campana: campana.trim() || null } : null,
        notas: notas.trim() || null,
      })
      const [destino] = await getDestinosOperacion(operacion)
      toast.success("Lotes unidos")
      router.push(`/lotes/${destino ?? destinoId}`)
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold">Unir lotes</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Todos los animales de los lotes elegidos pasan al destino, y esos lotes quedan cerrados.
      </p>

      <form onSubmit={onSubmit} className="space-y-6 max-w-xl">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium mb-1">
            Lotes que se juntan{especieElegida ? ` · ${nombreEspecie(especieElegida)}` : ""}
          </legend>
          {candidatos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay lotes activos.</p>
          ) : (
            <ul className="space-y-2">
              {candidatos.map(l => {
                const elegido = origenes.includes(l.id)
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      aria-pressed={elegido}
                      onClick={() => alternar(l.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                        elegido ? "border-primary bg-accent" : "hover:bg-muted/50"
                      )}
                    >
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded border-2",
                        elegido ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                        {elegido && <Check className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">{l.nombre}</span>
                        <span className="block text-xs text-muted-foreground">desde {fechaCorta(l.fecha_apertura)}</span>
                      </span>
                      <span className="text-lg font-bold tabular-nums">{total(l.id)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">Se mueven {totalOrigenes} cabezas.</p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium mb-1">Destino</legend>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={modo === "existente" ? "default" : "outline"} onClick={() => setModo("existente")}>Lote existente</Button>
            <Button type="button" variant={modo === "nuevo" ? "default" : "outline"} onClick={() => setModo("nuevo")}>Lote nuevo</Button>
          </div>

          {modo === "existente" ? (
            <div className="space-y-1.5">
              <Label htmlFor="unir-destino">Lote destino</Label>
              <select id="unir-destino" className={SELECT_NATIVO} value={destinoId} onChange={e => setDestinoId(e.target.value)}>
                <option value="">Elegir</option>
                {destinosPosibles.map(l => <option key={l.id} value={l.id}>{l.nombre} ({total(l.id)})</option>)}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="unir-nombre">Nombre del lote nuevo</Label>
                <Input id="unir-nombre" className={CAMPO} value={nombre} onChange={e => setNombre(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="unir-potrero">Potrero</Label>
                  <select id="unir-potrero" className={SELECT_NATIVO} value={potreroId} onChange={e => setPotreroId(e.target.value)}>
                    <option value="">Sin potrero</option>
                    {listos.potreros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unir-campana">Campaña</Label>
                  <Input id="unir-campana" className={CAMPO} value={campana} onChange={e => setCampana(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="unir-fecha">Fecha</Label>
          <Input id="unir-fecha" type="date" max={hoyLocal()} className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
          <p className="text-xs text-muted-foreground">No puede ser anterior al último movimiento de los lotes que se juntan.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="unir-notas">Notas</Label>
          <textarea id="unir-notas" rows={2} className={TEXTAREA} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Uniendo..." : "Unir"}</Button>
          <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>Cancelar</Button>
        </div>
      </form>
    </PageContainer>
  )
}
