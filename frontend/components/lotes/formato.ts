import type { TipoEventoLote } from "@/types/lotes"

// Fecha de hoy en el huso del teléfono, formato YYYY-MM-DD (la base valida con la fecha de Montevideo)
export const hoyLocal = () => new Date().toLocaleDateString("en-CA")

export const fechaCorta = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" })

export const ETIQUETA_EVENTO: Record<TipoEventoLote, string> = {
  alta_inicial: "Alta inicial",
  paricion: "Parición",
  compra: "Compra",
  venta: "Venta",
  mortandad: "Mortandad",
  recategorizacion: "Recategorización",
  division: "División",
  union: "Unión",
  ajuste: "Ajuste",
}

// Clases para campos y botones cómodos de tocar en el celular
export const CAMPO = "h-11 text-base md:h-9 md:text-sm"
export const SELECT_NATIVO =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm"
export const BOTON = "h-11 px-5 md:h-9"
