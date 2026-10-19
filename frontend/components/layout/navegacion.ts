import {
  Home, Layers, NotebookPen, CalendarDays, Menu, ClipboardList, Grid3X3, MapPin, Users, PawPrint, type LucideIcon,
} from "lucide-react"

export interface ItemNav {
  href: string
  label: string
  icon: LucideIcon
  necesitaEstablecimiento?: boolean   // deshabilitado si no hay establecimiento activo
  soloAdmin?: boolean
}

// Barra inferior del celular (5 lugares): las 4 prioridades del enfoque y "Más"
export const NAV_MOVIL: ItemNav[] = [
  { href: "/inicio",     label: "Inicio",     icon: Home },
  { href: "/lotes",      label: "Lotes",      icon: Layers,       necesitaEstablecimiento: true },
  { href: "/bitacora",   label: "Bitácora",   icon: NotebookPen,  necesitaEstablecimiento: true },
  { href: "/calendario", label: "Calendario", icon: CalendarDays, necesitaEstablecimiento: true },
  { href: "/mas",        label: "Más",        icon: Menu },
]

// Menú lateral de escritorio: lo diario arriba, la configuración abajo
export const NAV_PRINCIPAL: ItemNav[] = [
  { href: "/inicio",      label: "Inicio",      icon: Home },
  { href: "/lotes",       label: "Lotes",       icon: Layers,        necesitaEstablecimiento: true },
  { href: "/bitacora",    label: "Bitácora",    icon: NotebookPen,   necesitaEstablecimiento: true },
  { href: "/calendario",  label: "Calendario",  icon: CalendarDays,  necesitaEstablecimiento: true },
  { href: "/actividades", label: "Actividades", icon: ClipboardList, necesitaEstablecimiento: true },
]

export const NAV_CONFIGURACION: ItemNav[] = [
  { href: "/potreros",         label: "Potreros",         icon: Grid3X3, necesitaEstablecimiento: true },
  { href: "/especies",         label: "Especies",         icon: PawPrint, necesitaEstablecimiento: true, soloAdmin: true },
  { href: "/establecimientos", label: "Establecimientos", icon: MapPin },
  { href: "/usuarios",         label: "Usuarios",         icon: Users,   soloAdmin: true },
]

// Rutas que se ven dentro de "Más" en el celular (para marcarlo como activo)
export const RUTAS_DE_MAS = ["/mas", "/actividades", "/potreros", "/especies", "/establecimientos", "/usuarios", "/perfil"]

export const enRuta = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/")
