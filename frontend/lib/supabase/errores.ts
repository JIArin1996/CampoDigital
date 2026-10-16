/**
 * Traduce los errores de Supabase/Postgres a mensajes para mostrar.
 *
 * Las funciones de la base ya devuelven mensajes en español para las validaciones
 * (22023, 23514); los demás códigos se traducen acá.
 */

interface ErrorConCodigo {
  code?: string
  message?: string
}

export class SinPermisoError extends Error {
  constructor(mensaje = "No tenés permiso para hacer este cambio") {
    super(mensaje)
    this.name = "SinPermisoError"
  }
}

export function mensajeDeError(err: unknown, porDefecto = "No se pudo guardar"): string {
  if (err instanceof SinPermisoError) return err.message

  const e = (err ?? {}) as ErrorConCodigo
  switch (e.code) {
    case "42501": // RLS o permisos
      return "No tenés permiso para hacer este cambio"
    case "23505": // unique
      return "Ya existe un registro con ese nombre"
    case "23503": // clave foránea
      return "El dato está en uso o hace referencia a algo que no existe"
    case "22023": // validaciones de las funciones (mensaje en español)
    case "23514":
      return e.message ?? porDefecto
    default:
      return err instanceof Error ? err.message : (e.message ?? porDefecto)
  }
}

/**
 * Un UPDATE que el RLS filtra no da error: devuelve 0 filas.
 * Se usa después de .update(...).select() para tratar ese caso como "sin permiso".
 */
export function exigirFilas<T>(data: T[] | null): T {
  if (!data || data.length === 0) throw new SinPermisoError()
  return data[0]
}
