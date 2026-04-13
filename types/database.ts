// Tipos TypeScript para las tablas de Campo Digital

export type EstadoBase = 'activo' | 'inactivo'

// ── Establecimiento ──────────────────────────────────────────────────────────

export interface Establecimiento {
  id: number
  user_id: string | null
  nombre: string
  departamento: string
  localidad: string | null
  paraje: string | null
  superficie_total: number
  tipo: 'Ganadero' | 'Agrícola' | 'Mixto'
  propietario: string | null
  rut: string | null
  dicose_fisico: string | null
  fecha_alta: string
  estado: EstadoBase
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type EstablecimientoInsert = Omit<Establecimiento, 'id' | 'created_at' | 'updated_at'>
export type EstablecimientoUpdate = Partial<EstablecimientoInsert>

// ── DICOSE Propiedad ─────────────────────────────────────────────────────────

export type TipoTitular = 'Productor' | 'Fideicomiso' | 'Empresa' | 'Otro'

export interface DicosePropiedad {
  id: number
  establecimiento_id: number
  codigo: string
  titular: string
  domicilio_constituido: string | null
  tipo_titular: TipoTitular
  estado: EstadoBase
  observaciones: string | null
  created_at: string
}

export type DicosePropiedadInsert = Omit<DicosePropiedad, 'id' | 'created_at'>
export type DicosePropiedadUpdate = Partial<DicosePropiedadInsert>

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
  dicose_propiedad_id: number | null
  caravana_snig: string
  caravana_propia: string | null
  // Campos nuevos de categorización
  edad_meses_ingreso: number | null
  fecha_ingreso: string | null
  es_toro: boolean | null
  categoria_actual: string | null
  // Campo legado (ignorar en forms nuevos)
  categoria: string | null
  sexo: SexoAnimal
  raza: string | null
  fecha_nacimiento: string | null
  madre_id: number | null
  potrero_actual: number | null
  parcela_actual: number | null
  lote_actual: number | null
  // Campos legados (ignorar en forms nuevos)
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

// Los campos legados (categoria, origen, movimiento_origen_id) son opcionales en insert
// para mantener compatibilidad con el código antiguo mientras se migra
export type AnimalInsert = Omit<Animal, 'id' | 'created_at' | 'updated_at' | 'categoria' | 'origen' | 'movimiento_origen_id'>
  & {
    categoria?: string | null
    origen?: OrigenAnimal | null
    movimiento_origen_id?: number | null
  }
export type AnimalUpdate = Partial<AnimalInsert>

// ── Movimiento Ganadero ──────────────────────────────────────────────────────

export type TipoMovimiento = 'Ingreso' | 'Egreso' | 'Traslado' | 'Afectacion'

export type SubtipoMovimiento =
  | 'Nacimiento'
  | 'Compra'
  | 'Venta a Productor'
  | 'Venta a Frigorifico'
  | 'Venta en Consignacion'
  | 'Muerte'
  | 'Traslado entre Establecimientos'
  | 'Cambio de Potrero'
  | 'Afectacion a Fideicomiso'
  | 'Afectacion a Capitalizacion'
  | 'Afectacion a Consignacion sin Movimiento'

// Mapa tipo → subtipos válidos para usar en formularios
export const SUBTIPOS_POR_TIPO: Record<TipoMovimiento, SubtipoMovimiento[]> = {
  Ingreso:    ['Nacimiento', 'Compra'],
  Egreso:     ['Venta a Productor', 'Venta a Frigorifico', 'Venta en Consignacion', 'Muerte'],
  Traslado:   ['Traslado entre Establecimientos', 'Cambio de Potrero'],
  Afectacion: ['Afectacion a Fideicomiso', 'Afectacion a Capitalizacion', 'Afectacion a Consignacion sin Movimiento'],
}

// ── Lote de Movimiento ────────────────────────────────────────────────────────

export interface LoteMovimiento {
  id: number
  user_id: string | null
  establecimiento_id: number
  fecha: string
  tipo_movimiento: TipoMovimiento
  subtipo: SubtipoMovimiento
  cantidad_animales: number | null
  contraparte: string | null
  precio_total_lote: number | null
  origen_carga: 'Manual' | 'Excel'
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type LoteMovimientoInsert = Omit<LoteMovimiento, 'id' | 'created_at' | 'updated_at'>

// ── Movimiento Ganadero ───────────────────────────────────────────────────────

export interface MovimientoGanado {
  id: number
  user_id: string | null
  establecimiento_id: number
  lote_movimiento_id: number | null
  animal_id: number | null
  caravana_snig: string | null
  fecha: string
  tipo_movimiento: TipoMovimiento
  subtipo: SubtipoMovimiento | null
  // DICOSE asociados al movimiento
  dicose_propiedad_id: number | null
  dicose_propiedad_origen: string | null  // código DICOSE Propiedad origen/vendedor/actual
  dicose_propiedad_destino: string | null // código DICOSE Propiedad destino/comprador/nuevo titular
  dicose_fisico_origen: string | null     // DICOSE Físico origen/vendedor (9 dígitos)
  dicose_fisico_destino: string | null    // DICOSE Físico destino/comprador (9 dígitos)
  // Ubicación
  potrero_id: number | null
  establecimiento_destino_id: number | null
  // Documentación
  serie_guia: string | null
  numero_autorizacion: string | null
  numero_tropa: string | null             // solo Venta a Frigorífico
  // Pesos y precios
  cantidad: number | null
  peso_promedio: number | null
  peso_total: number | null
  precio_unitario: number | null
  precio_total: number | null
  contraparte: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type MovimientoGanadoInsert = Omit<MovimientoGanado, 'id' | 'created_at' | 'updated_at'>
