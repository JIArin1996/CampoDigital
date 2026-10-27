import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import type { EntradaBitacora, EntradaConLotes, EstadoIdea, EstadoTarea, TipoEntrada } from '@/types/bitacora'

// ── Lectura ──────────────────────────────────────────────────────────────────

export interface FiltrosBitacora {
  tipo?: TipoEntrada | null
  estadoIdea?: EstadoIdea | null
  estadoTarea?: EstadoTarea | null
  loteId?: string | null
  texto?: string | null
  incluirAnuladas?: boolean
  sinTareas?: boolean        // el calendario muestra las tareas por su vencimiento, aparte
  desde?: string | null      // fecha de la nota, inclusive (YYYY-MM-DD)
  hasta?: string | null
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
  if (filtros.sinTareas) query = query.neq('tipo', 'tarea')
  if (filtros.desde) query = query.gte('fecha', filtros.desde)
  if (filtros.hasta) query = query.lte('fecha', filtros.hasta)
  if (filtros.estadoIdea) query = query.eq('tipo', 'idea').eq('estado_idea', filtros.estadoIdea)
  if (filtros.estadoTarea) query = query.eq('tipo', 'tarea').eq('estado_tarea', filtros.estadoTarea)
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

// Suma los lotes etiquetados y el vínculo entre una tarea y la nota de la que salió (en los dos sentidos)
async function conLotes(entradas: EntradaBitacora[]): Promise<EntradaConLotes[]> {
  if (entradas.length === 0) return []
  const supabase = createClient()
  const ids = entradas.map(e => e.id)
  const idsOrigen = [...new Set(entradas.map(e => e.entrada_origen_id).filter((x): x is string => !!x))]
  const [lotes, derivadas, origenes] = await Promise.all([
    supabase.from('bitacora_lotes').select('entrada_id, lote_id').in('entrada_id', ids),
    supabase.from('bitacora_entradas')
      .select('id, entrada_origen_id, texto, vencimiento, estado_tarea')
      .in('entrada_origen_id', ids)
      .is('anulada_en', null)
      .order('vencimiento', { ascending: false }),
    idsOrigen.length > 0
      ? supabase.from('bitacora_entradas').select('id, tipo, texto').in('id', idsOrigen)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [lotes, derivadas, origenes]) if (r.error) throw r.error

  const porEntrada = new Map<string, string[]>()
  for (const fila of lotes.data ?? []) {
    porEntrada.set(fila.entrada_id, [...(porEntrada.get(fila.entrada_id) ?? []), fila.lote_id])
  }
  // De una tarea repetida, la ocurrencia más nueva representa a la serie
  const tareaPorOrigen = new Map<string, TareaDerivada>()
  for (const t of derivadas.data ?? []) {
    if (t.entrada_origen_id && !tareaPorOrigen.has(t.entrada_origen_id)) {
      tareaPorOrigen.set(t.entrada_origen_id, { id: t.id, texto: t.texto, vencimiento: t.vencimiento!, estado: t.estado_tarea as EstadoTarea })
    }
  }
  const origenPorId = new Map((origenes.data ?? []).map(o => [o.id, { id: o.id, tipo: o.tipo as TipoEntrada, texto: o.texto }]))
  return entradas.map(e => ({
    ...e,
    lotes: porEntrada.get(e.id) ?? [],
    tarea: tareaPorOrigen.get(e.id) ?? null,
    origen: e.entrada_origen_id ? origenPorId.get(e.entrada_origen_id) ?? null : null,
  }))
}

type TareaDerivada = NonNullable<EntradaConLotes['tarea']>

// ── Escritura (funciones de la base; administrador u operador) ───────────────

export interface DatosEntrada {
  fecha: string
  tipo: TipoEntrada
  texto: string
  lotes: string[]
  persona_id: string | null
  vencimiento?: string | null          // tareas: obligatorio
  repetir_cada_dias?: number | null    // tareas: opcional
}

// entrada_origen_id: la nota de la que sale una tarea
export async function crearEntrada(establecimiento_id: string, datos: DatosEntrada, entrada_origen_id?: string | null) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('crear_entrada_bitacora', {
    p_establecimiento_id: establecimiento_id,
    p_fecha: datos.fecha,
    p_tipo: datos.tipo,
    p_texto: datos.texto,
    p_lotes: datos.lotes,
    p_persona_id: datos.persona_id ?? undefined,
    p_vencimiento: datos.vencimiento ?? undefined,
    p_repetir_cada_dias: datos.repetir_cada_dias ?? undefined,
    p_entrada_origen_id: entrada_origen_id ?? undefined,
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
    p_vencimiento: datos.vencimiento ?? undefined,
    p_repetir_cada_dias: datos.repetir_cada_dias ?? undefined,
  })
  if (error) throw error
}

// No cuenta como edición
export async function cambiarEstadoIdea(entrada_id: string, estado: EstadoIdea) {
  const supabase = createClient()
  const { error } = await supabase.rpc('cambiar_estado_idea', { p_entrada_id: entrada_id, p_estado: estado })
  if (error) throw error
}

// Pendiente, hecha o cancelada; no cuenta como edición. Si se marca hecha una tarea repetida,
// la base crea la siguiente y devuelve su id (si no, null).
export async function cambiarEstadoTarea(entrada_id: string, estado: EstadoTarea) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('cambiar_estado_tarea', { p_entrada_id: entrada_id, p_estado: estado })
  if (error) throw error
  return (data as string | null) ?? null
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

export type Persona = Awaited<ReturnType<typeof getPersonas>>[number]

// Alta y edición de personas: solo el administrador (lo impone el RLS)
export async function crearPersona(establecimiento_id: string, nombre: string, rol: string | null) {
  const { data, error } = await createClient().from('personas').insert({ establecimiento_id, nombre, rol }).select('id, nombre, rol, user_id, activo')
  if (error) throw error
  return exigirFilas(data)
}

export async function actualizarPersona(id: string, cambios: { nombre?: string; rol?: string | null; activo?: boolean }) {
  const { data, error } = await createClient().from('personas').update(cambios).eq('id', id).select('id')
  if (error) throw error
  return exigirFilas(data)
}
