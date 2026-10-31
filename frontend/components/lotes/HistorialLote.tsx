import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import {
  ArrowRight, ArrowRightLeft, Baby, Banknote, ChevronRight, CirclePlus, HeartCrack, MapPin, Merge, MilkOff, ShoppingCart,
  SlidersHorizontal, Split,
} from "lucide-react"

import { ETIQUETA_EVENTO, fechaCorta } from "@/components/lotes/formato"
import { ACTIVIDAD, coloresActividad } from "@/components/actividades/actividad-iconos"
import { destacado } from "@/components/actividades/LineaDeTiempo"
import { cn } from "@/lib/utils"
import type { ActividadResumen } from "@/types/actividades"
import type { Estadia } from "@/types/database"
import type { LoteEvento, TipoEventoLote } from "@/types/lotes"

const ICONO_EVENTO: Record<TipoEventoLote, LucideIcon> = {
  alta_inicial: CirclePlus,
  paricion: Baby,
  compra: ShoppingCart,
  venta: Banknote,
  mortandad: HeartCrack,
  recategorizacion: ArrowRightLeft,
  division: Split,
  union: Merge,
  ajuste: SlidersHorizontal,
  destete: MilkOff,
}

// Tono de cada fila: suma (verde), resta (rojo), sin cambio de cabezas o movimiento de potrero
type Tono = "suma" | "resta" | "neutro" | "potrero"
const CIRCULO: Record<Tono, string> = {
  suma: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  resta: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  neutro: "bg-muted text-muted-foreground",
  potrero: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
}
const CIFRA: Record<"suma" | "resta", string> = {
  suma: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/60 dark:text-emerald-400",
  resta: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/60 dark:text-red-400",
}

type Fila =
  | { clase: "evento"; fecha: string; orden: number; evento: LoteEvento }
  | { clase: "potrero"; fecha: string; orden: number; id: string; desde: string | null; hacia: string | null; notas: string[] }
  // Una actividad del lote, con los eventos de stock que generó en este lote (uno por categoría; vacío si no mueve stock)
  | { clase: "actividad"; fecha: string; orden: number; actividad: ActividadResumen; eventos: LoteEvento[] }

// Junta la salida de un potrero con la entrada al siguiente cuando son el mismo día: "A → B"
function movimientosDePotrero(estadias: Estadia[], nombre: (id: string) => string): Fila[] {
  const filas: Fila[] = []
  const salidaUsada = new Set<string>()
  estadias.forEach((e, i) => {
    const previa = i > 0 ? estadias[i - 1] : null
    const enlazada = previa && previa.cerrada_por === "cambio" && previa.fecha_salida === e.fecha_ingreso ? previa : null
    if (enlazada) salidaUsada.add(enlazada.id)
    filas.push({
      clase: "potrero", fecha: e.fecha_ingreso, orden: 0, id: `${e.id}:i`,
      desde: enlazada ? nombre(enlazada.potrero_id) : null,
      hacia: nombre(e.potrero_id),
      notas: [...new Set([enlazada?.motivo_salida, e.motivo].filter((n): n is string => !!n))],
    })
  })
  for (const e of estadias) {
    if (!e.fecha_salida || salidaUsada.has(e.id)) continue
    filas.push({
      clase: "potrero", fecha: e.fecha_salida, orden: 1, id: `${e.id}:s`,
      desde: nombre(e.potrero_id),
      hacia: e.cerrada_por === "cierre" ? "cierre del lote" : "sin potrero",
      notas: e.motivo_salida ? [e.motivo_salida] : [],
    })
  }
  return filas
}

interface Props {
  eventos: LoteEvento[]
  estadias: Estadia[]               // de la más vieja a la más nueva
  actividades: ActividadResumen[]   // las vigentes de este lote
  nombrePotrero: (id: string) => string
  nombreCategoria: (id: string) => string
}

