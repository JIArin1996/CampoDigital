"use client"

import { useState, useEffect, useCallback } from "react"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getMovimientos, getStockActual, getCaravanasActivas, type StockDesdeAnimales } from "@/lib/queries/movimientos"
import { getPotreros } from "@/lib/queries/potreros"
import { getParcelasEstablecimiento } from "@/lib/queries/parcelas"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { StockSummary } from "./StockSummary"
import { MovimientosTable } from "./MovimientosTable"
import { ModalNacimiento } from "./modales/ModalNacimiento"
import { ModalCompra } from "./modales/ModalCompra"
import { ModalVenta } from "./modales/ModalVenta"
import { ModalTraslado } from "./modales/ModalTraslado"
import { ModalCambioPotrero } from "./modales/ModalCambioPotrero"
import { ModalAfectacion } from "./modales/ModalAfectacion"
import type { MovimientoGanado, Potrero, Parcela, SubtipoMovimiento } from "@/types/database"

// ── Definición de tipos de movimiento para el selector ───────────────────────

interface GrupoMovimiento {
  grupo: string
  items: { subtipo: SubtipoMovimiento; label: string }[]
}

const GRUPOS: GrupoMovimiento[] = [
  {
    grupo: 'Ingresos',
    items: [
      { subtipo: 'Nacimiento', label: 'Nacimiento' },
      { subtipo: 'Compra', label: 'Compra' },
    ],
  },
  {
    grupo: 'Egresos',
    items: [
      { subtipo: 'Venta a Productor', label: 'Venta a Productor' },
      { subtipo: 'Venta a Frigorífico', label: 'Venta a Frigorífico' },
      { subtipo: 'Venta en Consignación', label: 'Venta en Consignación' },
    ],
  },
  {
    grupo: 'Traslados',
    items: [
      { subtipo: 'Traslado entre Establecimientos', label: 'Traslado entre Establecimientos' },
      { subtipo: 'Cambio de Potrero', label: 'Cambio de Potrero' },
    ],
  },
  {
    grupo: 'Afectaciones',
    items: [
      { subtipo: 'Afectación a Fideicomiso', label: 'Afectación a Fideicomiso' },
      { subtipo: 'Afectación a Capitalización', label: 'Afectación a Capitalización' },
      { subtipo: 'Afectación a Consignación sin Movimiento', label: 'Afectación a Consignación s/Movimiento' },
    ],
  },
]

// ── Wrapper ───────────────────────────────────────────────────────────────────

export function MovimientosClientWrapper() {
  const { establecimientoActivo } = useEstablecimiento()
  const establecimiento = establecimientoActivo!

  const [movimientos, setMovimientos] = useState<MovimientoGanado[]>([])
  const [potreros, setPotreros] = useState<Potrero[]>([])
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [caravanasActivas, setCaravanasActivas] = useState<string[]>([])
  const [stock, setStock] = useState<StockDesdeAnimales>({ total: 0, porCategoria: [], porPotrero: [] })
  const [cargando, setCargando] = useState(false)

  // Control de modales
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [subtipoActivo, setSubtipoActivo] = useState<SubtipoMovimiento | null>(null)

  const cargarDatos = useCallback(async () => {
    if (!establecimiento?.id) return
    setCargando(true)
    try {
      const [movs, pots, pars, caravanas, stockActual] = await Promise.all([
        getMovimientos(establecimiento.id),
        getPotreros(establecimiento.id),
        getParcelasEstablecimiento(establecimiento.id),
        getCaravanasActivas(establecimiento.id),
        getStockActual(establecimiento.id),
      ])
      setMovimientos(movs)
      setPotreros(pots as Potrero[])
      setParcelas(pars as Parcela[])
      setCaravanasActivas(caravanas)
      setStock(stockActual)
    } catch (error) {
      console.error('Error cargando datos de movimientos:', error)
    } finally {
      setCargando(false)
    }
  }, [establecimiento?.id])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const seleccionarTipo = (subtipo: SubtipoMovimiento) => {
    setSelectorOpen(false)
    setSubtipoActivo(subtipo)
  }

  const cerrarModal = () => setSubtipoActivo(null)

  const onSuccess = () => {
    cerrarModal()
    cargarDatos()
  }

  const renderModal = () => {
    if (!subtipoActivo) return null

    switch (subtipoActivo) {
      case 'Nacimiento':
        return (
          <ModalNacimiento
            establecimiento={establecimiento}
            potreros={potreros}
            onSuccess={onSuccess}
            onCancel={cerrarModal}
          />
        )
      case 'Compra':
        return (
          <ModalCompra
            establecimiento={establecimiento}
            potreros={potreros}
            onSuccess={onSuccess}
            onCancel={cerrarModal}
          />
        )
      case 'Venta a Productor':
      case 'Venta a Frigorífico':
      case 'Venta en Consignación':
        return (
          <ModalVenta
            establecimiento={establecimiento}
            subtipo={subtipoActivo}
            caravanasActivas={caravanasActivas}
            onSuccess={onSuccess}
            onCancel={cerrarModal}
          />
        )
      case 'Traslado entre Establecimientos':
        return (
          <ModalTraslado
            establecimiento={establecimiento}
            caravanasActivas={caravanasActivas}
            onSuccess={onSuccess}
            onCancel={cerrarModal}
          />
        )
      case 'Cambio de Potrero':
        return (
          <ModalCambioPotrero
            establecimiento={establecimiento}
            potreros={potreros}
            caravanasActivas={caravanasActivas}
            onSuccess={onSuccess}
            onCancel={cerrarModal}
          />
        )
      case 'Afectación a Fideicomiso':
      case 'Afectación a Capitalización':
      case 'Afectación a Consignación sin Movimiento':
        return (
          <ModalAfectacion
            establecimiento={establecimiento}
            subtipo={subtipoActivo}
            caravanasActivas={caravanasActivas}
            onSuccess={onSuccess}
            onCancel={cerrarModal}
          />
        )
    }
  }

  return (
    <div className="space-y-8">
      {/* Botón principal */}
      <div className="flex justify-end">
        <Button onClick={() => setSelectorOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar Movimiento
        </Button>
      </div>

      {/* Resumen de Stock */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Estado del Rodeo</h2>
        <StockSummary stock={stock} />
      </div>

      {/* Historial */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Historial de Movimientos</h2>
          {movimientos.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Últimos {movimientos.length} registros
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

      {/* Selector de tipo de movimiento */}
      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>¿Qué movimiento querés registrar?</DialogTitle>
            <DialogDescription>
              Seleccioná el tipo de movimiento ganadero.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {GRUPOS.map(({ grupo, items }) => (
              <div key={grupo}>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  {grupo}
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {items.map(({ subtipo, label }) => (
                    <Button
                      key={subtipo}
                      variant="outline"
                      className="w-full justify-start text-sm"
                      onClick={() => seleccionarTipo(subtipo)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal del movimiento seleccionado */}
      <Dialog open={!!subtipoActivo} onOpenChange={open => !open && cerrarModal()}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{subtipoActivo}</DialogTitle>
            <DialogDescription>
              {establecimiento.nombre} — {establecimiento.dicose_fisico ?? 'Sin DICOSE'}
            </DialogDescription>
          </DialogHeader>
          {renderModal()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
