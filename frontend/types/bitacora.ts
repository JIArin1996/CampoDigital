// Tipos de la bitácora, derivados de types/supabase.ts (generado desde la base).
// Se angostan las columnas restringidas con un check (tipo, estado_idea).

import type { Tables } from './supabase'

export type TipoEntrada = 'decision' | 'idea' | 'observacion' | 'compra_venta_gasto'
export type EstadoIdea = 'abierta' | 'decidida' | 'descartada'

export type EntradaBitacora = Omit<Tables<'bitacora_entradas'>, 'tipo' | 'estado_idea'> & {
  tipo: TipoEntrada
  estado_idea: EstadoIdea | null
}

export type BitacoraLote = Tables<'bitacora_lotes'>

// Entrada con los ids de sus lotes etiquetados
export type EntradaConLotes = EntradaBitacora & { lotes: string[] }
