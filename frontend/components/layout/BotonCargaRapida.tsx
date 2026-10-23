"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, Layers, NotebookPen, ClipboardList, CalendarCheck, Wallet, type LucideIcon } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Opcion {
  label: string
  descripcion: string
  icon: LucideIcon
  href?: string        // sin href: todavía no existe (se habilita en su etapa)
  etapa?: string
}

const OPCIONES: Opcion[] = [
  { label: "Nota de bitácora", descripcion: "Decisión, idea u observación", icon: NotebookPen, href: "/bitacora/nueva" },
  { label: "Actividad", descripcion: "Pesada, venta, compra, parición, destete, sanidad...", icon: ClipboardList, href: "/actividades/nueva" },
  { label: "Ingreso o gasto", descripcion: "Sueldos, insumos, arrendamiento, impuestos...", icon: Wallet, href: "/economia/nuevo" },
  { label: "Nuevo lote", descripcion: "Con su composición inicial", icon: Layers, href: "/lotes/nuevo" },
  { label: "Tarea", descripcion: "Algo para hacer, con vencimiento", icon: CalendarCheck, href: "/bitacora/nueva?tipo=tarea" },
]

/**
 * Botón flotante "+" para cargar rápido desde cualquier pantalla.
 * Solo para quien puede cargar (administrador u operador del establecimiento activo).
 */
export function BotonCargaRapida() {
  const pathname = usePathname()
  const { puedeOperar } = useEstablecimiento()
  const [abierto, setAbierto] = useState(false)

  // No aparece sin permiso de carga, en el login ni dentro de un formulario de alta o edición
  const enFormulario = pathname === "/login" || pathname.endsWith("/nuevo") || pathname.endsWith("/nueva") || pathname.endsWith("/editar")
  if (!puedeOperar || enFormulario) return null

  return (
    <>
      <button
        type="button"
        aria-label="Cargar"
        onClick={() => setAbierto(true)}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 md:right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/50"
      >
        <Plus className="h-7 w-7" />
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Qué querés cargar?</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2">
            {OPCIONES.map(op => {
              const Icono = op.icon
              const contenido = (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Icono className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{op.label}</span>
                    <span className="block text-sm text-muted-foreground">
                      {op.href ? op.descripcion : `Próximamente (${op.etapa})`}
                    </span>
                  </span>
                </>
              )
              return (
                <li key={op.label}>
                  {op.href ? (
                    <Link
                      href={op.href}
                      onClick={() => setAbierto(false)}
                      className="flex items-center gap-3 rounded-lg border px-3 py-3 hover:bg-muted active:bg-muted"
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <div aria-disabled className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-3 opacity-60">
                      {contenido}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
