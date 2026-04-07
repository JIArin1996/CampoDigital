// Tipos TypeScript para las tablas de Campo Digital

export type EstadoBase = 'activo' | 'inactivo'

// ── Establecimiento ──────────────────────────────────────────────────────────

export interface Establecimiento {
  id: number
  user_id: string | null
  nombre: string
  departamento: string
  localidad: string | null
  superficie_total: number
  tipo: 'Ganadero' | 'Agrícola' | 'Mixto'
  propietario: string | null
  rut: string | null
  dicose: string | null
  fecha_alta: string
  estado: EstadoBase
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type EstablecimientoInsert = Omit<Establecimiento, 'id' | 'created_at' | 'updated_at'>
export type EstablecimientoUpdate = Partial<EstablecimientoInsert>

// ── Potrero ──────────────────────────────────────────────────────────────────

export type UsoActual = 'Ganadería' | 'Agricultura' | 'Mixto' | 'Reserva' | 'Sin uso'

export interface Potrero {
  id: number
  user_id: string | null
  establecimiento_id: number
  nombre: string
  superficie: number
  uso_actual: UsoActual
  tipo_pastura: string | null
  aguada: boolean | null
  sombra: boolean | null
  estado: EstadoBase
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type PotreroInsert = Omit<Potrero, 'id' | 'created_at' | 'updated_at'>
export type PotreroUpdate = Partial<PotreroInsert>

// ── Parcela ──────────────────────────────────────────────────────────────────

export interface Parcela {
  id: number
  user_id: string | null
  establecimiento_id: number
  potrero_id: number
  nombre: string
  superficie: number
  uso_actual: UsoActual
  tipo_pastura: string | null
  estado: EstadoBase
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type ParcelaInsert = Omit<Parcela, 'id' | 'created_at' | 'updated_at'>
