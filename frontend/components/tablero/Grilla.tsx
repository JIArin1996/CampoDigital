"use client"

import type { ReactNode } from "react"
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"

import type { TarjetaTablero } from "@/types/tablero"

const ALTO_FILA = 40     // px de cada fila de la grilla
const MARGEN = 14

/**
 * Grilla del tablero. En la computadora: 12 columnas (react-grid-layout); en modo edición las tarjetas se arrastran
 * desde la manija y se les cambia el tamaño desde la esquina. En el celular: una columna, en el orden de la grilla
 * (de arriba a abajo y de izquierda a derecha), solo para ver.
 */
export function Grilla({ tarjetas, grande, edicion, onMover, render }: {
  tarjetas: TarjetaTablero[]
  grande: boolean                              // pantalla de computadora (≥ 1024 px)
  edicion: boolean
  onMover: (cambios: Map<string, { x: number; y: number; w: number; h: number }>) => void
  render: (t: TarjetaTablero) => ReactNode
}) {
  const { width, containerRef, mounted } = useContainerWidth()

  if (!grande) {
    const enOrden = [...tarjetas].sort((a, b) => a.y - b.y || a.x - b.x)
    return (
      <div className="flex flex-col gap-3">
        {enOrden.map(t => (
          // Alto según la tarjeta: los números chicos, los gráficos más altos
          <div key={t.id} style={{ height: t.definicion.grafico === "numero" ? 120 : Math.max(260, t.h * 40) }}>
            {render(t)}
          </div>
        ))}
      </div>
    )
  }

  const layout: Layout = tarjetas.map(t => ({ i: t.id, x: t.x, y: t.y, w: t.w, h: t.h, minW: 2, minH: 2 }))

  return (
    <div ref={containerRef}>
      {mounted && (
        <ReactGridLayout
          layout={layout}
          width={width}
          gridConfig={{ cols: 12, rowHeight: ALTO_FILA, margin: [MARGEN, MARGEN], containerPadding: [0, 0] }}
          dragConfig={{ enabled: edicion, handle: ".tablero-manija" }}
          resizeConfig={{ enabled: edicion }}
          onLayoutChange={nuevo => {
            if (!edicion) return
            onMover(new Map(nuevo.map(l => [l.i, { x: l.x, y: l.y, w: l.w, h: l.h }])))
          }}
        >
          {tarjetas.map(t => <div key={t.id}>{render(t)}</div>)}
        </ReactGridLayout>
      )}
    </div>
  )
}
