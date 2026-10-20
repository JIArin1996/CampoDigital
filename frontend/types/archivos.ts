// Tipos de archivos del lote, derivados de types/supabase.ts.
//
// archivos: un registro por objeto de Storage (inmutable). lote_archivos: el vínculo lote-archivo,
// que se oculta (quitar) y se vuelve a mostrar (restaurar); nunca se borra.

import type { Tables } from './supabase'

export type TipoArchivo = 'trazabilidad' | 'otro'

export type Archivo = Omit<Tables<'archivos'>, 'tipo'> & { tipo: TipoArchivo }

// Archivo de un lote: el vínculo (quitado, heredado de otro lote) con los datos del archivo
export type ArchivoDeLote = Tables<'lote_archivos'> & { archivo: Archivo }

// Archivo elegido en el teléfono o la computadora, todavía sin subir.
// El id se genera una sola vez: un reintento sube y adjunta con el mismo id (la base es idempotente).
export interface ArchivoPorSubir {
  id: string
  file: File
  tipo: TipoArchivo
}
