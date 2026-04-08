import { createClient } from "@/lib/supabase/server"
import { PageContainer } from "@/components/layout/PageContainer"
import { AnimalesClientWrapper } from "@/components/animales/AnimalesClientWrapper"

export const metadata = {
  title: "Stock Ganadero",
}

export default function AnimalesPage() {
  return (
    <PageContainer>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Ganadero</h1>
          <p className="text-muted-foreground">Listado de animales individuales en el sistema.</p>
        </div>
      </div>

      <AnimalesClientWrapper />
    </PageContainer>
  )
}
