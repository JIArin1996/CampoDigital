// Economía (7b): movimientos, resultado por rubro, pendientes y compras o ventas sin precio.
// En las vistas el generador marca todo como nullable: se sacan los null de las columnas que nunca lo son.

import type { Tables } from './supabase'
import type { EstadoPago, Moneda } from './actividades'

type SinNulos<T> = { [K in keyof T]: NonNullable<T[K]> }

export type Sentido = 'ingreso' | 'egreso'
export type OrigenMovimiento = 'actividad' | 'manual'

export type Movimiento = Omit<Tables<'movimientos_economicos'>, 'sentido' | 'moneda_original' | 'estado' | 'origen' | 'tipo_cambio_fuente'> & {
  sentido: Sentido
  moneda_original: Moneda
  estado: EstadoPago
  origen: OrigenMovimiento
  tipo_cambio_fuente: 'BCU' | 'manual' | null   // con pesos: de dónde salió el tipo de cambio; con dólares, null
}

export type ResultadoRubroMes = Omit<SinNulos<Tables<'v_resultado_rubro'>>, never>

export type Pendiente = Omit<SinNulos<Tables<'v_movimientos_pendientes'>>, 'sentido' | 'contraparte' | 'actividad_id' | 'lote_id' | 'fecha_vencimiento'> & {
  sentido: Sentido
  contraparte: string | null
  actividad_id: string | null
  lote_id: string | null
  fecha_vencimiento: string | null
}

export type SinPrecio = Omit<SinNulos<Tables<'v_compraventas_sin_precio'>>, 'tipo' | 'contraparte'> & {
  tipo: 'compra' | 'venta'
  contraparte: string | null
}

export type Rubro = Tables<'rubros'>

// Catálogos por establecimiento (los edita el administrador)
export type GrupoConcepto = Tables<'concepto_grupos'>
export type Concepto = Omit<Tables<'conceptos'>, 'tipo'> & { tipo: Sentido }
export type Titular = Tables<'titulares'>

// Resultado por mes, sentido, rubro, concepto, grupo y titular (la app suma por la dimensión elegida).
// Sin concepto, sin grupo o sin titular: null.
export type ResultadoDetalle = Omit<SinNulos<Tables<'v_resultado_detalle'>>,
  'sentido' | 'concepto_id' | 'concepto' | 'grupo_id' | 'grupo' | 'titular_id' | 'titular'> & {
  sentido: Sentido
  concepto_id: string | null
  concepto: string | null
  grupo_id: string | null
  grupo: string | null
  titular_id: string | null
  titular: string | null
}

// Archivo de un movimiento (se quita ocultándolo; nunca se borra)
export type ArchivoDeMovimiento = Tables<'movimiento_archivos'>

// Parte de un movimiento que va a un titular (en la moneda del movimiento)
export type MovimientoTitular = Tables<'movimiento_titulares'>
