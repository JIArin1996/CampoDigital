"use client"

import { useEffect, useState } from "react"
import { Download, EyeOff, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { descargarArchivo, getArchivosActividad, quitarArchivoActividad, subirArchivoAActividad } from "@/lib/queries/archivos"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ElegirArchivo } from "@/components/lotes/ElegirArchivo"
import { VisorArchivo } from "@/components/shared/VisorArchivo"
import { nuevoId } from "@/components/actividades/formato"
import { FORMATOS_PERMITIDOS, formatoDe, formatoTamano, validarArchivo } from "@/components/lotes/archivos"
import type { ArchivoDeActividad } from "@/types/archivos"

const fechaSubida = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" })

/**
 * Archivos de una actividad (planilla de la balanza, fotos...). Todos los miembros los ven (en el
 * visor, tocando el nombre) y los descargan; quien puede cargar adjunta (si la actividad no está anulada); el administrador quita
 * (oculta). Nada se borra.
 */
export function ArchivosDeActividad({ actividadId, establecimientoId, puedeAdjuntar, esAdmin }: {
  actividadId: string
  establecimientoId: string
  puedeAdjuntar: boolean
  esAdmin: boolean
}) {
  const [datos, setDatos] = useState<{ clave: string; archivos: ArchivoDeActividad[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [trabajando, setTrabajando] = useState(false)
  const [viendo, setViendo] = useState<ArchivoDeActividad | null>(null)

  useEffect(() => {
    let vigente = true
    getArchivosActividad(actividadId)
      .then(archivos => { if (vigente) { setDatos({ clave: `${actividadId}:${version}`, archivos }); setError(null) } })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los archivos")) })
    return () => { vigente = false }
  }, [actividadId, version])

  const elegir = async (files: File[]) => {
    setAvisos(files.map(validarArchivo).filter((m): m is string => m !== null))
    const validos = files.filter(f => validarArchivo(f) === null)
    let subidos = 0
    for (const file of validos) {
      setSubiendo(file.name)
      try {
        await subirArchivoAActividad(establecimientoId, actividadId, { id: nuevoId(), file })
        subidos++
      } catch (err) {
        toast.error(mensajeDeError(err, `No se pudo subir ${file.name}`))
      }
    }
    setSubiendo(null)
    if (subidos > 0) toast.success(subidos === 1 ? "Archivo adjuntado" : `${subidos} archivos adjuntados`)
    setVersion(v => v + 1)
  }

  const descargar = async (a: ArchivoDeActividad) => {
    try {
      await descargarArchivo(a.archivo.ruta, a.archivo.nombre)
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo descargar el archivo"))
    }
  }

  const quitar = async (a: ArchivoDeActividad) => {
    setTrabajando(true)
    try {
      await quitarArchivoActividad(actividadId, a.archivo_id)
      toast.success("Archivo quitado")
      setVersion(v => v + 1)
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setTrabajando(false)
    }
  }

  const archivos = datos?.clave.startsWith(`${actividadId}:`) ? datos.archivos : null
  // Sin archivos y sin poder adjuntar: la sección no aporta nada
  if (archivos && archivos.length === 0 && !puedeAdjuntar) return null

  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-base">Archivos</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!archivos && !error ? (
          <div className="h-14 rounded-lg bg-muted/30 animate-pulse" />
        ) : archivos && archivos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin archivos.</p>
        ) : archivos && (
          <ul className="rounded-lg border divide-y bg-card">
            {archivos.map(a => (
              <li key={a.archivo_id} className="flex items-start gap-3 px-4 py-3">
                <FileText className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => setViendo(a)} title={`Ver ${a.archivo.nombre}`}
                    className="max-w-full truncate text-left text-sm font-medium text-primary hover:underline min-h-6">
                    {a.archivo.nombre}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{formatoDe(a.archivo.nombre)}</Badge>
                    <span className="text-xs text-muted-foreground">{formatoTamano(a.archivo.tamano_bytes)} · {fechaSubida(a.archivo.created_at)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label={`Descargar ${a.archivo.nombre}`} onClick={() => descargar(a)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {esAdmin && (
                    <Button type="button" variant="ghost" size="sm" className="h-10 md:h-8 text-muted-foreground" disabled={trabajando} onClick={() => quitar(a)}>
                      <EyeOff className="h-4 w-4 mr-1" /> Quitar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {puedeAdjuntar && (
          <div className="space-y-2">
            {subiendo ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> Subiendo {subiendo}…
              </p>
            ) : (
              <ElegirArchivo etiqueta="Adjuntar archivo" multiple onElegir={files => void elegir(files)} />
            )}
            <p className="text-xs text-muted-foreground">{FORMATOS_PERMITIDOS}. Hasta 20 MB cada uno.</p>
            {avisos.map(m => <p key={m} role="alert" className="text-sm text-destructive">{m}</p>)}
          </div>
        )}
      </CardContent>
      <VisorArchivo archivo={viendo?.archivo ?? null} onCerrar={() => setViendo(null)} />
    </Card>
  )
}
