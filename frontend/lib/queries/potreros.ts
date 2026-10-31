import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import type { Estadia, Potrero, PotreroInsert, PotreroUpdate } from '@/types/database'
import type { Json } from '@/types/supabase'

// ── Potreros ─────────────────────────────────────────────────────────────────

// Potreros de un establecimiento por nombre: los activos, o también los inactivos
export async function getPotreros(establecimiento_id: string, opciones: { incluirInactivos?: boolean } = {}) {
  const supabase = createClient()
  let query = supabase
    .from('potreros')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('nombre')
  if (!opciones.incluirInactivos) query = query.eq('estado', 'activo')

  const { data, error } = await query
  if (error) throw error
  return data as Potrero[]
}

// Crea un nuevo potrero (solo las columnas permitidas por GRANT)
export async function createPotrero(values: PotreroInsert) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('potreros')
    .insert(values)
    .select()
    .single()

  if (error) throw error
  return data as Potrero
}

// Actualiza un potrero. 0 filas = sin permiso (RLS).
export async function updatePotrero(id: string, values: PotreroUpdate) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('potreros')
    .update(values)
    .eq('id', id)
    .select()

  if (error) throw error
  return exigirFilas(data) as Potrero
}

// Baja lógica (no hay borrado). La base la rechaza si el potrero tiene lotes adentro.
export async function desactivarPotrero(id: string) {
  return updatePotrero(id, { estado: 'inactivo' })
}

export async function reactivarPotrero(id: string) {
  return updatePotrero(id, { estado: 'activo' })
}

// Forma de los potreros para el mapa (v_potreros_mapa): GeoJSON, área geodésica y punto para la etiqueta.
// Solo los dibujados.
export interface FormaPotrero {
  id: string
  forma: GeoJSON.MultiPolygon
  area_ha: number
  etiqueta: GeoJSON.Point
}

export async function getFormasPotreros(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('v_potreros_mapa')
    .select('id, forma, area_ha, etiqueta')
    .eq('establecimiento_id', establecimiento_id)
    .not('forma', 'is', null)
  if (error) throw error
  return (data ?? []).map(f => ({ id: f.id!, forma: f.forma, area_ha: Number(f.area_ha), etiqueta: f.etiqueta }) as unknown as FormaPotrero)
}

// Guarda la forma de un potrero (GeoJSON en grados) o la borra (null). Devuelve el área geodésica en
// hectáreas. Con actualizarSuperficie, la superficie del potrero pasa a ser esa área.
export async function guardarFormaPotrero(potrero_id: string, forma: GeoJSON.MultiPolygon | GeoJSON.Polygon | null, actualizarSuperficie = false) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('guardar_forma_potrero', {
    p_potrero_id: potrero_id,
    p_forma: forma as unknown as Json,   // null = borrar la forma
    p_actualizar_superficie: actualizarSuperficie,
  })
  if (error) throw error
  return data === null ? null : Number(data)
}

// Pares de potreros activos que se superponen (aviso, no bloqueo)
export async function getSuperpuestos(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('potreros_superpuestos', { p_establecimiento_id: establecimiento_id })
  if (error) throw error
  return (data ?? []).map(f => ({ a: f.potrero_a, b: f.potrero_b, hectareas: Number(f.hectareas) }))
}

// ── Estadías de los lotes (sin las anuladas) ─────────────────────────────────

// Dónde está cada lote hoy: las estadías abiertas del establecimiento
export async function getEstadiasAbiertas(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lote_estadias')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .is('fecha_salida', null)
    .is('anulada_en', null)
  if (error) throw error
  return data as Estadia[]
}

// Desde cuándo descansa cada potrero: la última salida de un lote (potrero_id → aaaa-mm-dd).
// Sirve para los potreros vacíos; uno que nunca tuvo animales no aparece.
export async function getUltimasSalidas(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lote_estadias')
    .select('potrero_id, fecha_salida')
    .eq('establecimiento_id', establecimiento_id)
    .not('fecha_salida', 'is', null)
    .is('anulada_en', null)
    .order('fecha_salida', { ascending: false })
  if (error) throw error
  const ultimas = new Map<string, string>()
  for (const e of data ?? []) if (!ultimas.has(e.potrero_id)) ultimas.set(e.potrero_id, e.fecha_salida!)
  return ultimas
}

// Por qué potreros pasó un lote, de la más vieja a la más nueva
export async function getEstadiasLote(lote_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lote_estadias')
    .select('*')
    .eq('lote_id', lote_id)
    .is('anulada_en', null)
    .order('fecha_ingreso')
    .order('created_at')
  if (error) throw error
  return data as Estadia[]
}

// Qué lotes pasaron por un potrero, de la más nueva a la más vieja, con el nombre del lote
export async function getEstadiasPotrero(potrero_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lote_estadias')
    .select('*')
    .eq('potrero_id', potrero_id)
    .is('anulada_en', null)
    .order('fecha_ingreso', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  const estadias = data as Estadia[]
  const ids = [...new Set(estadias.map(e => e.lote_id))]
  if (ids.length === 0) return []
  const { data: lotes, error: errLotes } = await supabase.from('lotes').select('id, nombre').in('id', ids)
  if (errLotes) throw errLotes
  const nombre = new Map((lotes ?? []).map(l => [l.id, l.nombre]))
  return estadias.map(e => ({ ...e, lote_nombre: nombre.get(e.lote_id) ?? 'Lote' }))
}

// ── Cambios de potrero (funciones de la base; administrador u operador) ──────

export interface CambioPotrero {
  lote_id: string
  potrero_id: string | null       // null: queda sin potrero
  fecha_salida: string | null     // si estaba en un potrero
  fecha_ingreso: string | null    // si va a un potrero
  motivo?: string | null
}

// Devuelve el id de la estadía nueva (o null si quedó sin potrero)
export async function cambiarPotreroLote(c: CambioPotrero) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('cambiar_potrero_lote', {
    p_lote_id: c.lote_id,
    // null = sin potrero. El tipo generado no admite null en un parámetro sin valor por defecto, pero la función sí.
    p_potrero_id: c.potrero_id as string,
    p_fecha_salida: c.fecha_salida ?? undefined,
    p_fecha_ingreso: c.fecha_ingreso ?? undefined,
    p_motivo: c.motivo ?? undefined,
  })
  if (error) throw error
  return (data as string | null) ?? null
}

// Anula el último cambio de potrero del lote y lo devuelve a donde estaba
export async function deshacerCambioPotrero(lote_id: string, motivo?: string | null) {
  const supabase = createClient()
  const { error } = await supabase.rpc('deshacer_cambio_potrero', { p_lote_id: lote_id, p_motivo: motivo ?? undefined })
  if (error) throw error
}
