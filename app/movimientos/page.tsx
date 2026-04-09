"use client"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"
import { MovimientosClientWrapper } from "@/components/movimientos/MovimientosClientWrapper"

export default function MovimientosPage() {
  const { establecimientoActivo } = useEstablecimiento()
  
  return (
    <PageContainer title="Stock Ganadero">
      {!establecimientoActivo ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground text-sm">
          Seleccioná un establecimiento en el panel lateral para ver el stock.
        </div>
      ) : (
        <MovimientosClientWrapper />
      )}
    </PageContainer>
  )
}
