// Agrupación y orden de lotes y stock (pantalla Lotes).
//
// El lote no tiene un campo de categoría: su "clase" (cría, recría, engorde, toros) se
// deriva de los animales que contiene. Las categorías de animales son un catálogo por
// especie y no tienen clase propia, así que la clase sale del nombre de la categoría
// (el catálogo base de Santa Remigia). Una categoría nueva con otro nombre cae en "Otras"
// hasta que se agregue acá.

import type { CategoriaAnimal, Especie, GrupoEspecie } from "@/types/lotes"

// ── Especies: orden único en todo el sistema ──
// Por grupo (bovino, ovino, otro) y, dentro de cada grupo, por fecha de creación: las que se
// van agregando quedan al final de su grupo. Hoy: Vacunos, Ovinos, Equinos, y las nuevas después.
// Desempate por nombre. Las consultas de especies (getEspecies, getCatalogoEspecies) ya devuelven
// este orden, así que todo selector o listado lo hereda.

const ORDEN_GRUPO: Record<GrupoEspecie, number> = { bovino: 0, ovino: 1, otro: 2 }

export function ordenarEspecies<T extends Pick<Especie, "grupo" | "nombre" | "created_at">>(especies: T[]): T[] {
  return [...especies].sort((a, b) =>
    ORDEN_GRUPO[a.grupo] - ORDEN_GRUPO[b.grupo]
    || a.created_at.localeCompare(b.created_at)
    || a.nombre.localeCompare(b.nombre, "es"))
}

// ── Lotes: orden único en todo el sistema ──
// Por especie (el orden de arriba: vacunos, ovinos, equinos y las demás) y, dentro de cada especie,
// por nombre. getLotes y getLotesPorIds ya devuelven este orden, así que toda lista o selector lo hereda.

export function ordenarLotes<T extends { especie_id: string; nombre: string }>(
  lotes: T[],
  especies: Pick<Especie, "id" | "grupo" | "nombre" | "created_at">[],
): T[] {
  const posicion = new Map(ordenarEspecies(especies).map((e, i) => [e.id, i]))
  return [...lotes].sort((a, b) =>
    (posicion.get(a.especie_id) ?? Infinity) - (posicion.get(b.especie_id) ?? Infinity)
    || a.nombre.localeCompare(b.nombre, "es", { numeric: true }))
}

// ── Color de la especie ──
// Cada especie puede tener su color (especies.color, #rrggbb). Vacío = el del grupo.
// Los del grupo son los de siempre: bovino = el verde de la marca (--primary), ovino ámbar, otro gris pizarra.

export const COLOR_POR_GRUPO: Record<GrupoEspecie, string> = {
  bovino: "#196632",
  ovino: "#c5770f",
  otro: "#667383",
}

// Sugeridos en la pantalla Especies (además del selector libre)
export const COLORES_SUGERIDOS: { nombre: string; hex: string }[] = [
  { nombre: "Verde", hex: "#196632" },
  { nombre: "Ámbar", hex: "#c5770f" },
  { nombre: "Pizarra", hex: "#667383" },
  { nombre: "Azul", hex: "#1d5fa8" },
  { nombre: "Turquesa", hex: "#0f766e" },
  { nombre: "Violeta", hex: "#6b3fa0" },
  { nombre: "Rojo", hex: "#b42318" },
  { nombre: "Marrón", hex: "#7a4a24" },
]

export function colorDeEspecie(especie: { color?: string | null; grupo: GrupoEspecie }): string {
  return especie.color ?? COLOR_POR_GRUPO[especie.grupo]
}

// Tono suave derivado del color (para fondos y pistas de barras): no se guarda, se mezcla con blanco
export function colorSuave(color: string): string {
  return `color-mix(in oklab, ${color} 16%, white)`
}

// Luminancia relativa (WCAG) de un #rrggbb
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

// Texto que se lee sobre el color: blanco o casi negro (--foreground), el de mayor contraste
export function textoSobre(color: string): string {
  const l = luminancia(color)
  const contrasteBlanco = 1.05 / (l + 0.05)
  const contrasteOscuro = (l + 0.05) / (luminancia("#101911") + 0.05)
  return contrasteBlanco >= contrasteOscuro ? "#ffffff" : "#101911"
}

