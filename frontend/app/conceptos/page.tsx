import { redirect } from "next/navigation"

// Conceptos está en Configuraciones > Economía
export default function Page() {
  redirect("/configuraciones/economia?seccion=conceptos")
}
