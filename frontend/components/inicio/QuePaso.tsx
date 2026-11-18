"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { getUltimasCargas, type Novedad } from "@/lib/queries/inicio"
import { ACTIVIDAD, coloresActividad } from "@/components/actividades/actividad-iconos"
import { COLOR_TIPO, ETIQUETA_TIPO, diasEntre } from "@/components/bitacora/formato"
import { ICONO_TIPO } from "@/components/bitacora/TarjetaEntrada"
import { hoyLocal } from "@/components/lotes/formato"
import { cn } from "@/lib/utils"

const LIMITE = 10       // en el celular se ven 5
const EN_CELULAR = 5

const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("") || "?"

// Fecha en que se hizo: "hoy", "ayer" o "lun 10/11"
function cuando(fecha: string, hoy: string) {
  const d = diasEntre(fecha, hoy)
  if (d === 0) return "hoy"
  if (d === 1) return "ayer"
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-UY", { weekday: "short", day: "2-digit", month: "2-digit" })
}

function contenido(n: Novedad, nombresLote: Map<string, string>) {
  if (n.clase === "actividad") {
    const a = n.actividad
    const lotes = a.lote_id ? nombresLote.get(a.lote_id) : (a.lotes ?? []).map(id => nombresLote.get(id)).filter(Boolean).join(", ")
    return {
      titulo: a.tipo === "personalizada" && a.personalizada ? a.personalizada : ACTIVIDAD[a.tipo].etiqueta,
      detalle: [lotes, a.cabezas ? `${a.cabezas} cab.` : null].filter(Boolean).join(" · ") || null,
      href: `/actividades/${a.id}`,
    }
  }
  const e = n.entrada
  return {
    titulo: ETIQUETA_TIPO[e.tipo],
    detalle: e.texto,
    href: e.tipo === "tarea" && e.vencimiento ? `/calendario?fecha=${e.vencimiento}` : `/bitacora?tipo=${e.tipo}`,
  }
}

// Ícono en su círculo: el color de la familia de la actividad, o el del tipo de nota
function Icono({ novedad: n }: { novedad: Novedad }) {
  if (n.clase === "actividad") {
    const I = ACTIVIDAD[n.actividad.tipo].icono
    return (
      <span style={coloresActividad(n.actividad.tipo)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--f)] text-[var(--c)]">
        <I aria-hidden className="h-5 w-5" />
      </span>
    )
  }
  const I = ICONO_TIPO[n.entrada.tipo]
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", COLOR_TIPO[n.entrada.tipo])}>
      <I aria-hidden className="h-5 w-5" />
    </span>
  )
}

/**
 * Qué pasó: actividades y notas de la bitácora juntas, por la fecha en que se hicieron (a igual fecha, lo último
 * cargado primero). Cada renglón dice cuándo fue y quién lo cargó; "Nuevo" marca lo que cargó otro después de
 * la visita anterior al Inicio (aunque tenga fecha atrasada).
 */
export function QuePaso({ estId, anterior, yo, personas, nombresLote }: {
  estId: string
  anterior: string | null          // última visita anterior; null = primera vez o todavía no se sabe
  yo: string | null
  personas: { nombre: string; user_id: string | null }[]
  nombresLote: Map<string, string>
}) {
  const [datos, setDatos] = useState<{ estId: string; filas: Novedad[] } | null>(null)
  useEffect(() => {
    let vigente = true
    getUltimasCargas(estId, LIMITE)
      .then(filas => { if (vigente) setDatos({ estId, filas }) })
      .catch(() => { if (vigente) setDatos({ estId, filas: [] }) })
    return () => { vigente = false }
  }, [estId])

  const filas = datos?.estId === estId ? datos.filas : null
  const hoy = hoyLocal()
  const nombreDe = (userId: string | null) =>
    (userId && personas.find(p => p.user_id === userId)?.nombre) || "Sin nombre"

  return (
    <section id="que-paso" aria-labelledby="inicio-que-paso" className="space-y-3 scroll-mt-20">
      <div className="flex items-center justify-between gap-3">
        <h2 id="inicio-que-paso" className="font-semibold">Qué pasó</h2>
        <div className="flex items-center gap-4">
          <Link href="/actividades" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
            Actividades <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href="/bitacora" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
            Bitácora <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {!filas ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />)}
        </div>
      ) : filas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Todavía no se cargó nada.</p>
      ) : (
        <ul className="space-y-2">
          {filas.map((n, i) => {
            const { titulo, detalle, href } = contenido(n, nombresLote)
            const nombre = nombreDe(n.created_by)
            const nuevo = anterior !== null && n.created_at > anterior && n.created_by !== yo
            return (
              <li key={`${n.clase}:${n.id}`} className={cn(i >= EN_CELULAR && "hidden lg:block")}>
                <Link href={href}
                  className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors">
                  <Icono novedad={n} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-base font-semibold md:text-sm">{titulo}</span>
                      {nuevo && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                          <span aria-hidden className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" /> Nuevo
                        </span>
                      )}
                    </span>
                    {detalle && <span className="mt-0.5 block text-sm text-muted-foreground line-clamp-2">{detalle}</span>}
                    <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                        {iniciales(nombre)}
                      </span>
                      <span className="truncate">{cuando(n.fecha, hoy)} · cargó {nombre}</span>
                    </span>
                  </span>
                  <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
