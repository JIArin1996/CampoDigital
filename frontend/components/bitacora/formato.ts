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

// Filtro de estado de la bitácora: sin tipo, abiertas o cerradas; con tipo, los estados de ese tipo
export type FiltroEstado = "todos" | "abiertas" | "cerradas" | EstadoTarea | EstadoDecision | EstadoIdea

const PLURAL: Record<EstadoTarea | EstadoDecision | EstadoIdea, string> = {
  pendiente: "Pendientes", realizada: "Realizadas", abierta: "Abiertas", decidida: "Decididas", descartada: "Descartadas",
}

export function opcionesEstado(tipo: TipoEntrada | null): { valor: FiltroEstado; etiqueta: string }[] {
  const estados: (EstadoTarea | EstadoDecision | EstadoIdea)[] =
    tipo === "tarea" ? ESTADOS_TAREA : tipo === "decision" ? ESTADOS_DECISION : tipo === "idea" ? ESTADOS_IDEA : []
  return tipo
    ? [{ valor: "todos", etiqueta: "Todas" }, ...estados.map(e => ({ valor: e, etiqueta: PLURAL[e] }))]
    : [{ valor: "abiertas", etiqueta: "Abiertas" }, { valor: "cerradas", etiqueta: "Cerradas" }, { valor: "todos", etiqueta: "Todas" }]
}

type ConEstado = Pick<EntradaBitacora, "tipo" | "estado_tarea" | "estado_decision" | "estado_idea" | "cerrada_en">

export const cumpleEstado = (e: ConEstado, filtro: FiltroEstado) =>
  filtro === "todos" || (filtro === "abiertas" ? !e.cerrada_en : filtro === "cerradas" ? !!e.cerrada_en : estadoDe(e) === filtro)

// El día en que se ubica una entrada: el vencimiento de una tarea pendiente, el día del cierre de una cerrada
// (en la hora local) o la fecha de la nota
export function fechaQueManda(e: Pick<EntradaBitacora, "tipo" | "estado_tarea" | "vencimiento" | "cerrada_en" | "fecha">) {
  if (e.tipo === "tarea" && e.estado_tarea === "pendiente" && e.vencimiento) return e.vencimiento
  if (e.cerrada_en) return new Date(e.cerrada_en).toLocaleDateString("en-CA")
  return e.fecha
}

export const esVencida = (e: Pick<EntradaBitacora, "tipo" | "estado_tarea" | "vencimiento">, hoy: string) =>
  e.tipo === "tarea" && e.estado_tarea === "pendiente" && !!e.vencimiento && e.vencimiento < hoy

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
