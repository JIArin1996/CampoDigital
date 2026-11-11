import { describe, expect, it } from "vitest"

import { detalleDe, doceMeses, enCurso, finDePeriodo } from "@/components/tablero/detalle"

describe("detalle de la tarjeta de número", () => {
  it("dice numerador y denominador en palabras", () => {
    expect(detalleDe("reproductivos", "pct_prenez", { numerador: 468, denominador: 520 })).toBe("468 preñadas de 520 entoradas")
    expect(detalleDe("potreros", "carga_promedio", { numerador: 213.07, denominador: 250 })).toBe("213,1 UG promedio en 250 ha")
  })
  it("sin numerador o denominador, o sin frase para la medida, no hay detalle", () => {
    expect(detalleDe("reproductivos", "pct_prenez", { numerador: null, denominador: 520 })).toBeNull()
    expect(detalleDe("stock", "stock", { numerador: 1, denominador: 2 })).toBeNull()
  })
})

describe("período en curso", () => {
  it("calcula el fin de un mes y de un ejercicio o temporada", () => {
    expect(finDePeriodo("2026-02")).toBe("2026-02-28")
    expect(finDePeriodo("2024-02")).toBe("2024-02-29")
    expect(finDePeriodo("2026/27")).toBe("2027-06-30")
    expect(finDePeriodo(null)).toBeNull()
    expect(finDePeriodo("Vacunos")).toBeNull()
  })
  it("está en curso si todavía no terminó", () => {
    expect(enCurso("2026-11", "2026-11-11")).toBe(true)
    expect(enCurso("2026-10", "2026-11-11")).toBe(false)
    expect(enCurso("2026-11", "2026-11-30")).toBe(false)
    expect(enCurso("2026/27", "2026-11-11")).toBe(true)
    expect(enCurso("2025/26", "2026-11-11")).toBe(false)
  })
  it("los últimos 12 meses empiezan el primer día del mes, 11 meses antes", () => {
    expect(doceMeses("2026-11-11")).toEqual({ desde: "2025-12-01", hasta: "2026-11-11" })
    expect(doceMeses("2026-06-30")).toEqual({ desde: "2025-07-01", hasta: "2026-06-30" })
  })
})
