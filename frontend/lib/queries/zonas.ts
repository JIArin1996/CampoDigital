import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import type { Json, Tables } from '@/types/supabase'

// Área efectiva de los potreros (contexto/DISENO-AREA-EFECTIVA.md): tipos de zona y zonas no aprovechables

export type TipoZona = Tables<'zona_tipos'>

// Una zona, como la trae v_potreros_mapa: recortada al potrero (para dibujarla) y como se dibujó (para editarla)
export interface ZonaPotrero {
  id: string
  tipo_id: string
  tipo: string
  color: string
  nota: string | null
  forma: GeoJSON.MultiPolygon
  forma_dibujada: GeoJSON.MultiPolygon
  ha: number
}

// Tipos de zona del establecimiento, en orden (los dados de baja, solo si se piden)
export async function getTiposZona(establecimiento_id: string, opciones: { incluirInactivos?: boolean } = {}) {
  let query = createClient().from('zona_tipos').select('*').eq('establecimiento_id', establecimiento_id).order('orden').order('nombre')
  if (!opciones.incluirInactivos) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as TipoZona[]
}

// Alta y cambios de un tipo (solo el administrador, por las políticas)
export async function crearTipoZona(establecimiento_id: string, nombre: string, color: string, orden: number) {
  const { data, error } = await createClient().from('zona_tipos').insert({ establecimiento_id, nombre, color, orden }).select()
  if (error) throw error
  return exigirFilas(data) as TipoZona
}

export async function actualizarTipoZona(id: string, cambios: { nombre?: string; color?: string; orden?: number; activo?: boolean }) {
  const { data, error } = await createClient().from('zona_tipos').update(cambios).eq('id', id).select()
  if (error) throw error
  return exigirFilas(data) as TipoZona
}

// Alta o cambio de una zona (administrador u operador). id: el de la zona (uno nuevo para darla de alta). Devuelve
// las ha de la zona dentro del potrero.
export async function guardarZona(z: { id: string; potrero_id: string; tipo_id: string; forma: GeoJSON.MultiPolygon; nota: string | null }) {
  const { data, error } = await createClient().rpc('guardar_zona_potrero', {
    p_id: z.id,
    p_potrero_id: z.potrero_id,
    p_tipo_id: z.tipo_id,
    p_forma: z.forma as unknown as Json,
    p_nota: z.nota ?? undefined,
  })
  if (error) throw error
  return Number(data)
}

export async function borrarZona(id: string) {
  const { error } = await createClient().rpc('borrar_zona_potrero', { p_id: id })
  if (error) throw error
}
