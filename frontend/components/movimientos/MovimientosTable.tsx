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
import type { MovimientoGanado, Potrero, Parcela } from "@/types/database"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { ArrowUpRight, ArrowDownLeft, MoveHorizontal, AlertTriangle, Plus, Minus } from "lucide-react"

interface MovimientosTableProps {
  movimientos: MovimientoGanado[]
  potreros: Potrero[]
  parcelas: Parcela[]
  cargando?: boolean
}

export function MovimientosTable({ movimientos, potreros, parcelas, cargando }: MovimientosTableProps) {
  const getNombreUbicacion = (tipo: string | null, id: number | null) => {
    if (!tipo || !id) return "—"
    if (tipo === "potrero") {
      return potreros.find(p => p.id === id)?.nombre || `Potrero ${id}`
    }
    return parcelas.find(p => p.id === id)?.nombre || `Parcela ${id}`
  }

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case "Compra": return <ArrowDownLeft className="h-4 w-4 text-green-600" />
      case "Venta": return <ArrowUpRight className="h-4 w-4 text-orange-600" />
      case "Nacimiento": return <Plus className="h-4 w-4 text-blue-600" />
      case "Muerte": return <Minus className="h-4 w-4 text-destructive" />
      case "Traslado": return <MoveHorizontal className="h-4 w-4 text-primary" />
      case "Ajuste": return <AlertTriangle className="h-4 w-4 text-amber-600" />
      default: return null
    }
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case "Compra": return "bg-green-100 text-green-800 border-green-200"
      case "Venta": return "bg-orange-100 text-orange-800 border-orange-200"
      case "Nacimiento": return "bg-blue-100 text-blue-800 border-blue-200"
      case "Muerte": return "bg-red-100 text-red-800 border-red-200"
      case "Traslado": return "bg-primary/10 text-primary border-primary/20"
      case "Ajuste": return "bg-amber-100 text-amber-800 border-amber-200"
      default: return ""
    }
  }

  if (cargando) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-muted-foreground">
        Cargando movimientos...
      </div>
    )
  }

  if (movimientos.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-card p-12 text-center text-muted-foreground">
        No se encontraron movimientos registrados.
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[100px]">Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead className="text-right">Precio Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimientos.map((m) => (
              <TableRow key={m.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="font-medium">
                  {format(new Date(m.fecha + "T12:00:00"), "dd MMM", { locale: es })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getTipoColor(m.tipo_movimiento)}>
                      {getTipoIcon(m.tipo_movimiento)}
                      <span className="ml-1.5">{m.tipo_movimiento}</span>
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>{m.categoria}</TableCell>
                <TableCell className="text-right font-semibold">{m.cantidad}</TableCell>
                <TableCell className="text-sm">
                  {m.origen_id ? (
                    <span className="text-muted-foreground">
                      {getNombreUbicacion(m.origen_tipo, m.origen_id)}
                      {m.origen_tipo === "parcela" && " (P)"}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {m.destino_id ? (
                    <span className="text-muted-foreground">
                      {getNombreUbicacion(m.destino_tipo, m.destino_id)}
                      {m.destino_tipo === "parcela" && " (P)"}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {m.precio_total ? (
                    <span className="text-sm font-medium">
                      USD {m.precio_total.toLocaleString()}
                    </span>
                  ) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
