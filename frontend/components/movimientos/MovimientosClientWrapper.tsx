"use client"

import { useState, useEffect, useCallback } from "react"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getMovimientos } from "@/lib/queries/movimientos"
import { getDicosePropiedad } from "@/lib/queries/dicose_propiedad"
import { getPotreros } from "@/lib/queries/potreros"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { MovimientoForm } from "@/components/forms/MovimientoForm"
import { MovimientosTable } from "./MovimientosTable"
import type { MovimientoGanado, Potrero } from "@/types/database"
import type { DicosePropiedad } from "@/lib/queries/dicose_propiedad"

export function MovimientosClientWrapper() {
  const { establecimientoActivo } = useEstablecimiento()
  const establecimientoId = establecimientoActivo?.id ?? 0

  const [movimientos, setMovimientos] = useState<MovimientoGanado[]>([])
  const [dicoseList, setDicoseList] = useState<DicosePropiedad[]>([])
  const [potreros, setPotreros] = useState<Potrero[]>([])
  const [cargando, setCargando] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const cargarDatos = useCallback(async () => {
    if (!establecimientoId) return

    setCargando(true)
    try {
      const [movs, dicose, pots] = await Promise.all([
        getMovimientos(establecimientoId),
        getDicosePropiedad(establecimientoId),
        getPotreros(establecimientoId),
      ])
      setMovimientos(movs)
      setDicoseList(dicose)
      setPotreros(pots as Potrero[])
    } catch (error) {
      console.error("Error cargando movimientos:", error)
    } finally {
      setCargando(false)
    }
  }, [establecimientoId])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  return (
    <div className="space-y-6">

      {/* Acción principal */}
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar Movimiento
        </Button>
      </div>

      {/* Historial */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Historial de Movimientos</h2>
          {movimientos.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {movimientos.length} registros
            </p>
          )}
        </div>
        <MovimientosTable
          movimientos={movimientos}
          dicoseList={dicoseList}
          cargando={cargando}
        />
      </div>

      {/* Modal de registro */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Movimiento</DialogTitle>
            <DialogDescription>
              Ingresá los datos del movimiento ganadero.
            </DialogDescription>
          </DialogHeader>
          {establecimientoActivo && establecimientoId > 0 && (
            <MovimientoForm
              establecimiento_id={establecimientoId}
              establecimiento={establecimientoActivo}
              dicoseList={dicoseList}
              potreros={potreros}
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
