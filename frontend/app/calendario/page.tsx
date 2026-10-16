import { CalendarDays } from "lucide-react"

import { PageContainer } from "@/components/layout/PageContainer"
import { Proximamente } from "@/components/layout/Proximamente"

export const metadata = { title: "Calendario" }

export default function CalendarioPage() {
  return (
    <PageContainer title="Calendario">
      <Proximamente
        icon={CalendarDays}
        titulo="Tareas y vencimientos"
        descripcion="Lo próximo y lo vencido, con filtros por responsable y lote, y avisos dentro de la app."
        etapa="Etapa 8"
      />
    </PageContainer>
  )
}
