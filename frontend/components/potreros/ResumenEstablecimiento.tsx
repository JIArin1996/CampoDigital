"use client"

import { AlertTriangle } from "lucide-react"

import { diasDesde, numero, textoDias, totales, type LoteEnPotrero } from "@/components/potreros/ocupacion"
import type { FormaPotrero } from "@/lib/queries/potreros"
import { cn } from "@/lib/utils"
import type { Potrero } from "@/types/database"

const MAXIMO = 3   // cuántos potreros se listan en "Más días de descanso" ("Más días en el potrero" los lista todos)

/**
 * Resumen de todo el establecimiento cuando no hay un potrero elegido: superficie (la suma de los potreros
 * dibujados; los sin dibujar no suman), potreros con animales y en descanso, cabezas por especie, UG y carga
 * global (solo de los potreros dibujados), los
 * potreros que más descansan y todos los potreros con animales, de más días a menos (el potrero
 * destacado, sus lotes abajo, más chicos). Tocar uno lo elige en el mapa.
 */
export function ResumenEstablecimiento({ potreros, formas, ocupacion, salidas, onSeleccionar }: {
  potreros: Potrero[]                       // los activos
  formas: Map<string, FormaPotrero>
  ocupacion: Map<string, LoteEnPotrero[]>
  salidas: Map<string, string>
  onSeleccionar: (potreroId: string) => void
}) {
  const dibujados = potreros.filter(p => formas.has(p.id))
  const sinDibujar = potreros.length - dibujados.length
  const superficie = dibujados.reduce((s, p) => s + formas.get(p.id)!.area_ha, 0)
  // Área efectiva (sin las zonas no aprovechables): la carga va sobre ella
  const efectiva = dibujados.reduce((s, p) => s + (formas.get(p.id)!.superficie_efectiva ?? formas.get(p.id)!.area_ha), 0)
  const adentro = potreros.flatMap(p => (ocupacion.get(p.id) ?? []).map(l => ({ ...l, potrero: p })))
  const { cabezas, sinUg } = totales(adentro)
  // La carga: los animales de los potreros dibujados sobre su superficie
  const { ug } = totales(adentro.filter(l => formas.has(l.potrero.id)))
  const conAnimales = potreros.filter(p => (ocupacion.get(p.id) ?? []).length > 0)
  const vacios = potreros.filter(p => (ocupacion.get(p.id) ?? []).length === 0)

  const porEspecie = new Map<string, number>()
  for (const l of adentro) porEspecie.set(l.especie || "Sin especie", (porEspecie.get(l.especie || "Sin especie") ?? 0) + l.cabezas)

  const descansos = vacios
    .filter(p => salidas.has(p.id))
    .map(p => ({ p, dias: diasDesde(salidas.get(p.id)!) }))
    .sort((a, b) => b.dias - a.dias || a.p.nombre.localeCompare(b.p.nombre, "es"))
  const sinRegistro = vacios.length - descansos.length
  // Todos los potreros con animales, de más días a menos: los días del lote que más lleva en él
  // (sin fecha de ingreso registrada, al final)
  const permanencias = conAnimales
    .map(p => {
      const lotes = ocupacion.get(p.id) ?? []
      const dias = lotes.filter(l => l.desde).map(l => diasDesde(l.desde!))
      return { p, lotes: lotes.map(l => l.lote.nombre).join(", "), dias: dias.length > 0 ? Math.max(...dias) : null }
    })
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1) || a.p.nombre.localeCompare(b.p.nombre, "es"))

  const dato = (titulo: string, valor: React.ReactNode, detalle?: React.ReactNode) => (
    <div>
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
      {detalle && <dd className="text-muted-foreground">{detalle}</dd>}
    </div>
  )
  const fila = (id: string, clave: string, titulo: string, detalle: string, dias: number | null) => (
    <li key={clave}>
      <button type="button" onClick={() => onSeleccionar(id)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-accent md:min-h-9">
        <span className="min-w-0">
          <span className="block truncate font-medium">{titulo}</span>
          {detalle && <span className="block truncate text-muted-foreground">{detalle}</span>}
        </span>
        <span className={cn("shrink-0 tabular-nums", dias === null && "text-muted-foreground")}>{dias === null ? "sin fecha" : textoDias(dias)}</span>
      </button>
    </li>
  )

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h2 className="text-lg font-bold">Resumen del establecimiento</h2>
        <p className="text-muted-foreground">Tocá un potrero en el mapa para ver su detalle.</p>
      </div>

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
        {dato("Superficie", dibujados.length > 0
          ? (efectiva < superficie ? `${numero(superficie, 1)} ha · ${numero(efectiva, 1)} efectivas` : `${numero(superficie, 1)} ha`) : "—",
          `${potreros.length} ${potreros.length === 1 ? "potrero" : "potreros"}${sinDibujar > 0 ? ` · ${sinDibujar} sin dibujar (no suman)` : ""}`)}
        {dato("Potreros", `${conAnimales.length} con animales`, `${vacios.length} en descanso`)}
        {dato("Animales en potreros", `${cabezas.toLocaleString("es-UY")} ${cabezas === 1 ? "cabeza" : "cabezas"}`,
          [...porEspecie].map(([e, n]) => `${e} ${n.toLocaleString("es-UY")}`).join(" · ") || null)}
        {dato("Carga global", efectiva > 0 ? `${numero(ug / efectiva, 2)} UG/ha` : "—", `${numero(ug, 1)} UG`)}
      </dl>

      {sinUg.length > 0 && (
        <p className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          Sin equivalencia en UG: {sinUg.join(", ")} (no suman).
        </p>
      )}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
      {(descansos.length > 0 || sinRegistro > 0) && (
        <section className="space-y-1.5">
          <h3 className="font-semibold">Más días de descanso</h3>
          {descansos.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {descansos.slice(0, MAXIMO).map(({ p, dias }) => fila(p.id, p.id, p.nombre, "", dias))}
            </ul>
          )}
          {sinRegistro > 0 && (
            <p className="text-muted-foreground">
              {sinRegistro === 1 ? "1 potrero vacío" : `${sinRegistro} potreros vacíos`} sin animales registrados
            </p>
          )}
        </section>
      )}

      {permanencias.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="font-semibold">Más días en el potrero</h3>
          <ul className="divide-y rounded-lg border">
            {permanencias.map(({ p, lotes, dias }) => fila(p.id, p.id, p.nombre, lotes, dias))}
          </ul>
        </section>
      )}
      </div>
    </div>
  )
}
