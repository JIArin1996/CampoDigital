"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import type { Establecimiento } from "@/types/database"
import { createClient } from "@/lib/supabase/client"

interface EstablecimientoContextProps {
  establecimientoActivo: Establecimiento | null
  setEstablecimientoActivo: (est: Establecimiento | null) => void
  establecimientos: Establecimiento[]
  cargando: boolean
  recargarEstablecimientos: () => Promise<void>
}

const EstablecimientoContext = createContext<EstablecimientoContextProps | undefined>(undefined)

export function EstablecimientoProvider({ children }: { children: React.ReactNode }) {
  const [establecimientoActivo, setEstablecimientoActivoState] = useState<Establecimiento | null>(null)
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([])
  const [cargando, setCargando] = useState(true)

  const supabase = createClient()

  const cargarEstablecimientos = async () => {
    setCargando(true)
    const { data, error } = await supabase
      .from("establecimientos")
      .select("*")
      .eq("estado", "activo")
      .order("nombre")
    
    if (error) {
      console.error("Error cargando establecimientos en context:", error)
      setCargando(false)
      return
    }

    const dbEstablecimientos = (data || []) as Establecimiento[]
    setEstablecimientos(dbEstablecimientos)

    const savedId = localStorage.getItem("establecimientoActivoId")
    if (savedId && dbEstablecimientos.length > 0) {
      const found = dbEstablecimientos.find(e => e.id.toString() === savedId)
      if (found) {
        setEstablecimientoActivoState(found)
      } else {
        setEstablecimientoActivoState(dbEstablecimientos[0])
      }
    } else if (dbEstablecimientos.length > 0 && !savedId) {
      setEstablecimientoActivoState(dbEstablecimientos[0])
      localStorage.setItem("establecimientoActivoId", dbEstablecimientos[0].id.toString())
    } else {
      setEstablecimientoActivoState(null)
    }
    setCargando(false)
  }

  useEffect(() => {
    cargarEstablecimientos()
  }, [])

  const setEstablecimientoActivo = (est: Establecimiento | null) => {
    setEstablecimientoActivoState(est)
    if (est) {
      localStorage.setItem("establecimientoActivoId", est.id.toString())
    } else {
      localStorage.removeItem("establecimientoActivoId")
    }
  }

  return (
    <EstablecimientoContext.Provider value={{
      establecimientoActivo,
      setEstablecimientoActivo,
      establecimientos,
      cargando,
      recargarEstablecimientos: cargarEstablecimientos
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
