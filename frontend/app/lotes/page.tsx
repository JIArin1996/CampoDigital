"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Layers, ChevronRight, Merge } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getCategorias, getEspecies, getLotes, getStockEstablecimiento, getStockLotes } from "@/lib/queries/lotes"
import { getPotreros } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { StockPorCategoria } from "@/components/lotes/StockPorCategoria"
import { fechaCorta } from "@/components/lotes/formato"
import type { Potrero } from "@/types/database"
import type { CategoriaAnimal, Especie, EstadoLote, Lote, StockEstablecimiento, StockLote } from "@/types/lotes"

interface Datos {
  clave: string   // establecimiento + estado: si cambia, los datos guardados ya no sirven
  especies: Especie[]
  categorias: CategoriaAnimal[]
  lotes: Lote[]
  potreros: Potrero[]
  stockLotes: StockLote[]
  stockEstablecimiento: StockEstablecimiento[]
}

export default function LotesPage() {
  const { establecimientoActivo, puedeOperar, cargando: cargandoCtx } = useEstablecimiento()
  const [estado, setEstado] = useState<EstadoLote>("activo")
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  const estId = establecimientoActivo?.id
  const clave = `${estId}:${estado}`

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([
      getEspecies(estId),
      getCategorias(estId),
      getLotes(estId, estado),
      getPotreros(estId),
      getStockLotes(estId),
      getStockEstablecimiento(estId),
    ])
      .then(([especies, categorias, lotes, potreros, stockLotes, stockEstablecimiento]) => {
        if (vigente) setDatos({ clave: `${estId}:${estado}`, especies, categorias, lotes, potreros, stockLotes, stockEstablecimiento })
      })
      .catch(err => {
        if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los lotes"))
      })
    return () => { vigente = false }
  }, [estId, estado])

  if (cargandoCtx) return <PageContainer><Esqueleto /></PageContainer>

  if (!establecimientoActivo) {
    return (
      <PageContainer>
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground text-sm">
          Seleccioná un establecimiento para ver los lotes.
        </div>
      </PageContainer>
    )
  }

  const listo = datos && datos.clave === clave ? datos : null
  const nombreEspecie = (id: string) => listo?.especies.find(e => e.id === id)?.nombre ?? ""
  const nombrePotrero = (id: string | null) => (id ? listo?.potreros.find(p => p.id === id)?.nombre ?? null : null)

  return (
    <PageContainer>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Lotes</h1>
        {puedeOperar && (
          <div className="flex gap-2">
            <Link href="/lotes/unir" className={buttonVariants({ variant: "outline", className: "h-11 md:h-8" })}>
              <Merge className="h-4 w-4 mr-1" />
              Unir
            </Link>
            <Link href="/lotes/nuevo" className={buttonVariants({ className: "h-11 md:h-8" })}>
              <Plus className="h-4 w-4 mr-1" />
              Nuevo lote
            </Link>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {!listo ? (
        <Esqueleto />
      ) : (
        <div className="space-y-8">

          {/* Stock del establecimiento (solo lotes activos) */}
          {estado === "activo" && (
            <section className="space-y-3">
              <h2 className="font-semibold">Stock del establecimiento</h2>
              {listo.especies.map(especie => {
                const filas = listo.stockEstablecimiento.filter(s => s.especie_id === especie.id)
                if (filas.length === 0) return null
                return (
                  <Card key={especie.id}>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-base">{especie.nombre}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <StockPorCategoria
                        filas={filas}
                        categorias={listo.categorias.filter(c => c.especie_id === especie.id)}
                      />
                    </CardContent>
                  </Card>
                )
              })}
              {listo.stockEstablecimiento.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay animales cargados.</p>
              )}
            </section>
          )}

          {/* Lotes */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{estado === "activo" ? "Lotes activos" : "Lotes cerrados"}</h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 md:h-8"
                onClick={() => setEstado(estado === "activo" ? "cerrado" : "activo")}
              >
                {estado === "activo" ? "Ver cerrados" : "Ver activos"}
              </Button>
            </div>

            {listo.lotes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Layers className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {estado === "activo" ? "No hay lotes activos" : "No hay lotes cerrados"}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {listo.lotes.map(lote => {
                  const total = listo.stockLotes
                    .filter(s => s.lote_id === lote.id)
                    .reduce((sum, s) => sum + s.cabezas, 0)
                  const potrero = nombrePotrero(lote.potrero_id)
                  return (
                    <li key={lote.id}>
                      <Link
                        href={`/lotes/${lote.id}`}
                        className="flex items-center gap-3 rounded-lg border bg-card px-4 py-4 active:bg-muted/50 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{lote.nombre}</p>
                          <p className="text-sm text-muted-foreground">
                            {[nombreEspecie(lote.especie_id), potrero, `desde ${fechaCorta(lote.fecha_apertura)}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xl font-bold tabular-nums leading-none">{total}</p>
                          <p className="text-xs text-muted-foreground">cabezas</p>
                        </div>
                        {lote.campana && <Badge variant="outline" className="hidden sm:inline-flex">{lote.campana}</Badge>}
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  )
}

function Esqueleto() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />
      ))}
    </div>
  )
}
