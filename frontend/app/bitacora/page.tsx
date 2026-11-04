"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { NotebookPen, Plus, Search } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getEntradas, getEstadosDeEntradas, getPersonas, type FiltrosBitacora } from "@/lib/queries/bitacora"
import { getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Cargando } from "@/components/shared/Cargando"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TarjetaEntrada } from "@/components/bitacora/TarjetaEntrada"
import {
  cumpleEstado, esVencida, fechaQueManda, opcionesEstado, TIPOS_ENTRADA, type FiltroEstado,
} from "@/components/bitacora/formato"
import { CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { hoyLocal } from "@/components/lotes/formato"
import { cn } from "@/lib/utils"
import type { EntradaConLotes, EstadoDecision, EstadoIdea, EstadoTarea, TipoEntrada } from "@/types/bitacora"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]

interface Datos {
  clave: string
  entradas: EntradaConLotes[]
  cantidades: Map<FiltroEstado, number>
  personas: Persona[]
  nombresLote: Map<string, string>
  lotesActivos: { id: string; nombre: string }[]
}

export default function BitacoraPage() {
  return (
    <Suspense fallback={<PageContainer><Cargando /></PageContainer>}>
      <Bitacora />
    </Suspense>
  )
}

const PESTANAS: { tipo: TipoEntrada | null; etiqueta: string }[] = [
  { tipo: null, etiqueta: "Todas" },
  { tipo: "tarea", etiqueta: "Tareas" },
  { tipo: "decision", etiqueta: "Decisiones" },
  { tipo: "idea", etiqueta: "Ideas" },
]
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"]
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"]

const esTipo = (v: string | null): v is TipoEntrada => !!v && (TIPOS_ENTRADA as string[]).includes(v)
// Sin tipo, arranca en las abiertas; con un tipo, en todas las de ese tipo
const estadoInicial = (tipo: TipoEntrada | null): FiltroEstado => (tipo ? "todos" : "abiertas")

// El filtro de estado en los términos de la consulta
function filtrosDeEstado(tipo: TipoEntrada | null, estado: FiltroEstado): FiltrosBitacora {
  if (estado === "todos") return {}
  if (estado === "abiertas" || estado === "cerradas") return { cierre: estado }
  if (tipo === "tarea") return { estadoTarea: estado as EstadoTarea }
  if (tipo === "decision") return { estadoDecision: estado as EstadoDecision }
  return { estadoIdea: estado as EstadoIdea }
}

