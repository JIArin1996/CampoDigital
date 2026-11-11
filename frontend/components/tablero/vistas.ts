import { ETIQUETA_DIMENSION, NOMBRE_PERIODO, abrirDe, medidaDe } from "@/components/tablero/catalogo"
import type { DefinicionTarjeta, Dimension, Fuente, Grafico, Tiempo } from "@/types/tablero"

/**
 * "¿Cómo lo querés ver?" (contexto/DISENO-CONSTRUCTOR-TARJETAS.md, sección 3): siete opciones visuales que fijan
 * separar por + período + gráfico juntas, y los ajustes automáticos con su aviso (sección 4). Todo es lógica pura
 * sobre el catálogo: lo que devuelve es siempre una combinación válida (la base hace cumplir lo mismo).
 */

export type Vista = "numero" | "evolucion" | "comparar" | "ranking" | "composicion" | "mapa" | "tabla"

// Lo que define qué se calcula y cómo se dibuja (el resto de la tarjeta no lo tocan estas reglas)
export interface Config {
  fuente: Fuente
  medida: string
  abrir: Dimension | null
  tiempo: Tiempo
  grafico: Grafico
}

export interface Ajuste {
  config: Config
  aviso: string | null   // qué más cambió y por qué (null: solo cambió lo tocado)
}

interface InfoVista {
  nombre: string
  porque: string                 // el final del aviso: "porque …"
  graficos: Grafico[]            // el primero es el que pone la opción; los demás, tipos posibles para afinar
}

export const VISTAS: Record<Vista, InfoVista> = {
  numero:      { nombre: "Un número",   porque: "un número muestra un solo valor del período", graficos: ["numero"] },
  evolucion:   { nombre: "Evolución",   porque: "Evolución muestra cómo cambia en el tiempo", graficos: ["lineas", "barras", "barras_apiladas", "barras_linea"] },
  comparar:    { nombre: "Comparar",    porque: "Comparar muestra una barra por grupo", graficos: ["barras", "barras_apiladas"] },
  ranking:     { nombre: "Ranking",     porque: "Ranking ordena los grupos de mayor a menor", graficos: ["barras_horizontales"] },
  composicion: { nombre: "Composición", porque: "Composición muestra cuánto es cada parte del total", graficos: ["torta"] },
  mapa:        { nombre: "En el mapa",  porque: "el mapa muestra un valor por potrero", graficos: ["mapa"] },
  tabla:       { nombre: "Tabla",       porque: "la tabla muestra los números en filas", graficos: ["tabla"] },
}
export const ORDEN_VISTAS: Vista[] = ["numero", "evolucion", "comparar", "ranking", "composicion", "mapa", "tabla"]

// Qué gráficos sirven para separar por y período (las mismas reglas de antes del rediseño)
export function graficoValido(g: Grafico, abrir: Dimension | null, tiempo: Tiempo) {
  if (g === "barras_horizontales" || g === "torta") return abrir !== null && tiempo === "total"
  if (g === "lineas" || g === "barras_linea") return tiempo !== "total"
  if (g === "mapa") return abrir === "potrero" && tiempo === "total"
  return true
}

// La opción visual de una tarjeta, deducida de su gráfico (una tarjeta guardada se abre con su opción marcada)
export function vistaDe(c: Pick<Config, "grafico" | "tiempo">): Vista {
  switch (c.grafico) {
    case "numero": return "numero"
    case "lineas": case "barras_linea": return "evolucion"
    case "barras": case "barras_apiladas": return c.tiempo === "total" ? "comparar" : "evolucion"
    case "barras_horizontales": return "ranking"
    case "torta": return "composicion"
    case "mapa": return "mapa"
    default: return "tabla"
  }
}

// Una configuración que la base acepta: separar y período de la medida, y un gráfico que sirve para eso
export function esValida(c: Config): boolean {
  const m = medidaDe(c.fuente, c.medida)
  if (!m) return false
  const opciones = abrirDe(c.fuente, c.medida)
  if (c.abrir === null ? !!m.abrirObligatorio : !opciones.includes(c.abrir)) return false
  if (!m.tiempos.includes(c.tiempo)) return false
  return graficoValido(c.grafico, c.abrir, c.tiempo)
}

const nombreMedida = (c: Pick<Config, "fuente" | "medida">) => medidaDe(c.fuente, c.medida)?.etiqueta ?? c.medida
const necesitaSeparar = (v: Vista) => v === "comparar" || v === "ranking" || v === "composicion" || v === "mapa"
const necesitaTodoJunto = (v: Vista) => v === "numero" || necesitaSeparar(v)

