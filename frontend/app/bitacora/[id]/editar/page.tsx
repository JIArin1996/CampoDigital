"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getEntrada } from "@/lib/queries/bitacora"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { EntradaForm } from "@/components/bitacora/EntradaForm"
import type { EntradaConLotes } from "@/types/bitacora"

export default function EditarEntradaPage() {
  const { id } = useParams<{ id: string }>()
  const { puedeOperarEn, cargando } = useEstablecimiento()
  const [entrada, setEntrada] = useState<EntradaConLotes | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    getEntrada(id)
      .then(e => { if (vigente) setEntrada(e) })
      .catch(err => { if (vigente) { setEntrada(null); setError(mensajeDeError(err, "No se pudo cargar la entrada")) } })
    return () => { vigente = false }
  }, [id])

  const volver = <VolverAlLote href="/bitacora" texto="Volver a la bitácora" />

  if (entrada === undefined || cargando) {
    return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }
  if (!entrada) {
    return <PageContainer>{volver}<p className="text-muted-foreground">{error ?? "No se encontró la entrada."}</p></PageContainer>
  }
  if (!puedeOperarEn(entrada.establecimiento_id)) {
    return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso de carga en este establecimiento.</p></PageContainer>
  }
  if (entrada.anulada_en) {
    return <PageContainer>{volver}<p className="text-muted-foreground">La entrada está anulada: restaurala desde la bitácora para poder editarla.</p></PageContainer>
  }

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold mb-6">Editar entrada</h1>
      <EntradaForm establecimientoId={entrada.establecimiento_id} inicial={entrada} />
    </PageContainer>
  )
}
