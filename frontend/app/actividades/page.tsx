import { ClipboardList } from "lucide-react"

import { PageContainer } from "@/components/layout/PageContainer"
import { Proximamente } from "@/components/layout/Proximamente"

export const metadata = { title: "Actividades" }

export default function ActividadesPage() {
  return (
    <PageContainer title="Actividades">
      <Proximamente
        icon={ClipboardList}
        titulo="Lo que se hizo y cuándo"
        descripcion="Pesadas, sanidad, servicio, diagnóstico, parición, destete, esquila, mortandad, compras y ventas, por lote."
        etapa="Etapa 6"
      />
    </PageContainer>
  )
}
