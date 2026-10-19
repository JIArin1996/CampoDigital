"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, ArrowRightLeft, ChevronRight, ClipboardList, Merge, SlidersHorizontal, Split } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getCambiosEstadoLote, getCategorias, getEspecies, getEventosLote, getLote, getStockLote } from "@/lib/queries/lotes"
import { getPotreros } from "@/lib/queries/potreros"
import { getCarencias } from "@/lib/queries/actividades"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StockPorCategoria } from "@/components/lotes/StockPorCategoria"
import { AjusteForm } from "@/components/lotes/AjusteForm"
import { LinajeLote } from "@/components/lotes/LinajeLote"
import { BitacoraDelLote } from "@/components/bitacora/BitacoraDelLote"
import { ETIQUETA_EVENTO, fechaCorta, hoyLocal } from "@/components/lotes/formato"
import { AvisoCarencia } from "@/components/actividades/AvisoCarencia"
import type { Carencia } from "@/types/actividades"
import type { Potrero } from "@/types/database"
import type { CambioEstadoLote, CategoriaAnimal, Especie, Lote, LoteEvento, StockLote } from "@/types/lotes"

interface Ficha {
  clave: string
  lote: Lote | null
  especies: Especie[]
  categorias: CategoriaAnimal[]
  potreros: Potrero[]
  stock: StockLote[]
  eventos: LoteEvento[]
  cambios: CambioEstadoLote[]
  carencias: Carencia[]
}

