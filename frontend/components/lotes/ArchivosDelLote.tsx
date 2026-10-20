"use client"

import { useEffect, useState } from "react"
import { Download, EyeOff, FileText, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { descargarArchivo, getArchivosLote, quitarArchivo, restaurarArchivo, subirArchivoALote } from "@/lib/queries/archivos"
import { getPersonas } from "@/lib/queries/bitacora"
import { getLotesPorIds } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ElegirArchivo } from "@/components/lotes/ElegirArchivo"
import { nuevoId } from "@/components/actividades/formato"
import { guardarPendientes, leerPendientes } from "@/components/lotes/archivosPendientes"
import {
  ETIQUETA_TIPO_ARCHIVO, FORMATOS_PERMITIDOS, formatoDe, formatoTamano, validarArchivo,
} from "@/components/lotes/archivos"
import { cn } from "@/lib/utils"
import type { ArchivoDeLote, ArchivoPorSubir, TipoArchivo } from "@/types/archivos"
import type { Lote } from "@/types/lotes"

interface Datos {
  clave: string
  archivos: ArchivoDeLote[]
  personas: { nombre: string; user_id: string | null }[]
  nombresLote: Map<string, string>
}

const fechaSubida = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" })

/**
 * Archivos de la ficha del lote. Todos los miembros ven y descargan. Quien puede cargar adjunta
 * (solo con el lote abierto). El administrador quita (oculta) y restaura; nada se borra.
 */
