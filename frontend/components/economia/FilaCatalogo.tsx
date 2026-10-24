"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CAMPO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"

/**
 * Fila de un catálogo (concepto, grupo o titular): renombrar, dar de baja o reactivar y borrar.
 * Borrar pide confirmación en la misma fila; si está en uso, la base lo impide y el mensaje sugiere
 * darlo de baja. `extra` va entre el nombre y los botones (por ejemplo, el grupo de un concepto).
 */
export function FilaCatalogo({ nombre, activo, enviando, etiqueta, onRenombrar, onActivo, onBorrar, extra }: {
  nombre: string
  activo: boolean
  enviando: boolean
  etiqueta: string                     // "concepto", "grupo", "titular": para los aria-label
  onRenombrar: (nombre: string) => void
  onActivo: (activo: boolean) => void
  onBorrar: () => void
  extra?: React.ReactNode
}) {
  const [valor, setValor] = useState(nombre)
  const [confirmar, setConfirmar] = useState(false)
  const cambiado = valor.trim() !== nombre

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <Input aria-label={`Nombre del ${etiqueta} ${nombre}`} className={cn(CAMPO, "flex-1 min-w-40", !activo && "text-muted-foreground line-through")}
        value={valor} onChange={e => setValor(e.target.value)} disabled={!activo} />
      {extra}
      {cambiado && (
        <Button type="button" size="sm" className="h-10 md:h-8" disabled={enviando || !valor.trim()} onClick={() => onRenombrar(valor.trim())}>
          Guardar
        </Button>
      )}
      {confirmar ? (
        <span className="flex items-center gap-1">
          <span className="text-sm">¿Borrar?</span>
          <Button type="button" variant="destructive" size="sm" className="h-10 md:h-8" disabled={enviando}
            onClick={() => { setConfirmar(false); onBorrar() }}>
            Sí
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-10 md:h-8" onClick={() => setConfirmar(false)}>No</Button>
        </span>
      ) : (
        <>
          <Button type="button" variant="ghost" size="sm" className={cn("h-10 md:h-8", activo ? "text-muted-foreground" : "text-primary")}
            disabled={enviando} onClick={() => onActivo(!activo)}>
            {activo ? "Dar de baja" : "Reactivar"}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 md:h-8 md:w-8 text-muted-foreground"
            aria-label={`Borrar ${etiqueta} ${nombre}`} disabled={enviando} onClick={() => setConfirmar(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </li>
  )
}
