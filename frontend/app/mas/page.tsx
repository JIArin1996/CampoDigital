"use client"

import Link from "next/link"
import { ChevronRight, UserRound } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"
import { CerrarSesion } from "@/components/layout/CerrarSesion"
import { ListaAccesos } from "@/components/layout/ListaAccesos"
import { ATAJOS_MAS, BOTON_CONFIGURACIONES, visibleParaRol } from "@/components/layout/navegacion"

// "Más" (celular): atajos a lo que no entra en la barra inferior, el botón Configuraciones
// (solo administrador) y la cuenta.
export default function MasPage() {
  const { esAdmin, establecimientoActivo } = useEstablecimiento()
  const hayActivo = !!establecimientoActivo
  const atajos = ATAJOS_MAS.filter(visibleParaRol(esAdmin))

  return (
    <PageContainer title="Más">
      <div className="space-y-6 max-w-xl">
        <ListaAccesos items={atajos} hayActivo={hayActivo} />

        {esAdmin && <ListaAccesos items={[BOTON_CONFIGURACIONES]} hayActivo={hayActivo} />}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">Cuenta</p>
          <ul className="rounded-lg border divide-y bg-card">
            <li>
              <Link href="/perfil" className="flex items-center gap-3 px-4 h-14 hover:bg-muted/50 active:bg-muted">
                <UserRound className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 font-medium">Mi perfil</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            </li>
            <li className="px-1 py-1">
              <CerrarSesion className="h-12 text-base" />
            </li>
          </ul>
        </div>
      </div>
    </PageContainer>
  )
}
