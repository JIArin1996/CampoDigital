import { Suspense } from "react"
import { notFound } from "next/navigation"

import { PruebaEtiquetas } from "./PruebaEtiquetas"

// Página de desarrollo: las etiquetas del mapa con potreros inventados. En producción no existe.
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound()
  return (
    <Suspense>
      <PruebaEtiquetas />
    </Suspense>
  )
}
