import {
  Baby, HeartCrack, Heart, Scale, ShoppingCart, Stethoscope, Syringe, Tag, Wind, ClipboardPen, type LucideIcon,
} from "lucide-react"

import type { Modalidad, TipoActividad, TipoActividad6a, TipoActividad6b1, TipoCargable } from "@/types/actividades"

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

// Las que mueven stock (6a) y las que no (6b-1), en el orden del selector
export const TIPOS_6A: TipoActividad6a[] = ["pesada", "venta", "compra", "mortandad", "paricion"]
export const TIPOS_6B1: TipoActividad6b1[] = ["sanidad", "servicio", "diagnostico_gestacion", "esquila", "personalizada"]
export const TIPOS_CARGABLES: TipoCargable[] = [...TIPOS_6A, ...TIPOS_6B1]

export const ICONO_ACTIVIDAD: Record<TipoCargable, LucideIcon> = {
  pesada: Scale,
  venta: Tag,
  compra: ShoppingCart,
  mortandad: HeartCrack,
  paricion: Baby,
  sanidad: Syringe,
  servicio: Heart,
  diagnostico_gestacion: Stethoscope,
  esquila: Wind,
  personalizada: ClipboardPen,
}

export const DESCRIPCION_ACTIVIDAD: Record<TipoCargable, string> = {
  pesada: "Peso vivo por categoría; no cambia el stock",
  venta: "Baja de animales, con precio y kg al gancho opcionales",
  compra: "Alta de animales en un lote existente o nuevo",
  mortandad: "Baja de animales, con su causa",
  paricion: "Crías vivas al lote de cría",
  sanidad: "Vacunas, antiparasitarios y tratamientos, a uno o más lotes",
  servicio: "Entore: vacas entoradas y toros",
  diagnostico_gestacion: "Vacas diagnosticadas y preñadas",
  esquila: "Kg de lana de uno o más lotes ovinos",
  personalizada: "Cualquier otra tarea, con campos libres",
}

export const MODALIDADES: Modalidad[] = ["productor", "remate", "frigorifico", "otra"]

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  productor: "A productor",
  remate: "Remate",
  frigorifico: "Frigorífico",
  otra: "Otra",
}

export const esTipo6a = (v: string | null): v is TipoActividad6a => !!v && (TIPOS_6A as string[]).includes(v)
export const esTipoCargable = (v: string | null): v is TipoCargable => !!v && (TIPOS_CARGABLES as string[]).includes(v)

const numero = (n: number, decimales: number) =>
  n.toLocaleString("es-UY", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

// Kilos: hasta dos decimales, sin ceros de más ("1.350 kg", "512,5 kg", "45,67 kg")
export const kg = (n: number) => `${n.toLocaleString("es-UY", { maximumFractionDigits: 2 })} kg`

// Kilos cargados a mano: mayor a 0 y con hasta dos decimales, como los guarda la base.
// null si está bien; si no, el mensaje (que: "El peso vivo", "Los kg al gancho"...).
export function errorKg(texto: string, que: string): string | null {
  const t = texto.trim()
  if (!/^\d+([.,]\d{1,2})?$/.test(t) || Number(t.replace(",", ".")) <= 0) {
    return `${que}: un número mayor a 0, con hasta dos decimales`
  }
  return null
}
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
