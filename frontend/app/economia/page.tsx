"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, Plus } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getConceptos, getPendientes, getResultadoDetalle, getRubrosTodos, getSinPrecio, getTitulares } from "@/lib/queries/economia"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DialogoAnular, DialogoPagar } from "@/components/economia/Dialogos"
import { ListaMovimientos, type ParaAccion } from "@/components/economia/movimientos/ListaMovimientos"
import { PestanaSaldos } from "@/components/economia/saldos/PestanaSaldos"
import { COLOR_SENTIDO } from "@/components/economia/movimientos/DetalleMovimiento"
import { etiquetaPeriodo, periodoActual, rangoPeriodo, usd, type Periodo } from "@/components/economia/formato"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"
import type { Concepto, Pendiente, ResultadoDetalle, Rubro, SinPrecio, Titular } from "@/types/economia"

type Pestana = "resultado" | "movimientos" | "saldos" | "pendientes" | "sin_precio"

interface Datos {
  clave: string
  resultado: ResultadoDetalle[]
  pendientes: Pendiente[]
  sinPrecio: SinPrecio[]
  rubros: Rubro[]
  conceptos: Concepto[]
  titulares: Titular[]
}

/**
 * Economía: resultado del ejercicio o año (devengado) por rubro, concepto, grupo o titular, movimientos (con filtros y período
 * propios), saldos entre titulares (con liquidaciones), pendientes de cobro y pago, y compras o ventas sin precio. Consulta lo ve todo pero no carga, edita ni anula.
 */
export default function EconomiaPage() {
  // useSearchParams necesita Suspense
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <Economia />
    </Suspense>
  )
}

const PESTANAS: Pestana[] = ["resultado", "movimientos", "saldos", "pendientes", "sin_precio"]

function Economia() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { establecimientoActivo, puedeOperar, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id
  const [periodo, setPeriodo] = useState<Periodo>(periodoActual)
  // La pestaña va en la URL (?pestana=movimientos al volver de cargar o editar), junto con los filtros de Movimientos
  const elegida = params.get("pestana") as Pestana | null
  const pestana: Pestana = elegida && PESTANAS.includes(elegida) ? elegida : "resultado"
  const setPestana = (id: Pestana) => {
    const p = new URLSearchParams(params.toString())
    p.set("pestana", id)
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }
  const [version, setVersion] = useState(0)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aPagar, setAPagar] = useState<ParaAccion | null>(null)
  const [aAnular, setAAnular] = useState<ParaAccion | null>(null)

  const { desde, hasta } = rangoPeriodo(periodo)
  const clave = `${estId}:${desde}:${version}`

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([
      getResultadoDetalle(estId, desde, hasta), getPendientes(estId), getSinPrecio(estId),
      getRubrosTodos(estId), getConceptos(estId), getTitulares(estId),
    ])
      .then(([resultado, pendientes, sinPrecio, rubros, conceptos, titulares]) => {
        if (vigente) setDatos({ clave: `${estId}:${desde}:${version}`, resultado, pendientes, sinPrecio, rubros, conceptos, titulares })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar la economía")) })
    return () => { vigente = false }
  }, [estId, desde, hasta, version])

  if (cargando) return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) return <PageContainer><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>

  const listos = datos?.clave === clave ? datos : null
  const recargar = () => { setAPagar(null); setAAnular(null); setVersion(v => v + 1) }
  const anioHoy = new Date().getFullYear()
  const anios = Array.from({ length: 6 }, (_, i) => anioHoy - i)

  const chip = (activo: boolean) => cn("min-h-10 rounded-full border px-3 text-sm transition-colors",
    activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")

  const pestanas: { id: Pestana; etiqueta: string; cuenta?: number }[] = [
    { id: "resultado", etiqueta: "Resultado" },
    { id: "movimientos", etiqueta: "Movimientos" },
    { id: "saldos", etiqueta: "Saldos" },
    { id: "pendientes", etiqueta: "Pendientes", cuenta: listos?.pendientes.length },
    { id: "sin_precio", etiqueta: "Sin precio", cuenta: listos?.sinPrecio.length },
  ]

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Economía</h1>
        {puedeOperar && (
          <Link href="/economia/nuevo" className={buttonVariants({ className: "h-11 md:h-9" })}>
            <Plus className="h-4 w-4 mr-1" /> Cargar ingreso o gasto
          </Link>
        )}
      </div>

      {/* Período del resultado (Movimientos tiene el suyo) */}
      {pestana === "resultado" && <div className="flex flex-wrap items-center gap-2 mb-4">
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
      </div>}

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
        <div className={cn("space-y-4", pestana !== "movimientos" && pestana !== "saldos" && "max-w-3xl")}>
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
            <ListaMovimientos establecimientoId={establecimientoActivo.id} puedeOperar={puedeOperar} rubros={listos.rubros}
              conceptos={listos.conceptos} titulares={listos.titulares} version={version} onPagar={setAPagar} onAnular={setAAnular}
              onCambio={() => setVersion(v => v + 1)} />
          )}
          {pestana === "saldos" && (
            <PestanaSaldos establecimientoId={establecimientoActivo.id} puedeOperar={puedeOperar} titulares={listos.titulares}
              version={version} onCambio={() => setVersion(v => v + 1)} />
          )}
          {pestana === "pendientes" && <Pendientes pendientes={listos.pendientes} puedeOperar={puedeOperar} onPagar={setAPagar} />}
          {pestana === "sin_precio" && <ListaSinPrecio filas={listos.sinPrecio} puedeOperar={puedeOperar} />}
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

function Pendientes({ pendientes, puedeOperar, onPagar }: { pendientes: Pendiente[]; puedeOperar: boolean; onPagar: (m: ParaAccion) => void }) {
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
                {puedeOperar && (
                  <Button type="button" variant="outline" size="sm" className="h-9 md:h-8"
                    onClick={() => onPagar({ id: p.id, concepto: p.concepto, sentido: p.sentido, fecha: p.fecha })}>
                    {ingreso ? "Cobrado" : "Pagado"}
                  </Button>
                )}
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

function ListaSinPrecio({ filas, puedeOperar }: { filas: SinPrecio[]; puedeOperar: boolean }) {
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
              {puedeOperar ? "Cargar precio" : "Ver"}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
