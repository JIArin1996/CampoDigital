import { createClient } from '@/lib/supabase/client'
import type { AnimalInsert, AnimalUpdate } from '@/types/database'

// Obtiene los animales de un establecimiento, con filtros opcionales
export async function getAnimales(
  establecimiento_id: number, 
  filtros?: { categoria?: string, estado?: string, potrero_id?: number, parcela_id?: number }
) {
  const supabase = createClient()
  let query = supabase
    .from('animales')
    .select('*, potrero:potreros(nombre), parcela:parcelas(nombre)')
    .eq('establecimiento_id', establecimiento_id)

  if (filtros?.estado) {
    if (filtros.estado !== 'todos') {
      query = query.eq('estado', filtros.estado)
    }
  } else {
    query = query.eq('estado', 'activo')
  }

  if (filtros?.categoria) query = query.eq('categoria', filtros.categoria)
  if (filtros?.potrero_id) query = query.eq('potrero_actual', filtros.potrero_id)
  if (filtros?.parcela_id) query = query.eq('parcela_actual', filtros.parcela_id)
  
  const { data, error } = await query.order('caravana_snig')
  if (error) throw error
  return data
}

// Obtiene el detalle de un animal
export async function getAnimal(id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('animales')
    .select('*, potrero:potreros(nombre), parcela:parcelas(nombre), establecimiento:establecimientos(nombre)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// Crea un animal
export async function createAnimal(values: AnimalInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('animales')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data
}

// Edita un animal
export async function updateAnimal(id: number, values: AnimalUpdate) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('animales')
    .update(values)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Baja lógica
export async function darBajaAnimal(id: number, estado: string, fecha_baja: string) {
  return updateAnimal(id, {
    estado: estado as any, // 'vendido' | 'muerto' | 'transferido'
    fecha_baja,
    potrero_actual: null,
    parcela_actual: null
  })
}

// Creación masiva
export async function createAnimalesBulk(values: AnimalInsert[]) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('animales')
    .insert(values)
    .select()

  if (error) throw error
  return data
}
