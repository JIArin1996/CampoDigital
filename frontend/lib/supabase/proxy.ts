import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Rutas que se pueden ver sin sesión
const RUTAS_PUBLICAS = ["/login"]

function esRutaPublica(pathname: string) {
  return RUTAS_PUBLICAS.some(r => pathname === r || pathname.startsWith(r + "/"))
}

/**
 * Refresca la sesión de Supabase en cada request y redirige según haya sesión o no.
 * Es solo una comprobación optimista para navegar: la seguridad real la pone el RLS de la base.
 */
export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          // Las respuestas que setean cookies de sesión no se cachean
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    }
  )

  // getUser valida el token contra Supabase Auth; no confía solo en la cookie
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user && !esRutaPublica(pathname)) {
    return redirigirConCookies(request, response, "/login")
  }

  if (user && pathname === "/login") {
    return redirigirConCookies(request, response, "/inicio")
  }

  return response
}

// Redirige conservando las cookies de sesión que Supabase haya refrescado
function redirigirConCookies(request: NextRequest, response: NextResponse, destino: string) {
  const url = request.nextUrl.clone()
  url.pathname = destino
  url.search = ""
  const redirect = NextResponse.redirect(url)
  response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
  return redirect
}
