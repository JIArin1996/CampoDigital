"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { Establecimiento, Perfil, Rol, RolMembresia } from "@/types/database"
import { getEstablecimientos, getMisRoles } from "@/lib/queries/establecimientos"
import { esAdmin as consultarEsAdmin, getMiPerfil } from "@/lib/queries/usuarios"
import { createClient } from "@/lib/supabase/client"

const CLAVE_ACTIVO = "establecimientoActivoId"

interface EstablecimientoContextProps {
  // Usuario actual
  perfil: Perfil | null
  esAdmin: boolean
  recargarPerfil: () => Promise<void>
  // Establecimientos
  establecimientoActivo: Establecimiento | null
  setEstablecimientoActivo: (est: Establecimiento | null) => void
  establecimientos: Establecimiento[]
  // Rol en el establecimiento activo, y en cualquiera
  rolActivo: Rol | null
  puedeOperar: boolean                                 // administrador u operador en el activo
  rolEn: (establecimientoId: string) => Rol | null
  puedeOperarEn: (establecimientoId: string) => boolean
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
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [admin, setAdmin] = useState(false)
  const [establecimientoActivo, setEstablecimientoActivoState] = useState<Establecimiento | null>(null)
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([])
  const [roles, setRoles] = useState<Record<string, RolMembresia>>({})
  const [cargando, setCargando] = useState(true)

  // seleccionarId: deja activo ese establecimiento (por ejemplo, el recién creado)
  const recargarEstablecimientos = useCallback(async (seleccionarId?: string) => {
    setCargando(true)
    try {
      // Sin sesión (por ejemplo, en el login) no se consulta nada: la base lo rechazaría
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) {
        setEstablecimientos([])
        setRoles({})
        setPerfil(null)
        setAdmin(false)
        setEstablecimientoActivoState(null)
        return
      }

      const [lista, misRoles, miPerfil, soyAdmin] = await Promise.all([
        getEstablecimientos(), getMisRoles(), getMiPerfil(), consultarEsAdmin(),
      ])
      setEstablecimientos(lista)
      setRoles(misRoles)
      setPerfil(miPerfil)
      setAdmin(soyAdmin)

      const preferido = seleccionarId ?? leerGuardado()
      const activo = lista.find(e => e.id === preferido) ?? lista[0] ?? null
      setEstablecimientoActivoState(activo)
      guardar(activo?.id ?? null)
    } catch (error) {
      // Sin sesión (por ejemplo, en el login) o sin conexión: queda vacío
      console.error("Error cargando establecimientos:", error)
      setEstablecimientos([])
      setRoles({})
      setPerfil(null)
      setAdmin(false)
      setEstablecimientoActivoState(null)
    } finally {
      setCargando(false)
    }
  }, [])

  const recargarPerfil = useCallback(async () => {
    try {
      setPerfil(await getMiPerfil())
    } catch (error) {
      console.error("Error cargando el perfil:", error)
    }
  }, [])

  useEffect(() => {
    recargarEstablecimientos()
  }, [recargarEstablecimientos])

  const setEstablecimientoActivo = (est: Establecimiento | null) => {
    setEstablecimientoActivoState(est)
    guardar(est?.id ?? null)
  }

  const rolEn = (establecimientoId: string): Rol | null =>
    admin ? "administrador" : roles[establecimientoId] ?? null
  const puedeOperarEn = (establecimientoId: string) => {
    const rol = rolEn(establecimientoId)
    return rol === "administrador" || rol === "operador"
  }
  const rolActivo = establecimientoActivo ? rolEn(establecimientoActivo.id) : null

  return (
    <EstablecimientoContext.Provider value={{
      perfil,
      esAdmin: admin,
      recargarPerfil,
      establecimientoActivo,
      setEstablecimientoActivo,
      establecimientos,
      rolActivo,
      puedeOperar: establecimientoActivo ? puedeOperarEn(establecimientoActivo.id) : false,
      rolEn,
      puedeOperarEn,
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
