import { createClient } from '@/lib/supabase/client'
import { exigirFilas } from '@/lib/supabase/errores'
import type { Establecimiento, EstablecimientoDatos, EstablecimientoUpdate, RolMembresia } from '@/types/database'

// La superficie total es una columna calculada por la base (la suma de los potreros activos dibujados):
// hay que pedirla aparte del *
const CON_SUPERFICIE = '*, superficie_total, superficie_efectiva_total'

// Establecimientos activos del usuario (el RLS deja ver solo aquellos donde es miembro)
export async function getEstablecimientos() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .select(CON_SUPERFICIE)
    .eq('estado', 'activo')
    .order('nombre')

  if (error) throw error
  return data as unknown as Establecimiento[]
}

// Establecimientos inactivos del usuario
export async function getEstablecimientosInactivos() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .select(CON_SUPERFICIE)
    .eq('estado', 'inactivo')
    .order('nombre')

  if (error) throw error
  return data as unknown as Establecimiento[]
}

// Obtiene un establecimiento por id (null si no existe o no es miembro)
export async function getEstablecimiento(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .select(CON_SUPERFICIE)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data as unknown as Establecimiento | null
}

// Rol asignado al usuario actual en cada establecimiento (el administrador ve todos sin asignación)
export async function getMisRoles(): Promise<Record<string, RolMembresia>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const { data, error } = await supabase
    .from('membresias')
    .select('establecimiento_id, rol')
    .eq('user_id', user.id)

  if (error) throw error
  return Object.fromEntries((data ?? []).map(m => [m.establecimiento_id, m.rol as RolMembresia]))
}

// Alta (solo administrador): crea el establecimiento en una sola transacción.
// Carga los catálogos base (especies, categorías y rubros). Devuelve el id nuevo.
export async function crearEstablecimiento(values: EstablecimientoDatos): Promise<string> {
  const supabase = createClient()
  // Los opcionales vacíos se omiten (undefined): la función usa su valor por defecto, null
  const { data, error } = await supabase.rpc('crear_establecimiento', {
    p_nombre: values.nombre,
    p_departamento: values.departamento,
    p_localidad: values.localidad ?? undefined,
    p_paraje: values.paraje ?? undefined,
    p_sistema_productivo: values.sistema_productivo ?? undefined,
    p_propietario: values.propietario ?? undefined,
    p_rut: values.rut ?? undefined,
    p_dicose: values.dicose ?? undefined,
    p_fecha_alta: values.fecha_alta,
    p_observaciones: values.observaciones ?? undefined,
    p_cargar_catalogos_base: true,
  })

  if (error) throw error
  return data as string
}

// Edición. Si el RLS filtra la fila (no administrador), no hay error sino 0 filas: se trata como "sin permiso".
export async function updateEstablecimiento(id: string, values: EstablecimientoUpdate) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('establecimientos')
    .update(values)
    .eq('id', id)
    .select(CON_SUPERFICIE)

  if (error) throw error
  return exigirFilas(data) as unknown as Establecimiento
}

// Baja lógica (no hay borrado)
export async function desactivarEstablecimiento(id: string) {
  return updateEstablecimiento(id, { estado: 'inactivo' })
}

export async function reactivarEstablecimiento(id: string) {
  return updateEstablecimiento(id, { estado: 'activo' })
}
