"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { StockDesdeAnimales } from "@/lib/queries/movimientos"
import { Package, MapPin } from "lucide-react"

interface StockSummaryProps {
  stock: StockDesdeAnimales
}

export function StockSummary({ stock }: StockSummaryProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Total */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-primary">Total Stock</CardTitle>
          <Package className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">{stock.total}</div>
          <p className="text-xs text-muted-foreground mt-1">Cabezas activas en establecimiento</p>
        </CardContent>
      </Card>

      {/* Por Categoría */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Por Categoría</CardTitle>
          <Badge variant="outline">{stock.porCategoria.length}</Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stock.porCategoria.map(({ categoria, cantidad }) => (
              <div key={categoria} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{categoria}</span>
                <span className="font-semibold">{cantidad}</span>
              </div>
            ))}
            {stock.porCategoria.length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-2">Sin stock registrado</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Por Potrero */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Por Ubicación</CardTitle>
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
            {stock.porPotrero.map(({ nombre, cantidad }) => (
              <div key={nombre} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground truncate max-w-[150px]">{nombre}</span>
                <span className="font-semibold">{cantidad}</span>
              </div>
            ))}
            {stock.porPotrero.length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-2">Sin stock registrado</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
