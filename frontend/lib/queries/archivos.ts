import { createClient } from '@/lib/supabase/client'
import { mimeDe } from '@/components/lotes/archivos'
import type { ArchivoDeActividad, ArchivoDeLote, ArchivoPorSubir } from '@/types/archivos'
import type { ArchivoDeMovimiento } from '@/types/economia'

// Bucket privado: ruta {establecimiento_id}/{id del archivo}. Sin URLs públicas: se descarga con
// una URL firmada de corta duración.
const BUCKET = 'lote-archivos'                    // lotes y actividades
const BUCKET_MOVIMIENTOS = 'movimiento-archivos'   // economía: solo lo ven quienes pueden cargar
export type BucketArchivos = typeof BUCKET | typeof BUCKET_MOVIMIENTOS

// ── Lectura ──────────────────────────────────────────────────────────────────

// Archivos de un lote, del más nuevo al más viejo. Los quitados solo si se piden (administrador).
export async function getArchivosLote(lote_id: string, opciones: { incluirQuitados?: boolean } = {}) {
  let query = createClient()
    .from('lote_archivos')
    .select('*, archivo:archivos(*)')
    .eq('lote_id', lote_id)
    .order('created_at', { ascending: false })
  if (!opciones.incluirQuitados) query = query.eq('oculto', false)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as ArchivoDeLote[]
}

// Descarga: URL firmada por 60 segundos, con el nombre original y como adjunto (el navegador la
// guarda o la abre con su visor; la app nunca muestra el archivo adentro).
export async function descargarArchivo(ruta: string, nombre: string, bucket: BucketArchivos = BUCKET) {
  const { data, error } = await createClient().storage.from(bucket).createSignedUrl(ruta, 60, { download: nombre })
  if (error) throw error
  const enlace = document.createElement('a')
  enlace.href = data.signedUrl
  enlace.rel = 'noopener'
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
}

// ── Escrituras ───────────────────────────────────────────────────────────────

// Sube el archivo a Storage y lo adjunta al lote (la base toma tamaño y tipo del objeto subido).
// Reintentable con el mismo id: si el objeto ya estaba subido, sigue con el adjuntar.
export async function subirArchivoALote(establecimiento_id: string, lote_id: string, a: ArchivoPorSubir) {
  const supabase = createClient()
  const nombre = a.file.name.trim()
  const contentType = mimeDe(nombre)
  if (!contentType) throw new Error(`"${nombre}": formato no permitido`)

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(`${establecimiento_id}/${a.id}`, a.file, { contentType, upsert: false })
  if (errorSubida && !yaSubido(errorSubida)) throw new Error(mensajeDeStorage(errorSubida))

  const { error } = await supabase.rpc('adjuntar_archivo_lote', {
    p_archivo_id: a.id,
    p_lote_id: lote_id,
    p_nombre: nombre,
    p_tipo: a.tipo,
  })
  if (error) throw error
}

type ErrorStorage = { message?: string; status?: number; statusCode?: string }

const codigo = (e: ErrorStorage) => String(e.status ?? e.statusCode ?? '')

// El objeto ya existe: un reintento después de una subida que terminó pero no se adjuntó
function yaSubido(e: ErrorStorage) {
  return codigo(e) === '409' || /already exists|duplicate/i.test(e.message ?? '')
}

// Storage responde en inglés: se traduce lo que puede pasar
function mensajeDeStorage(e: ErrorStorage) {
  const c = codigo(e)
  const m = e.message ?? ''
  if (c === '413' || /size|too large/i.test(m)) return 'El archivo supera los 20 MB'
  if (c === '415' || /mime|content type/i.test(m)) return 'Formato de archivo no permitido'
  if (c === '403' || /row-level security|unauthorized|not allowed/i.test(m)) return 'No tenés permiso para subir archivos a este establecimiento'
  return 'No se pudo subir el archivo. Revisá la conexión y reintentá.'
}

