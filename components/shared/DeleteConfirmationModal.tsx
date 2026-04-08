import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface DeleteConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  title?: string
  description?: string
  expectedText?: string
  isDeleting?: boolean
}

export function DeleteConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  title = "Eliminar de forma definitiva",
  description = "Esta acción no se puede deshacer. Escribe 'ELIMINAR' para confirmar.",
  expectedText = "ELIMINAR",
  isDeleting = false,
}: DeleteConfirmationModalProps) {
  const [confirmationText, setConfirmationText] = useState("")

  const handleOpenChange = (nuevoOpen: boolean) => {
    if (!nuevoOpen) {
      setConfirmationText("")
    }
    onOpenChange(nuevoOpen)
  }

  const handleDelete = () => {
    if (confirmationText === expectedText) {
      onConfirm()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-destructive">{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Input
            id="confirmation"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder={expectedText}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete} 
            disabled={confirmationText !== expectedText || isDeleting}
          >
            {isDeleting ? "Eliminando..." : "Eliminar Definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
