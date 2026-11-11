import { describe, expect, it } from "vitest"

import { MEDIDAS, medidaDe } from "@/components/tablero/catalogo"
import { DESCRIPCION, GLOSARIO, GLOSARIO_DE, SINONIMOS, buscarMedidas, descripcionDe } from "@/components/tablero/ayudas"
import type { Fuente } from "@/types/tablero"

const existe = (clave: string) => {
  const [f, ...resto] = clave.split(":")
  return !!medidaDe(f as Fuente, resto.join(":"))
}

describe("ayudas del buscador", () => {
  it("cada medida tiene una línea de descripción", () => {
    for (const f of Object.keys(MEDIDAS) as Fuente[]) {
      for (const m of Object.keys(MEDIDAS[f] ?? {})) expect(descripcionDe(f, m), `${f}:${m}`).not.toBe("")
    }
  })
  it("las descripciones, sinónimos y glosario apuntan a medidas y términos que existen", () => {
    for (const k of Object.keys(DESCRIPCION)) expect(existe(k), k).toBe(true)
    for (const [palabra, claves] of Object.entries(SINONIMOS)) for (const k of claves) expect(existe(k), `${palabra} → ${k}`).toBe(true)
    for (const [k, terminos] of Object.entries(GLOSARIO_DE)) {
      expect(existe(k), k).toBe(true)
      for (const t of terminos) expect(GLOSARIO[t], t).toBeDefined()
    }
  })
  it("busca por sinónimos, sin mayúsculas ni tildes", () => {
    const primera = (q: string) => { const r = buscarMedidas(q)[0]; return `${r.fuente}:${r.medida}` }
    expect(primera("plata")).toBe("economia:resultado")
    expect(buscarMedidas("plata")[0].motivo).toBe('coincide con "plata"')
    expect(primera("engorde")).toBe("pesadas:ganancia_diaria")
    expect(primera("animales")).toBe("stock:stock")
    expect(primera("carga")).toBe("potreros:carga_promedio")
    expect(primera("PREÑEZ")).toBe("reproductivos:pct_prenez")
  })
  it("sin texto devuelve todas", () => {
    const total = (Object.keys(MEDIDAS) as Fuente[]).reduce((n, f) => n + Object.keys(MEDIDAS[f] ?? {}).length, 0)
    expect(buscarMedidas("").length).toBe(total)
  })
})
