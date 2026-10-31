"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { PageContainer } from "@/components/layout/PageContainer"
import { SeccionRubros } from "@/components/economia/catalogos/SeccionRubros"
import { SeccionConceptos } from "@/components/economia/catalogos/SeccionConceptos"
import { SeccionTitulares } from "@/components/economia/catalogos/SeccionTitulares"
import { SeccionPagadores } from "@/components/economia/catalogos/SeccionPagadores"
import { cn } from "@/lib/utils"

const SECCIONES = [
  { id: "rubros", nombre: "Rubros" },
  { id: "conceptos", nombre: "Conceptos" },
  { id: "titulares", nombre: "Titulares" },
  { id: "pagadores", nombre: "Pagadores" },
] as const
type IdSeccion = (typeof SECCIONES)[number]["id"]

export default function ConfiguracionEconomiaPage() {
  // useSearchParams necesita un Suspense alrededor
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <ConfiguracionEconomia />
    </Suspense>
  )
}

/**
 * Configuraciones > Economía (solo administrador): los catálogos de la economía en una sola pantalla, en
 * pestañas (en el celular se deslizan de costado). La sección va en la URL (?seccion=pagadores).
 */
function ConfiguracionEconomia() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { establecimientoActivo, esAdmin, cargando } = useEstablecimiento()

  const pedida = params.get("seccion")
  const seccion: IdSeccion = SECCIONES.some(s => s.id === pedida) ? (pedida as IdSeccion) : "rubros"
  const elegir = (id: IdSeccion) => router.replace(`${pathname}?seccion=${id}`, { scroll: false })

  const volver = (
    <Link href="/configuraciones" className="inline-flex items-center gap-1.5 h-10 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="h-4 w-4" /> Configuraciones
    </Link>
  )

  if (cargando) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!esAdmin) return <PageContainer>{volver}<p className="text-muted-foreground">Los catálogos de la economía los administra el administrador.</p></PageContainer>
  if (!establecimientoActivo) return <PageContainer>{volver}<p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>

  const estId = establecimientoActivo.id

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold mb-4">Economía</h1>

      <div role="tablist" aria-label="Catálogos de la economía"
        className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {SECCIONES.map(s => (
          <button key={s.id} type="button" role="tab" aria-selected={seccion === s.id} onClick={() => elegir(s.id)}
            className={cn("shrink-0 min-h-11 rounded-full border px-4 text-sm font-medium transition-colors md:min-h-9",
              seccion === s.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {s.nombre}
          </button>
        ))}
      </div>

      {/* Cada sección se monta con la clave del establecimiento: al cambiarlo arranca de cero */}
      <div role="tabpanel" key={`${estId}:${seccion}`}>
        {seccion === "rubros" && <SeccionRubros estId={estId} />}
        {seccion === "conceptos" && <SeccionConceptos estId={estId} />}
        {seccion === "titulares" && <SeccionTitulares estId={estId} />}
        {seccion === "pagadores" && <SeccionPagadores estId={estId} />}
      </div>
    </PageContainer>
  )
}
