import { createClient } from '@/lib/supabase/client'
import type { PotreroInsert, PotreroUpdate } from '@/types/database'

// Obtiene todos los potreros activos de un establecimiento
export async function getPotreros(establecimiento_id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('potreros')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', 'activo')
    .order('nombre')

  if (error) throw error
  return data
}

// Crea un nuevo potrero
export async function createPotrero(values: PotreroInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('potreros')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data
}

// Actualiza un potrero existente
export async function updatePotrero(id: number, values: PotreroUpdate) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('potreros')
    .update(values)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Desactiva lógicamente un potrero
export async function desactivarPotrero(id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('potreros')
    .update({ estado: 'inactivo' })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Borra físicamente un potrero
export async function borrarPotreroFisico(id: number) {
  const supabase = createClient()

  const { error } = await supabase
    .from('potreros')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}
