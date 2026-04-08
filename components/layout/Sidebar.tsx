"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  MapPin,
  ArrowLeftRight,
  Syringe,
  Scale,
  Heart,
  Wheat,
  Package,
  Wrench,
  DollarSign,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const CowIcon = (props: React.ComponentProps<"svg">) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
  >
    {/* Orejas y contorno de cabeza (estilo geométrico compatible Lucide) */}
    <path d="M4 11a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v5a5 5 0 0 1-10 0v-2" />
    <path d="M4 11v5a5 5 0 0 0 10 0" />
    <path d="M6 7V4c0-.6.4-1 1-1h2l1 2h4l1-2h2c.6 0 1 .4 1 1v3" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
)


// Definición de la navegación principal
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/establecimientos", label: "Establecimientos", icon: MapPin },
  { href: "/animales", label: "Animales", icon: CowIcon },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/sanidad", label: "Sanidad", icon: Syringe },
  { href: "/pesajes", label: "Pesajes", icon: Scale },
  { href: "/reproduccion", label: "Reproducción", icon: Heart },
  { href: "/agricultura", label: "Agricultura", icon: Wheat },
  { href: "/insumos", label: "Insumos", icon: Package },
  { href: "/maquinaria", label: "Maquinaria", icon: Wrench },
  { href: "/finanzas", label: "Finanzas", icon: DollarSign },
  { href: "/personal", label: "Personal", icon: Users },
]

// Los 5 items que aparecen en la barra inferior de mobile
const mobileNavItems = navItems.slice(0, 5)

export function Sidebar() {
  const pathname = usePathname()
  const { establecimientoActivo, setEstablecimientoActivo, establecimientos, cargando } = useEstablecimiento()

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* ── Sidebar desktop (md en adelante) ── */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 md:left-0 border-r border-border bg-sidebar z-30">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
          <span className="text-lg font-bold text-sidebar-foreground tracking-tight">
            Campo Digital
          </span>
        </div>

        {/* Selector de Establecimiento Contextual */}
        <div className="px-3 py-3 border-b border-border bg-sidebar-accent/10">
          <div className="text-xs font-semibold text-sidebar-foreground/50 mb-1.5 px-1 uppercase tracking-wider">Establecimiento:</div>
          {cargando ? (
            <div className="h-9 w-full rounded-md bg-sidebar-accent animate-pulse"></div>
          ) : establecimientos.length > 0 ? (
            <Select
              value={establecimientoActivo?.id.toString() || ""}
              onValueChange={(val) => {
                const found = establecimientos.find(e => e.id.toString() === val)
                if (found) setEstablecimientoActivo(found)
              }}
            >
              <SelectTrigger className="w-full text-sm font-medium bg-sidebar-accent border-sidebar-accent hover:bg-sidebar-accent/80 h-9 truncate">
                <SelectValue placeholder="Seleccionar...">
                  {establecimientoActivo?.nombre}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {establecimientos.map(est => (
                  <SelectItem key={est.id} value={est.id.toString()}>
                    {est.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-xs text-sidebar-foreground/60 p-2 text-center border rounded-md border-dashed border-sidebar-accent">
              Crear primer establecimiento
            </div>
          )}
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <ul className="space-y-0.5">
            {navItems.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive(href)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* ── Barra de navegación inferior mobile (solo < md) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-sidebar border-t border-border">
        <ul className="flex items-center justify-around h-16">
          {mobileNavItems.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 h-full text-[10px] font-medium transition-colors",
                  isActive(href)
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/60"
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
