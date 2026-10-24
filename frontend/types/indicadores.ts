// Indicadores reproductivos (vistas v_indicadores_reproductivos y v_indicadores_aportes).
// El generador marca nullable toda columna de vista: se sacan los null de las que nunca lo son.
// temporada sí puede ser null: "sin servicio registrado". Los % son null sin entoradas.

import type { Tables } from './supabase'

type Fila = Tables<'v_indicadores_reproductivos'>
type Aporte = Tables<'v_indicadores_aportes'>

export type Indicadores = { [K in keyof Fila]: K extends 'temporada' | 'pct_prenez' | 'pct_paricion' | 'pct_destete' ? Fila[K] : NonNullable<Fila[K]> }

export type TipoAporte = 'servicio' | 'diagnostico_gestacion' | 'paricion' | 'destete'

export type AporteIndicador = Omit<{ [K in keyof Aporte]: K extends 'temporada' ? Aporte[K] : NonNullable<Aporte[K]> }, 'tipo'> & { tipo: TipoAporte }
