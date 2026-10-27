"use client"

import Link from "next/link"
import { Pencil } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArchivosDeMovimiento } from "@/components/economia/ArchivosMovimiento"
import { montoOriginal, usd } from "@/components/economia/formato"
import { fechaCorta } from "@/components/lotes/formato"
import { cn } from "@/lib/utils"
import type { FilaMov } from "@/components/economia/movimientos/filtros"
import type { ArchivoDeMovimiento } from "@/types/economia"

export const COLOR_SENTIDO = {
  ingreso: "text-emerald-700 dark:text-emerald-400",
  egreso: "text-red-700 dark:text-red-400",
} as const

// RUT en grupos para leerlo: 21 234567 0012
const rutLegible = (rut: string) => rut.replace(/^(\d{2})(\d{6})(\d{4})$/, "$1 $2 $3")

/**
 * Todo el movimiento: identificador, concepto, montos, estado, titulares, quién pagó o cobró, la factura, el
 * comprobante, el comentario (que no se ve en el listado) y los archivos. El administrador y el operador lo marcan pagado, lo editan o lo anulan; Consulta solo lo ve.
 */
export function DetalleMovimiento({ fila, nombres, archivos, establecimientoId, puedeOperar, onCerrar, onPagar, onAnular, onCambioArchivos }: {
  fila: FilaMov | null
  nombres: { identificador: (f: FilaMov) => string; concepto: (f: FilaMov) => string; rubro: (id: string) => string; titular: (id: string) => string; pagador: (id: string | null) => string | null }
  archivos: ArchivoDeMovimiento[]
  establecimientoId: string
  puedeOperar: boolean
  onCerrar: () => void
  onPagar: (f: FilaMov) => void
  onAnular: (f: FilaMov) => void
  onCambioArchivos: () => void
}) {
  const m = fila?.m
  const anulado = !!m?.anulado_en
  const ingreso = m?.sentido === "ingreso"

  const dato = (titulo: string, valor: React.ReactNode) => valor ? (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-2 text-sm">
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className="min-w-0 break-words">{valor}</dd>
    </div>
  ) : null

  return (
    <Dialog open={!!fila} onOpenChange={abre => { if (!abre) onCerrar() }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {fila && m && (
          <>
            <DialogHeader>
              <DialogTitle className={cn(anulado && "line-through")}>{nombres.identificador(fila)}</DialogTitle>
              <DialogDescription>{ingreso ? "Ingreso" : "Egreso"} del {fechaCorta(m.fecha)}</DialogDescription>
            </DialogHeader>

            <div>
              <p className={cn("text-2xl font-bold tabular-nums", !anulado && COLOR_SENTIDO[m.sentido])}>
                {ingreso ? "+" : "−"} {usd(Number(m.monto_usd))}
              </p>
              {m.moneda_original === "UYU" && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {montoOriginal(Number(m.monto_original), m.moneda_original, m.tipo_cambio)}
                  {m.tipo_cambio_fuente === "BCU" && m.tipo_cambio_fecha ? ` · BCU del ${fechaCorta(m.tipo_cambio_fecha)}` : " · cambio a mano"}
                </p>
              )}
              {fila.esParte && (
                <p className="text-sm tabular-nums">De los titulares elegidos: <span className="font-semibold">{usd(fila.usd)}</span></p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {anulado
                ? <Badge variant="secondary">Anulado</Badge>
                : m.estado === "pendiente"
                  ? <Badge variant="outline">Pendiente{m.fecha_vencimiento ? ` · ${ingreso ? "se cobra" : "se paga"} el ${fechaCorta(m.fecha_vencimiento)}` : ""}</Badge>
                  : <Badge variant="outline">{ingreso ? "Cobrado" : "Pagado"}{m.fecha_pago ? ` el ${fechaCorta(m.fecha_pago)}` : ""}</Badge>}
            </div>
            {anulado && m.motivo_anulacion && <p className="text-sm text-muted-foreground">Motivo: {m.motivo_anulacion}</p>}

            <dl className="divide-y border-y">
              {dato("Concepto", nombres.concepto(fila))}
              {dato("Rubro", nombres.rubro(m.rubro_id))}
              {dato("Contraparte", m.contraparte)}
              {dato("Titulares", fila.partes.length > 0 && (
                <ul className="space-y-0.5">
                  {fila.partes.map(p => (
                    <li key={p.titular_id} className="tabular-nums">
                      {nombres.titular(p.titular_id)}: {montoOriginal(Number(p.monto), m.moneda_original, null)}
                      <span className="text-muted-foreground"> ({Math.round(Number(p.monto) / Number(m.monto_original) * 100)}%)</span>
                    </li>
                  ))}
                </ul>
              ))}
              {dato(ingreso ? "Cobrado por" : "Pagado por", nombres.pagador(m.pagador_id))}
              {dato("Factura a nombre de", m.factura_nombre)}
              {dato("RUT", m.factura_rut && rutLegible(m.factura_rut))}
              {dato("Comprobante", m.numero_comprobante)}
              {dato("Viene de", m.actividad_id && (
                <Link href={`/actividades/${m.actividad_id}`} className="text-primary hover:underline">{m.concepto}</Link>
              ))}
            </dl>

            {m.comentario && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Comentarios</p>
                <p className="whitespace-pre-wrap break-words text-sm">{m.comentario}</p>
              </div>
            )}

            <ArchivosDeMovimiento establecimientoId={establecimientoId} movimientoId={m.id}
              archivos={archivos.filter(a => a.movimiento_id === m.id)} puedeAdjuntar={puedeOperar && !anulado} onCambio={onCambioArchivos} />

            {puedeOperar && !anulado && (
              <div className="flex flex-wrap gap-2">
                {m.estado === "pendiente" && (
                  <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => onPagar(fila)}>
                    {ingreso ? "Marcar cobrado" : "Marcar pagado"}
                  </Button>
                )}
                <Link href={`/economia/${m.id}/editar`} className={buttonVariants({ variant: "outline", className: "h-11 md:h-9" })}>
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Link>
                {m.origen === "manual" && (
                  <Button type="button" variant="ghost" className="h-11 md:h-9 text-muted-foreground" onClick={() => onAnular(fila)}>Anular</Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
