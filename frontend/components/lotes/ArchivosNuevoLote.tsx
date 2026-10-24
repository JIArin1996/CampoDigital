"use client"

import { useState } from "react"
import { FileText, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ElegirArchivo } from "@/components/lotes/ElegirArchivo"
import { nuevoId } from "@/components/actividades/formato"
import { FORMATOS_PERMITIDOS, formatoDe, formatoTamano, validarArchivo } from "@/components/lotes/archivos"
import type { ArchivoPorSubir, TipoArchivo } from "@/types/archivos"

/**
 * Archivos para el lote que se está creando: un lugar para la trazabilidad (opcional) y otros
 * archivos. No sube nada: el formulario los sube después de crear el lote.
 */
export function ArchivosNuevoLote({ valor, onCambio, disabled = false }: {
  valor: ArchivoPorSubir[]
  onCambio: (archivos: ArchivoPorSubir[]) => void
  disabled?: boolean
}) {
  const [avisos, setAvisos] = useState<string[]>([])

  const trazabilidad = valor.find(a => a.tipo === "trazabilidad")
  const otros = valor.filter(a => a.tipo === "otro")

  const agregar = (files: File[], tipo: TipoArchivo) => {
    const errores = files.map(validarArchivo).filter((m): m is string => m !== null)
    const validos = files.filter(f => validarArchivo(f) === null)
    setAvisos(errores)
    if (validos.length === 0) return
    const nuevos = validos.map(file => ({ id: nuevoId(), file, tipo }))
    // La trazabilidad es una sola: elegir otra reemplaza a la anterior
    onCambio(tipo === "trazabilidad" ? [...otros, nuevos[0]] : [...valor, ...nuevos])
  }

  const sacar = (id: string) => {
    setAvisos([])
    onCambio(valor.filter(a => a.id !== id))
  }

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Trazabilidad <span className="font-normal text-muted-foreground">(opcional)</span></p>
        {trazabilidad
          ? <FilaArchivo archivo={trazabilidad} onSacar={sacar} disabled={disabled} />
          : <ElegirArchivo etiqueta="Elegir archivo" disabled={disabled} onElegir={files => agregar(files, "trazabilidad")} />}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Otros archivos</p>
        {otros.length > 0 && (
          <ul className="space-y-2">
            {otros.map(a => <li key={a.id}><FilaArchivo archivo={a} onSacar={sacar} disabled={disabled} /></li>)}
          </ul>
        )}
        <ElegirArchivo etiqueta={otros.length > 0 ? "Agregar otro archivo" : "Agregar archivo"} multiple disabled={disabled}
          onElegir={files => agregar(files, "otro")} />
      </div>

      <p className="text-xs text-muted-foreground">{FORMATOS_PERMITIDOS}. Hasta 20 MB cada uno.</p>
      {avisos.map(m => <p key={m} role="alert" className="text-sm text-destructive">{m}</p>)}
    </div>
  )
}

function FilaArchivo({ archivo, onSacar, disabled }: { archivo: ArchivoPorSubir; onSacar: (id: string) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{archivo.file.name}</p>
        <p className="text-xs text-muted-foreground">{formatoDe(archivo.file.name)} · {formatoTamano(archivo.file.size)}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" disabled={disabled}
        aria-label={`No subir ${archivo.file.name}`} onClick={() => onSacar(archivo.id)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
