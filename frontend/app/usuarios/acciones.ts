"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { mensajeDeError } from "@/lib/supabase/errores"
import { LARGO_MINIMO_CONTRASENA } from "@/components/usuarios/roles"
import type { RolMembresia } from "@/types/database"

// Acciones de Supabase Auth que necesitan la clave service_role.
// Se pueden llamar por POST directo (no solo desde la app): cada una verifica primero
// que quien llama tenga sesión y sea administrador activo.

export type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Tu sesión venció. Volvé a ingresar." }

  const { data: esAdmin, error } = await supabase.rpc("es_admin")
  if (error || !esAdmin) return { ok: false as const, error: "Solo un administrador puede hacer esto." }

  return { ok: true as const, supabase, user }
}

function validarContrasena(password: string): string | null {
  if (!password || password.length < LARGO_MINIMO_CONTRASENA) {
    return `La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`
  }
  return null
}

const normalizarEmail = (email: string) => email.trim().toLowerCase()
const esEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

// ── Crear usuario ────────────────────────────────────────────────────────────

export interface NuevoUsuario {
  email: string
  password: string
  nombre: string
  apellido: string | null
  celular: string | null
  esAdmin: boolean
  asignaciones: { establecimiento_id: string; rol: RolMembresia }[]
}

export async function crearUsuario(input: NuevoUsuario): Promise<Resultado<{ id: string }>> {
  const auth = await exigirAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  const email = normalizarEmail(input.email)
  if (!esEmail(email)) return { ok: false, error: "El email no es válido" }
  if (!input.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio" }
  const errorContrasena = validarContrasena(input.password)
  if (errorContrasena) return { ok: false, error: errorContrasena }

  const admin = createAdminClient()

  // 1. Usuario en Auth, ya confirmado (no hay mail)
  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  })
  if (errorAuth || !creado.user) {
    const yaExiste = errorAuth?.message?.toLowerCase().includes("already")
    return { ok: false, error: yaExiste ? "Ya existe un usuario con ese email" : "No se pudo crear el usuario" }
  }
  const id = creado.user.id

  // 2. Perfil. Si falla, se deshace el usuario de Auth para no dejarlo a medias.
  const { error: errorPerfil } = await admin.from("perfiles").insert({
    id,
    email,
    nombre: input.nombre.trim(),
    apellido: input.apellido?.trim() || null,
    celular: input.celular?.trim() || null,
  })
  if (errorPerfil) {
    await admin.auth.admin.deleteUser(id)
    return { ok: false, error: mensajeDeError(errorPerfil, "No se pudo crear el perfil") }
  }

  // 3. Roles: con la sesión del administrador, así pasan por las funciones de la base
  for (const a of input.asignaciones) {
    const { error } = await auth.supabase.rpc("asignar_rol", {
      p_user_id: id,
      p_establecimiento_id: a.establecimiento_id,
      p_rol: a.rol,
    })
    if (error) {
      return { ok: false, error: `Usuario creado, pero falló una asignación: ${mensajeDeError(error)}` }
    }
  }

  if (input.esAdmin) {
    const { error } = await auth.supabase.rpc("definir_admin", { p_user_id: id, p_es_admin: true })
    if (error) {
      return { ok: false, error: `Usuario creado, pero no se pudo hacer administrador: ${mensajeDeError(error)}` }
    }
  }

  return { ok: true, data: { id } }
}

// ── Resetear contraseña ──────────────────────────────────────────────────────

export async function resetearContrasena(userId: string, password: string): Promise<Resultado> {
  const auth = await exigirAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  const errorContrasena = validarContrasena(password)
  if (errorContrasena) return { ok: false, error: errorContrasena }

  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password })
  if (error) return { ok: false, error: "No se pudo cambiar la contraseña" }
  return { ok: true }
}

// ── Cambiar email ────────────────────────────────────────────────────────────

export async function cambiarEmail(userId: string, nuevoEmail: string): Promise<Resultado> {
  const auth = await exigirAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  const email = normalizarEmail(nuevoEmail)
  if (!esEmail(email)) return { ok: false, error: "El email no es válido" }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
  if (error) {
    const yaExiste = error.message?.toLowerCase().includes("already")
    return { ok: false, error: yaExiste ? "Ese email ya lo usa otro usuario" : "No se pudo cambiar el email" }
  }

  const { error: errorPerfil } = await admin.from("perfiles").update({ email }).eq("id", userId)
  if (errorPerfil) return { ok: false, error: "El email de acceso cambió, pero no se pudo actualizar el perfil" }
  return { ok: true }
}

// ── Desactivar / reactivar ───────────────────────────────────────────────────
// No se borra: el usuario no puede entrar, pero su nombre sigue en lo que cargó.

export async function cambiarEstadoUsuario(userId: string, activo: boolean): Promise<Resultado> {
  const auth = await exigirAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!activo && userId === auth.user.id) {
    return { ok: false, error: "No te podés desactivar a vos mismo" }
  }

  // 1. En la base (protege al último administrador y corta el acceso en el momento)
  const { error } = await auth.supabase.rpc("definir_activo", { p_user_id: userId, p_activo: activo })
  if (error) return { ok: false, error: mensajeDeError(error) }

  // 2. En Auth: bloqueo para que no pueda iniciar sesión ni renovarla
  const { error: errorBan } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: activo ? "none" : "876000h",
  })
  if (errorBan) {
    // Se vuelve atrás el paso 1 para no dejar los dos lados distintos
    await auth.supabase.rpc("definir_activo", { p_user_id: userId, p_activo: !activo })
    return { ok: false, error: "No se pudo actualizar el acceso del usuario" }
  }

  return { ok: true }
}
