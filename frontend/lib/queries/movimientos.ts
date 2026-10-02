import { createClient } from '@/lib/supabase/client'
import type {
  MovimientoGanado,
  MovimientoGanadoInsert,
  LoteMovimiento,
  LoteMovimientoInsert,
  TipoMovimiento,
} from '@/types/database'

// ── Lotes de movimiento ───────────────────────────────────────────────────────

// Crea el registro agrupador del evento. Debe llamarse ANTES de createMovimientosBatch.
export async function createLoteMovimiento(values: LoteMovimientoInsert): Promise<LoteMovimiento> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lotes_movimiento')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data as LoteMovimiento
}

// ── Movimientos individuales ──────────────────────────────────────────────────

// Obtiene todos los movimientos del establecimiento, con filtros opcionales.
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

// Inserta un único movimiento (carga manual).
export async function createMovimiento(values: MovimientoGanadoInsert): Promise<MovimientoGanado> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('movimientos_ganado')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data as MovimientoGanado
}

// Inserta N movimientos de una sola vez (carga masiva por Excel).
// No retorna los registros creados para evitar payloads innecesariamente grandes.
export async function createMovimientosBatch(rows: MovimientoGanadoInsert[]): Promise<void> {
  if (rows.length === 0) return

  const supabase = createClient()
  const { error } = await supabase
    .from('movimientos_ganado')
    .insert(rows)

  if (error) throw error
}
