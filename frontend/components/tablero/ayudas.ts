import { MEDIDAS, NOMBRE_FUENTE, formula, propiaDe } from "@/components/tablero/catalogo"
import type { Fuente } from "@/types/tablero"

/**
 * Ayudas del buscador de medidas (contexto/DISENO-CONSTRUCTOR-TARJETAS.md, sección 2): una línea de descripción en
 * lenguaje simple por medida, sinónimos para la búsqueda y un glosario con ejemplos. La clave de una medida es
 * "fuente:medida".
 */

export const DESCRIPCION: Record<string, string> = {
  // Stock
  "stock:stock": "Cuántos animales hay al último día de cada período",
  "stock:movimientos": "Animales que entraron y salieron: nacimientos, compras, ventas, muertes…",
  "stock:mortandad_pct": "Animales muertos sobre los que hubo en el período",
  "stock:ug": "Unidades ganaderas al último día de cada período",
  "stock:ug_promedio": "Unidades ganaderas en promedio durante el período",
  "stock:stock_promedio": "Animales en promedio durante el período",
  "stock:pct_extraccion": "Animales que salieron (ventas y consumo) sobre el stock promedio",
  "stock:pct_vacas_cria": "Qué parte del rodeo son vacas de cría",
  "stock:lanar_vacuno": "Cuántos ovinos hay por cada vacuno",
  "stock:lanar_vacuno_ug": "Ovinos por cada vacuno, contados en unidades ganaderas",
  // Reproductivos
  "reproductivos:pct_prenez": "Vacas preñadas sobre vacas entoradas, por temporada",
  "reproductivos:pct_paricion": "Terneros nacidos vivos sobre vacas entoradas",
  "reproductivos:pct_paricion_total": "Terneros nacidos (vivos y muertos) sobre vacas entoradas",
  "reproductivos:pct_destete": "Terneros destetados sobre vacas entoradas",
  "reproductivos:entoradas": "Vacas que se pusieron con el toro o se inseminaron",
  "reproductivos:prenadas": "Vacas que quedaron preñadas en el diagnóstico",
  "reproductivos:nacidos_vivos": "Terneros que nacieron vivos",
  "reproductivos:nacidos_muertos": "Terneros que nacieron muertos",
  "reproductivos:destetados": "Terneros destetados en la temporada",
  "reproductivos:pct_perdidas": "Preñeces que no llegaron a destete",
  "reproductivos:pct_reposicion": "Vaquillonas entoradas sobre el total de entoradas",
  "reproductivos:kg_destetados": "Kilos de terneros destetados en la temporada",
  "reproductivos:kg_destetados_vaca": "Kilos destetados por cada vaca entorada",
  "reproductivos:peso_destete": "Peso promedio de los terneros al destete",
  // Producción y pesos
  "pesadas:peso_promedio": "Peso promedio de los animales en la última pesada",
  "pesadas:ganancia_diaria": "Kilos que gana cada animal por día entre pesadas",
  "pesadas:kg_producidos": "Kilos ganados entre pesadas",
  // Economía
  "economia:resultado": "Lo que entró menos lo que salió en el período",
  "economia:ingresos": "Ventas y otros cobros del período",
  "economia:gastos": "Todos los gastos del período, compras de hacienda incluidas",
  "economia:pendiente_cobro": "Lo que falta cobrar al cierre",
  "economia:pendiente_pago": "Lo que falta pagar al cierre",
  "economia:gastos_operativos": "Gastos sin las compras de hacienda",
  "economia:precio_venta": "Dólares por kilo vendido",
  "economia:flujo_caja": "Lo cobrado menos lo pagado, por fecha de pago",
  "economia:pct_gasto": "Qué parte del gasto se va en cada concepto, rubro o titular",
  "economia:saldos": "Quién le debe a quién entre titulares y pagadores",
  // Potreros
  "potreros:carga": "UG por hectárea en cada potrero, al cierre",
  "potreros:ug": "Unidades ganaderas en cada potrero, al cierre",
  "potreros:superficie": "Hectáreas de cada potrero según su dibujo",
  "potreros:superficie_efectiva": "Hectáreas que se pastorean (sin montes, bañados…)",
  "potreros:dias_ocupacion": "Días que el potrero tuvo animales",
  "potreros:dias_descanso": "Días que el potrero estuvo sin animales",
  "potreros:carga_promedio": "UG por hectárea, en promedio durante el período",
  "potreros:presion": "Cuánto se usó cada potrero: UG por día, por hectárea",
  "potreros:ha_spg": "Hectáreas de pastoreo de todo el campo",
  "potreros:ha_forestadas": "Hectáreas con forestación",
  "potreros:potreros_sin_animales": "Potreros vacíos al cierre",
  "potreros:ha_sin_animales": "Hectáreas de los potreros vacíos al cierre",
  "potreros:dias_desde_salida": "Días desde que salieron los últimos animales",
  // Kilos y lana
  "produccion:kg_stock": "Kilos de todos los animales al cierre",
  "produccion:produccion_carne": "Kilos que ganó el rodeo en el período",
  "produccion:kg_vendidos": "Kilos vendidos",
  "produccion:kg_comprados": "Kilos comprados",
  "produccion:peso_venta": "Peso promedio de los animales vendidos",
  "produccion:lana": "Kilos de lana esquilados",
  "produccion:lana_por_animal": "Kilos de lana por animal esquilado",
  "produccion:carne_equivalente": "Carne producida más la lana convertida a carne",
  // Gestión
  "gestion:tareas_vencidas": "Tareas pendientes con el vencimiento pasado",
  "gestion:tareas_proximas": "Tareas que vencen en los próximos 15 días",
  "gestion:lotes_carencia": "Lotes con animales que todavía no se pueden vender",
  "gestion:cab_carencia": "Animales que todavía no se pueden vender por un remedio",
  "gestion:proximas_dosis": "Dosis de sanidad que tocan en los próximos 15 días",
}

