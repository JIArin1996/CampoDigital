import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

// Página cargando: spinner verde centrado con el texto (lo leen también los lectores de pantalla)
export function Cargando({ className }: { className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <span className="text-sm">Cargando…</span>
    </div>
  )
}
