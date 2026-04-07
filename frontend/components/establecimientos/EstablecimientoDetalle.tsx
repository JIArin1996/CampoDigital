"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, MapPin, Ruler, TreePine, Droplets } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PotreroForm } from "@/components/forms/PotreroForm"
import type { Establecimiento, Potrero } from "@/types/database"

interface EstablecimientoDetalleProps {
  establecimiento: Establecimiento
  potreros: Potrero[]
}

// Colores por uso actual del potrero
const badgeUso: Record<string, string> = {
  "Ganadería": "bg-green-100 text-green-800",
  "Agricultura": "bg-yellow-100 text-yellow-800",
  "Mixto": "bg-blue-100 text-blue-800",
  "Reserva": "bg-purple-100 text-purple-800",
  "Sin uso": "bg-gray-100 text-gray-600",
}

export function EstablecimientoDetalle({
  establecimiento,
  potreros,
}: EstablecimientoDetalleProps) {
  const router = useRouter()
  const [dialogAbierto, setDialogAbierto] = useState(false)

  // Calcula la superficie total ocupada por potreros
  const superficieOcupada = potreros.reduce((sum, p) => sum + p.superficie, 0)

  const handlePotreroCreado = () => {
    setDialogAbierto(false)
    // Recarga los datos del Server Component
    router.refresh()
  }

  return (
    <div className="space-y-6">

      {/* Tarjeta de información del establecimiento */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{establecimiento.nombre}</CardTitle>
            <Badge variant="outline">{establecimiento.tipo}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Departamento</dt>
              <dd className="font-medium">{establecimiento.departamento}</dd>
            </div>
            {establecimiento.localidad && (
              <div>
                <dt className="text-muted-foreground">Localidad</dt>
                <dd className="font-medium">{establecimiento.localidad}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Superficie total</dt>
              <dd className="font-medium">{establecimiento.superficie_total} ha</dd>
            </div>
            {establecimiento.propietario && (
              <div>
                <dt className="text-muted-foreground">Propietario</dt>
                <dd className="font-medium">{establecimiento.propietario}</dd>
              </div>
            )}
            {establecimiento.dicose && (
              <div>
                <dt className="text-muted-foreground">DICOSE</dt>
                <dd className="font-medium font-mono">{establecimiento.dicose}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Fecha de alta</dt>
              <dd className="font-medium">
                {new Date(establecimiento.fecha_alta + "T00:00:00").toLocaleDateString("es-UY")}
              </dd>
            </div>
          </dl>
          {establecimiento.observaciones && (
            <p className="mt-3 text-sm text-muted-foreground border-t pt-3">
              {establecimiento.observaciones}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sección de potreros */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold">Potreros</h2>
            {potreros.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {superficieOcupada.toFixed(1)} ha mapeadas de {establecimiento.superficie_total} ha totales
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => setDialogAbierto(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>

        {potreros.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No hay potreros registrados todavía
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {potreros.map((potrero) => (
              <div
                key={potrero.id}
                className="flex items-center gap-3 rounded-lg border px-4 py-3 bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{potrero.nombre}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Ruler className="h-3 w-3" />
                      {potrero.superficie} ha
                    </span>
                    {potrero.tipo_pastura && (
                      <span className="flex items-center gap-1">
                        <TreePine className="h-3 w-3" />
                        {potrero.tipo_pastura}
                      </span>
                    )}
                    {potrero.aguada && (
                      <span className="flex items-center gap-1">
                        <Droplets className="h-3 w-3" />
                        Aguada
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    badgeUso[potrero.uso_actual] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {potrero.uso_actual}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog para agregar potrero */}
      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Potrero</DialogTitle>
          </DialogHeader>
          <PotreroForm
            establecimiento_id={establecimiento.id}
            onSuccess={handlePotreroCreado}
            onCancel={() => setDialogAbierto(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
