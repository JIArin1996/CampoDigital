import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

/**
 * Cliente con la clave service_role: saltea el RLS y administra Supabase Auth.
 *
 * SOLO EN EL SERVIDOR. "server-only" hace fallar el build si algún componente del
 * navegador lo importa. La clave va en frontend/.env.local (y en Vercel) como
 * SUPABASE_SERVICE_ROLE_KEY, sin NEXT_PUBLIC_: nunca llega al navegador.
 *
 * Usarlo únicamente después de verificar que quien llama es administrador.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor")
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
