// Economía (7b): movimientos, resultado por rubro, pendientes y compras o ventas sin precio.
// En las vistas el generador marca todo como nullable: se sacan los null de las columnas que nunca lo son.

import type { Tables } from './supabase'
import type { EstadoPago, Moneda } from './actividades'

type SinNulos<T> = { [K in keyof T]: NonNullable<T[K]> }

export type Sentido = 'ingreso' | 'egreso'
export type OrigenMovimiento = 'actividad' | 'manual'

export type Movimiento = Omit<Tables<'movimientos_economicos'>, 'sentido' | 'moneda_original' | 'estado' | 'origen'> & {
  sentido: Sentido
  moneda_original: Moneda
  estado: EstadoPago
  origen: OrigenMovimiento
}

export type ResultadoRubroMes = Omit<SinNulos<Tables<'v_resultado_rubro'>>, never>

export type Pendiente = Omit<SinNulos<Tables<'v_movimientos_pendientes'>>, 'sentido' | 'contraparte' | 'actividad_id' | 'lote_id'> & {
  sentido: Sentido
  contraparte: string | null
  actividad_id: string | null
  lote_id: string | null
}

export type SinPrecio = Omit<SinNulos<Tables<'v_compraventas_sin_precio'>>, 'tipo' | 'contraparte'> & {
  tipo: 'compra' | 'venta'
  contraparte: string | null
}

export type Rubro = Tables<'rubros'>
