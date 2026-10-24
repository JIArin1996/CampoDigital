import { fechaCorta } from "@/components/lotes/formato"
import type { EstadoIdea, EstadoTarea, TipoEntrada } from "@/types/bitacora"

export const TIPOS_ENTRADA: TipoEntrada[] = ["decision", "idea", "observacion", "compra_venta_gasto", "tarea"]

export const ETIQUETA_TIPO: Record<TipoEntrada, string> = {
  decision: "Decisión",
  idea: "Idea",
  observacion: "Observación",
  compra_venta_gasto: "Compra, venta o gasto",
  tarea: "Tarea",
}

// Chip de tipo: tokens de globals.css (contraste texto/fondo de 8,8:1 o más)
export const COLOR_TIPO: Record<TipoEntrada, string> = {
  decision: "bg-accent text-accent-foreground",
  idea: "bg-(--etiqueta-idea) text-(--etiqueta-idea-texto)",
  observacion: "bg-(--etiqueta-observacion) text-(--etiqueta-observacion-texto)",
  compra_venta_gasto: "bg-(--etiqueta-compra) text-(--etiqueta-compra-texto)",
  tarea: "bg-(--etiqueta-tarea) text-(--etiqueta-tarea-texto)",
}

export const ESTADOS_IDEA: EstadoIdea[] = ["abierta", "decidida", "descartada"]
export const ESTADOS_TAREA: EstadoTarea[] = ["pendiente", "hecha", "cancelada"]

export const ETIQUETA_ESTADO: Record<EstadoIdea, string> = {
  abierta: "Abierta",
  decidida: "Decidida",
  descartada: "Descartada",
}

export const ETIQUETA_ESTADO_TAREA: Record<EstadoTarea, string> = {
  pendiente: "Pendiente",
  hecha: "Hecha",
  cancelada: "Cancelada",
}

// Días entre dos fechas YYYY-MM-DD (b - a)
export const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000)

// "Vence hoy", "Vence mañana", "Vencida hace 3 días", "Vence en 5 días"
export function textoVencimiento(vencimiento: string, hoy: string) {
  const d = diasEntre(hoy, vencimiento)
  if (d === 0) return "Vence hoy"
  if (d === 1) return "Vence mañana"
  if (d === -1) return "Vencida ayer"
  return d < 0 ? `Vencida hace ${-d} días` : `Vence en ${d} días`
}

// La siguiente de una tarea repetida vence N días después del vencimiento, o de hoy si ya pasó (como la base)
export function mensajeTareaHecha(vencimiento: string, dias: number, hoy: string) {
  const base = vencimiento > hoy ? vencimiento : hoy
  const d = new Date(base + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + dias)
  return `Se anotó la siguiente: vence el ${fechaCorta(d.toISOString().slice(0, 10))}`
}

export const textoRepeticion = (dias: number) =>
  dias === 1 ? "Se repite todos los días" : dias === 7 ? "Se repite cada semana" : `Se repite cada ${dias} días`

// Fecha y hora cortas (para "editada el ...")
export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
