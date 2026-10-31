"use client"

import { useEffect, useRef, useState } from "react"
import { Download, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { descargarArchivo, urlParaVer, type BucketArchivos } from "@/lib/queries/archivos"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { extensionDe, formatoDe, formatoTamano } from "@/components/lotes/archivos"

/**
 * Visor de archivos de todo el sistema (lotes, actividades, economía): se ven en una ventana antes
 * de descargarlos, igual en la computadora y en el celular (en el celular ocupa toda la pantalla).
 *   - Imágenes (JPG, PNG, WEBP; HEIC solo donde el navegador lo abre, como el iPhone).
 *   - PDF: se dibuja página por página con pdf.js (anda también en Android, donde el navegador no
 *     muestra PDF dentro de la página).
 *   - Texto y CSV: como texto.
 *   - Word, Excel y PowerPoint: ningún navegador los muestra; se ofrece descargarlos.
 * El archivo se pide con una URL firmada de 5 minutos; nunca hay URLs públicas.
 */

export interface ArchivoParaVer {
  nombre: string
  ruta: string
  tamano_bytes: number
  bucket?: BucketArchivos        // por defecto, el de lotes y actividades
}

const IMAGEN = new Set(["jpg", "jpeg", "png", "webp", "heic"])
const PDF = new Set(["pdf"])
const TEXTO = new Set(["txt", "csv"])
const MAX_PAGINAS = 50          // un PDF más largo se descarga para verlo entero

type Clase = "imagen" | "pdf" | "texto" | "otro"
const claseDe = (nombre: string): Clase => {
  const ext = extensionDe(nombre) ?? ""
  return IMAGEN.has(ext) ? "imagen" : PDF.has(ext) ? "pdf" : TEXTO.has(ext) ? "texto" : "otro"
}

export function VisorArchivo({ archivo, onCerrar }: { archivo: ArchivoParaVer | null; onCerrar: () => void }) {
  const [vista, setVista] = useState<{ ruta: string; url: string | null; error: string | null } | null>(null)
  const clase = archivo ? claseDe(archivo.nombre) : "otro"

  useEffect(() => {
    if (!archivo || clase === "otro") return
    let vigente = true
    urlParaVer(archivo.ruta, archivo.bucket)
      .then(url => { if (vigente) setVista({ ruta: archivo.ruta, url, error: null }) })
      .catch(err => { if (vigente) setVista({ ruta: archivo.ruta, url: null, error: mensajeDeError(err, "No se pudo abrir el archivo") }) })
    return () => { vigente = false }
  }, [archivo, clase])

  const actual = archivo && vista?.ruta === archivo.ruta ? vista : null

  const descargar = async () => {
    if (!archivo) return
    try {
      await descargarArchivo(archivo.ruta, archivo.nombre, archivo.bucket)
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo descargar el archivo"))
    }
  }

  const noSePuedeVer = (texto: string) => (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
      <FileText className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground max-w-xs">{texto}</p>
    </div>
  )

  return (
    <Dialog open={archivo !== null} onOpenChange={abre => { if (!abre) onCerrar() }}>
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-3 rounded-none p-3 sm:h-auto sm:max-h-[92vh] sm:w-[calc(100vw-2rem)] sm:max-w-4xl sm:rounded-xl sm:p-4">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="truncate">{archivo?.nombre}</DialogTitle>
          <DialogDescription>{archivo ? `${formatoDe(archivo.nombre)} · ${formatoTamano(archivo.tamano_bytes)}` : ""}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40">
          {clase === "otro" ? noSePuedeVer("Este formato no se puede ver en el navegador. Descargalo para abrirlo.")
            : actual?.error ? <p role="alert" className="p-6 text-sm text-destructive">{actual.error}</p>
            : !actual?.url ? <Cargando />
            : clase === "imagen" ? <VistaImagen url={actual.url} nombre={archivo!.nombre} sinVista={noSePuedeVer} />
            : clase === "pdf" ? <VistaPdf url={actual.url} />
            : <VistaTexto url={actual.url} />}
        </div>

        <div className="flex justify-end gap-2 pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => void descargar()}>
            <Download className="h-4 w-4 mr-1" /> Descargar
          </Button>
          <Button type="button" className="h-11 md:h-9" onClick={onCerrar}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Cargando() {
  return <div className="flex h-64 items-center justify-center" role="status"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
}

function VistaImagen({ url, nombre, sinVista }: { url: string; nombre: string; sinVista: (texto: string) => React.ReactNode }) {
  const [falla, setFalla] = useState(false)
  // HEIC: solo algunos navegadores (Safari) lo abren
  if (falla) return sinVista("Este navegador no puede mostrar esta imagen. Descargala para abrirla.")
  // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage
  return <img src={url} alt={nombre} onError={() => setFalla(true)} className="mx-auto max-h-full w-auto max-w-full object-contain" />
}

function VistaTexto({ url }: { url: string }) {
  const [texto, setTexto] = useState<{ url: string; contenido: string | null } | null>(null)
  useEffect(() => {
    let vigente = true
    fetch(url)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(t => { if (vigente) setTexto({ url, contenido: t }) })
      .catch(() => { if (vigente) setTexto({ url, contenido: null }) })
    return () => { vigente = false }
  }, [url])
  if (texto?.url !== url) return <Cargando />
  if (texto.contenido === null) return <p role="alert" className="p-6 text-sm text-destructive">No se pudo leer el archivo.</p>
  return <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">{texto.contenido}</pre>
}

// PDF con pdf.js: cada página en un canvas del ancho de la ventana (nítido en pantallas de alta densidad)
function VistaPdf({ url }: { url: string }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<{ url: string; paginas: number; error: string | null } | null>(null)

  useEffect(() => {
    let vigente = true
    let carga: { destroy: () => Promise<void> } | null = null   // libera el documento y el worker
    const destino = contenedor.current
    ;(async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"
        const tarea = pdfjs.getDocument({ url })
        carga = tarea
        const pdf = await tarea.promise
        if (!vigente || !destino) return
        setEstado({ url, paginas: pdf.numPages, error: null })
        destino.replaceChildren()
        const ancho = Math.max(280, destino.clientWidth - 16)
        const densidad = Math.min(window.devicePixelRatio || 1, 2)
        for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGINAS); n++) {
          const pagina = await pdf.getPage(n)
          if (!vigente) return
          const base = pagina.getViewport({ scale: 1 })
          const viewport = pagina.getViewport({ scale: (ancho / base.width) * densidad })
          const canvas = document.createElement("canvas")
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${Math.floor(viewport.width / densidad)}px`
          canvas.className = "mx-auto mb-2 block max-w-full bg-white shadow-sm"
          canvas.setAttribute("aria-label", `Página ${n}`)
          destino.appendChild(canvas)
          await pagina.render({ canvas, viewport }).promise
        }
      } catch {
        if (vigente) setEstado({ url, paginas: 0, error: "No se pudo mostrar el PDF. Descargalo para abrirlo." })
      }
    })()
    return () => { vigente = false; void carga?.destroy() }
  }, [url])

  const actual = estado?.url === url ? estado : null
  return (
    <div className="p-2">
      {!actual && <Cargando />}
      {actual?.error && <p role="alert" className="p-4 text-sm text-destructive">{actual.error}</p>}
      {actual && actual.paginas > MAX_PAGINAS && (
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          Se muestran las primeras {MAX_PAGINAS} de {actual.paginas} páginas. Descargalo para verlo entero.
        </p>
      )}
      <div ref={contenedor} />
    </div>
  )
}
