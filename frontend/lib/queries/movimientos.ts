import { createClient } from '@/lib/supabase/client'
import type { MovimientoGanado, MovimientoGanadoInsert, TipoMovimiento } from '@/types/database'

// ── Consultas ────────────────────────────────────────────────────────────────

export async function getMovimientos(
  establecimiento_id: number,
  filtros?: {
    tipo?: TipoMovimiento
    categoria?: string
    fecha_desde?: string
    fecha_hasta?: string
  }
) {
  const supabase = createClient()
  let query = supabase
    .from('movimientos_ganado')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (filtros?.tipo) query = query.eq('tipo_movimiento', filtros.tipo)
  if (filtros?.categoria) query = query.eq('categoria', filtros.categoria)
  if (filtros?.fecha_desde) query = query.gte('fecha', filtros.fecha_desde)
  if (filtros?.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta)

  const { data, error } = await query
  if (error) throw error
  return data as MovimientoGanado[]
}

export async function createMovimiento(values: MovimientoGanadoInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('movimientos_ganado')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data as MovimientoGanado
}

// ── Cálculo de stock ─────────────────────────────────────────────────────────

export interface StockEntry {
  categoria: string
  ubicacion_tipo: string
  ubicacion_id: number
  cantidad: number
}

export function calcularStock(movimientos: MovimientoGanado[]): StockEntry[] {
  const mapa = new Map<string, StockEntry>()

  const delta = (cat: string, tipo: string, id: number, qty: number) => {
    const key = `${cat}|${tipo}|${id}`
    const entry = mapa.get(key) ?? { categoria: cat, ubicacion_tipo: tipo, ubicacion_id: id, cantidad: 0 }
    entry.cantidad += qty
    mapa.set(key, entry)
  }

  for (const m of movimientos) {
    const q = m.cantidad
    switch (m.tipo_movimiento) {
      case 'Compra':
      case 'Nacimiento':
        if (m.destino_tipo && m.destino_id) delta(m.categoria, m.destino_tipo, m.destino_id, +q)
        break
      case 'Venta':
      case 'Muerte':
        if (m.origen_tipo && m.origen_id) delta(m.categoria, m.origen_tipo, m.origen_id, -q)
        break
      case 'Traslado':
        if (m.origen_tipo && m.origen_id) delta(m.categoria, m.origen_tipo, m.origen_id, -q)
        if (m.destino_tipo && m.destino_id) delta(m.categoria, m.destino_tipo, m.destino_id, +q)
        break
      case 'Ajuste':
        if (m.destino_tipo && m.destino_id) delta(m.categoria, m.destino_tipo, m.destino_id, +q)
        if (m.origen_tipo && m.origen_id) delta(m.categoria, m.origen_tipo, m.origen_id, -q)
        break
    }
  }

  return Array.from(mapa.values()).filter(e => e.cantidad !== 0)
}
