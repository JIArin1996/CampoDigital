// Equivalencias en unidades ganaderas (UG) por cabeza, según la categoría. Se busca por nombre (sin importar
// mayúsculas ni tildes): una categoría que no está acá no suma UG y se avisa.
// Vaquillonas y novillos van como 250-350 kg; borregos como borregas. Los terneros al pie suman como terneros.

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

const TABLA: Record<string, number> = {
  // Vacunos
  "terneros/as": 0.5, "terneros": 0.5, "terneras": 0.5,
  "vaquillonas": 0.8,
  "novillos": 0.8,
  "vacas de cria": 1,
  "vacas de invernada o descarte": 1,    // vacas falladas
  "toros": 1.2,
  // Ovinos
  "corderos/as": 0.1, "corderos": 0.1, "corderas": 0.1,
  "borregos": 0.16, "borregas": 0.16,
  "ovejas de cria": 0.15,
  "ovejas de descarte": 0.12,             // ovejas de refugo
  "carneros": 0.17,
  // Equinos
  "yeguas": 1.2,
  "caballos": 1.25,
  "potrillos/as": 0.5, "potrillos": 0.5, "potrillas": 0.5,
  "padrillos": 1.25,
}

export function ugPorCabeza(categoria: string): number | null {
  return TABLA[sinTildes(categoria)] ?? null
}
