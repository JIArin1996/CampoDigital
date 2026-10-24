"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react"

import { getActividades } from "@/lib/queries/actividades"
import { getEntradas } from "@/lib/queries/bitacora"
import { getCalendarioMes } from "@/lib/queries/calendario"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button, buttonVariants } from "@/components/ui/button"
import { ItemCalendario, claveFila } from "@/components/calendario/ItemCalendario"
import { TarjetaActividad } from "@/components/actividades/TarjetaActividad"
import { TarjetaEntrada, type Persona } from "@/components/bitacora/TarjetaEntrada"
import { ETIQUETA_ACTIVIDAD } from "@/components/actividades/formato"
import { ETIQUETA_TIPO, textoRepeticion } from "@/components/bitacora/formato"
import { hoyLocal } from "@/components/lotes/formato"
import {
  DIAS_SEMANA, diasDeGrilla, mesDe, nombreDia, nombreMes, ocurrenciasPrevistas, sumarMeses,
} from "@/components/calendario/fechas"
import { cn } from "@/lib/utils"
import type { ActividadResumen } from "@/types/actividades"
import type { EntradaConLotes, FilaCalendario } from "@/types/bitacora"

export type ClaseItem = "tarea" | "dosis" | "actividad" | "nota"

// Lo que cae en un día. "prevista": ocurrencia futura de una tarea repetida (solo se muestra, no se marca).
type Item =
  | { clase: "tarea" | "dosis"; fecha: string; fila: FilaCalendario }
  | { clase: "prevista"; fecha: string; fila: FilaCalendario }
  | { clase: "actividad"; fecha: string; actividad: ActividadResumen }
  | { clase: "nota"; fecha: string; entrada: EntradaConLotes }

// Color de cada clase: punto (celular) y etiqueta (escritorio). Mismos tokens que las etiquetas de la bitácora.
export const PUNTO: Record<ClaseItem, string> = {
  tarea: "bg-(--etiqueta-tarea-texto)",
  dosis: "bg-(--etiqueta-observacion-texto)",
  actividad: "bg-muted-foreground",
  nota: "bg-(--etiqueta-idea-texto)",
}
const ETIQUETA: Record<ClaseItem, string> = {
  tarea: "bg-(--etiqueta-tarea) text-(--etiqueta-tarea-texto)",
  dosis: "bg-(--etiqueta-observacion) text-(--etiqueta-observacion-texto)",
  actividad: "bg-muted text-foreground",
  nota: "bg-(--etiqueta-idea) text-(--etiqueta-idea-texto)",
}
// Orden dentro del día
const ORDEN = { tarea: 0, dosis: 1, prevista: 2, actividad: 3, nota: 4 }

interface Props {
  estId: string
  mes: string                                   // YYYY-MM
  onMes: (mes: string) => void
  dia: string | null                            // día elegido
  onDia: (dia: string | null) => void
  clases: Set<ClaseItem>                        // qué tipos se muestran
  pasa: (x: { persona_id: string | null; lotes: string[] | null }) => boolean   // responsable y lote
  nombresLote: Map<string, string>
  personas: Persona[]
  puedeOperar: boolean
}

/**
 * Pestaña Mes: grilla de lunes a domingo. En el celular cada día muestra puntos de color;
 * en la computadora, el texto de lo que tiene. Al tocar un día, abajo aparece su detalle con las acciones.
 */
