import type { Estadia } from "@/types/database"

// Un cambio de potrero de un lote, armado a partir de sus estadías. Lo usan el historial del lote y
// la línea de tiempo de Actividades.
export interface MovimientoPotrero {
  id: string
  loteId: string
  fecha: string                // aaaa-mm-dd
  orden: 0 | 1                 // el mismo día, la entrada (0) antes que una salida suelta (1)
  desde: string | null         // null: el lote entró a un potrero sin venir de otro
  hacia: string                // potrero, "sin potrero" o "cierre del lote"
  notas: string[]              // motivo del cambio o de la salida
}

// Junta la salida de un potrero con la entrada al siguiente cuando son el mismo día: "A → B".
// Las estadías pueden ser de varios lotes; se enlazan las de cada lote por separado.
export function movimientosDePotrero(estadias: Estadia[], nombre: (potreroId: string) => string): MovimientoPotrero[] {
  const porLote = new Map<string, Estadia[]>()
  for (const e of estadias) porLote.set(e.lote_id, [...(porLote.get(e.lote_id) ?? []), e])

  const movimientos: MovimientoPotrero[] = []
  for (const delLote of porLote.values()) {
    // De la más vieja a la más nueva
    delLote.sort((a, b) => a.fecha_ingreso.localeCompare(b.fecha_ingreso) || a.created_at.localeCompare(b.created_at))
    const salidaUsada = new Set<string>()
    delLote.forEach((e, i) => {
      const previa = i > 0 ? delLote[i - 1] : null
      const enlazada = previa && previa.cerrada_por === "cambio" && previa.fecha_salida === e.fecha_ingreso ? previa : null
      if (enlazada) salidaUsada.add(enlazada.id)
      movimientos.push({
        id: `${e.id}:i`, loteId: e.lote_id, fecha: e.fecha_ingreso, orden: 0,
        desde: enlazada ? nombre(enlazada.potrero_id) : null,
        hacia: nombre(e.potrero_id),
        notas: [...new Set([enlazada?.motivo_salida, e.motivo].filter((n): n is string => !!n))],
      })
    })
    for (const e of delLote) {
      if (!e.fecha_salida || salidaUsada.has(e.id)) continue
      movimientos.push({
        id: `${e.id}:s`, loteId: e.lote_id, fecha: e.fecha_salida, orden: 1,
        desde: nombre(e.potrero_id),
        hacia: e.cerrada_por === "cierre" ? "cierre del lote" : "sin potrero",
        notas: e.motivo_salida ? [e.motivo_salida] : [],
      })
    }
  }
  return movimientos
}
