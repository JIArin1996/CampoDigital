// Tablero de Indicadores (diseño: contexto/DISENO-INDICADORES-TABLERO.md)

export type Fuente = 'stock' | 'reproductivos' | 'pesadas' | 'economia' | 'potreros'
export type Dimension = 'especie' | 'categoria' | 'lote' | 'motivo'
export type Tiempo = 'total' | 'mes' | 'ejercicio' | 'temporada'
export type Grafico = 'numero' | 'barras' | 'barras_horizontales' | 'lineas' | 'torta' | 'tabla'

// Lo que se guarda en tablero_tarjetas.definicion
export interface DefinicionTarjeta {
  fuente: Fuente
  medidas: string[]                 // una o varias (cada una es una serie), de la misma fuente y unidad
  abrir_por: Dimension | null
  tiempo: Tiempo
  grafico: Grafico
  // 'tablero' (o sin dato): el período de arriba. { ejercicios: n }: los últimos n ejercicios hasta el de arriba.
  periodo?: 'tablero' | { ejercicios: number }
}

export interface TarjetaTablero {
  id: string
  titulo: string
  definicion: DefinicionTarjeta
  x: number
  y: number
  w: number
  h: number
}

export interface PaginaTablero {
  id: string
  nombre: string
  tarjetas: TarjetaTablero[]
}

// Una fila de tablero_stock / tablero_reproductivos
export interface FilaTablero {
  periodo: string | null
  clave: string | null
  etiqueta: string | null
  valor: number | null
  numerador: number | null
  denominador: number | null
  avisos: Record<string, unknown> | null
}

// Filtros generales (arriba): ids vacíos = todos
export interface FiltrosTablero {
  periodo: string        // clave de periodos.ts: "ej-2025", "an-2026", "u12"
  especie: string
  categoria: string
  lote: string
}
