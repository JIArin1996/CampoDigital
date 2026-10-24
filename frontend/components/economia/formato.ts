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

// Tipo de cambio del formulario: el texto del campo y, si vino del BCU sin tocarlo, la fecha real de
// la cotización (la base lo guarda como 'BCU' solo si esa cotización existe; si no, 'manual')
export interface TipoCambioForm {
  texto: string
  fechaBcu: string        // "" = cargado a mano
  guardada: boolean       // false: vino del BCU pero no se pudo guardar en tipos_cambio
}

export const tipoCambioVacio = (): TipoCambioForm => ({ texto: "", fechaBcu: "", guardada: true })

// 40.078 → "40,078" (sin separador de miles, hasta 4 decimales)
export const tipoCambioATexto = (n: number) => n.toLocaleString("es-UY", { useGrouping: false, maximumFractionDigits: 4 })

export interface PrecioForm {
  monto: string
  moneda: "USD" | "UYU"
  tipoCambio: TipoCambioForm
  estado: "pagado" | "pendiente"
  vencimiento: string     // solo pendiente: cuándo se espera cobrar o pagar (opcional)
}

export const precioVacio = (): PrecioForm => ({ monto: "", moneda: "USD", tipoCambio: tipoCambioVacio(), estado: "pendiente", vencimiento: "" })

export const numero = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")))

// ── Montos en formato moneda (es-UY): "1.234,50" ──

// Lo que se escribe en un campo de monto: solo dígitos y una coma decimal (hasta 2 decimales); los
// miles se separan con punto. Un punto recién escrito al final (teclados con punto decimal) cuenta
// como coma: "12" → "12." → "12,". Con `anterior` se distingue de borrar ("1.234" → "1.23" sigue siendo 123).
export function formatearMonto(texto: string, anterior = ""): string {
  let t = texto.replace(/[^\d.,]/g, "")
  if (t === anterior + "." && !anterior.includes(",")) t = anterior.replace(/\./g, "") + ","
  t = t.replace(/\./g, "")
  const coma = t.indexOf(",")
  const entero = (coma === -1 ? t : t.slice(0, coma)).replace(/^0+(?=\d)/, "")
  const decimales = coma === -1 ? null : t.slice(coma + 1).replace(/,/g, "").slice(0, 2)
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return decimales === null ? conMiles : `${conMiles || "0"},${decimales}`
}

// "1.234,50" → 1234.5; vacío → null
export const parsearMonto = (texto: string): number | null => {
  const t = texto.replace(/\./g, "").replace(",", ".").trim()
  return t === "" ? null : Number(t)
}

// 1234.5 → "1.234,50" (para cargar un monto existente en el campo)
export const montoATexto = (n: number) =>
  n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Reparto entre titulares ──

export interface TitularForm { titularId: string; monto: string }

// Sin filas: sin titular. Una fila: el monto entero. Varias: cada una con su parte, que tiene que sumar el total.
export function leerTitulares(filas: TitularForm[], total: number): { titulares: { titular_id: string; monto: number }[] } | { error: string } {
  if (filas.length === 0) return { titulares: [] }
  if (filas.some(f => !f.titularId)) return { error: "Elegí el titular de cada parte" }
  if (new Set(filas.map(f => f.titularId)).size !== filas.length) return { error: "Un titular aparece dos veces" }
  if (filas.length === 1) return { titulares: [{ titular_id: filas[0].titularId, monto: total }] }
  const partes = filas.map(f => parsearMonto(f.monto))
  if (partes.some(m => m === null || Number.isNaN(m) || Math.round(m * 100) <= 0)) return { error: "Cada titular necesita un monto mayor a cero" }
  const suma = partes.reduce<number>((s, m) => s + Math.round(m! * 100), 0)
  if (suma !== Math.round(total * 100)) {
    return { error: `Lo repartido entre los titulares (${montoATexto(suma / 100)}) tiene que sumar el monto (${montoATexto(total)})` }
  }
  return { titulares: filas.map((f, i) => ({ titular_id: f.titularId, monto: partes[i]! })) }
}

// Valida lo mismo que la base (que lo valida igual); devuelve el precio o el mensaje.
// Pagado o cobrado: en la fecha del movimiento (al editar, se conserva la fecha de pago que tenía si
// no queda antes de la fecha). Pendiente: con la fecha prevista, si se cargó.
export function leerPrecio(v: PrecioForm, fecha: string, fechaPagoPrevia?: string | null): { precio: PrecioCarga } | { error: string } {
  const monto = parsearMonto(v.monto)
  if (monto === null || Number.isNaN(monto) || Math.round(monto * 100) <= 0) return { error: "El monto tiene que ser mayor a cero" }
  const precio: PrecioCarga = { monto, moneda: v.moneda, estado: v.estado }
  if (v.moneda === "UYU") {
    const tc = numero(v.tipoCambio.texto)
    if (tc === null || Number.isNaN(tc) || tc <= 0) return { error: "Con pesos hay que cargar el tipo de cambio" }
    precio.tipo_cambio = tc
    if (v.tipoCambio.fechaBcu) precio.tipo_cambio_fecha = v.tipoCambio.fechaBcu
  }
  if (v.estado === "pagado") precio.fecha_pago = fechaPagoPrevia && fechaPagoPrevia >= fecha ? fechaPagoPrevia : fecha
  else if (v.vencimiento) {
    if (v.vencimiento < fecha) return { error: "La fecha prevista no puede ser anterior a la del movimiento" }
    precio.vencimiento = v.vencimiento
  }
  return { precio }
}
