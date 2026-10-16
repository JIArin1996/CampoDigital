import { Baby, HeartCrack, Scale, ShoppingCart, Tag, type LucideIcon } from "lucide-react"

import type { Modalidad, TipoActividad, TipoActividad6a } from "@/types/actividades"

export const ETIQUETA_ACTIVIDAD: Record<TipoActividad, string> = {
  pesada: "Pesada",
  mortandad: "Mortandad",
  compra: "Compra",
  venta: "Venta",
  paricion: "Parición",
  sanidad: "Sanidad",
  antiparasitario: "Antiparasitario",
  servicio: "Servicio",
  diagnostico_gestacion: "Diagnóstico de gestación",
  destete: "Destete",
  esquila: "Esquila",
  personalizada: "Otra actividad",
}

// Las que se cargan en la Etapa 6a, en el orden del selector
export const TIPOS_6A: TipoActividad6a[] = ["pesada", "venta", "compra", "mortandad", "paricion"]

export const ICONO_ACTIVIDAD: Record<TipoActividad6a, LucideIcon> = {
  pesada: Scale,
  venta: Tag,
  compra: ShoppingCart,
  mortandad: HeartCrack,
  paricion: Baby,
}

export const DESCRIPCION_ACTIVIDAD: Record<TipoActividad6a, string> = {
  pesada: "Peso vivo por categoría; no cambia el stock",
  venta: "Baja de animales, con precio y kg al gancho opcionales",
  compra: "Alta de animales en un lote existente o nuevo",
  mortandad: "Baja de animales, con su causa",
  paricion: "Crías vivas al lote de cría",
}

export const MODALIDADES: Modalidad[] = ["productor", "remate", "frigorifico", "otra"]

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  productor: "A productor",
  remate: "Remate",
  frigorifico: "Frigorífico",
  otra: "Otra",
}

export const esTipo6a = (v: string | null): v is TipoActividad6a => !!v && (TIPOS_6A as string[]).includes(v)

const numero = (n: number, decimales: number) =>
  n.toLocaleString("es-UY", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

export const kg = (n: number) => `${numero(n, n % 1 === 0 ? 0 : 1)} kg`
export const usd = (n: number) => `USD ${numero(n, 2)}`
export const porcentaje = (n: number) => `${numero(n, 1)} %`

// Id de la actividad, generado al abrir el formulario (idempotencia).
// crypto.randomUUID solo existe en contextos seguros (https o localhost): desde el celular
// por la red local (http://192.168...) no está, así que se arma con getRandomValues.
export function nuevoId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