// Palabras que la gente usa, y las medidas a las que llevan (la búsqueda no distingue mayúsculas ni tildes)
export const SINONIMOS: Record<string, string[]> = {
  plata: ["economia:resultado", "economia:ingresos", "economia:gastos", "economia:gastos_operativos", "economia:flujo_caja",
          "economia:precio_venta", "combinada:fab:resultado_ha_spg", "combinada:fab:margen_kg"],
  ganancia: ["economia:resultado", "pesadas:ganancia_diaria"],
  costo: ["economia:gastos_operativos", "combinada:fab:costo_kg", "combinada:fab:gasto_ug"],
  ventas: ["economia:ingresos", "produccion:kg_vendidos", "economia:precio_venta", "produccion:peso_venta"],
  compras: ["produccion:kg_comprados", "economia:gastos"],
  deudas: ["economia:pendiente_pago", "economia:pendiente_cobro", "economia:saldos"],
  cobrar: ["economia:pendiente_cobro"],
  pagar: ["economia:pendiente_pago"],
  engorde: ["pesadas:ganancia_diaria", "pesadas:kg_producidos", "pesadas:peso_promedio", "produccion:produccion_carne"],
  kilos: ["produccion:kg_stock", "produccion:produccion_carne", "pesadas:peso_promedio", "pesadas:kg_producidos"],
  peso: ["pesadas:peso_promedio", "produccion:peso_venta", "reproductivos:peso_destete"],
  animales: ["stock:stock", "stock:stock_promedio", "stock:movimientos"],
  cabezas: ["stock:stock", "stock:stock_promedio"],
  hacienda: ["stock:stock", "stock:movimientos"],
  rodeo: ["stock:stock", "stock:pct_vacas_cria"],
  muertes: ["stock:mortandad_pct", "reproductivos:nacidos_muertos"],
  carga: ["potreros:carga_promedio", "potreros:carga", "potreros:presion"],
  campo: ["potreros:ha_spg", "potreros:superficie"],
  hectareas: ["potreros:ha_spg", "potreros:superficie", "potreros:superficie_efectiva"],
  descanso: ["potreros:dias_descanso", "potreros:dias_desde_salida"],
  rotacion: ["potreros:dias_ocupacion", "potreros:dias_descanso", "potreros:presion"],
  vacios: ["potreros:potreros_sin_animales", "potreros:ha_sin_animales"],
  montes: ["potreros:ha_forestadas"],
  terneros: ["reproductivos:nacidos_vivos", "reproductivos:destetados", "reproductivos:pct_destete"],
  prenadas: ["reproductivos:pct_prenez", "reproductivos:prenadas"],
  toro: ["reproductivos:entoradas", "reproductivos:pct_prenez"],
  saca: ["stock:pct_extraccion"],
  esquila: ["produccion:lana", "produccion:lana_por_animal"],
  tareas: ["gestion:tareas_vencidas", "gestion:tareas_proximas"],
  pendientes: ["gestion:tareas_vencidas", "economia:pendiente_cobro", "economia:pendiente_pago"],
  remedios: ["gestion:proximas_dosis", "gestion:lotes_carencia", "gestion:cab_carencia"],
  vacunas: ["gestion:proximas_dosis"],
  sanidad: ["gestion:proximas_dosis", "gestion:lotes_carencia"],
}

