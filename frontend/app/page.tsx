import { redirect } from "next/navigation"

// La página raíz lleva al inicio
export default function Home() {
  redirect("/inicio")
}
