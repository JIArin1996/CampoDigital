"use client"

import { useState } from "react"
import { LogOut } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

/**
 * Cierra la sesión y vuelve al login con una recarga completa,
 * para que no quede en memoria nada del usuario anterior.
 */
export function CerrarSesion({ className, compacto = false }: { className?: string; compacto?: boolean }) {
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
        compacto
          ? "flex flex-col items-center justify-center gap-1 h-16 w-full text-[10px] font-medium text-sidebar-foreground/60"
          : "flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50",
        className
      )}
    >
      <LogOut className={compacto ? "h-5 w-5" : "h-4 w-4 shrink-0"} />
      {saliendo ? "Saliendo..." : "Salir"}
    </button>
  )
}
