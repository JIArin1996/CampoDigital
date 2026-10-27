import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import type { PrecioCarga } from '@/types/actividades'
import type {
  AporteSaldo, Concepto, GrupoConcepto, Liquidacion, Movimiento, MovimientoTitular, Pagador, Pendiente, PendienteSaldo, ResultadoDetalle,
  ResultadoRubroMes, Rubro, Saldo, Sentido, SinPrecio, Titular, TipoParte,
} from '@/types/economia'

// La plata la leen los miembros, Consulta incluido (desde 20261027000100); escriben el administrador y el operador.

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

// Un movimiento (para editarlo), con su reparto entre titulares
export async function getMovimiento(id: string) {
  const supabase = createClient()
  const [{ data, error }, { data: titulares, error: errorTitulares }] = await Promise.all([
    supabase.from('movimientos_economicos').select('*').eq('id', id).maybeSingle(),
    supabase.from('movimiento_titulares').select('*').eq('movimiento_id', id),
  ])
  if (error) throw error
  if (errorTitulares) throw errorTitulares
  return data ? { movimiento: data as Movimiento, titulares: (titulares ?? []) as MovimientoTitular[] } : null
}

// Reparto entre titulares de varios movimientos
export async function getTitularesDeMovimientos(movimiento_ids: string[]) {
  if (movimiento_ids.length === 0) return []
  const { data, error } = await createClient().from('movimiento_titulares').select('*').in('movimiento_id', movimiento_ids)
  if (error) throw error
  return (data ?? []) as MovimientoTitular[]
}

// Resultado por mes, sentido, rubro, concepto, grupo y titular (devengado, sin anulados)
export async function getResultadoDetalle(establecimiento_id: string, desde: string, hasta: string) {
  const { data, error } = await createClient()
    .from('v_resultado_detalle')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .gte('mes', desde)
    .lte('mes', hasta)
  if (error) throw error
  return (data ?? []) as ResultadoDetalle[]
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
  concepto_id: string
  precio: PrecioCarga
  contraparte?: string | null
  lote_id?: string | null
  titulares?: { titular_id: string; monto: number }[]
}) {
  const { data, error } = await createClient().rpc('registrar_movimiento', {
    p_id: p.id,
    p_establecimiento_id: p.establecimiento_id,
    p_fecha: p.fecha,
    p_sentido: p.sentido,
    p_rubro_id: p.rubro_id,
    p_concepto_id: p.concepto_id,
    p_precio: p.precio,
    p_contraparte: p.contraparte ?? undefined,
    p_lote_id: p.lote_id ?? undefined,
    p_titulares: p.titulares ?? [],
  })
  if (error) throw error
  return data as string
}