export interface Termino { titulo: string; texto: string; ejemplo: string }

// Términos técnicos, con una explicación y un ejemplo concreto (ⓘ junto a la medida)
export const GLOSARIO: Record<string, Termino> = {
  ug: { titulo: "UG (unidad ganadera)", texto: "Suma animales distintos según lo que comen: una vaca de cría es 1 UG, un novillo 0,8. La UG de cada categoría se carga en Especies.",
        ejemplo: "100 vacas + 150 novillos = 100 + 120 = 220 UG." },
  ha_spg: { titulo: "Ha SPG (superficie de pastoreo)", texto: "Las hectáreas de los potreros de uso ganadero (o sin uso cargado), sin las zonas que no se pastorean, como montes o bañados.",
            ejemplo: "Con 300 ha SPG y un resultado de USD 1.000, el resultado por ha SPG es USD 3,33." },
  area_efectiva: { titulo: "Área efectiva", texto: "La superficie del potrero menos sus zonas no aprovechables.",
                   ejemplo: "Un potrero de 120 ha con 20 ha de monte tiene 100 ha de área efectiva." },
  carga: { titulo: "Carga", texto: "Unidades ganaderas por hectárea: cuánto animal tiene cada hectárea.",
           ejemplo: "213 UG en 300 ha SPG = 0,71 UG/ha." },
  presion: { titulo: "Presión acumulada", texto: "Las UG que estuvieron en el potrero, sumadas día por día y divididas por sus hectáreas: cuánto se usó en el período.",
             ejemplo: "100 UG durante 30 días en 50 ha = 60 UG-día/ha." },
  extraccion: { titulo: "Tasa de extracción", texto: "Los animales que salieron por venta o consumo, sobre el stock promedio.",
                ejemplo: "300 vendidos con un stock promedio de 1.000 = 30 %." },
  produccion_carne: { titulo: "Producción de carne", texto: "Los kilos que ganó el rodeo: kilos al cierre menos al inicio, más vendidos y consumidos, menos comprados.",
                      ejemplo: "Empezó con 100.000 kg, terminó con 105.000, vendió 12.000 y compró 2.000: produjo 15.000 kg." },
  carne_equivalente: { titulo: "Carne equivalente", texto: "La carne producida más la lana convertida a carne (1 kg de lana = 2,48 kg de carne).",
                       ejemplo: "14.840 kg de carne + 900 kg de lana = 17.072 kg." },
  gastos_operativos: { titulo: "Gastos operativos", texto: "Los gastos sin las compras de hacienda: esas ya se descuentan en la producción de carne.",
                       ejemplo: "USD 26.000 de gastos con una compra de novillos de USD 18.000: gastos operativos USD 8.000." },
  flujo: { titulo: "Flujo de caja", texto: "Lo cobrado menos lo pagado, por la fecha en que se cobró o pagó, no la del negocio.",
           ejemplo: "Una venta de octubre cobrada en diciembre entra en diciembre." },
  ganancia_diaria: { titulo: "Ganancia diaria", texto: "Kilos que gana cada animal por día entre dos pesadas del mismo lote.",
                     ejemplo: "De 300 a 330 kg en 60 días = 0,5 kg/día." },
  entore: { titulo: "Vacas entoradas", texto: "Las que se pusieron con el toro o se inseminaron en la temporada. Los porcentajes reproductivos se calculan sobre ellas.",
            ejemplo: "468 preñadas de 520 entoradas = 90 % de preñez." },
  temporada: { titulo: "Temporada", texto: "El ciclo reproductivo, de julio a junio, según la fecha del servicio.",
               ejemplo: "Un servicio de noviembre de 2025 es de la temporada 2025/26." },
  carencia: { titulo: "Carencia", texto: "Los días después de un remedio en que los animales no se pueden vender ni faenar.",
              ejemplo: "Un antiparasitario con 30 días de carencia dado el 20/6 libera el 20/7." },
}

