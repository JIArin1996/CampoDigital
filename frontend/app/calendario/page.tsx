"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CalendarCheck, Plus } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getPersonas } from "@/lib/queries/bitacora"
import { getCalendario } from "@/lib/queries/calendario"
import { getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { buttonVariants } from "@/components/ui/button"
import { ItemCalendario, claveFila } from "@/components/calendario/ItemCalendario"
import { diasEntre } from "@/components/bitacora/formato"
import { hoyLocal } from "@/components/lotes/formato"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { FilaCalendario, OrigenCalendario } from "@/types/bitacora"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]

interface Datos {
  clave: string
  pendientes: FilaCalendario[]
  terminadas: FilaCalendario[] | null
  personas: Persona[]
  nombresLote: Map<string, string>
  lotesActivos: { id: string; nombre: string }[]
}

// Responsable: "" todos, "mias" (las mías y las sin responsable), "nadie" (sin responsable) o el id de una persona
type FiltroResponsable = string

export default function CalendarioPage() {
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <Calendario />
    </Suspense>
  )
}

function Calendario() {
  const params = useSearchParams()
  const { establecimientoActivo, puedeOperar, perfil, cargando: cargandoCtx } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  const [responsable, setResponsable] = useState<FiltroResponsable>("")
  const [loteId, setLoteId] = useState("")
  const [origen, setOrigen] = useState<OrigenCalendario | null>(null)
  const [verTerminadas, setVerTerminadas] = useState(params.get("ver") === "todas")
  const [version, setVersion] = useState(0)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clave = JSON.stringify([estId, verTerminadas, version])

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([
      getCalendario(estId),
      verTerminadas ? getCalendario(estId, true) : Promise.resolve(null),
      getPersonas(estId),
      getLotes(estId, "activo"),
      getLotes(estId, "cerrado"),
    ])
      .then(([pendientes, terminadas, personas, activos, cerrados]) => {
        if (!vigente) return
        setDatos({
          clave: JSON.stringify([estId, verTerminadas, version]),
          pendientes, terminadas, personas,
          nombresLote: new Map([...activos, ...cerrados].map(l => [l.id, l.nombre])),
          lotesActivos: activos.map(l => ({ id: l.id, nombre: l.nombre })),
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el calendario")) })
    return () => { vigente = false }
  }, [estId, verTerminadas, version])

  if (cargandoCtx) return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) {
    return <PageContainer title="Calendario"><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  }

  const actualizando = !datos || datos.clave !== clave
  const hoy = hoyLocal()
  const miPersona = datos?.personas.find(p => p.user_id && p.user_id === perfil?.id)?.id ?? null
  const nombrePersona = (id: string) => datos?.personas.find(p => p.id === id)?.nombre

  const pasaFiltros = (f: FilaCalendario) =>
    (!origen || f.origen === origen) &&
    (!loteId || f.lotes.includes(loteId)) &&
    (responsable === "" ||
      (responsable === "mias" && (f.persona_id === null || f.persona_id === miPersona)) ||
      (responsable === "nadie" && f.persona_id === null) ||
      f.persona_id === responsable)

  const pendientes = (datos?.pendientes ?? []).filter(pasaFiltros)
  const grupos = [
    { titulo: "Vencidas", filas: pendientes.filter(f => f.fecha < hoy), alerta: true },
    { titulo: "Hoy y próximos 7 días", filas: pendientes.filter(f => f.fecha >= hoy && diasEntre(hoy, f.fecha) <= 7), alerta: false },
    { titulo: "Más adelante", filas: pendientes.filter(f => diasEntre(hoy, f.fecha) > 7), alerta: false },
  ]
  const terminadas = (datos?.terminadas ?? []).filter(pasaFiltros)

  const chip = (activo: boolean) =>
    cn("shrink-0 min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
      activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")
  const lista = (filas: FilaCalendario[]) => (
    <ul className="space-y-2">
      {filas.map(f => (
        <li key={claveFila(f)}>
          <ItemCalendario fila={f} nombresLote={datos!.nombresLote} nombrePersona={nombrePersona}
            puedeOperar={puedeOperar} onCambio={() => setVersion(v => v + 1)} />
        </li>
      ))}
    </ul>
  )

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Calendario</h1>
        {puedeOperar && (
          <Link href="/bitacora/nueva?tipo=tarea" className={buttonVariants({ className: "h-11 md:h-8" })}>
            <Plus className="h-4 w-4 mr-1" /> Nueva tarea
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="space-y-3 mb-5">
        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Qué mostrar">
          <button type="button" aria-pressed={!origen} className={chip(!origen)} onClick={() => setOrigen(null)}>Todo</button>
          <button type="button" aria-pressed={origen === "tarea"} className={chip(origen === "tarea")} onClick={() => setOrigen("tarea")}>Tareas</button>
          <button type="button" aria-pressed={origen === "dosis"} className={chip(origen === "dosis")} onClick={() => setOrigen("dosis")}>Próximas dosis</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Responsable" className={SELECT_NATIVO} value={responsable} onChange={e => setResponsable(e.target.value)}>
            <option value="">Todos los responsables</option>
            <option value="mias">Mías y sin responsable</option>
            <option value="nadie">Sin responsable</option>
            {datos?.personas.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select aria-label="Lote" className={SELECT_NATIVO} value={loteId} onChange={e => setLoteId(e.target.value)}>
            <option value="">Todos los lotes</option>
            {datos?.lotesActivos.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 min-h-11 cursor-pointer select-none w-fit">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={verTerminadas} onChange={e => setVerTerminadas(e.target.checked)} />
          <span className="text-sm">Ver terminadas</span>
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {!datos ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border bg-muted/30 animate-pulse" />)}</div>
      ) : (
        <div className={cn("space-y-6 transition-opacity", actualizando && "opacity-60")}>
          {pendientes.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <CalendarCheck className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No hay nada pendiente con estos filtros.</p>
            </div>
          )}
          {grupos.filter(g => g.filas.length > 0).map(g => (
            <section key={g.titulo} className="space-y-2">
              <h2 className={cn("font-semibold", g.alerta && "text-destructive")}>
                {g.titulo} <span className="font-normal text-muted-foreground">({g.filas.length})</span>
              </h2>
              {lista(g.filas)}
            </section>
          ))}
          {verTerminadas && (
            <section className="space-y-2">
              <h2 className="font-semibold">Terminadas <span className="font-normal text-muted-foreground">(las más recientes)</span></h2>
              {!datos.terminadas ? <div className="h-28 rounded-lg border bg-muted/30 animate-pulse" />
                : terminadas.length === 0 ? <p className="text-sm text-muted-foreground">No hay tareas terminadas con estos filtros.</p>
                : lista(terminadas)}
            </section>
          )}
        </div>
      )}
    </PageContainer>
  )
}
