// Agrupación y orden de lotes y stock (pantalla Lotes).
//
// El lote no tiene un campo de categoría: su "clase" (cría, recría, engorde, toros) se
// deriva de los animales que contiene. Las categorías de animales son un catálogo por
// especie y no tienen clase propia, así que la clase sale del nombre de la categoría
// (el catálogo base de Santa Remigia). Una categoría nueva con otro nombre cae en "Otras"
// hasta que se agregue acá.

import type { CategoriaAnimal, Especie, GrupoEspecie } from "@/types/lotes"

// ── Especies: orden fijo Bovinos, Ovinos, Otros (por grupo, no por nombre) ──

const ORDEN_GRUPO: Record<GrupoEspecie, number> = { bovino: 0, ovino: 1, otro: 2 }

export function ordenarEspecies<T extends Pick<Especie, "grupo" | "nombre">>(especies: T[]): T[] {
  return [...especies].sort((a, b) => ORDEN_GRUPO[a.grupo] - ORDEN_GRUPO[b.grupo] || a.nombre.localeCompare(b.nombre, "es"))
}

// Clases de Tailwind por grupo (literales, para que Tailwind las encuentre). Ver --especie-* en globals.css.
export const COLOR_ESPECIE: Record<GrupoEspecie, { solido: string; suave: string }> = {
  bovino: { solido: "bg-(--especie-bovino)", suave: "bg-(--especie-bovino-suave)" },
  ovino:  { solido: "bg-(--especie-ovino)",  suave: "bg-(--especie-ovino-suave)" },
  otro:   { solido: "bg-(--especie-otro)",   suave: "bg-(--especie-otro-suave)" },
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

/**
 * Clase de un lote: la clase con más cabezas entre sus categorías (la predominante).
 * Empate: gana la que va primero en el orden (cría antes que recría, etc.).
 * Sin animales: "otras".
 */
export function claseDeLote(
  stock: { categoria_id: string; cabezas: number }[],
  categorias: Pick<CategoriaAnimal, "id" | "nombre">[],
): ClaseLote {
  const porClase = new Map<ClaseLote, number>()
  for (const s of stock) {
    const categoria = categorias.find(c => c.id === s.categoria_id)
    if (!categoria || s.cabezas <= 0) continue
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
