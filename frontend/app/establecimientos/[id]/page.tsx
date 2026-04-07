import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { PageContainer } from "@/components/layout/PageContainer"
import { EstablecimientoDetalle } from "@/components/establecimientos/EstablecimientoDetalle"
import type { Establecimiento, Potrero } from "@/types/database"

// Params es una Promise en Next.js 15+
type PageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from("establecimientos")
    .select("nombre")
    .eq("id", id)
    .single()

  return { title: data?.nombre ?? "Establecimiento" }
}

export default async function EstablecimientoPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  // Carga el establecimiento y sus potreros en paralelo
  const [{ data: establecimiento }, { data: potreros }] = await Promise.all([
    supabase
      .from("establecimientos")
      .select("*")
      .eq("id", id)
      .single(),
    supabase
      .from("potreros")
      .select("*")
      .eq("establecimiento_id", id)
      .eq("estado", "activo")
      .order("nombre"),
  ])

  if (!establecimiento) notFound()

  return (
    <PageContainer>
      {/* Link de regreso */}
      <Link
        href="/establecimientos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5"
      >
        <ArrowLeft className="h-4 w-4" />
        Establecimientos
      </Link>

      <EstablecimientoDetalle
        establecimiento={establecimiento as Establecimiento}
        potreros={(potreros ?? []) as Potrero[]}
      />
    </PageContainer>
  )
}
