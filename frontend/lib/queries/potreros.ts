import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import type { Potrero, PotreroInsert, PotreroUpdate } from '@/types/database'

// Obtiene los potreros activos de un establecimiento
export async function getPotreros(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('potreros')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', 'activo')
    .order('nombre')

  if (error) throw error
  return data as Potrero[]
}

// Crea un nuevo potrero (solo las columnas permitidas por GRANT)
export async function createPotrero(values: PotreroInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('potreros')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data as Potrero
}

// Actualiza un potrero. 0 filas = sin permiso (RLS).
export async function updatePotrero(id: string, values: PotreroUpdate) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('potreros')
    .update(values)
    .eq('id', id)
    .select()

  if (error) throw error
  return exigirFilas(data) as Potrero
}

// Baja lógica (no hay borrado)
export async function desactivarPotrero(id: string) {
  return updatePotrero(id, { estado: 'inactivo' })
}
