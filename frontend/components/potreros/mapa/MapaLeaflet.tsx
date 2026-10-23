"use client"

// Mapa de Leaflet (solo en el navegador: se carga con next/dynamic y ssr: false).
// Se maneja con la API de Leaflet directamente, sin react-leaflet. El dibujo y la edición de formas
// usan Geoman (versión gratuita, MIT).

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "@geoman-io/leaflet-geoman-free"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"

import { CAPAS, type IdCapa } from "@/components/potreros/mapa/capas"

export interface PoligonoPotrero {
  id: string
  nombre: string
  lineas: string[]             // debajo del nombre: hectáreas, uso, pastura o animales por categoría
  prioridad: number            // si dos etiquetas chocan, se ve la de mayor prioridad (el área)
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
  // Dibujo o edición de la forma de un potrero (se reinicia cuando cambia el objeto: "empezar de nuevo")
  edicion?: { id: string; inicial: GeoJSON.MultiPolygon | null } | null
  onFormaEditada?: (forma: GeoJSON.MultiPolygon | null) => void
}

// Polígonos que se dibujan: sin cruces, y pegándose a los vértices y bordes cercanos (alambrados compartidos)
const OPCIONES_DIBUJO = { allowSelfIntersection: false, snappable: true, snapDistance: 15 }

// Recuadro de la etiqueta: fondo blanco y texto oscuro, legible al sol sobre cualquier imagen
const ESTILO_ETIQUETA = [
  "display:inline-block", "transform:translate(-50%,-50%)", "background:rgba(255,255,255,.95)", "color:#111827",
  "border-radius:6px", "padding:3px 7px", "font-size:12px", "line-height:1.3", "white-space:nowrap",
  "box-shadow:0 1px 4px rgba(0,0,0,.4)", "pointer-events:none",
].join(";")

// Las etiquetas no se superponen: de mayor a menor prioridad, la que choca con una ya visible se oculta
// (aparece al acercarse). Se recalcula al mover, hacer zoom o cambiar de tamaño.
function ordenarEtiquetas(etiquetas: { el: HTMLElement; prioridad: number }[]) {
  const visibles: DOMRect[] = []
  for (const e of [...etiquetas].sort((a, b) => b.prioridad - a.prioridad)) {
    e.el.style.visibility = "visible"
    const r = e.el.getBoundingClientRect()
    const choca = visibles.some(v => r.left - 4 < v.right && r.right + 4 > v.left && r.top - 4 < v.bottom && r.bottom + 4 > v.top)
    if (choca) e.el.style.visibility = "hidden"
    else visibles.push(r)
  }
}

// Centro de Uruguay, para cuando no hay nada dibujado
const INICIO: L.LatLngExpression = [-32.6, -56.0]

