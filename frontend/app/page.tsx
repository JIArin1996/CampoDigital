import { redirect } from "next/navigation"

// La página raíz redirige al listado de establecimientos
export default function Home() {
  redirect("/establecimientos")
}
