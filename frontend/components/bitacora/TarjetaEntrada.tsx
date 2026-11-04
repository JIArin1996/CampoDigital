"use client"

import { useState } from "react"
import Link from "next/link"
import { Pencil, RotateCcw, Check, Repeat, CalendarClock, CalendarPlus, CornerDownRight, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { cambiarEstadoDecision, cambiarEstadoIdea, cambiarEstadoTarea, eliminarEntrada } from "@/lib/queries/bitacora"
import { avisarCambioTareas } from "@/lib/queries/calendario"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BOTON } from "@/components/shared/estilos"
import { ChipResponsables } from "@/components/shared/Responsables"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import {
  COLOR_TIPO, ESTADOS_IDEA, ETIQUETA_ESTADO, ETIQUETA_ESTADO_TAREA, ETIQUETA_TIPO, etiquetaEstado, fechaHora, mensajeTareaRealizada, textoRepeticion, textoVencimiento,
} from "@/components/bitacora/formato"
import { cn } from "@/lib/utils"
import type { EntradaConLotes, EstadoDecision, EstadoIdea, EstadoTarea } from "@/types/bitacora"

export interface Persona {
  id: string
  nombre: string
  user_id: string | null
}

interface Props {
  entrada: EntradaConLotes
  nombresLote: Map<string, string>
  personas: Persona[]
  puedeOperar: boolean
  onCambio: () => void
  compacta?: boolean            // en el inicio y en la ficha de lote: los responsables abreviados
}

