import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import { ordenarEspecies } from '@/components/lotes/agrupacion'
import type {
  CategoriaAnimal, ComposicionItem, Especie, EstadoLote, Lote, LoteEvento, StockEstablecimiento, StockLote,
  CambioEstadoLote, FilaLinaje,
} from '@/types/lotes'

// ── Catálogos ────────────────────────────────────────────────────────────────

export async function getEspecies(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('especies')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .eq('activo', true)

  if (error) throw error
  // Orden único del sistema: grupo y fecha de creación (ver ordenarEspecies)
  return ordenarEspecies(data as Especie[])
}

// Categorías del establecimiento, ordenadas por orden. Por defecto solo las activas (para cargar
// animales); el historial pide también las dadas de baja, para seguir mostrando su nombre.
export async function getCategorias(establecimiento_id: string, opciones: { incluirInactivas?: boolean } = {}) {
  const supabase = createClient()
  let query = supabase
    .from('categorias_animales')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('orden')
  if (!opciones.incluirInactivas) query = query.eq('activo', true)
  const { data, error } = await query

  if (error) throw error
  return data as CategoriaAnimal[]
}

// ── Lotes ────────────────────────────────────────────────────────────────────

export async function getLotes(establecimiento_id: string, estado: EstadoLote = 'activo') {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lotes')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', estado)
    .order('nombre')

  if (error) throw error
  return data as Lote[]
}

// null si no existe o el usuario no es miembro (RLS)
export async function getLote(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lotes')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data as Lote | null
}

// Varios lotes por id (los que el RLS deja ver), ordenados por nombre
export async function getLotesPorIds(ids: string[]) {
  if (ids.length === 0) return []
  const { data, error } = await createClient().from('lotes').select('*').in('id', ids).order('nombre')
  if (error) throw error
  return data as Lote[]
}

// Historial del lote, del más nuevo al más viejo
export async function getEventosLote(lote_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lote_eventos')
    .select('*')
    .eq('lote_id', lote_id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as LoteEvento[]
}

// ── Stock (vistas, siempre calculado desde los eventos) ──────────────────────

export async function getStockLotes(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('v_stock_lote')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)

  if (error) throw error
  return data as StockLote[]
}

export async function getStockLote(lote_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('v_stock_lote')
    .select('*')
    .eq('lote_id', lote_id)

  if (error) throw error
  return data as StockLote[]
}

export async function getStockEstablecimiento(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('v_stock_establecimiento')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)

  if (error) throw error
  return data as StockEstablecimiento[]
}

// ── Escrituras (solo por funciones de la base) ───────────────────────────────

// Crea el lote con su composición inicial (un evento alta_inicial por categoría). Devuelve el id.
export async function crearLote(params: {
  establecimiento_id: string
  especie_id: string
  nombre: string
  fecha_apertura: string
  composicion: ComposicionItem[]
  potrero_id?: string | null
  anios_nacimiento?: number[]
  notas?: string | null
}): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('crear_lote', {
    p_establecimiento_id: params.establecimiento_id,
    p_especie_id: params.especie_id,
    p_nombre: params.nombre,
    p_fecha_apertura: params.fecha_apertura,
    p_composicion: params.composicion,
    p_potrero_id: params.potrero_id ?? undefined,
    p_notas: params.notas ?? undefined,
    p_anios_nacimiento: params.anios_nacimiento ?? [],
  })

  if (error) throw error
  return data as string
}

// Corrección de stock de una categoría, con signo y motivo obligatorio. Devuelve el id del evento.
export async function registrarAjuste(params: {
  lote_id: string
  categoria_id: string
  cabezas: number
  fecha: string
  nota: string
}): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('registrar_ajuste', {
    p_lote_id: params.lote_id,
    p_categoria_id: params.categoria_id,
    p_cabezas: params.cabezas,
    p_fecha: params.fecha,
    p_nota: params.nota,
  })

  if (error) throw error
  return data as string
}

// Edición del lote (nombre, notas y años de nacimiento): update directo con permiso de columna;
// la política exige poder cargar en el establecimiento. Los años los valida la base.
// Edición directa (permiso de columna). La base solo deja editar lotes abiertos: sobre uno cerrado
// el UPDATE afecta 0 filas sin error. En ese caso se relee el estado para decir por qué.
export async function editarLote(id: string, cambios: { nombre: string; notas: string | null; anios_nacimiento: number[] }) {
  const supabase = createClient()
  const { data, error } = await supabase.from('lotes').update(cambios).eq('id', id).select()
  if (error) throw error
  if (!data || data.length === 0) {
    const { data: actual } = await supabase.from('lotes').select('estado').eq('id', id).maybeSingle()
    if (actual?.estado === 'cerrado') throw new Error('El lote está cerrado: reabrilo para editarlo')
  }
  return exigirFilas(data) as Lote
}

