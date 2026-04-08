import { createClient } from '@/lib/supabase/client'
import type { EstablecimientoInsert, EstablecimientoUpdate } from '@/types/database'

// Obtiene todos los establecimientos activos, ordenados por nombre
export async function getEstablecimientos() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .select('*')
    .eq('estado', 'activo')
    .order('nombre')

  if (error) throw error
  return data
}

// Obtiene un establecimiento por ID
export async function getEstablecimiento(id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// Crea un nuevo establecimiento
export async function createEstablecimiento(values: EstablecimientoInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data
}

// Actualiza un establecimiento existente
export async function updateEstablecimiento(id: number, values: EstablecimientoUpdate) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .update(values)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Desactiva lógicamente un establecimiento
export async function desactivarEstablecimiento(id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .update({ estado: 'inactivo' })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Borra físicamente un establecimiento si no tiene dependencias
export async function borrarEstablecimientoFisico(id: number) {
  const supabase = createClient()
  
  const { count: potrerosCount, error: errorPotreros } = await supabase
    .from('potreros')
    .select('*', { count: 'exact', head: true })
    .eq('establecimiento_id', id)
  if (errorPotreros) throw errorPotreros

  const { count: animalesCount, error: errorAnimales } = await supabase
    .from('animales')
    .select('*', { count: 'exact', head: true })
    .eq('establecimiento_id', id)
  if (errorAnimales) throw errorAnimales

  if ((potrerosCount && potrerosCount > 0) || (animalesCount && animalesCount > 0)) {
    throw new Error('No se puede eliminar definitivamente porque tiene potreros o animales asociados.')
  }

  const { error } = await supabase
    .from('establecimientos')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}
