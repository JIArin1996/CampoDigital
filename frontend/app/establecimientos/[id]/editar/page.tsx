"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getEstablecimiento } from "@/lib/queries/establecimientos"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"
import { EstablecimientoForm } from "@/components/forms/EstablecimientoForm"
import type { Establecimiento } from "@/types/database"

// Se carga en el navegador: la consulta tiene que ir con la sesión del usuario para pasar el RLS
export default function EditarEstablecimientoPage() {
  const { id } = useParams<{ id: string }>()
  const { rolEn, cargando: cargandoCtx } = useEstablecimiento()
  const [establecimiento, setEstablecimiento] = useState<Establecimiento | null>(null)
  const [estado, setEstado] = useState<"cargando" | "listo" | "no-encontrado">("cargando")

  useEffect(() => {
    let vigente = true
    getEstablecimiento(id)
      .then(est => {
        if (!vigente) return
        setEstablecimiento(est)
        setEstado(est ? "listo" : "no-encontrado")
      })
      .catch(() => vigente && setEstado("no-encontrado"))
    return () => { vigente = false }
  }, [id])

  const volver = (
    <Link href="/establecimientos" className="inline-flex items-center gap-1.5 h-10 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="h-4 w-4" /> Volver a establecimientos
    </Link>
  )

  if (estado === "cargando" || cargandoCtx) {
    return <PageContainer>{volver}<div className="h-64 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }

  if (estado === "no-encontrado" || !establecimiento) {
    return <PageContainer>{volver}<p className="text-muted-foreground">No se encontró el establecimiento.</p></PageContainer>
  }

  if (rolEn(establecimiento.id) !== "editor") {
    return <PageContainer>{volver}<p className="text-muted-foreground">Tenés acceso de solo lectura a este establecimiento.</p></PageContainer>
  }

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold tracking-tight mb-6">Editar {establecimiento.nombre}</h1>
      <EstablecimientoForm initialData={establecimiento} />
    </PageContainer>
  )
}
