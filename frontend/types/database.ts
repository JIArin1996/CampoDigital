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
export type ParcelaUpdate = Partial<ParcelaInsert>

// ── Animal ───────────────────────────────────────────────────────────────────

export type EstadoAnimal = 'activo' | 'vendido' | 'muerto' | 'transferido'
export type SexoAnimal = 'Macho' | 'Hembra'
export type OrigenAnimal = 'Propio' | 'Comprado' | 'Nacido en campo'

export interface Animal {
  id: number
  user_id: string | null
  establecimiento_id: number
  caravana_snig: string
  caravana_propia: string | null
  categoria: string
  sexo: SexoAnimal
  raza: string | null
  fecha_nacimiento: string | null
  madre_id: number | null
  potrero_actual: number | null
  parcela_actual: number | null
  lote_actual: number | null
  peso_entrada: number | null
  fecha_peso_entrada: string | null
  origen: OrigenAnimal | null
  movimiento_origen_id: number | null
  estado: EstadoAnimal
  fecha_baja: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type AnimalInsert = Omit<Animal, 'id' | 'created_at' | 'updated_at'>
export type AnimalUpdate = Partial<AnimalInsert>

// ── Movimiento Ganadero ──────────────────────────────────────────────────────

export type TipoMovimiento = 'Compra' | 'Venta' | 'Nacimiento' | 'Muerte' | 'Traslado' | 'Ajuste'
export type TipoUbicacion = 'potrero' | 'parcela'

export interface MovimientoGanado {
  id: number
  user_id: string | null
  establecimiento_id: number
  fecha: string
  tipo_movimiento: TipoMovimiento
  categoria: string
  cantidad: number
  peso_promedio: number | null
  peso_total: number | null
  origen_tipo: TipoUbicacion | null
  origen_id: number | null
  destino_tipo: TipoUbicacion | null
  destino_id: number | null
  precio_unitario: number | null
  precio_base: string | null
  precio_total: number | null
  contraparte: string | null
  remito: string | null
  guia_dgt: string | null
  finanza_id: number | null
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type MovimientoGanadoInsert = Omit<MovimientoGanado, 'id' | 'created_at' | 'updated_at'>
