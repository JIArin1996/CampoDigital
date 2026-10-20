// Formatos de archivos del lote: la misma lista cerrada que la base (bucket lote-archivos y
// _archivo_permitido), repetida en la app para avisar antes de subir. La base los valida igual.

import type { TipoArchivo } from "@/types/archivos"

export const TAMANO_MAXIMO = 20 * 1024 * 1024   // 20 MB

// Tipo MIME con el que se sube cada extensión. Se toma de la extensión y no de lo que diga el
// navegador: Windows manda los .csv como application/vnd.ms-excel y algunos teléfonos mandan los
// .heic sin tipo. Así el tipo siempre coincide con la extensión, que es lo que exige la base.
export const MIME_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
}

const FORMATO: Record<string, string> = {
  pdf: "PDF", doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel", csv: "CSV", txt: "Texto",
  ppt: "PowerPoint", pptx: "PowerPoint", jpg: "Imagen", jpeg: "Imagen", png: "Imagen", webp: "Imagen", heic: "Imagen",
}

// Para el selector de archivos: extensiones y tipos (algunos teléfonos filtran solo por uno de los dos)
export const ACEPTA = [
  ...Object.keys(MIME_POR_EXTENSION).map(e => `.${e}`),
  ...new Set(Object.values(MIME_POR_EXTENSION)),
].join(",")

export const FORMATOS_PERMITIDOS = "PDF, Word, Excel, CSV, TXT, PowerPoint e imágenes (JPG, PNG, WEBP, HEIC)"

export const ETIQUETA_TIPO_ARCHIVO: Record<TipoArchivo, string> = {
  trazabilidad: "Trazabilidad",
  otro: "Otro",
}

export const extensionDe = (nombre: string) => /\.([A-Za-z0-9]+)$/.exec(nombre)?.[1].toLowerCase() ?? null

export const mimeDe = (nombre: string) => MIME_POR_EXTENSION[extensionDe(nombre) ?? ""] ?? null

export const formatoDe = (nombre: string) => FORMATO[extensionDe(nombre) ?? ""] ?? "Archivo"

// "850 B", "120 KB", "3,4 MB"
export function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
}

// null si el archivo se puede subir; si no, el mensaje para mostrar
export function validarArchivo(file: File): string | null {
  const nombre = file.name.trim()
  if (!mimeDe(nombre)) return `"${file.name}": formato no permitido. Se aceptan ${FORMATOS_PERMITIDOS}.`
  if (file.size === 0) return `"${file.name}" está vacío.`
  if (file.size > TAMANO_MAXIMO) return `"${file.name}" pesa ${formatoTamano(file.size)}: el máximo es 20 MB.`
  if (nombre.length > 255) return `El nombre de "${nombre.slice(0, 40)}…" es demasiado largo (hasta 255 caracteres).`
  return null
}
