import { NotebookPen } from "lucide-react"

import { PageContainer } from "@/components/layout/PageContainer"
import { Proximamente } from "@/components/layout/Proximamente"

export const metadata = { title: "Bitácora" }

export default function BitacoraPage() {
  return (
    <PageContainer title="Bitácora">
      <Proximamente
        icon={NotebookPen}
        titulo="Lo que se habla y se decide"
        descripcion="Decisiones, ideas sin definir, observaciones del campo y compras o gastos, con etiquetas de lote, tipo y responsable."
        etapa="Etapa 5"
      />
    </PageContainer>
  )
}
