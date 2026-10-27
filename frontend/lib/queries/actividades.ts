import { createClient } from '@/lib/supabase/client'
import type {
  ActividadResumen, CampoPersonalizado, Carencia, DestinoDestete, LineaActividad, LineaCarga, LoteNuevoCarga, Modalidad,
  MovimientoEconomico, OrigenDestete, PrecioCarga, ProductoCarga, ProductoSanidad, TipoActividad,
} from '@/types/actividades'

// ── Lectura ──────────────────────────────────────────────────────────────────

export interface FiltrosActividades {
  tipo?: TipoActividad | null
  loteId?: string | null
  incluirAnuladas?: boolean
  desde?: string | null      // fecha inclusive (YYYY-MM-DD)
  hasta?: string | null
  limite?: number
}

// Actividades del establecimiento (vista con totales), de la más nueva a la más vieja.
// El filtro por lote busca en actividad_lotes: incluye las actividades de varios lotes
// (sanidad, esquila, personalizada) y la parición cuyas crías fueron a ese lote.
export async function getActividades(establecimiento_id: string, filtros: FiltrosActividades = {}) {
  const supabase = createClient()

  let ids: string[] | null = null
  if (filtros.loteId) {
    const { data, error } = await supabase.from('actividad_lotes').select('actividad_id').eq('lote_id', filtros.loteId)
    if (error) throw error
    ids = [...new Set((data ?? []).map(x => x.actividad_id))]
    if (ids.length === 0) return []
  }

  let query = supabase
    .from('v_actividades')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filtros.limite ?? 100)

  if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
  if (filtros.desde) query = query.gte('fecha', filtros.desde)
  if (filtros.hasta) query = query.lte('fecha', filtros.hasta)
  if (ids) query = query.in('id', ids)
  if (!filtros.incluirAnuladas) query = query.is('anulada_en', null)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as ActividadResumen[]
}

// Una actividad con sus líneas, productos de sanidad y movimiento económico (null si no existe o no es miembro)
export async function getActividad(id: string) {
  const supabase = createClient()
  const [actividad, lineas, productos, movimientos] = await Promise.all([
    supabase.from('v_actividades').select('*').eq('id', id).maybeSingle(),
    supabase.from('actividad_lineas').select('*').eq('actividad_id', id),
    supabase.from('act_sanidad_productos').select('*').eq('actividad_id', id).order('orden'),
    supabase.from('movimientos_economicos').select('*').eq('actividad_id', id).order('created_at'),
  ])
  if (actividad.error) throw actividad.error
  if (lineas.error) throw lineas.error
  if (productos.error) throw productos.error
  if (movimientos.error) throw movimientos.error
  if (!actividad.data) return null
  return {
    actividad: actividad.data as unknown as ActividadResumen,
    lineas: (lineas.data ?? []) as LineaActividad[],
    productos: (productos.data ?? []) as ProductoSanidad[],
    movimientos: (movimientos.data ?? []) as MovimientoEconomico[],
  }
}

// Carencias vigentes a una fecha de uno o más lotes (incluye las heredadas por división, unión o destete)
export async function getCarencias(lote_ids: string[], al: string) {
  if (lote_ids.length === 0) return []
  const { data, error } = await createClient()
    .from('v_carencias')
    .select('*')
    .in('lote_id', lote_ids)
    .gte('fin_carencia', al)
    .order('fin_carencia', { ascending: false })
  if (error) throw error
  return (data ?? []) as Carencia[]
}

// Lotes de una actividad con su rol (principal, cria, origen, destino)
export async function getLotesConRol(actividad_id: string) {
  const { data, error } = await createClient().from('actividad_lotes').select('lote_id, rol').eq('actividad_id', actividad_id)
  if (error) throw error
  return (data ?? []) as { lote_id: string; rol: 'principal' | 'cria' | 'origen' | 'destino' }[]
}

