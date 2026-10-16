import { createClient } from '@/lib/supabase/client'
import type {
  CategoriaAnimal, ComposicionItem, Especie, EstadoLote, Lote, LoteEvento, StockEstablecimiento, StockLote,
} from '@/types/lotes'

// ── Catálogos ────────────────────────────────────────────────────────────────

export async function getEspecies(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('especies')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .eq('activo', true)
    .order('nombre')

  if (error) throw error
  return data as Especie[]
}

// Todas las categorías del establecimiento (activas), ordenadas por especie y orden
export async function getCategorias(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('categorias_animales')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .eq('activo', true)
    .order('orden')

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
  campana?: string | null
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
    p_campana: params.campana ?? undefined,
    p_notas: params.notas ?? undefined,
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
