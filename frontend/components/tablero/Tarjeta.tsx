"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, GripVertical, X } from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

import { getDatosTablero } from "@/lib/queries/tablero"
import { mensajeDeError } from "@/lib/supabase/errores"
import { ETIQUETA_DIMENSION, filtrosQueNoAplican, medidaDe, type Unidad } from "@/components/tablero/catalogo"
import { rangoEjercicios, rotuloPeriodo, type Rango } from "@/components/tablero/periodos"
import { cn } from "@/lib/utils"
import type { Dimension, FilaTablero, TarjetaTablero } from "@/types/tablero"

// Colores de las series (tokens de gráficos de globals.css)
const COLORES = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-2)", "var(--chart-5)"]
const COLOR_NEGATIVO = "var(--destructive)"

export interface FiltrosAplicados {
  especie_ids?: string[]
  categoria_ids?: string[]
  lote_ids?: string[]
}

function formato(n: number | null, unidad: Unidad) {
  if (n === null || Number.isNaN(n)) return "—"
  return unidad === "%"
    ? `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} %`
    : n.toLocaleString("es-UY", { maximumFractionDigits: 1 })
}

interface Resultado { medida: string; filas: FilaTablero[] }

/**
 * Una tarjeta del tablero: pide a la base sus datos ya agregados (una consulta por medida) con los filtros que le
 * aplican, y los muestra como número, barras, líneas, torta o tabla. Los filtros generales que su fuente no tiene se
 * marcan ("Filtro de categoría no aplica") y no se mandan.
 */
