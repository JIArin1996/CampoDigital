// Colores de los potreros en el mapa, según lo que se quiera ver: un color por potrero, uso, pastura u ocupación.
//
// Modo "Potrero": cada potrero con su color, de los ocho de la paleta de referencia (versión oscura), elegidos
// para que dos potreros vecinos no queden iguales. El color solo distingue; el nombre va escrito en cada uno.
//
// Paleta: los tres primeros colores categóricos de la paleta de referencia en su versión oscura
// (naranja, aqua, azul), validados de a pares sobre la imagen satelital (validate_palette.js --pairs all,
// superficie #3f4a32): se distinguen también con daltonismo. Sobre imagen clara el contraste baja de 3:1,
// así que cada potrero lleva su nombre escrito (y está la leyenda y la vista Lista). Más de tres categorías
// no se distinguen bien en un mapa: la pastura se agrupa en tres familias (el tipo exacto, en el panel).
// "Sin dato", "Sin uso" y "Vacío" van en gris medio con borde punteado (otra señal además del color): con el
// halo blanco se ve sobre la imagen satelital y sobre el mapa de rutas, que es claro.

export type ModoColor = "potrero" | "uso" | "pastura" | "ocupacion"

export const MODOS: { id: ModoColor; nombre: string }[] = [
  { id: "potrero", nombre: "Potrero" },
  { id: "uso", nombre: "Uso" },
  { id: "pastura", nombre: "Pastura" },
  { id: "ocupacion", nombre: "Ocupación" },
]

const NARANJA = "#d95926"
const AQUA = "#199e70"
const AZUL = "#3987e5"
export const NEUTRO = "#6b7280"

export interface Categoria {
  clave: string
  nombre: string
  color: string
  punteado?: boolean
}

const SIN_DATO: Categoria = { clave: "sin_dato", nombre: "Sin dato", color: NEUTRO, punteado: true }

export const LEYENDAS: Record<ModoColor, Categoria[]> = {
  potrero: [],
  uso: [
    { clave: "Ganadería", nombre: "Ganadería", color: NARANJA },
    { clave: "Forestación", nombre: "Forestación", color: AQUA },
    { clave: "Reserva", nombre: "Reserva", color: AZUL },
    { clave: "Sin uso", nombre: "Sin uso", color: NEUTRO, punteado: true },
    SIN_DATO,
  ],
  pastura: [
    { clave: "campo", nombre: "Campo natural (o mejorado)", color: NARANJA },
    { clave: "pradera", nombre: "Pradera", color: AQUA },
    { clave: "verdeo", nombre: "Verdeo (invierno o verano)", color: AZUL },
    SIN_DATO,
  ],
  ocupacion: [
    { clave: "ocupado", nombre: "Con lotes", color: NARANJA },
    { clave: "vacio", nombre: "Vacío", color: NEUTRO, punteado: true },
  ],
}

const FAMILIA_PASTURA: Record<string, string> = {
  "Campo natural": "campo",
  "Campo natural mejorado": "campo",
  "Pradera": "pradera",
  "Verdeo de invierno": "verdeo",
  "Verdeo de verano": "verdeo",
}

// Ocho colores, en el orden de la paleta de referencia (versión oscura)
const PALETA_POTREROS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]

// Caja (oeste, sur, este, norte) de una forma, agrandada un poco para que los que se tocan cuenten como vecinos
function caja(forma: GeoJSON.MultiPolygon): [number, number, number, number] {
  const puntos = forma.coordinates.flat(2)
  const margen = 0.0005   // ≈ 50 m
  return [
    Math.min(...puntos.map(p => p[0])) - margen, Math.min(...puntos.map(p => p[1])) - margen,
    Math.max(...puntos.map(p => p[0])) + margen, Math.max(...puntos.map(p => p[1])) + margen,
  ]
}

// Un color por potrero: en orden de nombre, el primero de la paleta que no use ningún vecino.
// El color de cada uno queda estable mientras no cambien los potreros dibujados.
export function coloresPorPotrero(potreros: { id: string; nombre: string; forma: GeoJSON.MultiPolygon }[]): Map<string, string> {
  const ordenados = [...potreros].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }))
  const cajas = new Map(ordenados.map(p => [p.id, caja(p.forma)]))
  const vecinos = (a: string, b: string) => {
    const [o1, s1, e1, n1] = cajas.get(a)!
    const [o2, s2, e2, n2] = cajas.get(b)!
    return o1 <= e2 && o2 <= e1 && s1 <= n2 && s2 <= n1
  }
  const colores = new Map<string, string>()
  ordenados.forEach((p, i) => {
    const usados = new Set(ordenados.filter(q => colores.has(q.id) && vecinos(p.id, q.id)).map(q => colores.get(q.id)))
    colores.set(p.id, PALETA_POTREROS.find(c => !usados.has(c)) ?? PALETA_POTREROS[i % PALETA_POTREROS.length])
  })
  return colores
}

// Categoría de un potrero en el modo elegido (en el modo "Potrero" el color sale de coloresPorPotrero)
export function categoriaDe(
  modo: ModoColor,
  potrero: { uso_actual: string | null; tipo_pastura: string | null },
  ocupado: boolean,
): Categoria {
  const leyenda = LEYENDAS[modo]
  const clave = modo === "uso" ? potrero.uso_actual
    : modo === "pastura" ? (potrero.tipo_pastura ? FAMILIA_PASTURA[potrero.tipo_pastura] : null)
    : ocupado ? "ocupado" : "vacio"
  return leyenda.find(c => c.clave === clave) ?? SIN_DATO
}
