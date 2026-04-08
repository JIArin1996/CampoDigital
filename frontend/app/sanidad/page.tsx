"use client"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"

export default function SanidadPage() {
  const { establecimientoActivo } = useEstablecimiento()
  return (
    <PageContainer title="Sanidad">
      {!establecimientoActivo ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground text-sm">
          Seleccioná un establecimiento en el panel lateral.
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Módulo en construcción — próxima fase.</p>
      )}
    </PageContainer>
  )
}
