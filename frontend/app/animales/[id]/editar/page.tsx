import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getAnimal } from "@/lib/queries/animales"
import { createClient } from "@/lib/supabase/server"
import { PageContainer } from "@/components/layout/PageContainer"
import { AnimalForm } from "@/components/forms/AnimalForm"
import type { Establecimiento } from "@/types/database"

export const metadata = {
  title: "Editar Animal",
}

export default async function EditarAnimalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  try {
    const animal = await getAnimal(Number(id))
    if (!animal) notFound()

    return (
      <PageContainer>
        <Link href={`/animales/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5">
          <ArrowLeft className="h-4 w-4" /> Volver a la Ficha
        </Link>
        
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Editar Animal</h1>
          <p className="text-muted-foreground">Modifica la información general de {animal.caravana_snig}.</p>
        </div>

        <AnimalForm 
          initialData={animal} 
        />
      </PageContainer>
    )
  } catch (error) {
    notFound()
  }
}
