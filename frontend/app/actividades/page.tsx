"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ClipboardList, Plus } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getActividades } from "@/lib/queries/actividades"
import { getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { buttonVariants } from "@/components/ui/button"
import { TarjetaActividad } from "@/components/actividades/TarjetaActividad"
import { ETIQUETA_ACTIVIDAD, TIPOS_CARGABLES, esTipoCargable } from "@/components/actividades/formato"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { ActividadResumen, TipoCargable } from "@/types/actividades"

interface Datos {
  clave: string
  actividades: ActividadResumen[]
  nombresLote: Map<string, string>
  lotesActivos: { id: string; nombre: string }[]
}

export default function ActividadesPage() {
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <Actividades />
    </Suspense>
  )
}

function Actividades() {
  const params = useSearchParams()
  const { establecimientoActivo, puedeOperar, cargando: cargandoCtx } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  // Filtros (se pueden pasar por la URL: ?tipo=venta&lote=<id>)
  const [tipo, setTipo] = useState<TipoCargable | null>(esTipoCargable(params.get("tipo")) ? (params.get("tipo") as TipoCargable) : null)
  const [loteId, setLoteId] = useState(params.get("lote") ?? "")
  const [incluirAnuladas, setIncluirAnuladas] = useState(false)

  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clave = JSON.stringify([estId, tipo, loteId, incluirAnuladas])

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([
      getActividades(estId, { tipo, loteId: loteId || null, incluirAnuladas }),
      getLotes(estId, "activo"),
      getLotes(estId, "cerrado"),
    ])
      .then(([actividades, activos, cerrados]) => {
        if (!vigente) return
        setDatos({
          clave: JSON.stringify([estId, tipo, loteId, incluirAnuladas]),
          actividades,
          nombresLote: new Map([...activos, ...cerrados].map(l => [l.id, l.nombre])),
          lotesActivos: activos.map(l => ({ id: l.id, nombre: l.nombre })),
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar las actividades")) })
    return () => { vigente = false }
  }, [estId, tipo, loteId, incluirAnuladas])

  if (cargandoCtx) return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) {
    return <PageContainer title="Actividades"><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  }

  const actualizando = !datos || datos.clave !== clave
  const chip = (activo: boolean) =>
    cn("shrink-0 min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
      activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Actividades</h1>
        {puedeOperar && (
          <Link href={loteId ? `/actividades/nueva?lote=${loteId}` : "/actividades/nueva"} className={buttonVariants({ className: "h-11 md:h-8" })}>
            <Plus className="h-4 w-4 mr-1" /> Nueva
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="space-y-3 mb-5">
        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Tipo">
          <button type="button" className={chip(!tipo)} onClick={() => setTipo(null)}>Todas</button>
          {TIPOS_CARGABLES.map(t => (
            <button key={t} type="button" aria-pressed={tipo === t} className={chip(tipo === t)} onClick={() => setTipo(t)}>
              {ETIQUETA_ACTIVIDAD[t]}
            </button>
          ))}
        </div>

        <select aria-label="Lote" className={SELECT_NATIVO} value={loteId} onChange={e => setLoteId(e.target.value)}>
          <option value="">Todos los lotes</option>
          {datos?.lotesActivos.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          {loteId && datos && !datos.lotesActivos.some(l => l.id === loteId) && (
            <option value={loteId}>{datos.nombresLote.get(loteId) ?? "Lote"}</option>
          )}
        </select>

        <label className="flex items-center gap-2 min-h-11 cursor-pointer select-none w-fit">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={incluirAnuladas} onChange={e => setIncluirAnuladas(e.target.checked)} />
          <span className="text-sm">Ver anuladas</span>
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {!datos ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />)}</div>
      ) : datos.actividades.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No hay actividades con estos filtros.</p>
        </div>
      ) : (
        <ul className={cn("space-y-2 transition-opacity", actualizando && "opacity-60")}>
          {datos.actividades.map(a => (
            <li key={a.id}><TarjetaActividad actividad={a} nombresLote={datos.nombresLote} /></li>
          ))}
        </ul>
      )}
      {datos && datos.actividades.length >= 100 && (
        <p className="text-sm text-muted-foreground mt-4">Se muestran las 100 más recientes. Usá los filtros para encontrar las anteriores.</p>
      )}
    </PageContainer>
  )
}