function Bitacora() {
  const params = useSearchParams()
  const { establecimientoActivo, puedeOperar, cargando: cargandoCtx } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  // Filtros (se pueden pasar por la URL: ?tipo=idea&estado=abierta&lote=<id>, ?tipo=decision&estado=realizada,
  // ?estado=cerradas). El estado tiene que ser uno de los del tipo; si no, vale el inicial.
  const tipoUrl = params.get("tipo")
  const [tipo, setTipo] = useState<TipoEntrada | null>(esTipo(tipoUrl) ? tipoUrl : null)
  const [estado, setEstado] = useState<FiltroEstado>(() => {
    const t = esTipo(tipoUrl) ? tipoUrl : null
    const e = params.get("estado")
    return opcionesEstado(t).some(o => o.valor === e) ? (e as FiltroEstado) : estadoInicial(t)
  })
  const [loteId, setLoteId] = useState<string>(params.get("lote") ?? "")
  const [busqueda, setBusqueda] = useState("")
  const [texto, setTexto] = useState("")              // búsqueda aplicada (con una pausa al tipear)
  const [version, setVersion] = useState(0)

  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  // La búsqueda se aplica medio segundo después de dejar de tipear
  useEffect(() => {
    const t = setTimeout(() => setTexto(busqueda), 500)
    return () => clearTimeout(t)
  }, [busqueda])

  const clave = JSON.stringify([estId, tipo, estado, loteId, texto, version])

  useEffect(() => {
    if (!estId) return
    let vigente = true
    const comunes = { tipo, loteId: loteId || null, texto }
    Promise.all([
      getEntradas(estId, { ...comunes, ...filtrosDeEstado(tipo, estado) }),
      getEstadosDeEntradas(estId, comunes),
      getPersonas(estId),
      getLotes(estId, "activo"),
      getLotes(estId, "cerrado"),
    ])
      .then(([entradas, estados, personas, activos, cerrados]) => {
        if (!vigente) return
        setDatos({
          clave: JSON.stringify([estId, tipo, estado, loteId, texto, version]),
          entradas,
          cantidades: new Map(opcionesEstado(tipo).map(o => [o.valor, estados.filter(e => cumpleEstado(e, o.valor)).length])),
          personas,
          nombresLote: new Map([...activos, ...cerrados].map(l => [l.id, l.nombre])),
          lotesActivos: activos.map(l => ({ id: l.id, nombre: l.nombre })),
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar la bitácora")) })
    return () => { vigente = false }
  }, [estId, tipo, estado, loteId, texto, version])

  if (cargandoCtx) return <PageContainer><Cargando /></PageContainer>
  if (!establecimientoActivo) {
    return <PageContainer title="Bitácora"><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  }

  const actualizando = !datos || datos.clave !== clave
  const hoy = hoyLocal()

  // Línea de tiempo: cada entrada en el día que manda (vencimiento, cierre o fecha de la nota), de la más
  // reciente a la más vieja
  const ordenadas = [...(datos?.entradas ?? [])].sort((a, b) => {
    const fa = fechaQueManda(a), fb = fechaQueManda(b)
    return fa === fb ? 0 : fa > fb ? -1 : 1
  })
  const porMes: { mes: string; entradas: EntradaConLotes[] }[] = []
  for (const e of ordenadas) {
    const mes = fechaQueManda(e).slice(0, 7)
    if (porMes.at(-1)?.mes === mes) porMes.at(-1)!.entradas.push(e)
    else porMes.push({ mes, entradas: [e] })
  }

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

      {/* Tipo: pestañas */}
      <div className="grid grid-cols-4 border-b mb-4" role="group" aria-label="Tipo">
        {PESTANAS.map(p => (
          <button key={p.etiqueta} type="button" aria-pressed={tipo === p.tipo}
            className={cn("h-11 -mb-px border-b-[3px] text-sm font-medium transition-colors",
              tipo === p.tipo ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => { setTipo(p.tipo); setEstado(estadoInicial(p.tipo)) }}>
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="space-y-3 mb-5">
        {/* Estado: los del tipo elegido, con su cantidad */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Estado">
          {opcionesEstado(tipo).map(o => {
            const activo = estado === o.valor
            return (
              <button key={o.valor} type="button" aria-pressed={activo} onClick={() => setEstado(o.valor)}
                className={cn("inline-flex min-h-11 md:min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
                  activo ? "border-primary bg-secondary text-secondary-foreground font-semibold ring-1 ring-inset ring-primary" : "hover:bg-muted")}>
                {o.etiqueta}
                <span className={cn("min-w-6 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  activo ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {datos?.cantidades.get(o.valor) ?? "…"}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_16rem]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Buscar en la bitácora" placeholder="Buscar..." className={`${CAMPO} pl-9`}
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <select aria-label="Lote" className={SELECT_NATIVO} value={loteId} onChange={e => setLoteId(e.target.value)}>
            <option value="">Todos los lotes</option>
            {datos?.lotesActivos.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            {loteId && datos && !datos.lotesActivos.some(l => l.id === loteId) && (
              <option value={loteId}>{datos.nombresLote.get(loteId) ?? "Lote"}</option>
            )}
          </select>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {/* Entradas por mes, con el día que manda a la izquierda */}
      {!datos ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border bg-muted/30 animate-pulse" />)}</div>
      ) : ordenadas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <NotebookPen className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No hay entradas con estos filtros.</p>
        </div>
      ) : (
        <div className={cn("space-y-5 transition-opacity", actualizando && "opacity-60")}>
          {porMes.map(({ mes, entradas }) => (
            <section key={mes} className="space-y-3">
              <h2 className="text-sm font-bold">{MESES_LARGO[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}</h2>
              <ul className="space-y-3">
                {entradas.map(entrada => {
                  const dia = fechaQueManda(entrada)
                  const vencida = esVencida(entrada, hoy)
                  return (
                    <li key={entrada.id} className="grid grid-cols-[2.75rem_1fr] gap-3">
                      <div className={cn("pt-2 text-center", vencida && "text-destructive")}>
                        <span className="block text-2xl font-bold leading-none tabular-nums">{dia.slice(8, 10)}</span>
                        <span className={cn("mt-1 block text-[11px] font-semibold uppercase tracking-wider", !vencida && "text-muted-foreground")}>
                          {MESES[Number(dia.slice(5, 7)) - 1]}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <TarjetaEntrada
                          entrada={entrada}
                          nombresLote={datos.nombresLote}
                          personas={datos.personas}
                          puedeOperar={puedeOperar}
                          onCambio={() => setVersion(v => v + 1)}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {datos && datos.entradas.length >= 100 && (
        <p className="text-sm text-muted-foreground mt-4">Se muestran 100 entradas. Usá los filtros para encontrar las demás.</p>
      )}
    </PageContainer>
  )
}
