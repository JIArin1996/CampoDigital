"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getEntrada } from "@/lib/queries/bitacora"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { EntradaForm } from "@/components/bitacora/EntradaForm"
import type { EntradaConLotes } from "@/types/bitacora"

export default function NuevaEntradaPage() {
  // useSearchParams necesita un Suspense alrededor
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <NuevaEntrada />
    </Suspense>
  )
}

// ?lote=<id>: desde la ficha de un lote; ?tipo=tarea: desde el "+" o el Calendario (?vence=<fecha>: desde un día);
// ?origen=<id>: "Crear tarea" desde otra nota
function NuevaEntrada() {
  const params = useSearchParams()
  const loteInicial = params.get("lote")
  const origenId = params.get("origen")
  const tipoInicial = params.get("tipo") === "tarea" ? "tarea" : null
  const venceInicial = /^\d{4}-\d{2}-\d{2}$/.test(params.get("vence") ?? "") ? params.get("vence") : null
  const { establecimientoActivo, puedeOperar, cargando } = useEstablecimiento()
  const [origen, setOrigen] = useState<{ id: string; entrada: EntradaConLotes | null; error?: string } | null>(null)

  useEffect(() => {
    if (!origenId) return
    let vigente = true
    getEntrada(origenId)
      .then(entrada => { if (vigente) setOrigen({ id: origenId, entrada }) })
      .catch(err => { if (vigente) setOrigen({ id: origenId, entrada: null, error: mensajeDeError(err, "No se pudo cargar la nota") }) })
    return () => { vigente = false }
  }, [origenId])

  const esTarea = tipoInicial === "tarea" || !!origenId
  const volver = loteInicial
    ? <VolverAlLote href={`/lotes/${loteInicial}`} />
    : <VolverAlLote href="/bitacora" texto="Volver a la bitácora" />

  const cargandoOrigen = !!origenId && origen?.id !== origenId
  if (cargando || cargandoOrigen) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) return <PageContainer>{volver}<p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  if (!puedeOperar) return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso de carga en este establecimiento.</p></PageContainer>
  if (origenId && (!origen?.entrada || origen.entrada.anulada_en || origen.entrada.tipo === "tarea")) {
    return <PageContainer>{volver}<p className="text-muted-foreground">{origen?.error ?? "No se puede crear una tarea desde esa nota."}</p></PageContainer>
  }

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold mb-6">{esTarea ? "Nueva tarea" : "Nueva nota de bitácora"}</h1>
      <EntradaForm establecimientoId={establecimientoActivo.id} loteInicial={loteInicial} tipoInicial={tipoInicial} venceInicial={venceInicial}
        origen={origen?.entrada ?? null} />
    </PageContainer>
  )
}
