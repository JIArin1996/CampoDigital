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
