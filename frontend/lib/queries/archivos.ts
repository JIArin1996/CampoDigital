import { createClient } from '@/lib/supabase/client'
import { mimeDe } from '@/components/lotes/archivos'
import type { ArchivoDeLote, ArchivoPorSubir } from '@/types/archivos'

// Bucket privado: ruta {establecimiento_id}/{id del archivo}. Sin URLs públicas: se descarga con
// una URL firmada de corta duración.
const BUCKET = 'lote-archivos'

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
export async function descargarArchivo(ruta: string, nombre: string) {
  const { data, error } = await createClient().storage.from(BUCKET).createSignedUrl(ruta, 60, { download: nombre })
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
