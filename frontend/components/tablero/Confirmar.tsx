"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

// Lo que se pregunta antes de algo que no se deshace (en lugar de window.confirm)
export interface Pregunta {
  titulo: string
  texto: string
  boton: string
  accion: () => void
}

// Confirmación propia del tablero: foco atrapado, Esc cancela, el botón dice lo que hace
export function Confirmar({ pregunta, onCerrar }: { pregunta: Pregunta | null; onCerrar: () => void }) {
  if (!pregunta) return null
  return (
    <Dialog open onOpenChange={abierto => { if (!abierto) onCerrar() }}>
      <DialogContent className="w-[440px] max-w-[calc(100vw-2rem)] sm:max-w-[440px]">
        <DialogTitle>{pregunta.titulo}</DialogTitle>
        <DialogDescription>{pregunta.texto}</DialogDescription>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button variant="destructive" onClick={() => { pregunta.accion(); onCerrar() }}>{pregunta.boton}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