export function ArchivosDelLote({ lote, puedeOperar, esAdmin }: { lote: Lote; puedeOperar: boolean; esAdmin: boolean }) {
  const abierto = lote.estado === "activo"
  const puedeAdjuntar = puedeOperar && abierto
  const puedeQuitar = esAdmin && abierto

  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [verQuitados, setVerQuitados] = useState(false)
  const [tipo, setTipo] = useState<TipoArchivo>("otro")
  const [subiendo, setSubiendo] = useState<string | null>(null)   // nombre del que se está subiendo
  const [fallidos, setFallidos] = useState<{ archivo: ArchivoPorSubir; mensaje: string }[]>(
    () => leerPendientes(lote.id).map(archivo => ({ archivo, mensaje: "No se pudo subir al crear el lote" })))
  const [avisos, setAvisos] = useState<string[]>([])
  const [aQuitar, setAQuitar] = useState<ArchivoDeLote | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    let vigente = true
    const clave = `${lote.id}:${version}`
    Promise.all([getArchivosLote(lote.id, { incluirQuitados: esAdmin }), getPersonas(lote.establecimiento_id)])
      .then(async ([archivos, personas]) => {
        const origenes = [...new Set(archivos.map(a => a.heredado_de_lote_id).filter((x): x is string => x !== null))]
        const lotes = await getLotesPorIds(origenes)
        return { clave, archivos, personas, nombresLote: new Map(lotes.map(l => [l.id, l.nombre])) }
      })
      .then(d => { if (vigente) { setDatos(d); setError(null) } })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los archivos")) })
    return () => { vigente = false }
  }, [lote.id, lote.establecimiento_id, esAdmin, version])

  // Los que fallan quedan en la lista para reintentar (también si se sale y se vuelve a la ficha)
  const subir = async (lista: ArchivoPorSubir[]) => {
    const nuevosFallidos: { archivo: ArchivoPorSubir; mensaje: string }[] = []
    for (const a of lista) {
      setSubiendo(a.file.name)
      try {
        await subirArchivoALote(lote.establecimiento_id, lote.id, a)
      } catch (err) {
        nuevosFallidos.push({ archivo: a, mensaje: mensajeDeError(err, "No se pudo subir") })
      }
    }
    setSubiendo(null)
    const ids = new Set(lista.map(a => a.id))
    setFallidos(previos => {
      const restantes = [...previos.filter(f => !ids.has(f.archivo.id)), ...nuevosFallidos]
      guardarPendientes(lote.id, restantes.map(f => f.archivo))
      return restantes
    })
    const subidos = lista.length - nuevosFallidos.length
    if (subidos > 0) toast.success(subidos === 1 ? "Archivo adjuntado" : `${subidos} archivos adjuntados`)
    setVersion(v => v + 1)
  }

  const elegir = (files: File[]) => {
    setAvisos(files.map(validarArchivo).filter((m): m is string => m !== null))
    const validos = files.filter(f => validarArchivo(f) === null)
    if (validos.length > 0) void subir(validos.map(file => ({ id: nuevoId(), file, tipo })))
  }

  const descartar = (id: string) => {
    setFallidos(previos => {
      const restantes = previos.filter(f => f.archivo.id !== id)
      guardarPendientes(lote.id, restantes.map(f => f.archivo))
      return restantes
    })
  }

  const descargar = async (a: ArchivoDeLote) => {
    try {
      await descargarArchivo(a.archivo.ruta, a.archivo.nombre)
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo descargar el archivo"))
    }
  }

  const ejecutar = async (accion: () => Promise<void>, ok: string) => {
    setTrabajando(true)
    try {
      await accion()
      toast.success(ok)
      setAQuitar(null)
      setVersion(v => v + 1)
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setTrabajando(false)
    }
  }

  const vigentes = datos && datos.clave.startsWith(`${lote.id}:`) ? datos : null
  const visibles = vigentes?.archivos.filter(a => !a.oculto) ?? []
  const quitados = vigentes?.archivos.filter(a => a.oculto) ?? []
  const nombreUsuario = (userId: string | null) =>
    vigentes?.personas.find(p => p.user_id && p.user_id === userId)?.nombre ?? "otro usuario"

  const fila = (a: ArchivoDeLote) => (
    <li key={a.archivo_id} className={cn("flex items-start gap-3 px-4 py-3", a.oculto && "opacity-70")}>
      <FileText className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => descargar(a)}
          className="max-w-full truncate text-left text-sm font-medium text-primary hover:underline min-h-6">
          {a.archivo.nombre}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {a.archivo.tipo === "trazabilidad" && <Badge>{ETIQUETA_TIPO_ARCHIVO.trazabilidad}</Badge>}
          <Badge variant="outline">{formatoDe(a.archivo.nombre)}</Badge>
          <span className="text-xs text-muted-foreground">{formatoTamano(a.archivo.tamano_bytes)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {fechaSubida(a.archivo.created_at)} · subió {nombreUsuario(a.archivo.created_by)}
          {a.heredado_de_lote_id && ` · heredado de ${vigentes?.nombresLote.get(a.heredado_de_lote_id) ?? "otro lote"}`}
        </p>
        {a.oculto && a.ocultado_en && (
          <p className="mt-1 text-xs text-muted-foreground">Quitado el {fechaSubida(a.ocultado_en)} por {nombreUsuario(a.ocultado_por)}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
        <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label={`Descargar ${a.archivo.nombre}`} onClick={() => descargar(a)}>
          <Download className="h-4 w-4" />
        </Button>
        {puedeQuitar && !a.oculto && (
          <Button type="button" variant="ghost" size="sm" className="h-10 md:h-8 text-muted-foreground" disabled={trabajando} onClick={() => setAQuitar(a)}>
            <EyeOff className="h-4 w-4 mr-1" /> Quitar
          </Button>
        )}
        {puedeQuitar && a.oculto && (
          <Button type="button" variant="outline" size="sm" className="h-10 md:h-8" disabled={trabajando}
            onClick={() => ejecutar(() => restaurarArchivo(lote.id, a.archivo_id), "Archivo restaurado")}>
            <RotateCcw className="h-4 w-4 mr-1" /> Restaurar
          </Button>
        )}
      </div>
    </li>
  )

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-base">Archivos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!abierto && <p className="text-sm text-muted-foreground">Lote cerrado: los archivos se pueden descargar, pero no se agregan ni se quitan.</p>}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {!vigentes && !error ? (
          <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
        ) : visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin archivos.</p>
        ) : (
          <ul className="rounded-lg border divide-y bg-card">{visibles.map(fila)}</ul>
        )}

        {/* No subidos (al crear el lote o recién): reintentar sin volver a elegirlos */}
        {fallidos.length > 0 && (
          <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
            <p className="text-sm font-medium">No se pudieron subir</p>
            <ul className="space-y-2">
              {fallidos.map(f => (
                <li key={f.archivo.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{f.archivo.file.name}</p>
                    <p className="text-xs text-destructive">{f.mensaje}</p>
                  </div>
                  <div className="flex gap-2">
                    {puedeAdjuntar && (
                      <Button type="button" variant="outline" size="sm" className="h-10 md:h-8" disabled={subiendo !== null}
                        onClick={() => void subir([f.archivo])}>
                        <RotateCcw className="h-4 w-4 mr-1" /> Reintentar
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" className="h-10 md:h-8" disabled={subiendo !== null}
                      onClick={() => descartar(f.archivo.id)}>
                      Descartar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Adjuntar */}
        {puedeAdjuntar && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tipo de archivo">
              <span className="text-sm">Tipo:</span>
              {(["trazabilidad", "otro"] as const).map(t => (
                <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}
                  className={cn("min-h-10 md:min-h-8 rounded-full border px-3 text-sm transition-colors",
                    tipo === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {ETIQUETA_TIPO_ARCHIVO[t]}
                </button>
              ))}
            </div>
            {subiendo ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> Subiendo {subiendo}…
              </p>
            ) : (
              <ElegirArchivo etiqueta="Adjuntar archivo" multiple onElegir={elegir} />
            )}
            <p className="text-xs text-muted-foreground">{FORMATOS_PERMITIDOS}. Hasta 20 MB cada uno.</p>
            {avisos.map(m => <p key={m} role="alert" className="text-sm text-destructive">{m}</p>)}
          </div>
        )}

        {/* Quitados: solo el administrador los ve */}
        {esAdmin && quitados.length > 0 && (
          <div className="space-y-2">
            <Button type="button" variant="ghost" size="sm" className="h-10 md:h-8 px-0 text-muted-foreground" onClick={() => setVerQuitados(v => !v)}>
              {verQuitados ? "Ocultar quitados" : `Ver quitados (${quitados.length})`}
            </Button>
            {verQuitados && <ul className="rounded-lg border divide-y bg-muted/20">{quitados.map(fila)}</ul>}
          </div>
        )}
      </CardContent>

      {/* Quitar: confirmación */}
      <Dialog open={aQuitar !== null} onOpenChange={abre => { if (!abre) setAQuitar(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quitar archivo</DialogTitle>
            <DialogDescription>
              {aQuitar?.archivo.nombre} deja de verse en este lote. No se borra: sigue en los otros lotes donde esté
              y se puede restaurar desde &quot;Ver quitados&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={trabajando}
              onClick={() => aQuitar && ejecutar(() => quitarArchivo(lote.id, aQuitar.archivo_id), "Archivo quitado")}>
              Quitar
            </Button>
            <Button type="button" variant="outline" onClick={() => setAQuitar(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