// Editar un movimiento no anulado. Si viene de una compra o venta, la base deja la fecha, el sentido y el lote.
export async function editarMovimiento(p: {
  id: string
  fecha: string
  sentido: Sentido
  rubro_id: string
  concepto_id: string
  precio: PrecioCarga
  contraparte: string | null
  lote_id: string | null
  titulares: { titular_id: string; monto: number }[]
}) {
  const { error } = await createClient().rpc('editar_movimiento', {
    p_movimiento_id: p.id,
    p_fecha: p.fecha,
    p_sentido: p.sentido,
    p_rubro_id: p.rubro_id,
    p_concepto_id: p.concepto_id,
    p_precio: p.precio,
    p_contraparte: p.contraparte ?? undefined,
    p_lote_id: p.lote_id ?? undefined,
    p_titulares: p.titulares,
  })
  if (error) throw error
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

// ── Conceptos, grupos y titulares (los edita el administrador, por las políticas) ──
// Se borran solo si nadie los usa; si no, la base lo impide (23503) y se dan de baja.

export async function getConceptos(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('conceptos')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('nombre')
  if (error) throw error
  return (data ?? []) as Concepto[]
}

export async function crearConcepto(c: { establecimiento_id: string; nombre: string; tipo: Sentido; grupo_id: string | null }) {
  const { data, error } = await createClient().from('conceptos').insert(c).select()
  if (error) throw error
  return exigirFilas(data) as Concepto
}

export async function actualizarConcepto(id: string, cambios: { nombre?: string; grupo_id?: string | null; activo?: boolean }) {
  const { data, error } = await createClient().from('conceptos').update(cambios).eq('id', id).select()
  if (error) throw error
  return exigirFilas(data) as Concepto
}

export async function getGruposConcepto(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('concepto_grupos')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('orden')
    .order('nombre')
  if (error) throw error
  return (data ?? []) as GrupoConcepto[]
}

export async function crearGrupoConcepto(establecimiento_id: string, nombre: string, orden: number) {
  const { data, error } = await createClient().from('concepto_grupos').insert({ establecimiento_id, nombre, orden }).select()
  if (error) throw error
  return exigirFilas(data) as GrupoConcepto
}

export async function actualizarGrupoConcepto(id: string, cambios: { nombre?: string; activo?: boolean }) {
  const { data, error } = await createClient().from('concepto_grupos').update(cambios).eq('id', id).select()
  if (error) throw error
  return exigirFilas(data) as GrupoConcepto
}

export async function getTitulares(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('titulares')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('nombre')
  if (error) throw error
  return (data ?? []) as Titular[]
}

export async function crearTitular(establecimiento_id: string, nombre: string) {
  const { data, error } = await createClient().from('titulares').insert({ establecimiento_id, nombre }).select()
  if (error) throw error
  return exigirFilas(data) as Titular
}

export async function actualizarTitular(id: string, cambios: { nombre?: string; activo?: boolean }) {
  const { data, error } = await createClient().from('titulares').update(cambios).eq('id', id).select()
  if (error) throw error
  return exigirFilas(data) as Titular
}

// ── Pagadores ────────────────────────────────────────────────────────────────
// Los crean el administrador y el operador; los editan, dan de baja o borran solo el administrador (RLS).

export async function getPagadores(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('pagadores')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('nombre')
  if (error) throw error
  return (data ?? []) as Pagador[]
}

export async function crearPagador(establecimiento_id: string, nombre: string, titular_id: string | null) {
  const { data, error } = await createClient().from('pagadores').insert({ establecimiento_id, nombre, titular_id }).select()
  if (error) throw error
  return exigirFilas(data) as Pagador
}

export async function actualizarPagador(id: string, cambios: { nombre?: string; titular_id?: string | null; activo?: boolean }) {
  const { data, error } = await createClient().from('pagadores').update(cambios).eq('id', id).select()
  if (error) throw error
  return exigirFilas(data) as Pagador
}

// El último pagador que usó quien está cargando, en este establecimiento (lo guarda la base al cargar)
export async function getUltimoPagador(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('preferencias_economia')
    .select('ultimo_pagador_id')
    .eq('establecimiento_id', establecimiento_id)
    .maybeSingle()
  if (error) throw error
  return data?.ultimo_pagador_id ?? null
}

// Nombres de factura ya usados (para sugerirlos al cargar), del más reciente al más viejo, con su último RUT
export async function getNombresFactura(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('movimientos_economicos')
    .select('factura_nombre, factura_rut')
    .eq('establecimiento_id', establecimiento_id)
    .not('factura_nombre', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  const vistos = new Map<string, string | null>()
  for (const f of data ?? []) {
    if (f.factura_nombre && !vistos.has(f.factura_nombre)) vistos.set(f.factura_nombre, f.factura_rut)
  }
  return [...vistos].map(([nombre, rut]) => ({ nombre, rut }))
}

// Borrar un elemento de un catálogo sin uso. Con uso, la base lo impide: el mensaje sugiere darlo de baja.
export async function borrarDeCatalogo(
  tabla: 'conceptos' | 'concepto_grupos' | 'titulares' | 'pagadores', id: string, enUso: string,
) {
  const { data, error } = await createClient().from(tabla).delete().eq('id', id).select('id')
  if (error) {
    if (error.code === '23503') throw new Error(enUso)
    throw error
  }
  exigirFilas(data)
}

// ── Saldos entre titulares y liquidaciones ───────────────────────────────────
// Los leen los miembros (Consulta incluido); las liquidaciones se registran y anulan con funciones.

// Quién le debe a quién (un par por fila, ya compensado), de mayor a menor
export async function getSaldos(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('v_saldos')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('monto_usd', { ascending: false })
  if (error) throw error
  return (data ?? []) as Saldo[]
}

// Todo lo que compone los saldos (la app arma el detalle de cada par), del más nuevo al más viejo
export async function getAportesSaldos(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('v_saldos_aportes')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('fecha', { ascending: false })
  if (error) throw error
  return (data ?? []) as AporteSaldo[]
}

// Movimientos pagados sin quién pagó o sin reparto (no entran en los saldos), de cualquier fecha
export async function getPendientesSaldos(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('v_saldos_pendientes')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('fecha', { ascending: false })
  if (error) throw error
  return (data ?? []) as PendienteSaldo[]
}

// Identificador de varios movimientos (el detalle de un saldo lo muestra en lugar del texto)
export async function getIdentificadores(movimiento_ids: string[]) {
  if (movimiento_ids.length === 0) return new Map<string, string>()
  const { data, error } = await createClient()
    .from('movimientos_economicos')
    .select('id, identificador')
    .in('id', movimiento_ids)
    .not('identificador', 'is', null)
  if (error) throw error
  return new Map((data ?? []).map(m => [m.id, m.identificador as string]))
}

export async function getLiquidaciones(establecimiento_id: string) {
  const { data, error } = await createClient()
    .from('liquidaciones')
    .select('*')
    .eq('establecimiento_id', establecimiento_id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Liquidacion[]
}

// Idempotente por id (se genera al abrir el formulario)
export async function registrarLiquidacion(l: {
  id: string
  establecimiento_id: string
  fecha: string
  de: { tipo: TipoParte; id: string }
  a: { tipo: TipoParte; id: string }
  precio: PrecioCarga
  observacion?: string
}) {
  const { data, error } = await createClient().rpc('registrar_liquidacion', {
    p_id: l.id,
    p_establecimiento_id: l.establecimiento_id,
    p_fecha: l.fecha,
    p_de_tipo: l.de.tipo,
    p_de_id: l.de.id,
    p_a_tipo: l.a.tipo,
    p_a_id: l.a.id,
    p_precio: l.precio,
    p_observacion: l.observacion || undefined,
  })
  if (error) throw error
  return data as string
}

export async function anularLiquidacion(id: string, motivo: string) {
  const { error } = await createClient().rpc('anular_liquidacion', { p_id: id, p_motivo: motivo })
  if (error) throw error
}
