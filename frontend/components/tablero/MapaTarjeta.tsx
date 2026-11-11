"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"

import { CAPA_POR_DEFECTO } from "@/components/potreros/mapa/capas"
import { NEUTRO } from "@/components/potreros/mapa/colores"
import type { PoligonoPotrero } from "@/components/potreros/mapa/MapaLeaflet"
import { getFormasPotreros, getPotreros, type FormaPotrero } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import type { Unidad } from "@/components/tablero/catalogo"
import { formato } from "@/components/tablero/formato"
import type { FilaTablero } from "@/types/tablero"

// Leaflet usa window: el mapa se carga solo en el navegador
const MapaLeaflet = dynamic(() => import("@/components/potreros/mapa/MapaLeaflet"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
})

// De menos a más (naranjas de la paleta del mapa de Potreros); con meta, verde si cumple y ámbar si no
const ESCALA = ["#f0a070", "#d95926", "#8a3210"]
const CUMPLE = "#199e70"
const NO_CUMPLE = "#d97706"

// Las formas y los nombres de los potreros, una vez por establecimiento (varias tarjetas de mapa no los piden de nuevo)
const CACHE = new Map<string, Promise<{ formas: FormaPotrero[]; nombres: Map<string, string> }>>()
function formasDe(estId: string) {
  let p = CACHE.get(estId)
  if (!p) {
    p = Promise.all([getFormasPotreros(estId), getPotreros(estId)])
      .then(([formas, potreros]) => ({ formas, nombres: new Map(potreros.map(x => [x.id, x.nombre])) }))
    p.catch(() => CACHE.delete(estId))
    CACHE.set(estId, p)
  }
  return p
}

interface Tramo { color: string; nombre: string; punteado?: boolean }

/**
 * Tarjeta de mapa (etapa 8b): los potreros dibujados, coloreados por el valor de la medida abierta por potrero (ej.
 * la carga). Sin meta, tres tonos de menos a más (cortes en los tercios de los valores); con meta, verde si cumple y
 * ámbar si no. Los potreros sin valor o en 0 van en gris punteado. La rueda del mouse no hace zoom (se baja la página).
 */
export function MapaTarjeta({ estId, filas, unidad, meta }: {
  estId: string
  filas: FilaTablero[]
  unidad: Unidad
  meta?: { valor: number; mejor: "sube" | "baja" }
}) {
  const [datos, setDatos] = useState<{ estId: string; formas: FormaPotrero[]; nombres: Map<string, string> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fmt = (n: number) => formato(n, unidad)

  useEffect(() => {
    let vigente = true
    formasDe(estId)
      .then(d => { if (vigente) setDatos({ estId, ...d }) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los potreros")) })
    return () => { vigente = false }
  }, [estId])

  const valores = useMemo(() => new Map(filas.filter(f => f.clave).map(f => [f.clave!, f.valor])), [filas])

  // Cortes en los tercios de los valores positivos
  const cortes = useMemo(() => {
    const v = [...valores.values()].filter((x): x is number => x !== null && x > 0).sort((a, b) => a - b)
    if (v.length === 0) return null
    return [v[Math.floor(v.length / 3)], v[Math.floor((2 * v.length) / 3)]]
  }, [valores])

  const tramoDe = (valor: number | null | undefined): Tramo => {
    if (valor === null || valor === undefined || valor <= 0) return { color: NEUTRO, nombre: "Sin animales o sin dato", punteado: true }
    if (meta) {
      const cumple = meta.mejor === "baja" ? valor <= meta.valor : valor >= meta.valor
      return cumple ? { color: CUMPLE, nombre: "Cumple la meta" } : { color: NO_CUMPLE, nombre: "No cumple la meta" }
    }
    const i = !cortes ? 0 : valor < cortes[0] ? 0 : valor < cortes[1] ? 1 : 2
    return { color: ESCALA[i], nombre: "" }
  }

  const poligonos: PoligonoPotrero[] = useMemo(() => {
    if (!datos || datos.estId !== estId) return []
    return datos.formas.map(f => {
      const valor = valores.get(f.id)
      const t = tramoDe(valor)
      const texto = valor === null || valor === undefined ? "Sin dato" : formato(valor, unidad)
      return {
        id: f.id, nombre: datos.nombres.get(f.id) ?? "Potrero", lineas: [texto], resumen: texto, cabezas: valor ?? 0,
        forma: f.forma, etiqueta: f.etiqueta, color: t.color, punteado: t.punteado,
        zonas: f.zonas.map(z => ({ forma: z.forma, color: z.color })),
      }
    })
    // tramoDe depende de meta y cortes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, estId, valores, unidad, meta, cortes])

  // Leyenda: sin meta, los tres tonos con sus cortes; con meta, cumple / no cumple
  const leyenda: Tramo[] = meta
    ? [{ color: CUMPLE, nombre: `Cumple (meta ${fmt(meta.valor)})` }, { color: NO_CUMPLE, nombre: "No cumple" }]
    : cortes
      ? [{ color: ESCALA[0], nombre: `Menos de ${fmt(cortes[0])}` }, { color: ESCALA[1], nombre: `${fmt(cortes[0])} a ${fmt(cortes[1])}` },
         { color: ESCALA[2], nombre: `${fmt(cortes[1])} o más` }]
      : []

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (datos && datos.estId === estId && datos.formas.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay potreros dibujados: se dibujan en Potreros.</p>
  }
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="min-h-0 flex-1 overflow-hidden rounded-md">
        {poligonos.length > 0
          ? <MapaLeaflet capa={CAPA_POR_DEFECTO} poligonos={poligonos} seleccionado={null} onSeleccionar={() => {}} encuadre={poligonos.length} sinRueda />
          : <div className="h-full w-full animate-pulse bg-muted" aria-label="Cargando el mapa" />}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {[...leyenda, { color: NEUTRO, nombre: "Sin animales o sin dato", punteado: true }].map(t => (
          <li key={t.nombre} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: t.color, opacity: t.punteado ? 0.6 : 1 }} aria-hidden />
            {t.nombre}
          </li>
        ))}
      </ul>
    </div>
  )
}
