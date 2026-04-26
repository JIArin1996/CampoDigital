import { createClient } from '@/lib/supabase/client'

export interface DicosePropiedad {
  id: number
  establecimiento_id: number
  dicose_propiedad: string
  razon_social: string | null
  domicilio_constituido: string | null
  estado: 'activo' | 'inactivo'
  created_at: string
}

export type DicosePropiedadInsert = Omit<DicosePropiedad, 'id' | 'created_at' | 'updated_at'>

export async function getDicosesPropiedad(establecimiento_id: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dicose_propiedad')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', 'activo')
    .order('dicose_propiedad')

  if (error) throw error
  return data as DicosePropiedad[]
}

export async function createDicosePropiedad(values: DicosePropiedadInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dicose_propiedad')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data as DicosePropiedad
}

export async function deleteDicosePropiedad(id: number) {
  const supabase = createClient()
  const { error } = await supabase
    .from('dicose_propiedad')
    .update({ estado: 'inactivo' })
    .eq('id', id)

  if (error) throw error
}
