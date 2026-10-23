"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Layers, Merge } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getCategorias, getEspecies, getLotes, getStockLotes } from "@/lib/queries/lotes"
import { getEstadiasAbiertas, getPotreros } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button, buttonVariants } from "@/components/ui/button"
import { TarjetaLote } from "@/components/lotes/TarjetaLote"
import { StockPorEspecie } from "@/components/lotes/StockPorEspecie"
import { CambiarPotreroDialog } from "@/components/potreros/CambiarPotreroDialog"
import { ORDEN_CLASE, claseDeLote, colorDeEspecie, ordenarEspecies, separarCrias } from "@/components/lotes/agrupacion"
import type { Estadia, Potrero } from "@/types/database"
import type { CategoriaAnimal, Especie, EstadoLote, Lote, StockLote } from "@/types/lotes"

interface Datos {
  clave: string   // establecimiento + estado: si cambia, los datos guardados ya no sirven
  especies: Especie[]
  categorias: CategoriaAnimal[]
  lotes: Lote[]
  potreros: Potrero[]
  stockLotes: StockLote[]
  estadias: Map<string, Estadia>   // estadía abierta de cada lote
}

// Un lote de una especie que ya no está en el catálogo activo va al grupo "Otras"
const ESPECIE_DESCONOCIDA = { id: "", nombre: "Otra especie", grupo: "otro" as const, color: null }

export default function LotesPage() {
  const { establecimientoActivo, puedeOperar, cargando: cargandoCtx } = useEstablecimiento()
  const [estado, setEstado] = useState<EstadoLote>("activo")
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [moviendo, setMoviendo] = useState<Lote | null>(null)   // lote del diálogo de cambio de potrero

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
      getEstadiasAbiertas(estId),
    ])
      .then(([especies, categorias, lotes, potreros, stockLotes, abiertas]) => {
        if (vigente) setDatos({
          clave: `${estId}:${estado}`, especies, categorias, lotes, potreros, stockLotes,
          estadias: new Map(abiertas.map(e => [e.lote_id, e])),
        })
      })
      .catch(err => {
        if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los lotes"))
      })
    return () => { vigente = false }
  }, [estId, estado, version])

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

      <div className="space-y-8">
        {/* Lotes, agrupados por especie */}
        <section className="space-y-4">
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

          {!listo ? (
            <Esqueleto />
          ) : listo.lotes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Layers className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                {estado === "activo" ? "No hay lotes activos" : "No hay lotes cerrados"}
              </p>
            </div>
          ) : (
            <LotesPorEspecie datos={listo} onCambiarPotrero={puedeOperar ? setMoviendo : undefined} />
          )}
        </section>

        {/* Stock por especie (solo lotes activos) */}
        {estado === "activo" && (
          <section className="space-y-3">
            <h2 className="font-semibold">Stock por especie</h2>
            {!listo ? (
              <Esqueleto filas={2} />
            ) : (
              <StockPorEspecie lotes={listo.lotes} stock={listo.stockLotes} potreros={listo.potreros}
                especies={listo.especies} categorias={listo.categorias} />
            )}
          </section>
        )}
      </div>

      {listo && moviendo && (
        <CambiarPotreroDialog key={moviendo.id} abierto onCerrar={() => setMoviendo(null)}
          onHecho={() => { setMoviendo(null); setVersion(v => v + 1) }}
          lotes={[moviendo]} potreros={listo.potreros} estadias={listo.estadias} />
      )}
    </PageContainer>
  )
}

/**
 * Lotes agrupados por especie (Bovinos, Ovinos, Otros). Activos: dentro de cada especie, por
 * clase del lote (cría, recría, engorde, toros, otras) y de mayor a menor cantidad de cabezas.
 * Cerrados: del cierre más reciente al más viejo.
 */
function LotesPorEspecie({ datos, onCambiarPotrero }: { datos: Datos; onCambiarPotrero?: (lote: Lote) => void }) {
  const { especies, categorias, lotes, potreros, stockLotes, estadias } = datos

  const filas = lotes.map(lote => {
    const stock = stockLotes.filter(s => s.lote_id === lote.id)
    return {
      lote,
      cabezas: stock.reduce((s, x) => s + x.cabezas, 0),
      separadas: separarCrias(stock, categorias),
      clase: claseDeLote(stock, categorias),
      potrero: lote.potrero_id ? potreros.find(p => p.id === lote.potrero_id)?.nombre ?? null : null,
    }
  })

  const grupos = [...ordenarEspecies(especies), ESPECIE_DESCONOCIDA]
    .map(especie => {
      const delGrupo = filas.filter(f =>
        especie.id ? f.lote.especie_id === especie.id : !especies.some(e => e.id === f.lote.especie_id))
      delGrupo.sort((a, b) =>
        a.lote.estado === "cerrado"
          ? (b.lote.fecha_cierre ?? "").localeCompare(a.lote.fecha_cierre ?? "")
          : ORDEN_CLASE.indexOf(a.clase) - ORDEN_CLASE.indexOf(b.clase) || b.cabezas - a.cabezas || a.lote.nombre.localeCompare(b.lote.nombre, "es"))
      return { especie, filas: delGrupo }
    })
    .filter(g => g.filas.length > 0)

  return (
    <div className="space-y-6">
      {grupos.map(({ especie, filas: delGrupo }) => {
        const total = delGrupo.reduce((s, f) => s + f.cabezas, 0)
        const activos = delGrupo[0].lote.estado === "activo"
        return (
          <div key={especie.id || "otra"} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorDeEspecie(especie) }} />
              <span className="font-semibold">{especie.nombre}</span>
              <span className="text-muted-foreground">
                {activos && <>· <span className="tabular-nums">{total}</span> {total === 1 ? "cabeza" : "cabezas"} </>}
                · {delGrupo.length} {delGrupo.length === 1 ? "lote" : "lotes"}
              </span>
            </h3>
            <ul className="space-y-2">
              {delGrupo.map(f => (
                <li key={f.lote.id}>
                  <TarjetaLote lote={f.lote} color={colorDeEspecie(especie)} cabezas={f.separadas.resto} crias={f.separadas.crias} potrero={f.potrero}
                    enPotreroDesde={estadias.get(f.lote.id)?.fecha_ingreso}
                    onCambiarPotrero={onCambiarPotrero ? () => onCambiarPotrero(f.lote) : undefined} />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function Esqueleto({ filas = 3 }: { filas?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />
      ))}
    </div>
  )
}
