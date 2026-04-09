"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, MapPin, CheckCircle, Edit2, XCircle, Trash2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import {
  desactivarEstablecimiento,
  borrarEstablecimientoFisico,
  getEstablecimientosInactivos,
  reactivarEstablecimiento,
} from "@/lib/queries/establecimientos"
import { PageContainer } from "@/components/layout/PageContainer"
import { buttonVariants, Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DeleteConfirmationModal } from "@/components/shared/DeleteConfirmationModal"
import type { Establecimiento } from "@/types/database"

export default function EstablecimientosPage() {
  const { establecimientos, establecimientoActivo, setEstablecimientoActivo, recargarEstablecimientos, cargando } = useEstablecimiento()

  const [deleteTarget, setDeleteTarget] = useState<Establecimiento | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Inactivos
  const [inactivos, setInactivos] = useState<Establecimiento[]>([])
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [cargandoInactivos, setCargandoInactivos] = useState(false)
  const [reactivandoId, setReactivandoId] = useState<number | null>(null)

  const cargarInactivos = async () => {
    setCargandoInactivos(true)
    try {
      const data = await getEstablecimientosInactivos()
      setInactivos((data ?? []) as Establecimiento[])
    } catch {
      // silencioso
    } finally {
      setCargandoInactivos(false)
    }
  }

  useEffect(() => {
    cargarInactivos()
  }, [])

  // Selecciona el establecimiento activo en contexto (sin navegar)
  const handleSeleccionar = (est: Establecimiento) => {
    setEstablecimientoActivo(est)
    toast.success(`"${est.nombre}" seleccionado como establecimiento activo`)
  }

  // Baja lógica
  const handleDesactivar = async (est: Establecimiento) => {
    if (!window.confirm(`¿Desactivar "${est.nombre}"? El establecimiento quedará inactivo.`)) return
    try {
      await desactivarEstablecimiento(est.id)
      toast.success(`"${est.nombre}" desactivado`)
      await recargarEstablecimientos()
      await cargarInactivos()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar")
    }
  }

  // Reactivar
  const handleReactivar = async (est: Establecimiento) => {
    setReactivandoId(est.id)
    try {
      await reactivarEstablecimiento(est.id)
      toast.success(`"${est.nombre}" reactivado`)
      await recargarEstablecimientos()
      await cargarInactivos()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reactivar")
    } finally {
      setReactivandoId(null)
    }
  }

  // Borrado físico (con confirmación de escritura)
  const handleEliminar = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await borrarEstablecimientoFisico(deleteTarget.id)
      toast.success(`"${deleteTarget.nombre}" eliminado definitivamente`)
      setDeleteTarget(null)
      await recargarEstablecimientos()
      await cargarInactivos()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <PageContainer>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Establecimientos</h1>
        <Link href="/establecimientos/nuevo" className={buttonVariants()}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo
        </Link>
      </div>

      {/* Cargando */}
      {cargando && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {/* Sin establecimientos activos */}
      {!cargando && establecimientos.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <MapPin className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <h2 className="font-semibold mb-1">Sin establecimientos activos</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Registrá tu primer campo para empezar.
          </p>
          <Link href="/establecimientos/nuevo" className={buttonVariants()}>
            Crear establecimiento
          </Link>
        </div>
      )}

      {/* Listado activos */}
      {!cargando && establecimientos.length > 0 && (
        <div className="space-y-3">
          {establecimientos.map((est) => (
            <div
              key={est.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border bg-card px-4 py-4"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{est.nombre}</p>
                  <Badge variant="outline">{est.tipo}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {est.departamento}
                  {est.localidad && ` · ${est.localidad}`}
                  {" · "}
                  {est.superficie_total} ha
                </p>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={establecimientoActivo?.id === est.id ? "default" : "outline"}
                  onClick={() => handleSeleccionar(est)}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {establecimientoActivo?.id === est.id ? "Activo" : "Seleccionar"}
                </Button>
                <Link
                  href={`/establecimientos/${est.id}/editar`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  Editar
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDesactivar(est)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Desactivar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setDeleteTarget(est)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sección Inactivos ─────────────────────────────────────── */}
      {!cargando && inactivos.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setMostrarInactivos(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            {mostrarInactivos
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />
            }
            Inactivos ({inactivos.length})
          </button>

          {mostrarInactivos && (
            <div className="space-y-2">
              {cargandoInactivos ? (
                <div className="h-16 rounded-lg border bg-muted/20 animate-pulse" />
              ) : (
                inactivos.map(est => (
                  <div
                    key={est.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-3 opacity-70"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate text-muted-foreground">{est.nombre}</p>
                        <Badge variant="outline" className="text-muted-foreground">{est.tipo}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {est.departamento}
                        {est.localidad && ` · ${est.localidad}`}
                        {" · "}
                        {est.superficie_total} ha
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reactivandoId === est.id}
                        onClick={() => handleReactivar(est)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        {reactivandoId === est.id ? "Reactivando..." : "Reactivar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(est)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      <DeleteConfirmationModal
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        onConfirm={handleEliminar}
        isDeleting={isDeleting}
        title={`Eliminar "${deleteTarget?.nombre ?? ""}"`}
        description="Esta acción es permanente. Solo es posible si el establecimiento no tiene potreros ni animales. Escribí ELIMINAR para confirmar."
      />
    </PageContainer>
  )
}
