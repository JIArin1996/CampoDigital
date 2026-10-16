import { createClient } from '@/lib/supabase/client'
import type { EntradaBitacora, EntradaConLotes, EstadoIdea, TipoEntrada } from '@/types/bitacora'

// ── Lectura ──────────────────────────────────────────────────────────────────

export interface FiltrosBitacora {
  tipo?: TipoEntrada | null
  estadoIdea?: EstadoIdea | null
  loteId?: string | null
  texto?: string | null
  incluirAnuladas?: boolean
  limite?: number
}

// Entradas del establecimiento, de la más nueva a la más vieja, con sus lotes etiquetados
export async function getEntradas(establecimiento_id: string, filtros: FiltrosBitacora = {}): Promise<EntradaConLotes[]> {
  const supabase = createClient()

  // Filtro por lote: primero las entradas que lo etiquetan
  let ids: string[] | null = null
  if (filtros.loteId) {
    const { data, error } = await supabase.from('bitacora_lotes').select('entrada_id').eq('lote_id', filtros.loteId)
    if (error) throw error
    ids = (data ?? []).map(x => x.entrada_id)
    if (ids.length === 0) return []
  }

  let query = supabase
    .from('bitacora_entradas')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filtros.limite ?? 100)

  if (ids) query = query.in('id', ids)
  if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
  if (filtros.estadoIdea) query = query.eq('tipo', 'idea').eq('estado_idea', filtros.estadoIdea)
  if (!filtros.incluirAnuladas) query = query.is('anulada_en', null)
  const texto = filtros.texto?.trim()
  // Los comodines de ilike (% y _) se escapan: se busca el texto tal cual
  if (texto) query = query.ilike('texto', `%${texto.replace(/[\\%_]/g, c => '\\' + c)}%`)

  const { data, error } = await query
  if (error) throw error
  const entradas = (data ?? []) as EntradaBitacora[]
  return conLotes(entradas)
}

export async function getEntrada(id: string): Promise<EntradaConLotes | null> {
  const supabase = createClient()
  const { data, error } = await supabase.from('bitacora_entradas').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const [entrada] = await conLotes([data as EntradaBitacora])
  return entrada
}

// Cantidad de ideas abiertas (sin las anuladas), para el inicio
export async function contarIdeasAbiertas(establecimiento_id: string) {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('bitacora_entradas')
    .select('id', { count: 'exact', head: true })
    .eq('establecimiento_id', establecimiento_id)
    .eq('tipo', 'idea')
    .eq('estado_idea', 'abierta')
    .is('anulada_en', null)
  if (error) throw error
  return count ?? 0
}

async function conLotes(entradas: EntradaBitacora[]): Promise<EntradaConLotes[]> {
  if (entradas.length === 0) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bitacora_lotes')
    .select('entrada_id, lote_id')
    .in('entrada_id', entradas.map(e => e.id))
  if (error) throw error
  const porEntrada = new Map<string, string[]>()
  for (const fila of data ?? []) {
    porEntrada.set(fila.entrada_id, [...(porEntrada.get(fila.entrada_id) ?? []), fila.lote_id])
  }
  return entradas.map(e => ({ ...e, lotes: porEntrada.get(e.id) ?? [] }))
}

// ── Escritura (funciones de la base; administrador u operador) ───────────────

export interface DatosEntrada {
  fecha: string
  tipo: TipoEntrada
  texto: string
  lotes: string[]
  persona_id: string | null
}

export async function crearEntrada(establecimiento_id: string, datos: DatosEntrada) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('crear_entrada_bitacora', {
    p_establecimiento_id: establecimiento_id,
    p_fecha: datos.fecha,
    p_tipo: datos.tipo,
    p_texto: datos.texto,
    p_lotes: datos.lotes,
    p_persona_id: datos.persona_id ?? undefined,
  })
  if (error) throw error
  return data as string
}

// Edita el contenido y REEMPLAZA los lotes (y el responsable: null lo quita)
export async function editarEntrada(entrada_id: string, datos: DatosEntrada) {
  const supabase = createClient()
  const { error } = await supabase.rpc('editar_entrada_bitacora', {
    p_entrada_id: entrada_id,
    p_fecha: datos.fecha,
    p_tipo: datos.tipo,
    p_texto: datos.texto,
    p_lotes: datos.lotes,
    p_persona_id: datos.persona_id ?? undefined,
  })
  if (error) throw error
}

// No cuenta como edición
export async function cambiarEstadoIdea(entrada_id: string, estado: EstadoIdea) {
  const supabase = createClient()
  const { error } = await supabase.rpc('cambiar_estado_idea', { p_entrada_id: entrada_id, p_estado: estado })
  if (error) throw error
}

export async function anularEntrada(entrada_id: string, motivo: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('anular_entrada_bitacora', { p_entrada_id: entrada_id, p_motivo: motivo })
  if (error) throw error
}

export async function restaurarEntrada(entrada_id: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('restaurar_entrada_bitacora', { p_entrada_id: entrada_id })
  if (error) throw error
}

// ── Personas (responsables y nombres de quién cargó o editó) ─────────────────

export async function getPersonas(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('personas')
    .select('id, nombre, rol, user_id, activo')
    .eq('establecimiento_id', establecimiento_id)
    .order('nombre')
  if (error) throw error
  return data ?? []
}