// Solo el administrador; el archivo sigue en los otros lotes y en Storage
export async function quitarArchivo(lote_id: string, archivo_id: string) {
  const { error } = await createClient().rpc('quitar_archivo_lote', { p_lote_id: lote_id, p_archivo_id: archivo_id })
  if (error) throw error
}

export async function restaurarArchivo(lote_id: string, archivo_id: string) {
  const { error } = await createClient().rpc('restaurar_archivo_lote', { p_lote_id: lote_id, p_archivo_id: archivo_id })
  if (error) throw error
}

// ── Archivos de los movimientos económicos ───────────────────────────────────

// Archivos visibles de varios movimientos, del más viejo al más nuevo
export async function getArchivosMovimientos(movimiento_ids: string[]) {
  if (movimiento_ids.length === 0) return []
  const { data, error } = await createClient()
    .from('movimiento_archivos')
    .select('*')
    .in('movimiento_id', movimiento_ids)
    .eq('oculto', false)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as ArchivoDeMovimiento[]
}

// Para verlo dentro de la app (VisorArchivo): URL firmada por 5 minutos, sin forzar la descarga
export async function urlParaVer(ruta: string, bucket: BucketArchivos = BUCKET) {
  const { data, error } = await createClient().storage.from(bucket).createSignedUrl(ruta, 300)
  if (error) throw error
  return data.signedUrl
}

// Sube y adjunta. Reintentable con el mismo id (como en los lotes).
export async function subirArchivoAMovimiento(establecimiento_id: string, movimiento_id: string, a: { id: string; file: File }) {
  const supabase = createClient()
  const nombre = a.file.name.trim()
  const contentType = mimeDe(nombre)
  if (!contentType) throw new Error(`"${nombre}": formato no permitido`)

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_MOVIMIENTOS)
    .upload(`${establecimiento_id}/${a.id}`, a.file, { contentType, upsert: false })
  if (errorSubida && !yaSubido(errorSubida)) throw new Error(mensajeDeStorage(errorSubida))

  const { error } = await supabase.rpc('adjuntar_archivo_movimiento', {
    p_archivo_id: a.id,
    p_movimiento_id: movimiento_id,
    p_nombre: nombre,
  })
  if (error) throw error
}

// Lo oculta; el archivo queda en Storage
export async function quitarArchivoMovimiento(archivo_id: string) {
  const { error } = await createClient().rpc('quitar_archivo_movimiento', { p_archivo_id: archivo_id })
  if (error) throw error
}

// ── Archivos de las actividades (mismo bucket que los lotes) ─────────────────

// Archivos de una actividad, del más viejo al más nuevo. Los quitados solo si se piden (administrador).
export async function getArchivosActividad(actividad_id: string, opciones: { incluirQuitados?: boolean } = {}) {
  let query = createClient()
    .from('actividad_archivos')
    .select('*, archivo:archivos(*)')
    .eq('actividad_id', actividad_id)
    .order('created_at')
  if (!opciones.incluirQuitados) query = query.eq('oculto', false)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as ArchivoDeActividad[]
}

// Sube el archivo y lo adjunta a la actividad. Reintentable con el mismo id.
export async function subirArchivoAActividad(establecimiento_id: string, actividad_id: string, a: { id: string; file: File }) {
  const supabase = createClient()
  const nombre = a.file.name.trim()
  const contentType = mimeDe(nombre)
  if (!contentType) throw new Error(`"${nombre}": formato no permitido`)

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(`${establecimiento_id}/${a.id}`, a.file, { contentType, upsert: false })
  if (errorSubida && !yaSubido(errorSubida)) throw new Error(mensajeDeStorage(errorSubida))

  const { error } = await supabase.rpc('adjuntar_archivo_actividad', {
    p_archivo_id: a.id,
    p_actividad_id: actividad_id,
    p_nombre: nombre,
  })
  if (error) throw error
}

// Solo el administrador; el archivo queda en Storage
export async function quitarArchivoActividad(actividad_id: string, archivo_id: string) {
  const { error } = await createClient().rpc('quitar_archivo_actividad', { p_actividad_id: actividad_id, p_archivo_id: archivo_id })
  if (error) throw error
}
