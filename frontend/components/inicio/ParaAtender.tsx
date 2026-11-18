"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, CircleCheck, Lightbulb } from "lucide-react"

import { getCarencias } from "@/lib/queries/actividades"
import { contarIdeasAbiertas } from "@/lib/queries/bitacora"
import { EVENTO_TAREAS, getCalendario } from "@/lib/queries/calendario"
import { getPendientes } from "@/lib/queries/economia"
import { diasEntre } from "@/components/bitacora/formato"
import { usd } from "@/components/economia/formato"
import { hoyLocal } from "@/components/lotes/formato"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { FilaCalendario } from "@/types/bitacora"
import type { Carencia } from "@/types/actividades"
import type { Pendiente } from "@/types/economia"

const MAXIMO = 5
const DIAS = 7

type Tono = "rojo" | "ambar" | "verde" | "neutro"
const TONO: Record<Tono, string> = {
  rojo:   "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  ambar:  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  verde:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  neutro: "bg-muted text-foreground",
}

interface Renglon {
  clave: string
  tipo: string         // de dónde sale: Tarea, Dosis, Economía o Sanidad
  grupo: number        // 0 vencidas, 1 hoy, 2 próximos 7 días, 3 carencias
  fecha: string
  etiqueta: string
  tono: Tono
  titulo: string
  detalle: string | null
  href: string
  responsables: string[] | null   // solo las tareas; null = le toca a cualquiera
}

// "25/11"
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

const nombresDe = (ids: string[], nombres: Map<string, string>) =>
  ids.map(id => nombres.get(id)).filter(Boolean).join(", ") || null

function deCalendario(f: FilaCalendario, hoy: string, nombresLote: Map<string, string>): Renglon {
  const d = diasEntre(hoy, f.fecha)
  return {
    clave: f.origen === "tarea" ? `t:${f.entrada_id}` : `d:${f.actividad_id}:${f.orden}`,
    tipo: f.origen === "tarea" ? "Tarea" : "Dosis",
    grupo: d < 0 ? 0 : d === 0 ? 1 : 2,
    fecha: f.fecha,
    etiqueta: d < 0 ? "Vencida" : d === 0 ? "Hoy" : diaMes(f.fecha),
    tono: d < 0 ? "rojo" : d === 0 ? "ambar" : "neutro",
    titulo: f.texto,
    detalle: [d < 0 ? `venció el ${diaMes(f.fecha)}` : null, nombresDe(f.lotes, nombresLote)].filter(Boolean).join(" · ") || null,
    href: f.origen === "tarea" ? `/calendario?fecha=${f.fecha}` : `/actividades/${f.actividad_id}`,
    responsables: f.origen === "tarea" ? f.responsables : null,
  }
}

// Sin fecha prevista, vale la fecha del movimiento: así un pendiente viejo aparece como vencido
function dePendiente(p: Pendiente, hoy: string): Renglon {
  const vence = p.fecha_vencimiento ?? p.fecha
  const d = diasEntre(hoy, vence)
  const cobro = p.sentido === "ingreso"
  return {
    clave: `m:${p.id}`,
    tipo: "Economía",
    grupo: d < 0 ? 0 : d === 0 ? 1 : 2,
    fecha: vence,
    etiqueta: cobro ? "A cobrar" : "A pagar",
    tono: cobro ? "verde" : d < 0 ? "rojo" : "ambar",
    titulo: `${p.concepto} · ${usd(Number(p.monto_usd))}`,
    detalle: [
      d < 0 ? `venció el ${diaMes(vence)}` : d === 0 ? "vence hoy" : `vence el ${diaMes(vence)}`,
      p.contraparte,
    ].filter(Boolean).join(" · "),
    href: "/economia?pestana=pendientes",
    responsables: null,
  }
}

function deCarencia(c: Carencia, nombresLote: Map<string, string>): Renglon {
  return {
    clave: `c:${c.lote_id}`,
    tipo: "Sanidad",
    grupo: 3,
    fecha: c.fin_carencia,
    etiqueta: "Carencia",
    tono: "neutro",
    titulo: `${nombresLote.get(c.lote_id) ?? "Lote"} en carencia hasta el ${diaMes(c.fin_carencia)}`,
    detalle: c.producto,
    href: `/lotes/${c.lote_id}`,
    responsables: null,
  }
}

const CLAVE_FILTRO = "inicio:filtro-atender"
const leerFiltro = () => { try { return localStorage.getItem(CLAVE_FILTRO) === "mias" } catch { return false } }
const guardarFiltro = (mias: boolean) => { try { localStorage.setItem(CLAVE_FILTRO, mias ? "mias" : "todas") } catch { /* sin almacenamiento */ } }

/**
 * Para atender: tareas y dosis vencidas o de los próximos 7 días, pagos y cobros pendientes vencidos o que
 * vencen en 7 días, y lotes en carencia. Una sola lista: vencidas → hoy → próximos días → carencias.
 * "Mías" (sin el rol Consulta y con ficha de persona): las tareas donde está la persona o que no tienen
 * responsable; lo demás no tiene responsable y se ve siempre.
 */
