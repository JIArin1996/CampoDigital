"use client"

import { useState } from "react"
import Image from "next/image"
import { Eye, EyeOff } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "Email o contraseña incorrectos"
            : error.message === "Email not confirmed"
              ? "La cuenta todavía no está confirmada. Pedile al administrador que la revise."
              : "No se pudo iniciar sesión. Probá de nuevo."
        )
        setEnviando(false)
        return
      }
    } catch {
      setError("No hay conexión con el servidor. Revisá la señal o la wifi y probá de nuevo.")
      setEnviando(false)
      return
    }

    // Recarga completa: así el contexto del establecimiento arranca con la sesión nueva
    window.location.assign("/inicio")
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm">
        <h1 className="sr-only">Campo Digital</h1>
        <Image
          src="/logo-campo-digital.webp"
          alt="Campo Digital"
          width={454}
          height={456}
          priority
          className="mx-auto mb-6 h-auto w-48"
        />
        <p className="text-sm text-muted-foreground text-center mb-8">Ingresá con tu cuenta</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              className="h-11 text-base"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={verPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="h-11 text-base pr-12"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={verPassword ? "Ocultar la contraseña" : "Mostrar la contraseña"}
                aria-pressed={verPassword}
                onClick={() => setVerPassword(v => !v)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {verPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full h-11 text-base" disabled={enviando}>
            {enviando ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-8">
          Las cuentas las crea el administrador. Si te olvidaste la contraseña,
          pedile que te la resetee.
        </p>
      </div>
    </main>
  )
}
