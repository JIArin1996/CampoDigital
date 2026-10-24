"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getAportes, getIndicadores } from "@/lib/queries/indicadores"
import { getEspecies, getLotesPorIds } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { colorDeEspecie } from "@/components/lotes/agrupacion"
import { fechaCorta } from "@/components/lotes/formato"
import type { Especie } from "@/types/lotes"
import type { AporteIndicador, Indicadores, TipoAporte } from "@/types/indicadores"

// "2025/26" (la temporada va de julio a junio)
const etiquetaTemporada = (t: number | null) => (t === null ? "Sin servicio registrado" : `Temporada ${t}/${String(t + 1).slice(2)}`)
const porcentaje = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} %`)

const ETIQUETA_APORTE: Record<TipoAporte, string> = {
  servicio: "Servicio",
  diagnostico_gestacion: "Diagnóstico",
  paricion: "Parición",
  destete: "Destete",
}

/**
 * Indicadores reproductivos por especie y temporada: % preñez, parición y destete sobre las
 * vacas entoradas. Cada temporada tiene su detalle (qué actividades suman en cada número).
 */
export default function IndicadoresPage() {
  const { establecimientoActivo, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id
  const [datos, setDatos] = useState<{ estId: string; filas: Indicadores[]; especies: Especie[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([getIndicadores(estId), getEspecies(estId)])
      .then(([filas, especies]) => { if (vigente) setDatos({ estId, filas, especies }) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los indicadores")) })
    return () => { vigente = false }
  }, [estId])

  if (cargando || (estId && !datos && !error)) {
    return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }
  if (!establecimientoActivo) {
    return <PageContainer><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  }
  if (error) return <PageContainer><p role="alert" className="text-sm text-destructive">{error}</p></PageContainer>

  const listos = datos && datos.estId === estId ? datos : null
  const porEspecie = (listos?.especies ?? [])
    .map(e => ({ especie: e, filas: listos!.filas.filter(f => f.especie_id === e.id) }))
    .filter(g => g.filas.length > 0)

  return (
    <PageContainer>
      <h1 className="text-2xl font-bold">Indicadores reproductivos</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Sobre las vacas entoradas de cada temporada (de julio a junio, según la fecha del servicio).
      </p>

      {porEspecie.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay datos. Los indicadores salen de los servicios, diagnósticos, pariciones y destetes que se cargan en{" "}
          <Link href="/actividades" className="text-primary font-medium">Actividades</Link>.
        </p>
      ) : (
        <div className="space-y-8 max-w-3xl">
          {porEspecie.map(({ especie, filas }) => (
            <section key={especie.id} className="space-y-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorDeEspecie(especie) }} />
                {especie.nombre}
              </h2>
              {filas.map(f => <TarjetaTemporada key={String(f.temporada)} fila={f} estId={estId!} />)}
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  )
}

function TarjetaTemporada({ fila, estId }: { fila: Indicadores; estId: string }) {
  const [abierto, setAbierto] = useState(false)
  const [detalle, setDetalle] = useState<{ aportes: AporteIndicador[]; lotes: Map<string, string> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sinServicio = fila.temporada === null

  const alternar = async () => {
    setAbierto(a => !a)
    if (detalle || abierto) return
    try {
      const aportes = await getAportes(estId, fila.especie_id, fila.temporada)
      const lotes = await getLotesPorIds([...new Set(aportes.map(a => a.lote_id))])
      setDetalle({ aportes, lotes: new Map(lotes.map(l => [l.id, l.nombre])) })
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo cargar el detalle"))
    }
  }

  const dato = (titulo: string, pct: number | null, cuenta: number) => (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-bold tabular-nums">{porcentaje(pct)}</p>
      <p className="text-xs text-muted-foreground tabular-nums">{cuenta} de {fila.entoradas}</p>
    </div>
  )

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{etiquetaTemporada(fila.temporada)}</h3>
          {!sinServicio && <span className="text-sm text-muted-foreground tabular-nums">{fila.entoradas} entoradas</span>}
        </div>

        {sinServicio ? (
          <p className="text-sm text-muted-foreground">
            Estas actividades no tienen un servicio cargado en el lote (o en los lotes de los que viene) en los 450 días anteriores,
            así que no suman a ninguna temporada: {[
              fila.prenadas > 0 && `${fila.prenadas} preñadas`,
              fila.nacidas_vivas > 0 && `${fila.nacidas_vivas} crías nacidas`,
              fila.destetadas > 0 && `${fila.destetadas} destetadas`,
            ].filter(Boolean).join(", ") || "sin cabezas"}. Cargá el servicio para que cuenten.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {dato("Preñez", fila.pct_prenez, fila.prenadas)}
              {dato("Parición", fila.pct_paricion, fila.nacidas_vivas)}
              {dato("Destete", fila.pct_destete, fila.destetadas)}
            </div>
            <p className="text-xs text-muted-foreground">
              {fila.diagnosticadas > 0 ? `${fila.diagnosticadas} diagnosticadas` : "Sin diagnóstico"}
              {fila.nacidas_muertas > 0 && ` · ${fila.nacidas_muertas} nacidas muertas (no cuentan en el %)`}
            </p>
          </>
        )}

        {fila.destete_mixto && (
          <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>Caso mixto:</strong> un destete sacó crías de pariciones de dos temporadas y se contó entero en esta (la de la
              parición más antigua). Por eso el % de destete puede pasar de 100 acá y quedar bajo en la otra.
            </span>
          </p>
        )}

        <Button type="button" variant="ghost" size="sm" className="h-10 md:h-8 px-0 text-primary" onClick={() => void alternar()}>
          {abierto ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
          {abierto ? "Ocultar detalle" : "Ver detalle"}
        </Button>

        {abierto && (
          error ? <p role="alert" className="text-sm text-destructive">{error}</p>
          : !detalle ? <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
          : (
            <ul className="rounded-lg border divide-y text-sm">
              {detalle.aportes.map(a => (
                <li key={`${a.actividad_id}:${a.lote_id}`} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 ${a.cuenta ? "" : "text-muted-foreground"}`}>
                  <span className="min-w-0">
                    <Link href={`/actividades/${a.actividad_id}`} className="font-medium text-primary">{ETIQUETA_APORTE[a.tipo]}</Link>
                    {" · "}{fechaCorta(a.fecha)} · {detalle.lotes.get(a.lote_id) ?? "lote"}
                  </span>
                  <span className="tabular-nums">
                    {a.tipo === "servicio" && `${a.entoradas} entoradas${a.cuenta ? "" : " (repaso: no se suma)"}`}
                    {a.tipo === "diagnostico_gestacion" && `${a.prenadas} de ${a.diagnosticadas} preñadas${a.cuenta ? "" : " (hay uno posterior: no se suma)"}`}
                    {a.tipo === "paricion" && `${a.nacidas_vivas} vivas${a.nacidas_muertas > 0 ? `, ${a.nacidas_muertas} muertas` : ""}`}
                    {a.tipo === "destete" && `${a.destetadas} destetadas${a.mixto ? " (mixto)" : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}
      </CardContent>
    </Card>
  )
}
