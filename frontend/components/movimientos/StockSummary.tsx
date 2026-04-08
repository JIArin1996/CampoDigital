"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { StockEntry } from "@/lib/queries/movimientos"
import type { Potrero, Parcela } from "@/types/database"
import { Package, MapPin } from "lucide-react"

interface StockSummaryProps {
  stock: StockEntry[]
  potreros: Potrero[]
  parcelas: Parcela[]
}

export function StockSummary({ stock, potreros, parcelas }: StockSummaryProps) {
  // Agrupar por categoría
  const porCategoria = stock.reduce((acc, curr) => {
    acc[curr.categoria] = (acc[curr.categoria] || 0) + curr.cantidad
    return acc
  }, {} as Record<string, number>)

  // Agrupar por ubicación
  const porUbicacion = stock.reduce((acc, curr) => {
    const key = `${curr.ubicacion_tipo}-${curr.ubicacion_id}`
    acc[key] = (acc[key] || 0) + curr.cantidad
    return acc
  }, {} as Record<string, number>)

  const totalAnimales = stock.reduce((sum, s) => sum + s.cantidad, 0)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Tarjeta Total */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-primary">Total Stock</CardTitle>
          <Package className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">{totalAnimales}</div>
          <p className="text-xs text-muted-foreground mt-1">Cabezas totales en establecimiento</p>
        </CardContent>
      </Card>

      {/* Por Categoría */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Por Categoría</CardTitle>
          <Badge variant="outline">{Object.keys(porCategoria).length}</Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(porCategoria).map(([cat, qty]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{cat}</span>
                <span className="font-semibold">{qty}</span>
              </div>
            ))}
            {Object.keys(porCategoria).length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-2">Sin stock registrado</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Por Ubicación */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Por Ubicación</CardTitle>
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
            {Object.entries(porUbicacion).map(([key, qty]) => {
              const [tipo, id] = key.split("-")
              const nombre = tipo === "potrero" 
                ? potreros.find(p => p.id === Number(id))?.nombre 
                : parcelas.find(p => p.id === Number(id))?.nombre
              
              return (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[150px]">
                    {nombre || "Desconocido"} {tipo === "parcela" ? "(P)" : ""}
                  </span>
                  <span className="font-semibold">{qty}</span>
                </div>
              )
            })}
            {Object.keys(porUbicacion).length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-2">Sin stock registrado</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