// Historial de cría del establecimiento, para el destete: pariciones vigentes (fecha y lote donde
// entraron las crías) y destetes vigentes (fecha y lotes de origen y destino)
export async function getHistorialCria(establecimiento_id: string) {
  const supabase = createClient()
  const { data: acts, error } = await supabase
    .from('actividades')
    .select('id, tipo, fecha')
    .eq('establecimiento_id', establecimiento_id)
    .in('tipo', ['paricion', 'destete'])
    .is('anulada_en', null)
  if (error) throw error
  const fecha = new Map((acts ?? []).map(a => [a.id, a.fecha]))
  const pariciones = (acts ?? []).filter(a => a.tipo === 'paricion').map(a => a.id)
  const destetes = (acts ?? []).filter(a => a.tipo === 'destete').map(a => a.id)

  const [crias, lotes] = await Promise.all([
    pariciones.length > 0
      ? supabase.from('act_paricion').select('actividad_id, lote_cria_id').in('actividad_id', pariciones)
      : Promise.resolve({ data: [], error: null }),
    destetes.length > 0
      ? supabase.from('actividad_lotes').select('actividad_id, lote_id, rol').in('actividad_id', destetes).in('rol', ['origen', 'destino'])
      : Promise.resolve({ data: [], error: null }),
  ])
  if (crias.error) throw crias.error
  if (lotes.error) throw lotes.error
  return {
    pariciones: (crias.data ?? []).map(p => ({ lote_id: p.lote_cria_id, fecha: fecha.get(p.actividad_id)! })),
    destetes: (lotes.data ?? []).map(l => ({ lote_id: l.lote_id, rol: l.rol as 'origen' | 'destino', fecha: fecha.get(l.actividad_id)! })),
  }
}

