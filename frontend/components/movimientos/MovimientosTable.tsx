"use client"

import { useState } from "react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { MovimientoGanado, Potrero, Parcela } from "@/types/database"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  ArrowUpRight, ArrowDownLeft, MoveHorizontal, Plus, Minus, RefreshCw, Info,
} from "lucide-react"

interface MovimientosTableProps {
  movimientos: MovimientoGanado[]
  potreros: Potrero[]
  parcelas: Parcela[]
  cargando?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(val: unknown): string | undefined {
  return typeof val === 'string' && val.length > 0 ? val : undefined
}

function parseObs(m: MovimientoGanado): Record<string, unknown> {
  if (!m.observaciones) return {}
  try {
    const idx = m.observaciones.indexOf('{')
    if (idx === -1) return { comentario: m.observaciones }
    const json = JSON.parse(m.observaciones.slice(idx)) as Record<string, unknown>
    const comentario = m.observaciones.slice(0, idx).trim()
    return comentario ? { ...json, comentario } : json
  } catch { return {} }
}

function getSubtipo(m: MovimientoGanado): string {
  const obs = parseObs(m)
  return (obs.subtipo as string) ?? m.tipo_movimiento
}

function getBadgeColor(tipo: string): string {
  if (['Compra', 'Nacimiento'].includes(tipo)) return 'bg-green-100 text-green-800 border-green-200'
  if (tipo === 'Nacimiento') return 'bg-blue-100 text-blue-800 border-blue-200'
  if (tipo.startsWith('Venta')) return 'bg-orange-100 text-orange-800 border-orange-200'
  if (['Traslado entre Establecimientos', 'Cambio de Potrero', 'Traslado'].includes(tipo)) return 'bg-primary/10 text-primary border-primary/20'
  if (tipo.startsWith('Afectación') || tipo === 'Ajuste') return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-muted text-muted-foreground border-muted'
}

function getBadgeIcon(tipo: string) {
  if (tipo === 'Nacimiento') return <Plus className="h-3 w-3" />
  if (tipo === 'Compra') return <ArrowDownLeft className="h-3 w-3" />
  if (tipo.startsWith('Venta')) return <ArrowUpRight className="h-3 w-3" />
  if (tipo.startsWith('Traslado') || tipo === 'Cambio de Potrero') return <MoveHorizontal className="h-3 w-3" />
  if (tipo.startsWith('Afectación') || tipo === 'Ajuste') return <RefreshCw className="h-3 w-3" />
  if (tipo === 'Muerte') return <Minus className="h-3 w-3" />
  return null
}

const LABEL_CORTO: Record<string, string> = {
  'Venta a Productor': 'V. Productor',
  'Venta a Frigorífico': 'V. Frigorífico',
  'Venta en Consignación': 'V. Consignación',
  'Traslado entre Establecimientos': 'Traslado Est.',
  'Cambio de Potrero': 'Cambio Potrero',
  'Afectación a Fideicomiso': 'Afect. Fideicomiso',
  'Afectación a Capitalización': 'Afect. Capitalización',
  'Afectación a Consignación sin Movimiento': 'Afect. Consignación',
}

// ── Modal de detalle ──────────────────────────────────────────────────────────

function Campo({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-muted/50 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  )
}

function MovimientoDetalleModal({
  movimiento,
  potreros,
  parcelas,
  onClose,
}: {
  movimiento: MovimientoGanado
  potreros: Potrero[]
  parcelas: Parcela[]
  onClose: () => void
}) {
  const obs = parseObs(movimiento)
  const subtipo = (obs.subtipo as string) ?? movimiento.tipo_movimiento

  const getNombreUbicacion = (tipo: string | null, id: number | null) => {
    if (!tipo || !id) return null
    if (tipo === 'potrero') return potreros.find(p => p.id === id)?.nombre ?? `Potrero ${id}`
    return parcelas.find(p => p.id === id)?.nombre ?? `Parcela ${id}`
  }

  const categorias = obs.categorias as Record<string, number> | undefined

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline" className={`${getBadgeColor(subtipo)} flex items-center gap-1`}>
              {getBadgeIcon(subtipo)}
              <span>{subtipo}</span>
            </Badge>
            <span className="text-muted-foreground font-normal text-sm">
              {format(new Date(movimiento.fecha + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: es })}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* General */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">General</p>
            <Campo label="Cantidad de animales" value={movimiento.cantidad} />
            {categorias ? (
              <div className="py-1.5 border-b border-muted/50">
                <span className="text-sm text-muted-foreground">Categorías</span>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(categorias).map(([cat, qty]) => (
                    <div key={cat} className="flex justify-between text-sm pl-2">
                      <span>{cat}</span><span className="font-medium">{qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Campo label="Categoría" value={movimiento.categoria} />
            )}
            <Campo
              label="Destino"
              value={getNombreUbicacion(movimiento.destino_tipo, movimiento.destino_id)}
            />
          </div>

          {/* Documentación */}
          {Boolean(movimiento.guia_dgt || movimiento.remito) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Documentación</p>
              <Campo label="Guía" value={movimiento.guia_dgt} />
              <Campo label="Nro. Autorización" value={movimiento.remito} />
              {str(obs.nro_tropa) && <Campo label="Nro. Tropa" value={str(obs.nro_tropa)} />}
            </div>
          )}

          {/* DICOSE */}
          {[obs.dicose_propiedad, obs.dicose_fisico, obs.dicose_propiedad_vendedor, obs.dicose_propiedad_comprador].some(Boolean) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">DICOSE</p>
              <Campo label="DICOSE Propiedad" value={str(obs.dicose_propiedad)} />
              <Campo label="DICOSE Físico" value={str(obs.dicose_fisico) ?? str(obs.dicose_fisico_estab)} />
              <Campo label="DICOSE Prop. Vendedor" value={str(obs.dicose_propiedad_vendedor)} />
              <Campo label="DICOSE Fís. Vendedor" value={str(obs.dicose_fisico_vendedor)} />
              <Campo label="DICOSE Prop. Comprador" value={str(obs.dicose_propiedad_comprador)} />
              <Campo label="DICOSE Fís. Comprador" value={str(obs.dicose_fisico_comprador)} />
              <Campo label="DICOSE Prop. Destino" value={str(obs.dicose_propiedad_destino)} />
              <Campo label="DICOSE Fís. Destino" value={str(obs.dicose_fisico_destino)} />
              <Campo label="DICOSE Nuevo Titular" value={str(obs.dicose_propiedad_nuevo_titular)} />
            </div>
          )}

          {/* Peso y precio */}
          {Boolean(movimiento.peso_promedio || movimiento.precio_total) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Peso y Precio</p>
              <Campo label="Peso promedio (kg)" value={movimiento.peso_promedio ?? undefined} />
              <Campo label="Peso total (kg)" value={movimiento.peso_total ?? undefined} />
              <Campo label="Precio total (USD)" value={movimiento.precio_total ? `USD ${movimiento.precio_total.toLocaleString()}` : undefined} />
            </div>
          )}

          {/* Comentario */}
          {str(obs.comentario) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Comentario</p>
              <p className="text-sm text-muted-foreground">{str(obs.comentario)}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Tabla ─────────────────────────────────────────────────────────────────────

export function MovimientosTable({ movimientos, potreros, parcelas, cargando }: MovimientosTableProps) {
  const [detalle, setDetalle] = useState<MovimientoGanado | null>(null)

  if (cargando) {
    return <div className="rounded-md border bg-card p-8 text-center text-muted-foreground">Cargando movimientos...</div>
  }

  if (movimientos.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-card p-12 text-center text-muted-foreground">
        No se encontraron movimientos registrados.
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[90px]">Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Animales</TableHead>
                <TableHead>Guía</TableHead>
                <TableHead className="text-right">Precio Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.map((m) => {
                const subtipo = getSubtipo(m)
                return (
                  <TableRow key={m.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium text-sm">
                      {format(new Date(m.fecha + 'T12:00:00'), 'dd MMM yy', { locale: es })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`flex items-center gap-1 w-fit ${getBadgeColor(subtipo)}`}>
                        {getBadgeIcon(subtipo)}
                        <span>{LABEL_CORTO[subtipo] ?? subtipo}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{m.cantidad}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {m.guia_dgt ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.precio_total
                        ? <span className="text-sm font-medium">USD {m.precio_total.toLocaleString()}</span>
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setDetalle(m)}
                        title="Ver detalle"
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {detalle && (
        <MovimientoDetalleModal
          movimiento={detalle}
          potreros={potreros}
          parcelas={parcelas}
          onClose={() => setDetalle(null)}
        />
      )}
    </>
  )
}
