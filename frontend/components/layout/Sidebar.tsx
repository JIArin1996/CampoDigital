"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MapPin, Grid3X3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { CerrarSesion } from "@/components/layout/CerrarSesion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// La navegación definitiva (inicio, bitácora, lotes, actividades, calendario) se arma en la Etapa 4
const NAV_ITEMS = [
  { href: "/establecimientos", label: "Establecimientos", icon: MapPin },
  { href: "/potreros",         label: "Potreros",         icon: Grid3X3 },
]

// Los módulos de campo requieren establecimiento activo (todos excepto Establecimientos)
const MODULOS_DE_CAMPO = NAV_ITEMS.slice(1).map(i => i.href)

function NavList({ pathname, hasActivo }: { pathname: string; hasActivo: boolean }) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

  return (
    <ul className="space-y-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const needsActivo = MODULOS_DE_CAMPO.includes(href)
        const disabled = needsActivo && !hasActivo
        const active = isActive(href)

        return (
          <li key={href}>
            {disabled ? (
              <span
                title="Seleccioná un establecimiento primero"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-not-allowed opacity-40 text-sidebar-foreground"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </span>
            ) : (
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { establecimientos, establecimientoActivo, setEstablecimientoActivo, cargando } =
    useEstablecimiento()

  const handleSelectEst = (val: string | null) => {
    if (!val) return
    const found = establecimientos.find(e => e.id.toString() === val)
    if (found) setEstablecimientoActivo(found)
  }

  const selectorValue = establecimientoActivo?.id?.toString() ?? ""

  // En el login no hay menú
  if (pathname === "/login") return null

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 md:left-0 border-r border-border bg-sidebar z-30">

        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
          <span className="text-lg font-bold text-sidebar-foreground tracking-tight">
            Campo Digital
          </span>
        </div>

        {/* Selector de establecimiento */}
        <div className="px-3 py-3 border-b border-border shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 mb-1.5 px-0.5">
            Establecimiento activo
          </p>
          {cargando ? (
            <div className="h-8 rounded-lg bg-sidebar-accent/30 animate-pulse" />
          ) : establecimientos.length === 0 ? (
            <p className="text-xs text-sidebar-foreground/50 px-1">Sin establecimientos</p>
          ) : (
            <Select
              value={selectorValue}
              onValueChange={handleSelectEst}
            >
              <SelectTrigger className="w-full bg-sidebar-accent/20 border-sidebar-border text-sidebar-foreground text-xs">
                <SelectValue>
                  {(val: string | null) =>
                    val
                      ? (establecimientos.find(e => e.id.toString() === val)?.nombre ?? val)
                      : <span className="text-sidebar-foreground/40">Seleccionar...</span>
                  }
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
          )}
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <NavList pathname={pathname} hasActivo={!!establecimientoActivo} />
        </nav>

        {/* Cierre de sesión */}
        <div className="px-2 py-3 border-t border-border shrink-0">
          <CerrarSesion />
        </div>
      </aside>

      {/* ── Mobile bottom nav (primeros 5 ítems) ────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-sidebar border-t border-border">
        <ul className="flex items-center justify-around h-16">
          {NAV_ITEMS.slice(0, 5).map(({ href, label, icon: Icon }) => {
            const needsActivo = MODULOS_DE_CAMPO.includes(href)
            const disabled = needsActivo && !establecimientoActivo
            const active = pathname === href || pathname.startsWith(href + "/")

            return (
              <li key={href} className="flex-1">
                {disabled ? (
                  <span className="flex flex-col items-center justify-center gap-1 h-16 text-[10px] font-medium opacity-40 text-sidebar-foreground/60">
                    <Icon className="h-5 w-5" />
                    {label}
                  </span>
                ) : (
                  <Link
                    href={href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 h-16 text-[10px] font-medium transition-colors",
                      active ? "text-sidebar-primary" : "text-sidebar-foreground/60"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                )}
              </li>
            )
          })}
          <li className="flex-1">
            <CerrarSesion compacto />
          </li>
        </ul>
      </nav>
    </>
  )
}
