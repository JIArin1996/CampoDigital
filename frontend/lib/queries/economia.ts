import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import type { PrecioCarga } from '@/types/actividades'
import type { Movimiento, Pendiente, ResultadoRubroMes, Rubro, Sentido, SinPrecio } from '@/types/economia'

// Lo leen solo quienes pueden cargar (administrador y operador); a Consulta la base le devuelve vacío.

// ── Lectura ──────────────────────────────────────────────────────────────────

// Movimientos de un período (fecha del movimiento), del más nuevo al más viejo
export async function getMovimientos(establecimiento_id: string, desde: string, hasta: string) {
  const { data, error } = await createClient()
    .from('movimientos_economicos')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Movimiento[]
}

// Resultado por rubro y mes del período (devengado, sin anulados)
export async function getResultado(establecimiento_id: string, desde: string, hasta: string) {
  const { data, error } = await createClient()
    .from('v_resultado_rubro')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .gte('mes', desde)
    .lte('mes', hasta)
  if (error) throw error
  return (data ?? []) as ResultadoRubroMes[]
}

// Por cobrar y por pagar, del más viejo al más nuevo
export async function getPendientes(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('v_movimientos_pendientes')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('fecha')
  if (error) throw error
  return (data ?? []) as Pendiente[]
}

// Compras y ventas vigentes sin precio (el resultado no las cuenta)
export async function getSinPrecio(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('v_compraventas_sin_precio')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('fecha', { ascending: false })
  if (error) throw error
  return (data ?? []) as SinPrecio[]
}

// ── Escrituras (funciones de la base; idempotentes con p_id) ─────────────────

export async function registrarMovimiento(p: {
  id: string
  establecimiento_id: string
  fecha: string
  sentido: Sentido
  rubro_id: string
  concepto: string
  precio: PrecioCarga
  contraparte?: string | null
  lote_id?: string | null
}) {
  const { data, error } = await createClient().rpc('registrar_movimiento', {
    p_id: p.id,
    p_establecimiento_id: p.establecimiento_id,
    p_fecha: p.fecha,
    p_sentido: p.sentido,
    p_rubro_id: p.rubro_id,
    p_concepto: p.concepto,
    p_precio: p.precio,
    p_contraparte: p.contraparte ?? undefined,
    p_lote_id: p.lote_id ?? undefined,
  })
  if (error) throw error
  return data as string
}

// El precio que faltó en una compra o venta (sentido, fecha y contraparte salen de la actividad)
export async function cargarPrecioActividad(id: string, actividad_id: string, precio: PrecioCarga, rubro_id?: string | null) {
  const { data, error } = await createClient().rpc('cargar_precio_actividad', {
    p_id: id,
    p_actividad_id: actividad_id,
    p_precio: precio,
    p_rubro_id: rubro_id ?? undefined,
  })
  if (error) throw error
  return data as string
}

export async function marcarPagado(movimiento_id: string, fecha_pago: string) {
  const { error } = await createClient().rpc('marcar_pagado', { p_movimiento_id: movimiento_id, p_fecha_pago: fecha_pago })
  if (error) throw error
}

// Solo los cargados a mano; los de una compra o venta se anulan anulando la actividad
export async function anularMovimiento(movimiento_id: string, motivo: string) {
  const { error } = await createClient().rpc('anular_movimiento', { p_movimiento_id: movimiento_id, p_motivo: motivo })
  if (error) throw error
}

// ── Rubros (los edita el administrador, por las políticas) ───────────────────

export async function getRubrosTodos(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('rubros')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('nombre')
  if (error) throw error
  return (data ?? []) as Rubro[]
}

export async function crearRubro(establecimiento_id: string, nombre: string) {
  const { data, error } = await createClient().from('rubros').insert({ establecimiento_id, nombre }).select()
  if (error) throw error
  return exigirFilas(data) as Rubro
}

export async function actualizarRubro(id: string, cambios: { nombre?: string; activo?: boolean }) {
  const { data, error } = await createClient().from('rubros').update(cambios).eq('id', id).select()
  if (error) throw error
  return exigirFilas(data) as Rubro
}

// Rubro por defecto de una especie (compra y venta)
export async function definirRubroEspecie(especie_id: string, rubro_id: string | null) {
  const { data, error } = await createClient().from('especies').update({ rubro_id }).eq('id', especie_id).select()
  if (error) throw error
  return exigirFilas(data)
}
