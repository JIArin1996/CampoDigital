import {
  Home, Layers, NotebookPen, CalendarDays, Menu, Settings, ClipboardList, Grid3X3, MapPin, Users, PawPrint, type LucideIcon,
} from "lucide-react"

export interface ItemNav {
  href: string
  label: string
  icon: LucideIcon
  necesitaEstablecimiento?: boolean   // deshabilitado si no hay establecimiento activo
  soloAdmin?: boolean
  soloNoAdmin?: boolean               // el administrador lo encuentra en Configuraciones
  rutas?: string[]                    // otras rutas que lo marcan como activo
}

// Barra inferior del celular (5 lugares): las 4 prioridades del enfoque y "Más"
export const NAV_MOVIL: ItemNav[] = [
  { href: "/inicio",     label: "Inicio",     icon: Home },
  { href: "/lotes",      label: "Lotes",      icon: Layers,       necesitaEstablecimiento: true },
  { href: "/bitacora",   label: "Bitácora",   icon: NotebookPen,  necesitaEstablecimiento: true },
  { href: "/calendario", label: "Calendario", icon: CalendarDays, necesitaEstablecimiento: true },
  { href: "/mas",        label: "Más",        icon: Menu },
]

// Menú lateral de escritorio: lo diario. Potreros es un atajo para quien no es administrador.
export const NAV_PRINCIPAL: ItemNav[] = [
  { href: "/inicio",      label: "Inicio",      icon: Home },
  { href: "/lotes",       label: "Lotes",       icon: Layers,        necesitaEstablecimiento: true },
  { href: "/bitacora",    label: "Bitácora",    icon: NotebookPen,   necesitaEstablecimiento: true },
  { href: "/calendario",  label: "Calendario",  icon: CalendarDays,  necesitaEstablecimiento: true },
  { href: "/actividades", label: "Actividades", icon: ClipboardList, necesitaEstablecimiento: true },
  { href: "/potreros",    label: "Potreros",    icon: Grid3X3,       necesitaEstablecimiento: true, soloNoAdmin: true },
]

// Lo que hay dentro de la pantalla Configuraciones (solo administrador)
export const NAV_CONFIGURACION: ItemNav[] = [
  { href: "/potreros",         label: "Potreros",         icon: Grid3X3,  necesitaEstablecimiento: true },
  { href: "/especies",         label: "Especies",         icon: PawPrint, necesitaEstablecimiento: true },
  { href: "/establecimientos", label: "Establecimientos", icon: MapPin },
  { href: "/usuarios",         label: "Usuarios",         icon: Users },
]

// Botón que abre la pantalla Configuraciones (menú lateral y "Más")
export const BOTON_CONFIGURACIONES: ItemNav = {
  href: "/configuraciones", label: "Configuraciones", icon: Settings, soloAdmin: true,
  rutas: NAV_CONFIGURACION.map(i => i.href),
}

// Atajos de "Más" en el celular: lo del menú lateral que no entra en la barra inferior
export const ATAJOS_MAS: ItemNav[] = NAV_PRINCIPAL.filter(i => !NAV_MOVIL.some(m => m.href === i.href))

// Rutas que se ven dentro de "Más" en el celular (para marcarlo como activo)
export const RUTAS_DE_MAS = [
  "/mas", ...ATAJOS_MAS.map(i => i.href), BOTON_CONFIGURACIONES.href, ...NAV_CONFIGURACION.map(i => i.href), "/perfil",
]

export const enRuta = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/")

// Activo si la ruta es la suya o una de sus rutas asociadas
export const itemActivo = (pathname: string, item: ItemNav) =>
  enRuta(pathname, item.href) || (item.rutas ?? []).some(r => enRuta(pathname, r))

// Qué ítems ve cada uno
export const visibleParaRol = (esAdmin: boolean) => (item: ItemNav) =>
  !(item.soloAdmin && !esAdmin) && !(item.soloNoAdmin && esAdmin)
