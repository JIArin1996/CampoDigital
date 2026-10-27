import { redirect } from "next/navigation"

// Rubros está en Configuraciones > Economía
export default function Page() {
  redirect("/configuraciones/economia?seccion=rubros")
}
