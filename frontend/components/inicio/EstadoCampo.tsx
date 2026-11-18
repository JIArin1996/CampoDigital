"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { getMovimientosDesde, type MovimientosMes } from "@/lib/queries/inicio"
import { getStockEstablecimiento } from "@/lib/queries/lotes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { colorDeEspecie } from "@/components/lotes/agrupacion"
import type { Especie } from "@/types/lotes"

const MES = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("es-UY", { month: "long" })
const numero = (n: number) => n.toLocaleString("es-UY")

/**
 * Estado del campo: cabezas de cada especie (color y orden del sistema) y, debajo de cada una, los nacidos,
 * muertes y vendidos del mes en curso. El detalle por categoría está en Lotes.
 */
export function EstadoCampo({ estId, especies, hoy }: { estId: string; especies: Especie[]; hoy: string }) {
  const desde = hoy.slice(0, 8) + "01"
  const clave = `${estId}:${desde}`
  const [datos, setDatos] = useState<{ clave: string; stock: Map<string, number>; mes: MovimientosMes } | null>(null)

  useEffect(() => {
    let vigente = true
    Promise.all([getStockEstablecimiento(estId), getMovimientosDesde(estId, desde)])
      .then(([filas, mes]) => {
        if (!vigente) return
        const stock = new Map<string, number>()
        for (const f of filas) stock.set(f.especie_id!, (stock.get(f.especie_id!) ?? 0) + (f.cabezas ?? 0))
        setDatos({ clave, stock, mes })
      })
      .catch(() => { if (vigente) setDatos({ clave, stock: new Map(), mes: new Map() }) })
    return () => { vigente = false }
  }, [estId, desde, clave])

  const listos = datos?.clave === clave ? datos : null
  // Especies con animales hoy o con movimientos en el mes (una que se vendió entera igual se ve)
  const filas = listos
    ? especies.filter(e => (listos.stock.get(e.id) ?? 0) > 0 || listos.mes.has(e.id))
    : []
  const mes = MES(hoy)

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Estado del campo</CardTitle>
          <Link href="/lotes" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
            Lotes <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {!listos ? (
          <div className="h-20 rounded bg-muted animate-pulse" />
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay animales cargados.</p>
        ) : (
          // Celular: una especie debajo de la otra; computadora: una al lado de la otra
          <ul className="divide-y md:grid md:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] md:gap-x-6 md:gap-y-4 md:divide-y-0">
            {filas.map(e => {
              const cabezas = listos.stock.get(e.id) ?? 0
              const m = listos.mes.get(e.id) ?? { nacidos: 0, muertes: 0, vendidos: 0 }
              return (
                <li key={e.id} className="py-3 first:pt-1 last:pb-0 md:py-0 md:first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-base font-semibold">
                      <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colorDeEspecie(e) }} />
                      {e.nombre}
                    </span>
                    <span className="text-right">
                      <span className="text-3xl font-bold tabular-nums leading-none">{numero(cabezas)}</span>
                      <span className="ml-1 text-sm text-muted-foreground">{cabezas === 1 ? "cabeza" : "cabezas"}</span>
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {([["Nacidos", m.nacidos], ["Muertes", m.muertes], ["Vendidos", m.vendidos]] as const).map(([t, v]) => (
                      <div key={t} className="rounded-lg bg-muted/60 px-2 py-1.5">
                        <dt className="text-xs text-muted-foreground">{t}</dt>
                        <dd className="text-lg font-bold tabular-nums leading-tight">{numero(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              )
            })}
          </ul>
        )}
        {listos && filas.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Nacidos, muertes y vendidos de {mes}</p>
        )}
      </CardContent>
    </Card>
  )
}
