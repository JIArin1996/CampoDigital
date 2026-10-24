// Tipos de catálogos, lotes y stock, derivados de types/supabase.ts (generado desde la base).
//
// Se angostan las columnas restringidas con un check (estado, tipo), y en las vistas se
// sacan los null: el generador marca nullable toda columna de vista, pero las de stock
// nunca son null (salen de columnas not null de lote_eventos).

import type { Tables } from './supabase'

type SinNulos<T> = { [K in keyof T]: NonNullable<T[K]> }

// Grupo de la especie: la esquila acepta solo lotes de especies del grupo ovino
export type GrupoEspecie = 'bovino' | 'ovino' | 'otro'

export type Especie = Omit<Tables<'especies'>, 'grupo'> & { grupo: GrupoEspecie }

export type CategoriaAnimal = Tables<'categorias_animales'>

export type EstadoLote = 'activo' | 'cerrado'

export type Lote = Omit<Tables<'lotes'>, 'estado'> & { estado: EstadoLote }

export type TipoEventoLote =
  | 'alta_inicial' | 'paricion' | 'compra' | 'venta' | 'mortandad'
  | 'recategorizacion' | 'division' | 'union' | 'ajuste' | 'destete'

export type LoteEvento = Omit<Tables<'lote_eventos'>, 'tipo'> & { tipo: TipoEventoLote }

// Vista v_stock_lote
export type StockLote = SinNulos<Tables<'v_stock_lote'>>

// Vista v_stock_establecimiento (solo lotes activos)
export type StockEstablecimiento = SinNulos<Tables<'v_stock_establecimiento'>>

// Composición inicial para crear_lote (type y no interface: tiene que ser asignable a Json)
export type ComposicionItem = {
  categoria_id: string
  cabezas: number
}

// Fila de linaje_lote: un lote relacionado (de dónde viene o en qué terminó)
export type RelacionLinaje = 'ancestro' | 'descendiente'

export type FilaLinaje = {
  lote_id: string
  nombre: string
  estado: EstadoLote
  relacion: RelacionLinaje
  nivel: number            // 1 = directo, 2 = abuelo o nieto...
  operacion_id: string
  tipo: 'division' | 'union'
  fecha: string
}

// Cierres y reaperturas de un lote
export type CambioEstadoLote = Omit<Tables<'lote_cambios_estado'>, 'tipo'> & { tipo: 'cierre' | 'reapertura' }
