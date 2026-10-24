"use client"

import { useRef, useState } from "react"
import { FileText, Loader2, Paperclip, X } from "lucide-react"
import { toast } from "sonner"

import { quitarArchivoMovimiento, subirArchivoAMovimiento } from "@/lib/queries/archivos"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { ElegirArchivo } from "@/components/lotes/ElegirArchivo"
import { VisorArchivo } from "@/components/economia/VisorArchivo"
import { nuevoId } from "@/components/actividades/formato"
import { ACEPTA, FORMATOS_PERMITIDOS, formatoTamano, validarArchivo } from "@/components/lotes/archivos"
import type { ArchivoDeMovimiento } from "@/types/economia"

export interface ArchivoElegido { id: string; file: File }

/**
 * Archivos elegidos en el formulario de carga (factura, recibo...): se suben después de guardar el
 * movimiento. Valida formato y tamaño al elegir.
 */
export function ElegirArchivosMovimiento({ elegidos, onCambio, disabled }: {
  elegidos: ArchivoElegido[]
  onCambio: (lista: ArchivoElegido[]) => void
  disabled?: boolean
}) {
  const [avisos, setAvisos] = useState<string[]>([])
  const elegir = (files: File[]) => {
    setAvisos(files.map(validarArchivo).filter((m): m is string => m !== null))
    const validos = files.filter(f => validarArchivo(f) === null)
    if (validos.length > 0) onCambio([...elegidos, ...validos.map(file => ({ id: nuevoId(), file }))])
  }
  return (
    <div className="space-y-2">
      {elegidos.length > 0 && (
        <ul className="rounded-lg border divide-y">
          {elegidos.map(a => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{a.file.name}</span>
              <span className="text-xs text-muted-foreground">{formatoTamano(a.file.size)}</span>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={`Sacar ${a.file.name}`} disabled={disabled}
                onClick={() => onCambio(elegidos.filter(e => e.id !== a.id))}>
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ElegirArchivo etiqueta="Adjuntar archivo" multiple disabled={disabled} onElegir={elegir} />
      <p className="text-xs text-muted-foreground">{FORMATOS_PERMITIDOS}. Hasta 20 MB cada uno.</p>
      {avisos.map(m => <p key={m} role="alert" className="text-sm text-destructive">{m}</p>)}
    </div>
  )
}

/**
 * Archivos de un movimiento en la lista: tocándolos se ven en una ventana (o se descargan desde ahí); quien puede cargar adjunta más
 * (si no está anulado) y quita (los oculta; no se borran).
 */
export function ArchivosDeMovimiento({ establecimientoId, movimientoId, archivos, puedeAdjuntar, onCambio }: {
  establecimientoId: string
  movimientoId: string
  archivos: ArchivoDeMovimiento[]
  puedeAdjuntar: boolean
  onCambio: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)   // qué se está haciendo, para el aviso
  const [viendo, setViendo] = useState<ArchivoDeMovimiento | null>(null)

  const subir = async (files: File[]) => {
    for (const file of files) {
      const aviso = validarArchivo(file)
      if (aviso) { toast.error(aviso); continue }
      setTrabajando(`Subiendo ${file.name}…`)
      try {
        await subirArchivoAMovimiento(establecimientoId, movimientoId, { id: nuevoId(), file })
        toast.success("Archivo adjuntado")
      } catch (err) {
        toast.error(mensajeDeError(err, "No se pudo subir el archivo"))
      }
    }
    setTrabajando(null)
    onCambio()
  }

  const quitar = async (a: ArchivoDeMovimiento) => {
    setTrabajando(`Quitando ${a.nombre}…`)
    try {
      await quitarArchivoMovimiento(a.id)
      toast.success("Archivo quitado")
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setTrabajando(null)
    }
  }

  if (archivos.length === 0 && !puedeAdjuntar) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {archivos.map(a => (
        <span key={a.id} className="inline-flex max-w-full items-center rounded-full border bg-muted/40 text-xs">
          <button type="button" className="inline-flex min-h-8 min-w-0 items-center gap-1 pl-2.5 pr-1 hover:underline" onClick={() => setViendo(a)}
            title={`Ver ${a.nombre}`}>
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-48">{a.nombre}</span>
          </button>
          {puedeAdjuntar && (
            <button type="button" className="inline-flex h-8 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              aria-label={`Quitar ${a.nombre}`} disabled={trabajando !== null} onClick={() => void quitar(a)}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      ))}
      {trabajando ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {trabajando}
        </span>
      ) : puedeAdjuntar && (
        <>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={() => inputRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5 mr-1" /> Adjuntar
          </Button>
          <input ref={inputRef} type="file" accept={ACEPTA} multiple className="hidden" tabIndex={-1}
            onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) void subir(files) }} />
        </>
      )}
      <VisorArchivo archivo={viendo} onCerrar={() => setViendo(null)} />
    </div>
  )
}
