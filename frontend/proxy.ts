import type { NextRequest } from "next/server"
import { actualizarSesion } from "@/lib/supabase/proxy"

// En Next.js 16 el middleware se llama proxy
export async function proxy(request: NextRequest) {
  return actualizarSesion(request)
}

export const config = {
  // Todo menos archivos estáticos, imágenes y el manifest (el teléfono lo pide antes de iniciar sesión)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt)$).*)",
  ],
}
