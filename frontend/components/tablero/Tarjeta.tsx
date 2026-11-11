"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, GripVertical, Pencil, X } from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis,
  YAxis,
} from "recharts"

import { getDatosTablero } from "@/lib/queries/tablero"
import { mensajeDeError } from "@/lib/supabase/errores"
import {
  ETIQUETA_DIMENSION, GRAFICOS_PENDIENTES, MIN_DIAS_POR_DEFECTO, PENDIENTES, comparacionDe, filtranEn, medidaDe, nombreOperando, propiaDe, rasgosDe, type Unidad,
} from "@/components/tablero/catalogo"
import { formato } from "@/components/tablero/formato"
import { MapaTarjeta } from "@/components/tablero/MapaTarjeta"
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
  const existe = !!medidaDe(def.fuente, def.medidas[0])
  const pendiente = GRAFICOS_PENDIENTES[def.grafico] ?? (existe || def.fuente === "combinada" ? null : PENDIENTES[def.medidas[0]] ?? "más adelante")
  const borrada = def.fuente === "combinada" && !existe

  const [datos, setDatos] = useState<{ clave: string; resultados: Resultado[]; comparados: Resultado[] | null } | null>(() => {
    const c = impresion ? calculado(clave) : null
    return c ? { clave, resultados: c.resultados, comparados: c.comparados } : null
  })
  const [error, setError] = useState<{ clave: string; texto: string } | null>(null)

  useEffect(() => {
    if (datos?.clave === clave || pendiente || borrada) return
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
      const acumular = def.tiempo !== "total" && !!def.acumuladas?.includes(medida)
      return { medida, filas: acumular ? acumulado(filas) : filas, ...(sumaTotal ? { total: total?.[0]?.valor ?? null } : {}) }
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
  const filasListas = listos?.flatMap(x => x.filas) ?? []
  const avisos = def.fuente === "combinada" ? avisosCombinada(filasListas) : filasListas.find(f => f.avisos)?.avisos ?? null
  const propia = def.fuente === "combinada" ? propiaDe(def.medidas[0]) : undefined
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
        {pendiente ? (
          <p className="flex h-full min-h-12 items-center justify-center rounded-md border border-dashed px-3 text-center text-sm text-muted-foreground">
            Disponible {pendiente}
          </p>
        ) : borrada ? (
          <p role="alert" className="text-sm text-destructive">La medida propia de esta tarjeta ya no existe: editala o sacala.</p>
        ) : fallo ? (
          <p role="alert" className="text-sm text-destructive">{fallo}</p>
        ) : !listos ? (
          <div className="h-full min-h-12 rounded-md bg-muted/40 animate-pulse" aria-label="Calculando" />
        ) : (
          <Contenido tarjeta={tarjeta} estId={estId} resultados={listos} comparados={comparados} etiquetaComp={comparar} unidad={unidad} animar={!impresion}
            elegir={elegir} elegido={elegido} />
        )}
      </div>

      {elegir && listos && !elegido && def.grafico !== "numero" && (
        <p className="text-[11px] text-muted-foreground">Tocá una {def.grafico === "tabla" ? "fila" : def.grafico === "torta" ? "porción" : "barra"} para filtrar el resto del tablero.</p>
      )}
      {avisos && <Avisos avisos={avisos} minDias={def.opciones?.min_dias ?? MIN_DIAS_POR_DEFECTO}
        operandos={propia ? { a: nombreOperando(propia.definicion.a), b: nombreOperando(propia.definicion.b) } : undefined} />}
    </section>
  )
}

const MOTIVO_DESCARTE: Record<string, string> = {
  venta: "venta", compra: "compra", union: "unión", division: "división", destete: "destete", paricion: "parición",
  ajuste: "ajuste de stock", recategorizacion: "recategorización", paricion_madres: "parición de las madres pesadas",
  esquila: "esquila", consumo: "consumo",
}

// Acumulado en el período: cada fila suma las anteriores del mismo grupo (las filas vienen en orden de período). Se
// transforma lo que devolvió la base, así el Excel exporta lo mismo que se ve.
function acumulado(filas: FilaTablero[]): FilaTablero[] {
  const suma = new Map<string, number>()
  return filas.map(f => {
    const k = f.clave ?? ""
    const previo = suma.get(k)
    // Un período sin dato repite lo acumulado hasta ahí (sin dato si todavía no hubo ninguno)
    if (f.valor === null) return { ...f, valor: previo ?? null, numerador: null, denominador: null }
    const v = (previo ?? 0) + f.valor
    suma.set(k, v)
    return { ...f, valor: v, numerador: null, denominador: null }
  })
}

// Medida propia: los avisos de A y de B (los de cada fuente), y cuántas filas quedaron sin valor por A o por B
function avisosCombinada(filas: FilaTablero[]): Record<string, unknown> | null {
  const con = filas.filter(f => f.avisos)
  if (con.length === 0) return null
  return {
    ...Object.assign({}, ...con.map(f => f.avisos)),
    a_sin_datos: filas.filter(f => f.avisos?.a_sin_datos).length,
    b_sin_datos: filas.filter(f => f.avisos?.b_sin_datos).length,
    b_total: con.some(f => f.avisos?.b_total),
    filas: filas.length,
  }
}

