import type { DefinicionTarjeta, Dimension, Fuente, PaginaTablero, TarjetaTablero, Tiempo } from "@/types/tablero"

/**
 * Catálogo del tablero: qué mide cada fuente, por qué se puede abrir y qué filtros le aplican. La base hace cumplir
 * lo mismo (las funciones tablero_<fuente> rechazan lo que no está acá); la app lo usa para armar las tarjetas y para
 * marcar los filtros que no aplican.
 */

export type Unidad = "cab" | "%" | "kg" | "kg/día" | "USD" | "UG" | "UG/ha" | "ha" | "días"

export interface Medida {
  etiqueta: string
  unidad: Unidad
  tiempos: Tiempo[]
  filtran?: Dimension[]     // qué filtros le aplican, si no son todos los de su fuente (ver FILTRAN)
  abrirObligatorio?: boolean // solo tiene sentido abierta (ej. días de descanso, por potrero)
}

// Medidas donde bajar es bueno (la flecha de la comparación va en verde si baja)
export const MEJOR_SI_BAJA = ["mortandad_pct", "nacidos_muertos", "gastos", "pendiente_pago"]
// Medidas que al comparar van sin color: subir o bajar no es bueno ni malo en sí
export const SIN_COLOR = ["dias_ocupacion", "dias_descanso"]

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

// Economía y potreros (etapa 3)
MEDIDAS.economia = {
  resultado:       { etiqueta: "Resultado",           unidad: "USD", tiempos: ["total", "mes", "ejercicio"] },
  ingresos:        { etiqueta: "Ingresos",            unidad: "USD", tiempos: ["total", "mes", "ejercicio"] },
  gastos:          { etiqueta: "Gastos",              unidad: "USD", tiempos: ["total", "mes", "ejercicio"] },
  pendiente_cobro: { etiqueta: "Pendiente de cobro",  unidad: "USD", tiempos: ["total"] },
  pendiente_pago:  { etiqueta: "Pendiente de pago",   unidad: "USD", tiempos: ["total"] },
}
MEDIDAS.potreros = {
  carga:          { etiqueta: "Carga (sobre el área efectiva)", unidad: "UG/ha", tiempos: ["total", "mes"] },
  ug:             { etiqueta: "Unidades ganaderas",  unidad: "UG",    tiempos: ["total", "mes"] },
  superficie:     { etiqueta: "Superficie",          unidad: "ha",    tiempos: ["total", "mes"], filtran: [] },
  superficie_efectiva: { etiqueta: "Área efectiva",   unidad: "ha",    tiempos: ["total", "mes"], filtran: [] },
  dias_ocupacion: { etiqueta: "Días de ocupación",   unidad: "días",  tiempos: ["total", "mes", "ejercicio"], filtran: [], abrirObligatorio: true },
  dias_descanso:  { etiqueta: "Días de descanso",    unidad: "días",  tiempos: ["total", "mes", "ejercicio"], filtran: [], abrirObligatorio: true },
}

// Medidas de pesadas que usan tramos entre pesadas (y el mínimo de días)
export const USAN_TRAMOS = ["ganancia_diaria", "kg_producidos"]
export const MIN_DIAS_POR_DEFECTO = 21

// Por qué se puede abrir cada fuente (motivo, además, en altas y bajas)
export const DIMENSIONES: Partial<Record<Fuente, Dimension[]>> = {
  stock: ["especie", "categoria", "lote"],
  reproductivos: ["especie", "lote"],
  pesadas: ["especie", "categoria", "lote"],
  economia: ["especie", "lote", "rubro", "concepto", "grupo", "titular"],
  potreros: ["potrero"],
}

// Qué filtros (especie, categoría, lote) le aplican a cada fuente; los demás se marcan "no aplica"
export const FILTRAN: Partial<Record<Fuente, Dimension[]>> = {
  stock: ["especie", "categoria", "lote"],
  reproductivos: ["especie", "lote"],
  pesadas: ["especie", "categoria", "lote"],
  economia: ["especie", "lote"],
  potreros: ["especie", "categoria", "lote"],
}

// Los filtros que aplican a una tarjeta: los de su primera medida si los define, si no los de su fuente
export const filtranEn = (def: DefinicionTarjeta): Dimension[] =>
  medidaDe(def.fuente, def.medidas[0])?.filtran ?? FILTRAN[def.fuente] ?? []

export const ETIQUETA_DIMENSION: Record<Dimension, string> = {
  especie: "especie",
  categoria: "categoría",
  lote: "lote",
  motivo: "motivo",
  rubro: "rubro",
  concepto: "concepto",
  grupo: "grupo",
  titular: "titular",
  potrero: "potrero",
}

export const medidaDe = (fuente: Fuente, medida: string): Medida | undefined => MEDIDAS[fuente]?.[medida]

// Filtros generales activos que la tarjeta no usa ("Filtro de categoría no aplica")
export function filtrosQueNoAplican(def: DefinicionTarjeta, activos: Dimension[]): Dimension[] {
  const tiene = filtranEn(def)
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
  // Economía y potreros
  { titulo: "Resultado", w: 3, h: 3,
    definicion: def({ fuente: "economia", medidas: ["resultado"], abrir_por: null, tiempo: "total", grafico: "numero" }) },
  { titulo: "Ingresos y gastos por mes", w: 8, h: 7,
    definicion: def({ fuente: "economia", medidas: ["ingresos", "gastos"], abrir_por: null, tiempo: "mes", grafico: "barras" }) },
  { titulo: "Resultado por titular", w: 4, h: 7,
    definicion: def({ fuente: "economia", medidas: ["resultado"], abrir_por: "titular", tiempo: "total", grafico: "barras_horizontales" }) },
  { titulo: "Carga global", w: 3, h: 3,
    definicion: def({ fuente: "potreros", medidas: ["carga"], abrir_por: null, tiempo: "total", grafico: "numero" }) },
  { titulo: "Carga por potrero", w: 6, h: 7,
    definicion: def({ fuente: "potreros", medidas: ["carga"], abrir_por: "potrero", tiempo: "total", grafico: "barras_horizontales" }) },
  { titulo: "Días de descanso por potrero", w: 6, h: 7,
    definicion: def({ fuente: "potreros", medidas: ["dias_descanso"], abrir_por: "potrero", tiempo: "total", grafico: "barras_horizontales" }) },
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
