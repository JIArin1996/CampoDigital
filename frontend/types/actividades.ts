// Tipos de actividades y movimientos económicos, derivados de types/supabase.ts.
//
// Se angostan las columnas restringidas con un check (tipo, modalidad, moneda, estado).
// En la vista v_actividades el generador marca todo como nullable: se sacan los null de
// las columnas que vienen de columnas not null de actividades.

import type { Tables } from './supabase'

// Los 12 tipos del enfoque; en la 6a se registran los 5 primeros
export type TipoActividad =
  | 'pesada' | 'mortandad' | 'compra' | 'venta' | 'paricion'
  | 'sanidad' | 'antiparasitario' | 'servicio' | 'diagnostico_gestacion' | 'destete' | 'esquila' | 'personalizada'

export type TipoActividad6a = 'pesada' | 'mortandad' | 'compra' | 'venta' | 'paricion'

// Las que no mueven stock (6b-1). Antiparasitario no se carga como tipo: es una categoría de producto de sanidad.
export type TipoActividad6b1 = 'sanidad' | 'servicio' | 'diagnostico_gestacion' | 'esquila' | 'personalizada'

// 6b-2: mueve crías al pie de uno o más lotes a lotes nuevos
export type TipoActividad6b2 = 'destete'

// Lo que se puede cargar hoy desde "Nueva actividad"
export type TipoCargable = TipoActividad6a | TipoActividad6b1 | TipoActividad6b2

export type Modalidad = 'productor' | 'remate' | 'frigorifico' | 'otra'
export type Moneda = 'USD' | 'UYU'
export type EstadoPago = 'pagado' | 'pendiente'

type Requeridas = 'id' | 'establecimiento_id' | 'tipo' | 'fecha' | 'created_at'

// Fila de v_actividades: la actividad con totales, detalle y monto (peso promedio, rendimiento,
// vacías y kg de lana por cabeza calculados). lotes: todos los lotes de la actividad (actividad_lotes).
export type ActividadResumen = Omit<Tables<'v_actividades'>, Requeridas | 'modalidad' | 'campos'> & {
  id: string
  establecimiento_id: string
  tipo: TipoActividad
  fecha: string
  created_at: string
  modalidad: Modalidad | null
  campos: CampoPersonalizado[] | null
}

// Producto de una sanidad
export type ProductoSanidad = Tables<'act_sanidad_productos'>

// Carencia de un lote (v_carencias); heredada = el lote viene de una división, unión o destete posterior a la sanidad
export type Carencia = { [K in keyof Tables<'v_carencias'>]: NonNullable<Tables<'v_carencias'>[K]> }

// Producto que se manda a registrar_sanidad
export type ProductoCarga = {
  producto: string
  categoria: string
  dosis?: string
  via?: string
  carencia_dias?: number
  fecha_proxima_dosis?: string
}

// Par campo-valor de una actividad personalizada
export type CampoPersonalizado = { campo: string; valor: string }

export type LineaActividad = Tables<'actividad_lineas'>

export type MovimientoEconomico = Omit<Tables<'movimientos_economicos'>, 'sentido' | 'moneda_original' | 'estado'> & {
  sentido: 'ingreso' | 'egreso'
  moneda_original: Moneda
  estado: EstadoPago
}

// Línea que se manda a las funciones registrar_* (type y no interface: tiene que ser asignable a Json)
export type LineaCarga = {
  categoria_id: string
  cabezas: number
  peso_vivo_total_kg?: number
}

// Precio de una compra o venta (opcional). Sin precio no se crea movimiento económico.
export type PrecioCarga = {
  monto: number
  moneda: Moneda
  tipo_cambio?: number       // obligatorio con UYU, vacío con USD
  estado: EstadoPago
  fecha_pago?: string
  vencimiento?: string       // solo pendiente: cuándo se espera cobrar o pagar (carga manual y precio posterior)
  rubro_id?: string          // por defecto, el rubro con el nombre de la especie del lote
  concepto_id?: string       // por defecto, "Compra de ganado" o "Venta de ganado vacuno/ovino"
  titulares?: { titular_id: string; monto: number }[]   // reparto del monto entre titulares (suma = monto)
}

// Destete: lo que sale de cada origen (solo cría al pie) y lo que entra a cada lote nuevo (ya sexado)
export type LineaDestete = { categoria_id: string; cabezas: number }
export type OrigenDestete = { lote_id: string; lineas: LineaDestete[] }
export type DestinoDestete = { nombre: string; potrero_id?: string; anios_nacimiento: number[]; lineas: LineaDestete[] }

// Lote nuevo que crea una compra o una parición
export type LoteNuevoCarga = {
  nombre: string
  especie_id?: string        // solo en la compra; en la parición es la del lote de madres
  potrero_id?: string
  anios_nacimiento?: number[]   // solo en la compra (los que indique el formulario); la parición no los toca
}