export default function MapaLeaflet({ capa, poligonos, seleccionado, onSeleccionar, encuadre, edicion, onFormaEditada }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const base = useRef<L.TileLayer | null>(null)
  const capaPotreros = useRef<L.LayerGroup | null>(null)
  const alSeleccionar = useRef(onSeleccionar)
  const alEditar = useRef(onFormaEditada)
  const ultimos = useRef(poligonos)
  const etiquetas = useRef<{ el: HTMLElement; prioridad: number }[]>([])

  useEffect(() => { alSeleccionar.current = onSeleccionar }, [onSeleccionar])
  useEffect(() => { alEditar.current = onFormaEditada }, [onFormaEditada])
  useEffect(() => { ultimos.current = poligonos }, [poligonos])

  // El mapa se crea una vez
  useEffect(() => {
    if (!contenedor.current) return
    const m = L.map(contenedor.current, { center: INICIO, zoom: 7, maxZoom: 20 })
    m.attributionControl.setPrefix(false)
    capaPotreros.current = L.layerGroup().addTo(m)
    mapa.current = m
    const reordenar = () => ordenarEtiquetas(etiquetas.current)
    m.on("zoomend moveend", reordenar)
    // Si el contenedor cambia de tamaño (pantalla completa, panel), Leaflet se reacomoda
    const observador = new ResizeObserver(() => { m.invalidateSize(); reordenar() })
    observador.observe(contenedor.current)
    return () => {
      m.off("zoomend moveend", reordenar)
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

  // Potreros: un halo blanco debajo (contraste sobre la imagen), el polígono de color y su etiqueta
  useEffect(() => {
    const grupo = capaPotreros.current
    if (!grupo) return
    grupo.clearLayers()
    const nuevas: { el: HTMLElement; prioridad: number }[] = []
    for (const p of poligonos) {
      const elegido = p.id === seleccionado
      L.geoJSON(p.forma, { interactive: false, pmIgnore: true, style: { color: "#ffffff", weight: elegido ? 8 : 5, opacity: 0.85, fill: false } }).addTo(grupo)
      const poligono = L.geoJSON(p.forma, {
        style: {
          color: p.color, weight: elegido ? 4 : 2.5, dashArray: p.punteado ? "6 5" : undefined,
          fillColor: p.color, fillOpacity: elegido ? 0.5 : 0.3,
        },
      })
      poligono.on("click", () => alSeleccionar.current(p.id))
      poligono.addTo(grupo)

      // Lo escribe el usuario: va como texto, nunca como HTML
      const etiqueta = document.createElement("div")
      etiqueta.style.cssText = ESTILO_ETIQUETA
      const nombre = document.createElement("strong")
      nombre.textContent = p.nombre
      etiqueta.append(nombre)
      for (const linea of p.lineas) {
        const fila = document.createElement("div")
        fila.textContent = linea
        etiqueta.append(fila)
      }
      const [lng, lat] = p.etiqueta.coordinates
      L.marker([lat, lng], {
        icon: L.divIcon({ html: etiqueta, className: "", iconSize: [0, 0] }),
        interactive: false, keyboard: false, pmIgnore: true, zIndexOffset: elegido ? 1000 : 0,
      }).addTo(grupo)
      nuevas.push({ el: etiqueta, prioridad: elegido ? Infinity : p.prioridad })
    }
    etiquetas.current = nuevas
    requestAnimationFrame(() => ordenarEtiquetas(nuevas))
  }, [poligonos, seleccionado])

  // Encuadre sobre los potreros dibujados
  useEffect(() => {
    const m = mapa.current
    const dibujados = ultimos.current
    if (!m || dibujados.length === 0) return
    const limites = L.geoJSON(dibujados.map(p => p.forma)).getBounds()
    if (limites.isValid()) m.fitBounds(limites, { padding: [24, 24], maxZoom: 17 })
  }, [encuadre])

  // Dibujo y edición: una forma existente se edita arrastrando sus vértices; si no hay, se dibuja tocando las
  // esquinas y cerrando en el primer punto. Cada cambio se avisa con la forma completa (MultiPolygon).
  useEffect(() => {
    const m = mapa.current
    if (!m || !edicion) return
    m.pm.setLang("es")
    const grupo = L.featureGroup().addTo(m)

    const avisar = () => {
      const partes: GeoJSON.Position[][][] = []
      grupo.eachLayer(capa => {
        const g = (capa as L.Polygon).toGeoJSON().geometry
        if (g.type === "Polygon") partes.push(g.coordinates)
        else if (g.type === "MultiPolygon") partes.push(...g.coordinates)
      })
      alEditar.current?.(partes.length > 0 ? { type: "MultiPolygon", coordinates: partes } : null)
    }
    const hacerEditable = (capa: L.Polygon) => {
      grupo.addLayer(capa)
      capa.pm.enable(OPCIONES_DIBUJO)
      capa.on("pm:edit", avisar)
    }
    const alCrear = (e: { layer: L.Layer }) => {
      m.pm.disableDraw()
      hacerEditable(e.layer as L.Polygon)
      avisar()
    }

    if (edicion.inicial) {
      for (const poligono of edicion.inicial.coordinates) {
        hacerEditable(L.polygon(poligono.map(anillo => anillo.map(([lng, lat]) => [lat, lng] as L.LatLngTuple))))
      }
      m.fitBounds(grupo.getBounds(), { padding: [24, 24], maxZoom: 18 })
      avisar()
    } else {
      m.on("pm:create", alCrear)
      m.pm.enableDraw("Polygon", {
        ...OPCIONES_DIBUJO,
        pathOptions: { color: "#d95926", weight: 3, fillOpacity: 0.3 },
      })
    }

    return () => {
      m.off("pm:create", alCrear)
      m.pm.disableDraw()
      grupo.eachLayer(capa => (capa as L.Polygon).pm.disable())
      grupo.remove()
    }
  }, [edicion])

  return <div ref={contenedor} className="h-full w-full" />
}
