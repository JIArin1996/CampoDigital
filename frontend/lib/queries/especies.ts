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

export async function crearEspecie(establecimiento_id: string, nombre: string, grupo: GrupoEspecie, color: string | null = null) {
  const { data, error } = await createClient()
    .from('especies')
    .insert({ establecimiento_id, nombre, grupo, color })
    .select()
  if (error) throw error
  return exigirFilas(data) as Especie
}

// El grupo no se cambia: se elige al crear la especie. color null = el del grupo.
export async function actualizarEspecie(id: string, cambios: { nombre?: string; activo?: boolean; color?: string | null }) {
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

// Dar de baja o reactivar una categoría. La base rechaza la baja si tiene animales en stock (23514).
export async function cambiarEstadoCategoria(id: string, activo: boolean) {
  const { data, error } = await createClient().from('categorias_animales').update({ activo }).eq('id', id).select()
  if (error) throw error
  return exigirFilas(data) as CategoriaAnimal
}

// Dónde hay animales de una categoría: lote y cabezas (para explicar por qué no se puede dar de baja)
export async function getStockCategoria(categoria_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase.from('v_stock_lote').select('lote_id, cabezas').eq('categoria_id', categoria_id)
  if (error) throw error
  const filas = (data ?? []).filter(f => f.lote_id && f.cabezas)
  if (filas.length === 0) return []
  const lotes = await supabase.from('lotes').select('id, nombre').in('id', filas.map(f => f.lote_id!))
  if (lotes.error) throw lotes.error
  return filas
    .map(f => ({ lote: lotes.data.find(l => l.id === f.lote_id)?.nombre ?? 'Lote', cabezas: f.cabezas! }))
    .sort((a, b) => b.cabezas - a.cabezas)
}
