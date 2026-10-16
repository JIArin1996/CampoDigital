"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { NotebookPen, Plus } from "lucide-react"

import { getEntradas, getPersonas } from "@/lib/queries/bitacora"
import { getLotes } from "@/lib/queries/lotes"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TarjetaEntrada } from "@/components/bitacora/TarjetaEntrada"
import type { EntradaConLotes } from "@/types/bitacora"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]

const CUANTAS = 5

/**
 * Últimas entradas de bitácora que etiquetan este lote.
 */
export function BitacoraDelLote({
  establecimientoId, loteId, puedeOperar,
}: {
  establecimientoId: string
  loteId: string
  puedeOperar: boolean
}) {
  const [datos, setDatos] = useState<{
    entradas: EntradaConLotes[]
    personas: Persona[]
    nombresLote: Map<string, string>   // una nota puede etiquetar otros lotes además de este
  } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vigente = true
    Promise.all([
      getEntradas(establecimientoId, { loteId, limite: CUANTAS }),
      getPersonas(establecimientoId),
      getLotes(establecimientoId, "activo"),
      getLotes(establecimientoId, "cerrado"),
    ])
      .then(([entradas, personas, activos, cerrados]) => {
        if (vigente) setDatos({ entradas, personas, nombresLote: new Map([...activos, ...cerrados].map(l => [l.id, l.nombre])) })
      })
      .catch(() => { if (vigente) setDatos({ entradas: [], personas: [], nombresLote: new Map() }) })
    return () => { vigente = false }
  }, [establecimientoId, loteId, version])

  return (
    <Card>
      <CardHeader className="pb-1 flex-row items-center justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <NotebookPen className="h-4 w-4" /> Bitácora
        </CardTitle>
        {puedeOperar && (
          <Link href={`/bitacora/nueva?lote=${loteId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Plus className="h-4 w-4 mr-1" /> Nota
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!datos ? (
          <div className="h-16 rounded bg-muted animate-pulse" />
        ) : datos.entradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay notas sobre este lote.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {datos.entradas.map(e => (
                <li key={e.id}>
                  <TarjetaEntrada entrada={e} nombresLote={datos.nombresLote} personas={datos.personas}
                    puedeOperar={puedeOperar} compacta onCambio={() => setVersion(v => v + 1)} />
                </li>
              ))}
            </ul>
            <Link href={`/bitacora?lote=${loteId}`} className={buttonVariants({ variant: "ghost", className: "w-full" })}>
              Ver toda la bitácora del lote
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}