// Si una opción se puede usar con esta medida; si no, la razón en palabras (se muestra en texto, no en title)
export function disponibilidad(v: Vista, fuente: Fuente, medida: string): { posible: boolean; razon?: string } {
  const m = medidaDe(fuente, medida)
  if (!m) return { posible: false, razon: "La medida ya no existe" }
  const nombre = m.etiqueta
  const separa = abrirDe(fuente, medida)
  if (v === "numero" && m.abrirObligatorio) {
    return { posible: false, razon: `${nombre} solo se ve separada por ${separa.map(d => ETIQUETA_DIMENSION[d]).join(" o ")}` }
  }
  if (necesitaTodoJunto(v) && !m.tiempos.includes("total")) {
    return { posible: false, razon: `${nombre} no se puede ver todo junto` }
  }
  if (v === "evolucion" && !m.tiempos.some(t => t !== "total")) {
    return { posible: false, razon: `${nombre} solo se ve en todo el período, no en el tiempo` }
  }
  if (v === "mapa" && !separa.includes("potrero")) {
    return { posible: false, razon: `${nombre} no se puede ver por potrero` }
  }
  if (necesitaSeparar(v) && separa.length === 0) {
    return { posible: false, razon: `${nombre} no se puede separar` }
  }
  return { posible: true }
}

// El período "en el tiempo" que pone Evolución: mes a mes si se puede, si no el primero que no sea todo junto
function periodoEnElTiempo(fuente: Fuente, medida: string, actual: Tiempo): Tiempo {
  const t = medidaDe(fuente, medida)?.tiempos ?? []
  if (actual !== "total" && t.includes(actual)) return actual
  return t.includes("mes") ? "mes" : t.find(x => x !== "total") ?? "total"
}

// La configuración que pone una opción, sin aviso (lo arma `avisoDe` comparando con la anterior)
function configDeVista(c: Config, v: Vista): Config {
  const separa = abrirDe(c.fuente, c.medida)
  const obligatorio = !!medidaDe(c.fuente, c.medida)?.abrirObligatorio
  // Separar por: lo que tenía si sirve; si la opción necesita grupos y no hay, la primera opción de la medida
  const abrirQueSirve = c.abrir !== null && separa.includes(c.abrir) ? c.abrir : obligatorio ? separa[0] ?? null : null
  const grafico = (g: Grafico) => (VISTAS[v].graficos.includes(c.grafico) && c.grafico !== "numero" ? c.grafico : g)
  switch (v) {
    case "numero":
      return { ...c, abrir: null, tiempo: "total", grafico: "numero" }
    case "evolucion": {
      const tiempo = periodoEnElTiempo(c.fuente, c.medida, c.tiempo)
      return { ...c, abrir: abrirQueSirve, tiempo, grafico: grafico("lineas") }
    }
    case "comparar": case "ranking": case "composicion":
      return { ...c, abrir: abrirQueSirve ?? separa[0] ?? null, tiempo: "total", grafico: grafico(VISTAS[v].graficos[0]) }
    case "mapa":
      return { ...c, abrir: "potrero", tiempo: "total", grafico: "mapa" }
    case "tabla": {
      const tiempo = medidaDe(c.fuente, c.medida)?.tiempos.includes(c.tiempo) ? c.tiempo : medidaDe(c.fuente, c.medida)?.tiempos[0] ?? "total"
      return { ...c, abrir: abrirQueSirve, tiempo, grafico: "tabla" }
    }
  }
}

// "Pasé el período a "Todo junto" y separé por potrero, porque el mapa muestra un valor por potrero."
function avisoDe(antes: Config, despues: Config, tocado: "vista" | "medida" | "abrir" | "tiempo", porque: string): string | null {
  const cambios: string[] = []
  if (tocado !== "tiempo" && antes.tiempo !== despues.tiempo) cambios.push(`pasé el período a "${NOMBRE_PERIODO[despues.tiempo]}"`)
  if (tocado !== "abrir" && antes.abrir !== despues.abrir) {
    cambios.push(despues.abrir === null ? "saqué la separación" : `separé por ${ETIQUETA_DIMENSION[despues.abrir]}`)
  }
  const vistaAntes = vistaDe(antes)
  const vistaDespues = vistaDe(despues)
  if (tocado !== "vista" && vistaAntes !== vistaDespues) cambios.push(`pasé a "${VISTAS[vistaDespues].nombre}"`)
  else if (tocado !== "vista" && antes.grafico !== despues.grafico) cambios.push("cambié el tipo de gráfico")
  if (cambios.length === 0) return null
  const texto = cambios.length === 1 ? cambios[0] : `${cambios.slice(0, -1).join(", ")} y ${cambios[cambios.length - 1]}`
  return `${texto[0].toUpperCase()}${texto.slice(1)}, porque ${porque}.`
}

