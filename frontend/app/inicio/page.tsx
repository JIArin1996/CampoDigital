"use client"

import Link from "next/link"
import { BarChart3, ChevronRight, Grid3X3, Layers, Plus, type LucideIcon } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"
import { Proximamente } from "@/components/layout/Proximamente"
import { Badge } from "@/components/ui/badge"
import { ETIQUETA_ROL } from "@/components/usuarios/roles"

export default function InicioPage() {
  const { perfil, establecimientoActivo, rolActivo, puedeOperar, esAdmin, cargando } = useEstablecimiento()

  if (cargando) {
    return <PageContainer><div className="h-64 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }

  return (
    <PageContainer>
      {/* Saludo y establecimiento */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Hola{perfil ? `, ${perfil.nombre}` : ""}</h1>
        {establecimientoActivo ? (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-muted-foreground">{establecimientoActivo.nombre}</p>
            {rolActivo && <Badge variant={rolActivo === "consulta" ? "secondary" : "default"}>{ETIQUETA_ROL[rolActivo]}</Badge>}
          </div>
        ) : (
          <p className="text-muted-foreground mt-1">
            {esAdmin
              ? "Todavía no hay establecimientos. Creá el primero desde Más → Establecimientos."
              : "Todavía no tenés establecimientos asignados. Pedile acceso al administrador."}
          </p>
        )}
      </div>

      {establecimientoActivo && (
        <div className="space-y-6">
          {/* Accesos rápidos */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Acceso href="/lotes" icon={Layers} titulo="Lotes" texto="Stock por categoría y ficha de cada lote" />
            {puedeOperar && (
              <Acceso href="/lotes/nuevo" icon={Plus} titulo="Nuevo lote" texto="Con su composición inicial" />
            )}
            <Acceso href="/potreros" icon={Grid3X3} titulo="Potreros" texto="Estructura del campo" />
          </section>

          {/* Números del campo */}
          <Proximamente
            icon={BarChart3}
            titulo="Números del campo"
            descripcion="Stock por categoría, últimas actividades, tareas vencidas y próximas, resultado por rubro e indicadores reproductivos."
            etapa="Etapa 5 (stock) y Etapa 7 (resto)"
          />
        </div>
      )}
    </PageContainer>
  )
}

function Acceso({ href, icon: Icono, titulo, texto }: { href: string; icon: LucideIcon; titulo: string; texto: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-4 hover:bg-muted/50 active:bg-muted transition-colors"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icono className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-sm text-muted-foreground">{texto}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
    </Link>
  )
}
