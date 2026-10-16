"use client"

import { useEffect, useState, useCallback } from "react"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getPotreros } from "@/lib/queries/potreros"
import { EstablecimientoDetalle } from "@/components/establecimientos/EstablecimientoDetalle"
import { PageContainer } from "@/components/layout/PageContainer"
import type { Potrero } from "@/types/database"

export default function PotrerosPage() {
  const { establecimientoActivo, esEditor, cargando: cargandoCtx } = useEstablecimiento()
  const [potreros, setPotreros] = useState<Potrero[]>([])
  const [cargando, setCargando] = useState(false)

  const establecimientoId = establecimientoActivo?.id

  const recargar = useCallback(async () => {
    if (!establecimientoId) return
    setCargando(true)
    try {
      setPotreros(await getPotreros(establecimientoId))
    } catch (error) {
      console.error("Error cargando potreros:", error)
      setPotreros([])
    } finally {
      setCargando(false)
    }
  }, [establecimientoId])

  useEffect(() => {
    recargar()
  }, [recargar])

  const skeleton = (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />
      ))}
    </div>
  )

  if (cargandoCtx) return <PageContainer>{skeleton}</PageContainer>

  if (!establecimientoActivo) {
    return (
      <PageContainer>
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground text-sm">
          Seleccioná un establecimiento para ver los potreros.
        </div>
      </PageContainer>
    )
  }

  if (cargando) return <PageContainer>{skeleton}</PageContainer>

  return (
    <PageContainer>
      <EstablecimientoDetalle
        establecimiento={establecimientoActivo}
        potreros={potreros}
        esEditor={esEditor}
        onRefresh={recargar}
      />
    </PageContainer>
  )
}
