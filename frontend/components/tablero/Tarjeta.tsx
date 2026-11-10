"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, GripVertical, Pencil, X } from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

import { getDatosTablero } from "@/lib/queries/tablero"
import { mensajeDeError } from "@/lib/supabase/errores"
import { ETIQUETA_DIMENSION, MEJOR_SI_BAJA, MIN_DIAS_POR_DEFECTO, SIN_COLOR, filtranEn, medidaDe, type Unidad } from "@/components/tablero/catalogo"
import { rangoAnioAnterior, rangoEjercicios, rotuloPeriodo, type Rango } from "@/components/tablero/periodos"
import { cn } from "@/lib/utils"
import type { Dimension, FilaTablero, FiltroCruzado, FiltrosIds, TarjetaTablero } from "@/types/tablero"

// Colores de las series (tokens de gráficos de globals.css)
const COLORES = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-2)", "var(--chart-5)"]
const COLOR_NEGATIVO = "var(--destructive)"

type DimFiltro = "especie" | "categoria" | "lote"
const DIMS_FILTRO: DimFiltro[] = ["especie", "categoria", "lote"]
const CLAVE_IDS: Record<DimFiltro, keyof FiltrosIds> = { especie: "especie_ids", categoria: "categoria_ids", lote: "lote_ids" }
const NOMBRE_DIM: Record<DimFiltro, string> = { especie: "Especie", categoria: "Categoría", lote: "Lote" }

