"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, Pencil, Plus } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import {
  getConceptos, getMovimientos, getPendientes, getResultadoDetalle, getRubrosTodos, getSinPrecio, getTitulares,
  getTitularesDeMovimientos,
} from "@/lib/queries/economia"
import { getArchivosMovimientos } from "@/lib/queries/archivos"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DialogoAnular, DialogoPagar } from "@/components/economia/Dialogos"
import { ArchivosDeMovimiento } from "@/components/economia/ArchivosMovimiento"
import { etiquetaPeriodo, montoOriginal, periodoActual, rangoPeriodo, usd, type Periodo } from "@/components/economia/formato"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type {
  ArchivoDeMovimiento, Concepto, Movimiento, MovimientoTitular, Pendiente, ResultadoDetalle, Rubro, SinPrecio, Titular,
} from "@/types/economia"

type Pestana = "resultado" | "movimientos" | "pendientes" | "sin_precio"

interface Datos {
  clave: string
  resultado: ResultadoDetalle[]
  movimientos: Movimiento[]
  pendientes: Pendiente[]
  sinPrecio: SinPrecio[]
  rubros: Rubro[]
  conceptos: Concepto[]
  titulares: Titular[]
  archivos: ArchivoDeMovimiento[]
  reparto: MovimientoTitular[]
}

type ParaAccion = { id: string; concepto: string; sentido: "ingreso" | "egreso"; fecha: string }

// Ingresos en verde, gastos en rojo
const COLOR_SENTIDO = {
  ingreso: "text-emerald-700 dark:text-emerald-400",
  egreso: "text-red-700 dark:text-red-400",
} as const

/**
 * Economía: resultado del período (devengado) por rubro, concepto, grupo o titular, movimientos (con sus archivos), pendientes de cobro y pago,
 * y compras o ventas sin precio. Solo para quien puede cargar (Consulta no ve plata).
 */
export default function EconomiaPage() {
  // useSearchParams necesita Suspense
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <Economia />
    </Suspense>
  )
}

const PESTANAS: Pestana[] = ["resultado", "movimientos", "pendientes", "sin_precio"]

