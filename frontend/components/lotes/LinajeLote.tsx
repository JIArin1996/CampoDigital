"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, GitBranch } from "lucide-react"

import { getLinaje } from "@/lib/queries/lotes"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ETIQUETA_EVENTO, fechaCorta } from "@/components/lotes/formato"
import type { FilaLinaje } from "@/types/lotes"

/**
 * De qué lotes viene este lote y en qué lotes terminó, por divisiones y uniones.
 * Si hay un ciclo (dividir y volver a unir), el otro lote aparece en las dos listas.
 */
export function LinajeLote({ loteId, version }: { loteId: string; version: number }) {
  const [filas, setFilas] = useState<{ clave: string; datos: FilaLinaje[] } | null>(null)
  const [error, setError] = useState(false)
  const clave = `${loteId}:${version}`

  useEffect(() => {
    let vigente = true
    getLinaje(loteId)
      .then(datos => { if (vigente) setFilas({ clave: `${loteId}:${version}`, datos }) })
      .catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [loteId, version])

  const datos = filas?.clave === clave ? filas.datos : filas?.datos ?? null
  const ancestros = (datos ?? []).filter(f => f.relacion === "ancestro")
  const descendientes = (datos ?? []).filter(f => f.relacion === "descendiente")

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="h-4 w-4" /> Linaje
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-destructive">No se pudo cargar el linaje.</p>
        ) : !datos ? (
          <div className="h-16 rounded bg-muted animate-pulse" />
        ) : datos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este lote no viene de otro ni se dividió o unió a otro.</p>
        ) : (
          <>
            <Grupo titulo="Viene de" filas={ancestros} />
            <Grupo titulo="Pasó a" filas={descendientes} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Grupo({ titulo, filas }: { titulo: string; filas: FilaLinaje[] }) {
  if (filas.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{titulo}</p>
      <ul className="divide-y rounded-lg border">
        {filas.map(f => (
          <li key={`${f.relacion}-${f.lote_id}`}>
            <Link href={`/lotes/${f.lote_id}`} className="flex items-center gap-3 px-3 min-h-14 py-2 hover:bg-muted/50 active:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium truncate">{f.nombre}</span>
                  {f.estado === "cerrado" && <Badge variant="secondary">cerrado</Badge>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {ETIQUETA_EVENTO[f.tipo]} del {fechaCorta(f.fecha)}
                  {f.nivel > 1 ? ` · ${f.nivel} pasos` : ""}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