// Historial: actividades, eventos de stock y cambios de potrero intercalados por fecha (lo más nuevo
// arriba; el mismo día, los movimientos de potrero arriba). Los eventos que generó una actividad
// vigente van dentro de su fila; los de una anulada (y su inverso) quedan como eventos sueltos.
export function HistorialLote({ eventos, estadias, actividades, nombrePotrero, nombreCategoria }: Props) {
  const vigentes = new Set(actividades.map(a => a.id))
  const eventosDe = new Map<string, LoteEvento[]>()
  const sueltos: LoteEvento[] = []
  for (const ev of eventos) {
    if (ev.actividad_id && vigentes.has(ev.actividad_id)) eventosDe.set(ev.actividad_id, [...(eventosDe.get(ev.actividad_id) ?? []), ev])
    else sueltos.push(ev)
  }
  const filas: Fila[] = [
    ...actividades.map((actividad, i) => ({
      clase: "actividad" as const, fecha: actividad.fecha, orden: 2 + i / 1e6, actividad, eventos: eventosDe.get(actividad.id) ?? [],
    })),
    ...sueltos.map((evento, i) => ({ clase: "evento" as const, fecha: evento.fecha, orden: 3 + i / 1e6, evento })),
    ...movimientosDePotrero(estadias, nombrePotrero),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.orden - b.orden)

  if (filas.length === 0) return <p className="text-sm text-muted-foreground">Sin movimientos.</p>

  return (
    <ol className="rounded-lg border bg-card px-4 py-2">
      {filas.map((fila, i) => {
        const ultima = i === filas.length - 1
        if (fila.clase === "actividad") {
          return <FilaActividad key={fila.actividad.id} actividad={fila.actividad} eventos={fila.eventos} ultima={ultima}
            nombreCategoria={nombreCategoria} />
        }
        let tono: Tono, Icono: LucideIcon, contenido: React.ReactNode, cifra: React.ReactNode = null
        if (fila.clase === "potrero") {
          tono = "potrero"
          Icono = MapPin
          contenido = (
            <>
              <p className="text-sm font-medium flex flex-wrap items-center gap-x-1.5">
                {fila.desde
                  ? <><span className="text-muted-foreground">{fila.desde}</span><ArrowRight className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" /></>
                  : <span className="text-muted-foreground">Entró a</span>}
                <span>{fila.hacia}</span>
              </p>
              {fila.notas.length > 0 && <p className="text-sm text-muted-foreground mt-0.5">{fila.notas.join(" · ")}</p>}
            </>
          )
        } else {
          const ev = fila.evento
          tono = ev.cabezas > 0 ? "suma" : ev.cabezas < 0 ? "resta" : "neutro"
          Icono = ICONO_EVENTO[ev.tipo] ?? SlidersHorizontal
          contenido = (
            <>
              <p className="text-sm font-medium">
                {ETIQUETA_EVENTO[ev.tipo]} <span className="font-normal text-muted-foreground">· {nombreCategoria(ev.categoria_id)}</span>
              </p>
              {ev.nota && <p className="text-sm text-muted-foreground mt-0.5">{ev.nota}</p>}
            </>
          )
          if (tono !== "neutro") cifra = (
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ring-1 ring-inset ${CIFRA[tono]}`}>
              {ev.cabezas > 0 ? `+${ev.cabezas}` : `−${Math.abs(ev.cabezas)}`}
            </span>
          )
        }
        return (
          <li key={fila.clase === "potrero" ? fila.id : fila.evento.id} className="relative flex gap-3 py-2.5">
            {/* Línea de tiempo entre los íconos */}
            {!ultima && <span aria-hidden className="absolute left-4 top-11 -bottom-2.5 w-px -translate-x-1/2 bg-border" />}
            <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${CIRCULO[tono]}`}>
              <Icono className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">{contenido}</div>
                {cifra}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{fechaCorta(fila.fecha)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// Cifra de cabezas: verde si suma, rojo si resta
function Cifra({ cabezas }: { cabezas: number }) {
  if (cabezas === 0) return null
  const tono = cabezas > 0 ? "suma" : "resta"
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ring-1 ring-inset ${CIFRA[tono]}`}>
      {cabezas > 0 ? `+${cabezas}` : `−${Math.abs(cabezas)}`}
    </span>
  )
}

// Una actividad del lote: su ícono y color, el detalle por categoría (si movió stock en este lote) o
// el dato clave, y la suma de cabezas. Lleva a la ficha de la actividad.
function FilaActividad({ actividad: a, eventos, ultima, nombreCategoria }: {
  actividad: ActividadResumen
  eventos: LoteEvento[]
  ultima: boolean
  nombreCategoria: (id: string) => string
}) {
  const apariencia = ACTIVIDAD[a.tipo]
  const Icono = apariencia.icono
  const titulo = a.tipo === "personalizada" && a.personalizada ? a.personalizada : apariencia.etiqueta
  const total = eventos.reduce((suma, ev) => suma + ev.cabezas, 0)
  const dato = destacado(a)
  const porCategoria = eventos.map(ev => `${nombreCategoria(ev.categoria_id)} ${ev.cabezas > 0 ? "+" : "−"}${Math.abs(ev.cabezas)}`).join(" · ")
  // Sin stock en este lote: el dato clave ("186,4 kg promedio"); con stock: por categoría, y el monto si es compra o venta
  const detalle = eventos.length === 0
    ? (dato ? `${dato.valor}${dato.etiqueta ? ` ${dato.etiqueta}` : ""}` : null)
    : porCategoria + ((a.tipo === "venta" || a.tipo === "compra") && a.monto_usd && dato ? ` · ${dato.valor}` : "")

  return (
    <li style={coloresActividad(a.tipo)} className="relative">
      {!ultima && <span aria-hidden className="absolute left-4 top-11 -bottom-2.5 w-px -translate-x-1/2 bg-border" />}
      <Link href={`/actividades/${a.id}`} className="relative flex gap-3 py-2.5 rounded-md hover:bg-muted/50 active:bg-muted">
        <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--f)] text-[var(--c)]">
          <Icono className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--c)]">{titulo}</p>
              {detalle && <p className={cn("text-sm text-muted-foreground mt-0.5", dato?.negativo && eventos.length === 0 && "text-destructive")}>{detalle}</p>}
            </div>
            <span className="flex items-center gap-1">
              <Cifra cabezas={total} />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{fechaCorta(a.fecha)}</p>
        </div>
      </Link>
    </li>
  )
}
