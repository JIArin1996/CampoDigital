"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronRight, ShieldAlert } from "lucide-react"

import { getActividades, getCarencias } from "@/lib/queries/actividades"
import { getPendientes, getResultado, getSinPrecio } from "@/lib/queries/economia"
import { getIndicadores } from "@/lib/queries/indicadores"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TarjetaActividad } from "@/components/actividades/TarjetaActividad"
import { etiquetaPeriodo, periodoActual, rangoPeriodo, usd } from "@/components/economia/formato"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import type { ActividadResumen, Carencia } from "@/types/actividades"
import type { Indicadores } from "@/types/indicadores"
import type { Especie } from "@/types/lotes"

// Cada bloque carga lo suyo: si uno falla o tarda, el resto del inicio se ve igual.
function useCarga<T>(clave: string | null, cargar: () => Promise<T>) {
  const [estado, setEstado] = useState<{ clave: string; datos: T } | null>(null)
  useEffect(() => {
    if (!clave) return
    let vigente = true
    cargar().then(datos => { if (vigente) setEstado({ clave, datos }) }).catch(() => { /* el bloque queda sin datos */ })
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave identifica la carga
  }, [clave])
  return estado?.clave === clave ? estado.datos : null
}

const enlace = (href: string, texto: string) => (
  <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary min-h-11">
    {texto} <ChevronRight className="h-4 w-4" />
  </Link>
)

const Esqueleto = () => <div className="h-24 rounded-lg border bg-muted/30 animate-pulse" />

// ── Economía del ejercicio en curso (solo quien puede ver la plata) ──
export function BloqueEconomia({ estId }: { estId: string }) {
  const periodo = periodoActual()
  const { desde, hasta } = rangoPeriodo(periodo)
  const datos = useCarga(`eco:${estId}:${desde}`, () =>
    Promise.all([getResultado(estId, desde, hasta), getPendientes(estId), getSinPrecio(estId)]))
  if (!datos) return <Esqueleto />
  const [resultado, pendientes, sinPrecio] = datos
  const suma = (campo: "ingresos_usd" | "egresos_usd" | "resultado_usd") => resultado.reduce((s, f) => s + Number(f[campo]), 0)
  const porCobrar = pendientes.filter(p => p.sentido === "ingreso").reduce((s, p) => s + Number(p.monto_usd), 0)
  const porPagar = pendientes.filter(p => p.sentido === "egreso").reduce((s, p) => s + Number(p.monto_usd), 0)

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Economía · {etiquetaPeriodo(periodo)}</CardTitle>
          {enlace("/economia", "Ver")}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-3xl font-bold tabular-nums">{usd(suma("resultado_usd"))}</p>
          <p className="text-xs text-muted-foreground tabular-nums">Ingresos {usd(suma("ingresos_usd"))} · Egresos {usd(suma("egresos_usd"))}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border px-3 py-2">
            <p className="text-xs text-muted-foreground">Por cobrar</p>
            <p className="font-semibold tabular-nums">{usd(porCobrar)}</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-xs text-muted-foreground">Por pagar</p>
            <p className="font-semibold tabular-nums">{usd(porPagar)}</p>
          </div>
        </div>
        {sinPrecio.length > 0 && (
          <Link href="/economia" className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {sinPrecio.length} {sinPrecio.length === 1 ? "compra o venta sin precio" : "compras y ventas sin precio"}: el resultado no las cuenta.
            </span>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

// ── Indicadores de la última temporada con servicios, por especie ──
export function BloqueIndicadores({ estId, especies }: { estId: string; especies: Especie[] }) {
  const filas = useCarga(`ind:${estId}`, () => getIndicadores(estId))
  if (!filas) return <Esqueleto />
  const ultimas = especies
    .map(e => ({ especie: e, fila: filas.find(f => f.especie_id === e.id && f.temporada !== null && f.entoradas > 0) }))
    .filter((x): x is { especie: Especie; fila: Indicadores } => !!x.fila)
  if (ultimas.length === 0) return null

  const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-UY", { maximumFractionDigits: 1 })} %`)
  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Indicadores reproductivos</CardTitle>
          {enlace("/indicadores", "Ver")}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ultimas.map(({ especie, fila }) => (
          <div key={especie.id}>
            <p className="text-sm font-semibold mb-1">
              {especie.nombre} · Temporada {fila.temporada}/{String(fila.temporada! + 1).slice(2)}
              <span className="font-normal text-muted-foreground"> · {fila.entoradas} entoradas</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([["Preñez", fila.pct_prenez], ["Parición", fila.pct_paricion], ["Destete", fila.pct_destete]] as const).map(([t, v]) => (
                <div key={t} className="rounded-lg border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t}</p>
                  <p className="text-lg font-bold tabular-nums">{pct(v)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ── Lotes en carencia hoy (aviso para no vender) ──
export function BloqueCarencias({ lotes }: { lotes: { id: string; nombre: string }[] }) {
  const hoy = hoyLocal()
  const ids = lotes.map(l => l.id)
  const carencias = useCarga(ids.length > 0 ? `car:${ids.join(",")}:${hoy}` : null, () => getCarencias(ids, hoy))
  if (!carencias || carencias.length === 0) return null

  const porLote = new Map<string, Carencia>()
  for (const c of carencias) {
    const actual = porLote.get(c.lote_id)
    if (!actual || c.fin_carencia > actual.fin_carencia) porLote.set(c.lote_id, c)
  }
  const nombre = (id: string) => lotes.find(l => l.id === id)?.nombre ?? "Lote"

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4" /> Lotes en carencia
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {[...porLote.values()].sort((a, b) => b.fin_carencia.localeCompare(a.fin_carencia)).map(c => (
            <li key={c.lote_id} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/lotes/${c.lote_id}`} className="font-medium text-primary">{nombre(c.lote_id)}</Link>
              <span className="text-sm text-muted-foreground">hasta el {fechaCorta(c.fin_carencia)} · {c.producto}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ── Últimas actividades ──
export function BloqueActividades({ estId, nombresLote }: { estId: string; nombresLote: Map<string, string> }) {
  const actividades = useCarga(`act:${estId}`, () => getActividades(estId, { limite: 5 }))
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Últimas actividades</h2>
        {enlace("/actividades", "Actividades")}
      </div>
      {!actividades ? <Esqueleto /> : actividades.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay actividades.</p>
      ) : (
        <ul className="space-y-2">
          {actividades.map((a: ActividadResumen) => <li key={a.id}><TarjetaActividad actividad={a} nombresLote={nombresLote} /></li>)}
        </ul>
      )}
    </section>
  )
}
