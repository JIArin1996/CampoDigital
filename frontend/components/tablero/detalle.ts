import { formato } from "@/components/tablero/formato"
import type { FilaTablero } from "@/types/tablero"

/**
 * El detalle de la tarjeta de número (contexto/DISENO-CONSTRUCTOR-TARJETAS.md, sección 8): con el numerador y el
 * denominador que devuelve la base, en palabras ("468 preñadas de 520 entoradas"). Lo que cuenta cada uno sale de las
 * funciones tablero_<fuente> (ver sus comentarios en las migraciones).
 */
const n = (x: number, dec = 1) => x.toLocaleString("es-UY", { maximumFractionDigits: dec })
const cab = (x: number) => `${n(x, 0)} ${x === 1 ? "cabeza" : "cabezas"}`

const DETALLE: Record<string, (a: number, b: number) => string> = {
  // Stock
  "stock:mortandad_pct": (a, b) => `${n(a, 0)} muertas de ${cab(b)} (al inicio, más nacimientos y compras)`,
  "stock:pct_extraccion": (a, b) => `${n(a, 0)} vendidas o consumidas de ${cab(b)} al inicio`,
  "stock:pct_vacas_cria": (a, b) => `${n(a, 0)} vacas de cría de ${cab(b)}`,
  "stock:stock_promedio": (a, b) => `${n(a, 0)} cabezas-día en ${n(b, 0)} días`,
  "stock:ug_promedio": (a, b) => `${n(a, 0)} UG-día en ${n(b, 0)} días`,
  "stock:lanar_vacuno": (a, b) => `${n(a, 0)} lanares por ${n(b, 0)} vacunos`,
  "stock:lanar_vacuno_ug": (a, b) => `${n(a)} UG lanares por ${n(b)} UG vacunas`,
  // Reproductivos
  "reproductivos:pct_prenez": (a, b) => `${n(a, 0)} preñadas de ${n(b, 0)} entoradas`,
  "reproductivos:pct_paricion": (a, b) => `${n(a, 0)} nacidos vivos de ${n(b, 0)} entoradas`,
  "reproductivos:pct_paricion_total": (a, b) => `${n(a, 0)} nacidos (vivos y muertos) de ${n(b, 0)} entoradas`,
  "reproductivos:pct_destete": (a, b) => `${n(a, 0)} destetados de ${n(b, 0)} entoradas`,
  "reproductivos:pct_perdidas": (a, b) => `${n(a, 0)} perdidas de ${n(b, 0)} preñadas`,
  "reproductivos:pct_reposicion": (a, b) => `${n(a, 0)} de reposición de ${n(b, 0)} entoradas`,
  "reproductivos:kg_destetados_vaca": (a, b) => `${n(a, 0)} kg destetados de ${n(b, 0)} entoradas`,
  "reproductivos:peso_destete": (a, b) => `${n(a, 0)} kg de ${n(b, 0)} destetados con peso`,
  // Pesadas
  "pesadas:ganancia_diaria": (a, b) => `${n(a)} kg en ${n(b, 0)} cabezas-día`,
  "pesadas:peso_promedio": (_a, b) => `${cab(b)} pesadas`,
  // Economía
  "economia:precio_venta": (a, b) => `${formato(a, "USD")} por ${n(b, 0)} kg vendidos`,
  "economia:pct_gasto": (a, b) => `${formato(a, "USD")} de ${formato(b, "USD")}`,
  // Potreros
  "potreros:carga": (a, b) => `${n(a)} UG en ${n(b)} ha`,
  "potreros:carga_promedio": (a, b) => `${n(a)} UG promedio en ${n(b)} ha`,
  "potreros:presion": (a, b) => `${n(a, 0)} UG-día en ${n(b)} ha`,
  // Kilos y lana
  "produccion:peso_venta": (a, b) => `${n(a, 0)} kg en ${cab(b)} vendidas`,
}

// null: la medida no tiene detalle, o la base no devolvió numerador y denominador
export function detalleDe(fuente: string, medida: string, f: Pick<FilaTablero, "numerador" | "denominador">): string | null {
  if (f.numerador === null || f.denominador === null) return null
  const d = DETALLE[`${fuente}:${medida}`]
  return d ? d(f.numerador, f.denominador) : null
}

// ── Período en curso ─────────────────────────────────────────────────────────────────────────────────────────────
// Un período que todavía no terminó (el mes, ejercicio o temporada de hoy) se dibuja rayado o punteado: su valor va a
// cambiar. La base devuelve "2026-11" (mes) o "2026/27" (ejercicio y temporada, de julio a junio).
export function finDePeriodo(periodo: string | null): string | null {
  if (!periodo) return null
  const mes = /^(\d{4})-(\d{2})$/.exec(periodo)
  if (mes) {
    const ultimo = new Date(Number(mes[1]), Number(mes[2]), 0).getDate()
    return `${mes[1]}-${mes[2]}-${String(ultimo).padStart(2, "0")}`
  }
  const ej = /^(\d{4})\/\d{2}$/.exec(periodo)
  return ej ? `${Number(ej[1]) + 1}-06-30` : null
}

export const enCurso = (periodo: string | null, hoy = new Date().toLocaleDateString("en-CA")) => {
  const fin = finDePeriodo(periodo)
  return fin !== null && fin > hoy
}

// Los últimos 12 meses hasta "hasta" (para la minilínea de la tarjeta de número): del primer día del mes 11 meses antes
export function doceMeses(hasta: string): { desde: string; hasta: string } {
  const [a, m] = hasta.split("-").map(Number)
  const d = new Date(a, m - 1 - 11, 1)
  return { desde: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, hasta }
}
