import { createClient } from '@/lib/supabase/client'

// Cache en memoria — se llena la primera vez que se consulta cada clave
const cache: Record<string, string[]> = {}

/**
 * Obtiene los valores de una clave de parámetros desde Supabase.
 * Usa cache en memoria para evitar consultas repetidas durante la sesión.
 *
 * @param clave - Nombre del parámetro (ej: 'categoria_ganado', 'departamento')
 * @returns Array de strings con los valores activos, ordenados
 */
export async function getParametros(clave: string): Promise<string[]> {
  if (cache[clave]) return cache[clave]

  const supabase = createClient()
  const { data, error } = await supabase
    .from('parametros')
    .select('valor')
    .eq('clave', clave)
    .neq('activo', false)
    .order('orden')

  if (error) throw error

  const valores = data.map((d) => d.valor as string)
  cache[clave] = valores
  return valores
}

/**
 * Limpia el cache completo o solo una clave específica.
 * Útil si los parámetros se modifican en runtime.
 */
export function limpiarCacheParametros(clave?: string) {
  if (clave) {
    delete cache[clave]
  } else {
    Object.keys(cache).forEach((k) => delete cache[k])
  }
}
