import type { DefinicionTarjeta, Dimension, Fuente, PaginaTablero, TarjetaTablero, Tiempo } from "@/types/tablero"

/**
 * Catálogo del tablero: qué mide cada fuente, por qué se puede abrir y qué filtros le aplican. La base hace cumplir
 * lo mismo (las funciones tablero_<fuente> rechazan lo que no está acá); la app lo usa para armar las tarjetas y para
 * marcar los filtros que no aplican.
 */

export type Unidad = "cab" | "%" | "kg" | "kg/día"

export interface Medida {
  etiqueta: string
  unidad: Unidad
  tiempos: Tiempo[]
}

export const MEDIDAS: Partial<Record<Fuente, Record<string, Medida>>> = {
  stock: {
    stock:         { etiqueta: "Stock al cierre",  unidad: "cab", tiempos: ["total", "mes", "ejercicio"] },
    movimientos:   { etiqueta: "Altas y bajas",    unidad: "cab", tiempos: ["total", "mes", "ejercicio"] },
    mortandad_pct: { etiqueta: "Mortandad",        unidad: "%",   tiempos: ["total", "ejercicio"] },
  },
  reproductivos: {
    pct_prenez:         { etiqueta: "% Preñez",         unidad: "%",   tiempos: ["temporada", "total"] },
    pct_paricion:       { etiqueta: "% Parición",       unidad: "%",   tiempos: ["temporada", "total"] },
    pct_paricion_total: { etiqueta: "% Parición total", unidad: "%",   tiempos: ["temporada", "total"] },
    pct_destete:        { etiqueta: "% Destete",        unidad: "%",   tiempos: ["temporada", "total"] },
    entoradas:          { etiqueta: "Entoradas",        unidad: "cab", tiempos: ["temporada", "total"] },
    prenadas:           { etiqueta: "Preñadas",         unidad: "cab", tiempos: ["temporada", "total"] },
    nacidos_vivos:      { etiqueta: "Nacidos vivos",    unidad: "cab", tiempos: ["temporada", "total"] },
    nacidos_muertos:    { etiqueta: "Nacidos muertos",  unidad: "cab", tiempos: ["temporada", "total"] },
    destetados:         { etiqueta: "Destetados",       unidad: "cab", tiempos: ["temporada", "total"] },
  },
  pesadas: {
    peso_promedio:   { etiqueta: "Peso promedio",   unidad: "kg",     tiempos: ["total", "mes"] },
    ganancia_diaria: { etiqueta: "Ganancia diaria", unidad: "kg/día", tiempos: ["total", "mes"] },
    kg_producidos:   { etiqueta: "Kg producidos",   unidad: "kg",     tiempos: ["total", "mes", "ejercicio"] },
  },
}

// Medidas de pesadas que usan tramos entre pesadas (y el mínimo de días)
export const USAN_TRAMOS = ["ganancia_diaria", "kg_producidos"]
export const MIN_DIAS_POR_DEFECTO = 21

// Dimensiones de cada fuente: se puede abrir por ellas y sus filtros aplican. Las demás "no aplican".
export const DIMENSIONES: Partial<Record<Fuente, Dimension[]>> = {
  stock: ["especie", "categoria", "lote"],
  reproductivos: ["especie", "lote"],
  pesadas: ["especie", "categoria", "lote"],
}

export const ETIQUETA_DIMENSION: Record<Dimension, string> = {
  especie: "especie",
  categoria: "categoría",
  lote: "lote",
  motivo: "motivo",
}

export const medidaDe = (fuente: Fuente, medida: string): Medida | undefined => MEDIDAS[fuente]?.[medida]

// Filtros generales activos que la fuente de la tarjeta no tiene ("Filtro de categoría no aplica")
export function filtrosQueNoAplican(def: DefinicionTarjeta, activos: Dimension[]): Dimension[] {
  const tiene = DIMENSIONES[def.fuente] ?? []
  return activos.filter(d => !tiene.includes(d))
}

// ── Plantilla: la página "Resumen" que se ve mientras el establecimiento no guardó su tablero ───────────────────

const def = (d: Omit<DefinicionTarjeta, "periodo"> & Pick<DefinicionTarjeta, "periodo">): DefinicionTarjeta => d

// Tarjetas listas (también son las que se pueden agregar desde "Agregar tarjeta" hasta que esté el constructor)
export const TARJETAS_LISTAS: Omit<TarjetaTablero, "id" | "x" | "y">[] = [
  { titulo: "Stock al cierre", w: 3, h: 3,
    definicion: def({ fuente: "stock", medidas: ["stock"], abrir_por: null, tiempo: "total", grafico: "numero" }) },
  { titulo: "Mortandad", w: 3, h: 3,
    definicion: def({ fuente: "stock", medidas: ["mortandad_pct"], abrir_por: null, tiempo: "total", grafico: "numero" }) },
  { titulo: "% Preñez", w: 3, h: 3,
    definicion: def({ fuente: "reproductivos", medidas: ["pct_prenez"], abrir_por: null, tiempo: "total", grafico: "numero" }) },
  { titulo: "% Destete", w: 3, h: 3,
    definicion: def({ fuente: "reproductivos", medidas: ["pct_destete"], abrir_por: null, tiempo: "total", grafico: "numero" }) },
  { titulo: "Evolución del stock", w: 8, h: 7,
    definicion: def({ fuente: "stock", medidas: ["stock"], abrir_por: null, tiempo: "mes", grafico: "barras" }) },
  { titulo: "Stock por categoría", w: 4, h: 7,
    definicion: def({ fuente: "stock", medidas: ["stock"], abrir_por: "categoria", tiempo: "total", grafico: "barras_horizontales" }) },
  { titulo: "Reproductivos por temporada", w: 6, h: 7,
    definicion: def({ fuente: "reproductivos", medidas: ["pct_prenez", "pct_paricion", "pct_destete"], abrir_por: null,
                      tiempo: "temporada", grafico: "barras", periodo: { ejercicios: 3 } }) },
  { titulo: "Altas y bajas por motivo", w: 6, h: 7,
    definicion: def({ fuente: "stock", medidas: ["movimientos"], abrir_por: "motivo", tiempo: "total", grafico: "barras_horizontales" }) },
  // Producción y pesos (no están en la plantilla)
  { titulo: "Ganancia diaria", w: 3, h: 3,
    definicion: def({ fuente: "pesadas", medidas: ["ganancia_diaria"], abrir_por: null, tiempo: "total", grafico: "numero" }) },
  { titulo: "Kg producidos por mes", w: 6, h: 7,
    definicion: def({ fuente: "pesadas", medidas: ["kg_producidos"], abrir_por: null, tiempo: "mes", grafico: "barras" }) },
  { titulo: "Peso promedio por lote", w: 6, h: 7,
    definicion: def({ fuente: "pesadas", medidas: ["peso_promedio"], abrir_por: "lote", tiempo: "total", grafico: "barras_horizontales" }) },
]

// Posiciones de la plantilla, en el orden de TARJETAS_LISTAS
const LUGARES: [number, number][] = [[0, 0], [3, 0], [6, 0], [9, 0], [0, 3], [8, 3], [0, 10], [6, 10]]

export function plantilla(): PaginaTablero[] {
  return [{
    id: "plantilla-resumen",
    nombre: "Resumen",
    tarjetas: TARJETAS_LISTAS.slice(0, LUGARES.length).map((t, i) => ({ ...t, id: `plantilla-${i}`, x: LUGARES[i][0], y: LUGARES[i][1] })),
  }]
}
