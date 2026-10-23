import { createClient } from '@/lib/supabase/client'
import type { EstadoTarea, FilaCalendario } from '@/types/bitacora'

// ── Lectura (v_calendario: tareas no anuladas y próximas dosis de sanidades no anuladas) ──

// Pendientes: todas, de la más vieja a la más nueva. Terminadas (hechas o canceladas): las más recientes.
export async function getCalendario(establecimiento_id: string, terminadas = false): Promise<FilaCalendario[]> {
  const supabase = createClient()
  let query = supabase.from('v_calendario').select('*').eq('establecimiento_id', establecimiento_id)
  query = terminadas
    ? query.neq('estado', 'pendiente').order('fecha', { ascending: false }).limit(50)
    : query.eq('estado', 'pendiente').order('fecha', { ascending: true }).limit(500)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(f => ({
    origen: f.origen as FilaCalendario['origen'],
    entrada_id: f.entrada_id,
    actividad_id: f.actividad_id,
    orden: f.orden,
    fecha: f.fecha!,
    texto: f.texto ?? '',
    persona_id: f.persona_id,
    estado: f.estado as EstadoTarea,
    repetir_cada_dias: f.repetir_cada_dias,
    lotes: f.lotes ?? [],
    hecha_en: f.hecha_en,
  }))
}

// Vencidas que le tocan a una persona: las suyas y las sin responsable (las dosis no tienen).
// Sin persona (usuario sin ficha en este establecimiento): solo las sin responsable.
export async function contarVencidas(establecimiento_id: string, persona_id: string | null, hoy: string) {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('v_calendario')
    .select('fecha', { count: 'exact', head: true })
    .eq('establecimiento_id', establecimiento_id)
    .eq('estado', 'pendiente')
    .lt('fecha', hoy)
    .or(persona_id ? `persona_id.is.null,persona_id.eq.${persona_id}` : 'persona_id.is.null')
  if (error) throw error
  return count ?? 0
}

// ── Escritura ────────────────────────────────────────────────────────────────

// Marca (dada = true) o desmarca la próxima dosis de un producto de una sanidad
export async function marcarDosisDada(actividad_id: string, orden: number, dada = true) {
  const supabase = createClient()
  const { error } = await supabase.rpc('marcar_dosis_dada', { p_actividad_id: actividad_id, p_orden: orden, p_dada: dada })
  if (error) throw error
}

// Aviso para que el contador de vencidas del menú se actualice sin esperar a cambiar de pantalla
export const EVENTO_TAREAS = 'campo:tareas-cambiaron'
export const avisarCambioTareas = () => window.dispatchEvent(new Event(EVENTO_TAREAS))
