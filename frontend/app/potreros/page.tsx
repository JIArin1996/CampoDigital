"use client"

import { useEffect, useState, useCallback } from "react"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { createClient } from "@/lib/supabase/client"
import { EstablecimientoDetalle } from "@/components/establecimientos/EstablecimientoDetalle"
import { PageContainer } from "@/components/layout/PageContainer"
import type { Potrero, Parcela } from "@/types/database"

export default function PotrerosPage() {
  const { establecimientoActivo, cargando: cargandoCtx } = useEstablecimiento()
  const [potreros, setPotreros] = useState<Potrero[]>([])
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [cargando, setCargando] = useState(false)

  const recargar = useCallback(async () => {
    if (!establecimientoActivo) return
    setCargando(true)
    const supabase = createClient()
    const [{ data: p }, { data: par }] = await Promise.all([
      supabase
        .from("potreros")
        .select("*")
        .eq("establecimiento_id", establecimientoActivo.id)
        .eq("estado", "activo")
        .order("nombre"),
      supabase
        .from("parcelas")
        .select("*")
        .eq("establecimiento_id", establecimientoActivo.id)
        .eq("estado", "activo")
        .order("nombre"),
    ])
    setPotreros((p ?? []) as Potrero[])
    setParcelas((par ?? []) as Parcela[])
    setCargando(false)
  }, [establecimientoActivo?.id])

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
          Seleccioná un establecimiento en el panel lateral para ver los potreros.
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
        parcelas={parcelas}
        onRefresh={recargar}
      />
    </PageContainer>
  )
}
