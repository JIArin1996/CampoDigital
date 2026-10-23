"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { getEstadiasPotrero } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { diasEntre } from "@/components/bitacora/formato"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import type { Potrero } from "@/types/database"

type Fila = Awaited<ReturnType<typeof getEstadiasPotrero>>[number]

/**
 * Qué lotes pasaron por un potrero: entrada, salida y días, de lo más nuevo a lo más viejo.
 * Se monta solo mientras está abierto.
 */
export function HistorialPotrero({ potrero, onCerrar }: { potrero: Potrero; onCerrar: () => void }) {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    getEstadiasPotrero(potrero.id)
      .then(f => { if (vigente) setFilas(f) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el historial")) })
    return () => { vigente = false }
  }, [potrero.id])

  const hoy = hoyLocal()

  return (
    <Dialog open onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de {potrero.nombre}</DialogTitle>
          <DialogDescription>Los lotes que pasaron por el potrero, con sus fechas.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!filas ? (
          !error && <div className="h-24 rounded-lg bg-muted animate-pulse" />
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no pasó ningún lote.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {filas.map(f => (
              <li key={f.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/lotes/${f.lote_id}`} className="font-medium text-primary truncate">{f.lote_nombre}</Link>
                  <span className="shrink-0 text-sm tabular-nums">
                    {diasEntre(f.fecha_ingreso, f.fecha_salida ?? hoy)} días
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {f.fecha_salida
                    ? `${fechaCorta(f.fecha_ingreso)} al ${fechaCorta(f.fecha_salida)}${f.cerrada_por === "cierre" ? " (cierre del lote)" : ""}`
                    : `Desde el ${fechaCorta(f.fecha_ingreso)}: sigue adentro`}
                </p>
                {(f.motivo || f.motivo_salida) && (
                  <p className="text-sm text-muted-foreground">{[f.motivo, f.motivo_salida].filter(Boolean).join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
