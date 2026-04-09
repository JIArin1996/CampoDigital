import { createClient } from '@/lib/supabase/client'
import type { MovimientoGanado, MovimientoGanadoInsert, TipoMovimiento } from '@/types/database'

// ── Consultas ────────────────────────────────────────────────────────────────

export async function getMovimientos(
  establecimiento_id: number,
  filtros?: {
    tipo?: TipoMovimiento
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

  if (filtros?.tipo)        query = query.eq('tipo_movimiento', filtros.tipo)
  if (filtros?.fecha_desde) query = query.gte('fecha', filtros.fecha_desde)
  if (filtros?.fecha_hasta) query = query.lte('fecha', filtros.fecha_hasta)

  const { data, error } = await query
  if (error) throw error
  return data as MovimientoGanado[]
}

// ── Inserción ────────────────────────────────────────────────────────────────

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
