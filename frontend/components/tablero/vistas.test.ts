import { describe, expect, it } from "vitest"

import { MEDIDAS, PENDIENTES, abrirDe, medidaDe, plantilla } from "@/components/tablero/catalogo"
import {
  CONFIG_NUEVA, ORDEN_VISTAS, aplicarVista, cambiarMedida, cambiarPeriodo, cambiarSeparar, conConfig, configDe, disponibilidad,
  esValida, vistaDe, type Config,
} from "@/components/tablero/vistas"
import type { DefinicionTarjeta, Dimension, Fuente, Grafico, Tiempo } from "@/types/tablero"

// Pruebas del rediseño del constructor (contexto/DISENO-CONSTRUCTOR-TARJETAS.md, sección 10), sobre todo el catálogo

const GRAFICOS: Grafico[] = ["numero", "barras", "barras_horizontales", "barras_apiladas", "barras_linea", "lineas", "torta", "tabla", "mapa"]
const TIEMPOS: Tiempo[] = ["total", "mes", "ejercicio", "temporada"]
const MEDIDAS_TODAS = (Object.keys(MEDIDAS) as Fuente[]).flatMap(f => Object.keys(MEDIDAS[f] ?? {}).map(m => ({ fuente: f, medida: m })))

// Todas las combinaciones que la base acepta
const VALIDAS: Config[] = MEDIDAS_TODAS.flatMap(({ fuente, medida }) =>
  [null, ...abrirDe(fuente, medida)].flatMap(abrir => TIEMPOS.flatMap(tiempo => GRAFICOS.map(grafico =>
    ({ fuente, medida, abrir: abrir as Dimension | null, tiempo, grafico })))))
  .filter(esValida)

// Un punto de partida por medida y opción visual (para los cambios de medida, que cruzan todas con todas)
const INICIOS: Config[] = MEDIDAS_TODAS.flatMap(({ fuente, medida }) => {
  const base = VALIDAS.find(c => c.fuente === fuente && c.medida === medida)!
  return ORDEN_VISTAS.map(v => aplicarVista(base, v).config)
})

// Lo que cambió además de lo tocado
const otrosCambios = (antes: Config, despues: Config, tocado: keyof Config) =>
  (["abrir", "tiempo", "grafico"] as const).filter(k => k !== tocado && antes[k] !== despues[k])

describe("catálogo", () => {
  it("hay combinaciones válidas para cada medida", () => {
    expect(MEDIDAS_TODAS.length).toBeGreaterThan(60)
    for (const { fuente, medida } of MEDIDAS_TODAS) expect(VALIDAS.some(c => c.fuente === fuente && c.medida === medida)).toBe(true)
  })
  it("la tarjeta nueva es válida y arranca en Un número", () => {
    expect(esValida(CONFIG_NUEVA)).toBe(true)
    expect(vistaDe(CONFIG_NUEVA)).toBe("numero")
  })
})

describe("1 · opciones visuales: solo combinaciones válidas del catálogo", () => {
  it("cada opción sobre cada combinación válida da una válida, con esa opción; si no se puede, no cambia y dice por qué", () => {
    for (const c of VALIDAS) {
      for (const v of ORDEN_VISTAS) {
        const d = disponibilidad(v, c.fuente, c.medida)
        const r = aplicarVista(c, v)
        if (d.posible) {
          expect(esValida(r.config), `${v} sobre ${JSON.stringify(c)} → ${JSON.stringify(r.config)}`).toBe(true)
          expect(vistaDe(r.config)).toBe(v)
          expect(r.config.medida).toBe(c.medida)
        } else {
          expect(r.config).toEqual(c)
          expect(d.razon && d.razon.length > 0).toBe(true)
        }
      }
    }
  })
  it("un número, evolución y tabla se pueden usar con casi todo; el mapa, solo con lo que se separa por potrero", () => {
    for (const { fuente, medida } of MEDIDAS_TODAS) {
      expect(disponibilidad("tabla", fuente, medida).posible).toBe(true)
      expect(disponibilidad("mapa", fuente, medida).posible).toBe(abrirDe(fuente, medida).includes("potrero") && !!medidaDe(fuente, medida)?.tiempos.includes("total"))
    }
  })
})