// Tocar una opción visual. Si la medida no la admite, no cambia nada (la opción se ve deshabilitada con su razón).
export function aplicarVista(c: Config, v: Vista): Ajuste {
  if (!disponibilidad(v, c.fuente, c.medida).posible) return { config: c, aviso: null }
  const nueva = configDeVista(c, v)
  return { config: nueva, aviso: avisoDe(c, nueva, "vista", VISTAS[v].porque) }
}

// La primera opción posible para una medida, para cuando la que estaba deja de servir
function vistaPosible(fuente: Fuente, medida: string, preferida: Vista): Vista {
  if (disponibilidad(preferida, fuente, medida).posible) return preferida
  const alternativas: Vista[] = preferida === "mapa" || preferida === "ranking" || preferida === "composicion"
    ? ["comparar", "numero", "tabla"] : ["numero", "comparar", "evolucion", "tabla"]
  return alternativas.find(v => disponibilidad(v, fuente, medida).posible) ?? "tabla"
}

// Elegir otra medida: se mantiene la opción y lo elegido si la medida nueva lo admite; si no, se ajusta y se avisa
export function cambiarMedida(c: Config, fuente: Fuente, medida: string): Ajuste {
  const vista = vistaDe(c)
  const base: Config = { ...c, fuente, medida }
  const v = vistaPosible(fuente, medida, vista)
  const nueva = configDeVista(base, v)
  return { config: nueva, aviso: avisoDe(base, nueva, "medida", `${nombreMedida(base)} no lo admite`) }
}

// Elegir por qué separar (null: sin separar)
export function cambiarSeparar(c: Config, abrir: Dimension | null): Ajuste {
  const base: Config = { ...c, abrir }
  const vista = vistaDe(c)
  let v: Vista = vista
  // Sin grupos no hay qué comparar: un número (o evolución si está en el tiempo)
  if (abrir === null && necesitaSeparar(vista)) v = disponibilidad("numero", c.fuente, c.medida).posible ? "numero" : "tabla"
  // Separado, un número pasa a comparar los grupos
  if (abrir !== null && vista === "numero") v = "comparar"
  // El mapa es solo por potrero
  if (vista === "mapa" && abrir !== "potrero" && abrir !== null) v = "comparar"
  const nueva = v === vista && esValida(base) ? base : { ...configDeVista(base, v), abrir }
  const final = esValida(nueva) ? nueva : configDeVista(base, "tabla")
  const porque = abrir === null ? "sin separar no hay grupos que comparar" : `separado por ${ETIQUETA_DIMENSION[abrir]} hay un valor por grupo`
  return { config: final, aviso: avisoDe(base, final, "abrir", porque) }
}

// Elegir el período (todo junto, mes a mes, por ejercicio o por temporada)
export function cambiarPeriodo(c: Config, tiempo: Tiempo): Ajuste {
  const base: Config = { ...c, tiempo }
  const vista = vistaDe(c)
  let v: Vista = vista
  if (tiempo !== "total" && necesitaTodoJunto(vista)) v = "evolucion"
  if (tiempo === "total" && vista === "evolucion") v = c.abrir === null ? "numero" : "comparar"
  if (v !== vista && !disponibilidad(v, c.fuente, c.medida).posible) v = "tabla"
  let nueva: Config = v === vista && esValida(base) ? base : { ...configDeVista(base, v), tiempo }
  if (!esValida(nueva)) nueva = { ...configDeVista(base, "tabla"), tiempo }
  const porque = tiempo === "total" ? "todo junto es un solo valor por grupo" : "en el tiempo hay un valor por período"
  return { config: nueva, aviso: avisoDe(base, nueva, "tiempo", porque) }
}

// Elegir otro tipo de gráfico dentro de la opción (chips secundarios): solo los que sirven
export function graficosDe(c: Config): Grafico[] {
  return VISTAS[vistaDe(c)].graficos.filter(g => graficoValido(g, c.abrir, c.tiempo))
}

// ── Ida y vuelta: abrir una tarjeta en el constructor y guardarla sin tocar nada da la misma definición ──────────

export const configDe = (d: DefinicionTarjeta): Config =>
  ({ fuente: d.fuente, medida: d.medidas[0], abrir: d.abrir_por, tiempo: d.tiempo, grafico: d.grafico })

// La definición con la configuración nueva, conservando todo lo demás (series, filtros, meta, período, opciones)
export function conConfig(d: DefinicionTarjeta, c: Config): DefinicionTarjeta {
  const medidas = d.fuente === c.fuente && d.medidas[0] === c.medida ? d.medidas : [c.medida]
  return { ...d, fuente: c.fuente, medidas, abrir_por: c.abrir, tiempo: c.tiempo, grafico: c.grafico }
}

// Tarjeta nueva: Stock al cierre, un número, todo junto, sin separar (lo que habilita más opciones)
export const CONFIG_NUEVA: Config = { fuente: "stock", medida: "stock", abrir: null, tiempo: "total", grafico: "numero" }
