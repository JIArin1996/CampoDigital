// Colores de los potreros en el mapa, según lo que se quiera ver: uso, pastura u ocupación.
//
// Paleta: los tres primeros colores categóricos de la paleta de referencia en su versión oscura
// (naranja, aqua, azul), validados de a pares sobre la imagen satelital (validate_palette.js --pairs all,
// superficie #3f4a32): se distinguen también con daltonismo. Sobre imagen clara el contraste baja de 3:1,
// así que cada potrero lleva su nombre escrito (y está la leyenda y la vista Lista). Más de tres categorías
// no se distinguen bien en un mapa: la pastura se agrupa en tres familias (el tipo exacto, en el panel).
// "Sin dato", "Sin uso" y "Vacío" van en gris medio con borde punteado (otra señal además del color): con el
// halo blanco se ve sobre la imagen satelital y sobre el mapa de rutas, que es claro.

export type ModoColor = "uso" | "pastura" | "ocupacion"

export const MODOS: { id: ModoColor; nombre: string }[] = [
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

// Categoría de un potrero en el modo elegido
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
