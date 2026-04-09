"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { MovimientoGanado, TipoMovimiento } from "@/types/database"
import type { DicosePropiedad } from "@/lib/queries/dicose_propiedad"
import { format } from "date-fns"
import { es } from "date-fns/locale"

// ── Estilos por tipo de movimiento ────────────────────────────────────────────

const TIPO_COLOR: Record<TipoMovimiento, string> = {
  Ingreso:         "bg-green-100 text-green-800 border-green-200",
  Egreso:          "bg-red-100 text-red-800 border-red-200",
  Traslado:        "bg-blue-100 text-blue-800 border-blue-200",
  Afectacion:      "bg-amber-100 text-amber-800 border-amber-200",
  Reclasificacion: "bg-purple-100 text-purple-800 border-purple-200",
}

const TIPO_LABEL: Record<TipoMovimiento, string> = {
  Ingreso:         "Ingreso",
  Egreso:          "Egreso",
  Traslado:        "Traslado",
  Afectacion:      "Afectación",
  Reclasificacion: "Reclasificación",
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MovimientosTableProps {
  movimientos: MovimientoGanado[]
  dicoseList: DicosePropiedad[]
  cargando?: boolean
}

// ── Componente ────────────────────────────────────────────────────────────────

export function MovimientosTable({ movimientos, dicoseList, cargando }: MovimientosTableProps) {

  // Resuelve el nombre del titular a partir del dicose_propiedad_id
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

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[90px]">Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Subtipo</TableHead>
              <TableHead>DICOSE Propiedad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimientos.map(m => (
              <TableRow key={m.id} className="hover:bg-muted/40 transition-colors">

                {/* Fecha */}
                <TableCell className="font-medium text-sm">
                  {format(new Date(m.fecha + "T12:00:00"), "dd MMM yyyy", { locale: es })}
                </TableCell>

                {/* Tipo — badge con color */}
                <TableCell>
                  <Badge
                    variant="outline"
                    className={TIPO_COLOR[m.tipo_movimiento]}
                  >
                    {TIPO_LABEL[m.tipo_movimiento]}
                  </Badge>
                </TableCell>

                {/* Subtipo */}
                <TableCell className="text-sm text-muted-foreground">
                  {m.subtipo ?? "—"}
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
