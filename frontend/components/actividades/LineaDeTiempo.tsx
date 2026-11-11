"use client"

import { useId, useState, type CSSProperties } from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown, ChevronRight, MapPin } from "lucide-react"

import { ACTIVIDAD, coloresActividad } from "@/components/actividades/actividad-iconos"
import { ETIQUETA_MODALIDAD, kg, porcentaje, usd } from "@/components/actividades/formato"
import type { MovimientoPotrero } from "@/components/potreros/movimientos"
import { textoResponsables } from "@/components/shared/Responsables"
import { cn } from "@/lib/utils"
import type { ActividadResumen } from "@/types/actividades"

/**
 * Listado de actividades como línea de tiempo compacta: agrupado por mes (lo más nuevo arriba), una
 * fila de 52 px por actividad con la fecha, el ícono del tipo sobre la línea, tipo y lotes, y el dato
 * clave a la derecha. Al tocar la fila se abre el detalle, con el enlace a la ficha. Los cambios de
 * potrero de los lotes van intercalados (no son actividades; el mismo día, arriba de las actividades).
 */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

function partesFecha(iso: string) {
  const [a, m, d] = iso.split("-").map(Number)
  return { anio: a, mes: m, dia: d, diaSemana: DIAS[new Date(a, m - 1, d).getDay()] }
}

const numero = (n: number) => n.toLocaleString("es-UY")

// El dato que más importa de cada tipo (va a la derecha de la fila) y su explicación.
// También lo usa el historial del lote.
export function destacado(a: ActividadResumen): { valor: string; etiqueta: string; negativo?: boolean } | null {
  const cab = a.cabezas ?? null
  switch (a.tipo) {
    case "pesada":
      return a.peso_promedio_kg ? { valor: kg(a.peso_promedio_kg), etiqueta: "promedio" } : null
    case "sanidad":
    case "antiparasitario":
      return a.producto ? { valor: a.producto, etiqueta: a.productos && a.productos > 1 ? `y ${a.productos - 1} producto${a.productos > 2 ? "s" : ""} más` : "" } : null
    case "servicio":
      return a.vacas_entoradas ? { valor: numero(a.vacas_entoradas), etiqueta: "entoradas" } : null
    case "diagnostico_gestacion":
      return a.vacas_diagnosticadas
        ? { valor: porcentaje(((a.vacas_prenadas ?? 0) / a.vacas_diagnosticadas) * 100), etiqueta: "preñez" }
        : null
    case "paricion":
      return cab ? { valor: numero(cab), etiqueta: cab === 1 ? "cría" : "crías" } : null
    case "destete":
      return cab ? { valor: numero(cab), etiqueta: "destetados" } : null
    case "esquila":
      return a.kg_lana_total ? { valor: kg(a.kg_lana_total), etiqueta: "de lana" } : null
    case "compra":
    case "venta":
      return a.monto_usd ? { valor: usd(a.monto_usd), etiqueta: cab ? `por ${numero(cab)} cab.` : "" }
        : cab ? { valor: `${numero(cab)} cab.`, etiqueta: "sin precio" } : null
    case "mortandad":
      return cab ? { valor: `−${numero(cab)} cab.`, etiqueta: a.causa ?? "", negativo: true } : null
    case "consumo":
      return cab ? { valor: `−${numero(cab)} cab.`, etiqueta: a.peso_vivo_total_kg ? kg(a.peso_vivo_total_kg) : "", negativo: true } : null
    case "personalizada": {
      const c = a.campos?.[0]
      return c ? { valor: c.valor, etiqueta: c.campo } : null
    }
  }
}

// El resto de los datos, para el detalle
function resumen(a: ActividadResumen): string[] {
  const partes: (string | null | false)[] = []
  if (a.peso_vivo_total_kg && a.tipo === "pesada") partes.push(`${kg(a.peso_vivo_total_kg)} en total`)
  if (a.modalidad) partes.push(ETIQUETA_MODALIDAD[a.modalidad])
  if (a.contraparte) partes.push(a.contraparte)
  if (a.tipo === "venta" && a.rendimiento_pct) partes.push(`rinde ${porcentaje(a.rendimiento_pct)}`)
  if (a.tipo === "venta" && a.kg_gancho) partes.push(`${kg(a.kg_gancho)} al gancho`)
  if (a.tipo === "paricion" && a.nacidos_muertos) partes.push(`${a.nacidos_muertos} nacidos muertos`)
  if (a.tipo === "servicio" && a.toros) partes.push(`${a.toros} toros`)
  if (a.tipo === "diagnostico_gestacion" && a.vacas_diagnosticadas) {
    partes.push(`${a.vacas_prenadas ?? 0} preñadas de ${a.vacas_diagnosticadas}${a.vacas_vacias ? ` · ${a.vacas_vacias} vacías` : ""}`)
  }
  if (a.tipo === "esquila" && a.kg_lana_cabeza_aprox) partes.push(`≈ ${kg(a.kg_lana_cabeza_aprox)} por cabeza`)
  if (a.tipo === "personalizada" && a.campos && a.campos.length > 1) partes.push(a.campos.slice(1).map(c => `${c.campo}: ${c.valor}`).join(", "))
  return partes.filter((p): p is string => !!p)
}

