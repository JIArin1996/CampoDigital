"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, UserPlus } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getMembresias, getPerfiles } from "@/lib/queries/usuarios"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Avatar } from "@/components/usuarios/Avatar"
import { ETIQUETA_ROL, nombreCompleto } from "@/components/usuarios/roles"
import type { Membresia, Perfil } from "@/types/database"

export default function UsuariosPage() {
  const { esAdmin, establecimientos, cargando } = useEstablecimiento()
  const [datos, setDatos] = useState<{ perfiles: Perfil[]; membresias: Membresia[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!esAdmin) return
    let vigente = true
    Promise.all([getPerfiles(), getMembresias()])
      .then(([perfiles, membresias]) => {
        if (vigente) setDatos({ perfiles, membresias })
      })
      .catch(err => {
        if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los usuarios"))
      })
    return () => { vigente = false }
  }, [esAdmin])

  if (cargando) return <PageContainer><Esqueleto /></PageContainer>

  if (!esAdmin) {
    return (
      <PageContainer title="Usuarios">
        <p className="text-muted-foreground">Solo un administrador puede gestionar usuarios.</p>
      </PageContainer>
    )
  }

  const nombreEst = (id: string) => establecimientos.find(e => e.id === id)?.nombre ?? "—"

  // Activos primero, después inactivos; dentro, por nombre
  const ordenados = [...(datos?.perfiles ?? [])].sort(
    (a, b) => Number(b.activo) - Number(a.activo) || nombreCompleto(a).localeCompare(nombreCompleto(b))
  )

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Link href="/usuarios/nuevo" className={buttonVariants({ className: "h-11 md:h-8" })}>
          <UserPlus className="h-4 w-4 mr-1" />
          Nuevo usuario
        </Link>
      </div>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {!datos ? (
        <Esqueleto />
      ) : (
        <ul className="space-y-3">
          {ordenados.map(p => {
            const accesos = datos.membresias.filter(m => m.user_id === p.id)
            return (
              <li key={p.id}>
                <Link
                  href={`/usuarios/${p.id}`}
                  className={`flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors ${p.activo ? "" : "opacity-60"}`}
                >
                  <Avatar nombre={p.nombre} apellido={p.apellido} fotoPath={p.foto_path} className="h-11 w-11 text-sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{nombreCompleto(p)}</p>
                      {p.es_admin && <Badge>Administrador</Badge>}
                      {!p.activo && <Badge variant="secondary">Desactivado</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{p.email}</p>
                    {accesos.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {accesos.map(m => `${nombreEst(m.establecimiento_id)}: ${ETIQUETA_ROL[m.rol]}`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </PageContainer>
  )
}

function Esqueleto() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />
      ))}
    </div>
  )
}