function Avisos({ avisos, minDias, operandos }: { avisos: Record<string, unknown>; minDias: number; operandos?: { a: string; b: string } }) {
  const textos: string[] = []
  if (operandos) {
    const filas = Number(avisos.filas ?? 1)
    const cuantas = (n: number) => (filas > 1 ? ` en ${n} de ${filas} filas` : "")
    const sinA = Number(avisos.a_sin_datos ?? 0)
    const sinB = Number(avisos.b_sin_datos ?? 0)
    if (sinA > 0) textos.push(`${operandos.a}: sin datos${cuantas(sinA)}, queda sin valor`)
    if (sinB > 0) textos.push(`${operandos.b}: sin datos o en cero${cuantas(sinB)}, queda sin valor`)
    if (avisos.b_total) textos.push(`${operandos.b}: total del establecimiento, la misma para todos los grupos`)
  }
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
  if (avisos.usd_ventas_sin_kg) textos.push(`${usd(avisos.usd_ventas_sin_kg)} de ventas sin kg: no entran en el precio por kg`)
  if (avisos.superficie_actual) textos.push("Superficies de hoy: los potreros no guardan su historial")
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

function Contenido({ tarjeta, estId, resultados, comparados, etiquetaComp, unidad, animar, elegir, elegido }: {
  tarjeta: TarjetaTablero
  estId: string
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
  const nombreMedida = (m: string) =>
    `${medidaDe(fuente, m)?.etiqueta ?? m}${def.tiempo !== "total" && def.acumuladas?.includes(m) ? " acumulado" : ""}`

  // Número: el último período de la primera medida
  if (def.grafico === "numero") {
    const filas = resultados[0]?.filas ?? []
    const f = filas[filas.length - 1]
    if (!f) return <p className="text-sm text-muted-foreground">Sin datos en el período.</p>
    const filasC = comparados?.[0]?.filas ?? []
    const c = filasC[filasC.length - 1]
    const meta = def.meta
    const cumple = meta && f.valor !== null ? (meta.mejor === "baja" ? f.valor <= meta.valor : f.valor >= meta.valor) : null
    return (
      <div>
        <p className={cn("text-3xl font-bold tabular-nums", cumple === true && "text-emerald-700 dark:text-emerald-400",
          cumple === false && "text-amber-700 dark:text-amber-400")}>{formato(f.valor, unidad)}</p>
        {meta && (
          <p className={cn("text-xs font-medium", cumple === true ? "text-emerald-700 dark:text-emerald-400" : cumple === false ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            Meta {formato(meta.valor, unidad)}{cumple === true ? " · cumple" : cumple === false ? (meta.mejor === "baja" ? " · se pasa" : " · no llega") : ""}
          </p>
        )}
        {comparados && <Variacion actual={f.valor} anterior={c?.valor ?? null} unidad={unidad} etiqueta={etiquetaComp ?? ""}
          mejorSiBaja={comparacionDe(fuente, def.medidas[0]) === "baja"} sinColor={comparacionDe(fuente, def.medidas[0]) === null} />}
        {fuente === "combinada" && f.numerador !== null && f.denominador !== null && <DetalleDivision medida={def.medidas[0]} a={f.numerador} b={f.denominador} />}
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

  // Mapa (etapa 8b): los potreros coloreados por el valor de la primera medida, abierta por potrero
  if (def.grafico === "mapa") {
    return <MapaTarjeta estId={estId} filas={resultados[0]?.filas ?? []} unidad={unidad} meta={def.meta} />
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

  // Meta: línea punteada horizontal (en las barras acostadas, vertical). Agranda el eje si queda afuera.
  const lineaMeta = (eje: "x" | "y") => def.meta ? (
    <ReferenceLine {...{ [eje]: def.meta.valor }} ifOverflow="extendDomain" stroke="var(--foreground)" strokeOpacity={0.6} strokeDasharray="6 4"
      label={{ value: `Meta ${formato(def.meta.valor, unidad)}`, position: eje === "y" ? "insideTopRight" : "insideTopLeft", fontSize: 11, fill: "var(--muted-foreground)" }} />
  ) : null

  // Comparación con el año anterior: una serie más por medida (no en las abiertas en el tiempo ni en la torta)
  // (tampoco en las apiladas ni en barras con línea: la serie de más se confunde con las otras)
  const conComparacion = !!comparados && !["torta", "barras_apiladas", "barras_linea"].includes(def.grafico) && !(def.abrir_por !== null && !porGrupo)
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
          {lineaMeta("y")}
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

  // Barras y línea: las primeras medidas en barras y la última como línea (ej. ingresos y gastos, y el resultado acumulado)
  if (def.grafico === "barras_linea") {
    const barras = series.slice(0, -1)
    const linea = series[series.length - 1]
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={filasGrafico} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          {tooltip}
          {leyenda}
          {lineaMeta("y")}
          {barras.map((s, i) => (
            <Bar key={s.clave} isAnimationActive={animar} dataKey={s.clave} name={s.nombre} fill={COLORES[i % COLORES.length]} radius={2} />
          ))}
          <Line isAnimationActive={animar} type="monotone" dataKey={linea.clave} name={linea.nombre} stroke={COLORES[barras.length % COLORES.length]}
            strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  const horizontal = def.grafico === "barras_horizontales"
  const apiladas = def.grafico === "barras_apiladas"
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
        {lineaMeta(horizontal ? "x" : "y")}
        {series.map((s, i) => (
          <Bar key={s.clave} isAnimationActive={animar} dataKey={s.clave} name={s.nombre} fill={COLORES[i % COLORES.length]} radius={apiladas ? 0 : 2}
            stackId={apiladas ? "pila" : undefined} onClick={(_, j) => tocar(j)} style={{ cursor: clickeable ? "pointer" : undefined }}>
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

// Medida propia que divide: "USD 8.000 ÷ 213,1 UG", con la unidad de A y de B
function DetalleDivision({ medida, a, b }: { medida: string; a: number; b: number }) {
  const p = propiaDe(medida)
  if (!p) return null
  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      {formato(a, rasgosDe(p.definicion.a)?.unidad ?? "")} ÷ {formato(b, rasgosDe(p.definicion.b)?.unidad ?? "")}
    </p>
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
