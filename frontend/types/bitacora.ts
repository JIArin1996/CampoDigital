// Tipos de la bitácora, derivados de types/supabase.ts (generado desde la base).
// Se angostan las columnas restringidas con un check (tipo, estado_idea, estado_tarea).

import type { Tables } from './supabase'

export type TipoEntrada = 'decision' | 'idea' | 'observacion' | 'compra_venta_gasto' | 'tarea'
export type EstadoIdea = 'abierta' | 'decidida' | 'descartada'
export type EstadoTarea = 'pendiente' | 'hecha' | 'cancelada'

export type EntradaBitacora = Omit<Tables<'bitacora_entradas'>, 'tipo' | 'estado_idea' | 'estado_tarea'> & {
  tipo: TipoEntrada
  estado_idea: EstadoIdea | null
  estado_tarea: EstadoTarea | null
}

export type BitacoraLote = Tables<'bitacora_lotes'>

// Entrada con los ids de sus lotes etiquetados y el vínculo nota ↔ tarea:
// tarea: la tarea que salió de esta nota (de una repetida, la más nueva); origen: la nota de la que salió esta tarea
export type EntradaConLotes = EntradaBitacora & {
  lotes: string[]
  tarea: { id: string; texto: string; vencimiento: string; estado: EstadoTarea } | null
  origen: { id: string; tipo: TipoEntrada; texto: string } | null
}

// Una fila del calendario: una tarea de la bitácora o la próxima dosis de una sanidad
export type OrigenCalendario = 'tarea' | 'dosis'
export type FilaCalendario = {
  origen: OrigenCalendario
  entrada_id: string | null       // tareas
  actividad_id: string | null     // dosis
  orden: number | null            // dosis: el producto dentro de la sanidad
  fecha: string
  texto: string
  persona_id: string | null
  estado: EstadoTarea
  repetir_cada_dias: number | null
  lotes: string[]
  hecha_en: string | null
}
