import type { LucideIcon } from "lucide-react"
import {
  ArrowRight, ArrowRightLeft, Baby, Banknote, CirclePlus, HeartCrack, MapPin, Merge, MilkOff, ShoppingCart,
  SlidersHorizontal, Split,
} from "lucide-react"

import { ETIQUETA_EVENTO, fechaCorta } from "@/components/lotes/formato"
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
  nombrePotrero: (id: string) => string
  nombreCategoria: (id: string) => string
}

// Historial: eventos de stock y cambios de potrero intercalados por fecha (lo más nuevo arriba;
// el mismo día, los movimientos de potrero arriba de los eventos)
export function HistorialLote({ eventos, estadias, nombrePotrero, nombreCategoria }: Props) {
  const filas: Fila[] = [
    ...eventos.map((evento, i) => ({ clase: "evento" as const, fecha: evento.fecha, orden: 2 + i / 1e6, evento })),
    ...movimientosDePotrero(estadias, nombrePotrero),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.orden - b.orden)

  if (filas.length === 0) return <p className="text-sm text-muted-foreground">Sin movimientos.</p>

  return (
    <ol className="rounded-lg border bg-card px-4 py-2">
      {filas.map((fila, i) => {
        const ultima = i === filas.length - 1
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