function formato(n: number | null, unidad: Unidad) {
  if (n === null || Number.isNaN(n)) return "—"
  switch (unidad) {
    case "%": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} %`
    case "kg": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} kg`
    case "kg/día": return `${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg/día`
    case "kg/vaca": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} kg/vaca`
    case "kg/cab": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 2 })} kg/cab`
    case "razón": return n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case "USD": return `${n < 0 ? "−" : ""}USD ${Math.abs(n).toLocaleString("es-UY", { maximumFractionDigits: 0 })}`
    case "UG/ha": return `${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UG/ha`
    case "UG": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} UG`
    case "ha": return `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} ha`
    case "días": return `${n.toLocaleString("es-UY")} ${n === 1 ? "día" : "días"}`
    default: return n.toLocaleString("es-UY", { maximumFractionDigits: 1 })
  }
}

const mismos = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))

// Filtros que usa una tarjeta: propio > cruzado > general. También qué filtros no le aplican (su fuente no tiene
// esa dimensión) y cuáles choca con su filtro propio ("Especie fija: Vacunos").
export function filtrosDeTarjeta(tarjeta: TarjetaTablero, generales: FiltrosIds, cruzado: FiltroCruzado | null) {
  const def = tarjeta.definicion
  const tiene = filtranEn(def)
  const efectivos: FiltrosIds = {}
  const noAplican: Dimension[] = []
  const fijos: { dim: DimFiltro; ids: string[] }[] = []
  for (const d of DIMS_FILTRO) {
    const k = CLAVE_IDS[d]
    const propio = def.filtros?.[k]?.length ? def.filtros[k] : undefined
    // El cruzado no filtra a la tarjeta donde se tocó (ahí solo resalta)
    const cruz = cruzado && cruzado.dimension === d && cruzado.origen !== tarjeta.id ? [cruzado.clave] : undefined
    const externo = cruz ?? generales[k]
    if (!tiene.includes(d)) {
      if (externo) noAplican.push(d)
      continue
    }
    if (propio) {
      efectivos[k] = propio
      if (externo && !mismos(externo, propio)) fijos.push({ dim: d, ids: propio })
    } else if (externo) {
      efectivos[k] = externo
    }
  }
  return { efectivos, noAplican, fijos }
}

// total: en una tabla abierta, el total de la medida calculado por la base (otra llamada sin abrir); no siempre es la
// suma de las filas (stock al cierre, porcentajes, promedios). undefined: la tarjeta no lo muestra.
export interface Resultado { medida: string; filas: FilaTablero[]; total?: number | null }

// Lo que muestra una tarjeta, para exportarlo (Excel)
export interface DatosTarjeta {
  titulo: string
  unidad: Unidad
  resultados: Resultado[]
  comparados: Resultado[] | null     // el mismo cálculo, un año antes (si se compara)
  etiquetaComparada: string | null
}

/**
 * Una tarjeta del tablero: pide a la base sus datos ya agregados (una consulta por medida) con los filtros que le
 * tocan, y los muestra como número, barras, líneas, torta o tabla. Los filtros que su fuente no tiene se marcan
 * ("Filtro de categoría no aplica") y no se mandan. Si está abierta por especie, categoría o lote, tocar una barra,
 * porción o fila filtra las demás tarjetas por eso (filtrado cruzado).
 */
// Lo último que calculó cada tarjeta: al pasar a la vista de impresión las tarjetas se vuelven a armar y no hace
// falta pedir los datos de nuevo (solo se usa al imprimir, y por un minuto)
const CALCULADOS = new Map<string, { hora: number; resultados: Resultado[]; comparados: Resultado[] | null }>()
const calculado = (clave: string) => {
  const c = CALCULADOS.get(clave)
  return c && Date.now() - c.hora < 60_000 ? c : null
}

export function Tarjeta({ tarjeta, estId, rango, generales, cruzado, nombre, edicion, onQuitar, onEditar, onElegir, comparar = null, onDatos, impresion = false }: {
  tarjeta: TarjetaTablero
  estId: string
  rango: Rango                                   // el período de arriba
  generales: FiltrosIds                          // los filtros generales activos
  cruzado: FiltroCruzado | null
  nombre: (dim: DimFiltro, id: string) => string // para "Especie fija: Vacunos"
  edicion: boolean
  onQuitar?: () => void
  onEditar?: () => void
  onElegir?: (c: Omit<FiltroCruzado, "origen">) => void
  comparar?: string | null                       // con qué se compara ("Ejercicio 2024/25"): las mismas fechas, un año antes
  onDatos?: (id: string, datos: DatosTarjeta) => void
  impresion?: boolean
}) {
  const def = tarjeta.definicion
  const { efectivos, noAplican, fijos } = filtrosDeTarjeta(tarjeta, generales, cruzado)
  const r = def.periodo && def.periodo !== "tablero" ? rangoEjercicios(rango, def.periodo.ejercicios) : rango
  const rc = comparar ? rangoAnioAnterior(r) : null
  const clave = JSON.stringify([estId, def, r, efectivos, rc])

  const [datos, setDatos] = useState<{ clave: string; resultados: Resultado[]; comparados: Resultado[] | null } | null>(() => {
    const c = impresion ? calculado(clave) : null
    return c ? { clave, resultados: c.resultados, comparados: c.comparados } : null
  })
  const [error, setError] = useState<{ clave: string; texto: string } | null>(null)

  useEffect(() => {
    if (datos?.clave === clave) return
    let vigente = true
    // Tabla abierta por un grupo (sin el tiempo): también el total, calculado por la base
    const conTotal = def.grafico === "tabla" && def.abrir_por !== null && def.tiempo === "total"
    const pedir = (rr: Rango) => Promise.all(def.medidas.map(async medida => {
      const consulta = { establecimiento_id: estId, medida, desde: rr.desde, hasta: rr.hasta, filtros: efectivos }
      const sumaTotal = conTotal && !medidaDe(def.fuente, medida)?.abrirObligatorio
      const [filas, total] = await Promise.all([
        getDatosTablero({ ...consulta, definicion: def }),
        sumaTotal ? getDatosTablero({ ...consulta, definicion: { ...def, abrir_por: null } }) : Promise.resolve(null),
      ])
      return { medida, filas, ...(sumaTotal ? { total: total?.[0]?.valor ?? null } : {}) }
    }))
    Promise.all([pedir(r), rc ? pedir(rc) : Promise.resolve(null)])
      .then(([resultados, comparados]) => {
        CALCULADOS.set(clave, { hora: Date.now(), resultados, comparados })
        if (vigente) setDatos({ clave, resultados, comparados })
      })
      .catch(err => { if (vigente) setError({ clave, texto: mensajeDeError(err, "No se pudieron calcular los datos") }) })
    return () => { vigente = false }
    // clave resume def, rango y filtros
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  const listos = datos?.clave === clave ? datos.resultados : null
  const comparados = datos?.clave === clave ? datos.comparados : null
  const fallo = error?.clave === clave ? error.texto : null
  const avisos = listos?.flatMap(x => x.filas).find(f => f.avisos)?.avisos ?? null
  const unidad = medidaDe(def.fuente, def.medidas[0])?.unidad ?? "cab"

  // Avisa a la página lo que muestra (para exportar a Excel)
  useEffect(() => {
    if (datos && datos.clave === clave && onDatos) {
      onDatos(tarjeta.id, { titulo: tarjeta.titulo, unidad, resultados: datos.resultados, comparados: datos.comparados, etiquetaComparada: comparar })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, tarjeta.titulo])
  const dimCruzable = def.abrir_por === "especie" || def.abrir_por === "categoria" || def.abrir_por === "lote" ? def.abrir_por : null
  // "Sin asignar" no es un filtro posible
  const elegir = dimCruzable && onElegir && !edicion
    ? (clave: string, etiqueta: string) => { if (clave !== "sin") onElegir({ dimension: dimCruzable, clave, etiqueta }) }
    : undefined
  const elegido = cruzado && cruzado.origen === tarjeta.id ? cruzado.clave : null

  return (
    <section aria-label={tarjeta.titulo}
      className={cn("flex h-full flex-col gap-2 rounded-lg border bg-card p-3 md:p-4 print:break-inside-avoid",
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
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {noAplican.map(d => (
            <span key={d} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Filtro de {ETIQUETA_DIMENSION[d]} no aplica
            </span>
          ))}
          {fijos.map(f => (
            <span key={f.dim} className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              {NOMBRE_DIM[f.dim]} fija: {f.ids.map(id => nombre(f.dim, id)).join(", ")}
            </span>
          ))}
          {edicion && onEditar && (
            <button type="button" onClick={onEditar} aria-label={`Editar la tarjeta ${tarjeta.titulo}`} title="Editar"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
          )}
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
          <Contenido tarjeta={tarjeta} resultados={listos} comparados={comparados} etiquetaComp={comparar} unidad={unidad} animar={!impresion}
            elegir={elegir} elegido={elegido} />
        )}
      </div>

      {elegir && listos && !elegido && def.grafico !== "numero" && (
        <p className="text-[11px] text-muted-foreground">Tocá una {def.grafico === "tabla" ? "fila" : def.grafico === "torta" ? "porción" : "barra"} para filtrar el resto del tablero.</p>
      )}
      {avisos && <Avisos avisos={avisos} minDias={def.opciones?.min_dias ?? MIN_DIAS_POR_DEFECTO} />}
    </section>
  )
}

const MOTIVO_DESCARTE: Record<string, string> = {
  venta: "venta", compra: "compra", union: "unión", division: "división", destete: "destete", paricion: "parición",
  ajuste: "ajuste de stock", recategorizacion: "recategorización", paricion_madres: "parición de las madres pesadas",
  esquila: "esquila", consumo: "consumo",
}

function Avisos({ avisos, minDias }: { avisos: Record<string, unknown>; minDias: number }) {
  const textos: string[] = []
  const descartes = (avisos.tramos_descartados ?? null) as Record<string, number> | null
  if (descartes) {
    const total = Object.values(descartes).reduce((s, n) => s + n, 0)
    const partes = Object.entries(descartes).map(([motivo, n]) =>
      motivo === "corto" ? `${n} de menos de ${minDias} días` : `${n} por ${MOTIVO_DESCARTE[motivo] ?? motivo}`)
    textos.push(`${total} ${total === 1 ? "tramo descartado" : "tramos descartados"} entre pesadas: ${partes.join(", ")}`)
  }
  const sin = Number(avisos.sin_servicio ?? 0)
  if (sin > 0) textos.push(`${sin} ${sin === 1 ? "actividad" : "actividades"} sin servicio registrado (no suman a ninguna temporada)`)
  if (avisos.destete_mixto) textos.push("Un destete sacó crías de dos temporadas: se contó entero en la más antigua")
  const usd = (n: unknown) => `USD ${Number(n).toLocaleString("es-UY", { maximumFractionDigits: 0 })}`
  if (avisos.usd_sin_especie) textos.push(`${usd(avisos.usd_sin_especie)} de movimientos sin especie asignada quedaron afuera del filtro`)
  if (avisos.usd_sin_lote) textos.push(`${usd(avisos.usd_sin_lote)} de movimientos sin lote quedaron afuera del filtro`)
  const sinDibujar = Number(avisos.potreros_sin_dibujar ?? 0)
  if (sinDibujar > 0) textos.push(`${sinDibujar} ${sinDibujar === 1 ? "potrero activo sin dibujar" : "potreros activos sin dibujar"}: no suma${sinDibujar === 1 ? "" : "n"} superficie y la carga queda más alta`)
  const ugSinPotrero = Number(avisos.ug_sin_potrero ?? 0)
  if (ugSinPotrero > 0) textos.push(`${ugSinPotrero.toLocaleString("es-UY", { maximumFractionDigits: 1 })} UG sin potrero asignado: cuentan en la carga global pero no en la de ningún potrero`)
  const sinUg = (avisos.categorias_sin_ug ?? null) as string[] | null
  if (sinUg && sinUg.length > 0) textos.push(`Sin UG cargada (no suman): ${sinUg.join(", ")}. Se cargan en Especies.`)
  if (avisos.varias_especies) textos.push("Mezcla especies: abrí o filtrá por especie para ver el % de cada una")
  const sinPeso = Number(avisos.destetados_sin_peso ?? 0)
  if (sinPeso > 0) textos.push(`${sinPeso} ${sinPeso === 1 ? "destetado" : "destetados"} sin peso: no suman kilos`)
  const cab = (clave: string) => Number(avisos[clave] ?? 0)
  const cabezas = (n: number) => `${n.toLocaleString("es-UY")} ${n === 1 ? "cabeza" : "cabezas"}`
  if (cab("cab_con_peso_referencia") > 0) textos.push(`${cabezas(cab("cab_con_peso_referencia"))} sin pesada cerca (60 días): se valuaron con el peso de referencia`)
  if (cab("cab_sin_peso") > 0) textos.push(`${cabezas(cab("cab_sin_peso"))} sin pesada ni peso de referencia: no suman kilos. El peso de referencia se carga en Especies.`)
  if (cab("cab_vendidas_sin_kg") > 0) textos.push(`${cabezas(cab("cab_vendidas_sin_kg"))} vendidas sin kg`)
  if (cab("cab_compradas_sin_kg") > 0) textos.push(`${cabezas(cab("cab_compradas_sin_kg"))} compradas sin kg`)
  if (cab("cab_consumidas_sin_kg") > 0) textos.push(`${cabezas(cab("cab_consumidas_sin_kg"))} de consumo sin kg`)
  if (textos.length === 0) return null
  return (
    <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
      {textos.map(t => (
        <li key={t} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{t}</li>
      ))}
    </ul>
  )
}

type FilaGrafico = Record<string, string | number | null>

function Contenido({ tarjeta, resultados, comparados, etiquetaComp, unidad, animar, elegir, elegido }: {
  tarjeta: TarjetaTablero
  animar: boolean
  resultados: Resultado[]
  comparados: Resultado[] | null
  etiquetaComp: string | null
  unidad: Unidad
  elegir?: (clave: string, etiqueta: string) => void
  elegido: string | null
}) {
  const def = tarjeta.definicion
  const fuente = def.fuente
  const nombreMedida = (m: string) => medidaDe(fuente, m)?.etiqueta ?? m

  // Número: el último período de la primera medida
  if (def.grafico === "numero") {
    const filas = resultados[0]?.filas ?? []
    const f = filas[filas.length - 1]
    if (!f) return <p className="text-sm text-muted-foreground">Sin datos en el período.</p>
    const filasC = comparados?.[0]?.filas ?? []
    const c = filasC[filasC.length - 1]
    return (
      <div>
        <p className="text-3xl font-bold tabular-nums">{formato(f.valor, unidad)}</p>
        {comparados && <Variacion actual={f.valor} anterior={c?.valor ?? null} unidad={unidad} etiqueta={etiquetaComp ?? ""}
          mejorSiBaja={MEJOR_SI_BAJA.includes(def.medidas[0])} sinColor={SIN_COLOR.includes(def.medidas[0])} />}
        {unidad === "%" && f.denominador !== null && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {f.numerador?.toLocaleString("es-UY")} de {f.denominador.toLocaleString("es-UY")}
          </p>
        )}
        {unidad === "cab" && <p className="text-xs text-muted-foreground">cabezas{f.periodo ? ` · ${rotuloPeriodo(f.periodo)}` : ""}</p>}
        {unidad === "kg/día" && f.numerador !== null && f.denominador !== null && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {f.numerador.toLocaleString("es-UY")} kg en {f.denominador.toLocaleString("es-UY")} cabeza-días
          </p>
        )}
        {unidad === "kg" && f.denominador !== null && (
          <p className="text-xs text-muted-foreground tabular-nums">{f.denominador.toLocaleString("es-UY")} cabezas pesadas</p>
        )}
        {unidad === "UG/ha" && f.numerador !== null && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {f.numerador.toLocaleString("es-UY", { maximumFractionDigits: 1 })} UG en {f.denominador !== null ? `${f.denominador.toLocaleString("es-UY", { maximumFractionDigits: 1 })} ha` : "potreros sin dibujar"}
          </p>
        )}
      </div>
    )
  }

  // Datos para los gráficos: un renglón por grupo (abierto, total) o por período, y una serie por medida (o por
  // grupo, si está abierto y en el tiempo). _clave: el id del grupo, para el filtrado cruzado.
  const porGrupo = def.abrir_por !== null && def.tiempo === "total"
  let series: { clave: string; nombre: string }[]
  let filasGrafico: FilaGrafico[]
  if (porGrupo) {
    series = resultados.map(x => ({ clave: x.medida, nombre: nombreMedida(x.medida) }))
    const grupos = [...new Map(resultados[0].filas.map(f => [f.clave ?? "", f.etiqueta ?? "—"])).entries()]
    filasGrafico = grupos.map(([c, nombre]) => ({
      x: nombre, _clave: c,
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

  // Comparación con el año anterior: una serie más por medida (no en las abiertas en el tiempo ni en la torta)
  const conComparacion = !!comparados && def.grafico !== "torta" && !(def.abrir_por !== null && !porGrupo)
  const seriesComp = conComparacion
    ? series.map((s, i) => ({ clave: `${s.clave}__comp`, nombre: `${s.nombre} (${etiquetaComp})`, base: i }))
    : []
  if (conComparacion) {
    for (const x of comparados!) {
      if (porGrupo) {
        for (const fila of filasGrafico) fila[`${x.medida}__comp`] = x.filas.find(f => (f.clave ?? "") === fila._clave)?.valor ?? null
      } else {
        // En el tiempo, por posición: el mes o ejercicio que corresponde, un año antes
        filasGrafico.forEach((fila, i) => { fila[`${x.medida}__comp`] = x.filas[i]?.valor ?? null })
      }
    }
  }

  const clickeable = porGrupo && !!elegir
  const tocar = (i: number) => {
    const f = filasGrafico[i]
    if (clickeable && f) elegir!(String(f._clave), String(f.x))
  }
  // Lo elegido en esta tarjeta se resalta: el resto queda tenue
  const opacidad = (f: FilaGrafico) => (elegido && String(f._clave) !== elegido ? 0.3 : 1)

  const fmt = (v: unknown) => formato(typeof v === "number" ? v : Number(v), unidad)
  const tooltip = <Tooltip formatter={(v, nombre) => [fmt(v), nombre]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
  const leyenda = series.length + seriesComp.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null

  if (def.grafico === "tabla") {
    const conTotal = porGrupo && resultados.some(x => x.total !== undefined)
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium"></th>
              {[...series, ...seriesComp].map(s => <th key={s.clave} className="py-1.5 pl-2 text-right font-medium">{s.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {filasGrafico.map((f, i) => (
              <tr key={String(f.x)} className="border-b last:border-0" style={{ opacity: opacidad(f) }}>
                <td className="py-1.5 pr-2">
                  {clickeable
                    ? <button type="button" onClick={() => tocar(i)} className="text-left font-medium text-primary hover:underline">{f.x}</button>
                    : f.x}
                </td>
                {[...series, ...seriesComp].map(s => <td key={s.clave} className="py-1.5 pl-2 text-right tabular-nums">{fmt(f[s.clave])}</td>)}
              </tr>
            ))}
            {conTotal && (
              <tr className="border-t-2 font-semibold">
                <td className="py-1.5 pr-2">Total</td>
                {series.map(s => <td key={s.clave} className="py-1.5 pl-2 text-right tabular-nums">{fmt(resultados.find(x => x.medida === s.clave)?.total ?? null)}</td>)}
                {seriesComp.map(s => <td key={s.clave} className="py-1.5 pl-2 text-right tabular-nums">{fmt(comparados?.[s.base]?.total ?? null)}</td>)}
              </tr>
            )}
          </tbody>
        </table>
        {conTotal && <p className="mt-1 text-[11px] text-muted-foreground">El total lo calcula la base: no siempre es la suma de las filas.</p>}
      </div>
    )
  }

  if (def.grafico === "torta") {
    const s = series[0]
    const datos = filasGrafico
      .map((f, i) => ({ nombre: String(f.x), valor: Number(f[s.clave] ?? 0), i, f }))
      .filter(d => d.valor > 0)
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie isAnimationActive={animar} data={datos} dataKey="valor" nameKey="nombre" innerRadius="45%" outerRadius="80%" paddingAngle={1}
            onClick={(_, j) => tocar(datos[j].i)} style={{ cursor: clickeable ? "pointer" : undefined }}>
            {datos.map((d, j) => <Cell key={d.nombre} fill={COLORES[j % COLORES.length]} fillOpacity={opacidad(d.f)} />)}
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
            <Line key={s.clave} isAnimationActive={animar} type="monotone" dataKey={s.clave} name={s.nombre} stroke={COLORES[i % COLORES.length]} strokeWidth={2} dot={false} connectNulls />
          ))}
          {seriesComp.map(s => (
            <Line key={s.clave} isAnimationActive={animar} type="monotone" dataKey={s.clave} name={s.nombre} stroke={COLORES[s.base % COLORES.length]} strokeWidth={2}
              strokeDasharray="5 4" strokeOpacity={0.6} dot={false} connectNulls />
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
          <Bar key={s.clave} isAnimationActive={animar} dataKey={s.clave} name={s.nombre} fill={COLORES[i % COLORES.length]} radius={2}
            onClick={(_, j) => tocar(j)} style={{ cursor: clickeable ? "pointer" : undefined }}>
            {filasGrafico.map((f, j) => (
              <Cell key={j} fillOpacity={opacidad(f)}
                // Una sola serie: las bajas (negativas) en rojo
                fill={unaSerie && Number(f[s.clave] ?? 0) < 0 ? COLOR_NEGATIVO : COLORES[i % COLORES.length]} />
            ))}
          </Bar>
        ))}
        {seriesComp.map(s => (
          <Bar key={s.clave} isAnimationActive={animar} dataKey={s.clave} name={s.nombre} fill={COLORES[s.base % COLORES.length]} fillOpacity={0.35} radius={2} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// La flecha de la comparación: ▲ / ▼ con la diferencia (en puntos si es un %, si no en %) y el valor anterior. Verde si
// mejora (sube, o baja en las medidas donde bajar es bueno), rojo si empeora.
function Variacion({ actual, anterior, unidad, etiqueta, mejorSiBaja, sinColor = false }: {
  actual: number | null
  anterior: number | null
  unidad: Unidad
  etiqueta: string
  mejorSiBaja: boolean
  sinColor?: boolean
}) {
  if (actual === null || anterior === null) {
    return <p className="text-xs text-muted-foreground">Sin datos de {etiqueta} para comparar</p>
  }
  const dif = actual - anterior
  const texto = unidad === "%"
    ? `${Math.abs(dif).toLocaleString("es-UY", { maximumFractionDigits: 1 })} pts`
    : anterior !== 0 ? `${Math.abs((dif / Math.abs(anterior)) * 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })} %` : formato(Math.abs(dif), unidad)
  const mejora = dif === 0 || sinColor ? null : (dif > 0) !== mejorSiBaja
  return (
    <p className="text-xs">
      <span className={cn("font-semibold", mejora === null ? "text-muted-foreground" : mejora ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
        {dif === 0 ? "= igual" : `${dif > 0 ? "▲" : "▼"} ${texto}`}
      </span>
      <span className="text-muted-foreground"> vs {etiqueta} ({formato(anterior, unidad)})</span>
    </p>
  )
}
