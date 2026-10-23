"use client"

import { useEffect, useState } from "react"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getLotes, getStockLotes } from "@/lib/queries/lotes"
import { getEstadiasAbiertas, getPotreros } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { ListaPotreros } from "@/components/potreros/ListaPotreros"
import { PageContainer } from "@/components/layout/PageContainer"
import type { Estadia, Potrero } from "@/types/database"
import type { Lote, StockLote } from "@/types/lotes"

interface Datos {
  estId: string
  potreros: Potrero[]
  lotes: Lote[]
  stock: StockLote[]
  estadias: Map<string, Estadia>
}

export default function PotrerosPage() {
  const { establecimientoActivo, puedeOperar, cargando: cargandoCtx } = useEstablecimiento()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const estId = establecimientoActivo?.id

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([
      getPotreros(estId, { incluirInactivos: true }),
      getLotes(estId, "activo"),
      getStockLotes(estId),
      getEstadiasAbiertas(estId),
    ])
      .then(([potreros, lotes, stock, abiertas]) => {
        if (vigente) setDatos({ estId, potreros, lotes, stock, estadias: new Map(abiertas.map(e => [e.lote_id, e])) })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los potreros")) })
    return () => { vigente = false }
  }, [estId, version])

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
          Seleccioná un establecimiento para ver los potreros.
        </div>
      </PageContainer>
    )
  }

  const listos = datos?.estId === estId ? datos : null
  if (!listos) return <PageContainer>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : skeleton}</PageContainer>

  return (
    <PageContainer>
      <ListaPotreros
        establecimiento={establecimientoActivo}
        potreros={listos.potreros}
        lotes={listos.lotes}
        stock={listos.stock}
        estadias={listos.estadias}
        puedeOperar={puedeOperar}
        onRefresh={() => setVersion(v => v + 1)}
      />
    </PageContainer>
  )
}
