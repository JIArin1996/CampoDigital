import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getAnimal } from "@/lib/queries/animales"
import { PageContainer } from "@/components/layout/PageContainer"
import { AnimalDetalle } from "@/components/animales/AnimalDetalle"

export const metadata = {
  title: "Ficha del Animal",
}

export default async function AnimalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  try {
    const animal = await getAnimal(Number(id))
    if (!animal) notFound()

    return (
      <PageContainer>
        <Link href="/animales" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5">
          <ArrowLeft className="h-4 w-4" /> Volver a Animales
        </Link>
        <AnimalDetalle animal={animal} />
      </PageContainer>
    )
  } catch (error) {
    notFound()
  }
}
