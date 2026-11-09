"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { actualizarTipoZona, crearTipoZona, getTiposZona, type TipoZona } from "@/lib/queries/zonas"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Cargando } from "@/components/shared/Cargando"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BOTON, CAMPO } from "@/components/shared/estilos"

const MAX_NOMBRE = 40

// Un nombre repetido lo rechaza la base (único por establecimiento)
const mensaje = (err: unknown) =>
  (err as { code?: string })?.code === "23505" ? "Ya hay un tipo de zona con ese nombre" : mensajeDeError(err)

/**
 * Configuraciones > Potreros (solo administrador): los tipos de zona no aprovechable (monte, bañado, cañada…) que se
 * dibujan dentro de los potreros y se restan para el área efectiva. Cada uno con su color en el mapa. No se borran:
 * se dan de baja (las zonas que ya lo usan lo conservan).
 */
export default function ConfiguracionPotrerosPage() {
  const { establecimientoActivo, esAdmin, cargando } = useEstablecimiento()

  const volver = (
    <Link href="/configuraciones" className="mb-3 inline-flex h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Configuraciones
    </Link>
  )

  if (cargando) return <PageContainer>{volver}<Cargando /></PageContainer>
  if (!esAdmin) return <PageContainer>{volver}<p className="text-muted-foreground">Los tipos de zona los administra el administrador.</p></PageContainer>
  if (!establecimientoActivo) return <PageContainer>{volver}<p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold">Potreros</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Tipos de zona no aprovechable de {establecimientoActivo.nombre}. Las zonas se dibujan dentro de cada potrero (en
        Potreros, desde el detalle del potrero) y se restan de su superficie: lo que queda es el área efectiva, sobre la
        que se calcula la carga.
      </p>
      <ListaTipos key={establecimientoActivo.id} estId={establecimientoActivo.id} />
    </PageContainer>
  )
}

function ListaTipos({ estId }: { estId: string }) {
  const [tipos, setTipos] = useState<TipoZona[] | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [nuevo, setNuevo] = useState("")
  const [colorNuevo, setColorNuevo] = useState("#6b6b6b")

  useEffect(() => {
    let vigente = true
    getTiposZona(estId, { incluirInactivos: true })
      .then(t => { if (vigente) setTipos(t) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los tipos de zona")) })
    return () => { vigente = false }
  }, [estId, version])

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!tipos) return <Cargando />

  const ejecutar = async (accion: () => Promise<unknown>, ok: string) => {
    setEnviando(true)
    try {
      await accion()
      toast.success(ok)
      setVersion(v => v + 1)
    } catch (err) {
      toast.error(mensaje(err))
    } finally {
      setEnviando(false)
    }
  }
  const agregar = () => {
    const nombre = nuevo.trim()
    if (!nombre) return
    const orden = tipos.reduce((m, t) => Math.max(m, t.orden), 0) + 1
    void ejecutar(async () => { await crearTipoZona(estId, nombre, colorNuevo, orden); setNuevo("") }, "Tipo de zona agregado")
  }

  const activos = tipos.filter(t => t.activo)
  const deBaja = tipos.filter(t => !t.activo)

  return (
    <div className="max-w-xl space-y-6">
      <ul className="divide-y rounded-lg border">
        {activos.map(t => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <input type="color" aria-label={`Color de ${t.nombre}`} value={t.color} disabled={enviando}
              onChange={e => void ejecutar(() => actualizarTipoZona(t.id, { color: e.target.value }), "Color actualizado")}
              className="h-9 w-11 cursor-pointer rounded border bg-background p-0.5" />
            <NombreEditable tipo={t} deshabilitado={enviando}
              onGuardar={nombre => void ejecutar(() => actualizarTipoZona(t.id, { nombre }), "Tipo de zona actualizado")} />
            <Button type="button" variant="ghost" size="sm" className="h-10 text-muted-foreground md:h-8" disabled={enviando}
              onClick={() => {
                if (window.confirm(`¿Dar de baja "${t.nombre}"? No se va a poder elegir para zonas nuevas; las que ya lo tienen lo conservan.`)) {
                  void ejecutar(() => actualizarTipoZona(t.id, { activo: false }), "Tipo de zona dado de baja")
                }
              }}>
              Dar de baja
            </Button>
          </li>
        ))}
        {activos.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Sin tipos de zona activos.</li>}
      </ul>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <input type="color" aria-label="Color del tipo nuevo" value={colorNuevo} onChange={e => setColorNuevo(e.target.value)}
          className="h-11 w-12 cursor-pointer rounded border bg-background p-0.5 md:h-9" />
        <Input aria-label="Nuevo tipo de zona" className={CAMPO} placeholder="Nuevo tipo (ej. Pajonal)" maxLength={MAX_NOMBRE}
          value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => { if (e.key === "Enter") agregar() }} />
        <Button type="button" variant="outline" className={BOTON} disabled={enviando || !nuevo.trim()} onClick={agregar}>Agregar</Button>
      </div>

      {deBaja.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Dados de baja</h2>
          <ul className="divide-y rounded-lg border">
            {deBaja.map(t => (
              <li key={t.id} className="flex min-h-11 items-center justify-between gap-3 px-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground line-through">
                  <span aria-hidden className="h-3 w-3 rounded-sm" style={{ backgroundColor: t.color }} />{t.nombre}
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-10 md:h-8" disabled={enviando}
                  onClick={() => void ejecutar(() => actualizarTipoZona(t.id, { activo: true }), "Tipo de zona reactivado")}>
                  Reactivar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// El nombre se guarda al salir del campo, si cambió
function NombreEditable({ tipo, deshabilitado, onGuardar }: { tipo: TipoZona; deshabilitado: boolean; onGuardar: (nombre: string) => void }) {
  const [texto, setTexto] = useState(tipo.nombre)
  return (
    <Input aria-label={`Nombre de ${tipo.nombre}`} className="h-10 min-w-0 flex-1 md:h-8" maxLength={MAX_NOMBRE} value={texto}
      disabled={deshabilitado}
      onChange={e => setTexto(e.target.value)}
      onBlur={() => { const n = texto.trim(); if (n && n !== tipo.nombre) onGuardar(n); else setTexto(tipo.nombre) }} />
  )
}
