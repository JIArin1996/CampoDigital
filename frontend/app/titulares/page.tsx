import { redirect } from "next/navigation"

// Titulares está en Configuraciones > Economía
export default function Page() {
  redirect("/configuraciones/economia?seccion=titulares")
}
