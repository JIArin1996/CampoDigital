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

export type Modalidad = 'productor' | 'remate' | 'frigorifico' | 'otra'
export type Moneda = 'USD' | 'UYU'
export type EstadoPago = 'pagado' | 'pendiente'

type Requeridas = 'id' | 'establecimiento_id' | 'tipo' | 'fecha' | 'created_at'

// Fila de v_actividades: la actividad con totales, detalle y monto (peso promedio y rendimiento calculados)
export type ActividadResumen = Omit<Tables<'v_actividades'>, Requeridas | 'modalidad'> & {
  id: string
  establecimiento_id: string
  tipo: TipoActividad
  fecha: string
  created_at: string
  modalidad: Modalidad | null
}

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
  rubro_id?: string          // por defecto, el rubro con el nombre de la especie del lote
}

// Lote nuevo que crea una compra o una parición
export type LoteNuevoCarga = {
  nombre: string
  especie_id?: string        // solo en la compra; en la parición es la del lote de madres
  potrero_id?: string
  campana?: string
}
