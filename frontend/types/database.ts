// Tipos de las tablas de Campo Digital, derivados de types/supabase.ts.
//
// types/supabase.ts se genera desde la base (no se edita a mano):
//   npx supabase gen types typescript --project-id glmguyabfjiloexqgvic --schema public | Out-File -Encoding utf8 types\supabase.ts
//
// Acá solo se angostan las columnas que la base restringe con un check (estado, rol),
// que el generador devuelve como string.

import type { Tables } from './supabase'

export type EstadoBase = 'activo' | 'inactivo'
export type Rol = 'editor' | 'lector'

// ── Establecimiento ──────────────────────────────────────────────────────────

export type Establecimiento = Omit<Tables<'establecimientos'>, 'estado'> & { estado: EstadoBase }

// Datos que se cargan en el alta (crear_establecimiento) y que se pueden editar
export type EstablecimientoDatos = Pick<
  Establecimiento,
  | 'nombre' | 'departamento' | 'localidad' | 'paraje' | 'superficie_total' | 'sistema_productivo'
  | 'propietario' | 'rut' | 'dicose' | 'fecha_alta' | 'observaciones'
>

// Columnas que authenticated puede actualizar (GRANT por columna)
export type EstablecimientoUpdate = Partial<EstablecimientoDatos & Pick<Establecimiento, 'estado'>>

// ── Membresía ────────────────────────────────────────────────────────────────

export type Membresia = Omit<Tables<'membresias'>, 'rol'> & { rol: Rol }

// ── Potrero ──────────────────────────────────────────────────────────────────

export type Potrero = Omit<Tables<'potreros'>, 'estado'> & { estado: EstadoBase }

// Columnas que authenticated puede insertar y actualizar (GRANT por columna)
export type PotreroInsert = Pick<
  Potrero,
  'establecimiento_id' | 'nombre' | 'superficie' | 'uso_actual' | 'tipo_pastura' | 'aguada' | 'sombra' | 'estado' | 'observaciones'
>
export type PotreroUpdate = Partial<Omit<PotreroInsert, 'establecimiento_id'>>
