import { createClient } from '@/lib/supabase/client'
import type { AporteIndicador, Indicadores } from '@/types/indicadores'

// Totales por especie y temporada (la más nueva primero; "sin servicio registrado" al final)
export async function getIndicadores(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('v_indicadores_reproductivos')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('temporada', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as Indicadores[]
}

// Lo que aporta cada actividad a una especie y temporada (el "ver detalle"); null = sin servicio registrado
export async function getAportes(establecimiento_id: string, especie_id: string, temporada: number | null) {
  let query = createClient()
    .from('v_indicadores_aportes')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .eq('especie_id', especie_id)
    .order('fecha')
  query = temporada === null ? query.is('temporada', null) : query.eq('temporada', temporada)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AporteIndicador[]
}
