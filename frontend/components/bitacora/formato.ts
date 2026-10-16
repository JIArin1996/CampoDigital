import type { EstadoIdea, TipoEntrada } from "@/types/bitacora"

export const TIPOS_ENTRADA: TipoEntrada[] = ["decision", "idea", "observacion", "compra_venta_gasto"]

export const ETIQUETA_TIPO: Record<TipoEntrada, string> = {
  decision: "Decisión",
  idea: "Idea",
  observacion: "Observación",
  compra_venta_gasto: "Compra, venta o gasto",
}

// Chip de tipo: tokens de globals.css (contraste texto/fondo de 8,8:1 o más)
export const COLOR_TIPO: Record<TipoEntrada, string> = {
  decision: "bg-accent text-accent-foreground",
  idea: "bg-(--etiqueta-idea) text-(--etiqueta-idea-texto)",
  observacion: "bg-(--etiqueta-observacion) text-(--etiqueta-observacion-texto)",
  compra_venta_gasto: "bg-(--etiqueta-compra) text-(--etiqueta-compra-texto)",
}

export const ESTADOS_IDEA: EstadoIdea[] = ["abierta", "decidida", "descartada"]

export const ETIQUETA_ESTADO: Record<EstadoIdea, string> = {
  abierta: "Abierta",
  decidida: "Decidida",
  descartada: "Descartada",
}

// Fecha y hora cortas (para "editada el ...")
export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
