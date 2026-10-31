"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowDown } from "lucide-react"

import { getMovimientos, getPagadores, getTitularesDeMovimientos } from "@/lib/queries/economia"
import { getArchivosMovimientos } from "@/lib/queries/archivos"
import { mensajeDeError } from "@/lib/supabase/errores"
import { TablaResponsiva, type Columna } from "@/components/shared/TablaResponsiva"
import { usd } from "@/components/economia/formato"
import { fechaCorta } from "@/components/lotes/formato"
import { FiltrosMovimientos, type OpcionesFiltros } from "@/components/economia/movimientos/FiltrosMovimientos"
import { COLOR_SENTIDO, DetalleMovimiento } from "@/components/economia/movimientos/DetalleMovimiento"
import { escribirFiltros, filtrar, leerFiltros, rangoDe, totales, type FilaMov, type FiltrosMov } from "@/components/economia/movimientos/filtros"
import { cn } from "@/lib/utils"
import type { ArchivoDeMovimiento, Concepto, Movimiento, MovimientoTitular, Pagador, Rubro, Titular } from "@/types/economia"

export type ParaAccion = { id: string; concepto: string; sentido: "ingreso" | "egreso"; fecha: string }

interface Datos {
  clave: string
  movimientos: Movimiento[]
  reparto: MovimientoTitular[]
  archivos: ArchivoDeMovimiento[]
}

// Número sin "USD" ni decimales de más: 10.000 o 10.000,50
const numero = (n: number) => n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/**
 * Movimientos con filtros (en la URL) y totales de lo filtrado, en dólares. Con titulares elegidos,
 * cada movimiento y los totales cuentan solo la parte de esos titulares ("USD 3.300 de 10.000").
 * El período es propio de esta pestaña (por defecto, el mes actual). Tocando uno se ve el detalle.
 */
