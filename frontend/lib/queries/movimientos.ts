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

// ── Operaciones sobre animales ────────────────────────────────────────────────

// Stock actual calculado desde la tabla animales (fuente de verdad)
export interface StockDesdeAnimales {
  total: number
  porCategoria: { categoria: string; cantidad: number }[]
  porPotrero: { nombre: string; cantidad: number }[]
}

export async function getStockActual(establecimiento_id: number): Promise<StockDesdeAnimales> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('animales')
    .select('categoria, potrero_actual, potrero:potreros(nombre)')
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', 'activo')

  if (error) throw error
  const filas = (data ?? []) as unknown as { categoria: string; potrero: { nombre: string } | null }[]

  const porCat = new Map<string, number>()
  const porPot = new Map<string, number>()

  for (const f of filas) {
    porCat.set(f.categoria, (porCat.get(f.categoria) ?? 0) + 1)
    const potrero = Array.isArray(f.potrero) ? f.potrero[0] : f.potrero
    const nombrePot = potrero?.nombre ?? 'Sin ubicar'
    porPot.set(nombrePot, (porPot.get(nombrePot) ?? 0) + 1)
  }

  return {
    total: filas.length,
    porCategoria: [...porCat.entries()].map(([categoria, cantidad]) => ({ categoria, cantidad })).sort((a, b) => a.categoria.localeCompare(b.categoria)),
    porPotrero: [...porPot.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  }
}

// Retorna las caravanas activas de un establecimiento (para validar egresos)
export async function getCaravanasActivas(establecimiento_id: number): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('animales')
    .select('caravana_snig')
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', 'activo')

  if (error) throw error
  return (data ?? []).map((a: { caravana_snig: string }) => a.caravana_snig)
}

// Da de baja (vendido/transferido) un conjunto de animales por SNIG
export async function darBajaAnimalPorSNIG(
  establecimiento_id: number,
  snigs: string[],
  estado: 'vendido' | 'transferido',
  fecha_baja: string
) {
  const supabase = createClient()
  const { error } = await supabase
    .from('animales')
    .update({
      estado,
      fecha_baja,
      potrero_actual: null,
      parcela_actual: null,
      lote_actual: null,
    })
    .eq('establecimiento_id', establecimiento_id)
    .in('caravana_snig', snigs)

  if (error) throw error
}

// Traslado: cambia el establecimiento_id de los animales al destino
export async function trasladarAnimales(
  establecimiento_origen_id: number,
  establecimiento_destino_id: number,
  snigs: string[]
) {
  const supabase = createClient()
  const { error } = await supabase
    .from('animales')
    .update({
      establecimiento_id: establecimiento_destino_id,
      potrero_actual: null,
      parcela_actual: null,
    })
    .eq('establecimiento_id', establecimiento_origen_id)
    .in('caravana_snig', snigs)

  if (error) throw error
}

// Cambio de potrero: actualiza potrero_actual
export async function cambiarPotreroAnimales(
  establecimiento_id: number,
  snigs: string[],
  potrero_id: number
) {
  const supabase = createClient()
  const { error } = await supabase
    .from('animales')
    .update({
      potrero_actual: potrero_id,
      parcela_actual: null,
    })
    .eq('establecimiento_id', establecimiento_id)
    .in('caravana_snig', snigs)

  if (error) throw error
}

// ── Cálculo de stock (legacy - mantenido para compatibilidad) ─────────────────

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
