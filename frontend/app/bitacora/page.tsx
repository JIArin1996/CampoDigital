"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { NotebookPen, Plus, Search } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getEntradas, getPersonas } from "@/lib/queries/bitacora"
import { getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TarjetaEntrada } from "@/components/bitacora/TarjetaEntrada"
import { ESTADOS_IDEA, ETIQUETA_ESTADO, ETIQUETA_TIPO, TIPOS_ENTRADA } from "@/components/bitacora/formato"
import { CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { EntradaConLotes, EstadoIdea, TipoEntrada } from "@/types/bitacora"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]

interface Datos {
  clave: string
  entradas: EntradaConLotes[]
  personas: Persona[]
  nombresLote: Map<string, string>
  lotesActivos: { id: string; nombre: string }[]
}

export default function BitacoraPage() {
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <Bitacora />
    </Suspense>
  )
}

const esTipo = (v: string | null): v is TipoEntrada => !!v && (TIPOS_ENTRADA as string[]).includes(v)
const esEstado = (v: string | null): v is EstadoIdea => !!v && (ESTADOS_IDEA as string[]).includes(v)

function Bitacora() {
  const params = useSearchParams()
  const { establecimientoActivo, puedeOperar, cargando: cargandoCtx } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  // Filtros (se pueden pasar por la URL: ?tipo=idea&estado=abierta&lote=<id>)
  const [tipo, setTipo] = useState<TipoEntrada | null>(esTipo(params.get("tipo")) ? (params.get("tipo") as TipoEntrada) : null)
  const [estado, setEstado] = useState<EstadoIdea | null>(esEstado(params.get("estado")) ? (params.get("estado") as EstadoIdea) : null)
  const [loteId, setLoteId] = useState<string>(params.get("lote") ?? "")
  const [busqueda, setBusqueda] = useState("")
  const [texto, setTexto] = useState("")              // búsqueda aplicada (con una pausa al tipear)
  const [incluirAnuladas, setIncluirAnuladas] = useState(false)
  const [version, setVersion] = useState(0)

  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  // La búsqueda se aplica medio segundo después de dejar de tipear
  useEffect(() => {
    const t = setTimeout(() => setTexto(busqueda), 500)
    return () => clearTimeout(t)
  }, [busqueda])

  const clave = JSON.stringify([estId, tipo, estado, loteId, texto, incluirAnuladas, version])

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([
      getEntradas(estId, { tipo, estadoIdea: estado, loteId: loteId || null, texto, incluirAnuladas }),
      getPersonas(estId),
      getLotes(estId, "activo"),
      getLotes(estId, "cerrado"),
    ])
      .then(([entradas, personas, activos, cerrados]) => {
        if (!vigente) return
        setDatos({
          clave: JSON.stringify([estId, tipo, estado, loteId, texto, incluirAnuladas, version]),
          entradas,
          personas,
          nombresLote: new Map([...activos, ...cerrados].map(l => [l.id, l.nombre])),
          lotesActivos: activos.map(l => ({ id: l.id, nombre: l.nombre })),
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar la bitácora")) })
    return () => { vigente = false }
  }, [estId, tipo, estado, loteId, texto, incluirAnuladas, version])

  if (cargandoCtx) return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) {
    return <PageContainer title="Bitácora"><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  }

  const actualizando = !datos || datos.clave !== clave
  const chip = (activo: boolean) =>
    cn("shrink-0 min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
      activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Bitácora</h1>
        {puedeOperar && (
          <Link href={loteId ? `/bitacora/nueva?lote=${loteId}` : "/bitacora/nueva"} className={buttonVariants({ className: "h-11 md:h-8" })}>
            <Plus className="h-4 w-4 mr-1" /> Nueva nota
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="space-y-3 mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Buscar en la bitácora" placeholder="Buscar..." className={`${CAMPO} pl-9`}
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>

        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Tipo">
          <button type="button" className={chip(!tipo)} onClick={() => { setTipo(null); setEstado(null) }}>Todas</button>
          {TIPOS_ENTRADA.map(t => (
            <button key={t} type="button" aria-pressed={tipo === t} className={chip(tipo === t)}
              onClick={() => { setTipo(t); if (t !== "idea") setEstado(null) }}>
              {ETIQUETA_TIPO[t]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Lote" className={SELECT_NATIVO} value={loteId} onChange={e => setLoteId(e.target.value)}>
            <option value="">Todos los lotes</option>
            {datos?.lotesActivos.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            {loteId && datos && !datos.lotesActivos.some(l => l.id === loteId) && (
              <option value={loteId}>{datos.nombresLote.get(loteId) ?? "Lote"}</option>
            )}
          </select>
          <select aria-label="Estado de la idea" className={SELECT_NATIVO} value={estado ?? ""}
            onChange={e => { const v = e.target.value; setEstado(esEstado(v) ? v : null); if (esEstado(v)) setTipo("idea") }}>
            <option value="">Ideas: todas</option>
            {ESTADOS_IDEA.map(e => <option key={e} value={e}>Ideas {ETIQUETA_ESTADO[e].toLowerCase()}s</option>)}
          </select>
        </div>

        <label className="flex items-center gap-2 min-h-11 cursor-pointer select-none w-fit">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={incluirAnuladas} onChange={e => setIncluirAnuladas(e.target.checked)} />
          <span className="text-sm">Ver anuladas</span>
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {/* Entradas */}
      {!datos ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border bg-muted/30 animate-pulse" />)}</div>
      ) : datos.entradas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <NotebookPen className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No hay entradas con estos filtros.</p>
        </div>
      ) : (
        <ul className={cn("space-y-3 transition-opacity", actualizando && "opacity-60")}>
          {datos.entradas.map(entrada => (
            <li key={entrada.id}>
              <TarjetaEntrada
                entrada={entrada}
                nombresLote={datos.nombresLote}
                personas={datos.personas}
                puedeOperar={puedeOperar}
                onCambio={() => setVersion(v => v + 1)}
              />
            </li>
          ))}
        </ul>
      )}
      {datos && datos.entradas.length >= 100 && (
        <p className="text-sm text-muted-foreground mt-4">Se muestran las 100 más recientes. Usá los filtros para encontrar las anteriores.</p>
      )}
    </PageContainer>
  )
}