export function VistaMes({ estId, mes, onMes, dia, onDia, clases, pasa, nombresLote, personas, puedeOperar }: Props) {
  const [version, setVersion] = useState(0)
  const [datos, setDatos] = useState<{
    clave: string
    filas: FilaCalendario[]
    repetidas: FilaCalendario[]
    actividades: ActividadResumen[]
    notas: EntradaConLotes[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dias = diasDeGrilla(mes)
  const desde = dias[0]
  const hasta = dias[dias.length - 1]
  const hoy = hoyLocal()

  const clave = JSON.stringify([estId, mes, version])
  useEffect(() => {
    let vigente = true
    Promise.all([
      getCalendarioMes(estId, desde, hasta),
      getActividades(estId, { desde, hasta, limite: 1000 }),
      getEntradas(estId, { desde, hasta, sinTareas: true, limite: 1000 }),
    ])
      .then(([cal, actividades, notas]) => {
        if (vigente) setDatos({ clave: JSON.stringify([estId, mes, version]), ...cal, actividades, notas })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el mes")) })
    return () => { vigente = false }
  }, [estId, mes, desde, hasta, version])

  // Todo lo del mes, filtrado y agrupado por día
  const porDia = new Map<string, Item[]>()
  const sumar = (item: Item) => {
    if (item.fecha < desde || item.fecha > hasta) return
    porDia.set(item.fecha, [...(porDia.get(item.fecha) ?? []), item])
  }
  if (datos) {
    for (const f of datos.filas) if (clases.has(f.origen) && pasa(f)) sumar({ clase: f.origen, fecha: f.fecha, fila: f })
    if (clases.has("tarea")) {
      for (const f of datos.repetidas) {
        if (!pasa(f)) continue
        for (const fecha of ocurrenciasPrevistas(f.fecha, f.repetir_cada_dias!, hoy, hasta)) sumar({ clase: "prevista", fecha, fila: f })
      }
    }
    if (clases.has("actividad")) for (const a of datos.actividades) if (pasa(a)) sumar({ clase: "actividad", fecha: a.fecha, actividad: a })
    if (clases.has("nota")) for (const e of datos.notas) if (pasa(e)) sumar({ clase: "nota", fecha: e.fecha, entrada: e })
    for (const items of porDia.values()) items.sort((a, b) => ORDEN[a.clase] - ORDEN[b.clase])
  }

  const pendienteVencida = (i: Item) =>
    (i.clase === "tarea" || i.clase === "dosis") && i.fila.estado === "pendiente" && i.fecha < hoy
  const nombrePersona = (id: string) => personas.find(p => p.id === id)?.nombre
  const recargar = () => setVersion(v => v + 1)

  const delDia = dia ? porDia.get(dia) ?? [] : []

  return (
    <div className="space-y-4">
      {/* Mes y navegación */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold flex-1">{nombreMes(mes)}</h2>
        {mes !== mesDe(hoy) && (
          <Button type="button" variant="outline" size="sm" className="h-11 md:h-8" onClick={() => { onMes(mesDe(hoy)); onDia(hoy) }}>
            Hoy
          </Button>
        )}
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 md:h-8 md:w-8" aria-label="Mes anterior"
          onClick={() => { onMes(sumarMeses(mes, -1)); onDia(null) }}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 md:h-8 md:w-8" aria-label="Mes siguiente"
          onClick={() => { onMes(sumarMeses(mes, 1)); onDia(null) }}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {/* Grilla */}
      <div className={cn("rounded-lg border overflow-hidden transition-opacity", (!datos || datos.clave !== clave) && "opacity-60")}>
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-semibold text-muted-foreground">
          {DIAS_SEMANA.map((d, i) => <div key={i} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((d, i) => {
            const items = porDia.get(d) ?? []
            const fuera = mesDe(d) !== mes
            const vencida = items.some(pendienteVencida)
            const elegido = d === dia
            return (
              <button key={d} type="button" onClick={() => onDia(elegido ? null : d)} aria-pressed={elegido}
                aria-label={`${nombreDia(d)}: ${items.length === 0 ? "nada" : `${items.length} ${items.length === 1 ? "cosa" : "cosas"}`}${vencida ? ", con vencidas" : ""}`}
                className={cn(
                  "flex min-h-14 md:min-h-24 flex-col items-center md:items-stretch gap-1 border-border p-1 text-left transition-colors hover:bg-muted/50",
                  i % 7 !== 6 && "border-r", i < dias.length - 7 && "border-b",
                  fuera && "bg-muted/20", elegido && "bg-accent hover:bg-accent",
                )}>
                <span className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums md:self-start",
                  fuera && "text-muted-foreground/60",
                  vencida && "font-bold text-destructive",
                  d === hoy && "bg-primary font-bold text-primary-foreground",
                )}>
                  {Number(d.slice(8))}
                </span>

                {/* Celular: puntos */}
                {items.length > 0 && (
                  <span className="flex flex-wrap justify-center gap-0.5 md:hidden">
                    {items.slice(0, 4).map((it, k) => (
                      <span key={k} className={cn("h-1.5 w-1.5 rounded-full",
                        it.clase === "prevista" ? "border border-muted-foreground" : pendienteVencida(it) ? "bg-destructive" : PUNTO[it.clase])} />
                    ))}
                    {items.length > 4 && <span className="text-[9px] leading-none text-muted-foreground">+</span>}
                  </span>
                )}

                {/* Escritorio: texto */}
                <span className="hidden md:flex md:flex-col gap-0.5 min-w-0">
                  {items.slice(0, 3).map((it, k) => <Etiqueta key={k} item={it} vencida={pendienteVencida(it)} nombresLote={nombresLote} />)}
                  {items.length > 3 && <span className="px-1 text-[11px] text-muted-foreground">+{items.length - 3} más</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Detalle del día elegido */}
      {!dia ? (
        <p className="text-sm text-muted-foreground">Tocá un día para ver lo que tiene{puedeOperar ? " o anotar una tarea" : ""}.</p>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{nombreDia(dia)}</h3>
            {puedeOperar && (
              <Link href={`/bitacora/nueva?tipo=tarea&vence=${dia}`} className={buttonVariants({ size: "sm", className: "h-11 md:h-8" })}>
                <Plus className="h-4 w-4 mr-1" /> Tarea
              </Link>
            )}
          </div>
          {delDia.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada este día con los filtros elegidos.</p>
          ) : (
            <ul className="space-y-2">
              {delDia.map(it => (
                <li key={claveItem(it)}>
                  {it.clase === "tarea" || it.clase === "dosis" ? (
                    <ItemCalendario fila={it.fila} nombresLote={nombresLote} nombrePersona={nombrePersona} puedeOperar={puedeOperar} onCambio={recargar} />
                  ) : it.clase === "prevista" ? (
                    <div className="rounded-lg border border-dashed px-4 py-3 text-muted-foreground">
                      <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">Prevista</span>
                      <p className="mt-2 text-base md:text-sm">{it.fila.texto}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm">
                        <Repeat className="h-3.5 w-3.5" /> {textoRepeticion(it.fila.repetir_cada_dias!)}: se anota cuando se haga la anterior
                      </p>
                    </div>
                  ) : it.clase === "actividad" ? (
                    <TarjetaActividad actividad={it.actividad} nombresLote={nombresLote} />
                  ) : it.clase === "nota" && (
                    <TarjetaEntrada entrada={it.entrada} nombresLote={nombresLote} personas={personas} puedeOperar={puedeOperar} compacta onCambio={recargar} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

const claveItem = (it: Item) =>
  it.clase === "actividad" ? `a:${it.actividad.id}`
    : it.clase === "nota" ? `n:${it.entrada.id}`
    : it.clase === "prevista" ? `p:${it.fila.entrada_id}:${it.fecha}`
    : claveFila(it.fila)

// Texto corto de un ítem dentro de la celda (escritorio)
function Etiqueta({ item, vencida, nombresLote }: { item: Item; vencida: boolean; nombresLote: Map<string, string> }) {
  let texto: string
  let clase: string
  if (item.clase === "actividad") {
    const a = item.actividad
    const lote = a.lote_id ? nombresLote.get(a.lote_id) : null
    texto = `${a.tipo === "personalizada" && a.personalizada ? a.personalizada : ETIQUETA_ACTIVIDAD[a.tipo]}${lote ? ` · ${lote}` : ""}`
    clase = ETIQUETA.actividad
  } else if (item.clase === "nota") {
    texto = `${ETIQUETA_TIPO[item.entrada.tipo]}: ${item.entrada.texto}`
    clase = ETIQUETA.nota
  } else if (item.clase === "prevista") {
    texto = item.fila.texto
    clase = "border border-dashed text-muted-foreground"
  } else {
    texto = item.fila.texto
    clase = vencida ? "bg-destructive/10 text-destructive font-semibold" : ETIQUETA[item.clase]
  }
  const terminada = (item.clase === "tarea" || item.clase === "dosis") && item.fila.estado !== "pendiente"
  return (
    <span className={cn("truncate rounded px-1 py-0.5 text-[11px] leading-tight", clase, terminada && "line-through opacity-60")}>
      {texto}
    </span>
  )
}
