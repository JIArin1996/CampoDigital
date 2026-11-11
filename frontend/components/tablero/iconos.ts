import { ChartColumn, ChartPie, Hash, ListOrdered, Map as IconoMapa, Table2, TrendingUp } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { Vista } from "@/components/tablero/vistas"

// El ícono de cada opción de "¿Cómo lo querés ver?" (constructor y menú rápido de la tarjeta)
export const ICONO_VISTA: Record<Vista, LucideIcon> = {
  numero: Hash, evolucion: TrendingUp, comparar: ChartColumn, ranking: ListOrdered, composicion: ChartPie, mapa: IconoMapa, tabla: Table2,
}
