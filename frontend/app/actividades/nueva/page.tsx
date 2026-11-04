"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { DESCRIPCION_ACTIVIDAD, ETIQUETA_ACTIVIDAD, TIPOS_6A, TIPOS_6B1, esTipo6a, esTipoCargable } from "@/components/actividades/formato"
import { cargarDatosCarga, type DatosCarga } from "@/components/actividades/datosCarga"
import { FormularioConStock } from "@/components/actividades/FormularioConStock"
import { FormularioSinStock } from "@/components/actividades/FormularioSinStock"
import { FormularioDestete } from "@/components/actividades/FormularioDestete"
import { ACTIVIDAD, coloresActividad } from "@/components/actividades/actividad-iconos"
import type { TipoCargable } from "@/types/actividades"

export default function NuevaActividadPage() {
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <NuevaActividad />
    </Suspense>
  )
}

function NuevaActividad() {
  const params = useSearchParams()
  const tipoParam = params.get("tipo")
  const loteParam = params.get("lote") ?? ""
  const { establecimientoActivo, puedeOperar, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  const [datos, setDatos] = useState<DatosCarga | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    cargarDatosCarga(estId)
      .then(d => { if (vigente) setDatos(d) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los datos")) })
    return () => { vigente = false }
  }, [estId])

  const volver = loteParam
    ? <VolverAlLote href={`/lotes/${loteParam}`} />
    : <VolverAlLote href="/actividades" texto="Volver a actividades" />

  if (cargando) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) {
    return <PageContainer>{volver}<p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  }
  if (!puedeOperar) {
    return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso de carga en este establecimiento.</p></PageContainer>
  }

  // Sin tipo: elegir qué se carga
  if (!esTipoCargable(tipoParam)) {
    const opcion = (t: TipoCargable) => {
      const Icono = ACTIVIDAD[t].icono
      const href = `/actividades/nueva?tipo=${t}${loteParam ? `&lote=${loteParam}` : ""}`
      return (
        <li key={t}>
          <Link href={href} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-3 hover:bg-muted active:bg-muted">
            <span style={coloresActividad(t)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--f)] text-[var(--c)]">
              <Icono className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{ETIQUETA_ACTIVIDAD[t]}</span>
              <span className="block text-sm text-muted-foreground">{DESCRIPCION_ACTIVIDAD[t]}</span>
            </span>
          </Link>
        </li>
      )
    }
    return (
      <PageContainer>
        {volver}
        <h1 className="text-2xl font-bold mb-4">¿Qué actividad cargás?</h1>
        <div className="space-y-5 max-w-xl">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">Cambian el stock o lo miden</h2>
            <ul className="space-y-2">{[...TIPOS_6A, "destete" as const].map(opcion)}</ul>
          </section>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">Manejo y sanidad</h2>
            <ul className="space-y-2">{TIPOS_6B1.map(opcion)}</ul>
          </section>
        </div>
      </PageContainer>
    )
  }

  if (error) return <PageContainer>{volver}<p role="alert" className="text-sm text-destructive">{error}</p></PageContainer>
  if (!datos || datos.estId !== estId) {
    return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }

  // key: un formulario nuevo (con su propio id) por tipo y lote de entrada
  return (
    <PageContainer>
      {volver}
      {esTipo6a(tipoParam) ? (
        <FormularioConStock key={`${tipoParam}:${loteParam}`} tipo={tipoParam} loteInicial={loteParam} datos={datos} />
      ) : tipoParam === "destete" ? (
        <FormularioDestete key={loteParam} loteInicial={loteParam} datos={datos} />
      ) : (
        <FormularioSinStock key={`${tipoParam}:${loteParam}`} tipo={tipoParam} loteInicial={loteParam} datos={datos} />
      )}
    </PageContainer>
  )
}
