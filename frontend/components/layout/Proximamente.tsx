import type { LucideIcon } from "lucide-react"

/**
 * Sección que existe en la navegación pero se construye en una etapa posterior.
 */
export function Proximamente({
  icon: Icono, titulo, descripcion, etapa,
}: {
  icon: LucideIcon
  titulo: string
  descripcion: string
  etapa: string
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Icono className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
      <h2 className="font-semibold mb-1">{titulo}</h2>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">{descripcion}</p>
      <p className="text-xs font-medium text-primary mt-3">Llega en la {etapa}</p>
    </div>
  )
}
