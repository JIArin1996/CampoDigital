"use client"

// Mapa de Leaflet (solo en el navegador: se carga con next/dynamic y ssr: false).
// Se maneja con la API de Leaflet directamente, sin react-leaflet.

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import { CAPAS, type IdCapa } from "@/components/potreros/mapa/capas"

export interface PoligonoPotrero {
  id: string
  nombre: string
  hectareas: string            // texto de la etiqueta ("52,3 ha")
  forma: GeoJSON.MultiPolygon
  etiqueta: GeoJSON.Point
  color: string
  punteado?: boolean
}

interface Props {
  capa: IdCapa
  poligonos: PoligonoPotrero[]
  seleccionado: string | null
  onSeleccionar: (id: string) => void
  encuadre: number             // cuando cambia, el mapa se encuadra sobre los potreros dibujados
}

// Centro de Uruguay, para cuando no hay nada dibujado
const INICIO: L.LatLngExpression = [-32.6, -56.0]

export default function MapaLeaflet({ capa, poligonos, seleccionado, onSeleccionar, encuadre }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const base = useRef<L.TileLayer | null>(null)
  const capaPotreros = useRef<L.LayerGroup | null>(null)
  const alSeleccionar = useRef(onSeleccionar)
  const ultimos = useRef(poligonos)

  useEffect(() => { alSeleccionar.current = onSeleccionar }, [onSeleccionar])
  useEffect(() => { ultimos.current = poligonos }, [poligonos])

  // El mapa se crea una vez
  useEffect(() => {
    if (!contenedor.current) return
    const m = L.map(contenedor.current, { center: INICIO, zoom: 7, maxZoom: 20 })
    m.attributionControl.setPrefix(false)
    capaPotreros.current = L.layerGroup().addTo(m)
    mapa.current = m
    // Si el contenedor cambia de tamaño (pantalla completa, panel), Leaflet se reacomoda
    const observador = new ResizeObserver(() => m.invalidateSize())
    observador.observe(contenedor.current)
    return () => {
      observador.disconnect()
      m.remove()
      mapa.current = null
      base.current = null
      capaPotreros.current = null
    }
  }, [])

  // Imagen de fondo
  useEffect(() => {
    const m = mapa.current
    const c = CAPAS.find(x => x.id === capa) ?? CAPAS[0]
    if (!m) return
    base.current?.remove()
    base.current = L.tileLayer(c.url, { attribution: c.atribucion, maxNativeZoom: c.maxNativeZoom, maxZoom: 20 }).addTo(m)
  }, [capa])

  // Potreros: un halo blanco debajo (contraste sobre la imagen), el polígono de color y el nombre con las hectáreas
  useEffect(() => {
    const grupo = capaPotreros.current
    if (!grupo) return
    grupo.clearLayers()
    for (const p of poligonos) {
      const elegido = p.id === seleccionado
      L.geoJSON(p.forma, { interactive: false, style: { color: "#ffffff", weight: elegido ? 8 : 5, opacity: 0.85, fill: false } }).addTo(grupo)
      const poligono = L.geoJSON(p.forma, {
        style: {
          color: p.color, weight: elegido ? 4 : 2.5, dashArray: p.punteado ? "6 5" : undefined,
          fillColor: p.color, fillOpacity: elegido ? 0.5 : 0.3,
        },
      })
      poligono.on("click", () => alSeleccionar.current(p.id))
      poligono.addTo(grupo)

      // El nombre lo carga el usuario: va como texto, nunca como HTML
      const etiqueta = document.createElement("div")
      const nombre = document.createElement("strong")
      nombre.textContent = p.nombre
      etiqueta.append(nombre, document.createElement("br"), document.createTextNode(p.hectareas))
      const [lng, lat] = p.etiqueta.coordinates
      L.tooltip({ permanent: true, direction: "center", className: "etiqueta-potrero", interactive: false })
        .setLatLng([lat, lng]).setContent(etiqueta).addTo(grupo)
    }
  }, [poligonos, seleccionado])

  // Encuadre sobre los potreros dibujados
  useEffect(() => {
    const m = mapa.current
    const dibujados = ultimos.current
    if (!m || dibujados.length === 0) return
    const limites = L.geoJSON(dibujados.map(p => p.forma)).getBounds()
    if (limites.isValid()) m.fitBounds(limites, { padding: [24, 24], maxZoom: 17 })
  }, [encuadre])

  return <div ref={contenedor} className="h-full w-full" />
}
