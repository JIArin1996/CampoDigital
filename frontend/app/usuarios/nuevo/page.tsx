"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { crearUsuario } from "@/app/usuarios/acciones"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectorRol, type OpcionAcceso } from "@/components/usuarios/SelectorRol"
import { DESCRIPCION_ROL, LARGO_MINIMO_CONTRASENA } from "@/components/usuarios/roles"
import { BOTON, CAMPO } from "@/components/shared/estilos"
import type { RolMembresia } from "@/types/database"

export default function NuevoUsuarioPage() {
  const router = useRouter()
  const { esAdmin, establecimientos, cargando } = useEstablecimiento()

  const [email, setEmail] = useState("")
  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [celular, setCelular] = useState("")
  const [password, setPassword] = useState("")
  const [verPassword, setVerPassword] = useState(false)
  const [esAdminNuevo, setEsAdminNuevo] = useState(false)
  const [accesos, setAccesos] = useState<Record<string, OpcionAcceso>>({})
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const volver = (
    <Link href="/usuarios" className="inline-flex items-center gap-1.5 h-10 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="h-4 w-4" /> Volver a usuarios
    </Link>
  )

  if (cargando) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!esAdmin) return <PageContainer>{volver}<p className="text-muted-foreground">Solo un administrador puede crear usuarios.</p></PageContainer>

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim()) return setError("El email es obligatorio")
    if (!nombre.trim()) return setError("El nombre es obligatorio")
    if (password.length < LARGO_MINIMO_CONTRASENA) {
      return setError(`La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`)
    }

    const asignaciones = Object.entries(accesos)
      .filter(([, rol]) => rol !== "")
      .map(([establecimiento_id, rol]) => ({ establecimiento_id, rol: rol as RolMembresia }))

    setEnviando(true)
    const r = await crearUsuario({
      email,
      password,
      nombre,
      apellido: apellido || null,
      celular: celular || null,
      esAdmin: esAdminNuevo,
      asignaciones,
    })
    if (!r.ok) {
      setError(r.error)
      setEnviando(false)
      return
    }
    toast.success("Usuario creado. Pasale su email y la contraseña provisoria.")
    router.push(`/usuarios/${r.data?.id}`)
  }

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold mb-6">Nuevo usuario</h1>

      <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
        <div className="space-y-1.5">
          <Label htmlFor="nu-email">Email</Label>
          <Input id="nu-email" type="email" inputMode="email" autoComplete="off" className={CAMPO} value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="nu-nombre">Nombre</Label>
            <Input id="nu-nombre" className={CAMPO} value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-apellido">Apellido</Label>
            <Input id="nu-apellido" className={CAMPO} value={apellido} onChange={e => setApellido(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nu-celular">Celular</Label>
          <Input id="nu-celular" type="tel" inputMode="tel" className={CAMPO} value={celular} onChange={e => setCelular(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nu-password">Contraseña provisoria</Label>
          <div className="flex gap-2">
            <Input
              id="nu-password"
              type={verPassword ? "text" : "password"}
              autoComplete="new-password"
              className={CAMPO}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 w-11 md:h-9 md:w-9 shrink-0"
              aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setVerPassword(v => !v)}
            >
              {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Mínimo {LARGO_MINIMO_CONTRASENA} caracteres. El usuario la puede cambiar después desde su perfil.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-5 w-5 mt-0.5 accent-primary"
            checked={esAdminNuevo}
            onChange={e => setEsAdminNuevo(e.target.checked)}
          />
          <span>
            <span className="font-medium">Administrador</span>
            <span className="block text-sm text-muted-foreground">{DESCRIPCION_ROL.administrador}</span>
          </span>
        </label>

        {!esAdminNuevo && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">Acceso por establecimiento</legend>
            {establecimientos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay establecimientos activos.</p>
            ) : (
              <div className="rounded-lg border divide-y">
                {establecimientos.map(est => (
                  <div key={est.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <label htmlFor={`acc-${est.id}`} className="text-base md:text-sm">{est.nombre}</label>
                    <SelectorRol
                      id={`acc-${est.id}`}
                      value={accesos[est.id] ?? ""}
                      onChange={v => setAccesos(prev => ({ ...prev, [est.id]: v }))}
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Operador: {DESCRIPCION_ROL.operador.toLowerCase()}. Consulta: {DESCRIPCION_ROL.consulta.toLowerCase()}.
            </p>
          </fieldset>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" className={BOTON} disabled={enviando}>
            {enviando ? "Creando..." : "Crear usuario"}
          </Button>
          <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      </form>
    </PageContainer>
  )
}