export default function LotePage() {
  const { id } = useParams<{ id: string }>()
  const { puedeOperarEn, cargando: cargandoCtx } = useEstablecimiento()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)   // sube para recargar después de un ajuste
  const [ajusteAbierto, setAjusteAbierto] = useState(false)

  useEffect(() => {
    let vigente = true
    const clave = `${id}:${version}`
    getLote(id)
      .then(async lote => {
        if (!lote) return { clave, lote: null, especies: [], categorias: [], potreros: [], stock: [], eventos: [], cambios: [], carencias: [] }
        const [especies, categorias, potreros, stock, eventos, cambios, carencias] = await Promise.all([
          getEspecies(lote.establecimiento_id),
          getCategorias(lote.establecimiento_id),
          getPotreros(lote.establecimiento_id),
          getStockLote(lote.id),
          getEventosLote(lote.id),
          getCambiosEstadoLote(lote.id),
          getCarencias([lote.id], hoyLocal()),
        ])
        return { clave, lote, especies, categorias, potreros, stock, eventos, cambios, carencias }
      })
      .then(datos => {
        if (vigente) setFicha(datos)
      })
      .catch(err => {
        if (vigente) setError(mensajeDeError(err, "No se pudo cargar el lote"))
      })
    return () => { vigente = false }
  }, [id, version])

  const volver = (
    <Link href="/lotes" className="inline-flex items-center gap-1.5 h-10 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="h-4 w-4" /> Volver a lotes
    </Link>
  )

  // Mientras recarga después de un ajuste se sigue mostrando la ficha anterior
  const vigente = ficha && ficha.clave.startsWith(`${id}:`) ? ficha : null

  if (error && !vigente) {
    return <PageContainer>{volver}<p role="alert" className="text-sm text-destructive">{error}</p></PageContainer>
  }

  if (!vigente || cargandoCtx) {
    return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }

  const { lote } = vigente
  if (!lote) {
    return <PageContainer>{volver}<p className="text-muted-foreground">No se encontró el lote.</p></PageContainer>
  }

  const puedeOperar = puedeOperarEn(lote.establecimiento_id)
  const especie = vigente.especies.find(e => e.id === lote.especie_id)
  const categoriasEspecie = vigente.categorias.filter(c => c.especie_id === lote.especie_id)
  const potrero = vigente.potreros.find(p => p.id === lote.potrero_id)
  const nombreCategoria = (catId: string) => vigente.categorias.find(c => c.id === catId)?.nombre ?? "—"
  const stockActual = new Map(vigente.stock.map(s => [s.categoria_id, s.cabezas]))
  const ultimoCierre = vigente.cambios.find(c => c.tipo === "cierre")
  const operable = puedeOperar && lote.estado === "activo"
  const accion = buttonVariants({ variant: "outline", className: "h-auto flex-col gap-1 py-3 text-sm" })

  return (
    <PageContainer>
      {volver}

      {/* Encabezado */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">{lote.nombre}</h1>
          {lote.estado === "cerrado" && <Badge variant="secondary">cerrado</Badge>}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {[
            especie?.nombre,
            potrero?.nombre,
            lote.campana ? `campaña ${lote.campana}` : null,
            `desde ${fechaCorta(lote.fecha_apertura)}`,
            lote.fecha_cierre ? `cerrado el ${fechaCorta(lote.fecha_cierre)}` : null,
          ].filter(Boolean).join(" · ")}
        </p>
        {lote.notas && <p className="text-sm mt-2">{lote.notas}</p>}
        {lote.estado === "cerrado" && ultimoCierre?.motivo && (
          <p className="text-sm mt-2 text-muted-foreground">Motivo del cierre: {ultimoCierre.motivo}</p>
        )}
      </div>

      {/* Carencia vigente (aviso; la venta también lo muestra) */}
      {lote.estado === "activo" && vigente.carencias.length > 0 && (
        <div className="mb-6">
          <AvisoCarencia carencias={vigente.carencias}
            texto={`En carencia hasta el ${fechaCorta(vigente.carencias.reduce((m, c) => (c.fin_carencia > m ? c.fin_carencia : m), ""))}`} />
        </div>
      )}

      {/* Operaciones de lote */}
      {operable && (
        <nav aria-label="Operaciones del lote" className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          <Link href={`/actividades/nueva?lote=${lote.id}`} className={accion}>
            <ClipboardList className="h-5 w-5" />
            Actividad
          </Link>
          <Link href={`/lotes/${lote.id}/dividir`} className={accion}>
            <Split className="h-5 w-5" />
            Dividir
          </Link>
          <Link href={`/lotes/${lote.id}/recategorizar`} className={accion}>
            <ArrowRightLeft className="h-5 w-5" />
            Recategorizar
          </Link>
          <Link href={`/lotes/unir?lote=${lote.id}`} className={accion}>
            <Merge className="h-5 w-5" />
            Unir
          </Link>
        </nav>
      )}

      <div className="space-y-6">
        {/* Stock actual */}
        <Card>
          <CardHeader className="pb-1 flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Stock actual</CardTitle>
            {puedeOperar && lote.estado === "activo" && (
              <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={() => setAjusteAbierto(true)}>
                <SlidersHorizontal className="h-4 w-4 mr-1" />
                Ajustar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <StockPorCategoria filas={vigente.stock} categorias={categoriasEspecie} />
          </CardContent>
        </Card>

        {/* Linaje: de qué lotes viene y en cuáles terminó */}
        <LinajeLote loteId={lote.id} version={version} />

        {/* Bitácora del lote */}
        <BitacoraDelLote
          establecimientoId={lote.establecimiento_id}
          loteId={lote.id}
          puedeOperar={puedeOperar}
        />

        {/* Historial */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Historial</h2>
            <Link href={`/actividades?lote=${lote.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary min-h-11">
              Actividades <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          {vigente.eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos.</p>
          ) : (
            <ul className="rounded-lg border divide-y bg-card">
              {vigente.eventos.map(ev => (
                <li key={ev.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {ETIQUETA_EVENTO[ev.tipo]} · {nombreCategoria(ev.categoria_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">{fechaCorta(ev.fecha)}</p>
                    {ev.nota && <p className="text-sm text-muted-foreground mt-0.5">{ev.nota}</p>}
                  </div>
                  <span
                    className={`text-base font-semibold tabular-nums shrink-0 ${ev.cabezas < 0 ? "text-destructive" : ""}`}
                  >
                    {ev.cabezas > 0 ? `+${ev.cabezas}` : ev.cabezas}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Ajuste de stock */}
      <Dialog open={ajusteAbierto} onOpenChange={setAjusteAbierto}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajustar stock</DialogTitle>
            <DialogDescription>
              Los movimientos no se editan: un error se corrige sumando o restando cabezas, con su motivo.
            </DialogDescription>
          </DialogHeader>
          <AjusteForm
            loteId={lote.id}
            categorias={categoriasEspecie}
            stockActual={stockActual}
            onSuccess={() => {
              setAjusteAbierto(false)
              setVersion(v => v + 1)
            }}
            onCancel={() => setAjusteAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
