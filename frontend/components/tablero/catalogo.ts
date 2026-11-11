import type {
  DefinicionMedida, DefinicionTarjeta, Dimension, Fuente, MedidaPropia, Operacion, Operando, PaginaTablero, TarjetaTablero, Tiempo,
} from "@/types/tablero"

/**
 * Catálogo del tablero: qué mide cada fuente, por qué se puede abrir y qué filtros le aplican. La base hace cumplir
 * lo mismo (las funciones tablero_<fuente> rechazan lo que no está acá); la app lo usa para armar las tarjetas y para
 * marcar los filtros que no aplican.
 */

// Las medidas propias tienen una unidad libre ("USD/ha", "kg/ha"...) o ninguna ("")
export type Unidad = "cab" | "%" | "kg" | "kg/día" | "kg/vaca" | "kg/cab" | "USD" | "USD/kg" | "UG" | "UG/ha" | "UG-día/ha" | "ha" | "días" | "razón" | "potreros" | "tareas" | "lotes" | "dosis" | (string & {})

export interface Medida {
  etiqueta: string
  unidad: Unidad
  tiempos: Tiempo[]
  filtran?: Dimension[]     // qué filtros le aplican, si no son todos los de su fuente (ver FILTRAN)
  abrirObligatorio?: boolean // solo tiene sentido abierta (ej. días de descanso, por potrero)
  abrir?: Dimension[]        // por qué se puede abrir, si no son todas las de su fuente (ver DIMENSIONES)
  mejor?: "sube" | "baja" | null // medidas propias: lo que eligió el administrador (si no, ver comparacionDe)
}

// Medidas donde bajar es bueno (la flecha de la comparación va en verde si baja)
export const MEJOR_SI_BAJA = ["mortandad_pct", "nacidos_muertos", "gastos", "pendiente_pago", "pct_perdidas", "gastos_operativos", "tareas_vencidas"]
// Medidas que al comparar van sin color: subir o bajar no es bueno ni malo en sí
export const SIN_COLOR = ["dias_ocupacion", "dias_descanso"]

export const NOMBRE_FUENTE: Record<Fuente, string> = {
  stock: "Stock", reproductivos: "Reproductivos", pesadas: "Producción y pesos", economia: "Economía", potreros: "Potreros",
  produccion: "Kilos y lana", gestion: "Gestión", combinada: "Medidas propias",
}