export function ListaMovimientos({ establecimientoId, puedeOperar, rubros, conceptos, titulares, version, onPagar, onAnular, onCambio }: {
  establecimientoId: string
  puedeOperar: boolean
  rubros: Rubro[]
  conceptos: Concepto[]
  titulares: Titular[]
  version: number
  onPagar: (m: ParaAccion) => void
  onAnular: (m: ParaAccion) => void
  onCambio: () => void
}) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const filtros = leerFiltros(params)
  const { desde, hasta } = rangoDe(filtros.periodo)
  const clave = `${establecimientoId}:${desde}:${hasta}:${version}`

  const [datos, setDatos] = useState<Datos | null>(null)
  const [pagadores, setPagadores] = useState<Pagador[]>([])
  const [error, setError] = useState<string | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    getPagadores(establecimientoId)
      .then(p => { if (vigente) setPagadores(p) })
      .catch(() => { /* sin nombres de pagador: se ve "—" */ })
    return () => { vigente = false }
  }, [establecimientoId, version])

  useEffect(() => {
    let vigente = true
    getMovimientos(establecimientoId, desde, hasta)
      .then(async movimientos => {
        const ids = movimientos.map(m => m.id)
        const [reparto, archivos] = await Promise.all([getTitularesDeMovimientos(ids), getArchivosMovimientos(ids)])
        if (vigente) { setError(null); setDatos({ clave: `${establecimientoId}:${desde}:${hasta}:${version}`, movimientos, reparto, archivos }) }
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los movimientos")) })
    return () => { vigente = false }
  }, [establecimientoId, desde, hasta, version])

  const cambiar = (f: FiltrosMov) => {
    const base = new URLSearchParams(params.toString())
    base.set("pestana", "movimientos")
    router.replace(`${pathname}?${escribirFiltros(base, f)}`, { scroll: false })
  }

  const listos = datos?.clave === clave ? datos : null
  const filas = useMemo(() => (listos ? filtrar(listos.movimientos, listos.reparto, filtros) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los filtros salen de la URL
    [listos, params])
  const suma = totales(filas)

  // Nombres
  const nombreRubro = (id: string) => rubros.find(r => r.id === id)?.nombre ?? "—"
  const nombreTitular = (id: string) => titulares.find(t => t.id === id)?.nombre ?? "—"
  const nombrePagador = (id: string | null) => (id ? pagadores.find(p => p.id === id)?.nombre ?? "—" : null)
  // El concepto del catálogo; los movimientos viejos sin concepto muestran su texto
  const nombreConcepto = (f: FilaMov) => (f.m.concepto_id ? conceptos.find(c => c.id === f.m.concepto_id)?.nombre : null) ?? f.m.concepto
  // Lo que más se ve: el identificador, o si no tiene, el texto del movimiento ("Venta de 20 terneras" en una venta)
  const identificador = (f: FilaMov) => f.m.identificador ?? f.m.concepto
  // "Hermanos 67% · Madre 33%", "Hermanos" (uno solo) o "3 titulares" (el detalle, en el movimiento)
  const textoTitulares = (f: FilaMov) => {
    if (f.partes.length === 0) return "Sin titular"
    if (f.partes.length === 1) return nombreTitular(f.partes[0].titular_id)
    if (f.partes.length > 2) return `${f.partes.length} titulares`
    return f.partes.map(p => `${nombreTitular(p.titular_id)} ${Math.round(Number(p.monto) / Number(f.m.monto_original) * 100)}%`).join(" · ")
  }

  // Opciones de los filtros: los nombres de factura, de los movimientos del período (y los ya elegidos)
  const opciones: OpcionesFiltros = {
    titulares: titulares.map(t => ({ id: t.id, nombre: t.nombre })),
    pagadores: pagadores.map(p => ({ id: p.id, nombre: p.nombre })),
    rubros: rubros.map(r => ({ id: r.id, nombre: r.nombre })),
    conceptos: conceptos.filter(c => !filtros.tipo || c.tipo === filtros.tipo).map(c => ({ id: c.id, nombre: c.nombre })),
    facturas: [...new Set([...(listos?.movimientos ?? []).map(m => m.factura_nombre).filter((n): n is string => !!n), ...filtros.facturas])]
      .sort((a, b) => a.localeCompare(b, "es")).map(n => ({ id: n, nombre: n })),
  }

  const monto = (f: FilaMov, grande = false) => {
    const anulado = !!f.m.anulado_en
    return (
      <div className="text-right tabular-nums">
        <p className={cn("font-semibold", grande && "text-base", !anulado && COLOR_SENTIDO[f.m.sentido])}>
          {f.m.sentido === "ingreso" ? "+" : "−"} {usd(f.usd)}
          {f.esParte && <span className="font-normal text-muted-foreground"> de {numero(Number(f.m.monto_usd))}</span>}
        </p>
        {f.m.moneda_original === "UYU" && (
          <p className="text-xs text-muted-foreground">
            UYU {numero(Number(f.m.monto_original))}{f.m.tipo_cambio ? ` a ${Number(f.m.tipo_cambio).toLocaleString("es-UY")}` : ""}
            {f.m.tipo_cambio_fuente === "BCU" && f.m.tipo_cambio_fecha ? ` · BCU ${fechaCorta(f.m.tipo_cambio_fecha).slice(0, 5)}` : " · a mano"}
          </p>
        )}
      </div>
    )
  }

  const destacado = (f: FilaMov) => (
    <span className="min-w-0">
      <span className={cn("font-medium", f.m.anulado_en && "line-through")}>{identificador(f)}</span>
      {f.m.anulado_en
        ? <span className="ml-1.5 text-xs text-muted-foreground">anulado</span>
        : f.m.estado === "pendiente" && <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-400">pendiente</span>}
    </span>
  )

  const ordenar = (orden: FiltrosMov["orden"]) => (
    <button type="button" onClick={() => cambiar({ ...filtros, orden })}
      className={cn("inline-flex items-center gap-0.5 hover:text-foreground", filtros.orden === orden && "text-foreground")}>
      {orden === "fecha" ? "Fecha" : "Monto USD"}
      {filtros.orden === orden && <ArrowDown className="h-3 w-3" aria-label="de mayor a menor" />}
    </button>
  )

  const columnas: Columna<FilaMov>[] = [
    { clave: "fecha", titulo: ordenar("fecha"), celda: f => <span className="tabular-nums">{fechaCorta(f.m.fecha)}</span>, ancho: "w-24" },
    { clave: "identificador", titulo: "Identificador", celda: destacado },
    { clave: "concepto", titulo: "Concepto", celda: f => nombreConcepto(f) },
    { clave: "rubro", titulo: "Rubro", celda: f => nombreRubro(f.m.rubro_id) },
    { clave: "titulares", titulo: "Titular(es)", celda: f => textoTitulares(f) },
    { clave: "pagador", titulo: "Pagado por", celda: f => nombrePagador(f.m.pagador_id) ?? <span className="text-muted-foreground">—</span> },
    { clave: "monto", titulo: <span className="inline-flex justify-end">{ordenar("monto")}</span>, celda: f => monto(f), derecha: true, ancho: "w-48" },
  ]

  const tarjeta = (f: FilaMov) => (
    <div className="space-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm"><span className="tabular-nums text-muted-foreground">{fechaCorta(f.m.fecha).slice(0, 5)}</span> {destacado(f)}</p>
        <div className="shrink-0">{monto(f)}</div>
      </div>
      <p className="text-xs text-muted-foreground">
        {[nombreConcepto(f) !== identificador(f) && nombreConcepto(f), nombreRubro(f.m.rubro_id), textoTitulares(f), nombrePagador(f.m.pagador_id) && `${f.m.sentido === "ingreso" ? "Cobró" : "Pagó"} ${nombrePagador(f.m.pagador_id)}`]
          .filter(Boolean).join(" · ")}
      </p>
    </div>
  )

  const detalle = filas.find(f => f.m.id === detalleId) ?? null
  const accion = (f: FilaMov): ParaAccion => ({ id: f.m.id, concepto: identificador(f), sentido: f.m.sentido, fecha: f.m.fecha })

  return (
    <div className="space-y-4">
      <FiltrosMovimientos filtros={filtros} onCambio={cambiar} opciones={opciones} />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!listos && !error ? <div className="h-64 rounded-lg border bg-muted/30 animate-pulse" /> : listos && (
        <>
          {/* Totales de lo filtrado */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { titulo: "Ingresos", valor: suma.ingresos, color: COLOR_SENTIDO.ingreso },
              { titulo: "Egresos", valor: suma.egresos, color: COLOR_SENTIDO.egreso },
              { titulo: "Neto", valor: suma.neto, color: suma.neto > 0 ? COLOR_SENTIDO.ingreso : suma.neto < 0 ? COLOR_SENTIDO.egreso : "" },
            ].map(t => (
              <div key={t.titulo} className="rounded-lg border bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground">{t.titulo}</p>
                <p className={cn("text-sm font-bold tabular-nums sm:text-lg", t.color)}>{usd(t.valor)}</p>
              </div>
            ))}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {filas.length} {filas.length === 1 ? "movimiento" : "movimientos"}, en dólares
            {filtros.titulares.length > 0 && " · solo la parte de los titulares elegidos"}
            {filtros.anulados && " · los anulados no suman"}
          </p>

          <TablaResponsiva filas={filas} columnas={columnas} clave={f => f.m.id} tarjeta={tarjeta}
            onTocar={f => setDetalleId(f.m.id)} atenuada={f => !!f.m.anulado_en}
            vacio={<p className="text-sm text-muted-foreground">Sin movimientos con esos filtros.</p>} />

          <DetalleMovimiento fila={detalle} archivos={listos.archivos} establecimientoId={establecimientoId} puedeOperar={puedeOperar}
            nombres={{ identificador, concepto: nombreConcepto, rubro: nombreRubro, titular: nombreTitular, pagador: nombrePagador }}
            onCerrar={() => setDetalleId(null)} onCambioArchivos={onCambio}
            onPagar={f => { setDetalleId(null); onPagar(accion(f)) }}
            onAnular={f => { setDetalleId(null); onAnular(accion(f)) }} />
        </>
      )}
    </div>
  )
}
