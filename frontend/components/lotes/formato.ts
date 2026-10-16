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

// Clases compartidas de tamaño táctil
export { CAMPO, SELECT_NATIVO, BOTON } from "@/components/shared/estilos"