export const MEDIDAS: Partial<Record<Fuente, Record<string, Medida>>> = {
  stock: {
    stock:         { etiqueta: "Stock al cierre",  unidad: "cab", tiempos: ["total", "mes", "ejercicio"] },
    movimientos:   { etiqueta: "Altas y bajas",    unidad: "cab", tiempos: ["total", "mes", "ejercicio"] },
    mortandad_pct: { etiqueta: "Mortandad",        unidad: "%",   tiempos: ["total", "ejercicio"] },
    // Etapa 6a
    ug:             { etiqueta: "UG al cierre",       unidad: "UG",  tiempos: ["total", "mes", "ejercicio"] },
    ug_promedio:    { etiqueta: "UG promedio",        unidad: "UG",  tiempos: ["total", "mes", "ejercicio"] },
    stock_promedio: { etiqueta: "Stock promedio",     unidad: "cab", tiempos: ["total", "mes", "ejercicio"] },
    pct_extraccion: { etiqueta: "Tasa de extracción", unidad: "%",   tiempos: ["total", "ejercicio"] },
    pct_vacas_cria: { etiqueta: "% vacas de cría",    unidad: "%",   tiempos: ["total", "mes", "ejercicio"], abrir: ["especie", "lote"] },
    lanar_vacuno:    { etiqueta: "Relación lanar/vacuno",      unidad: "razón", tiempos: ["total", "mes", "ejercicio"], abrir: [], filtran: ["categoria", "lote"] },
    lanar_vacuno_ug: { etiqueta: "Relación lanar/vacuno (UG)", unidad: "razón", tiempos: ["total", "mes", "ejercicio"], abrir: [], filtran: ["categoria", "lote"] },
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
    // Etapa 6a
    pct_perdidas:       { etiqueta: "% Pérdidas preñez → destete", unidad: "%",       tiempos: ["temporada", "total"] },
    pct_reposicion:     { etiqueta: "% Reposición",                unidad: "%",       tiempos: ["temporada", "total"] },
    kg_destetados:      { etiqueta: "Kg destetados",               unidad: "kg",      tiempos: ["temporada", "total"] },
    kg_destetados_vaca: { etiqueta: "Kg destetados por vaca entorada", unidad: "kg/vaca", tiempos: ["temporada", "total"] },
    peso_destete:       { etiqueta: "Peso promedio al destete",    unidad: "kg",      tiempos: ["temporada", "total"] },
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
  // Etapa 6c
  gastos_operativos: { etiqueta: "Gastos operativos (sin compras de hacienda)", unidad: "USD", tiempos: ["total", "mes", "ejercicio"] },
  precio_venta:      { etiqueta: "Precio promedio de venta", unidad: "USD/kg", tiempos: ["total", "ejercicio"], abrir: ["especie", "lote"] },
  flujo_caja:        { etiqueta: "Flujo de caja (por fecha de pago)", unidad: "USD", tiempos: ["total", "mes", "ejercicio"] },
  pct_gasto:         { etiqueta: "% del gasto", unidad: "%", tiempos: ["total", "ejercicio"], abrirObligatorio: true,
                       abrir: ["concepto", "grupo", "rubro", "especie", "lote", "titular", "pagador"] },
  saldos:            { etiqueta: "Saldos entre titulares y pagadores", unidad: "USD", tiempos: ["total"], abrir: ["par"], abrirObligatorio: true, filtran: [] },
}
MEDIDAS.potreros = {
  carga:          { etiqueta: "Carga (sobre el área efectiva)", unidad: "UG/ha", tiempos: ["total", "mes"] },
  ug:             { etiqueta: "Unidades ganaderas",  unidad: "UG",    tiempos: ["total", "mes"] },
  superficie:     { etiqueta: "Superficie",          unidad: "ha",    tiempos: ["total", "mes"], filtran: [] },
  superficie_efectiva: { etiqueta: "Área efectiva",   unidad: "ha",    tiempos: ["total", "mes"], filtran: [] },
  dias_ocupacion: { etiqueta: "Días de ocupación",   unidad: "días",  tiempos: ["total", "mes", "ejercicio"], filtran: [], abrirObligatorio: true },
  dias_descanso:  { etiqueta: "Días de descanso",    unidad: "días",  tiempos: ["total", "mes", "ejercicio"], filtran: [], abrirObligatorio: true },
  // Etapa 6c
  carga_promedio: { etiqueta: "Carga promedio (UG-día)", unidad: "UG/ha", tiempos: ["total", "mes", "ejercicio"] },
  presion:        { etiqueta: "Presión acumulada",      unidad: "UG-día/ha", tiempos: ["total", "mes", "ejercicio"] },
  ha_spg:         { etiqueta: "Ha SPG (pastoreo)",      unidad: "ha",    tiempos: ["total"], abrir: [], filtran: [] },
  ha_forestadas:  { etiqueta: "Ha forestadas",          unidad: "ha",    tiempos: ["total"], abrir: [], filtran: [] },
  potreros_sin_animales: { etiqueta: "Potreros sin animales", unidad: "potreros", tiempos: ["total", "mes"], abrir: [], filtran: [] },
  ha_sin_animales: { etiqueta: "Ha sin animales",       unidad: "ha",    tiempos: ["total", "mes"], abrir: [], filtran: [] },
  dias_desde_salida: { etiqueta: "Días desde la última salida", unidad: "días", tiempos: ["total"], filtran: [], abrirObligatorio: true },
}

// Kilos y lana (etapa 6b): kg en stock valuados con la pesada más cercana (o el peso de referencia) y producción de
// carne por inventario. La producción y la carne equivalente solo se abren y filtran por especie (los kg pasan de un
// lote o una categoría a otro); la lana, por especie y lote (la esquila no dice categorías).
MEDIDAS.produccion = {
  kg_stock:          { etiqueta: "Kg en stock al cierre",      unidad: "kg",     tiempos: ["total", "mes", "ejercicio"] },
  produccion_carne:  { etiqueta: "Producción de carne",        unidad: "kg",     tiempos: ["total", "ejercicio"], abrir: ["especie"], filtran: ["especie"] },
  kg_vendidos:       { etiqueta: "Kg vendidos",                unidad: "kg",     tiempos: ["total", "mes", "ejercicio"] },
  kg_comprados:      { etiqueta: "Kg comprados",               unidad: "kg",     tiempos: ["total", "mes", "ejercicio"] },
  peso_venta:        { etiqueta: "Peso promedio de venta",     unidad: "kg",     tiempos: ["total", "mes", "ejercicio"] },
  lana:              { etiqueta: "Lana",                       unidad: "kg",     tiempos: ["total", "ejercicio"], abrir: ["especie", "lote"], filtran: ["especie", "lote"] },
  lana_por_animal:   { etiqueta: "Lana por animal esquilado",  unidad: "kg/cab", tiempos: ["total", "ejercicio"], abrir: ["especie", "lote"], filtran: ["especie", "lote"] },
  carne_equivalente: { etiqueta: "Carne equivalente",          unidad: "kg",     tiempos: ["total", "ejercicio"], abrir: ["especie"], filtran: ["especie"] },
}

// Gestión (etapa 6d): lo pendiente a la fecha de cierre del período (tareas de la bitácora, carencias y próximas dosis)
MEDIDAS.gestion = {
  tareas_vencidas: { etiqueta: "Tareas vencidas",                   unidad: "tareas", tiempos: ["total"] },
  tareas_proximas: { etiqueta: "Tareas que vencen en 15 días",      unidad: "tareas", tiempos: ["total"] },
  lotes_carencia:  { etiqueta: "Lotes con carencia",                unidad: "lotes",  tiempos: ["total"] },
  cab_carencia:    { etiqueta: "Cabezas con carencia",              unidad: "cab",    tiempos: ["total"] },
  proximas_dosis:  { etiqueta: "Próximas dosis (15 días)",          unidad: "dosis",  tiempos: ["total"] },
}

// Medidas que se suman entre períodos: por mes se pueden mostrar acumuladas en el período (etapa 8a)
export const ADITIVAS = ["movimientos", "kg_producidos", "resultado", "ingresos", "gastos", "gastos_operativos", "flujo_caja",
                         "kg_vendidos", "kg_comprados"]

// Tarjetas de la plantilla cuya medida todavía no existe: se muestran con este texto (no se ocultan)
export const PENDIENTES: Record<string, string> = {
  renta_forestal_ha: "más adelante: necesita filtrar los ingresos por rubro (Forestación)",
  pct_senalada: "más adelante, con la actividad Señalada",
}
// Gráficos que todavía no existen
export const GRAFICOS_PENDIENTES: Partial<Record<string, string>> = { mapa: "en la etapa 8b" }

// Medidas de pesadas que usan tramos entre pesadas (y el mínimo de días)
export const USAN_TRAMOS = ["ganancia_diaria", "kg_producidos"]
export const MIN_DIAS_POR_DEFECTO = 21

// Por qué se puede abrir cada fuente (motivo, además, en altas y bajas)
export const DIMENSIONES: Partial<Record<Fuente, Dimension[]>> = {
  stock: ["especie", "categoria", "lote"],
  reproductivos: ["especie", "categoria", "lote"],   // categoría de entore (la del lote servido)
  pesadas: ["especie", "categoria", "lote"],
  economia: ["especie", "lote", "rubro", "concepto", "grupo", "titular", "pagador"],
  potreros: ["potrero"],
  produccion: ["especie", "categoria", "lote"],
  gestion: ["lote"],
}

// Qué filtros (especie, categoría, lote) le aplican a cada fuente; los demás se marcan "no aplica"
export const FILTRAN: Partial<Record<Fuente, Dimension[]>> = {
  stock: ["especie", "categoria", "lote"],
  reproductivos: ["especie", "categoria", "lote"],
  pesadas: ["especie", "categoria", "lote"],
  economia: ["especie", "lote"],
  potreros: ["especie", "categoria", "lote"],
  produccion: ["especie", "categoria", "lote"],
  gestion: ["especie", "lote"],
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
  pagador: "pagador",
  par: "deudor y acreedor",
}

export const medidaDe = (fuente: Fuente, medida: string): Medida | undefined => MEDIDAS[fuente]?.[medida]

// Qué es mejor al comparar con el año anterior: "baja" (mortandad, gastos...), "sube" o null (sin color)
export function comparacionDe(fuente: Fuente, medida: string): "sube" | "baja" | null {
  const m = medidaDe(fuente, medida)
  if (m?.mejor !== undefined) return m.mejor
  if (SIN_COLOR.includes(medida)) return null
  return MEJOR_SI_BAJA.includes(medida) ? "baja" : "sube"
}

// Por qué se puede abrir una medida: las de su fuente (o las suyas, si las define) y, en altas y bajas, el motivo
export const abrirDe = (fuente: Fuente, medida: string): Dimension[] =>
  [...(medidaDe(fuente, medida)?.abrir ?? DIMENSIONES[fuente] ?? []), ...(medida === "movimientos" ? ["motivo" as const] : [])]

// Filtros generales activos que la tarjeta no usa ("Filtro de categoría no aplica")
export function filtrosQueNoAplican(def: DefinicionTarjeta, activos: Dimension[]): Dimension[] {
  const tiene = filtranEn(def)
  return activos.filter(d => !tiene.includes(d))
}

// ── Medidas propias (etapa 7a): A op B ──────────────────────────────────────────────────────────────────────────
// La base las calcula (tablero_combinada); acá se arma lo que admite cada una, para el constructor y la tarjeta.

export const NOMBRE_OP: Record<Operacion, string> = { div: "÷", mul: "×", sum: "+", res: "−" }

// B del establecimiento entero: se usa su total en cualquier apertura y tiempo (igual que en la base)
const B_ENTERO = ["ha_spg", "ha_forestadas"]
export const esBEntero = (b: Operando) => "constante" in b || ("fuente" in b && b.fuente === "potreros" && B_ENTERO.includes(b.medida))

let PROPIAS: MedidaPropia[] = []
export const propiaDe = (id: string) => PROPIAS.find(p => p.id === id)

export interface Rasgos { etiqueta: string; unidad: Unidad; tiempos: Tiempo[]; abrir: Dimension[]; filtran: Dimension[]; abrirObligatorio: boolean }

// Lo que admite un operando (null: una constante, o una medida que ya no existe)
export function rasgosDe(o: Operando, lista: MedidaPropia[] = PROPIAS, nivel = 0): Rasgos | null {
  if ("constante" in o) return null
  if ("propia" in o) {
    const p = lista.find(x => x.id === o.propia)
    return p && nivel < 3 ? rasgosDeDefinicion(p.definicion, p.nombre, p.unidad ?? "", lista, nivel + 1) : null
  }
  const m = medidaDe(o.fuente, o.medida)
  if (!m) return null
  return { etiqueta: m.etiqueta, unidad: m.unidad, tiempos: m.tiempos, abrir: abrirDe(o.fuente, o.medida),
           filtran: m.filtran ?? FILTRAN[o.fuente] ?? [], abrirObligatorio: !!m.abrirObligatorio }
}

// A op B admite lo que admiten las dos (los tiempos, las aperturas y los filtros en común); si B es del establecimiento
// entero, lo de A. null si A o B no existen.
export function rasgosDeDefinicion(d: DefinicionMedida, nombre: string, unidad: Unidad, lista: MedidaPropia[] = PROPIAS, nivel = 1): Rasgos | null {
  const a = rasgosDe(d.a, lista, nivel)
  if (!a) return null
  const entero = esBEntero(d.b)
  const b = entero ? null : rasgosDe(d.b, lista, nivel)
  if (!entero && !b) return null
  const comun = <T,>(xs: T[], ys?: T[]) => (ys ? xs.filter(x => ys.includes(x)) : xs)
  return {
    etiqueta: nombre, unidad,
    tiempos: comun(a.tiempos, b?.tiempos), abrir: comun(a.abrir, b?.abrir), filtran: comun(a.filtran, b?.filtran),
    abrirObligatorio: a.abrirObligatorio || !!b?.abrirObligatorio,
  }
}

// Cómo se lee un operando: "Gastos operativos", "Gasto por UG" o "85"
export function nombreOperando(o: Operando, lista: MedidaPropia[] = PROPIAS): string {
  if ("constante" in o) return o.constante.toLocaleString("es-UY")
  if ("propia" in o) return lista.find(x => x.id === o.propia)?.nombre ?? "(medida borrada)"
  return medidaDe(o.fuente, o.medida)?.etiqueta ?? o.medida
}

export const formula = (d: DefinicionMedida, lista: MedidaPropia[] = PROPIAS) =>
  `${nombreOperando(d.a, lista)} ${NOMBRE_OP[d.op]} ${nombreOperando(d.b, lista)}`

// Unidad que se propone: USD ÷ ha → USD/ha; kg ÷ kg → sin unidad; con una constante, la de A
export function unidadSugerida(d: DefinicionMedida, lista: MedidaPropia[] = PROPIAS): string {
  const ua = rasgosDe(d.a, lista)?.unidad ?? ""
  if ("constante" in d.b) return ua
  const ub = rasgosDe(d.b, lista)?.unidad ?? ""
  if (d.op === "div") return ua === ub ? "" : ua && ub ? `${ua}/${ub}` : ua
  if (d.op === "mul") return ua && ub ? `${ua}×${ub}` : ua || ub
  return ua
}

// Medidas de fábrica (etapa 8a): las mismas para todos los establecimientos; las usa la plantilla. La base tiene la
// misma lista (tablero_combinada, 'fab:...'). No se editan ni se borran.
export const FABRICA: MedidaPropia[] = [
  { id: "fab:resultado_ha_spg", nombre: "Resultado por ha SPG", unidad: "USD/ha", mejor: "sube",
    definicion: { a: { fuente: "economia", medida: "resultado" }, op: "div", b: { fuente: "potreros", medida: "ha_spg" } } },
  { id: "fab:produccion_carne_ha", nombre: "Producción de carne por ha", unidad: "kg/ha", mejor: "sube",
    definicion: { a: { fuente: "produccion", medida: "produccion_carne" }, op: "div", b: { fuente: "potreros", medida: "ha_spg" } } },
  { id: "fab:carne_equivalente_ha", nombre: "Carne equivalente por ha", unidad: "kg/ha", mejor: "sube",
    definicion: { a: { fuente: "produccion", medida: "carne_equivalente" }, op: "div", b: { fuente: "potreros", medida: "ha_spg" } } },
  { id: "fab:costo_kg", nombre: "Costo por kg producido", unidad: "USD/kg", mejor: "baja",
    definicion: { a: { fuente: "economia", medida: "gastos_operativos" }, op: "div", b: { fuente: "produccion", medida: "produccion_carne" } } },
  { id: "fab:margen_kg", nombre: "Margen por kg", unidad: "USD/kg", mejor: "sube",
    definicion: { a: { fuente: "economia", medida: "precio_venta" }, op: "res", b: { propia: "fab:costo_kg" } } },
  { id: "fab:gasto_ug", nombre: "Gasto por UG", unidad: "USD/UG", mejor: "baja",
    definicion: { a: { fuente: "economia", medida: "gastos_operativos" }, op: "div", b: { fuente: "stock", medida: "ug_promedio" } } },
]
export const esFabrica = (id: string) => id.startsWith("fab:")

// Las medidas de fábrica y las propias del establecimiento pasan al catálogo como la fuente "combinada" (una por id)
export function registrarPropias(propias: MedidaPropia[]) {
  const lista = [...FABRICA, ...propias]
  PROPIAS = lista
  MEDIDAS.combinada = Object.fromEntries(lista.flatMap(p => {
    const r = rasgosDeDefinicion(p.definicion, p.nombre, p.unidad ?? "", lista)
    return r && r.tiempos.length > 0
      ? [[p.id, { etiqueta: p.nombre, unidad: r.unidad, tiempos: r.tiempos, abrir: r.abrir, filtran: r.filtran,
                  abrirObligatorio: r.abrirObligatorio, mejor: p.mejor } satisfies Medida]]
      : []
  }))
}

registrarPropias([])

// ── Plantilla: las cuatro páginas que se ven mientras el establecimiento no guardó su tablero ─────────────────────
// (contexto/INDICADORES-CATALOGO.md, sección 4). Las tarjetas se acomodan solas en la grilla de 12 columnas.

type Lista = Omit<TarjetaTablero, "id" | "x" | "y">
type Def = Pick<DefinicionTarjeta, "fuente" | "medidas"> & Partial<DefinicionTarjeta>

const tarjeta = (titulo: string, w: number, h: number, d: Def): Lista =>
  ({ titulo, w, h, definicion: { abrir_por: null, tiempo: "total", grafico: "numero", ...d } })
const numero = (titulo: string, fuente: Fuente, medida: string) => tarjeta(titulo, 3, 3, { fuente, medidas: [medida] })
const grafico = (titulo: string, w: number, d: Def) => tarjeta(titulo, w, 7, d)

const PAGINAS: { nombre: string; tarjetas: Lista[] }[] = [
  { nombre: "Resumen", tarjetas: [
    numero("Stock al cierre", "stock", "stock"),
    numero("UG al cierre", "stock", "ug"),
    numero("Carga global (UG/ha SPG)", "potreros", "carga_promedio"),
    numero("Resultado del ejercicio", "economia", "resultado"),
    numero("Resultado por ha SPG", "combinada", "fab:resultado_ha_spg"),
    numero("Producción de carne por ha", "combinada", "fab:produccion_carne_ha"),
    numero("% Preñez", "reproductivos", "pct_prenez"),
    numero("% Parición", "reproductivos", "pct_paricion"),
    numero("% Destete", "reproductivos", "pct_destete"),
    numero("Mortandad", "stock", "mortandad_pct"),
    numero("Pendiente de cobro", "economia", "pendiente_cobro"),
    numero("Pendiente de pago", "economia", "pendiente_pago"),
    grafico("Stock por especie", 4, { fuente: "stock", medidas: ["stock"], abrir_por: "especie", grafico: "tabla" }),
    grafico("Tareas vencidas y próximas (15 días)", 4, { fuente: "gestion", medidas: ["tareas_vencidas", "tareas_proximas"], abrir_por: "lote", grafico: "tabla" }),
    grafico("Resultado acumulado por mes", 4, { fuente: "economia", medidas: ["resultado"], tiempo: "mes", grafico: "lineas", acumuladas: ["resultado"] }),
  ] },
  { nombre: "Economía", tarjetas: [
    grafico("Resultado por rubro", 6, { fuente: "economia", medidas: ["resultado"], abrir_por: "rubro", grafico: "barras" }),
    grafico("Ingresos y gastos por mes", 6, { fuente: "economia", medidas: ["ingresos", "gastos", "resultado"], tiempo: "mes", grafico: "barras_linea", acumuladas: ["resultado"] }),
    numero("Resultado por ha SPG", "combinada", "fab:resultado_ha_spg"),
    numero("Renta forestal por ha", "economia", "renta_forestal_ha"),
    numero("Gasto por UG", "combinada", "fab:gasto_ug"),
    numero("Costo por kg producido", "combinada", "fab:costo_kg"),
    numero("Precio promedio de venta", "economia", "precio_venta"),
    numero("Margen por kg", "combinada", "fab:margen_kg"),
    grafico("Gastos por concepto (%)", 6, { fuente: "economia", medidas: ["pct_gasto"], abrir_por: "concepto", grafico: "barras_horizontales" }),
    grafico("Flujo de caja por mes", 6, { fuente: "economia", medidas: ["flujo_caja"], tiempo: "mes", grafico: "lineas" }),
    grafico("Resultado por titular", 4, { fuente: "economia", medidas: ["resultado"], abrir_por: "titular", grafico: "barras" }),
    grafico("Saldos entre titulares y pagadores", 4, { fuente: "economia", medidas: ["saldos"], abrir_por: "par", grafico: "tabla" }),
    grafico("Pendientes de cobro y pago", 4, { fuente: "economia", medidas: ["pendiente_cobro", "pendiente_pago"], grafico: "tabla" }),
  ] },
  { nombre: "Producción", tarjetas: [
    grafico("Stock por categoría por mes", 6, { fuente: "stock", medidas: ["stock"], abrir_por: "categoria", tiempo: "mes", grafico: "barras_apiladas" }),
    grafico("UG promedio por mes", 6, { fuente: "stock", medidas: ["ug_promedio"], tiempo: "mes", grafico: "lineas" }),
    grafico("Reproductivos por temporada", 6, { fuente: "reproductivos", medidas: ["pct_prenez", "pct_paricion", "pct_destete"],
                                                tiempo: "temporada", grafico: "barras", periodo: { ejercicios: 3 } }),
    grafico("% Preñez por categoría de entore", 6, { fuente: "reproductivos", medidas: ["pct_prenez"], abrir_por: "categoria", grafico: "barras" }),
    numero("Kg destetados por vaca entorada", "reproductivos", "kg_destetados_vaca"),
    numero("Peso promedio al destete", "reproductivos", "peso_destete"),
    numero("Producción de carne por ha", "combinada", "fab:produccion_carne_ha"),
    numero("Carne equivalente por ha", "combinada", "fab:carne_equivalente_ha"),
    numero("Tasa de extracción", "stock", "pct_extraccion"),
    numero("Lana por animal esquilado", "produccion", "lana_por_animal"),
    numero("Reproductivos ovinos (con señalada)", "reproductivos", "pct_senalada"),
    numero("Ganancia diaria", "pesadas", "ganancia_diaria"),
    grafico("Ganancia diaria por lote", 6, { fuente: "pesadas", medidas: ["ganancia_diaria"], abrir_por: "lote", grafico: "barras_horizontales" }),
    grafico("Kg producidos por mes", 6, { fuente: "pesadas", medidas: ["kg_producidos"], tiempo: "mes", grafico: "barras" }),
    grafico("Lana por lote", 6, { fuente: "produccion", medidas: ["lana"], abrir_por: "lote", grafico: "barras_horizontales" }),
    grafico("Mortandad por categoría", 6, { fuente: "stock", medidas: ["mortandad_pct"], abrir_por: "categoria", grafico: "barras_horizontales" }),
  ] },
  { nombre: "Potreros", tarjetas: [
    grafico("Mapa de carga por potrero", 6, { fuente: "potreros", medidas: ["carga_promedio"], abrir_por: "potrero", grafico: "mapa" }),
    grafico("Carga por potrero (UG/ha)", 6, { fuente: "potreros", medidas: ["carga_promedio"], abrir_por: "potrero", grafico: "barras_horizontales" }),
    grafico("Carga global por mes", 6, { fuente: "potreros", medidas: ["carga_promedio"], tiempo: "mes", grafico: "lineas" }),
    grafico("Ocupación y descanso por potrero", 6, { fuente: "potreros", medidas: ["dias_ocupacion", "dias_descanso"], abrir_por: "potrero", grafico: "barras_apiladas" }),
    grafico("Días desde la última salida", 4, { fuente: "potreros", medidas: ["dias_desde_salida"], abrir_por: "potrero", grafico: "tabla" }),
    grafico("Presión acumulada por potrero", 4, { fuente: "potreros", medidas: ["presion"], abrir_por: "potrero", grafico: "barras_horizontales" }),
    tarjeta("Potreros sin animales", 4, 3, { fuente: "potreros", medidas: ["potreros_sin_animales"] }),
  ] },
]

// Acomoda las tarjetas en filas de 12 columnas, en orden
function acomodar(tarjetas: Lista[], prefijo: string): TarjetaTablero[] {
  let x = 0, y = 0, alto = 0
  return tarjetas.map((t, i) => {
    if (x + t.w > 12) { x = 0; y += alto; alto = 0 }
    const r = { ...t, id: `${prefijo}-${i}`, x, y }
    x += t.w
    alto = Math.max(alto, t.h)
    return r
  })
}

export function plantilla(): PaginaTablero[] {
  return PAGINAS.map((p, i) => ({ id: `plantilla-${i}`, nombre: p.nombre, tarjetas: acomodar(p.tarjetas, `plantilla-${i}`) }))
}

// Tarjetas listas para agregar desde "Agregar tarjeta": las de la plantilla (sin repetir título ni las pendientes)
export const TARJETAS_LISTAS: Lista[] = PAGINAS.flatMap(p => p.tarjetas)
  .filter((t, i, todas) => todas.findIndex(o => o.titulo === t.titulo) === i)
  .filter(t => !PENDIENTES[t.definicion.medidas[0]] && !GRAFICOS_PENDIENTES[t.definicion.grafico])
