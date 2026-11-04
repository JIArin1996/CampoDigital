import { fechaCorta } from "@/components/lotes/formato"
import type { EntradaBitacora, EstadoDecision, EstadoIdea, EstadoTarea, TipoEntrada } from "@/types/bitacora"

export const TIPOS_ENTRADA: TipoEntrada[] = ["tarea", "decision", "idea"]

export const ETIQUETA_TIPO: Record<TipoEntrada, string> = {
  tarea: "Tarea",
  decision: "Decisión",
  idea: "Idea",
}

// Chip de tipo: tokens de globals.css (contraste texto/fondo de 8,8:1 o más)
export const COLOR_TIPO: Record<TipoEntrada, string> = {
  decision: "bg-accent text-accent-foreground",
  idea: "bg-(--etiqueta-idea) text-(--etiqueta-idea-texto)",
  tarea: "bg-(--etiqueta-tarea) text-(--etiqueta-tarea-texto)",
}

export const ESTADOS_IDEA: EstadoIdea[] = ["abierta", "decidida", "descartada"]
export const ESTADOS_TAREA: EstadoTarea[] = ["pendiente", "realizada"]
export const ESTADOS_DECISION: EstadoDecision[] = ["pendiente", "realizada"]

export const ETIQUETA_ESTADO: Record<EstadoIdea, string> = {
  abierta: "Abierta",
  decidida: "Decidida",
  descartada: "Descartada",
}

// Tarea y decisión tienen los mismos estados
export const ETIQUETA_ESTADO_TAREA: Record<EstadoTarea | EstadoDecision, string> = {
  pendiente: "Pendiente",
  realizada: "Realizada",
}

// El estado de una entrada, sea del tipo que sea
export const estadoDe = (e: Pick<EntradaBitacora, "tipo" | "estado_tarea" | "estado_decision" | "estado_idea">) =>
  e.tipo === "tarea" ? e.estado_tarea : e.tipo === "decision" ? e.estado_decision : e.estado_idea

export const etiquetaEstado = (e: Pick<EntradaBitacora, "tipo" | "estado_tarea" | "estado_decision" | "estado_idea">) => {
  const estado = estadoDe(e)
  if (!estado) return ""
  return e.tipo === "idea" ? ETIQUETA_ESTADO[estado as EstadoIdea] : ETIQUETA_ESTADO_TAREA[estado as EstadoTarea]
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
export function mensajeTareaRealizada(vencimiento: string, dias: number, hoy: string) {
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
