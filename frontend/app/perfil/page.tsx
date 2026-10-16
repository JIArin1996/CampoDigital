"use client"

import { useState } from "react"
import Link from "next/link"
import { Users } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { updatePerfil } from "@/lib/queries/usuarios"
import { mensajeDeError } from "@/lib/supabase/errores"
import { createClient } from "@/lib/supabase/client"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FotoPerfil } from "@/components/usuarios/FotoPerfil"
import { ETIQUETA_ROL, LARGO_MINIMO_CONTRASENA } from "@/components/usuarios/roles"
import { BOTON, CAMPO } from "@/components/shared/estilos"
import type { Perfil } from "@/types/database"

export default function PerfilPage() {
  const { perfil, esAdmin, establecimientos, rolEn, cargando, recargarPerfil } = useEstablecimiento()

  if (cargando) {
    return <PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }

  if (!perfil) {
    return (
      <PageContainer title="Mi perfil">
        <p className="text-muted-foreground">No se encontró tu perfil. Pedile al administrador que lo revise.</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer title="Mi perfil">
      <div className="space-y-6 max-w-xl">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mis datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FotoPerfil perfil={perfil} onCambio={recargarPerfil} />
            {/* key: si el perfil se recarga, el formulario arranca con los datos nuevos */}
            <DatosForm key={perfil.updated_at} perfil={perfil} onGuardado={recargarPerfil} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contraseña</CardTitle>
          </CardHeader>
          <CardContent>
            <ContrasenaForm email={perfil.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mis establecimientos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {esAdmin && (
              <p className="text-sm">
                Sos <strong>administrador</strong>: tenés acceso a todos los establecimientos.
              </p>
            )}
            {establecimientos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no tenés establecimientos asignados.</p>
            ) : (
              <ul className="divide-y">
                {establecimientos.map(est => {
                  const rol = rolEn(est.id)
                  return (
                    <li key={est.id} className="flex items-center justify-between py-2">
                      <span className="text-sm">{est.nombre}</span>
                      {rol && <Badge variant={rol === "consulta" ? "secondary" : "default"}>{ETIQUETA_ROL[rol]}</Badge>}
                    </li>
                  )
                })}
              </ul>
            )}
            {esAdmin && (
              <Link href="/usuarios" className={buttonVariants({ variant: "outline", className: "h-11 md:h-9 mt-2" })}>
                <Users className="h-4 w-4 mr-1" />
                Gestionar usuarios
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

// ── Datos personales ─────────────────────────────────────────────────────────

function DatosForm({ perfil, onGuardado }: { perfil: Perfil; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(perfil.nombre)
  const [apellido, setApellido] = useState(perfil.apellido ?? "")
  const [celular, setCelular] = useState(perfil.celular ?? "")
  const [guardando, setGuardando] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) {
      toast.error("El nombre es obligatorio")
      return
    }
    setGuardando(true)
    try {
      await updatePerfil(perfil.id, {
        nombre: nombre.trim(),
        apellido: apellido.trim() || null,
        celular: celular.trim() || null,
      })
      toast.success("Datos guardados")
      onGuardado()
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="perfil-nombre">Nombre</Label>
          <Input id="perfil-nombre" className={CAMPO} value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="perfil-apellido">Apellido</Label>
          <Input id="perfil-apellido" className={CAMPO} value={apellido} onChange={e => setApellido(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="perfil-celular">Celular</Label>
        <Input
          id="perfil-celular"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Ej: 099 123 456"
          className={CAMPO}
          value={celular}
          onChange={e => setCelular(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="perfil-email">Email</Label>
        <Input id="perfil-email" className={CAMPO} value={perfil.email} disabled />
        <p className="text-xs text-muted-foreground">El email de acceso lo cambia el administrador.</p>
      </div>
      <Button type="submit" className={BOTON} disabled={guardando}>
        {guardando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  )
}

// ── Cambio de contraseña (pide la actual) ────────────────────────────────────

function ContrasenaForm({ email }: { email: string }) {
  const [actual, setActual] = useState("")
  const [nueva, setNueva] = useState("")
  const [repetida, setRepetida] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (nueva.length < LARGO_MINIMO_CONTRASENA) return setError(`La contraseña nueva tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`)
    if (nueva !== repetida) return setError("Las contraseñas nuevas no coinciden")
    if (nueva === actual) return setError("La contraseña nueva tiene que ser distinta de la actual")

    setGuardando(true)
    const supabase = createClient()
    try {
      // Se verifica la contraseña actual volviendo a iniciar sesión con ella
      const { error: errorActual } = await supabase.auth.signInWithPassword({ email, password: actual })
      if (errorActual) {
        setError("La contraseña actual no es correcta")
        return
      }
      const { error: errorNueva } = await supabase.auth.updateUser({ password: nueva })
      if (errorNueva) {
        setError("No se pudo cambiar la contraseña")
        return
      }
      setActual("")
      setNueva("")
      setRepetida("")
      toast.success("Contraseña cambiada")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pass-actual">Contraseña actual</Label>
        <Input id="pass-actual" type="password" autoComplete="current-password" className={CAMPO} value={actual} onChange={e => setActual(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pass-nueva">Contraseña nueva</Label>
          <Input id="pass-nueva" type="password" autoComplete="new-password" className={CAMPO} value={nueva} onChange={e => setNueva(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pass-repetida">Repetila</Label>
          <Input id="pass-repetida" type="password" autoComplete="new-password" className={CAMPO} value={repetida} onChange={e => setRepetida(e.target.value)} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className={BOTON} disabled={guardando}>
        {guardando ? "Cambiando..." : "Cambiar contraseña"}
      </Button>
    </form>
  )
}
