"use client"

import Link from "next/link"
import { ChevronRight, UserRound } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"
import { CerrarSesion } from "@/components/layout/CerrarSesion"
import { NAV_CONFIGURACION, NAV_PRINCIPAL, type ItemNav } from "@/components/layout/navegacion"

// Lo que no entra en la barra inferior del celular
const SECCIONES = NAV_PRINCIPAL.filter(i => i.href === "/actividades")

export default function MasPage() {
  const { esAdmin, establecimientoActivo } = useEstablecimiento()
  const hayActivo = !!establecimientoActivo

  const configuracion = NAV_CONFIGURACION.filter(i => !i.soloAdmin || esAdmin)

  return (
    <PageContainer title="Más">
      <div className="space-y-6 max-w-xl">
        <Grupo items={SECCIONES} hayActivo={hayActivo} />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">Configuración</p>
          <Grupo items={configuracion} hayActivo={hayActivo} />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">Cuenta</p>
          <ul className="rounded-lg border divide-y bg-card">
            <li>
              <Link href="/perfil" className="flex items-center gap-3 px-4 h-14 hover:bg-muted/50 active:bg-muted">
                <UserRound className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 font-medium">Mi perfil</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            </li>
            <li className="px-1 py-1">
              <CerrarSesion className="h-12 text-base" />
            </li>
          </ul>
        </div>
      </div>
    </PageContainer>
  )
}

function Grupo({ items, hayActivo }: { items: ItemNav[]; hayActivo: boolean }) {
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
