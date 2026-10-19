import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import type { CategoriaAnimal, Especie, GrupoEspecie } from '@/types/lotes'

// Catálogo de especies del establecimiento (también las inactivas) con sus categorías.
// Lo edita solo el administrador (políticas de especies y categorias_animales).

export async function getCatalogoEspecies(establecimiento_id: string) {
  const supabase = createClient()
  const [especies, categorias] = await Promise.all([
    supabase.from('especies').select('*').eq('establecimiento_id', establecimiento_id).order('nombre'),
    supabase.from('categorias_animales').select('*').eq('establecimiento_id', establecimiento_id).order('orden'),
  ])
  if (especies.error) throw especies.error
  if (categorias.error) throw categorias.error
  return {
    especies: (especies.data ?? []) as Especie[],
    categorias: (categorias.data ?? []) as CategoriaAnimal[],
  }
}

export async function crearEspecie(establecimiento_id: string, nombre: string, grupo: GrupoEspecie) {
  const { data, error } = await createClient()
    .from('especies')
    .insert({ establecimiento_id, nombre, grupo })
    .select()
  if (error) throw error
  return exigirFilas(data) as Especie
}

export async function actualizarEspecie(id: string, cambios: { nombre?: string; grupo?: GrupoEspecie; activo?: boolean }) {
  const { data, error } = await createClient().from('especies').update(cambios).eq('id', id).select()
  if (error) throw error
  return exigirFilas(data) as Especie
}

export async function crearCategoria(establecimiento_id: string, especie_id: string, nombre: string, orden: number) {
  const { data, error } = await createClient()
    .from('categorias_animales')
    .insert({ establecimiento_id, especie_id, nombre, orden })
    .select()
  if (error) throw error
  return exigirFilas(data) as CategoriaAnimal
}
