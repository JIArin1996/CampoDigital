"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getPersonas } from "@/lib/queries/bitacora"
import { getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { buttonVariants } from "@/components/ui/button"
import { VistaLista } from "@/components/calendario/VistaLista"
import { PUNTO, VistaMes, type ClaseItem } from "@/components/calendario/VistaMes"
import { mesDe } from "@/components/calendario/fechas"
import { hoyLocal } from "@/components/lotes/formato"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]
type Vista = "mes" | "lista"

// Tipos que se prenden y apagan (en la Lista solo cuentan tareas y dosis)
const CLASES: { clase: ClaseItem; label: string; enLista: boolean }[] = [
  { clase: "tarea", label: "Tareas", enLista: true },
  { clase: "dosis", label: "Próximas dosis", enLista: true },
  { clase: "actividad", label: "Actividades", enLista: false },
  { clase: "nota", label: "Notas", enLista: false },
]

export default function CalendarioPage() {
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <Calendario />
    </Suspense>
  )
}

// ?fecha=YYYY-MM-DD abre el mes de esa fecha con el día elegido; ?vista=lista abre la lista; ?ver=todas, con las terminadas
function Calendario() {
  const params = useSearchParams()
  const { establecimientoActivo, puedeOperar, perfil, cargando: cargandoCtx } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  const fechaUrl = /^\d{4}-\d{2}-\d{2}$/.test(params.get("fecha") ?? "") ? params.get("fecha")! : null
  const [vista, setVista] = useState<Vista>(params.get("vista") === "lista" || params.get("ver") === "todas" ? "lista" : "mes")
  const [mes, setMes] = useState(mesDe(fechaUrl ?? hoyLocal()))
  const [dia, setDia] = useState<string | null>(fechaUrl ?? hoyLocal())
  const [clases, setClases] = useState<Set<ClaseItem>>(new Set(CLASES.map(c => c.clase)))
  const [responsable, setResponsable] = useState("")   // "", "mias", "nadie" o el id de una persona
  const [loteId, setLoteId] = useState("")
  const [datos, setDatos] = useState<{ estId: string; personas: Persona[]; nombresLote: Map<string, string>; lotesActivos: { id: string; nombre: string }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([getPersonas(estId), getLotes(estId, "activo"), getLotes(estId, "cerrado")])
      .then(([personas, activos, cerrados]) => {
        if (!vigente) return
        setDatos({
          estId, personas,
          nombresLote: new Map([...activos, ...cerrados].map(l => [l.id, l.nombre])),
          lotesActivos: activos.map(l => ({ id: l.id, nombre: l.nombre })),
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el calendario")) })
    return () => { vigente = false }
  }, [estId])

  if (cargandoCtx) return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo || !estId) {
    return <PageContainer title="Calendario"><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  }

  const listos = datos?.estId === estId ? datos : null
  const miPersona = listos?.personas.find(p => p.user_id && p.user_id === perfil?.id)?.id ?? null
  const nombrePersona = (id: string) => listos?.personas.find(p => p.id === id)?.nombre

  // Responsable y lote: valen para tareas, dosis (sin responsable), actividades y notas
  const pasa = (x: { persona_id: string | null; lotes: string[] | null }) =>
    (!loteId || (x.lotes ?? []).includes(loteId)) &&
    (responsable === "" ||
      (responsable === "mias" && (x.persona_id === null || x.persona_id === miPersona)) ||
      (responsable === "nadie" && x.persona_id === null) ||
      x.persona_id === responsable)

  const alternar = (c: ClaseItem) => setClases(prev => {
    const nuevo = new Set(prev)
    if (nuevo.has(c)) nuevo.delete(c)
    else nuevo.add(c)
    return nuevo
  })

  const pestaña = (v: Vista, label: string) => (
    <button type="button" role="tab" aria-selected={vista === v} onClick={() => setVista(v)}
      className={cn("flex-1 min-h-11 rounded-md text-sm font-semibold transition-colors",
        vista === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {label}
    </button>
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

      <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1 mb-4 md:max-w-xs">
        {pestaña("mes", "Mes")}
        {pestaña("lista", "Lista")}
      </div>

      {/* Filtros: tipos (son también la referencia de colores), responsable y lote */}
      <div className="space-y-3 mb-5">
        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Qué mostrar">
          {CLASES.filter(c => vista === "mes" || c.enLista).map(({ clase, label }) => {
            const activo = clases.has(clase)
            return (
              <button key={clase} type="button" aria-pressed={activo} onClick={() => alternar(clase)}
                className={cn("shrink-0 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  activo ? "border-foreground/30 bg-card" : "text-muted-foreground opacity-60 hover:opacity-100")}>
                <span className={cn("h-2.5 w-2.5 rounded-full", activo ? PUNTO[clase] : "border border-muted-foreground")} />
                {label}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Responsable" className={SELECT_NATIVO} value={responsable} onChange={e => setResponsable(e.target.value)}>
            <option value="">Todos los responsables</option>
            <option value="mias">Mías y sin responsable</option>
            <option value="nadie">Sin responsable</option>
            {listos?.personas.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select aria-label="Lote" className={SELECT_NATIVO} value={loteId} onChange={e => setLoteId(e.target.value)}>
            <option value="">Todos los lotes</option>
            {listos?.lotesActivos.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {!listos ? (
        <div className="h-96 rounded-lg border bg-muted/30 animate-pulse" />
      ) : vista === "mes" ? (
        <VistaMes estId={estId} mes={mes} onMes={setMes} dia={dia} onDia={setDia} clases={clases} pasa={pasa}
          nombresLote={listos.nombresLote} personas={listos.personas} puedeOperar={puedeOperar} />
      ) : (
        <VistaLista estId={estId} pasa={f => clases.has(f.origen) && pasa(f)} nombresLote={listos.nombresLote}
          nombrePersona={nombrePersona} puedeOperar={puedeOperar} verTerminadasInicial={params.get("ver") === "todas"} />
      )}
    </PageContainer>
  )
}
