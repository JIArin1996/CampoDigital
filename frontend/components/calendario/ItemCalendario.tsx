"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, ChevronRight, Pencil, Repeat, RotateCcw, Syringe, X } from "lucide-react"
import { toast } from "sonner"

import { cambiarEstadoTarea } from "@/lib/queries/bitacora"
import { avisarCambioTareas, marcarDosisDada } from "@/lib/queries/calendario"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChipResponsables } from "@/components/shared/Responsables"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import { ETIQUETA_ESTADO_TAREA, fechaHora, mensajeTareaHecha, textoRepeticion, textoVencimiento } from "@/components/bitacora/formato"
import { cn } from "@/lib/utils"
import type { EstadoTarea, FilaCalendario } from "@/types/bitacora"

interface Props {
  fila: FilaCalendario
  nombresLote: Map<string, string>
  nombrePersona: (id: string) => string | undefined
  puedeOperar: boolean
  onCambio: () => void
}

/**
 * Una tarea o una próxima dosis en el Calendario (y en el inicio), con sus acciones:
 * tarea: Hecha, Cancelar, Editar o Reabrir; dosis: Dada o Desmarcar (cargar la sanidad siguiente es aparte).
 */
export function ItemCalendario({ fila, nombresLote, nombrePersona, puedeOperar, onCambio }: Props) {
  const [trabajando, setTrabajando] = useState(false)
  const hoy = hoyLocal()
  const pendiente = fila.estado === "pendiente"
  const vencida = pendiente && fila.fecha < hoy
  const esDosis = fila.origen === "dosis"

  const ejecutar = async (accion: () => Promise<void>, ok: string) => {
    setTrabajando(true)
    try {
      await accion()
      toast.success(ok)
      avisarCambioTareas()
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setTrabajando(false)
    }
  }

  const cambiarTarea = (estado: EstadoTarea) =>
    ejecutar(async () => {
      const siguiente = await cambiarEstadoTarea(fila.entrada_id!, estado)
      if (siguiente && fila.repetir_cada_dias) toast.info(mensajeTareaHecha(fila.fecha, fila.repetir_cada_dias, hoy))
    }, estado === "hecha" ? "Tarea hecha" : estado === "cancelada" ? "Tarea cancelada" : "Tarea reabierta")

  const marcarDosis = (dada: boolean) =>
    ejecutar(() => marcarDosisDada(fila.actividad_id!, fila.orden!, dada), dada ? "Dosis marcada como dada" : "Dosis pendiente otra vez")

  return (
    <article className={cn("rounded-lg border bg-card px-4 py-3", vencida && "border-destructive/60 bg-destructive/5", !pendiente && "bg-muted/40")}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold",
          esDosis ? "bg-(--etiqueta-observacion) text-(--etiqueta-observacion-texto)" : "bg-(--etiqueta-tarea) text-(--etiqueta-tarea-texto)")}>
          {esDosis ? "Dosis" : "Tarea"}
        </span>
        {!pendiente && (
          <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">
            {esDosis ? "Dada" : ETIQUETA_ESTADO_TAREA[fila.estado]}
          </span>
        )}
        <span className={cn("ml-auto text-sm", vencida ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {fechaCorta(fila.fecha)}
        </span>
      </div>

      <p className={cn("mt-2 whitespace-pre-line text-base md:text-sm", fila.estado === "cancelada" && "line-through text-muted-foreground")}>
        {esDosis && <Syringe className="inline h-4 w-4 mr-1 -mt-0.5" />}
        {fila.texto}
      </p>

      <p className={cn("mt-1 text-sm", vencida ? "font-medium text-destructive" : "text-muted-foreground")}>
        {pendiente ? textoVencimiento(fila.fecha, hoy) : fila.hecha_en ? `${esDosis ? "Dada" : "Hecha"} el ${fechaHora(fila.hecha_en)}` : null}
        {fila.repetir_cada_dias && (
          <span className="text-muted-foreground font-normal">
            {pendiente ? " · " : ""}<Repeat className="inline h-3.5 w-3.5 -mt-0.5" /> {textoRepeticion(fila.repetir_cada_dias)}
          </span>
        )}
      </p>

      {(fila.lotes.length > 0 || fila.responsables.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fila.lotes.map(id => (
            <Link key={id} href={`/lotes/${id}`} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-accent">
              {nombresLote.get(id) ?? "Lote"}
            </Link>
          ))}
          <ChipResponsables ids={fila.responsables} nombre={nombrePersona} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {puedeOperar && !esDosis && pendiente && (
          <>
            <Button type="button" size="sm" disabled={trabajando} onClick={() => cambiarTarea("hecha")}>
              <Check className="h-4 w-4 mr-1" /> Hecha
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={trabajando} onClick={() => cambiarTarea("cancelada")}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Link href={`/bitacora/${fila.entrada_id}/editar`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Link>
          </>
        )}
        {puedeOperar && !esDosis && !pendiente && (
          <Button type="button" size="sm" variant="outline" disabled={trabajando} onClick={() => cambiarTarea("pendiente")}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
          </Button>
        )}
        {puedeOperar && esDosis && (
          <Button type="button" size="sm" variant={pendiente ? "default" : "outline"} disabled={trabajando} onClick={() => marcarDosis(pendiente)}>
            {pendiente ? <><Check className="h-4 w-4 mr-1" /> Dada</> : <><RotateCcw className="h-4 w-4 mr-1" /> Desmarcar</>}
          </Button>
        )}
        {esDosis && (
          <Link href={`/actividades/${fila.actividad_id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Ver sanidad <ChevronRight className="h-4 w-4 ml-0.5" />
          </Link>
        )}
      </div>
    </article>
  )
}

// Clave estable de una fila (una tarea, o un producto de una sanidad)
export const claveFila = (f: FilaCalendario) => f.entrada_id ?? `${f.actividad_id}:${f.orden}`