function Economia() {
  const params = useSearchParams()
  const { establecimientoActivo, puedeOperar, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id
  const [periodo, setPeriodo] = useState<Periodo>(periodoActual)
  const [pestana, setPestana] = useState<Pestana>(() => {
    const p = params.get("pestana") as Pestana | null   // ?pestana=movimientos al volver de cargar o editar
    return p && PESTANAS.includes(p) ? p : "resultado"
  })
  const [version, setVersion] = useState(0)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aPagar, setAPagar] = useState<ParaAccion | null>(null)
  const [aAnular, setAAnular] = useState<ParaAccion | null>(null)

  const { desde, hasta } = rangoPeriodo(periodo)
  const clave = `${estId}:${desde}:${version}`

  useEffect(() => {
    if (!estId || !puedeOperar) return
    let vigente = true
    Promise.all([
      getResultadoDetalle(estId, desde, hasta), getMovimientos(estId, desde, hasta), getPendientes(estId), getSinPrecio(estId),
      getRubrosTodos(estId), getConceptos(estId), getTitulares(estId),
    ])
      .then(async ([resultado, movimientos, pendientes, sinPrecio, rubros, conceptos, titulares]) => {
        const ids = movimientos.map(m => m.id)
        const [archivos, reparto] = await Promise.all([getArchivosMovimientos(ids), getTitularesDeMovimientos(ids)])
        if (vigente) setDatos({
          clave: `${estId}:${desde}:${version}`, resultado, movimientos, pendientes, sinPrecio, rubros, conceptos, titulares, archivos, reparto,
        })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar la economía")) })
    return () => { vigente = false }
  }, [estId, puedeOperar, desde, hasta, version])

  if (cargando) return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) return <PageContainer><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  if (!puedeOperar) {
    return <PageContainer><p className="text-muted-foreground">La economía la ven el administrador y los operadores.</p></PageContainer>
  }

  const listos = datos?.clave === clave ? datos : null
  const recargar = () => { setAPagar(null); setAAnular(null); setVersion(v => v + 1) }
  const anioHoy = new Date().getFullYear()
  const anios = Array.from({ length: 6 }, (_, i) => anioHoy - i)

  const chip = (activo: boolean) => cn("min-h-10 rounded-full border px-3 text-sm transition-colors",
    activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")

  const pestanas: { id: Pestana; etiqueta: string; cuenta?: number }[] = [
    { id: "resultado", etiqueta: "Resultado" },
    { id: "movimientos", etiqueta: "Movimientos" },
    { id: "pendientes", etiqueta: "Pendientes", cuenta: listos?.pendientes.length },
    { id: "sin_precio", etiqueta: "Sin precio", cuenta: listos?.sinPrecio.length },
  ]

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Economía</h1>
        <Link href="/economia/nuevo" className={buttonVariants({ className: "h-11 md:h-9" })}>
          <Plus className="h-4 w-4 mr-1" /> Cargar ingreso o gasto
        </Link>
      </div>

      {/* Período */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button type="button" className={chip(periodo.tipo === "ejercicio")} onClick={() => setPeriodo({ ...periodo, tipo: "ejercicio" })}>
          Ejercicio (jul-jun)
        </button>
        <button type="button" className={chip(periodo.tipo === "anio")} onClick={() => setPeriodo({ ...periodo, tipo: "anio" })}>
          Año calendario
        </button>
        <select aria-label="Año" className={cn(SELECT_NATIVO, "w-32")} value={periodo.anio}
          onChange={e => setPeriodo({ ...periodo, anio: Number(e.target.value) })}>
          {anios.map(a => <option key={a} value={a}>{periodo.tipo === "ejercicio" ? `${a}/${String(a + 1).slice(2)}` : a}</option>)}
        </select>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 overflow-x-auto border-b mb-4" role="tablist">
        {pestanas.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} onClick={() => setPestana(p.id)}
            className={cn("min-h-11 shrink-0 px-3 text-sm font-medium border-b-2 -mb-px",
              pestana === p.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {p.etiqueta}{p.cuenta ? <span className="ml-1 tabular-nums">({p.cuenta})</span> : null}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!listos && !error ? <div className="h-64 rounded-lg border bg-muted/30 animate-pulse" /> : listos && (
        <div className="max-w-3xl space-y-4">
          {/* Aviso: lo que el resultado no cuenta */}
          {listos.sinPrecio.length > 0 && pestana !== "sin_precio" && (
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Hay {listos.sinPrecio.length} {listos.sinPrecio.length === 1 ? "compra o venta" : "compras y ventas"} sin precio: el resultado no las cuenta.{" "}
                <button type="button" className="font-medium underline" onClick={() => setPestana("sin_precio")}>Ver</button>
              </span>
            </p>
          )}

          {pestana === "resultado" && <Resultado filas={listos.resultado} periodo={periodo} />}
          {pestana === "movimientos" && (
            <Movimientos movimientos={listos.movimientos} rubros={listos.rubros} conceptos={listos.conceptos} titulares={listos.titulares}
              archivos={listos.archivos} reparto={listos.reparto} establecimientoId={establecimientoActivo.id} onPagar={setAPagar} onAnular={setAAnular}
              onCambioArchivos={() => setVersion(v => v + 1)} />
          )}
          {pestana === "pendientes" && <Pendientes pendientes={listos.pendientes} onPagar={setAPagar} />}
          {pestana === "sin_precio" && <ListaSinPrecio filas={listos.sinPrecio} />}
        </div>
      )}

      <DialogoPagar key={aPagar?.id ?? "pagar"} movimiento={aPagar} onCerrar={() => setAPagar(null)} onHecho={recargar} />
      <DialogoAnular key={aAnular?.id ?? "anular"} movimiento={aAnular} onCerrar={() => setAAnular(null)} onHecho={recargar} />
    </PageContainer>
  )
}

type Dimension = "rubro" | "concepto" | "grupo" | "titular"
const DIMENSIONES: { id: Dimension; etiqueta: string }[] = [
  { id: "rubro", etiqueta: "Rubro" },
  { id: "concepto", etiqueta: "Concepto" },
  { id: "grupo", etiqueta: "Grupo" },
  { id: "titular", etiqueta: "Titular" },
]

// Clave y nombre de cada fila según la dimensión. Sin grupo: los ingresos van juntos ("Ingresos").
function porDimension(f: ResultadoDetalle, d: Dimension): { clave: string; nombre: string; sinDato: boolean } {
  switch (d) {
    case "rubro": return { clave: f.rubro_id, nombre: f.rubro, sinDato: false }
    case "concepto": return f.concepto_id
      ? { clave: f.concepto_id, nombre: f.concepto ?? "—", sinDato: false }
      : { clave: `sin:${f.sentido}`, nombre: f.sentido === "ingreso" ? "Ingresos sin concepto" : "Gastos sin concepto", sinDato: true }
    case "grupo": return f.grupo_id
      ? { clave: f.grupo_id, nombre: f.grupo ?? "—", sinDato: false }
      : f.sentido === "ingreso"
        ? { clave: "ingresos", nombre: "Ingresos", sinDato: false }
        : { clave: "sin", nombre: "Gastos sin grupo", sinDato: true }
    case "titular": return f.titular_id
      ? { clave: f.titular_id, nombre: f.titular ?? "—", sinDato: false }
      : { clave: "sin", nombre: "Sin titular", sinDato: true }
  }
}

type Totales = { ingresos: number; egresos: number; resultado: number }

function Resultado({ filas, periodo }: { filas: ResultadoDetalle[]; periodo: Periodo }) {
  const [dimension, setDimension] = useState<Dimension>("rubro")

  const grupos = new Map<string, Totales & { nombre: string; sinDato: boolean }>()
  for (const f of filas) {
    const { clave, nombre, sinDato } = porDimension(f, dimension)
    const r = grupos.get(clave) ?? { nombre, sinDato, ingresos: 0, egresos: 0, resultado: 0 }
    const monto = Number(f.monto_usd)
    if (f.sentido === "ingreso") { r.ingresos += monto; r.resultado += monto } else { r.egresos += monto; r.resultado -= monto }
    grupos.set(clave, r)
  }
  // Primero los que suman más ingresos; los "sin concepto / grupo / titular" al final
  const lista = [...grupos.values()].sort((a, b) =>
    Number(a.sinDato) - Number(b.sinDato) || (b.ingresos > 0 ? 1 : 0) - (a.ingresos > 0 ? 1 : 0) || a.nombre.localeCompare(b.nombre, "es"))
  const total = lista.reduce<Totales>((t, r) => ({ ingresos: t.ingresos + r.ingresos, egresos: t.egresos + r.egresos, resultado: t.resultado + r.resultado }),
    { ingresos: 0, egresos: 0, resultado: 0 })

  const chip = (activo: boolean) => cn("min-h-10 md:min-h-9 rounded-full border px-3 text-sm transition-colors",
    activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")

  const fila = (nombre: string, r: Totales, fuerte = false) => (
    <div key={nombre} className={cn("grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3", fuerte && "bg-muted/30")}>
      <span className={cn("text-sm", fuerte && "font-semibold")}>{nombre}</span>
      <span className={cn("text-right tabular-nums", fuerte ? "text-lg font-bold" : "font-semibold",
        r.resultado > 0 ? COLOR_SENTIDO.ingreso : r.resultado < 0 ? COLOR_SENTIDO.egreso : "")}>{usd(r.resultado)}</span>
      <span className="col-span-2 text-xs text-muted-foreground tabular-nums">
        {r.ingresos > 0 && <>Ingresos <span className={COLOR_SENTIDO.ingreso}>{usd(r.ingresos)}</span></>}
        {r.ingresos > 0 && r.egresos > 0 && " · "}
        {r.egresos > 0 && <>Gastos <span className={COLOR_SENTIDO.egreso}>{usd(r.egresos)}</span></>}
      </span>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ver el resultado por">
        <span className="text-sm text-muted-foreground">Por</span>
        {DIMENSIONES.map(d => (
          <button key={d.id} type="button" aria-pressed={dimension === d.id} className={chip(dimension === d.id)} onClick={() => setDimension(d.id)}>
            {d.etiqueta}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin movimientos en el {etiquetaPeriodo(periodo).toLowerCase()}.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              {etiquetaPeriodo(periodo)} · por la fecha de cada movimiento (cobrado o no), en dólares
            </p>
            <div className="divide-y">
              {lista.map(r => fila(r.nombre, r))}
              {fila("Total", total, true)}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Movimientos({ movimientos, rubros, conceptos, titulares, archivos, reparto, establecimientoId, onPagar, onAnular, onCambioArchivos }: {
  movimientos: Movimiento[]
  rubros: Rubro[]
  conceptos: Concepto[]
  titulares: Titular[]
  archivos: ArchivoDeMovimiento[]
  reparto: MovimientoTitular[]
  establecimientoId: string
  onPagar: (m: ParaAccion) => void
  onAnular: (m: ParaAccion) => void
  onCambioArchivos: () => void
}) {
  const [sentido, setSentido] = useState("")
  const [estado, setEstado] = useState("")
  const [rubroId, setRubroId] = useState("")
  const [conceptoId, setConceptoId] = useState("")
  const [verAnulados, setVerAnulados] = useState(false)
  const nombreRubro = (id: string) => rubros.find(r => r.id === id)?.nombre ?? "—"
  const nombreTitular = (id: string) => titulares.find(t => t.id === id)?.nombre ?? "—"
  // "Juan" (uno, con todo) o "Juan USD 40 · Ana USD 200" (repartido)
  const textoTitulares = (m: Movimiento) => {
    const partes = reparto.filter(r => r.movimiento_id === m.id)
    if (partes.length === 0) return null
    if (partes.length === 1) return nombreTitular(partes[0].titular_id)
    return partes.map(r => `${nombreTitular(r.titular_id)} ${montoOriginal(Number(r.monto), m.moneda_original, null)}`).join(" · ")
  }
  // El concepto del catálogo; los movimientos viejos sin concepto muestran su texto
  const nombreConcepto = (m: Movimiento) => (m.concepto_id ? conceptos.find(c => c.id === m.concepto_id)?.nombre : null) ?? m.concepto

  const lista = movimientos.filter(m =>
    (!sentido || m.sentido === sentido) && (!estado || m.estado === estado) && (!rubroId || m.rubro_id === rubroId)
    && (!conceptoId || m.concepto_id === conceptoId) && (verAnulados || !m.anulado_en))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <select aria-label="Ingresos o egresos" className={SELECT_NATIVO} value={sentido} onChange={e => setSentido(e.target.value)}>
          <option value="">Ingresos y egresos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
        </select>
        <select aria-label="Estado" className={SELECT_NATIVO} value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Pagados y pendientes</option>
          <option value="pendiente">Pendientes</option>
          <option value="pagado">Pagados o cobrados</option>
        </select>
        <select aria-label="Rubro" className={SELECT_NATIVO} value={rubroId} onChange={e => setRubroId(e.target.value)}>
          <option value="">Todos los rubros</option>
          {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <select aria-label="Concepto" className={SELECT_NATIVO} value={conceptoId} onChange={e => setConceptoId(e.target.value)}>
          <option value="">Todos los conceptos</option>
          {conceptos.filter(c => !sentido || c.tipo === sentido).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <label className="flex items-center gap-2 min-h-11 text-sm cursor-pointer select-none">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={verAnulados} onChange={e => setVerAnulados(e.target.checked)} />
          Ver anulados
        </label>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin movimientos con esos filtros.</p>
      ) : (
        <ul className="rounded-lg border divide-y bg-card">
          {lista.map(m => {
            const anulado = !!m.anulado_en
            const accion = { id: m.id, concepto: nombreConcepto(m), sentido: m.sentido, fecha: m.fecha }
            return (
              <li key={m.id} className={cn("px-4 py-3 space-y-1", anulado && "opacity-60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("font-medium", anulado && "line-through")}>{nombreConcepto(m)}</p>
                    {m.actividad_id && m.concepto !== nombreConcepto(m) && (
                      <Link href={`/actividades/${m.actividad_id}`} className="text-sm text-primary hover:underline">{m.concepto}</Link>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {[fechaCorta(m.fecha), nombreRubro(m.rubro_id), m.contraparte].filter(Boolean).join(" · ")}
                    </p>
                    {textoTitulares(m) && <p className="text-xs text-muted-foreground">Titular: {textoTitulares(m)}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("font-semibold tabular-nums", !anulado && COLOR_SENTIDO[m.sentido])}>{m.sentido === "ingreso" ? "+" : "−"} {usd(Number(m.monto_usd))}</p>
                    {m.moneda_original === "UYU" && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {montoOriginal(Number(m.monto_original), m.moneda_original, m.tipo_cambio)}
                        {m.tipo_cambio_fuente === "BCU" && m.tipo_cambio_fecha ? ` · BCU ${fechaCorta(m.tipo_cambio_fecha).slice(0, 5)}` : " · a mano"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {anulado
                    ? <Badge variant="secondary">Anulado</Badge>
                    : m.estado === "pendiente"
                      ? <Badge variant="outline">Pendiente{m.fecha_vencimiento ? ` · ${m.sentido === "ingreso" ? "se cobra" : "se paga"} el ${fechaCorta(m.fecha_vencimiento)}` : ""}</Badge>
                      : <Badge variant="outline">{m.sentido === "ingreso" ? "Cobrado" : "Pagado"}{m.fecha_pago ? ` el ${fechaCorta(m.fecha_pago)}` : ""}</Badge>}
                  {!anulado && m.estado === "pendiente" && (
                    <Button type="button" variant="outline" size="sm" className="h-9 md:h-8" onClick={() => onPagar(accion)}>
                      {m.sentido === "ingreso" ? "Marcar cobrado" : "Marcar pagado"}
                    </Button>
                  )}
                  {!anulado && (
                    <Link href={`/economia/${m.id}/editar`} className={buttonVariants({ variant: "ghost", size: "sm", className: "h-9 md:h-8 text-muted-foreground" })}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Link>
                  )}
                  {!anulado && m.origen === "manual" && (
                    <Button type="button" variant="ghost" size="sm" className="h-9 md:h-8 text-muted-foreground" onClick={() => onAnular(accion)}>
                      Anular
                    </Button>
                  )}
                </div>
                {anulado && m.motivo_anulacion && <p className="text-xs text-muted-foreground">Anulado: {m.motivo_anulacion}</p>}
                <ArchivosDeMovimiento establecimientoId={establecimientoId} movimientoId={m.id}
                  archivos={archivos.filter(a => a.movimiento_id === m.id)} puedeAdjuntar={!anulado} onCambio={onCambioArchivos} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Pendientes({ pendientes, onPagar }: { pendientes: Pendiente[]; onPagar: (m: ParaAccion) => void }) {
  const bloque = (titulo: string, lista: Pendiente[], ingreso: boolean) => (
    <section className="space-y-2">
      <h2 className="flex items-baseline justify-between gap-2 font-semibold">
        {titulo}
        <span className={cn("tabular-nums", COLOR_SENTIDO[ingreso ? "ingreso" : "egreso"])}>{usd(lista.reduce((s, p) => s + Number(p.monto_usd), 0))}</span>
      </h2>
      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada {ingreso ? "por cobrar" : "por pagar"}.</p>
      ) : (
        <ul className="rounded-lg border divide-y bg-card">
          {lista.map(p => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                {p.actividad_id
                  ? <Link href={`/actividades/${p.actividad_id}`} className="font-medium text-primary">{p.concepto}</Link>
                  : <p className="font-medium">{p.concepto}</p>}
                <p className="text-xs text-muted-foreground">
                  {[fechaCorta(p.fecha), p.rubro, p.contraparte, `hace ${p.dias} ${p.dias === 1 ? "día" : "días"}`].filter(Boolean).join(" · ")}
                </p>
                {p.fecha_vencimiento && (
                  <p className={cn("text-xs", p.fecha_vencimiento < hoyLocal() ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {ingreso ? "Se cobra" : "Se paga"} el {fechaCorta(p.fecha_vencimiento)}{p.fecha_vencimiento < hoyLocal() ? " (vencido)" : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("font-semibold tabular-nums", COLOR_SENTIDO[p.sentido])}>{usd(Number(p.monto_usd))}</span>
                <Button type="button" variant="outline" size="sm" className="h-9 md:h-8"
                  onClick={() => onPagar({ id: p.id, concepto: p.concepto, sentido: p.sentido, fecha: p.fecha })}>
                  {ingreso ? "Cobrado" : "Pagado"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Todos los pendientes, de cualquier período, del más viejo al más nuevo.</p>
      {bloque("Por cobrar", pendientes.filter(p => p.sentido === "ingreso"), true)}
      {bloque("Por pagar", pendientes.filter(p => p.sentido === "egreso"), false)}
    </div>
  )
}

function ListaSinPrecio({ filas }: { filas: SinPrecio[] }) {
  if (filas.length === 0) return <p className="text-sm text-muted-foreground">Todas las compras y ventas tienen precio.</p>
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">El resultado no las cuenta hasta que se cargue su precio.</p>
      <ul className="rounded-lg border divide-y bg-card">
        {filas.map(f => (
          <li key={f.actividad_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">{f.tipo === "venta" ? "Venta" : "Compra"} de {f.cabezas} {f.cabezas === 1 ? "cabeza" : "cabezas"}</p>
              <p className="text-xs text-muted-foreground">{[fechaCorta(f.fecha), f.contraparte].filter(Boolean).join(" · ")}</p>
            </div>
            <Link href={`/actividades/${f.actividad_id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 md:h-8" })}>
              Cargar precio
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
