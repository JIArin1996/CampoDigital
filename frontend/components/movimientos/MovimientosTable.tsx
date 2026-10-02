"use client"

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { MovimientoGanado, TipoMovimiento, SubtipoMovimiento } from "@/types/database"
import type { DicosePropiedad } from "@/lib/queries/dicose_propiedad"
import { format } from "date-fns"
import { es } from "date-fns/locale"

// ── Estilos y etiquetas por tipo ──────────────────────────────────────────────

const TIPO_COLOR: Record<TipoMovimiento, string> = {
  Ingreso:    "bg-green-100 text-green-800 border-green-200",
  Egreso:     "bg-red-100 text-red-800 border-red-200",
  Traslado:   "bg-blue-100 text-blue-800 border-blue-200",
  Afectacion: "bg-amber-100 text-amber-800 border-amber-200",
}

const TIPO_LABEL: Record<TipoMovimiento, string> = {
  Ingreso:    "Ingreso",
  Egreso:     "Egreso",
  Traslado:   "Traslado",
  Afectacion: "Afectación",
}

const SUBTIPO_LABEL: Partial<Record<SubtipoMovimiento, string>> = {
  "Nacimiento":                           "Nacimiento",
  "Compra":                               "Compra",
  "Venta a Productor":                    "Venta a Productor",
  "Venta a Frigorifico":                  "Venta a Frigorífico",
  "Venta en Consignacion":                "Venta en Consignación",
  "Muerte":                               "Muerte",
  "Traslado entre Establecimientos":      "Traslado entre Est.",
  "Cambio de Potrero":                    "Cambio de Potrero",
  "Afectacion a Fideicomiso":             "Afect. a Fideicomiso",
  "Afectacion a Capitalizacion":          "Afect. a Capitalización",
  "Afectacion a Consignacion sin Movimiento": "Afect. Consignación",
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MovimientosTableProps {
  movimientos: MovimientoGanado[]
  dicoseList: DicosePropiedad[]
  cargando?: boolean
}

// ── Componente ────────────────────────────────────────────────────────────────

export function MovimientosTable({ movimientos, dicoseList, cargando }: MovimientosTableProps) {

  const getNombreDicose = (id: number | null): string => {
    if (!id) return "—"
    const d = dicoseList.find(d => d.id === id)
    return d ? `${d.codigo} — ${d.titular}` : `ID ${id}`
  }

  if (cargando) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
        Cargando movimientos...
      </div>
    )
  }

  if (movimientos.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
        No hay movimientos registrados todavía.
      </div>
    )
  }

  // Agrupar por lote_movimiento_id para mostrar una fila por evento
  // (si hay múltiples filas del mismo lote, mostrar solo la primera con la cantidad del lote)
  const lotesVistos = new Set<number>()
  const filas = movimientos.filter(m => {
    if (!m.lote_movimiento_id) return true // sin lote: mostrar siempre
    if (lotesVistos.has(m.lote_movimiento_id)) return false
    lotesVistos.add(m.lote_movimiento_id)
    return true
  })

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[88px]">Fecha</TableHead>
              <TableHead className="w-[90px]">Tipo</TableHead>
              <TableHead>Subtipo</TableHead>
              <TableHead className="w-[110px]">Guía</TableHead>
              <TableHead className="w-[110px]">Autorización</TableHead>
              <TableHead className="w-[60px] text-right">Cant.</TableHead>
              <TableHead>DICOSE Propiedad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(m => (
              <TableRow key={m.id} className="hover:bg-muted/40 transition-colors">

                {/* Fecha */}
                <TableCell className="font-medium text-sm whitespace-nowrap">
                  {format(new Date(m.fecha + "T12:00:00"), "dd MMM yyyy", { locale: es })}
                </TableCell>

                {/* Tipo — badge con color */}
                <TableCell>
                  <Badge variant="outline" className={TIPO_COLOR[m.tipo_movimiento]}>
                    {TIPO_LABEL[m.tipo_movimiento]}
                  </Badge>
                </TableCell>

                {/* Subtipo */}
                <TableCell className="text-sm text-muted-foreground">
                  {m.subtipo ? (SUBTIPO_LABEL[m.subtipo] ?? m.subtipo) : "—"}
                </TableCell>

                {/* Serie / Nro. de Guía */}
                <TableCell className="text-sm text-muted-foreground font-mono">
                  {m.serie_guia ?? "—"}
                </TableCell>

                {/* Nro. de Autorización */}
                <TableCell className="text-sm text-muted-foreground font-mono">
                  {m.numero_autorizacion ?? "—"}
                </TableCell>

                {/* Cantidad de caravanas */}
                <TableCell className="text-sm text-right font-medium">
                  {m.cantidad ?? "—"}
                </TableCell>

                {/* DICOSE Propiedad */}
                <TableCell className="text-sm text-muted-foreground">
                  {getNombreDicose(m.dicose_propiedad_id)}
                </TableCell>

              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
