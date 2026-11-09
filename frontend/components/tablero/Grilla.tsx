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
export function Grilla({ tarjetas, grande, edicion, onMover, render, impresion }: {
  tarjetas: TarjetaTablero[]
  grande: boolean                              // pantalla de computadora (≥ 1024 px)
  edicion: boolean
  onMover: (cambios: Map<string, { x: number; y: number; w: number; h: number }>) => void
  render: (t: TarjetaTablero) => ReactNode
  impresion?: number                           // al imprimir: el ancho de la hoja en px
}) {
  const { width, containerRef, mounted } = useContainerWidth()

  if (impresion) return <GrillaImpresion tarjetas={tarjetas} ancho={impresion} render={render} />

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

/**
 * La grilla para imprimir: la misma disposición (12 columnas) con el ancho de la hoja, partida en franjas. Una franja
 * es un grupo de tarjetas que se superponen en altura; entre franjas puede haber salto de hoja, dentro de una no
 * (así ningún gráfico queda cortado en dos hojas).
 */
function GrillaImpresion({ tarjetas, ancho, render }: {
  tarjetas: TarjetaTablero[]
  ancho: number
  render: (t: TarjetaTablero) => ReactNode
}) {
  const enOrden = [...tarjetas].sort((a, b) => a.y - b.y || a.x - b.x)
  const franjas: { desde: number; hasta: number; tarjetas: TarjetaTablero[] }[] = []
  for (const t of enOrden) {
    const ultima = franjas[franjas.length - 1]
    if (ultima && t.y < ultima.hasta) {
      ultima.tarjetas.push(t)
      ultima.hasta = Math.max(ultima.hasta, t.y + t.h)
    } else {
      franjas.push({ desde: t.y, hasta: t.y + t.h, tarjetas: [t] })
    }
  }
  const col = (ancho - 11 * MARGEN) / 12
  const largo = (n: number, paso: number) => n * paso + (n - 1) * MARGEN

  return (
    <div style={{ width: ancho }}>
      {franjas.map(f => (
        <div key={f.tarjetas[0].id} className="relative break-inside-avoid"
          style={{ height: largo(f.hasta - f.desde, ALTO_FILA), marginBottom: MARGEN }}>
          {f.tarjetas.map(t => (
            <div key={t.id} className="absolute"
              style={{ left: t.x * (col + MARGEN), top: (t.y - f.desde) * (ALTO_FILA + MARGEN), width: largo(t.w, col), height: largo(t.h, ALTO_FILA) }}>
              {render(t)}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