export function TarjetaEntrada({ entrada, nombresLote, personas, puedeOperar, onCambio, compacta = false }: Props) {
  const { esAdmin } = useEstablecimiento()
  const [eliminando, setEliminando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  const nombrePersona = (id: string) => personas.find(p => p.id === id)?.nombre
  // Quién cargó o editó: el usuario se muestra por su ficha en personas
  const nombreUsuario = (userId: string | null) => personas.find(p => p.user_id && p.user_id === userId)?.nombre ?? "otro usuario"

  const ejecutar = async (accion: () => Promise<void>, ok: string) => {
    setTrabajando(true)
    try {
      await accion()
      toast.success(ok)
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setTrabajando(false)
    }
  }

  const cambiarEstado = (estado: EstadoIdea) =>
    ejecutar(() => cambiarEstadoIdea(entrada.id, estado), `Idea ${ETIQUETA_ESTADO[estado].toLowerCase()}`)

  // Tareas: al marcar realizada una repetida, la base anota la siguiente
  const esTarea = entrada.tipo === "tarea"
  const hoy = hoyLocal()
  const vencida = esTarea && entrada.estado_tarea === "pendiente" && !!entrada.vencimiento && entrada.vencimiento < hoy
  const cambiarTarea = (estado: EstadoTarea) =>
    ejecutar(async () => {
      const siguiente = await cambiarEstadoTarea(entrada.id, estado)
      avisarCambioTareas()
      if (siguiente) toast.info(mensajeTareaRealizada(entrada.vencimiento!, entrada.repetir_cada_dias!, hoy))
    }, estado === "realizada" ? "Tarea realizada" : "Tarea reabierta")
  const cambiarDecision = (estado: EstadoDecision) =>
    ejecutar(() => cambiarEstadoDecision(entrada.id, estado), estado === "realizada" ? "Decisión realizada" : "Decisión reabierta")
  // "Crear tarea" desde una decisión, o desde una idea decidida, que todavía no tiene una
  const puedeCrearTarea = !esTarea && !entrada.tarea && (entrada.tipo !== "idea" || entrada.estado_idea === "decidida")

  const confirmarEliminacion = async () => {
    await ejecutar(async () => {
      await eliminarEntrada(entrada.id)
      if (esTarea) avisarCambioTareas()
    }, `${ETIQUETA_TIPO[entrada.tipo]} eliminada`)
    setEliminando(false)
  }

  return (
    <article className="rounded-lg border bg-card px-4 py-3">
      {/* Tipo, fecha y estado */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", COLOR_TIPO[entrada.tipo])}>
          {ETIQUETA_TIPO[entrada.tipo]}
        </span>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium",
          vencida && "border-destructive bg-destructive/10 text-destructive font-semibold")}>
          {vencida ? "Vencida" : etiquetaEstado(entrada)}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">{fechaCorta(entrada.fecha)}</span>
      </div>

      {/* Texto */}
      <p className="mt-2 whitespace-pre-line text-base md:text-sm">{entrada.texto}</p>

      {/* Tarea: vencimiento, repetición y quién la marcó realizada */}
      {esTarea && entrada.vencimiento && (
        <div className="mt-2 space-y-0.5 text-sm">
          <p className={cn("flex items-center gap-1.5 font-medium", vencida && "text-destructive")}>
            <CalendarClock className="h-4 w-4 shrink-0" />
            Vence el {fechaCorta(entrada.vencimiento)}
            {entrada.estado_tarea === "pendiente" && (
              <span className="font-normal">· {textoVencimiento(entrada.vencimiento, hoy)}</span>
            )}
          </p>
          {entrada.repetir_cada_dias && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Repeat className="h-4 w-4 shrink-0" /> {textoRepeticion(entrada.repetir_cada_dias)}
            </p>
          )}
          {entrada.estado_tarea === "realizada" && entrada.completada_en && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Check className="h-4 w-4 shrink-0" /> Realizada el {fechaHora(entrada.completada_en)} por {nombreUsuario(entrada.completada_por)}
            </p>
          )}
        </div>
      )}

      {/* Decisión realizada: cuándo y quién */}
      {entrada.tipo === "decision" && entrada.estado_decision === "realizada" && entrada.cerrada_en && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="h-4 w-4 shrink-0" /> Realizada el {fechaHora(entrada.cerrada_en)} por {nombreUsuario(entrada.cerrada_por)}
        </p>
      )}

      {/* Vínculo nota ↔ tarea */}
      {entrada.origen && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <CornerDownRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="line-clamp-1">Sale de la {ETIQUETA_TIPO[entrada.origen.tipo].toLowerCase()}: {entrada.origen.texto}</span>
        </p>
      )}
      {entrada.tarea && (
        <Link href={`/calendario?fecha=${entrada.tarea.vencimiento}`} className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs hover:bg-muted">
          <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Tarea {ETIQUETA_ESTADO_TAREA[entrada.tarea.estado].toLowerCase()}, vence el {fechaCorta(entrada.tarea.vencimiento)}
            {entrada.tarea.texto !== entrada.texto && <span className="text-muted-foreground"> · {entrada.tarea.texto}</span>}
          </span>
        </Link>
      )}

      {/* Lotes y responsables */}
      {(entrada.lotes.length > 0 || entrada.responsables.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entrada.lotes.map(id => (
            <Link key={id} href={`/lotes/${id}`} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-accent">
              {nombresLote.get(id) ?? "Lote"}
            </Link>
          ))}
          <ChipResponsables ids={entrada.responsables} nombre={nombrePersona} completo={!compacta} />
        </div>
      )}

      {/* Auditoría */}
      <p className="mt-2 text-xs text-muted-foreground">
        Cargó {nombreUsuario(entrada.created_by)}
        {entrada.editada_en && ` · editada el ${fechaHora(entrada.editada_en)} por ${nombreUsuario(entrada.editada_por)}`}
      </p>

      {/* Acciones */}
      {puedeOperar && (
        <div className="mt-3 flex flex-wrap gap-2">
          {esTarea && entrada.estado_tarea === "pendiente" && (
            <Button type="button" size="sm" disabled={trabajando} onClick={() => cambiarTarea("realizada")}>
              <Check className="h-4 w-4 mr-1" /> Realizada
            </Button>
          )}
          {esTarea && entrada.estado_tarea === "realizada" && (
            <Button type="button" size="sm" variant="outline" disabled={trabajando} onClick={() => cambiarTarea("pendiente")}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
            </Button>
          )}
          {entrada.tipo === "decision" && entrada.estado_decision === "pendiente" && (
            <Button type="button" size="sm" disabled={trabajando} onClick={() => cambiarDecision("realizada")}>
              <Check className="h-4 w-4 mr-1" /> Realizada
            </Button>
          )}
          {entrada.tipo === "decision" && entrada.estado_decision === "realizada" && (
            <Button type="button" size="sm" variant="outline" disabled={trabajando} onClick={() => cambiarDecision("pendiente")}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
            </Button>
          )}
          {puedeCrearTarea && (
            <Link href={`/bitacora/nueva?origen=${entrada.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CalendarPlus className="h-4 w-4 mr-1" /> Crear tarea
            </Link>
          )}
          {entrada.tipo === "idea" && (
            <div className="flex gap-1" role="group" aria-label="Estado de la idea">
              {ESTADOS_IDEA.map(estado => (
                <Button
                  key={estado}
                  type="button"
                  size="sm"
                  variant={entrada.estado_idea === estado ? "default" : "outline"}
                  disabled={trabajando || entrada.estado_idea === estado}
                  onClick={() => cambiarEstado(estado)}
                >
                  {ETIQUETA_ESTADO[estado]}
                </Button>
              ))}
            </div>
          )}
          <Link href={`/bitacora/${entrada.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Link>
          {esAdmin && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={trabajando} onClick={() => setEliminando(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          )}
        </div>
      )}

      {/* Eliminar: solo el administrador, con confirmación */}
      <Dialog open={eliminando} onOpenChange={setEliminando}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar {ETIQUETA_TIPO[entrada.tipo].toLowerCase()}</DialogTitle>
            <DialogDescription>
              Deja de verse en toda la app{esTarea ? ", también en el Calendario" : ""}.
              {entrada.tarea && " La tarea que salió de acá sigue."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button type="button" variant="destructive" className={BOTON} disabled={trabajando} onClick={confirmarEliminacion}>
              {trabajando ? "Eliminando..." : "Eliminar"}
            </Button>
            <Button type="button" variant="outline" className={BOTON} disabled={trabajando} onClick={() => setEliminando(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}
