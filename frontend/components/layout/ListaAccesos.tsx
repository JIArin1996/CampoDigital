import Link from "next/link"
import { ChevronRight } from "lucide-react"

import type { ItemNav } from "@/components/layout/navegacion"

/**
 * Lista de accesos en tarjeta (pantallas "Más" y "Configuraciones" del celular y del escritorio).
 * Los que necesitan un establecimiento se muestran deshabilitados si no hay uno elegido.
 */
export function ListaAccesos({ items, hayActivo }: { items: ItemNav[]; hayActivo: boolean }) {
  return (
    <ul className="rounded-lg border divide-y bg-card">
      {items.map(item => {
        const Icono = item.icon
        const deshabilitado = item.necesitaEstablecimiento && !hayActivo
        return (
          <li key={item.href}>
            {deshabilitado ? (
              <span className="flex items-center gap-3 px-4 h-14 opacity-50">
                <Icono className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 font-medium">{item.label}</span>
                <span className="text-xs text-muted-foreground">Elegí un establecimiento</span>
              </span>
            ) : (
              <Link href={item.href} className="flex items-center gap-3 px-4 h-14 hover:bg-muted/50 active:bg-muted">
                <Icono className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 font-medium">{item.label}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
