"use client"

import { useRef } from "react"
import { Camera, Paperclip } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ACEPTA } from "@/components/lotes/archivos"

/**
 * Botones para elegir archivos: "Elegir archivo" (archivos, galería o cámara, según el teléfono) y,
 * en el celular, "Sacar foto" directo con la cámara. Devuelve los File elegidos sin validar.
 */
export function ElegirArchivo({ onElegir, etiqueta = "Elegir archivo", multiple = false, disabled = false }: {
  onElegir: (files: File[]) => void
  etiqueta?: string
  multiple?: boolean
  disabled?: boolean
}) {
  const archivoRef = useRef<HTMLInputElement>(null)
  const fotoRef = useRef<HTMLInputElement>(null)

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""   // permite volver a elegir el mismo archivo
    if (files.length > 0) onElegir(files)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="h-11 md:h-9" disabled={disabled} onClick={() => archivoRef.current?.click()}>
        <Paperclip className="h-4 w-4 mr-1" /> {etiqueta}
      </Button>
      <Button type="button" variant="outline" className="h-11 md:hidden" disabled={disabled} onClick={() => fotoRef.current?.click()}>
        <Camera className="h-4 w-4 mr-1" /> Sacar foto
      </Button>
      <input ref={archivoRef} type="file" accept={ACEPTA} multiple={multiple} className="hidden" tabIndex={-1} onChange={alElegir} />
      <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} onChange={alElegir} />
    </div>
  )
}
