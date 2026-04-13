import { createClient } from '@/lib/supabase/client'
import type { Animal, AnimalInsert, AnimalUpdate, EstadoAnimal } from '@/types/database'

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
  return data as Animal[]
}

// Busca animales por caravana SNIG dentro de un establecimiento.
// Retorna solo los que existen — comparar longitud con el array de entrada para detectar faltantes.
export async function getAnimalesPorCaravanas(
  establecimiento_id: number,
  caravanas: string[]
): Promise<Animal[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('animales')
    .select('id, caravana_snig, estado, potrero_actual, dicose_propiedad_id, establecimiento_id')
    .eq('establecimiento_id', establecimiento_id)
    .in('caravana_snig', caravanas)

  if (error) throw error
  return data as Animal[]
}

// Actualiza el estado de múltiples animales a la vez (ventas, muerte).
export async function updateAnimalesEstadoBatch(
  ids: number[],
  estado: EstadoAnimal,
  fecha_baja: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('animales')
    .update({ estado, fecha_baja, potrero_actual: null, parcela_actual: null, lote_actual: null })
    .in('id', ids)

  if (error) throw error
}

// Actualiza el potrero de múltiples animales (cambio de potrero).
export async function updateAnimalesPotrerosBatch(
  ids: number[],
  potrero_id: number
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('animales')
    .update({ potrero_actual: potrero_id })
    .in('id', ids)

  if (error) throw error
}

// Actualiza el DICOSE Propiedad de múltiples animales (afectaciones).
export async function updateAnimalesDicosePropiedadBatch(
  ids: number[],
  dicose_propiedad_id: number
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('animales')
    .update({ dicose_propiedad_id })
    .in('id', ids)

  if (error) throw error
}

// Traslada múltiples animales a otro establecimiento (actualiza establecimiento + DICOSE Propiedad).
export async function updateAnimalesTrasladoBatch(
  ids: number[],
  establecimiento_id: number,
  dicose_propiedad_id: number
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('animales')
    .update({ establecimiento_id, dicose_propiedad_id, potrero_actual: null })
    .in('id', ids)

  if (error) throw error
}
