"use client"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"
import { ListaAccesos } from "@/components/layout/ListaAccesos"
import { NAV_CONFIGURACION } from "@/components/layout/navegacion"

// Configuraciones (solo administrador): especies, rubros, conceptos, titulares, establecimientos y usuarios
export default function ConfiguracionesPage() {
  const { esAdmin, establecimientoActivo, cargando } = useEstablecimiento()

  if (cargando) return <PageContainer><div className="h-64 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!esAdmin) {
    return <PageContainer title="Configuraciones"><p className="text-muted-foreground">Solo el administrador entra a las configuraciones.</p></PageContainer>
  }

  return (
    <PageContainer title="Configuraciones">
      <div className="max-w-xl">
        <ListaAccesos items={NAV_CONFIGURACION} hayActivo={!!establecimientoActivo} />
      </div>
    </PageContainer>
  )
}
