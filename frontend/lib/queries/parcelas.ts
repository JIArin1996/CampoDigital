import { createClient } from '@/lib/supabase/client'
import type { ParcelaInsert, ParcelaUpdate } from '@/types/database'

// Obtiene todas las parcelas activas de un establecimiento (para selectors)
export async function getParcelasEstablecimiento(establecimiento_id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('parcelas')
    .select('id, nombre, potrero_id, superficie')
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', 'activo')
    .order('nombre')

  if (error) throw error
  return data as { id: number; nombre: string; potrero_id: number; superficie: number }[]
}

// Obtiene todas las parcelas activas de un potrero
export async function getParcelas(potrero_id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('parcelas')
    .select('*')
    .eq('potrero_id', potrero_id)
    .eq('estado', 'activo')
    .order('nombre')

  if (error) throw error
  return data
}

// Crea una nueva parcela
export async function createParcela(values: ParcelaInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('parcelas')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data
}

// Actualiza una parcela existente
export async function updateParcela(id: number, values: ParcelaUpdate) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('parcelas')
    .update(values)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Baja lógica de una parcela
export async function desactivarParcela(id: number) {
  return updateParcela(id, { estado: 'inactivo' })
}
