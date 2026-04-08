"use client"

import { useEffect } from "react"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import type { Establecimiento } from "@/types/database"

/**
 * Componente invisible que sincroniza el establecimiento activo en el contexto
 * cuando el usuario navega directamente a una ruta de establecimiento por URL.
 */
export function SyncEstablecimiento({ establecimiento }: { establecimiento: Establecimiento }) {
  const { setEstablecimientoActivo } = useEstablecimiento()

  useEffect(() => {
    setEstablecimientoActivo(establecimiento)
  }, [establecimiento.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