export function ParaAtender({ estId, lotesActivos, nombresLote, miPersonaId }: {
  estId: string
  lotesActivos: string[]
  nombresLote: Map<string, string>
  miPersonaId: string | null      // null: sin filtro "Mías"
}) {
  const hoy = hoyLocal()
  const [datos, setDatos] = useState<{ clave: string; renglones: Renglon[]; ideas: number } | null>(null)
  const [version, setVersion] = useState(0)
  // El selector aparece recién con los datos (miPersonaId), así que leerlo acá no cambia lo que llega del servidor
  const [mias, setMias] = useState(leerFiltro)

  // Una tarea marcada desde otro lado (calendario, bitácora) recarga la lista
  useEffect(() => {
    const recargar = () => setVersion(v => v + 1)
    window.addEventListener(EVENTO_TAREAS, recargar)
    return () => window.removeEventListener(EVENTO_TAREAS, recargar)
  }, [])

  const clave = `${estId}:${hoy}:${lotesActivos.join(",")}:${version}`
  useEffect(() => {
    let vigente = true
    Promise.all([getCalendario(estId), getPendientes(estId), getCarencias(lotesActivos, hoy), contarIdeasAbiertas(estId)])
      .then(([calendario, pendientes, carencias, ideas]) => {
        if (!vigente) return
        // Una carencia por lote: la que termina más tarde
        const porLote = new Map<string, Carencia>()
        for (const c of carencias) {
          const actual = porLote.get(c.lote_id)
          if (!actual || c.fin_carencia > actual.fin_carencia) porLote.set(c.lote_id, c)
        }
        const renglones = [
          ...calendario.filter(f => diasEntre(hoy, f.fecha) <= DIAS).map(f => deCalendario(f, hoy, nombresLote)),
          ...pendientes.filter(p => diasEntre(hoy, p.fecha_vencimiento ?? p.fecha) <= DIAS).map(p => dePendiente(p, hoy)),
          ...[...porLote.values()].map(c => deCarencia(c, nombresLote)),
        ].sort((a, b) => a.grupo - b.grupo || a.fecha.localeCompare(b.fecha))
        setDatos({ clave, renglones, ideas })
      })
      .catch(() => { if (vigente) setDatos({ clave, renglones: [], ideas: 0 }) })
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave identifica la carga
  }, [clave])

  const listos = datos?.clave === clave ? datos : null
  const filtrar = mias && miPersonaId !== null
  const visibles = (listos?.renglones ?? []).filter(r =>
    !filtrar || r.responsables === null || r.responsables.length === 0 || r.responsables.includes(miPersonaId))
  const resto = visibles.length - MAXIMO

  const elegir = (valor: boolean) => { setMias(valor); guardarFiltro(valor) }

  return (
    <section aria-labelledby="inicio-atender" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="inicio-atender" className="font-semibold">Para atender</h2>
        <Link href="/calendario" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
          Calendario <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {miPersonaId && (
        <div role="group" aria-label="Qué mostrar" className="flex gap-1 rounded-lg bg-muted p-1 md:max-w-xs">
          {([[false, "Todas"], [true, "Mías"]] as const).map(([valor, texto]) => (
            <button key={texto} type="button" aria-pressed={mias === valor} onClick={() => elegir(valor)}
              className={cn("flex-1 min-h-11 rounded-md text-sm font-semibold transition-colors",
                mias === valor ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {texto}
            </button>
          ))}
        </div>
      )}

      {!listos ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />)}
        </div>
      ) : visibles.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border bg-card px-4 py-4 text-base font-medium text-primary">
          <CircleCheck className="h-5 w-5 shrink-0" /> Todo al día
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {visibles.slice(0, MAXIMO).map(r => (
              <li key={r.clave}>
                <Link href={r.href}
                  className={cn("block rounded-lg border bg-card px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors",
                    r.tono === "rojo" && "border-destructive/60 bg-destructive/5")}>
                  <span className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", TONO[r.tono])}>{r.etiqueta}</span>
                    <span className="text-xs font-medium text-muted-foreground">{r.tipo}</span>
                    <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />
                  </span>
                  <span className="mt-2 block text-base font-medium md:text-sm">{r.titulo}</span>
                  {r.detalle && (
                    <span className={cn("mt-1 block text-sm", r.grupo === 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {r.detalle}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {resto > 0 && (
            <Link href="/calendario" className={buttonVariants({ variant: "outline", className: "w-full h-11 md:h-9" })}>
              +{resto} más
            </Link>
          )}
        </>
      )}

      {listos && listos.ideas > 0 && (
        <Link href="/bitacora?tipo=idea&estado=abierta"
          className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--etiqueta-idea) text-(--etiqueta-idea-texto)">
            <Lightbulb className="h-5 w-5" />
          </span>
          <span className="flex-1 text-base md:text-sm">
            <span className="font-bold tabular-nums">{listos.ideas}</span> {listos.ideas === 1 ? "idea sin decidir" : "ideas sin decidir"}
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </section>
  )
}
