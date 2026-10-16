"use client"

import { useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos"
          : "No se pudo iniciar sesión. Probá de nuevo."
      )
      setEnviando(false)
      return
    }

    // Recarga completa: así el contexto del establecimiento arranca con la sesión nueva
    window.location.assign("/inicio")
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-1">Campo Digital</h1>
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
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11 text-base"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
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