export const GLOSARIO_DE: Record<string, string[]> = {
  "stock:ug": ["ug"], "stock:ug_promedio": ["ug"], "stock:lanar_vacuno_ug": ["ug"], "stock:pct_extraccion": ["extraccion"],
  "reproductivos:pct_prenez": ["entore", "temporada"], "reproductivos:pct_paricion": ["entore"], "reproductivos:pct_destete": ["entore"],
  "reproductivos:entoradas": ["entore"], "reproductivos:kg_destetados_vaca": ["entore"],
  "pesadas:ganancia_diaria": ["ganancia_diaria"],
  "economia:gastos_operativos": ["gastos_operativos"], "economia:flujo_caja": ["flujo"],
  "potreros:carga": ["carga", "area_efectiva"], "potreros:carga_promedio": ["carga", "ha_spg"], "potreros:ug": ["ug"],
  "potreros:superficie_efectiva": ["area_efectiva"], "potreros:presion": ["presion"], "potreros:ha_spg": ["ha_spg"],
  "produccion:produccion_carne": ["produccion_carne"], "produccion:carne_equivalente": ["carne_equivalente"],
  "gestion:lotes_carencia": ["carencia"], "gestion:cab_carencia": ["carencia"],
  "combinada:fab:resultado_ha_spg": ["ha_spg"], "combinada:fab:produccion_carne_ha": ["produccion_carne", "ha_spg"],
  "combinada:fab:carne_equivalente_ha": ["carne_equivalente", "ha_spg"], "combinada:fab:costo_kg": ["gastos_operativos", "produccion_carne"],
  "combinada:fab:gasto_ug": ["gastos_operativos", "ug"],
}

// Una línea que explica la medida (un indicador calculado: su fórmula)
export function descripcionDe(fuente: Fuente, medida: string): string {
  if (fuente === "combinada") {
    const p = propiaDe(medida)
    return p ? formula(p.definicion) : ""
  }
  return DESCRIPCION[`${fuente}:${medida}`] ?? ""
}

export const terminosDe = (fuente: Fuente, medida: string): Termino[] =>
  (GLOSARIO_DE[`${fuente}:${medida}`] ?? []).map(t => GLOSARIO[t]).filter(Boolean)

// Sin mayúsculas ni tildes
export const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()

export interface Resultado { fuente: Fuente; medida: string; etiqueta: string; motivo: string | null }

// Busca por nombre, descripción o sinónimo. `motivo`: el sinónimo que la trajo ("coincide con "plata"").
export function buscarMedidas(texto: string): Resultado[] {
  const q = normalizar(texto)
  const todas = (Object.keys(MEDIDAS) as Fuente[]).flatMap(f =>
    Object.entries(MEDIDAS[f] ?? {}).map(([m, x]) => ({ fuente: f, medida: m, etiqueta: x.etiqueta })))
  if (!q) return todas.map(x => ({ ...x, motivo: null }))
  const porSinonimo = new Map<string, string>()
  for (const [palabra, claves] of Object.entries(SINONIMOS)) {
    if (palabra.startsWith(q) || (q.length >= 4 && q.startsWith(palabra))) {
      for (const k of claves) if (!porSinonimo.has(k)) porSinonimo.set(k, palabra)
    }
  }
  const directas: Resultado[] = []
  const sinonimos: Resultado[] = []
  for (const x of todas) {
    const clave = `${x.fuente}:${x.medida}`
    const directa = normalizar(x.etiqueta).includes(q) || normalizar(descripcionDe(x.fuente, x.medida)).includes(q)
      || normalizar(NOMBRE_FUENTE[x.fuente]).includes(q)
    // Lo que trae un sinónimo va primero, en su orden, aunque también coincida por nombre ("carga" → Carga promedio)
    if (porSinonimo.has(clave)) sinonimos.push({ ...x, motivo: directa ? null : `coincide con "${porSinonimo.get(clave)}"` })
    else if (directa) directas.push({ ...x, motivo: null })
  }
  // Primero lo que el sinónimo pide en su orden (la más usada adelante), después el resto de las coincidencias
  sinonimos.sort((a, b) => {
    const orden = (r: Resultado) => SINONIMOS[porSinonimo.get(`${r.fuente}:${r.medida}`)!].indexOf(`${r.fuente}:${r.medida}`)
    return orden(a) - orden(b)
  })
  return [...sinonimos, ...directas]
}
