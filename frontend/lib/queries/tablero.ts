import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/types/supabase'
import type { DefinicionTarjeta, FilaTablero, PaginaTablero } from '@/types/tablero'

// El tablero guardado del establecimiento (páginas en orden, con sus tarjetas). null si nunca se guardó: la app
// muestra la plantilla.
export async function getTablero(establecimiento_id: string): Promise<PaginaTablero[] | null> {
  const supabase = createClient()
  const [paginas, tarjetas] = await Promise.all([
    supabase.from('tablero_paginas').select('*').eq('establecimiento_id', establecimiento_id).order('orden'),
    supabase.from('tablero_tarjetas').select('*').eq('establecimiento_id', establecimiento_id).order('y').order('x'),
  ])
  if (paginas.error) throw paginas.error
  if (tarjetas.error) throw tarjetas.error
  if ((paginas.data ?? []).length === 0) return null
  return paginas.data.map(p => ({
    id: p.id,
    nombre: p.nombre,
    tarjetas: (tarjetas.data ?? []).filter(t => t.pagina_id === p.id).map(t => ({
      id: t.id, titulo: t.titulo, definicion: t.definicion as unknown as DefinicionTarjeta, x: t.x, y: t.y, w: t.w, h: t.h,
    })),
  }))
}

// Guarda el tablero entero (solo administrador): reemplaza todas las páginas y tarjetas. [] vuelve a la plantilla.
export async function guardarTablero(establecimiento_id: string, paginas: PaginaTablero[]) {
  const { error } = await createClient().rpc('guardar_tablero', {
    p_establecimiento_id: establecimiento_id,
    p_paginas: paginas.map(p => ({
      nombre: p.nombre,
      tarjetas: p.tarjetas.map(t => ({ titulo: t.titulo, definicion: t.definicion, x: t.x, y: t.y, w: t.w, h: t.h })),
    })) as unknown as Json,
  })
  if (error) throw error
}

export interface ConsultaTablero {
  establecimiento_id: string
  definicion: DefinicionTarjeta
  medida: string
  desde: string
  hasta: string
  filtros: { especie_ids?: string[]; categoria_ids?: string[]; lote_ids?: string[] }
}

// Datos ya agregados de una medida (los calcula la base: tablero_stock, tablero_reproductivos...)
export async function getDatosTablero(c: ConsultaTablero): Promise<FilaTablero[]> {
  const funcion = c.definicion.fuente === 'stock' ? 'tablero_stock'
    : c.definicion.fuente === 'reproductivos' ? 'tablero_reproductivos'
    : c.definicion.fuente === 'pesadas' ? 'tablero_pesadas'
    : null
  if (!funcion) throw new Error('Esta fuente de datos todavía no está disponible')
  const { data, error } = await createClient().rpc(funcion, {
    p_establecimiento_id: c.establecimiento_id,
    p_medida: c.medida,
    p_abrir_por: c.definicion.abrir_por as string,   // null = sin abrir (el tipo generado no admite null)
    p_tiempo: c.definicion.tiempo,
    p_desde: c.desde,
    p_hasta: c.hasta,
    p_filtros: c.filtros as Json,
    p_opciones: (c.definicion.opciones ?? {}) as Json,
  })
  if (error) throw error
  return ((data ?? []) as unknown as FilaTablero[]).map(f => ({
    ...f,
    valor: f.valor === null ? null : Number(f.valor),
    numerador: f.numerador === null ? null : Number(f.numerador),
    denominador: f.denominador === null ? null : Number(f.denominador),
  }))
}