// Cerrar: solo con stock en cero; la fecha va entre el último movimiento del lote y hoy
export async function cerrarLote(lote_id: string, fecha: string, motivo?: string | null) {
  const { error } = await createClient().rpc('cerrar_lote', { p_lote_id: lote_id, p_fecha: fecha, p_motivo: motivo ?? undefined })
  if (error) throw error
}

// Reabrir: la fecha va entre el cierre y hoy
export async function reabrirLote(lote_id: string, fecha: string, motivo?: string | null) {
  const { error } = await createClient().rpc('reabrir_lote', { p_lote_id: lote_id, p_fecha: fecha, p_motivo: motivo ?? undefined })
  if (error) throw error
}

// ── Operaciones de lote (funciones atómicas de la base) ──────────────────────

// Destino de una división: lote nuevo con su composición y sus años de nacimiento
// (la pantalla los precarga con los del origen; si no vinieran, la base hereda los del origen)
export type DestinoDivision = {
  nombre: string
  potrero_id?: string | null
  anios_nacimiento?: number[]
  composicion: ComposicionItem[]
}

// Separa animales del lote en lotes nuevos. Si el origen queda vacío, se cierra solo. Devuelve el id de la operación.
export async function dividirLote(params: { lote_id: string; fecha: string; destinos: DestinoDivision[]; notas?: string | null }) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('dividir_lote', {
    p_lote_id: params.lote_id,
    p_fecha: params.fecha,
    p_destinos: params.destinos,
    p_notas: params.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

// Junta TODO el stock de los lotes de origen en un destino existente o en uno nuevo. Cierra los orígenes.
export async function unirLotes(params: {
  lotes_origen: string[]
  fecha: string
  destino_id?: string | null
  nuevo?: { nombre: string; potrero_id?: string | null } | null   // los años son la unión de los de los lotes unidos
  notas?: string | null
}) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('unir_lotes', {
    p_lotes_origen: params.lotes_origen,
    p_fecha: params.fecha,
    p_destino_id: params.destino_id ?? undefined,
    p_nuevo: params.nuevo ?? undefined,
    p_notas: params.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

export type CambioCategoria = { desde_categoria_id: string; hacia_categoria_id: string; cabezas: number }

// Pasa cabezas de una categoría a otra dentro del mismo lote
export async function recategorizarLote(params: { lote_id: string; fecha: string; cambios: CambioCategoria[]; notas?: string | null }) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('recategorizar_lote', {
    p_lote_id: params.lote_id,
    p_fecha: params.fecha,
    p_cambios: params.cambios,
    p_notas: params.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

// Id del lote destino de una operación (para ir a su ficha después de unir o dividir)
export async function getDestinosOperacion(operacion_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('operacion_lote_vinculos')
    .select('lote_id')
    .eq('operacion_id', operacion_id)
    .eq('rol', 'destino')
  if (error) throw error
  return (data ?? []).map(v => v.lote_id)
}

// Cierres y reaperturas del lote, del más nuevo al más viejo
export async function getCambiosEstadoLote(lote_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lote_cambios_estado')
    .select('*')
    .eq('lote_id', lote_id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CambioEstadoLote[]
}

// Todo lo que necesitan las pantallas de operación de un lote
export async function getContextoLote(lote_id: string) {
  const lote = await getLote(lote_id)
  if (!lote) return null
  const [categorias, stock, potreros] = await Promise.all([
    getCategorias(lote.establecimiento_id),
    getStockLote(lote.id),
    createClient().from('potreros').select('id, nombre').eq('establecimiento_id', lote.establecimiento_id).eq('estado', 'activo').order('nombre'),
  ])
  if (potreros.error) throw potreros.error
  return {
    lote,
    categorias: categorias.filter(c => c.especie_id === lote.especie_id),
    stock: new Map(stock.map(s => [s.categoria_id, s.cabezas])),
    potreros: potreros.data ?? [],
  }
}

// ── Linaje ───────────────────────────────────────────────────────────────────

// De qué lotes viene (ancestros) y en qué lotes terminó (descendientes). Respeta el RLS.
export async function getLinaje(lote_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('linaje_lote', { p_lote_id: lote_id })
  if (error) throw error
  return (data ?? []) as FilaLinaje[]
}

// ── Stock a una fecha ────────────────────────────────────────────────────────

// Stock por especie y categoría a una fecha (incluye lotes hoy cerrados). Respeta el RLS.
export async function getStockAl(establecimiento_id: string, fecha: string) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('stock_al', { p_establecimiento_id: establecimiento_id, p_fecha: fecha })
  if (error) throw error
  return (data ?? []) as { especie_id: string; categoria_id: string; cabezas: number }[]
}
