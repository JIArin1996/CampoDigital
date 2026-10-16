import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import type { Membresia, Perfil, PerfilUpdate, RolMembresia } from '@/types/database'

// ── Usuario actual ───────────────────────────────────────────────────────────

export async function getMiPerfil() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  return data as Perfil | null
}

export async function esAdmin(): Promise<boolean> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('es_admin')
  if (error) throw error
  return data === true
}

// ── Perfiles (el usuario ve el suyo; el administrador, todos) ────────────────

export async function getPerfiles() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .order('nombre')

  if (error) throw error
  return data as Perfil[]
}

export async function getPerfil(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data as Perfil | null
}

// 0 filas = sin permiso (RLS)
export async function updatePerfil(id: string, values: PerfilUpdate) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('perfiles')
    .update(values)
    .eq('id', id)
    .select()

  if (error) throw error
  return exigirFilas(data) as Perfil
}

// ── Membresías ───────────────────────────────────────────────────────────────

// Todas las que el usuario puede ver (el administrador ve todas)
export async function getMembresias(user_id?: string) {
  const supabase = createClient()
  let query = supabase.from('membresias').select('*')
  if (user_id) query = query.eq('user_id', user_id)

  const { data, error } = await query
  if (error) throw error
  return data as Membresia[]
}

// ── Gestión (funciones de la base; exigen administrador) ─────────────────────

export async function asignarRol(user_id: string, establecimiento_id: string, rol: RolMembresia) {
  const supabase = createClient()
  const { error } = await supabase.rpc('asignar_rol', {
    p_user_id: user_id,
    p_establecimiento_id: establecimiento_id,
    p_rol: rol,
  })
  if (error) throw error
}

export async function quitarAcceso(user_id: string, establecimiento_id: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('quitar_acceso', {
    p_user_id: user_id,
    p_establecimiento_id: establecimiento_id,
  })
  if (error) throw error
}

export async function definirAdmin(user_id: string, es_admin: boolean) {
  const supabase = createClient()
  const { error } = await supabase.rpc('definir_admin', { p_user_id: user_id, p_es_admin: es_admin })
  if (error) throw error
}

// ── Foto de perfil (bucket privado 'avatares') ───────────────────────────────

const BUCKET_AVATARES = 'avatares'

// URL firmada por una hora (el bucket es privado)
export async function urlFoto(path: string | null): Promise<string | null> {
  if (!path) return null
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET_AVATARES).createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

// Sube la foto a la carpeta del usuario, la guarda en el perfil y borra la anterior
export async function subirFoto(user_id: string, archivo: Blob, anterior: string | null) {
  const supabase = createClient()
  // Nombre nuevo en cada subida: evita que el navegador muestre la foto vieja de caché.
  // Algunos navegadores no generan webp y devuelven png: la extensión sigue al tipo real.
  const tipo = archivo.type || 'image/webp'
  const extension = tipo === 'image/png' ? 'png' : tipo === 'image/jpeg' ? 'jpg' : 'webp'
  const path = `${user_id}/avatar-${Date.now()}.${extension}`

  const { error } = await supabase.storage
    .from(BUCKET_AVATARES)
    .upload(path, archivo, { contentType: tipo, upsert: false })
  if (error) throw error

  await updatePerfil(user_id, { foto_path: path })

  if (anterior) {
    await supabase.storage.from(BUCKET_AVATARES).remove([anterior])
  }
  return path
}

export async function quitarFoto(user_id: string, anterior: string | null) {
  const supabase = createClient()
  await updatePerfil(user_id, { foto_path: null })
  if (anterior) {
    await supabase.storage.from(BUCKET_AVATARES).remove([anterior])
  }
}
