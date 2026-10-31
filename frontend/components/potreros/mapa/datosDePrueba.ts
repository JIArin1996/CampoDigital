// Potreros inventados para probar las etiquetas del mapa (página /dev/etiquetas, solo en desarrollo).
// Nunca van a la base. Con semilla: los mismos datos en cada carga.

import { textoCabezas } from "@/components/potreros/mapa/etiquetas"
import type { PoligonoPotrero } from "@/components/potreros/mapa/MapaLeaflet"

// Generador con semilla (mulberry32)
function azar(semilla: number) {
  let a = semilla
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NOMBRES = [
  "Bajo norte", "Loma del medio", "Piquete 1", "Piquete 2", "La Aguada", "Monte grande", "El Bañado", "Cañada sur",
  "Potrero de la ruta", "Mejoramiento 3", "Casco", "Los Eucaliptos", "Rincón", "Pradera vieja", "Campo natural este",
  "La Tapera", "Puesto", "Sorgo 2025", "Avena", "Cerro chato", "Laguna", "Piquete de los toros", "El Ombú", "Alambrado nuevo",
  "Media loma", "Bajo sur", "Tajamar", "Las Palmas", "Pradera nueva", "Corral",
]
const CATEGORIAS = ["Vacas", "Vaquillonas", "Terneros", "Terneras", "Novillos", "Toros"]
const CENTRO = { lat: -33.38, lng: -55.62 }
const M_POR_GRADO_LAT = 111_320

const acumulado = (medidas: number[]) => medidas.reduce<number[]>((a, m) => [...a, a[a.length - 1] + m], [0])

/**
 * n potreros en una grilla irregular: anchos y altos de 120 a 900 m (algunos piquetes angostos), con los
 * vértices un poco corridos y compartidos entre vecinos, como alambrados. Cerca de un tercio vacíos.
 */
export function potrerosDePrueba(n: number, semilla = 7): PoligonoPotrero[] {
  const r = azar(semilla)
  const columnas = Math.ceil(Math.sqrt(n))
  const filas = Math.ceil(n / columnas)
  const medida = () => (r() < 0.25 ? 120 + r() * 80 : 300 + r() * 600)
  const xs = acumulado(Array.from({ length: columnas }, medida))
  const ys = acumulado(Array.from({ length: filas }, medida))
  const corrimiento = Array.from({ length: (columnas + 1) * (filas + 1) }, () => [(r() - 0.5) * 50, (r() - 0.5) * 50])
  const vertice = (i: number, j: number): [number, number] => {
    const [cx, cy] = corrimiento[j * (columnas + 1) + i]
    return [xs[i] + cx, ys[j] + cy]
  }
  const mPorGradoLng = M_POR_GRADO_LAT * Math.cos((CENTRO.lat * Math.PI) / 180)
  const aGrados = ([x, y]: [number, number]): GeoJSON.Position => [CENTRO.lng + x / mPorGradoLng, CENTRO.lat - y / M_POR_GRADO_LAT]

  return Array.from({ length: n }, (_, k) => {
    const i = k % columnas
    const j = Math.floor(k / columnas)
    const esquinas = [vertice(i, j), vertice(i + 1, j), vertice(i + 1, j + 1), vertice(i, j + 1)]
    // Cuatro lados sin cruces: el promedio de las esquinas cae adentro
    const medio: [number, number] = [esquinas.reduce((s, e) => s + e[0], 0) / 4, esquinas.reduce((s, e) => s + e[1], 0) / 4]
    const categorias = r() < 0.3 ? [] : CATEGORIAS.filter(() => r() < 0.4).map(c => ({ nombre: c, cabezas: 5 + Math.floor(r() * 195) }))
    const cabezas = categorias.reduce((s, c) => s + c.cabezas, 0)
    return {
      id: `prueba-${k}`,
      nombre: NOMBRES[k] ?? `Potrero ${k + 1}`,
      lineas: categorias.length > 0 ? categorias.map(c => `${c.nombre} ${c.cabezas}`) : ["Vacío"],
      resumen: textoCabezas(cabezas),
      cabezas,
      forma: { type: "MultiPolygon", coordinates: [[[...esquinas, esquinas[0]].map(aGrados)]] },
      etiqueta: { type: "Point", coordinates: aGrados(medio) },
      color: cabezas > 0 ? "#d95926" : "#6b7280",
      punteado: cabezas === 0,
    }
  })
}
