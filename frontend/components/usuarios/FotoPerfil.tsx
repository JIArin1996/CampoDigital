"use client"

import { useRef, useState } from "react"
import { Camera, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "@/components/usuarios/Avatar"
import { Button } from "@/components/ui/button"
import { quitarFoto, subirFoto } from "@/lib/queries/usuarios"
import { mensajeDeError } from "@/lib/supabase/errores"
import type { Perfil } from "@/types/database"

const LADO = 256

/**
 * Recorta la foto al centro en un cuadrado y la achica a 256 px antes de subirla:
 * una foto del celular pesa varios MB y el bucket acepta hasta 1 MB.
 */
async function achicarImagen(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo)
  const lado = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = LADO
  canvas.height = LADO
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("No se pudo procesar la imagen")
  ctx.drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, LADO, LADO)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), "image/webp", 0.85)
  )
}

export function FotoPerfil({ perfil, onCambio }: { perfil: Perfil; onCambio: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ""
    if (!archivo) return
    if (!archivo.type.startsWith("image/")) {
      toast.error("Elegí una imagen")
      return
    }

    setSubiendo(true)
    try {
      const chica = await achicarImagen(archivo)
      await subirFoto(perfil.id, chica, perfil.foto_path)
      toast.success("Foto actualizada")
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo subir la foto"))
    } finally {
      setSubiendo(false)
    }
  }

  const quitar = async () => {
    setSubiendo(true)
    try {
      await quitarFoto(perfil.id, perfil.foto_path)
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo quitar la foto"))
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar nombre={perfil.nombre} apellido={perfil.apellido} fotoPath={perfil.foto_path} className="h-20 w-20 text-2xl" />
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={elegir} />
        <Button type="button" variant="outline" className="h-11 md:h-9" disabled={subiendo} onClick={() => input.current?.click()}>
          <Camera className="h-4 w-4 mr-1" />
          {subiendo ? "Subiendo..." : perfil.foto_path ? "Cambiar foto" : "Agregar foto"}
        </Button>
        {perfil.foto_path && (
          <Button type="button" variant="ghost" className="h-11 md:h-9 text-muted-foreground" disabled={subiendo} onClick={quitar}>
            <Trash2 className="h-4 w-4 mr-1" />
            Quitar
          </Button>
        )}
      </div>
    </div>
  )
}
