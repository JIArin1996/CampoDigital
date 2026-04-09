import { createClient } from '@/lib/supabase/client'

// ── Tipos locales ────────────────────────────────────────────────────────────

export interface LoteManejo {
  id: number
  user_id: string | null
  establecimiento_id: number
  nombre: string
  descripcion: string | null
  estado: 'activo' | 'inactivo'
  created_at: string
  updated_at: string
}

export type LoteManejoInsert = Omit<LoteManejo, 'id' | 'created_at' | 'updated_at'>

export interface AnimalLoteHistorial {
  id: number
  animal_id: number
  lote_id: number
  fecha_entrada: string
  fecha_salida: string | null
  created_at: string
}

// ── Lotes ────────────────────────────────────────────────────────────────────

// Lista los lotes activos de un establecimiento
export async function getLotesManejo(establecimiento_id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lotes_manejo')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', 'activo')
    .order('nombre')

  if (error) throw error
  return data as LoteManejo[]
}

// Crea un nuevo lote de manejo
export async function createLoteManejo(values: LoteManejoInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lotes_manejo')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data as LoteManejo
}

// Elimina un lote solo si no tiene animales activos asignados
export async function deleteLoteManejo(id: number) {
  const supabase = createClient()

  // Verificar que no tenga asignaciones activas (sin fecha_salida)
  const { count, error: errCount } = await supabase
    .from('animal_lote_historial')
    .select('*', { count: 'exact', head: true })
    .eq('lote_id', id)
    .is('fecha_salida', null)

  if (errCount) throw errCount
  if (count && count > 0) {
    throw new Error('No se puede eliminar: el lote tiene animales activos asignados.')
  }

  const { error } = await supabase.from('lotes_manejo').delete().eq('id', id)
  if (error) throw error
  return true
}

// ── Asignaciones animal ↔ lote ───────────────────────────────────────────────

// Asigna un animal a un lote; cierra la asignación anterior si existe
export async function asignarAnimalALote(
  animal_id: number,
  lote_id: number,
  fecha_entrada: string
) {
  const supabase = createClient()

  // Cerrar asignación activa anterior
  await supabase
    .from('animal_lote_historial')
    .update({ fecha_salida: fecha_entrada })
    .eq('animal_id', animal_id)
    .is('fecha_salida', null)

  // Crear nueva asignación
  const { data, error } = await supabase
    .from('animal_lote_historial')
    .insert({ animal_id, lote_id, fecha_entrada })
    .select()
    .single()

  if (error) throw error

  // Actualizar lote_actual en la tabla animales
  await supabase
    .from('animales')
    .update({ lote_actual: lote_id })
    .eq('id', animal_id)

  return data as AnimalLoteHistorial
}

// Quita un animal de su lote actual (cierra la asignación)
export async function quitarAnimalDeLote(animal_id: number, fecha_salida: string) {
  const supabase = createClient()

  const { error } = await supabase
    .from('animal_lote_historial')
    .update({ fecha_salida })
    .eq('animal_id', animal_id)
    .is('fecha_salida', null)

  if (error) throw error

  // Limpiar lote_actual en animales
  await supabase
    .from('animales')
    .update({ lote_actual: null })
    .eq('id', animal_id)

  return true
}

// Historial de lotes de un animal
export async function getHistorialLoteAnimal(animal_id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('animal_lote_historial')
    .select('*, lote:lotes_manejo(nombre)')
    .eq('animal_id', animal_id)
    .order('fecha_entrada', { ascending: false })

  if (error) throw error
  return data
}
