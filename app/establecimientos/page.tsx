import Link from "next/link"
import { Plus, MapPin } from "lucide-react"
import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { PageContainer } from "@/components/layout/PageContainer"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Establecimiento } from "@/types/database"

export const metadata: Metadata = { title: "Establecimientos" }

export default async function EstablecimientosPage() {
  const supabase = await createClient()
  const { data: establecimientos, error } = await supabase
    .from("establecimientos")
    .select("*")
    .eq("estado", "activo")
    .order("nombre")

  if (error) throw error

  return (
    <PageContainer>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Establecimientos</h1>
        <Link href="/establecimientos/nuevo" className={buttonVariants()}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo
        </Link>
      </div>

      {/* Listado */}
      {establecimientos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <MapPin className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <h2 className="font-semibold mb-1">Sin establecimientos</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Registrá tu primer campo para empezar.
          </p>
          <Link href="/establecimientos/nuevo" className={buttonVariants()}>
            Crear establecimiento
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {(establecimientos as Establecimiento[]).map((e) => (
            <Link key={e.id} href={`/establecimientos/${e.id}`}>
              <Card className="hover:bg-accent/40 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{e.nombre}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {e.departamento}
                      {e.localidad && ` · ${e.localidad}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-muted-foreground">
                      {e.superficie_total} ha
                    </span>
                    <Badge variant="outline">{e.tipo}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
