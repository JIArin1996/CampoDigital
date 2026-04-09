import { createClient } from '@/lib/supabase/client'
import type { DicosePropiedadInsert, DicosePropiedadUpdate } from '@/types/database'

export interface DicosePropiedad {
  id: number
  codigo: string
  titular: string
  domicilio_constituido: string | null
  tipo_titular: string
}

/**
 * Obtiene los DICOSE de Propiedad activos de un establecimiento.
 * Se usa en formularios de animales y movimientos para seleccionar el titular legal.
 */
export async function getDicosePropiedad(
  establecimiento_id: number
): Promise<DicosePropiedad[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dicose_propiedad')
    .select('id, codigo, titular, domicilio_constituido, tipo_titular')
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', 'activo')
    .order('codigo')

  if (error) throw error
  return data as DicosePropiedad[]
}

/**
 * Crea un nuevo DICOSE Propiedad asociado a un establecimiento.
 */
export async function createDicosePropiedad(
  values: DicosePropiedadInsert
): Promise<DicosePropiedad> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dicose_propiedad')
    .insert(values)
    .select('id, codigo, titular, domicilio_constituido, tipo_titular')
    .single()

  if (error) throw error
  return data as DicosePropiedad
}

/**
 * Baja lógica de un DICOSE Propiedad (estado → inactivo).
 * Nunca se borra físicamente.
 */
export async function desactivarDicosePropiedad(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('dicose_propiedad')
    .update({ estado: 'inactivo' } satisfies DicosePropiedadUpdate)
    .eq('id', id)

  if (error) throw error
}
