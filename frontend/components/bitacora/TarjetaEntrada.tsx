"use client"

import { useState } from "react"
import Link from "next/link"
import { Pencil, RotateCcw, Ban, UserRound, Check, X, Repeat, CalendarClock, CalendarPlus, CornerDownRight } from "lucide-react"
import { toast } from "sonner"

import { anularEntrada, cambiarEstadoIdea, cambiarEstadoTarea, restaurarEntrada } from "@/lib/queries/bitacora"
import { avisarCambioTareas } from "@/lib/queries/calendario"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CAMPO } from "@/components/shared/estilos"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import {
  COLOR_TIPO, ESTADOS_IDEA, ETIQUETA_ESTADO, ETIQUETA_ESTADO_TAREA, ETIQUETA_TIPO, fechaHora, mensajeTareaHecha, textoRepeticion, textoVencimiento,
} from "@/components/bitacora/formato"
import { cn } from "@/lib/utils"
import type { EntradaConLotes, EstadoIdea, EstadoTarea } from "@/types/bitacora"

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
  compacta?: boolean            // en el inicio y en la ficha de lote: sin acciones de anular
}

export function TarjetaEntrada({ entrada, nombresLote, personas, puedeOperar, onCambio, compacta = false }: Props) {
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [trabajando, setTrabajando] = useState(false)

  const anulada = entrada.anulada_en !== null
  const responsable = personas.find(p => p.id === entrada.persona_id)?.nombre
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

  // Tareas: al marcar hecha una repetida, la base anota la siguiente
  const esTarea = entrada.tipo === "tarea"
  const hoy = hoyLocal()
  const vencida = esTarea && entrada.estado_tarea === "pendiente" && !!entrada.vencimiento && entrada.vencimiento < hoy
  const cambiarTarea = (estado: EstadoTarea) =>
    ejecutar(async () => {
      const siguiente = await cambiarEstadoTarea(entrada.id, estado)
      avisarCambioTareas()
      if (siguiente) toast.info(mensajeTareaHecha(entrada.vencimiento!, entrada.repetir_cada_dias!, hoy))
    }, estado === "hecha" ? "Tarea hecha" : estado === "cancelada" ? "Tarea cancelada" : "Tarea reabierta")
  // "Crear tarea" desde una nota que no es tarea (de una idea, solo si está decidida) y que todavía no tiene una
  const puedeCrearTarea = !esTarea && !entrada.tarea && (entrada.tipo !== "idea" || entrada.estado_idea === "decidida")

  const confirmarAnulacion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!motivo.trim()) return toast.error("Escribí el motivo")
    await ejecutar(() => anularEntrada(entrada.id, motivo.trim()), "Entrada anulada")
    setAnulando(false)
    setMotivo("")
  }

  return (
    <article className={cn("rounded-lg border bg-card px-4 py-3", anulada && "border-dashed bg-muted/40")}>
      {/* Tipo, fecha y estado */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", COLOR_TIPO[entrada.tipo])}>
          {ETIQUETA_TIPO[entrada.tipo]}
        </span>
        {entrada.estado_idea && (
          <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">{ETIQUETA_ESTADO[entrada.estado_idea]}</span>
        )}
        {entrada.estado_tarea && (
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium",
            vencida && "border-destructive bg-destructive/10 text-destructive font-semibold")}>
            {vencida ? "Vencida" : ETIQUETA_ESTADO_TAREA[entrada.estado_tarea]}
          </span>
        )}
        {anulada && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">Anulada</span>}
        <span className="ml-auto text-sm text-muted-foreground">{fechaCorta(entrada.fecha)}</span>
      </div>

      {/* Texto */}
      <p className={cn("mt-2 whitespace-pre-line text-base md:text-sm", anulada && "line-through text-muted-foreground")}>
        {entrada.texto}
      </p>

      {/* Tarea: vencimiento, repetición y quién la marcó hecha */}
      {esTarea && entrada.vencimiento && (
        <div className="mt-2 space-y-0.5 text-sm">
          <p className={cn("flex items-center gap-1.5 font-medium", vencida && "text-destructive")}>
            <CalendarClock className="h-4 w-4 shrink-0" />
            Vence el {fechaCorta(entrada.vencimiento)}
            {entrada.estado_tarea === "pendiente" && !anulada && (
              <span className="font-normal">· {textoVencimiento(entrada.vencimiento, hoy)}</span>
            )}
          </p>
          {entrada.repetir_cada_dias && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Repeat className="h-4 w-4 shrink-0" /> {textoRepeticion(entrada.repetir_cada_dias)}
            </p>
          )}
          {entrada.estado_tarea === "hecha" && entrada.completada_en && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Check className="h-4 w-4 shrink-0" /> Hecha el {fechaHora(entrada.completada_en)} por {nombreUsuario(entrada.completada_por)}
            </p>
          )}
        </div>
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

      {/* Lotes y responsable */}
      {(entrada.lotes.length > 0 || responsable) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entrada.lotes.map(id => (
            <Link key={id} href={`/lotes/${id}`} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-accent">
              {nombresLote.get(id) ?? "Lote"}
            </Link>
          ))}
          {responsable && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              <UserRound className="h-3 w-3" /> {responsable}
            </span>
          )}
        </div>
      )}

      {/* Auditoría */}
      <p className="mt-2 text-xs text-muted-foreground">
        Cargó {nombreUsuario(entrada.created_by)}
        {entrada.editada_en && ` · editada el ${fechaHora(entrada.editada_en)} por ${nombreUsuario(entrada.editada_por)}`}
      </p>
      {anulada && (
        <p className="mt-1 text-xs text-muted-foreground">
          Anulada el {fechaHora(entrada.anulada_en!)} por {nombreUsuario(entrada.anulada_por)}: {entrada.motivo_anulacion}
        </p>
      )}

      {/* Acciones */}
      {puedeOperar && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!anulada && esTarea && entrada.estado_tarea === "pendiente" && (
            <>
              <Button type="button" size="sm" disabled={trabajando} onClick={() => cambiarTarea("hecha")}>
                <Check className="h-4 w-4 mr-1" /> Hecha
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={trabajando} onClick={() => cambiarTarea("cancelada")}>
                <X className="h-4 w-4 mr-1" /> Cancelar tarea
              </Button>
            </>
          )}
          {!anulada && esTarea && entrada.estado_tarea !== "pendiente" && (
            <Button type="button" size="sm" variant="outline" disabled={trabajando} onClick={() => cambiarTarea("pendiente")}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
            </Button>
          )}
          {!anulada && puedeCrearTarea && (
            <Link href={`/bitacora/nueva?origen=${entrada.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CalendarPlus className="h-4 w-4 mr-1" /> Crear tarea
            </Link>
          )}
          {!anulada && entrada.tipo === "idea" && (
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
          {!anulada && (
            <Link href={`/bitacora/${entrada.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Link>
          )}
          {!compacta && !anulada && (
            <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={trabajando} onClick={() => setAnulando(true)}>
              <Ban className="h-4 w-4 mr-1" /> Anular
            </Button>
          )}
          {!compacta && anulada && (
            <Button type="button" size="sm" variant="outline" disabled={trabajando}
              onClick={() => ejecutar(() => restaurarEntrada(entrada.id), "Entrada restaurada")}>
              <RotateCcw className="h-4 w-4 mr-1" /> Restaurar
            </Button>
          )}
        </div>
      )}

      {/* Anular: motivo obligatorio */}
      <Dialog open={anulando} onOpenChange={setAnulando}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Anular entrada</DialogTitle>
            <DialogDescription>No se borra: queda oculta, con el motivo, y se puede restaurar.</DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmarAnulacion} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`motivo-${entrada.id}`}>Motivo</Label>
              <Input id={`motivo-${entrada.id}`} className={CAMPO} placeholder="Ej: cargada por error" value={motivo} onChange={e => setMotivo(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={trabajando}>Anular</Button>
              <Button type="button" variant="outline" onClick={() => setAnulando(false)}>Cancelar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  )
}
