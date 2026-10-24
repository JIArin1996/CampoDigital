// Archivos que no se pudieron subir al crear un lote. Se guardan en memoria (no en el navegador:
// son los File elegidos) para que la ficha del lote ofrezca reintentar sin volver a elegirlos.
// Si se recarga la página se pierden y hay que volver a adjuntarlos desde la ficha.

import type { ArchivoPorSubir } from "@/types/archivos"

const pendientes = new Map<string, ArchivoPorSubir[]>()

export const guardarPendientes = (loteId: string, archivos: ArchivoPorSubir[]) => {
  if (archivos.length > 0) pendientes.set(loteId, archivos)
  else pendientes.delete(loteId)
}

export const leerPendientes = (loteId: string): ArchivoPorSubir[] => pendientes.get(loteId) ?? []
