"use client"

import { useRouter } from "next/navigation"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { FormularioMovimiento } from "@/components/economia/FormularioMovimiento"

/**
 * Carga manual de un ingreso o un gasto (arrendamiento forestal, sueldos, insumos, impuestos...).
 * Las compras y ventas de animales no van acá: su plata se carga con la actividad.
 */
export default function NuevoMovimientoPage() {
  const router = useRouter()
  const { establecimientoActivo, puedeOperar, cargando } = useEstablecimiento()

  const volver = <VolverAlLote href="/economia" texto="Volver a economía" />
  if (cargando) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) return <PageContainer>{volver}<p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  if (!puedeOperar) return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso de carga en este establecimiento.</p></PageContainer>

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold">Cargar ingreso o gasto</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Las compras y ventas de animales se cargan con la actividad; acá va todo lo demás.
      </p>
      <FormularioMovimiento key={establecimientoActivo.id} establecimientoId={establecimientoActivo.id}
        onListo={() => router.push("/economia?pestana=movimientos")} onCancelar={() => router.back()} />
    </PageContainer>
  )
}
