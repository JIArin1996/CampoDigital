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
import { DIAMETRO_CIRCULO, colocarEtiquetas, type Colocacion, type Tamano } from "@/components/potreros/mapa/etiquetas"

export interface PoligonoPotrero {
  id: string
  nombre: string
  lineas: string[]             // etiqueta completa, debajo del nombre: hectáreas, uso, pastura o animales por categoría
  resumen: string              // etiqueta compacta, debajo del nombre: total de cabezas o "Vacío"
  cabezas: number              // las etiquetas se ubican de más a menos cabezas (vacío: etiqueta más tenue)
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
  // Los potreros que a este zoom quedaron como círculo numerado (no entró ni el nombre), para listarlos
  onNumerados?: (numerados: { id: string; numero: number }[]) => void
  onMapa?: (m: L.Map | null) => void   // solo para la página de prueba de desarrollo
}

// Polígonos que se dibujan: sin cruces, y pegándose a los vértices y bordes cercanos (alambrados compartidos)
const OPCIONES_DIBUJO = { allowSelfIntersection: false, snappable: true, snapDistance: 15 }

// Recuadro de la etiqueta: fondo blanco y texto oscuro, legible al sol sobre cualquier imagen. Los vacíos, más tenues.
const SOMBRA = "0 1px 4px rgba(0,0,0,.4)"
const ESTILO_ETIQUETA = [
  "position:absolute", "left:0", "top:0", "background:rgba(255,255,255,.95)", "color:#111827",
  "border-radius:6px", "padding:3px 7px", "font-size:12px", "line-height:1.3", "white-space:nowrap",
  `box-shadow:${SOMBRA}`, "pointer-events:none",
].join(";")
const ESTILO_VACIO = "background:rgba(255,255,255,.8);color:#4b5563"
const ESTILO_CIRCULO = [
  "position:absolute", "left:0", "top:0", "box-sizing:border-box", `width:${DIAMETRO_CIRCULO}px`, `height:${DIAMETRO_CIRCULO}px`,
  "border-radius:50%", "border:2px solid #fff", "background:#111827", "color:#fff", "font-size:12px", "font-weight:700",
  "line-height:1", "display:flex", "align-items:center", "justify-content:center", `box-shadow:${SOMBRA}`, "pointer-events:none",
].join(";")
const RESALTE = `0 0 0 2px #111827, ${SOMBRA}`   // el potrero elegido

// Una etiqueta en el mapa: sus tres niveles armados una vez, el círculo de último recurso y la línea guía
interface Etiqueta {
  p: PoligonoPotrero
  caja: HTMLElement            // el marcador, en el punto del potrero
  cajaGuia: HTMLElement        // otro marcador en el mismo punto, debajo de todas las etiquetas
  niveles: HTMLElement[]       // completa, compacta, mínima
  circulo: HTMLElement
  guia: SVGSVGElement
  tamanos: Tamano[] | null     // medidos del DOM (no cambian con el zoom)
}

const SVG = "http://www.w3.org/2000/svg"

// Lo escribe el usuario: va como texto, nunca como HTML
function recuadro(nombre: string, lineas: string[], vacio: boolean, elegido: boolean, nivel: string) {
  const el = document.createElement("div")
  el.style.cssText = ESTILO_ETIQUETA + (vacio ? `;${ESTILO_VACIO}` : "") + (elegido ? `;box-shadow:${RESALTE}` : "")
  el.dataset.ocupa = nivel
  const n = document.createElement("strong")
  n.textContent = nombre
  el.append(n)
  for (const linea of lineas) {
    const fila = document.createElement("div")
    fila.textContent = linea
    el.append(fila)
  }
  return el
}

function crearEtiqueta(p: PoligonoPotrero, elegido: boolean): Etiqueta {
  const vacio = p.cabezas === 0
  const caja = document.createElement("div")
  caja.dataset.id = p.id
  const cajaGuia = document.createElement("div")
  const circulo = document.createElement("div")
  circulo.style.cssText = ESTILO_CIRCULO + (elegido ? `;box-shadow:${RESALTE}` : "")
  circulo.dataset.ocupa = "numero"
  circulo.setAttribute("aria-label", p.nombre)
  // Línea guía: trazo blanco fino con borde oscuro (se ve sobre cualquier imagen) y un punto en el potrero
  const guia = document.createElementNS(SVG, "svg")
  guia.setAttribute("style", "position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;display:none")
  for (const [color, ancho] of [["rgba(17,24,39,.75)", "3"], ["#ffffff", "1.5"]]) {
    const linea = document.createElementNS(SVG, "line")
    linea.setAttribute("stroke", color)
    linea.setAttribute("stroke-width", ancho)
    linea.setAttribute("stroke-linecap", "round")
    guia.append(linea)
  }
  const punto = document.createElementNS(SVG, "circle")
  punto.setAttribute("r", "3")
  punto.setAttribute("fill", "#ffffff")
  punto.setAttribute("stroke", "#111827")
  punto.setAttribute("stroke-width", "1.5")
  guia.append(punto)
  cajaGuia.append(guia)
  return {
    p, caja, cajaGuia, circulo, guia, tamanos: null,
    niveles: [
      recuadro(p.nombre, p.lineas, vacio, elegido, "completa"),
      recuadro(p.nombre, [p.resumen], vacio, elegido, "compacta"),
      recuadro(p.nombre, [], vacio, elegido, "minima"),
    ],
  }
}