// Nombres ya usados en actividades personalizadas (sugerencias del formulario)
export async function getNombresPersonalizadas(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('act_personalizada')
    .select('nombre')
    .eq('establecimiento_id', establecimiento_id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return [...new Set((data ?? []).map(x => x.nombre))]
}

// Rubros activos del establecimiento (para el precio de compra y venta)
export async function getRubros(establecimiento_id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rubros')
    .select('id, nombre')
    .eq('establecimiento_id', establecimiento_id)
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data ?? []
}

// ── Escrituras (solo por funciones de la base) ───────────────────────────────
// Todas reciben p_id: el id que la app genera al abrir el formulario. Si el mismo
// envío llega dos veces (doble toque, reintento con mala señal), la base devuelve la
// actividad ya creada sin duplicar stock ni movimiento.

interface Comunes {
  id: string
  fecha: string
  lineas: LineaCarga[]
  responsables?: string[]       // ninguno = sin responsable
  notas?: string | null
}

export async function registrarPesada(p: Comunes & { lote_id: string }) {
  const { data, error } = await createClient().rpc('registrar_pesada', {
    p_id: p.id,
    p_lote_id: p.lote_id,
    p_fecha: p.fecha,
    p_lineas: p.lineas,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

export async function registrarMortandad(p: Comunes & { lote_id: string; causa?: string | null; observaciones?: string | null }) {
  const { data, error } = await createClient().rpc('registrar_mortandad', {
    p_id: p.id,
    p_lote_id: p.lote_id,
    p_fecha: p.fecha,
    p_lineas: p.lineas,
    p_causa: p.causa ?? undefined,
    p_observaciones: p.observaciones ?? undefined,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

interface CompraVenta {
  modalidad: Modalidad
  contraparte?: string | null
  kg_gancho?: number | null
  precio?: PrecioCarga | null
}

// Destino: un lote existente (lote_id) o uno nuevo (lote_nuevo)
export async function registrarCompra(p: Comunes & CompraVenta & {
  establecimiento_id: string
  lote_id?: string | null
  lote_nuevo?: LoteNuevoCarga | null
}) {
  const { data, error } = await createClient().rpc('registrar_compra', {
    p_id: p.id,
    p_establecimiento_id: p.establecimiento_id,
    p_fecha: p.fecha,
    p_lineas: p.lineas,
    p_modalidad: p.modalidad,
    p_lote_id: p.lote_id ?? undefined,
    p_lote_nuevo: p.lote_nuevo ?? undefined,
    p_contraparte: p.contraparte ?? undefined,
    p_kg_gancho: p.kg_gancho ?? undefined,
    p_precio: p.precio ?? undefined,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

// Si el lote queda en cero, la base lo cierra con el motivo "Vendido"
export async function registrarVenta(p: Comunes & CompraVenta & { lote_id: string }) {
  const { data, error } = await createClient().rpc('registrar_venta', {
    p_id: p.id,
    p_lote_id: p.lote_id,
    p_fecha: p.fecha,
    p_lineas: p.lineas,
    p_modalidad: p.modalidad,
    p_contraparte: p.contraparte ?? undefined,
    p_kg_gancho: p.kg_gancho ?? undefined,
    p_precio: p.precio ?? undefined,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

// Crías vivas al lote de cría (existente o nuevo); los nacidos muertos no suman stock
export async function registrarParicion(p: Comunes & {
  lote_madres_id: string
  nacidos_muertos?: number | null
  lote_cria_id?: string | null
  lote_cria_nuevo?: LoteNuevoCarga | null
}) {
  const { data, error } = await createClient().rpc('registrar_paricion', {
    p_id: p.id,
    p_lote_madres_id: p.lote_madres_id,
    p_fecha: p.fecha,
    p_lineas: p.lineas,
    p_nacidos_muertos: p.nacidos_muertos ?? undefined,
    p_lote_cria_id: p.lote_cria_id ?? undefined,
    p_lote_cria_nuevo: p.lote_cria_nuevo ?? undefined,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

// ── 6b-1: no mueven stock ────────────────────────────────────────────────────

interface VariosLotes {
  id: string
  establecimiento_id: string
  lotes: string[]
  fecha: string
  responsables?: string[]       // ninguno = sin responsable
  notas?: string | null
}

// Uno o más productos a uno o más lotes (se entiende que fue a todo el lote)
export async function registrarSanidad(p: VariosLotes & { productos: ProductoCarga[] }) {
  const { data, error } = await createClient().rpc('registrar_sanidad', {
    p_id: p.id,
    p_establecimiento_id: p.establecimiento_id,
    p_lotes: p.lotes,
    p_fecha: p.fecha,
    p_productos: p.productos,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

// Lotes ovinos; un kg de lana total para toda la carga
export async function registrarEsquila(p: VariosLotes & { kg_lana_total: number }) {
  const { data, error } = await createClient().rpc('registrar_esquila', {
    p_id: p.id,
    p_establecimiento_id: p.establecimiento_id,
    p_lotes: p.lotes,
    p_fecha: p.fecha,
    p_kg_lana_total: p.kg_lana_total,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

export async function registrarPersonalizada(p: VariosLotes & { nombre: string; campos: CampoPersonalizado[] }) {
  const { data, error } = await createClient().rpc('registrar_personalizada', {
    p_id: p.id,
    p_establecimiento_id: p.establecimiento_id,
    p_lotes: p.lotes,
    p_fecha: p.fecha,
    p_nombre: p.nombre,
    p_campos: p.campos,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

interface UnLote {
  id: string
  lote_id: string
  fecha: string
  responsables?: string[]       // ninguno = sin responsable
  notas?: string | null
}

export async function registrarServicio(p: UnLote & { vacas_entoradas: number; toros?: number | null }) {
  const { data, error } = await createClient().rpc('registrar_servicio', {
    p_id: p.id,
    p_lote_id: p.lote_id,
    p_fecha: p.fecha,
    p_vacas_entoradas: p.vacas_entoradas,
    p_toros: p.toros ?? undefined,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

export async function registrarDiagnostico(p: UnLote & { vacas_diagnosticadas: number; vacas_prenadas: number }) {
  const { data, error } = await createClient().rpc('registrar_diagnostico', {
    p_id: p.id,
    p_lote_id: p.lote_id,
    p_fecha: p.fecha,
    p_vacas_diagnosticadas: p.vacas_diagnosticadas,
    p_vacas_prenadas: p.vacas_prenadas,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

// ── 6b-2: destete ────────────────────────────────────────────────────────────

// Crías al pie de uno o más lotes a lotes nuevos. La base valida el balance (en cabezas totales; una
// cría sexada no cambia de sexo; ningún destino con sin sexar) y cierra los orígenes que quedan vacíos.
export async function registrarDestete(p: {
  id: string
  establecimiento_id: string
  fecha: string
  origenes: OrigenDestete[]
  destinos: DestinoDestete[]
  responsables?: string[]       // ninguno = sin responsable
  notas?: string | null
}) {
  const { data, error } = await createClient().rpc('registrar_destete', {
    p_id: p.id,
    p_establecimiento_id: p.establecimiento_id,
    p_fecha: p.fecha,
    p_origenes: p.origenes,
    p_destinos: p.destinos,
    p_responsables: p.responsables ?? undefined,
    p_notas: p.notas ?? undefined,
  })
  if (error) throw error
  return data as string
}

// Eventos inversos con la fecha original, movimiento anulado, lotes reabiertos o cerrados según corresponda
export async function anularActividad(actividad_id: string, motivo: string) {
  const { error } = await createClient().rpc('anular_actividad', { p_actividad_id: actividad_id, p_motivo: motivo })
  if (error) throw error
}
