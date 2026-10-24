"use client"

import { useState } from "react"
import { LogOut } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

/**
 * Cierra la sesión y vuelve al login con una recarga completa,
 * para que no quede en memoria nada del usuario anterior.
 */
export function CerrarSesion({ className }: { className?: string }) {
  const [saliendo, setSaliendo] = useState(false)

  const salir = async () => {
    setSaliendo(true)
    await createClient().auth.signOut()
    try {
      localStorage.removeItem("establecimientoActivoId")
    } catch {
      // sin acceso a localStorage: no importa
    }
    window.location.assign("/login")
  }

  return (
    <button
      type="button"
      onClick={salir}
      disabled={saliendo}
      className={cn(
        "flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-foreground hover:bg-muted",
        className
      )}
    >
      <LogOut className="h-4 w-4 shrink-0" />
      {saliendo ? "Saliendo..." : "Salir"}
    </button>
  )
}
