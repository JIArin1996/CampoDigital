"use client"

import { useEffect, useState } from "react"
import { Download, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { descargarArchivoMovimiento, urlParaVerArchivoMovimiento } from "@/lib/queries/archivos"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { extensionDe, formatoDe, formatoTamano } from "@/components/lotes/archivos"
import type { ArchivoDeMovimiento } from "@/types/economia"

// Lo que el navegador muestra solo: imágenes (HEIC no, salvo Safari), PDF y texto
const IMAGEN = new Set(["jpg", "jpeg", "png", "webp"])
const DOCUMENTO = new Set(["pdf", "txt", "csv"])

/**
 * Ver un archivo de un movimiento sin descargarlo: imágenes, PDF y texto se muestran en la ventana;
 * Word, Excel, PowerPoint y HEIC no se pueden ver en el navegador y se ofrecen para descargar.
 */
export function VisorArchivo({ archivo, onCerrar }: { archivo: ArchivoDeMovimiento | null; onCerrar: () => void }) {
  const [vista, setVista] = useState<{ id: string; url: string | null; error: string | null } | null>(null)
  const ext = archivo ? extensionDe(archivo.nombre) ?? "" : ""
  const visible = IMAGEN.has(ext) || DOCUMENTO.has(ext)

  useEffect(() => {
    if (!archivo || !visible) return
    let vigente = true
    urlParaVerArchivoMovimiento(archivo)
      .then(url => { if (vigente) setVista({ id: archivo.id, url, error: null }) })
      .catch(err => { if (vigente) setVista({ id: archivo.id, url: null, error: mensajeDeError(err, "No se pudo abrir el archivo") }) })
    return () => { vigente = false }
  }, [archivo, visible])

  const actual = archivo && vista?.id === archivo.id ? vista : null

  const descargar = async () => {
    if (!archivo) return
    try {
      await descargarArchivoMovimiento(archivo)
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo descargar el archivo"))
    }
  }

  return (
    <Dialog open={archivo !== null} onOpenChange={abre => { if (!abre) onCerrar() }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl sm:max-w-4xl max-h-[92vh] flex flex-col gap-3 p-3 sm:p-4">
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate">{archivo?.nombre}</DialogTitle>
          <DialogDescription>{archivo ? `${formatoDe(archivo.nombre)} · ${formatoTamano(archivo.tamano_bytes)}` : ""}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30">
          {!visible ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 p-6 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Este formato no se puede ver en el navegador. Descargalo para abrirlo.</p>
            </div>
          ) : actual?.error ? (
            <p role="alert" className="p-6 text-sm text-destructive">{actual.error}</p>
          ) : !actual?.url ? (
            <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : IMAGEN.has(ext) ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage
            <img src={actual.url} alt={archivo?.nombre ?? ""} className="mx-auto max-h-[75vh] w-auto object-contain" />
          ) : (
            <iframe src={actual.url} title={archivo?.nombre ?? "Archivo"} className="h-[75vh] w-full bg-white" />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10 md:h-9" onClick={() => void descargar()}>
            <Download className="h-4 w-4 mr-1" /> Descargar
          </Button>
          <Button type="button" className="h-10 md:h-9" onClick={onCerrar}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