export function Tarjeta({ tarjeta, estId, rango, filtros, activos, edicion, onQuitar }: {
  tarjeta: TarjetaTablero
  estId: string
  rango: Rango                    // el período de arriba
  filtros: FiltrosAplicados       // los filtros generales activos
  activos: Dimension[]            // qué dimensiones tienen filtro activo
  edicion: boolean
  onQuitar?: () => void
}) {
  const def = tarjeta.definicion
  const noAplican = filtrosQueNoAplican(def, activos)
  const propios: FiltrosAplicados = {
    especie_ids: noAplican.includes("especie") ? undefined : filtros.especie_ids,
    categoria_ids: noAplican.includes("categoria") ? undefined : filtros.categoria_ids,
    lote_ids: noAplican.includes("lote") ? undefined : filtros.lote_ids,
  }
  const r = def.periodo && def.periodo !== "tablero" ? rangoEjercicios(rango, def.periodo.ejercicios) : rango
  const clave = JSON.stringify([estId, def, r, propios])

  const [datos, setDatos] = useState<{ clave: string; resultados: Resultado[] } | null>(null)
  const [error, setError] = useState<{ clave: string; texto: string } | null>(null)

  useEffect(() => {
    let vigente = true
    Promise.all(def.medidas.map(async medida => ({
      medida,
      filas: await getDatosTablero({ establecimiento_id: estId, definicion: def, medida, desde: r.desde, hasta: r.hasta, filtros: propios }),
    })))
      .then(resultados => { if (vigente) setDatos({ clave, resultados }) })
      .catch(err => { if (vigente) setError({ clave, texto: mensajeDeError(err, "No se pudieron calcular los datos") }) })
    return () => { vigente = false }
    // clave resume def, rango y filtros
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  const listos = datos?.clave === clave ? datos.resultados : null
  const fallo = error?.clave === clave ? error.texto : null
  const avisos = listos?.flatMap(x => x.filas).find(f => f.avisos)?.avisos ?? null
  const unidad = medidaDe(def.fuente, def.medidas[0])?.unidad ?? "cab"

  return (
    <section aria-label={tarjeta.titulo}
      className={cn("flex h-full flex-col gap-2 rounded-lg border bg-card p-3 md:p-4",
        noAplican.length > 0 && "border-dashed border-amber-600/70")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {edicion && (
            <span className="tablero-manija -ml-1 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
              aria-label="Arrastrar para mover" title="Arrastrar para mover">
              <GripVertical className="h-4 w-4" aria-hidden />
            </span>
          )}
          <h2 className="truncate text-sm font-semibold">{tarjeta.titulo}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {noAplican.map(d => (
            <span key={d} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Filtro de {ETIQUETA_DIMENSION[d]} no aplica
            </span>
          ))}
          {edicion && onQuitar && (
            <button type="button" onClick={onQuitar} aria-label={`Sacar la tarjeta ${tarjeta.titulo}`} title="Sacar del tablero"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {fallo ? (
          <p role="alert" className="text-sm text-destructive">{fallo}</p>
        ) : !listos ? (
          <div className="h-full min-h-12 rounded-md bg-muted/40 animate-pulse" aria-label="Calculando" />
        ) : (
          <Contenido tarjeta={tarjeta} resultados={listos} unidad={unidad} />
        )}
      </div>

      {avisos && <Avisos avisos={avisos} />}
    </section>
  )
}

function Avisos({ avisos }: { avisos: Record<string, unknown> }) {
  const textos: string[] = []
  const sin = Number(avisos.sin_servicio ?? 0)
  if (sin > 0) textos.push(`${sin} ${sin === 1 ? "actividad" : "actividades"} sin servicio registrado (no suman a ninguna temporada)`)
  if (avisos.destete_mixto) textos.push("Un destete sacó crías de dos temporadas: se contó entero en la más antigua")
  if (textos.length === 0) return null
  return (
    <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
      {textos.map(t => (
        <li key={t} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{t}</li>
      ))}
    </ul>
  )
}

function Contenido({ tarjeta, resultados, unidad }: { tarjeta: TarjetaTablero; resultados: Resultado[]; unidad: Unidad }) {
  const def = tarjeta.definicion
  const fuente = def.fuente
  const nombreMedida = (m: string) => medidaDe(fuente, m)?.etiqueta ?? m

  // Número: el último período de la primera medida
  if (def.grafico === "numero") {
    const filas = resultados[0]?.filas ?? []
    const f = filas[filas.length - 1]
    if (!f) return <p className="text-sm text-muted-foreground">Sin datos en el período.</p>
    return (
      <div>
        <p className="text-3xl font-bold tabular-nums">{formato(f.valor, unidad)}</p>
        {unidad === "%" && f.denominador !== null && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {f.numerador?.toLocaleString("es-UY")} de {f.denominador.toLocaleString("es-UY")}
          </p>
        )}
        {unidad === "cab" && <p className="text-xs text-muted-foreground">cabezas{f.periodo ? ` · ${rotuloPeriodo(f.periodo)}` : ""}</p>}
      </div>
    )
  }

  // Datos para los gráficos: un renglón por categoría (abierto, total) o por período, y una serie por medida (o
  // por grupo, si está abierto y en el tiempo)
  const porGrupo = def.abrir_por !== null && def.tiempo === "total"
  let series: { clave: string; nombre: string }[]
  let filasGrafico: Record<string, string | number | null>[]
  if (porGrupo) {
    series = resultados.map(x => ({ clave: x.medida, nombre: nombreMedida(x.medida) }))
    const grupos = [...new Map(resultados[0].filas.map(f => [f.clave ?? "", f.etiqueta ?? "—"])).entries()]
    filasGrafico = grupos.map(([c, nombre]) => ({
      x: nombre,
      ...Object.fromEntries(resultados.map(x => [x.medida, x.filas.find(f => (f.clave ?? "") === c)?.valor ?? null])),
    }))
  } else if (def.abrir_por !== null && resultados.length === 1) {
    const filas = resultados[0].filas
    series = [...new Map(filas.map(f => [f.clave ?? "", f.etiqueta ?? "—"])).entries()].map(([c, n]) => ({ clave: c, nombre: n }))
    const periodos = [...new Set(filas.map(f => f.periodo))]
    filasGrafico = periodos.map(p => ({
      x: rotuloPeriodo(p),
      ...Object.fromEntries(series.map(s => [s.clave, filas.find(f => f.periodo === p && (f.clave ?? "") === s.clave)?.valor ?? null])),
    }))
  } else {
    series = resultados.map(x => ({ clave: x.medida, nombre: nombreMedida(x.medida) }))
    const periodos = [...new Set(resultados.flatMap(x => x.filas.map(f => f.periodo)))]
    filasGrafico = periodos.map(p => ({
      x: rotuloPeriodo(p),
      ...Object.fromEntries(resultados.map(x => [x.medida, x.filas.find(f => f.periodo === p)?.valor ?? null])),
    }))
  }

  if (filasGrafico.length === 0) return <p className="text-sm text-muted-foreground">Sin datos en el período.</p>

  const fmt = (v: unknown) => formato(typeof v === "number" ? v : Number(v), unidad)
  const tooltip = <Tooltip formatter={(v, nombre) => [fmt(v), nombre]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
  const leyenda = series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null

  if (def.grafico === "tabla") {
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium"></th>
              {series.map(s => <th key={s.clave} className="py-1.5 pl-2 text-right font-medium">{s.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {filasGrafico.map(f => (
              <tr key={String(f.x)} className="border-b last:border-0">
                <td className="py-1.5 pr-2">{f.x}</td>
                {series.map(s => <td key={s.clave} className="py-1.5 pl-2 text-right tabular-nums">{fmt(f[s.clave])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (def.grafico === "torta") {
    const s = series[0]
    const datos = filasGrafico.map(f => ({ nombre: String(f.x), valor: Number(f[s.clave] ?? 0) })).filter(d => d.valor > 0)
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius="45%" outerRadius="80%" paddingAngle={1}>
            {datos.map((d, i) => <Cell key={d.nombre} fill={COLORES[i % COLORES.length]} />)}
          </Pie>
          {tooltip}
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (def.grafico === "lineas") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filasGrafico} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          {tooltip}
          {leyenda}
          {series.map((s, i) => (
            <Line key={s.clave} type="monotone" dataKey={s.clave} name={s.nombre} stroke={COLORES[i % COLORES.length]} strokeWidth={2} dot={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  const horizontal = def.grafico === "barras_horizontales"
  const unaSerie = series.length === 1
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={filasGrafico} layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 8, left: horizontal ? 0 : -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="x" tick={{ fontSize: 11 }} width={120} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={48} />
          </>
        )}
        {tooltip}
        {leyenda}
        {series.map((s, i) => (
          <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={COLORES[i % COLORES.length]} radius={2}>
            {/* Una sola serie: las bajas (negativas) en rojo */}
            {unaSerie && filasGrafico.map((f, j) => (
              <Cell key={j} fill={Number(f[s.clave] ?? 0) < 0 ? COLOR_NEGATIVO : COLORES[0]} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
