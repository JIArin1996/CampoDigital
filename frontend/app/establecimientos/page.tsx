"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Plus, MapPin, CheckCircle, Edit2, XCircle, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import {
  desactivarEstablecimiento,
  getEstablecimientosInactivos,
  reactivarEstablecimiento,
} from "@/lib/queries/establecimientos"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { buttonVariants, Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Establecimiento } from "@/types/database"

// Botones cómodos de tocar en el celular
const BOTON = "h-10 md:h-8"

export default function EstablecimientosPage() {
  const { establecimientos, establecimientoActivo, setEstablecimientoActivo, recargarEstablecimientos, rolEn, cargando } =
    useEstablecimiento()

  // Inactivos
  const [inactivos, setInactivos] = useState<Establecimiento[]>([])
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [reactivandoId, setReactivandoId] = useState<string | null>(null)

  const cargarInactivos = useCallback(async () => {
    try {
      setInactivos(await getEstablecimientosInactivos())
    } catch {
      setInactivos([])
    }
  }, [])

  useEffect(() => {
    cargarInactivos()
  }, [cargarInactivos])

  // Selecciona el establecimiento activo (sin navegar)
  const handleSeleccionar = (est: Establecimiento) => {
    setEstablecimientoActivo(est)
    toast.success(`"${est.nombre}" seleccionado`)
  }

  // Baja lógica
  const handleDesactivar = async (est: Establecimiento) => {
    if (!window.confirm(`¿Desactivar "${est.nombre}"? Queda inactivo y se puede reactivar.`)) return
    try {
      await desactivarEstablecimiento(est.id)
      toast.success(`"${est.nombre}" desactivado`)
      await recargarEstablecimientos()
      await cargarInactivos()
    } catch (err) {
      toast.error(mensajeDeError(err, "Error al desactivar"))
    }
  }

  const handleReactivar = async (est: Establecimiento) => {
    setReactivandoId(est.id)
    try {
      await reactivarEstablecimiento(est.id)
      toast.success(`"${est.nombre}" reactivado`)
      await recargarEstablecimientos(est.id)
      await cargarInactivos()
    } catch (err) {
      toast.error(mensajeDeError(err, "Error al reactivar"))
    } finally {
      setReactivandoId(null)
    }
  }

  const resumen = (est: Establecimiento) =>
    [est.departamento, est.localidad, est.superficie_total ? `${est.superficie_total} ha` : null]
      .filter(Boolean)
      .join(" · ")

  return (
    <PageContainer>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Establecimientos</h1>
        <Link href="/establecimientos/nuevo" className={buttonVariants({ className: BOTON })}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo
        </Link>
      </div>

      {/* Cargando */}
      {cargando && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-24 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {/* Sin establecimientos */}
      {!cargando && establecimientos.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <MapPin className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <h2 className="font-semibold mb-1">Todavía no tenés establecimientos</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Creá el primero, o pedí que te den acceso a uno existente.
          </p>
          <Link href="/establecimientos/nuevo" className={buttonVariants({ className: BOTON })}>
            Crear establecimiento
          </Link>
        </div>
      )}

      {/* Listado */}
      {!cargando && establecimientos.length > 0 && (
        <div className="space-y-3">
          {establecimientos.map(est => {
            const rol = rolEn(est.id)
            const activo = establecimientoActivo?.id === est.id
            return (
              <div key={est.id} className="rounded-lg border bg-card px-4 py-4 space-y-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{est.nombre}</p>
                    {rol && <Badge variant={rol === "editor" ? "default" : "secondary"}>{rol}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{resumen(est)}</p>
                  {est.sistema_productivo && (
                    <p className="text-sm text-muted-foreground">{est.sistema_productivo}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className={BOTON}
                    variant={activo ? "default" : "outline"}
                    onClick={() => handleSeleccionar(est)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    {activo ? "Activo" : "Seleccionar"}
                  </Button>
                  {rol === "editor" && (
                    <>
                      <Link
                        href={`/establecimientos/${est.id}/editar`}
                        className={buttonVariants({ variant: "outline", size: "sm", className: BOTON })}
                      >
                        <Edit2 className="h-4 w-4 mr-1" />
                        Editar
                      </Link>
                      <Button size="sm" variant="outline" className={BOTON} onClick={() => handleDesactivar(est)}>
                        <XCircle className="h-4 w-4 mr-1" />
                        Desactivar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Inactivos */}
      {!cargando && inactivos.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setMostrarInactivos(v => !v)}
            className="flex items-center gap-2 h-10 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {mostrarInactivos ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Inactivos ({inactivos.length})
          </button>

          {mostrarInactivos && (
            <div className="space-y-2 mt-2">
              {inactivos.map(est => (
                <div
                  key={est.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-muted-foreground">{est.nombre}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{resumen(est)}</p>
                  </div>
                  {rolEn(est.id) === "editor" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={BOTON}
                      disabled={reactivandoId === est.id}
                      onClick={() => handleReactivar(est)}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      {reactivandoId === est.id ? "Reactivando..." : "Reactivar"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  )
}
