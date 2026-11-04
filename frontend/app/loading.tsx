import { PageContainer } from "@/components/layout/PageContainer"
import { Cargando } from "@/components/shared/Cargando"

// Mientras Next trae una página nueva (al navegar), el menú queda y se ve el spinner
export default function Loading() {
  return (
    <PageContainer>
      <Cargando />
    </PageContainer>
  )
}
