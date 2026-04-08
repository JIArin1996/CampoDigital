import type { Metadata } from "next"

import { PageContainer } from "@/components/layout/PageContainer"
import { EstablecimientoForm } from "@/components/forms/EstablecimientoForm"

export const metadata: Metadata = { title: "Nuevo Establecimiento" }

export default function NuevoEstablecimientoPage() {
  return (
    <PageContainer title="Nuevo Establecimiento">
      <EstablecimientoForm />
    </PageContainer>
  )
}