interface Props {
  actividades: ActividadResumen[]       // de la más nueva a la más vieja
  movimientos?: MovimientoPotrero[]     // cambios de potrero, en cualquier orden
  nombresLote: Map<string, string>
  nombrePersona: (id: string) => string | undefined
}

type Item =
  | { clase: "actividad"; fecha: string; actividad: ActividadResumen }
  | { clase: "potrero"; fecha: string; movimiento: MovimientoPotrero }

const cantidad = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function LineaDeTiempo({ actividades, movimientos = [], nombresLote, nombrePersona }: Props) {
  // De la más nueva a la más vieja; el mismo día, los cambios de potrero arriba (las actividades
  // mantienen el orden en que vienen)
  const items: Item[] = [
    ...[...movimientos]
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.orden - b.orden)
      .map(movimiento => ({ clase: "potrero" as const, fecha: movimiento.fecha, movimiento })),
    ...actividades.map(actividad => ({ clase: "actividad" as const, fecha: actividad.fecha, actividad })),
  ]
  const posicion = new Map(items.map((it, i) => [it, i]))
  items.sort((a, b) => b.fecha.localeCompare(a.fecha) || posicion.get(a)! - posicion.get(b)!)

  // Por mes
  const meses: { clave: string; titulo: string; items: Item[] }[] = []
  for (const it of items) {
    const { anio, mes } = partesFecha(it.fecha)
    const clave = `${anio}-${mes}`
    let grupo = meses.find(g => g.clave === clave)
    if (!grupo) meses.push(grupo = { clave, titulo: `${MESES[mes - 1][0].toUpperCase()}${MESES[mes - 1].slice(1)} ${anio}`, items: [] })
    grupo.items.push(it)
  }
  const resumenMes = (lista: Item[]) => {
    const potreros = lista.filter(it => it.clase === "potrero").length
    const acts = lista.length - potreros
    return [
      acts ? cantidad(acts, "actividad", "actividades") : null,
      potreros ? cantidad(potreros, "cambio de potrero", "cambios de potrero") : null,
    ].filter(Boolean).join(" · ")
  }

  return (
    <div className="space-y-6">
      {meses.map(g => (
        <section key={g.clave} aria-labelledby={`mes-${g.clave}`}>
          {/* El mes queda fijo arriba al hacer scroll (debajo del encabezado del celular) */}
          <h2 id={`mes-${g.clave}`}
            className="sticky top-14 md:top-0 z-10 -mx-1 mb-1 flex items-baseline justify-between gap-2 border-b bg-background px-1 py-2 text-sm font-bold uppercase tracking-wide">
            {g.titulo}
            <span className="text-xs font-medium normal-case tracking-normal text-muted-foreground">
              {resumenMes(g.items)}
            </span>
          </h2>
          <ol>
            {g.items.map((it, i) => it.clase === "actividad" ? (
              <Fila key={it.actividad.id} actividad={it.actividad} primera={i === 0} ultima={i === g.items.length - 1}
                nombresLote={nombresLote} nombrePersona={nombrePersona} />
            ) : (
              <FilaPotrero key={it.movimiento.id} movimiento={it.movimiento} primera={i === 0} ultima={i === g.items.length - 1}
                nombresLote={nombresLote} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function Fila({ actividad: a, primera, ultima, nombresLote, nombrePersona }: {
  actividad: ActividadResumen
  primera: boolean
  ultima: boolean
  nombresLote: Map<string, string>
  nombrePersona: (id: string) => string | undefined
}) {
  const [abierta, setAbierta] = useState(false)
  const idDetalle = useId()
  const apariencia = ACTIVIDAD[a.tipo]
  const Icono = apariencia.icono
  const { dia, mes, diaSemana } = partesFecha(a.fecha)

  const titulo = a.tipo === "personalizada" && a.personalizada ? a.personalizada : apariencia.etiqueta
  const tituloCorto = a.tipo === "personalizada" && a.personalizada ? a.personalizada : apariencia.etiquetaCorta
  // Lote principal; en las de varios lotes (lote_id vacío), todos los de la actividad
  const lotes = a.lote_id
    ? nombresLote.get(a.lote_id) ?? "Lote"
    : (a.lotes ?? []).map(id => nombresLote.get(id)).filter(Boolean).join(", ") || null
  const cria = a.tipo === "paricion" && a.lote_cria_id ? nombresLote.get(a.lote_cria_id) : null
  const responsables = (a.responsables ?? []).length > 0 ? textoResponsables(a.responsables ?? [], nombrePersona) : null
  const dato = destacado(a)
  // Las cabezas van en la segunda línea, salvo cuando ya son el dato destacado
  const cabezasEnLinea = a.cabezas && !["paricion", "destete", "mortandad", "consumo"].includes(a.tipo) && !(dato?.valor.endsWith("cab."))
  const linea2 = [
    cabezasEnLinea ? `${numero(a.cabezas!)} cab.` : null,
    responsables,
  ].filter(Boolean).join(" · ")
  const mas = resumen(a)

  return (
    <li style={coloresActividad(a.tipo)} className="relative">
      {/* Línea de tiempo: atraviesa la fila entera (también el detalle abierto), centrada en el círculo */}
      <span aria-hidden
        className={cn("absolute left-[64px] md:left-[76px] w-0.5 bg-border", primera ? "top-[26px]" : "top-0", ultima ? "h-[26px]" : "bottom-0",
          primera && ultima && "hidden")} />

      <button type="button" aria-expanded={abierta} aria-controls={idDetalle} onClick={() => setAbierta(v => !v)}
        className="relative grid w-full min-h-[52px] grid-cols-[40px_30px_minmax(0,1fr)_auto_20px] md:grid-cols-[52px_30px_minmax(0,1fr)_auto_20px] items-center gap-x-2.5 py-1 text-left rounded-md active:bg-muted/60">
        <span className="text-right leading-tight">
          <span className="block text-[17px] font-bold tabular-nums">{dia}</span>
          <span className="block text-xs text-muted-foreground">{MESES[mes - 1].slice(0, 3)}</span>
        </span>
        <span className="flex justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--f)] text-[var(--c)] ring-[3px] ring-background">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            <span className="text-[var(--c)]">{tituloCorto}</span>
            {lotes && <span> · {lotes}</span>}
          </span>
          {linea2 && <span className="block truncate text-[13px] text-muted-foreground">{linea2}</span>}
        </span>
        <span className={cn("max-w-[7.5rem] md:max-w-[12rem] truncate text-right font-bold tabular-nums",
          dato?.negativo && "text-destructive")}>
          {dato?.valor}
        </span>
        <ChevronDown aria-hidden className={cn("h-5 w-5 text-muted-foreground transition-transform motion-reduce:transition-none", abierta && "rotate-180")} />
      </button>

      {abierta && (
        <div id={idDetalle} className="relative mb-2 ml-[80px] md:ml-[92px] rounded-lg border bg-card px-3 py-2.5 text-sm">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Fecha</dt>
            <dd>{diaSemana} {dia} de {MESES[mes - 1]}</dd>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd>{titulo}</dd>
            {(lotes || cria) && <>
              <dt className="text-muted-foreground">{a.lote_id || (a.lotes ?? []).length <= 1 ? "Lote" : "Lotes"}</dt>
              <dd>{[lotes, cria ? `crías a ${cria}` : null].filter(Boolean).join(" · ")}</dd>
            </>}
            {a.cabezas ? <>
              <dt className="text-muted-foreground">Cabezas</dt>
              <dd className={cn("tabular-nums", (a.tipo === "mortandad" || a.tipo === "consumo") && "text-destructive")}>{a.tipo === "mortandad" || a.tipo === "consumo" ? "−" : ""}{numero(a.cabezas)}</dd>
            </> : null}
            {dato && <>
              <dt className="text-muted-foreground">Dato</dt>
              <dd><b className="tabular-nums">{dato.valor}</b>{dato.etiqueta && ` ${dato.etiqueta}`}</dd>
            </>}
            {mas.length > 0 && <>
              <dt className="text-muted-foreground">Más</dt>
              <dd>{mas.join(" · ")}</dd>
            </>}
            {responsables && <>
              <dt className="text-muted-foreground">{(a.responsables ?? []).length === 1 ? "Responsable" : "Responsables"}</dt>
              <dd>{textoResponsables(a.responsables ?? [], nombrePersona, Infinity)}</dd>
            </>}
          </dl>
          <Link href={`/actividades/${a.id}`} className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline">
            Ver detalle <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
    </li>
  )
}

// Un cambio de potrero: fecha, ícono de potrero sobre la línea, lote y "A → B". Al tocarla se abre el
// detalle, con el enlace a la ficha del lote.
function FilaPotrero({ movimiento: m, primera, ultima, nombresLote }: {
  movimiento: MovimientoPotrero
  primera: boolean
  ultima: boolean
  nombresLote: Map<string, string>
}) {
  const [abierta, setAbierta] = useState(false)
  const idDetalle = useId()
  const { dia, mes, diaSemana } = partesFecha(m.fecha)
  const lote = nombresLote.get(m.loteId) ?? "Lote"
  const recorrido = (
    <>
      {m.desde
        ? <>{m.desde}<ArrowRight className="mx-1 inline h-3.5 w-3.5 align-[-2px]" aria-label="a" /></>
        : "Entró a "}
      {m.hacia}
    </>
  )

  return (
    <li style={{ "--c": "var(--actividad-potrero)", "--f": "var(--actividad-potrero-fondo)" } as CSSProperties} className="relative">
      <span aria-hidden
        className={cn("absolute left-[64px] md:left-[76px] w-0.5 bg-border", primera ? "top-[26px]" : "top-0", ultima ? "h-[26px]" : "bottom-0",
          primera && ultima && "hidden")} />

      <button type="button" aria-expanded={abierta} aria-controls={idDetalle} onClick={() => setAbierta(v => !v)}
        className="relative grid w-full min-h-[52px] grid-cols-[40px_30px_minmax(0,1fr)_20px] md:grid-cols-[52px_30px_minmax(0,1fr)_20px] items-center gap-x-2.5 py-1 text-left rounded-md active:bg-muted/60">
        <span className="text-right leading-tight">
          <span className="block text-[17px] font-bold tabular-nums">{dia}</span>
          <span className="block text-xs text-muted-foreground">{MESES[mes - 1].slice(0, 3)}</span>
        </span>
        <span className="flex justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--f)] text-[var(--c)] ring-[3px] ring-background">
            <MapPin className="h-4 w-4" aria-hidden />
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            <span className="text-[var(--c)]">Cambio de potrero</span>
            <span> · {lote}</span>
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">{recorrido}</span>
        </span>
        <ChevronDown aria-hidden className={cn("h-5 w-5 text-muted-foreground transition-transform motion-reduce:transition-none", abierta && "rotate-180")} />
      </button>

      {abierta && (
        <div id={idDetalle} className="relative mb-2 ml-[80px] md:ml-[92px] rounded-lg border bg-card px-3 py-2.5 text-sm">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Fecha</dt>
            <dd>{diaSemana} {dia} de {MESES[mes - 1]}</dd>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd>Cambio de potrero</dd>
            <dt className="text-muted-foreground">Lote</dt>
            <dd>{lote}</dd>
            <dt className="text-muted-foreground">Potrero</dt>
            <dd>{recorrido}</dd>
            {m.notas.length > 0 && <>
              <dt className="text-muted-foreground">Motivo</dt>
              <dd>{m.notas.join(" · ")}</dd>
            </>}
          </dl>
          <Link href={`/lotes/${m.loteId}`} className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline">
            Ver lote <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
    </li>
  )
}

// Cargando: filas del mismo tamaño que las reales
export function LineaDeTiempoCargando() {
  return (
    <div aria-busy="true" aria-label="Cargando actividades" className="space-y-1">
      <div className="mb-3 h-5 w-36 rounded bg-muted animate-pulse" />
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="grid grid-cols-[40px_30px_minmax(0,1fr)_64px] md:grid-cols-[52px_30px_minmax(0,1fr)_96px] items-center gap-x-2.5 py-2">
          <div className="h-8 rounded bg-muted animate-pulse" />
          <div className="mx-auto h-7 w-7 rounded-full bg-muted animate-pulse" />
          <div className="h-9 rounded bg-muted animate-pulse" />
          <div className="h-5 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  )
}
