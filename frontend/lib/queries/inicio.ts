import { createClient } from '@/lib/supabase/client'
import type { ActividadResumen } from '@/types/actividades'
import type { EntradaBitacora } from '@/types/bitacora'

// ── Última visita ────────────────────────────────────────────────────────────

// Guarda ahora como última visita al Inicio y devuelve la anterior (null la primera vez).
// Una sola llamada por entrada: en desarrollo React monta dos veces y la segunda borraría la anterior.
// Si se vuelve a pedir en menos de 10 s, se reusa la misma respuesta.
const visitas = new Map<string, { en: number; anterior: Promise<string | null> }>()

export function registrarVisitaInicio(establecimiento_id: string): Promise<string | null> {
  const previa = visitas.get(establecimiento_id)
  if (previa && Date.now() - previa.en < 10_000) return previa.anterior
  const anterior = (async () => {
    const { data, error } = await createClient().rpc('registrar_visita_inicio', { p_establecimiento_id: establecimiento_id })
    if (error) throw error
    return (data as string | null) ?? null
  })()
  visitas.set(establecimiento_id, { en: Date.now(), anterior })
  anterior.catch(() => visitas.delete(establecimiento_id))
  return anterior
}

// ── Nacidos, muertes y vendidos desde una fecha, por especie ─────────────────

export type MovimientosMes = Map<string, { nacidos: number; muertes: number; vendidos: number }>

export async function getMovimientosDesde(establecimiento_id: string, desde: string): Promise<MovimientosMes> {
  const { data, error } = await createClient()
    .from('lote_eventos')
    .select('especie_id, tipo, cabezas')
    .eq('establecimiento_id', establecimiento_id)
    .gte('fecha', desde)
    .in('tipo', ['paricion', 'mortandad', 'venta'])
  if (error) throw error
  const porEspecie: MovimientosMes = new Map()
  for (const e of data ?? []) {
    const fila = porEspecie.get(e.especie_id) ?? { nacidos: 0, muertes: 0, vendidos: 0 }
    const n = Math.abs(e.cabezas)
    if (e.tipo === 'paricion') fila.nacidos += n
    else if (e.tipo === 'mortandad') fila.muertes += n
    else fila.vendidos += n
    porEspecie.set(e.especie_id, fila)
  }
  return porEspecie
}

// ── Qué pasó: lo último que pasó (por la fecha en que se hizo; a igual fecha, lo último cargado) ──

export type Novedad =
  | { clase: 'actividad'; id: string; fecha: string; created_at: string; created_by: string | null; actividad: ActividadResumen }
  | { clase: 'nota'; id: string; fecha: string; created_at: string; created_by: string | null; entrada: EntradaBitacora }

export async function getUltimasCargas(establecimiento_id: string, limite: number): Promise<Novedad[]> {
  const supabase = createClient()
  const [act, notas] = await Promise.all([
    supabase.from('v_actividades').select('*').eq('establecimiento_id', establecimiento_id)
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(limite),
    supabase.from('bitacora_entradas').select('*').eq('establecimiento_id', establecimiento_id)
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(limite),
  ])
  if (act.error) throw act.error
  if (notas.error) throw notas.error
  const filas: Novedad[] = [
    ...((act.data ?? []) as unknown as ActividadResumen[]).map(a => ({
      clase: 'actividad' as const, id: a.id, fecha: a.fecha, created_at: a.created_at, created_by: a.created_by ?? null, actividad: a,
    })),
    ...((notas.data ?? []) as EntradaBitacora[]).map(e => ({
      clase: 'nota' as const, id: e.id, fecha: e.fecha, created_at: e.created_at, created_by: e.created_by ?? null, entrada: e,
    })),
  ]
  return filas
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))
    .slice(0, limite)
}

// Cuántas actividades y notas cargaron otros después de una fecha
export async function contarNovedades(establecimiento_id: string, desde: string, yo: string): Promise<number> {
  const supabase = createClient()
  const [a, n] = await Promise.all([
    supabase.from('v_actividades').select('id', { count: 'exact', head: true })
      .eq('establecimiento_id', establecimiento_id).gt('created_at', desde).neq('created_by', yo),
    supabase.from('bitacora_entradas').select('id', { count: 'exact', head: true })
      .eq('establecimiento_id', establecimiento_id).gt('created_at', desde).neq('created_by', yo),
  ])
  if (a.error) throw a.error
  if (n.error) throw n.error
  return (a.count ?? 0) + (n.count ?? 0)
}
