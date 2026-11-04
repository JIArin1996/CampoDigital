"use client"

import { useState } from "react"
import Link from "next/link"
import {
  CalendarClock, CalendarPlus, Check, CornerDownRight, Flag, Lightbulb, Pencil, Repeat, RotateCcw, SquareCheck, Trash2, X,
  type LucideIcon,
} from "lucide-react"
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
  COLOR_TIPO, ETIQUETA_ESTADO, ETIQUETA_ESTADO_TAREA, ETIQUETA_TIPO, esVencida, etiquetaEstado, fechaHora, mensajeTareaRealizada,
  textoRepeticion, textoVencimiento,
} from "@/components/bitacora/formato"
import { cn } from "@/lib/utils"
import type { EntradaConLotes, EstadoDecision, EstadoIdea, EstadoTarea, TipoEntrada } from "@/types/bitacora"

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
  compacta?: boolean            // en el inicio, la ficha de lote y el calendario: los responsables abreviados
}

const ICONO_TIPO: Record<TipoEntrada, LucideIcon> = { tarea: SquareCheck, decision: Flag, idea: Lightbulb }
const BOTON_TARJETA = "h-11 md:h-9 flex-1 basis-32"

/**
 * Una entrada de bitácora: franja con el tipo y el estado, el texto, sus datos y los botones.
 * Tarea y decisión: Realizada o Reabrir. Idea: Decidida y Descartada, o Reabrir. Eliminar solo para el administrador.
 */
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

  const esTarea = entrada.tipo === "tarea"
  const esIdea = entrada.tipo === "idea"
  const cerrada = !!entrada.cerrada_en
  const hoy = hoyLocal()
  const vencida = esVencida(entrada, hoy)

  // Tareas: al marcar realizada una repetida, la base anota la siguiente
  const cambiarTarea = (estado: EstadoTarea) =>
    ejecutar(async () => {
      const siguiente = await cambiarEstadoTarea(entrada.id, estado)
      avisarCambioTareas()
      if (siguiente) toast.info(mensajeTareaRealizada(entrada.vencimiento!, entrada.repetir_cada_dias!, hoy))
    }, estado === "realizada" ? "Tarea realizada" : "Tarea reabierta")
  const cambiarDecision = (estado: EstadoDecision) =>
    ejecutar(() => cambiarEstadoDecision(entrada.id, estado), estado === "realizada" ? "Decisión realizada" : "Decisión reabierta")
  const cambiarIdea = (estado: EstadoIdea) =>
    ejecutar(() => cambiarEstadoIdea(entrada.id, estado), estado === "abierta" ? "Idea reabierta" : `Idea ${ETIQUETA_ESTADO[estado].toLowerCase()}`)
  const reabrir = () => (esTarea ? cambiarTarea("pendiente") : esIdea ? cambiarIdea("abierta") : cambiarDecision("pendiente"))

  // "Crear tarea" desde una decisión, o desde una idea decidida, que todavía no tiene una
  const puedeCrearTarea = !esTarea && !entrada.tarea && (!esIdea || entrada.estado_idea === "decidida")

  const confirmarEliminacion = async () => {
    await ejecutar(async () => {
      await eliminarEntrada(entrada.id)
      if (esTarea) avisarCambioTareas()
    }, `${ETIQUETA_TIPO[entrada.tipo]} eliminada`)
    setEliminando(false)
  }

  const Icono = ICONO_TIPO[entrada.tipo]
  const estadoPill = vencida ? "Vencida" : etiquetaEstado(entrada)

  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      {/* Franja del tipo, con el estado */}
      <div className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-semibold", COLOR_TIPO[entrada.tipo])}>
        <Icono className="h-4 w-4 shrink-0" />
        {ETIQUETA_TIPO[entrada.tipo]}
        <span className={cn("ml-auto rounded-full border bg-card px-2.5 py-0.5 text-xs text-foreground",
          vencida && "border-destructive bg-destructive/10 text-destructive",
          cerrada && entrada.estado_idea !== "descartada" && "border-transparent bg-secondary text-secondary-foreground",
          entrada.estado_idea === "descartada" && "bg-muted text-muted-foreground")}>
          {estadoPill}
        </span>
      </div>

      <div className="space-y-2 px-3 pb-3 pt-2.5">
        <p className={cn("whitespace-pre-line text-base font-medium md:text-sm", cerrada && "text-muted-foreground")}>{entrada.texto}</p>

        {/* Detalle: vencimiento y repetición de una tarea abierta; quién y cuándo la cerró; la fecha de la nota */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {esTarea && entrada.estado_tarea === "pendiente" && entrada.vencimiento && (
            <span className={cn("inline-flex items-center gap-1.5", vencida && "font-semibold text-destructive")}>
              <CalendarClock className="h-4 w-4 shrink-0" />
              {textoVencimiento(entrada.vencimiento, hoy)} ({fechaCorta(entrada.vencimiento)})
            </span>
          )}
          {esTarea && entrada.repetir_cada_dias && !cerrada && (
            <span className="inline-flex items-center gap-1.5">
              <Repeat className="h-4 w-4 shrink-0" /> {textoRepeticion(entrada.repetir_cada_dias)}
            </span>
          )}
          {cerrada && (
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 shrink-0" />
              {etiquetaEstado(entrada)} el {fechaHora(entrada.cerrada_en!)}
              {(entrada.completada_por ?? entrada.cerrada_por) && ` por ${nombreUsuario(entrada.completada_por ?? entrada.cerrada_por)}`}
            </span>
          )}
          {!cerrada && <span>Anotada el {fechaCorta(entrada.fecha)}</span>}
        </div>

        {/* Lotes y responsables */}
        {(entrada.lotes.length > 0 || entrada.responsables.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {entrada.lotes.map(id => (
              <Link key={id} href={`/lotes/${id}`} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-accent">
                {nombresLote.get(id) ?? "Lote"}
              </Link>
            ))}
            <ChipResponsables ids={entrada.responsables} nombre={nombrePersona} completo={!compacta} />
          </div>
        )}

        {/* Vínculo nota ↔ tarea */}
        {entrada.origen && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CornerDownRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="line-clamp-1">Sale de la {ETIQUETA_TIPO[entrada.origen.tipo].toLowerCase()}: {entrada.origen.texto}</span>
          </p>
        )}
        {entrada.tarea && (
          <Link href={`/calendario?fecha=${entrada.tarea.vencimiento}`} className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs hover:bg-muted">
            <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Tarea {ETIQUETA_ESTADO_TAREA[entrada.tarea.estado].toLowerCase()}, vence el {fechaCorta(entrada.tarea.vencimiento)}
              {entrada.tarea.texto !== entrada.texto && <span className="text-muted-foreground"> · {entrada.tarea.texto}</span>}
            </span>
          </Link>
        )}

        {/* Auditoría */}
        <p className="text-xs text-muted-foreground">
          Cargó {nombreUsuario(entrada.created_by)}
          {entrada.editada_en && ` · editada el ${fechaHora(entrada.editada_en)} por ${nombreUsuario(entrada.editada_por)}`}
        </p>

        {/* Botones */}
        {puedeOperar && (
          <div className="flex flex-wrap gap-2 pt-1">
            {!cerrada && !esIdea && (
              <Button type="button" className={BOTON_TARJETA} disabled={trabajando}
                onClick={() => (esTarea ? cambiarTarea("realizada") : cambiarDecision("realizada"))}>
                <Check className="h-4 w-4 mr-1" /> Realizada
              </Button>
            )}
            {!cerrada && esIdea && (
              <>
                <Button type="button" className={BOTON_TARJETA} disabled={trabajando} onClick={() => cambiarIdea("decidida")}>
                  <Check className="h-4 w-4 mr-1" /> Decidida
                </Button>
                <Button type="button" variant="outline" className={BOTON_TARJETA} disabled={trabajando} onClick={() => cambiarIdea("descartada")}>
                  <X className="h-4 w-4 mr-1" /> Descartada
                </Button>
              </>
            )}
            {cerrada && (
              <Button type="button" variant="outline" className={BOTON_TARJETA} disabled={trabajando} onClick={reabrir}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
              </Button>
            )}
            {puedeCrearTarea && (
              <Link href={`/bitacora/nueva?origen=${entrada.id}`} className={buttonVariants({ variant: "outline", className: BOTON_TARJETA })}>
                <CalendarPlus className="h-4 w-4 mr-1" /> Crear tarea
              </Link>
            )}
            <Link href={`/bitacora/${entrada.id}/editar`} className={buttonVariants({ variant: "outline", className: BOTON_TARJETA })}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Link>
            {esAdmin && (
              <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label="Eliminar"
                disabled={trabajando} onClick={() => setEliminando(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

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
