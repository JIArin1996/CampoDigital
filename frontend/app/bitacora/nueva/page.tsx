"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { EntradaForm } from "@/components/bitacora/EntradaForm"

export default function NuevaEntradaPage() {
  // useSearchParams necesita un Suspense alrededor
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <NuevaEntrada />
    </Suspense>
  )
}

function NuevaEntrada() {
  const loteInicial = useSearchParams().get("lote")
  const { establecimientoActivo, puedeOperar, cargando } = useEstablecimiento()

  const volver = loteInicial
    ? <VolverAlLote href={`/lotes/${loteInicial}`} />
    : <VolverAlLote href="/bitacora" texto="Volver a la bitácora" />

  if (cargando) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) return <PageContainer>{volver}<p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  if (!puedeOperar) return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso de carga en este establecimiento.</p></PageContainer>

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold mb-6">Nueva nota de bitácora</h1>
      <EntradaForm establecimientoId={establecimientoActivo.id} loteInicial={loteInicial} />
    </PageContainer>
  )
}
