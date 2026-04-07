"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  MapPin,
  Beef,
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

// Definición de la navegación principal
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/establecimientos", label: "Establecimientos", icon: MapPin },
  { href: "/animales", label: "Animales", icon: Beef },
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