// ── Clase de una categoría de animales ──

export type ClaseLote = "cria" | "recria" | "engorde" | "toros" | "otras"

export const ORDEN_CLASE: ClaseLote[] = ["cria", "recria", "engorde", "toros", "otras"]

export const ETIQUETA_CLASE: Record<ClaseLote, string> = {
  cria: "Cría",
  recria: "Recría",
  engorde: "Engorde",
  toros: "Toros",
  otras: "Otras",
}

// Nombre normalizado (minúsculas, sin tildes ni espacios de más) → clase.
// Vacunos y ovinos del catálogo base. "Vacas de invernada o descarte" y "Ovejas de descarte"
// se toman como engorde (se terminan para vender); los carneros, como toros.
const CLASE_POR_NOMBRE: Record<string, ClaseLote> = {
  "vacas de cria": "cria",
  "terneros/as": "recria",
  "corderos/as": "recria",
  "ovejas de cria": "cria",
  "terneros": "recria",
  "terneras": "recria",
  "vaquillonas": "recria",
  "corderos": "recria",
  "corderas": "recria",
  "borregos": "recria",
  "borregas": "recria",
  "novillos": "engorde",
  "vacas de invernada o descarte": "engorde",
  "ovejas de descarte": "engorde",
  "toros": "toros",
  "carneros": "toros",
}

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

export function claseDeCategoria(nombre: string): ClaseLote {
  return CLASE_POR_NOMBRE[normalizar(nombre)] ?? "otras"
}

// Categorías en orden lógico: por clase (cría, recría, engorde, toros, otras) y, dentro, por el orden del catálogo
export function ordenarCategorias<T extends Pick<CategoriaAnimal, "nombre" | "orden">>(categorias: T[]): T[] {
  const pos = (c: T) => ORDEN_CLASE.indexOf(claseDeCategoria(c.nombre))
  return [...categorias].sort((a, b) => pos(a) - pos(b) || a.orden - b.orden)
}

type StockCategoria = { categoria_id: string; cabezas: number }
type CategoriaConCria = Pick<CategoriaAnimal, "id" | "nombre" | "cria_al_pie">

/**
 * Cabezas de un lote separadas en crías al pie y el resto. Las crías se separan solo si el
 * lote tiene otras categorías ("100 vacas + 20 crías al pie"); un lote de solo crías (de cría
 * propio o de destetados) cuenta todo como "resto", como siempre.
 */
export function separarCrias(stock: StockCategoria[], categorias: CategoriaConCria[]) {
  const esCria = (s: StockCategoria) => categorias.find(c => c.id === s.categoria_id)?.cria_al_pie ?? false
  const conAnimales = stock.filter(s => s.cabezas > 0)
  const crias = conAnimales.filter(esCria).reduce((n, s) => n + s.cabezas, 0)
  const total = conAnimales.reduce((n, s) => n + s.cabezas, 0)
  return crias > 0 && crias < total ? { resto: total - crias, crias } : { resto: total, crias: 0 }
}

/**
 * Clase de un lote: la clase con más cabezas entre sus categorías (la predominante).
 * Las crías al pie no cuentan si el lote tiene otras categorías: 100 vacas y 80 terneros al pie
 * es un lote de cría. Un lote de solo crías toma la clase de ellas (recría).
 * Empate: gana la que va primero en el orden (cría antes que recría, etc.).
 * Sin animales: "otras".
 */
export function claseDeLote(stock: StockCategoria[], categorias: CategoriaConCria[]): ClaseLote {
  const { crias } = separarCrias(stock, categorias)
  const porClase = new Map<ClaseLote, number>()
  for (const s of stock) {
    const categoria = categorias.find(c => c.id === s.categoria_id)
    if (!categoria || s.cabezas <= 0) continue
    if (crias > 0 && categoria.cria_al_pie) continue
    const clase = claseDeCategoria(categoria.nombre)
    porClase.set(clase, (porClase.get(clase) ?? 0) + s.cabezas)
  }
  let mejor: ClaseLote = "otras"
  let max = 0
  for (const clase of ORDEN_CLASE) {
    const n = porClase.get(clase) ?? 0
    if (n > max) {
      mejor = clase
      max = n
    }
  }
  return mejor
}