// Las medidas reales de cada nivel, dentro del mapa (misma letra que en los marcadores)
function medir(lista: Etiqueta[], contenedor: HTMLElement) {
  const medidor = document.createElement("div")
  medidor.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none"
  contenedor.append(medidor)
  for (const e of lista) {
    medidor.append(...e.niveles)
    e.tamanos = e.niveles.map(n => ({ w: n.offsetWidth, h: n.offsetHeight }))
  }
  medidor.remove()
}

function mostrar(e: Etiqueta, c: Colocacion) {
  const el = c.nivel === null ? e.circulo : e.niveles[c.nivel]
  const t = c.nivel === null ? { w: DIAMETRO_CIRCULO, h: DIAMETRO_CIRCULO } : e.tamanos![c.nivel]
  if (c.numero !== null) e.circulo.textContent = String(c.numero)
  el.style.transform = `translate(${c.dx - t.w / 2}px, ${c.dy - t.h / 2}px)`
  if (c.guia) {
    for (const linea of e.guia.querySelectorAll("line")) {
      linea.setAttribute("x2", String(c.guia.x))
      linea.setAttribute("y2", String(c.guia.y))
    }
    e.guia.style.display = ""
  } else {
    e.guia.style.display = "none"
  }
  e.caja.replaceChildren(el)
}

// Centro de Uruguay, para cuando no hay nada dibujado
const INICIO: L.LatLngExpression = [-32.6, -56.0]

export default function MapaLeaflet({ capa, poligonos, seleccionado, onSeleccionar, encuadre, edicion, onFormaEditada, onNumerados, onMapa }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const base = useRef<L.TileLayer | null>(null)
  const capaPotreros = useRef<L.LayerGroup | null>(null)
  const alSeleccionar = useRef(onSeleccionar)
  const alEditar = useRef(onFormaEditada)
  const ultimos = useRef(poligonos)
  const etiquetas = useRef<Etiqueta[]>([])
  const alNumerar = useRef(onNumerados)
  const alCrearMapa = useRef(onMapa)
  const ultimosNumerados = useRef("")

  useEffect(() => { alSeleccionar.current = onSeleccionar }, [onSeleccionar])
  useEffect(() => { alEditar.current = onFormaEditada }, [onFormaEditada])
  useEffect(() => { ultimos.current = poligonos }, [poligonos])
  useEffect(() => { alNumerar.current = onNumerados }, [onNumerados])

  // Ubica todas las etiquetas (estén o no en pantalla) en píxeles del zoom actual: arrastrar el mapa no las mueve
  const colocar = useRef(() => {
    const m = mapa.current
    const lista = etiquetas.current
    if (!m) return
    const inicio = performance.now()
    if (lista.some(e => !e.tamanos)) medir(lista, m.getContainer())
    // Con el mapa oculto todo mide 0: se mide de nuevo cuando aparezca (lo avisa el cambio de tamaño)
    if (lista.some(e => e.tamanos!.some(t => t.w === 0))) {
      for (const e of lista) e.tamanos = null
      return
    }
    const zoom = m.getZoom()
    const colocadas = colocarEtiquetas(lista.map(e => {
      const [lng, lat] = e.p.etiqueta.coordinates
      const punto = m.project([lat, lng], zoom)
      return { id: e.p.id, nombre: e.p.nombre, cabezas: e.p.cabezas, x: punto.x, y: punto.y, tamanos: e.tamanos! }
    }))
    for (const e of lista) mostrar(e, colocadas.get(e.p.id)!)
    m.getContainer().dataset.colocacionMs = (performance.now() - inicio).toFixed(1)

    const numerados = [...colocadas].filter(([, c]) => c.numero !== null).map(([id, c]) => ({ id, numero: c.numero! }))
      .sort((a, b) => a.numero - b.numero)
    const clave = numerados.map(n => `${n.numero}:${n.id}`).join(",")
    if (clave !== ultimosNumerados.current) {
      ultimosNumerados.current = clave
      alNumerar.current?.(numerados)
    }
  })

  // El mapa se crea una vez
  useEffect(() => {
    if (!contenedor.current) return
    const m = L.map(contenedor.current, { center: INICIO, zoom: 7, maxZoom: 20 })
    m.attributionControl.setPrefix(false)
    capaPotreros.current = L.layerGroup().addTo(m)
    mapa.current = m
    const avisarMapa = alCrearMapa.current
    avisarMapa?.(m)
    // Al cambiar el zoom o el tamaño, con una espera corta. Al desplazar no: las posiciones no dependen del encuadre.
    let espera: ReturnType<typeof setTimeout> | undefined
    const recolocar = () => { clearTimeout(espera); espera = setTimeout(colocar.current, 80) }
    m.on("zoomend", recolocar)
    // Si el contenedor cambia de tamaño (pantalla completa, panel), Leaflet se reacomoda
    const observador = new ResizeObserver(() => { m.invalidateSize(); recolocar() })
    observador.observe(contenedor.current)
    return () => {
      clearTimeout(espera)
      m.off("zoomend", recolocar)
      observador.disconnect()
      avisarMapa?.(null)
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
    const nuevas: Etiqueta[] = []
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

      // La etiqueta, en el punto pensado para ella (dentro del potrero); el elegido pasa al frente
      const etiqueta = crearEtiqueta(p, elegido)
      const [lng, lat] = p.etiqueta.coordinates
      for (const [html, z] of [[etiqueta.cajaGuia, -10000], [etiqueta.caja, elegido ? 10000 : 0]] as const) {
        L.marker([lat, lng], {
          icon: L.divIcon({ html, className: "", iconSize: [0, 0] }),
          interactive: false, keyboard: false, pmIgnore: true, zIndexOffset: z,
        }).addTo(grupo)
      }
      nuevas.push(etiqueta)
    }
    etiquetas.current = nuevas
    colocar.current()
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
