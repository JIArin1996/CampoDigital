"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { actualizarPersona, crearPersona, getPersonas, type Persona } from "@/lib/queries/bitacora"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { BOTON, CAMPO } from "@/components/shared/estilos"
import { cn } from "@/lib/utils"

const MAX_NOMBRE = 80
const MAX_ROL = 60

// Un nombre repetido entre las activas lo rechaza la base (índice único): el mensaje dice cuál
const mensaje = (err: unknown) =>
  (err as { code?: string })?.code === "23505" ? "Ya hay una persona activa con ese nombre" : mensajeDeError(err)

/**
 * Configuraciones > Personas (solo administrador): los responsables posibles de notas, tareas y actividades.
 * Pueden ser usuarios (su ficha se crea sola al darles acceso) o no (un peón, el veterinario). No se borran:
 * se dan de baja, y siguen apareciendo en lo que ya tienen asignado.
 */
export default function ConfiguracionPersonasPage() {
  const { establecimientoActivo, esAdmin, cargando } = useEstablecimiento()

  const volver = (
    <Link href="/configuraciones" className="inline-flex items-center gap-1.5 h-10 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="h-4 w-4" /> Configuraciones
    </Link>
  )

  if (cargando) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!esAdmin) return <PageContainer>{volver}<p className="text-muted-foreground">Las personas las administra el administrador.</p></PageContainer>
  if (!establecimientoActivo) return <PageContainer>{volver}<p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold">Personas</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Los responsables que se pueden elegir en notas, tareas y actividades de {establecimientoActivo.nombre}. Los usuarios
        aparecen solos; acá se agregan los que no usan la app (un peón, el veterinario, un contratista).
      </p>
      {/* Con la clave del establecimiento: al cambiarlo arranca de cero */}
      <ListaPersonas key={establecimientoActivo.id} estId={establecimientoActivo.id} />
    </PageContainer>
  )
}

function ListaPersonas({ estId }: { estId: string }) {
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: "", rol: "" })

  useEffect(() => {
    let vigente = true
    getPersonas(estId)
      .then(p => { if (vigente) setPersonas(p) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar las personas")) })
    return () => { vigente = false }
  }, [estId, version])

  const ejecutar = async (accion: () => Promise<unknown>, ok: string, despues?: () => void) => {
    setEnviando(true)
    try {
      await accion()
      toast.success(ok)
      despues?.()
      setVersion(v => v + 1)
    } catch (err) {
      toast.error(mensaje(err))
    } finally {
      setEnviando(false)
    }
  }

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!personas) return <div className="h-40 max-w-2xl rounded-lg border bg-muted/30 animate-pulse" />

  // Dos grupos, como en el selector de responsables: usuarios y personas sin usuario. En cada uno, las activas
  // primero y por nombre (ya vienen ordenadas).
  const ordenadas = [...personas].sort((a, b) => Number(b.activo) - Number(a.activo))
  const grupos = [
    { titulo: "Usuarios", vacio: "Ningún usuario tiene acceso a este establecimiento.", lista: ordenadas.filter(p => p.user_id) },
    { titulo: "Personas", vacio: "Todavía no hay personas sin usuario.", lista: ordenadas.filter(p => !p.user_id) },
  ]

  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-4 pt-4">
        {grupos.map(g => (
          <section key={g.titulo} className="space-y-2">
            <h2 className="text-sm font-semibold">{g.titulo} <span className="font-normal text-muted-foreground">({g.lista.length})</span></h2>
            {g.lista.length === 0 ? (
              <p className="text-sm text-muted-foreground">{g.vacio}</p>
            ) : (
              <ul className="rounded-lg border divide-y">
                {g.lista.map(p => (
                  <FilaPersona key={`${p.id}:${p.nombre}:${p.rol ?? ""}:${p.activo}`} persona={p} enviando={enviando}
                    onGuardar={c => void ejecutar(() => actualizarPersona(p.id, c), "Persona actualizada")}
                    onActivo={activo => void ejecutar(() => actualizarPersona(p.id, { activo }), activo ? "Persona reactivada" : "Persona dada de baja")} />
                ))}
              </ul>
            )}
          </section>
        ))}
        <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
          <Input aria-label="Nombre de la persona nueva" className={CAMPO} maxLength={MAX_NOMBRE} placeholder="Nombre (ej: Juan Pérez)"
            value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} />
          <Input aria-label="Rol de la persona nueva" className={CAMPO} maxLength={MAX_ROL} placeholder="Rol (opcional: peón)"
            value={nuevo.rol} onChange={e => setNuevo(n => ({ ...n, rol: e.target.value }))} />
          <Button type="button" variant="outline" className={BOTON} disabled={enviando || !nuevo.nombre.trim()}
            onClick={() => void ejecutar(() => crearPersona(estId, nuevo.nombre.trim(), nuevo.rol.trim() || null), "Persona agregada",
              () => setNuevo({ nombre: "", rol: "" }))}>
            Agregar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Una persona: nombre y rol editables, y dar de baja o reactivar. Un usuario lleva el nombre de Usuarios (la base
// no deja cambiarlo acá): solo se edita su rol, y la baja no le quita el acceso.
function FilaPersona({ persona, enviando, onGuardar, onActivo }: {
  persona: Persona
  enviando: boolean
  onGuardar: (cambios: { nombre?: string; rol: string | null }) => void
  onActivo: (activo: boolean) => void
}) {
  const [nombre, setNombre] = useState(persona.nombre)
  const [rol, setRol] = useState(persona.rol ?? "")
  const esUsuario = !!persona.user_id
  const cambiado = nombre.trim() !== persona.nombre || rol.trim() !== (persona.rol ?? "")
  const { activo } = persona

  return (
    <li className="space-y-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {esUsuario ? (
          <span className={cn("flex-1 min-w-40 px-1 text-base font-medium md:text-sm", !activo && "text-muted-foreground line-through")}>
            {persona.nombre}
          </span>
        ) : (
          <Input aria-label={`Nombre de ${persona.nombre}`} className={cn(CAMPO, "flex-1 min-w-40", !activo && "text-muted-foreground line-through")}
            maxLength={MAX_NOMBRE} value={nombre} onChange={e => setNombre(e.target.value)} disabled={!activo} />
        )}
        <Input aria-label={`Rol de ${persona.nombre}`} className={cn(CAMPO, "w-full sm:w-40")} maxLength={MAX_ROL} placeholder="Rol"
          value={rol} onChange={e => setRol(e.target.value)} disabled={!activo} />
        {cambiado && (
          <Button type="button" size="sm" className="h-10 md:h-8" disabled={enviando || !nombre.trim()}
            onClick={() => onGuardar(esUsuario ? { rol: rol.trim() || null } : { nombre: nombre.trim(), rol: rol.trim() || null })}>
            Guardar
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className={cn("h-10 md:h-8", activo ? "text-muted-foreground" : "text-primary")}
          disabled={enviando} onClick={() => onActivo(!activo)}>
          {activo ? "Dar de baja" : "Reactivar"}
        </Button>
      </div>
      {(persona.user_id || !activo) && (
        <p className="text-xs text-muted-foreground">
          {!activo
            ? "De baja: no se ofrece como responsable, pero sigue en lo que ya tiene asignado."
            : "El nombre es el de Usuarios (se cambia ahí). Darlo de baja como responsable no le quita el acceso a la app."}
        </p>
      )}
    </li>
  )
}
