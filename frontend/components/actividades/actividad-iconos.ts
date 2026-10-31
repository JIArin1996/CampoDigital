import {
  Baby, ClipboardPen, HeartCrack, HeartHandshake, MilkOff, Scale, Scissors, ShoppingCart, Stethoscope, Syringe, Tag,
  type LucideIcon,
} from "lucide-react"
import type { CSSProperties } from "react"

import type { TipoActividad } from "@/types/actividades"

/**
 * Mapeo central de cada tipo de actividad: ícono (lucide, trazo de 2 px), familia de color y etiqueta.
 * Lo usan el listado (línea de tiempo) y el selector de "Nueva actividad"; sirve para el calendario y
 * los filtros. El color va por familia y el ícono distingue el tipo. Los colores son los tokens
 * --actividad-<familia> y --actividad-<familia>-fondo de globals.css (contraste de 6:1 o más).
 */

export type FamiliaActividad = "manejo" | "sanidad" | "reproduccion" | "lana" | "comercio" | "bajas" | "otra"

export const ETIQUETA_FAMILIA: Record<FamiliaActividad, string> = {
  manejo: "Manejo",
  sanidad: "Sanidad",
  reproduccion: "Reproducción",
  lana: "Lana",
  comercio: "Compra y venta",
  bajas: "Bajas",
  otra: "Otra",
}

interface Apariencia {
  icono: LucideIcon
  familia: FamiliaActividad
  etiqueta: string
  etiquetaCorta: string     // donde el espacio es poco (filas compactas)
}

export const ACTIVIDAD: Record<TipoActividad, Apariencia> = {
  pesada:                { icono: Scale,          familia: "manejo",       etiqueta: "Pesada",                   etiquetaCorta: "Pesada" },
  sanidad:               { icono: Syringe,        familia: "sanidad",      etiqueta: "Sanidad",                  etiquetaCorta: "Sanidad" },
  // Antiparasitario no se carga como tipo (es una categoría de producto de sanidad); se ve como sanidad
  antiparasitario:       { icono: Syringe,        familia: "sanidad",      etiqueta: "Antiparasitario",          etiquetaCorta: "Antiparasitario" },
  servicio:              { icono: HeartHandshake, familia: "reproduccion", etiqueta: "Servicio",                 etiquetaCorta: "Servicio" },
  diagnostico_gestacion: { icono: Stethoscope,    familia: "reproduccion", etiqueta: "Diagnóstico de gestación", etiquetaCorta: "Diagnóstico" },
  paricion:              { icono: Baby,           familia: "reproduccion", etiqueta: "Parición",                 etiquetaCorta: "Parición" },
  destete:               { icono: MilkOff,        familia: "reproduccion", etiqueta: "Destete",                  etiquetaCorta: "Destete" },
  esquila:               { icono: Scissors,       familia: "lana",         etiqueta: "Esquila",                  etiquetaCorta: "Esquila" },
  compra:                { icono: ShoppingCart,   familia: "comercio",     etiqueta: "Compra",                   etiquetaCorta: "Compra" },
  venta:                 { icono: Tag,            familia: "comercio",     etiqueta: "Venta",                    etiquetaCorta: "Venta" },
  mortandad:             { icono: HeartCrack,     familia: "bajas",        etiqueta: "Mortandad",                etiquetaCorta: "Mortandad" },
  personalizada:         { icono: ClipboardPen,   familia: "otra",         etiqueta: "Otra actividad",           etiquetaCorta: "Otra" },
}

// Variables CSS para un elemento del tipo: --c (trazo y texto) y --f (fondo del círculo).
// Uso: style={coloresActividad(tipo)} y clases text-[var(--c)] bg-[var(--f)].
export function coloresActividad(tipo: TipoActividad): CSSProperties {
  const f = ACTIVIDAD[tipo].familia
  return { "--c": `var(--actividad-${f})`, "--f": `var(--actividad-${f}-fondo)` } as CSSProperties
}
