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
    .select('*, potrero:potreros(nombre), parcela:parcelas(nombre), lote:lotes_manejo!lote_actual(id, nombre)')
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
    .select('*, potrero:potreros(nombre), parcela:parcelas(nombre), lote:lotes_manejo!lote_actual(id, nombre), establecimiento:establecimientos(nombre)')
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
    estado: estado as any,
    fecha_baja,
    potrero_actual: null,
    parcela_actual: null,
    lote_actual: null,
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

// Retorna el potrero más frecuente entre un conjunto de caravanas (para origen en movimientos)
export async function getPotreroOrigenBySNIG(
  establecimiento_id: number,
  snigs: string[]
): Promise<number | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('animales')
    .select('potrero_actual')
    .eq('establecimiento_id', establecimiento_id)
    .in('caravana_snig', snigs)

  if (!data?.length) return null
  const freq = new Map<number, number>()
  for (const a of data) {
    if (a.potrero_actual) freq.set(a.potrero_actual, (freq.get(a.potrero_actual) ?? 0) + 1)
  }
  return freq.size > 0 ? [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0] : null
}

// Eliminación física masiva por IDs (limpia dependencias FK primero)
export async function deleteAnimalesBulk(ids: number[]) {
  const supabase = createClient()

  // 1. Romper self-reference madre_id
  await supabase.from('animales').update({ madre_id: null }).in('madre_id', ids)

  // 2. Nullear referencias de reproduccion que apuntan a estos animales
  await supabase.from('reproduccion').update({ toro_id: null }).in('toro_id', ids)
  await supabase.from('reproduccion').update({ cria_id: null }).in('cria_id', ids)

  // 3. Borrar registros hijos
  await supabase.from('animal_lote_historial').delete().in('animal_id', ids)
  await supabase.from('pesajes').delete().in('animal_id', ids)
  await supabase.from('sanidad').delete().in('animal_id', ids)
  await supabase.from('reproduccion').delete().in('animal_id', ids)

  // 4. Borrar los animales
  const { error } = await supabase.from('animales').delete().in('id', ids)
  if (error) throw error
}
