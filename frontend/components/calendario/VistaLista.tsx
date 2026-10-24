"use client"

import { useEffect, useState } from "react"
import { CalendarCheck } from "lucide-react"

import { getCalendario } from "@/lib/queries/calendario"
import { mensajeDeError } from "@/lib/supabase/errores"
import { ItemCalendario, claveFila } from "@/components/calendario/ItemCalendario"
import { diasEntre } from "@/components/bitacora/formato"
import { hoyLocal } from "@/components/lotes/formato"
import { cn } from "@/lib/utils"
import type { FilaCalendario } from "@/types/bitacora"

interface Props {
  estId: string
  pasa: (f: FilaCalendario) => boolean        // filtros de la pantalla (tipo, responsable, lote)
  nombresLote: Map<string, string>
  nombrePersona: (id: string) => string | undefined
  puedeOperar: boolean
  verTerminadasInicial?: boolean
}

/**
 * Pestaña Lista: lo pendiente en tres grupos (vencidas, hoy y próximos 7 días, más adelante)
 * y, a pedido, las terminadas más recientes.
 */
export function VistaLista({ estId, pasa, nombresLote, nombrePersona, puedeOperar, verTerminadasInicial = false }: Props) {
  const [verTerminadas, setVerTerminadas] = useState(verTerminadasInicial)
  const [version, setVersion] = useState(0)
  const [datos, setDatos] = useState<{ clave: string; pendientes: FilaCalendario[]; terminadas: FilaCalendario[] | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clave = JSON.stringify([estId, verTerminadas, version])
  useEffect(() => {
    let vigente = true
    Promise.all([getCalendario(estId), verTerminadas ? getCalendario(estId, true) : Promise.resolve(null)])
      .then(([pendientes, terminadas]) => {
        if (vigente) setDatos({ clave: JSON.stringify([estId, verTerminadas, version]), pendientes, terminadas })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el calendario")) })
    return () => { vigente = false }
  }, [estId, verTerminadas, version])

  const hoy = hoyLocal()
  const pendientes = (datos?.pendientes ?? []).filter(pasa)
  const grupos = [
    { titulo: "Vencidas", filas: pendientes.filter(f => f.fecha < hoy), alerta: true },
    { titulo: "Hoy y próximos 7 días", filas: pendientes.filter(f => f.fecha >= hoy && diasEntre(hoy, f.fecha) <= 7), alerta: false },
    { titulo: "Más adelante", filas: pendientes.filter(f => diasEntre(hoy, f.fecha) > 7), alerta: false },
  ]
  const terminadas = (datos?.terminadas ?? []).filter(pasa)

  const lista = (filas: FilaCalendario[]) => (
    <ul className="space-y-2">
      {filas.map(f => (
        <li key={claveFila(f)}>
          <ItemCalendario fila={f} nombresLote={nombresLote} nombrePersona={nombrePersona}
            puedeOperar={puedeOperar} onCambio={() => setVersion(v => v + 1)} />
        </li>
      ))}
    </ul>
  )

  return (
    <div>
      <label className="flex items-center gap-2 min-h-11 cursor-pointer select-none w-fit mb-3">
        <input type="checkbox" className="h-5 w-5 accent-primary" checked={verTerminadas} onChange={e => setVerTerminadas(e.target.checked)} />
        <span className="text-sm">Ver terminadas</span>
      </label>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {!datos ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border bg-muted/30 animate-pulse" />)}</div>
      ) : (
        <div className={cn("space-y-6 transition-opacity", datos.clave !== clave && "opacity-60")}>
          {pendientes.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <CalendarCheck className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No hay nada pendiente con estos filtros.</p>
            </div>
          )}
          {grupos.filter(g => g.filas.length > 0).map(g => (
            <section key={g.titulo} className="space-y-2">
              <h2 className={cn("font-semibold", g.alerta && "text-destructive")}>
                {g.titulo} <span className="font-normal text-muted-foreground">({g.filas.length})</span>
              </h2>
              {lista(g.filas)}
            </section>
          ))}
          {verTerminadas && (
            <section className="space-y-2">
              <h2 className="font-semibold">Terminadas <span className="font-normal text-muted-foreground">(las más recientes)</span></h2>
              {!datos.terminadas ? <div className="h-28 rounded-lg border bg-muted/30 animate-pulse" />
                : terminadas.length === 0 ? <p className="text-sm text-muted-foreground">No hay tareas terminadas con estos filtros.</p>
                : lista(terminadas)}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
