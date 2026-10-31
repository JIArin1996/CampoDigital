"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import type L from "leaflet"

import { potrerosDePrueba } from "@/components/potreros/mapa/datosDePrueba"

const MapaLeaflet = dynamic(() => import("@/components/potreros/mapa/MapaLeaflet"), { ssr: false })

// Pares de etiquetas (o círculos) del mapa que se tocan, medidos en la pantalla
function contar(contenedor: HTMLElement) {
  const els = [...contenedor.querySelectorAll<HTMLElement>("[data-id] > [data-ocupa]")]
  const rs = els.map(e => e.getBoundingClientRect())
  let pisadas = 0
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j]
    if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) pisadas++
  }
  const niveles: Record<string, number> = {}
  for (const e of els) niveles[e.dataset.ocupa!] = (niveles[e.dataset.ocupa!] ?? 0) + 1
  const guias = [...contenedor.querySelectorAll<SVGSVGElement>(".leaflet-marker-icon svg")].filter(s => s.style.display !== "none").length
  // Lo que hay que comparar al arrastrar: qué nivel muestra cada potrero y dónde, respecto de su punto
  const posiciones = els.map(e => `${e.parentElement!.dataset.id}:${e.dataset.ocupa}:${e.style.transform}`).join("|")
  return { identificados: els.length, pisadas, niveles, guias, posiciones }
}

/**
 * /dev/etiquetas?n=25&zoom=15&ancho=375: potreros inventados y un informe arriba con superposiciones, niveles, guías,
 * potreros identificados, si las etiquetas se mueven al arrastrar y cuánto tarda la colocación.
 */
export function PruebaEtiquetas() {
  const params = useSearchParams()
  const n = Math.min(Math.max(Number(params.get("n")) || 25, 1), 200)
  const zoomPedido = params.get("zoom") ? Number(params.get("zoom")) : null
  const ancho = Number(params.get("ancho")) || null    // ?ancho=375: el mapa con el ancho de un celular
  const poligonos = useMemo(() => potrerosDePrueba(n), [n])
  const [mapa, setMapa] = useState<L.Map | null>(null)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [numerados, setNumerados] = useState<{ id: string; numero: number }[]>([])
  const [informe, setInforme] = useState("Calculando…")

  useEffect(() => {
    if (!mapa) return
    if (zoomPedido !== null) mapa.setZoom(zoomPedido, { animate: false })
    let espera: ReturnType<typeof setTimeout>
    let arrastre = "sin probar"
    const revisar = (probarArrastre: boolean) => {
      const c = mapa.getContainer()
      const antes = contar(c)
      if (probarArrastre) {
        // Arrastra, espera más que la espera del recálculo y compara
        mapa.panBy([160, 90], { animate: false })
        espera = setTimeout(() => {
          arrastre = contar(c).posiciones === antes.posiciones ? "no se mueven" : "SE MUEVEN"
          mapa.panBy([-160, -90], { animate: false })
          revisar(false)
        }, 300)
        return
      }
      setInforme([
        `zoom ${mapa.getZoom()} · ${c.clientWidth}×${c.clientHeight}px · ${n} potreros`,
        `superpuestas: ${antes.pisadas} · identificados: ${antes.identificados}/${n}`,
        `niveles: ${Object.entries(antes.niveles).map(([k, v]) => `${k} ${v}`).join(", ")} · guías: ${antes.guias}`,
        `al arrastrar: ${arrastre} · colocación: ${c.dataset.colocacionMs ?? "?"} ms`,
      ].join("\n"))
    }
    espera = setTimeout(() => revisar(true), 500)
    const alZoom = () => { clearTimeout(espera); espera = setTimeout(() => revisar(false), 300) }
    mapa.on("zoomend", alZoom)
    return () => { clearTimeout(espera); mapa.off("zoomend", alZoom) }
  }, [mapa, zoomPedido, n])

  const nombre = (id: string) => poligonos.find(p => p.id === id)?.nombre
  return (
    <div className="fixed inset-y-0 left-0 z-[100] bg-muted" style={{ width: ancho ?? "100%" }}>
      <MapaLeaflet capa="esri" poligonos={poligonos} seleccionado={seleccionado} onSeleccionar={setSeleccionado}
        encuadre={0} onNumerados={setNumerados} onMapa={setMapa} />
      <pre data-informe className="absolute bottom-6 left-2 z-[1000] max-w-[calc(100%-1rem)] whitespace-pre-wrap rounded-lg bg-background/95 px-3 py-2 text-xs shadow">
        {informe}
        {numerados.length > 0 && `\nnumerados: ${numerados.map(x => `${x.numero} ${nombre(x.id)}`).join(", ")}`}
        {seleccionado && `\nelegido: ${nombre(seleccionado)}`}
      </pre>
    </div>
  )
}
