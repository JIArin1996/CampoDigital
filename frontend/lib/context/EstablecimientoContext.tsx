"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { Establecimiento, Rol } from "@/types/database"
import { getEstablecimientos, getMisRoles } from "@/lib/queries/establecimientos"

const CLAVE_ACTIVO = "establecimientoActivoId"

interface EstablecimientoContextProps {
  establecimientoActivo: Establecimiento | null
  setEstablecimientoActivo: (est: Establecimiento | null) => void
  establecimientos: Establecimiento[]
  // Rol del usuario en el establecimiento activo, y en cualquiera de los suyos
  rolActivo: Rol | null
  esEditor: boolean
  rolEn: (establecimientoId: string) => Rol | null
  cargando: boolean
  recargarEstablecimientos: (seleccionarId?: string) => Promise<void>
}

const EstablecimientoContext = createContext<EstablecimientoContextProps | undefined>(undefined)

function leerGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_ACTIVO)
  } catch {
    return null
  }
}

function guardar(id: string | null) {
  try {
    if (id) localStorage.setItem(CLAVE_ACTIVO, id)
    else localStorage.removeItem(CLAVE_ACTIVO)
  } catch {
    // sin acceso a localStorage: se recuerda solo en esta sesión
  }
}

export function EstablecimientoProvider({ children }: { children: React.ReactNode }) {
  const [establecimientoActivo, setEstablecimientoActivoState] = useState<Establecimiento | null>(null)
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([])
  const [roles, setRoles] = useState<Record<string, Rol>>({})
  const [cargando, setCargando] = useState(true)

  // seleccionarId: deja activo ese establecimiento (por ejemplo, el recién creado)
  const recargarEstablecimientos = useCallback(async (seleccionarId?: string) => {
    setCargando(true)
    try {
      const [lista, misRoles] = await Promise.all([getEstablecimientos(), getMisRoles()])
      setEstablecimientos(lista)
      setRoles(misRoles)

      const preferido = seleccionarId ?? leerGuardado()
      const activo = lista.find(e => e.id === preferido) ?? lista[0] ?? null
      setEstablecimientoActivoState(activo)
      guardar(activo?.id ?? null)
    } catch (error) {
      // Sin sesión (por ejemplo, en el login) o sin conexión: queda vacío
      console.error("Error cargando establecimientos:", error)
      setEstablecimientos([])
      setRoles({})
      setEstablecimientoActivoState(null)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    recargarEstablecimientos()
  }, [recargarEstablecimientos])

  const setEstablecimientoActivo = (est: Establecimiento | null) => {
    setEstablecimientoActivoState(est)
    guardar(est?.id ?? null)
  }

  const rolEn = (establecimientoId: string) => roles[establecimientoId] ?? null
  const rolActivo = establecimientoActivo ? rolEn(establecimientoActivo.id) : null

  return (
    <EstablecimientoContext.Provider value={{
      establecimientoActivo,
      setEstablecimientoActivo,
      establecimientos,
      rolActivo,
      esEditor: rolActivo === "editor",
      rolEn,
      cargando,
      recargarEstablecimientos,
    }}>
      {children}
    </EstablecimientoContext.Provider>
  )
}

export function useEstablecimiento() {
  const context = useContext(EstablecimientoContext)
  if (context === undefined) {
    throw new Error("useEstablecimiento debe usarse dentro de un EstablecimientoProvider")
  }
  return context
}
