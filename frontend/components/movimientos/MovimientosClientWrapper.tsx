"use client"

import { useState, useEffect, useCallback } from "react"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getMovimientos, calcularStock } from "@/lib/queries/movimientos"
import { getPotreros } from "@/lib/queries/potreros"
import { getParcelasEstablecimiento } from "@/lib/queries/parcelas"
import { Button } from "@/components/ui/button"
import { Plus, FilterX } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { MovimientoForm } from "@/components/forms/MovimientoForm"
import { StockSummary } from "./StockSummary"
import { MovimientosTable } from "./MovimientosTable"
import type { MovimientoGanado, Potrero, Parcela } from "@/types/database"

export function MovimientosClientWrapper() {
  const { establecimientoActivo } = useEstablecimiento()
  const establishmentId = establecimientoActivo?.id ?? 0

  const [movimientos, setMovimientos] = useState<MovimientoGanado[]>([])
  const [potreros, setPotreros] = useState<Potrero[]>([])
  const [parcelas, setParcelas] = useState<any[]>([])
  const [cargando, setCargando] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const cargarDatos = useCallback(async () => {
    if (!establishmentId) return
    
    setCargando(true)
    try {
      const [movs, pots, pars] = await Promise.all([
        getMovimientos(establishmentId),
        getPotreros(establishmentId),
        getParcelasEstablecimiento(establishmentId)
      ])
      setMovimientos(movs)
      setPotreros(pots as Potrero[])
      setParcelas(pars)
    } catch (error) {
      console.error("Error cargando datos de movimientos:", error)
    } finally {
      setCargando(false)
    }
  }, [establishmentId])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const stock = calcularStock(movimientos)

  return (
    <div className="space-y-8">
      {/* Botón Acción Principal */}
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar Movimiento
        </Button>
      </div>

      {/* Resumen de Stock */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Estado del Rodeo</h2>
        <StockSummary stock={stock} potreros={potreros} parcelas={parcelas} />
      </div>

      {/* Historial de Movimientos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Historial de Movimientos</h2>
          {movimientos.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Mostrando últimos {movimientos.length} registros
            </p>
          )}
        </div>
        <MovimientosTable 
          movimientos={movimientos} 
          potreros={potreros} 
          parcelas={parcelas} 
          cargando={cargando} 
        />
      </div>

      {/* Modal de Formulario */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Nuevo Movimiento Ganadero</DialogTitle>
            <DialogDescription>
              Registrá una compra, venta, traslado o ajuste de stock.
            </DialogDescription>
          </DialogHeader>
          {establishmentId && (
            <MovimientoForm
              establecimiento_id={establishmentId}
              potreros={potreros}
              parcelas={parcelas}
              onSuccess={() => {
                setModalOpen(false)
                cargarDatos()
              }}
              onCancel={() => setModalOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
