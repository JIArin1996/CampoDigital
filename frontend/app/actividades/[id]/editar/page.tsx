"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getActividadParaEditar, type ActividadParaEditar } from "@/lib/queries/actividades"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Cargando } from "@/components/shared/Cargando"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { esTipo6a } from "@/components/actividades/formato"
import { cargarDatosCarga, type DatosCarga } from "@/components/actividades/datosCarga"
import { FormularioConStock } from "@/components/actividades/FormularioConStock"
import { FormularioSinStock } from "@/components/actividades/FormularioSinStock"
import { FormularioDestete } from "@/components/actividades/FormularioDestete"
import type { TipoActividad6b1 } from "@/types/actividades"

const SIN_STOCK: TipoActividad6b1[] = ["sanidad", "servicio", "diagnostico_gestacion", "esquila", "personalizada"]

// Editar una actividad: el mismo formulario de carga, con los datos actuales (administrador y operador)
export default function EditarActividadPage() {
  const { id } = useParams<{ id: string }>()
  const { puedeOperarEn, cargando } = useEstablecimiento()
  const [carga, setCarga] = useState<{ edicion: ActividadParaEditar; datos: DatosCarga } | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    getActividadParaEditar(id)
      .then(async edicion => {
        if (!edicion) return null
        const a = edicion.actividad
        const lotes = [...new Set([...(a.lotes ?? []), a.lote_id, a.lote_cria_id].filter((x): x is string => !!x))]
        return { edicion, datos: await cargarDatosCarga(a.establecimiento_id, lotes) }
      })
      .then(c => { if (vigente) setCarga(c) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar la actividad")) })
    return () => { vigente = false }
  }, [id])

  const volver = <VolverAlLote href={`/actividades/${id}`} texto="Volver a la actividad" />

  if (error) return <PageContainer>{volver}<p role="alert" className="text-sm text-destructive">{error}</p></PageContainer>
  if (carga === undefined || cargando) {
    return <PageContainer>{volver}<Cargando /></PageContainer>
  }
  if (!carga) return <PageContainer>{volver}<p className="text-muted-foreground">No se encontró la actividad.</p></PageContainer>

  const { edicion, datos } = carga
  const tipo = edicion.actividad.tipo
  if (!puedeOperarEn(edicion.actividad.establecimiento_id)) {
    return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso para editar actividades en este establecimiento.</p></PageContainer>
  }

  return (
    <PageContainer>
      {volver}
      {esTipo6a(tipo) ? (
        <FormularioConStock tipo={tipo} loteInicial="" datos={datos} edicion={edicion} />
      ) : tipo === "destete" ? (
        <FormularioDestete loteInicial="" datos={datos} edicion={edicion} />
      ) : SIN_STOCK.includes(tipo as TipoActividad6b1) ? (
        <FormularioSinStock tipo={tipo as TipoActividad6b1} loteInicial="" datos={datos} edicion={edicion} />
      ) : (
        <p className="text-muted-foreground">Este tipo de actividad no se edita desde acá.</p>
      )}
    </PageContainer>
  )
}
