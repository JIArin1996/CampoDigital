"use client"

import { cn } from "@/lib/utils"

export interface Columna<T> {
  clave: string
  titulo: React.ReactNode
  celda: (fila: T) => React.ReactNode
  derecha?: boolean            // números: alineados a la derecha
  ancho?: string               // clase de ancho (ej. "w-28")
}

/**
 * Lista que en la computadora es una tabla (columnas) y en el celular una tarjeta por fila (`tarjeta`).
 * Toda la fila se toca (`onTocar`): en el celular con un área de al menos 44 px.
 */
export function TablaResponsiva<T>({ filas, columnas, clave, tarjeta, onTocar, atenuada, vacio }: {
  filas: T[]
  columnas: Columna<T>[]
  clave: (fila: T) => string
  tarjeta: (fila: T) => React.ReactNode
  onTocar?: (fila: T) => void
  atenuada?: (fila: T) => boolean    // por ejemplo, un movimiento anulado
  vacio?: React.ReactNode
}) {
  if (filas.length === 0) return <>{vacio}</>
  return (
    <>
      {/* Computadora: tabla */}
      <div className="hidden md:block overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              {columnas.map(c => (
                <th key={c.clave} scope="col" className={cn("px-3 py-2 font-medium", c.derecha && "text-right", c.ancho)}>{c.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filas.map(f => (
              <tr key={clave(f)} onClick={onTocar ? () => onTocar(f) : undefined}
                className={cn(onTocar && "cursor-pointer hover:bg-muted/40", atenuada?.(f) && "opacity-60")}>
                {columnas.map(c => (
                  <td key={c.clave} className={cn("px-3 py-2 align-top", c.derecha && "text-right tabular-nums", c.ancho)}>{c.celda(f)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: tarjetas */}
      <ul className="md:hidden divide-y rounded-lg border bg-card">
        {filas.map(f => (
          <li key={clave(f)} className={cn(atenuada?.(f) && "opacity-60")}>
            {onTocar ? (
              <button type="button" onClick={() => onTocar(f)} className="block min-h-11 w-full px-4 py-3 text-left active:bg-muted/50">
                {tarjeta(f)}
              </button>
            ) : (
              <div className="px-4 py-3">{tarjeta(f)}</div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
