"use client"

import { useEffect, useState } from "react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getPersonas } from "@/lib/queries/bitacora"
import { contarNovedades, registrarVisitaInicio } from "@/lib/queries/inicio"
import { getEspecies, getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Cargando } from "@/components/shared/Cargando"
import { DatosEstablecimiento } from "@/components/inicio/DatosEstablecimiento"
import { EstadoCampo } from "@/components/inicio/EstadoCampo"
import { ParaAtender } from "@/components/inicio/ParaAtender"
import { QuePaso } from "@/components/inicio/QuePaso"
import { hoyLocal } from "@/components/lotes/formato"
import type { Especie } from "@/types/lotes"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]

interface Datos {
  estId: string
  especies: Especie[]
  personas: Persona[]
  nombresLote: Map<string, string>
  activos: string[]
}

/**
 * Inicio: responde tres preguntas. ¿Cómo está el campo? (cabezas por especie y lo del mes), ¿qué hay que
 * atender? (una sola lista) y ¿qué pasó? (lo último que se cargó, con lo nuevo marcado). Una sola columna,
 * también en la computadora.
 */
export default function InicioPage() {
  const { perfil, establecimientoActivo, rolActivo, esAdmin, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id
  const yo = perfil?.id ?? null

  const [datos, setDatos] = useState<Datos | null>(null)
  const [visita, setVisita] = useState<{ estId: string; anterior: string | null; novedades: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([getEspecies(estId), getPersonas(estId), getLotes(estId, "activo"), getLotes(estId, "cerrado")])
      .then(([especies, personas, activos, cerrados]) => {
        if (!vigente) return
        setDatos({
          estId, especies, personas,
          nombresLote: new Map([...activos, ...cerrados].map(l => [l.id, l.nombre])),
          activos: activos.map(l => l.id),
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el inicio")) })
    return () => { vigente = false }
  }, [estId])

  // Última visita: si falla, el inicio se ve igual, sin el aviso ni los puntos
  useEffect(() => {
    if (!estId || !yo) return
    let vigente = true
    registrarVisitaInicio(estId)
      .then(async anterior => {
        const novedades = anterior ? await contarNovedades(estId, anterior, yo) : 0
        if (vigente) setVisita({ estId, anterior, novedades })
      })
      .catch(() => { if (vigente) setVisita({ estId, anterior: null, novedades: 0 }) })
    return () => { vigente = false }
  }, [estId, yo])

  if (cargando) {
    return <PageContainer><Cargando /></PageContainer>
  }

  const listos = datos && datos.estId === estId ? datos : null
  const laVisita = visita?.estId === estId ? visita : null
  const hoy = hoyLocal()
  // "Mías": con ficha de persona en este establecimiento y sin el rol Consulta
  const miPersonaId = listos && yo && rolActivo !== "consulta"
    ? listos.personas.find(p => p.user_id === yo && p.activo)?.id ?? null
    : null

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Hola{perfil ? `, ${perfil.nombre}` : ""}</h1>
        {establecimientoActivo ? (
          <DatosEstablecimiento establecimiento={establecimientoActivo} rol={rolActivo} puedeEditar={esAdmin} />
        ) : (
          <p className="text-muted-foreground mt-1">
            {esAdmin
              ? "Todavía no hay establecimientos. Creá el primero desde Configuraciones → Establecimientos."
              : "Todavía no tenés establecimientos asignados. Pedile acceso al administrador."}
          </p>
        )}
        {laVisita && laVisita.novedades > 0 && (
          <a href="#que-paso" className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">
            <span aria-hidden className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
            {laVisita.novedades} {laVisita.novedades === 1 ? "novedad" : "novedades"} desde tu última entrada
          </a>
        )}
      </div>

      {establecimientoActivo && estId && (
        <>
          {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
          {!listos ? (
            <div className="space-y-4">
              <div className="h-24 rounded-lg border bg-muted/30 animate-pulse" />
              <div className="h-40 rounded-lg border bg-muted/30 animate-pulse" />
            </div>
          ) : (
            <div className="space-y-8">
              <EstadoCampo estId={estId} especies={listos.especies} hoy={hoy} />
              <ParaAtender estId={estId} lotesActivos={listos.activos} nombresLote={listos.nombresLote} miPersonaId={miPersonaId} />
              <QuePaso estId={estId} anterior={laVisita?.anterior ?? null} yo={yo}
                personas={listos.personas} nombresLote={listos.nombresLote} />
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}
