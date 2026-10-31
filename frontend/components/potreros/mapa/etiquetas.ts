// Colocación de las etiquetas del mapa de Potreros sin que se pisen. Sin Leaflet ni React: recibe los puntos
// en píxeles del zoom (map.project, que no depende del encuadre) y las medidas de cada nivel de etiqueta.

export interface Tamano { w: number; h: number }

// 0 completa (nombre y lotes por categoría), 1 compacta (nombre y total de cabezas), 2 mínima (solo el nombre)
export type Nivel = 0 | 1 | 2

export interface EtiquetaAColocar {
  id: string
  nombre: string
  cabezas: number
  x: number                    // el punto de la etiqueta del potrero (dentro de la forma), en píxeles
  y: number
  tamanos: Tamano[]            // uno por nivel
}

export interface Colocacion {
  nivel: Nivel | null          // null: no entró ni la mínima y va un círculo numerado
  dx: number                   // centro de la etiqueta respecto del punto
  dy: number
  guia: { x: number; y: number } | null   // hasta dónde va la línea guía (el borde más cercano al punto)
  numero: number | null
}

export const MARGEN = 5                    // espacio mínimo entre dos etiquetas
export const DIAMETRO_CIRCULO = 20
const DISTANCIA_GUIA = 10                  // si el borde queda más lejos que esto del punto, lleva línea guía
const RADIOS = [4, 14, 28, 46, 70, 100, 140, 190, 250, 320, 400]
// Hasta dónde se aleja cada nivel antes de probar el siguiente: antes una etiqueta más corta cerca del potrero
// que una completa lejos. El círculo busca más lejos para no quedar encimado.
const ALCANCE = [28, 46, 100]
const ALCANCE_CIRCULO = 400
// Arriba, abajo, izquierda, derecha y las diagonales
const DIRECCIONES = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const

interface Rect { l: number; t: number; r: number; b: number }

// Sobre el punto y después en las 8 direcciones, cada vez más lejos (el borde a r píxeles del punto)
function* posiciones(t: Tamano, alcance: number): Generator<[number, number]> {
  yield [0, 0]
  for (const r of RADIOS) {
    if (r > alcance) return
    for (const [ux, uy] of DIRECCIONES) yield [ux * (t.w / 2 + r), uy * (t.h / 2 + r)]
  }
}

const rect = (x: number, y: number, t: Tamano): Rect => ({ l: x - t.w / 2, t: y - t.h / 2, r: x + t.w / 2, b: y + t.h / 2 })
const choca = (a: Rect, ocupados: Rect[]) =>
  ocupados.some(o => a.l < o.r + MARGEN && a.r + MARGEN > o.l && a.t < o.b + MARGEN && a.b + MARGEN > o.t)

// Punto del recuadro más cercano al punto del potrero (relativo a él); null si está cerca o lo cubre
function guiaHasta(dx: number, dy: number, t: Tamano) {
  const x = Math.min(Math.max(0, dx - t.w / 2), dx + t.w / 2)
  const y = Math.min(Math.max(0, dy - t.h / 2), dy + t.h / 2)
  return Math.hypot(x, y) > DISTANCIA_GUIA ? { x, y } : null
}

// Siempre en el mismo orden (más cabezas primero, desempate por nombre): el resultado no depende del encuadre
export const ordenDeColocacion = (a: EtiquetaAColocar, b: EtiquetaAColocar) =>
  b.cabezas - a.cabezas || a.nombre.localeCompare(b.nombre, "es") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Para cada etiqueta, en orden de prioridad: del nivel más completo al más compacto, la primera posición que no
 * choque con las ya colocadas (cada nivel hasta su alcance). Si no entra ni la mínima, un círculo numerado (que también ocupa lugar); si ni
 * el círculo entra, va igual sobre el punto: ningún potrero queda sin identificar.
 */
export function colocarEtiquetas(etiquetas: EtiquetaAColocar[]): Map<string, Colocacion> {
  const ocupados: Rect[] = []
  const resultado = new Map<string, Colocacion>()
  let numero = 0
  for (const e of [...etiquetas].sort(ordenDeColocacion)) {
    let hecha: Colocacion | null = null
    niveles: for (let n = 0; n < e.tamanos.length; n++) {
      for (const [dx, dy] of posiciones(e.tamanos[n], ALCANCE[n])) {
        const r = rect(e.x + dx, e.y + dy, e.tamanos[n])
        if (choca(r, ocupados)) continue
        ocupados.push(r)
        hecha = { nivel: n as Nivel, dx, dy, guia: guiaHasta(dx, dy, e.tamanos[n]), numero: null }
        break niveles
      }
    }
    if (!hecha) {
      const t = { w: DIAMETRO_CIRCULO, h: DIAMETRO_CIRCULO }
      let lugar: [number, number] = [0, 0]
      for (const p of posiciones(t, ALCANCE_CIRCULO)) {
        if (!choca(rect(e.x + p[0], e.y + p[1], t), ocupados)) { lugar = p; break }
      }
      ocupados.push(rect(e.x + lugar[0], e.y + lugar[1], t))
      hecha = { nivel: null, dx: lugar[0], dy: lugar[1], guia: guiaHasta(lugar[0], lugar[1], t), numero: ++numero }
    }
    resultado.set(e.id, hecha)
  }
  return resultado
}

// Lo que dice la etiqueta compacta debajo del nombre
export const textoCabezas = (n: number) =>
  n === 0 ? "Vacío" : `${n.toLocaleString("es-UY")} ${n === 1 ? "cabeza" : "cabezas"}`
