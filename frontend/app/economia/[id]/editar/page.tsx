"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getMovimiento } from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { FormularioMovimiento } from "@/components/economia/FormularioMovimiento"

type Cargado = NonNullable<Awaited<ReturnType<typeof getMovimiento>>>

/** Editar un ingreso o gasto no anulado (quien puede cargar en su establecimiento). */
export default function EditarMovimientoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { puedeOperarEn, cargando } = useEstablecimiento()
  const [datos, setDatos] = useState<{ id: string; cargado: Cargado | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    getMovimiento(id)
      .then(cargado => { if (vigente) setDatos({ id, cargado }) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el movimiento")) })
    return () => { vigente = false }
  }, [id])

  const volver = <VolverAlLote href="/economia" texto="Volver a economía" />
  const listo = datos?.id === id ? datos : null
  if (error) return <PageContainer>{volver}<p role="alert" className="text-sm text-destructive">{error}</p></PageContainer>
  if (cargando || !listo) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>

  const m = listo.cargado?.movimiento
  if (!m) return <PageContainer>{volver}<p className="text-muted-foreground">No se encontró el movimiento.</p></PageContainer>
  if (!puedeOperarEn(m.establecimiento_id)) {
    return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso de carga en este establecimiento.</p></PageContainer>
  }
  if (m.anulado_en) return <PageContainer>{volver}<p className="text-muted-foreground">El movimiento está anulado: no se edita.</p></PageContainer>

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold">Editar {m.sentido === "ingreso" ? "ingreso" : "gasto"}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Los archivos se agregan y se quitan desde la lista de movimientos.</p>
      <FormularioMovimiento key={m.id} establecimientoId={m.establecimiento_id} inicial={listo.cargado!}
        onListo={() => router.push("/economia?pestana=movimientos")} onCancelar={() => router.back()} />
    </PageContainer>
  )
}
