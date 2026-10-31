"use client"

import { Check, UserRound } from "lucide-react"

import { cn } from "@/lib/utils"

// Lo mínimo de una persona (catálogo personas) para elegirla o mostrarla como responsable
export interface PersonaResponsable {
  id: string
  nombre: string
  user_id: string | null
  activo: boolean
}

export const MAX_RESPONSABLES = 10   // igual que la base

/**
 * Elegir varios responsables: chips para tocar, usuarios y personas juntos y por nombre (sin distinguirlos).
 * Se ofrecen las activas y, al editar, las que el registro ya tenía aunque estén de baja (`conservar`).
 * Ninguno elegido = sin responsable.
 */
export function SelectorResponsables({ personas, elegidos, onCambio, conservar = [], leyenda = "Responsables" }: {
  personas: PersonaResponsable[] | null    // null: cargando
  elegidos: string[]
  onCambio: (ids: string[]) => void
  conservar?: string[]
  leyenda?: string
}) {
  const alternar = (id: string) =>
    onCambio(elegidos.includes(id) ? elegidos.filter(x => x !== id) : elegidos.length >= MAX_RESPONSABLES ? elegidos : [...elegidos, id])

  const ofrecidas = (personas ?? [])
    .filter(p => p.activo || conservar.includes(p.id) || elegidos.includes(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))

  return (
    <fieldset>
      <legend className="text-sm font-medium mb-2">
        {leyenda} <span className="font-normal text-muted-foreground">(opcional, varios)</span>
      </legend>
      {!personas ? (
        <div className="h-11 rounded-lg bg-muted animate-pulse" />
      ) : ofrecidas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay personas para elegir: se cargan en Configuraciones &gt; Personas.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {ofrecidas.map(p => {
              const elegido = elegidos.includes(p.id)
              return (
                <button key={p.id} type="button" aria-pressed={elegido} onClick={() => alternar(p.id)}
                  disabled={!elegido && elegidos.length >= MAX_RESPONSABLES}
                  className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-50",
                    elegido ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {elegido && <Check className="h-4 w-4" />}
                  {p.nombre}
                  {!p.activo && <span className="text-xs opacity-80">(de baja)</span>}
                </button>
              )
            })}
          </div>
          {elegidos.length >= MAX_RESPONSABLES && <p className="text-xs text-muted-foreground">Hasta {MAX_RESPONSABLES} responsables.</p>}
        </div>
      )}
    </fieldset>
  )
}

// "Juan", "Juan y Pedro", "Juan, Pedro y Ana", "Juan, Pedro y 2 más": ordenados por nombre
export function textoResponsables(ids: string[], nombre: (id: string) => string | undefined, maximo = 3) {
  const nombres = ids.map(id => nombre(id) ?? "Persona").sort((a, b) => a.localeCompare(b, "es"))
  if (nombres.length <= maximo) return nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}` : (nombres[0] ?? "")
  return `${nombres.slice(0, maximo - 1).join(", ")} y ${nombres.length - maximo + 1} más`
}

// La etiqueta de responsables de una tarjeta (junto a las de los lotes)
export function ChipResponsables({ ids, nombre, completo = false }: {
  ids: string[]
  nombre: (id: string) => string | undefined
  completo?: boolean            // en el detalle: todos, sin "y N más"
}) {
  if (ids.length === 0) return null
  const texto = textoResponsables(ids, nombre, completo ? Infinity : 3)
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium" title={textoResponsables(ids, nombre, Infinity)}>
      <UserRound className="h-3 w-3 shrink-0" /> {texto}
    </span>
  )
}
