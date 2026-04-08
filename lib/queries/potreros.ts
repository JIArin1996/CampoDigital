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

// Borra físicamente un potrero si no tiene dependencias
export async function borrarPotreroFisico(id: number) {
  const supabase = createClient()
  
  const { count: parcelasCount, error: errPar } = await supabase
    .from('parcelas')
    .select('*', { count: 'exact', head: true })
    .eq('potrero_id', id)
  if (errPar) throw errPar

  const { count: animalesCount, error: errAni } = await supabase
    .from('animales')
    .select('*', { count: 'exact', head: true })
    .eq('potrero_actual', id)
  if (errAni) throw errAni

  if ((parcelasCount && parcelasCount > 0) || (animalesCount && animalesCount > 0)) {
    throw new Error('No se puede eliminar el potrero porque tiene parcelas o animales asociados.')
  }

  const { error } = await supabase
    .from('potreros')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}
