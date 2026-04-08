import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getEstablecimiento } from "@/lib/queries/establecimientos"
import { PageContainer } from "@/components/layout/PageContainer"
import { EstablecimientoForm } from "@/components/forms/EstablecimientoForm"

export const metadata = {
  title: "Editar Establecimiento",
}

export default async function EditarEstablecimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  try {
    const establecimiento = await getEstablecimiento(Number(id))
    if (!establecimiento) notFound()

    return (
      <PageContainer>
        <Link href={`/establecimientos/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5">
          <ArrowLeft className="h-4 w-4" /> Volver a Detalles
        </Link>
        
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Editar Establecimiento</h1>
          <p className="text-muted-foreground">Modifica la información general de {establecimiento.nombre}.</p>
        </div>

        <EstablecimientoForm initialData={establecimiento} />
      </PageContainer>
    )
  } catch (error) {
    notFound()
  }
}
