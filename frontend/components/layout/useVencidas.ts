"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getPersonas } from "@/lib/queries/bitacora"
import { EVENTO_TAREAS, contarVencidas } from "@/lib/queries/calendario"
import { hoyLocal } from "@/components/lotes/formato"

/**
 * Cantidad de vencidas de quien usa la app en el establecimiento activo: las suyas y las sin responsable
 * (las próximas dosis no tienen responsable). Se vuelve a contar al cambiar de pantalla o al marcar una tarea.
 */
export function useVencidas() {
  const pathname = usePathname()
  const { establecimientoActivo, perfil } = useEstablecimiento()
  const estId = establecimientoActivo?.id
  const [cuenta, setCuenta] = useState<{ estId: string; n: number } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const alCambiar = () => setVersion(v => v + 1)
    window.addEventListener(EVENTO_TAREAS, alCambiar)
    return () => window.removeEventListener(EVENTO_TAREAS, alCambiar)
  }, [])

  useEffect(() => {
    if (!estId || !perfil || pathname === "/login") return
    let vigente = true
    getPersonas(estId)
      .then(personas => contarVencidas(estId, personas.find(p => p.user_id === perfil.id)?.id ?? null, hoyLocal()))
      .then(n => { if (vigente) setCuenta({ estId, n }) })
      .catch(() => { /* sin contador: el resto del menú funciona igual */ })
    return () => { vigente = false }
  }, [estId, perfil, pathname, version])

  return cuenta && cuenta.estId === estId ? cuenta.n : 0
}
