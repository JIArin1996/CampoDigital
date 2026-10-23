import type { PrecioCarga } from "@/types/actividades"

// ── Período ──
// Ejercicio: de julio a junio (el año productivo, como la temporada); año calendario: enero a diciembre.

export type TipoPeriodo = "ejercicio" | "anio"

export interface Periodo {
  tipo: TipoPeriodo
  anio: number          // ejercicio: el año en que empieza (2025 = jul 2025 a jun 2026)
}

export const periodoActual = (hoy = new Date()): Periodo => ({
  tipo: "ejercicio",
  anio: hoy.getMonth() >= 6 ? hoy.getFullYear() : hoy.getFullYear() - 1,
})

export const rangoPeriodo = (p: Periodo) =>
  p.tipo === "ejercicio"
    ? { desde: `${p.anio}-07-01`, hasta: `${p.anio + 1}-06-30` }
    : { desde: `${p.anio}-01-01`, hasta: `${p.anio}-12-31` }

export const etiquetaPeriodo = (p: Periodo) =>
  p.tipo === "ejercicio" ? `Ejercicio ${p.anio}/${String(p.anio + 1).slice(2)}` : `Año ${p.anio}`

// ── Montos ──

// "USD 1.234,50" (negativos con signo)
export const usd = (n: number) =>
  `USD ${n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Monto en su moneda original: "UYU 600.000,00 (a 40)" o "USD 15.000,00"
export const montoOriginal = (monto: number, moneda: string, tipoCambio: number | null) =>
  `${moneda} ${monto.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  + (moneda === "UYU" && tipoCambio ? ` (a ${tipoCambio.toLocaleString("es-UY")})` : "")

// ── Precio (lo que se carga en los formularios) ──

export interface PrecioForm {
  monto: string
  moneda: "USD" | "UYU"
  tipoCambio: string
  estado: "pagado" | "pendiente"
  fechaPago: string
}

export const precioVacio = (): PrecioForm => ({ monto: "", moneda: "USD", tipoCambio: "", estado: "pendiente", fechaPago: "" })

const numero = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")))

// Valida lo mismo que la base (que lo valida igual); devuelve el precio o el mensaje
export function leerPrecio(v: PrecioForm): { precio: PrecioCarga } | { error: string } {
  const monto = numero(v.monto)
  if (monto === null || Number.isNaN(monto) || Math.round(monto * 100) <= 0) return { error: "El monto tiene que ser mayor a cero" }
  const precio: PrecioCarga = { monto, moneda: v.moneda, estado: v.estado }
  if (v.moneda === "UYU") {
    const tc = numero(v.tipoCambio)
    if (tc === null || Number.isNaN(tc) || tc <= 0) return { error: "Con pesos hay que cargar el tipo de cambio" }
    precio.tipo_cambio = tc
  }
  if (v.estado === "pagado" && v.fechaPago) precio.fecha_pago = v.fechaPago
  return { precio }
}
