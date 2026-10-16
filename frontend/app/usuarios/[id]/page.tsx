"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { asignarRol, definirAdmin, getMembresias, getPerfil, quitarAcceso, updatePerfil } from "@/lib/queries/usuarios"
import { cambiarEmail, cambiarEstadoUsuario, resetearContrasena } from "@/app/usuarios/acciones"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar } from "@/components/usuarios/Avatar"
import { SelectorRol, type OpcionAcceso } from "@/components/usuarios/SelectorRol"
import { DESCRIPCION_ROL, LARGO_MINIMO_CONTRASENA, nombreCompleto } from "@/components/usuarios/roles"
import { BOTON, CAMPO } from "@/components/shared/estilos"
import type { Membresia, Perfil } from "@/types/database"

export default function UsuarioPage() {
  const { id } = useParams<{ id: string }>()
  const { esAdmin, perfil: yo, establecimientos, cargando } = useEstablecimiento()
  const [ficha, setFicha] = useState<{ clave: string; perfil: Perfil | null; membresias: Membresia[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)   // sube para recargar después de un cambio

  useEffect(() => {
    if (!esAdmin) return
    let vigente = true
    const clave = `${id}:${version}`
    Promise.all([getPerfil(id), getMembresias(id)])
      .then(([perfil, membresias]) => {
        if (vigente) setFicha({ clave, perfil, membresias })
      })
      .catch(err => {
        if (vigente) setError(mensajeDeError(err, "No se pudo cargar el usuario"))
      })
    return () => { vigente = false }
  }, [id, version, esAdmin])

  const recargar = () => setVersion(v => v + 1)

  const volver = (
    <Link href="/usuarios" className="inline-flex items-center gap-1.5 h-10 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="h-4 w-4" /> Volver a usuarios
    </Link>
  )

  if (cargando) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!esAdmin) return <PageContainer>{volver}<p className="text-muted-foreground">Solo un administrador puede gestionar usuarios.</p></PageContainer>

  // Mientras recarga se sigue mostrando la ficha anterior
  const vigente = ficha && ficha.clave.startsWith(`${id}:`) ? ficha : null
  if (error && !vigente) return <PageContainer>{volver}<p role="alert" className="text-sm text-destructive">{error}</p></PageContainer>
  if (!vigente) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>

  const { perfil, membresias } = vigente
  if (!perfil) return <PageContainer>{volver}<p className="text-muted-foreground">No se encontró el usuario.</p></PageContainer>

  const soyYo = perfil.id === yo?.id

  return (
    <PageContainer>
      {volver}

      {/* Encabezado */}
      <div className="flex items-center gap-4 mb-6">
        <Avatar nombre={perfil.nombre} apellido={perfil.apellido} fotoPath={perfil.foto_path} className="h-16 w-16 text-xl" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{nombreCompleto(perfil)}</h1>
          <p className="text-sm text-muted-foreground truncate">{perfil.email}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            {perfil.es_admin && <Badge>Administrador</Badge>}
            {!perfil.activo && <Badge variant="secondary">Desactivado</Badge>}
            {soyYo && <Badge variant="outline">Vos</Badge>}
          </div>
        </div>
      </div>

      <div className="space-y-6 max-w-xl">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Datos</CardTitle></CardHeader>
          <CardContent>
            <DatosUsuario key={perfil.updated_at} perfil={perfil} onCambio={recargar} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Acceso</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <EmailUsuario key={perfil.email} perfil={perfil} onCambio={recargar} />
            <ResetContrasena perfil={perfil} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Rol</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <AdminUsuario perfil={perfil} soyYo={soyYo} onCambio={recargar} />
            {!perfil.es_admin && (
              <AccesosUsuario perfil={perfil} membresias={membresias} establecimientos={establecimientos} onCambio={recargar} />
            )}
          </CardContent>
        </Card>

        {!soyYo && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Estado</CardTitle></CardHeader>
            <CardContent>
              <EstadoUsuario perfil={perfil} onCambio={recargar} />
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  )
}

// ── Datos (nombre, apellido, celular) ────────────────────────────────────────

function DatosUsuario({ perfil, onCambio }: { perfil: Perfil; onCambio: () => void }) {
  const [nombre, setNombre] = useState(perfil.nombre)
  const [apellido, setApellido] = useState(perfil.apellido ?? "")
  const [celular, setCelular] = useState(perfil.celular ?? "")
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return toast.error("El nombre es obligatorio")
    setGuardando(true)
    try {
      await updatePerfil(perfil.id, { nombre: nombre.trim(), apellido: apellido.trim() || null, celular: celular.trim() || null })
      toast.success("Datos guardados")
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="u-nombre">Nombre</Label>
          <Input id="u-nombre" className={CAMPO} value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-apellido">Apellido</Label>
          <Input id="u-apellido" className={CAMPO} value={apellido} onChange={e => setApellido(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-celular">Celular</Label>
        <Input id="u-celular" type="tel" inputMode="tel" className={CAMPO} value={celular} onChange={e => setCelular(e.target.value)} />
      </div>
      <Button type="submit" className={BOTON} disabled={guardando}>{guardando ? "Guardando..." : "Guardar datos"}</Button>
    </form>
  )
}

// ── Email de acceso ──────────────────────────────────────────────────────────

function EmailUsuario({ perfil, onCambio }: { perfil: Perfil; onCambio: () => void }) {
  const [email, setEmail] = useState(perfil.email)
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (email.trim().toLowerCase() === perfil.email) return
    setGuardando(true)
    const r = await cambiarEmail(perfil.id, email)
    setGuardando(false)
    if (!r.ok) return toast.error(r.error)
    toast.success("Email cambiado. Desde ahora entra con el nuevo.")
    onCambio()
  }

  return (
    <form onSubmit={guardar} className="space-y-1.5">
      <Label htmlFor="u-email">Email de acceso</Label>
      <div className="flex gap-2">
        <Input id="u-email" type="email" inputMode="email" className={CAMPO} value={email} onChange={e => setEmail(e.target.value)} />
        <Button type="submit" variant="outline" className="h-11 md:h-9 shrink-0" disabled={guardando}>
          {guardando ? "..." : "Cambiar"}
        </Button>
      </div>
    </form>
  )
}

// ── Reseteo de contraseña (así se recupera una contraseña olvidada) ──────────

function ResetContrasena({ perfil }: { perfil: Perfil }) {
  const [password, setPassword] = useState("")
  const [ver, setVer] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const resetear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < LARGO_MINIMO_CONTRASENA) {
      return toast.error(`La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`)
    }
    if (!window.confirm(`¿Cambiar la contraseña de ${nombreCompleto(perfil)}?`)) return
    setGuardando(true)
    const r = await resetearContrasena(perfil.id, password)
    setGuardando(false)
    if (!r.ok) return toast.error(r.error)
    setPassword("")
    toast.success("Contraseña cambiada. Pasásela al usuario.")
  }

  return (
    <form onSubmit={resetear} className="space-y-1.5">
      <Label htmlFor="u-reset">Nueva contraseña provisoria</Label>
      <div className="flex gap-2">
        <Input
          id="u-reset"
          type={ver ? "text" : "password"}
          autoComplete="new-password"
          className={CAMPO}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <Button type="button" variant="outline" className="h-11 w-11 md:h-9 md:w-9 shrink-0" aria-label={ver ? "Ocultar" : "Mostrar"} onClick={() => setVer(v => !v)}>
          {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button type="submit" variant="outline" className="h-11 md:h-9 shrink-0" disabled={guardando}>
          {guardando ? "..." : "Resetear"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Para cuando se olvida la contraseña. El usuario la puede cambiar después.</p>
    </form>
  )
}

// ── Administrador del sistema ────────────────────────────────────────────────

function AdminUsuario({ perfil, soyYo, onCambio }: { perfil: Perfil; soyYo: boolean; onCambio: () => void }) {
  const [guardando, setGuardando] = useState(false)

  const cambiar = async () => {
    const nuevo = !perfil.es_admin
    const aviso = nuevo
      ? `¿Hacer administrador a ${nombreCompleto(perfil)}? Va a poder ver y cambiar todo, incluidos los usuarios.`
      : soyYo
        ? "¿Dejar de ser administrador? Vas a perder el acceso a esta pantalla."
        : `¿Quitarle el rol de administrador a ${nombreCompleto(perfil)}?`
    if (!window.confirm(aviso)) return
    setGuardando(true)
    try {
      await definirAdmin(perfil.id, nuevo)
      if (soyYo && !nuevo) {
        window.location.assign("/establecimientos")
        return
      }
      toast.success(nuevo ? "Ahora es administrador" : "Ya no es administrador")
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-medium">Administrador</p>
        <p className="text-sm text-muted-foreground">{DESCRIPCION_ROL.administrador}</p>
      </div>
      <Button
        type="button"
        variant={perfil.es_admin ? "outline" : "default"}
        className="h-11 md:h-9 shrink-0"
        disabled={guardando}
        onClick={cambiar}
      >
        {perfil.es_admin ? "Quitar" : "Hacer admin"}
      </Button>
    </div>
  )
}

// ── Acceso por establecimiento (operador / consulta) ─────────────────────────

function AccesosUsuario({
  perfil, membresias, establecimientos, onCambio,
}: {
  perfil: Perfil
  membresias: Membresia[]
  establecimientos: { id: string; nombre: string }[]
  onCambio: () => void
}) {
  const [guardandoEst, setGuardandoEst] = useState<string | null>(null)

  const cambiar = async (establecimientoId: string, nombreEst: string, valor: OpcionAcceso) => {
    setGuardandoEst(establecimientoId)
    try {
      if (valor === "") {
        await quitarAcceso(perfil.id, establecimientoId)
        toast.success(`Sin acceso a ${nombreEst}`)
      } else {
        await asignarRol(perfil.id, establecimientoId, valor)
        toast.success(`${nombreEst}: ${valor}`)
      }
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setGuardandoEst(null)
    }
  }

  if (establecimientos.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay establecimientos activos.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Acceso por establecimiento</p>
      <div className="rounded-lg border divide-y">
        {establecimientos.map(est => {
          const actual = membresias.find(m => m.establecimiento_id === est.id)?.rol ?? ""
          return (
            <div key={est.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <label htmlFor={`acc-${est.id}`} className="text-base md:text-sm">{est.nombre}</label>
              <SelectorRol
                id={`acc-${est.id}`}
                value={actual}
                disabled={guardandoEst === est.id}
                onChange={v => cambiar(est.id, est.nombre, v)}
              />
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Al dar acceso, el usuario queda también en el catálogo de personas del establecimiento, como posible responsable.
      </p>
    </div>
  )
}

// ── Desactivar / reactivar (no se borra) ─────────────────────────────────────

function EstadoUsuario({ perfil, onCambio }: { perfil: Perfil; onCambio: () => void }) {
  const [guardando, setGuardando] = useState(false)

  const cambiar = async () => {
    const activar = !perfil.activo
    const aviso = activar
      ? `¿Reactivar a ${nombreCompleto(perfil)}? Vuelve a poder entrar con sus accesos.`
      : `¿Desactivar a ${nombreCompleto(perfil)}? No va a poder entrar, pero su nombre sigue en todo lo que cargó.`
    if (!window.confirm(aviso)) return
    setGuardando(true)
    const r = await cambiarEstadoUsuario(perfil.id, activar)
    setGuardando(false)
    if (!r.ok) return toast.error(r.error)
    toast.success(activar ? "Usuario reactivado" : "Usuario desactivado")
    onCambio()
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {perfil.activo
          ? "Desactivar le quita el acceso al momento. No se borra nada."
          : "Este usuario está desactivado: no puede entrar."}
      </p>
      <Button
        type="button"
        variant={perfil.activo ? "destructive" : "default"}
        className="h-11 md:h-9 shrink-0"
        disabled={guardando}
        onClick={cambiar}
      >
        {perfil.activo ? "Desactivar" : "Reactivar"}
      </Button>
    </div>
  )
}
