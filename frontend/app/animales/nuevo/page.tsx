import { createClient } from "@/lib/supabase/server"
import { PageContainer } from "@/components/layout/PageContainer"
import { AnimalForm } from "@/components/forms/AnimalForm"
import type { Establecimiento } from "@/types/database"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Nuevo Animal",
}

export default function NuevoAnimalPage() {

  return (
    <PageContainer>
      <Link href="/animales" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5">
        <ArrowLeft className="h-4 w-4" /> Volver a Animales
      </Link>
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Ingreso de Animal</h1>
        <p className="text-muted-foreground">Registre un nuevo animal individual en el sistema con su trazabilidad.</p>
      </div>

        <AnimalForm />
    </PageContainer>
  )
}