describe("2 · cada ajuste automático avisa y se puede deshacer", () => {
  it("elegir una opción: avisa si cambió separar por o el período", () => {
    for (const c of VALIDAS) {
      for (const v of ORDEN_VISTAS) {
        const antes = structuredClone(c)
        const r = aplicarVista(c, v)
        expect(c).toEqual(antes)                       // no toca la anterior: Deshacer la restaura tal cual
        const cambio = r.config.abrir !== c.abrir || r.config.tiempo !== c.tiempo
        expect(r.aviso !== null, `${v} sobre ${JSON.stringify(c)}`).toBe(cambio)
      }
    }
  })
  it("cambiar la medida: válida, con la medida pedida, y avisa si cambió algo más", () => {
    for (const c of INICIOS) {
      for (const { fuente, medida } of MEDIDAS_TODAS) {
        const antes = structuredClone(c)
        const r = cambiarMedida(c, fuente, medida)
        expect(c).toEqual(antes)
        expect(esValida(r.config), `${fuente}:${medida} desde ${JSON.stringify(c)} → ${JSON.stringify(r.config)}`).toBe(true)
        expect([r.config.fuente, r.config.medida]).toEqual([fuente, medida])
        expect(r.aviso !== null).toBe(otrosCambios(c, r.config, "medida").length > 0)
      }
    }
  })
  it("cambiar separar por: válida, con lo pedido, y avisa si cambió algo más", () => {
    for (const c of VALIDAS) {
      const m = medidaDe(c.fuente, c.medida)!
      const opciones: (Dimension | null)[] = [...(m.abrirObligatorio ? [] : [null]), ...abrirDe(c.fuente, c.medida)]
      for (const a of opciones) {
        const antes = structuredClone(c)
        const r = cambiarSeparar(c, a)
        expect(c).toEqual(antes)
        expect(esValida(r.config), `${a} sobre ${JSON.stringify(c)} → ${JSON.stringify(r.config)}`).toBe(true)
        expect(r.config.abrir).toBe(a)
        expect(r.aviso !== null).toBe(otrosCambios(c, r.config, "abrir").length > 0)
      }
    }
  })
  it("cambiar el período: válida, con lo pedido, y avisa si cambió algo más", () => {
    for (const c of VALIDAS) {
      for (const t of medidaDe(c.fuente, c.medida)!.tiempos) {
        const antes = structuredClone(c)
        const r = cambiarPeriodo(c, t)
        expect(c).toEqual(antes)
        expect(esValida(r.config), `${t} sobre ${JSON.stringify(c)} → ${JSON.stringify(r.config)}`).toBe(true)
        expect(r.config.tiempo).toBe(t)
        expect(r.aviso !== null).toBe(otrosCambios(c, r.config, "tiempo").length > 0)
      }
    }
  })
  it("el aviso dice qué cambió y por qué", () => {
    const r = aplicarVista({ fuente: "potreros", medida: "carga_promedio", abrir: null, tiempo: "mes", grafico: "lineas" }, "mapa")
    expect(r.aviso).toBe('Pasé el período a "Todo junto" y separé por potrero, porque el mapa muestra un valor por potrero.')
  })
})

describe("3 · una tarjeta existente se abre y se guarda sin cambios", () => {
  const tarjetas = plantilla().flatMap(p => p.tarjetas)
  it("las de la plantilla: definición → configuración → definición da lo mismo", () => {
    expect(tarjetas.length).toBeGreaterThan(40)
    for (const t of tarjetas) expect(conConfig(t.definicion, configDe(t.definicion))).toEqual(t.definicion)
  })
  it("las de la plantilla son válidas, salvo las que esperan una medida que todavía no existe", () => {
    for (const t of tarjetas) {
      if (PENDIENTES[t.definicion.medidas[0]]) continue
      expect(esValida(configDe(t.definicion)), t.titulo).toBe(true)
    }
  })
  it("cualquier combinación válida, con series, filtros, meta y período propios, vuelve igual", () => {
    for (const c of VALIDAS) {
      const d: DefinicionTarjeta = {
        fuente: c.fuente, medidas: [c.medida, "otra"], abrir_por: c.abrir, tiempo: c.tiempo, grafico: c.grafico,
        periodo: { ejercicios: 3 }, filtros: { especie_ids: ["e1"] }, meta: { valor: 85, mejor: "sube" }, acumuladas: ["otra"],
      }
      expect(conConfig(d, configDe(d))).toEqual(d)
    }
  })
  it("cambiar de medida deja una sola (las series eran de la otra) y conserva lo demás", () => {
    const d: DefinicionTarjeta = { fuente: "economia", medidas: ["ingresos", "gastos"], abrir_por: null, tiempo: "mes", grafico: "barras", meta: { valor: 1, mejor: "sube" } }
    const r = cambiarMedida(configDe(d), "stock", "stock")
    const nueva = conConfig(d, r.config)
    expect(nueva.medidas).toEqual(["stock"])
    expect(nueva.meta).toEqual(d.meta)
  })
})
