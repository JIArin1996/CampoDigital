"use client"

import { useEffect, useState } from "react"

import { urlFoto } from "@/lib/queries/usuarios"
import { cn } from "@/lib/utils"

interface AvatarProps {
  nombre: string
  apellido?: string | null
  fotoPath?: string | null
  className?: string   // tamaño, por ejemplo "h-10 w-10 text-sm"
}

export const iniciales = (nombre: string, apellido?: string | null) =>
  `${nombre.trim()[0] ?? ""}${apellido?.trim()[0] ?? ""}`.toUpperCase() || "?"

/**
 * Foto de perfil (URL firmada del bucket privado) o, si no hay, las iniciales.
 */
export function Avatar({ nombre, apellido, fotoPath, className }: AvatarProps) {
  const [url, setUrl] = useState<{ path: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!fotoPath) return
    let vigente = true
    urlFoto(fotoPath).then(u => {
      if (vigente) setUrl({ path: fotoPath, url: u })
    })
    return () => { vigente = false }
  }, [fotoPath])

  const src = fotoPath && url?.path === fotoPath ? url.url : null

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground",
        className ?? "h-10 w-10 text-sm"
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada que vence: no conviene el optimizador de imágenes
        <img src={src} alt={`Foto de ${nombre}`} className="h-full w-full object-cover" />
      ) : (
        iniciales(nombre, apellido)
      )}
    </span>
  )
}
