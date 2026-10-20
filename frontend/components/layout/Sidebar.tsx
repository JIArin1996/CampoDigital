"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { CerrarSesion } from "@/components/layout/CerrarSesion"
import { SelectorEstablecimiento } from "@/components/layout/SelectorEstablecimiento"
import { Avatar } from "@/components/usuarios/Avatar"
import { nombreCompleto } from "@/components/usuarios/roles"
import {
  BOTON_CONFIGURACIONES, NAV_MOVIL, NAV_PRINCIPAL, RUTAS_DE_MAS, enRuta, itemActivo, visibleParaRol, type ItemNav,
} from "@/components/layout/navegacion"

/**
 * Navegación de la app:
 *  - celular: encabezado fijo arriba (establecimiento y perfil) y barra inferior de 5 lugares;
 *  - escritorio: menú lateral fijo.
 */
export function Sidebar() {
  const pathname = usePathname()
  const { establecimientoActivo, esAdmin, perfil } = useEstablecimiento()

  // En el login no hay menú
  if (pathname === "/login") return null

  const hayActivo = !!establecimientoActivo
  const visible = visibleParaRol(esAdmin)

  return (
    <>
      {/* ── Escritorio: menú lateral ──────────────────────────────────────── */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 md:left-0 border-r border-sidebar-border bg-sidebar z-30">
        <Link href="/inicio" className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border shrink-0">
          <Image src="/isotipo.png" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="text-lg font-bold text-primary tracking-tight">Campo Digital</span>
        </Link>

        <div className="px-3 py-3 border-b border-sidebar-border shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
            Establecimiento
          </p>
          <SelectorEstablecimiento />
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-4">
          <ListaEscritorio items={NAV_PRINCIPAL.filter(visible)} pathname={pathname} hayActivo={hayActivo} />
          {/* Configuraciones: al fondo del menú, justo arriba de la cuenta */}
          {esAdmin && (
            <div className="mt-auto">
              <ListaEscritorio items={[BOTON_CONFIGURACIONES]} pathname={pathname} hayActivo={hayActivo} />
            </div>
          )}
        </nav>

        <div className="px-2 py-3 border-t border-sidebar-border shrink-0 space-y-0.5">
          {perfil && (
            <Link
              href="/perfil"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                enRuta(pathname, "/perfil") ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
              )}
            >
              <Avatar nombre={perfil.nombre} apellido={perfil.apellido} fotoPath={perfil.foto_path} className="h-8 w-8 text-xs" />
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{nombreCompleto(perfil)}</span>
                <span className="block text-xs text-muted-foreground">Mi perfil</span>
              </span>
            </Link>
          )}
          <CerrarSesion />
        </div>
      </aside>

      {/* ── Celular: encabezado ───────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center gap-2 px-3 bg-background border-b border-border">
        <Link href="/inicio" aria-label="Inicio" className="shrink-0">
          <Image src="/isotipo.png" alt="" width={32} height={32} className="h-8 w-8" />
        </Link>
        <div className="flex-1 min-w-0">
          <SelectorEstablecimiento compacto />
        </div>
        {perfil && (
          <Link href="/perfil" aria-label="Mi perfil" className="shrink-0 p-1">
            <Avatar nombre={perfil.nombre} apellido={perfil.apellido} fotoPath={perfil.foto_path} className="h-9 w-9 text-xs" />
          </Link>
        )}
      </header>

      {/* ── Celular: barra inferior ───────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
        <ul className="flex items-stretch h-16">
          {NAV_MOVIL.map(item => {
            const Icono = item.icon
            const deshabilitado = item.necesitaEstablecimiento && !hayActivo
            const activo = item.href === "/mas"
              ? RUTAS_DE_MAS.some(r => enRuta(pathname, r))
              : enRuta(pathname, item.href)
            return (
              <li key={item.href} className="flex-1">
                {deshabilitado ? (
                  <span className="flex flex-col items-center justify-center gap-1 h-full text-[11px] font-medium text-muted-foreground opacity-50">
                    <Icono className="h-6 w-6" />
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    aria-current={activo ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 h-full text-[11px] font-semibold transition-colors",
                      activo ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <span className={cn("flex items-center justify-center h-7 w-12 rounded-full", activo && "bg-accent")}>
                      <Icono className="h-6 w-6" />
                    </span>
                    {item.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

function ListaEscritorio({ items, pathname, hayActivo }: { items: ItemNav[]; pathname: string; hayActivo: boolean }) {
  return (
    <ul className="space-y-0.5">
      {items.map(item => {
        const Icono = item.icon
        const deshabilitado = item.necesitaEstablecimiento && !hayActivo
        const activo = itemActivo(pathname, item)
        return (
          <li key={item.href}>
            {deshabilitado ? (
              <span
                title="Elegí un establecimiento primero"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground opacity-50 cursor-not-allowed"
              >
                <Icono className="h-4 w-4 shrink-0" />
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  activo ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"
                )}
              >
                <Icono className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
