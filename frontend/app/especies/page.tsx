"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { actualizarEspecie, crearCategoria, crearEspecie, getCatalogoEspecies } from "@/lib/queries/especies"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import type { CategoriaAnimal, Especie, GrupoEspecie } from "@/types/lotes"

const GRUPOS: { valor: GrupoEspecie; etiqueta: string }[] = [
  { valor: "bovino", etiqueta: "Bovino" },
  { valor: "ovino", etiqueta: "Ovino" },
  { valor: "otro", etiqueta: "Otro" },
]

interface Catalogo {
  estId: string
  especies: Especie[]
  categorias: CategoriaAnimal[]
}

export default function EspeciesPage() {
  const { establecimientoActivo, esAdmin, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState("")
  const [nuevoGrupo, setNuevoGrupo] = useState<GrupoEspecie>("otro")
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    getCatalogoEspecies(estId)
      .then(c => { if (vigente) setCatalogo({ estId, ...c }) })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar las especies")) })
    return () => { vigente = false }
  }, [estId, version])

  if (cargando) return <PageContainer><div className="h-64 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) return <PageContainer title="Especies"><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  if (!esAdmin) return <PageContainer title="Especies"><p className="text-muted-foreground">Solo el administrador configura las especies.</p></PageContainer>

  const listo = catalogo && catalogo.estId === estId ? catalogo : null
  const recargar = () => setVersion(v => v + 1)

  const agregarEspecie = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoNombre.trim()) return setError("La especie necesita un nombre")
    setEnviando(true)
    setError(null)
    try {
      await crearEspecie(establecimientoActivo.id, nuevoNombre.trim(), nuevoGrupo)
      toast.success("Especie agregada")
      setNuevoNombre("")
      setNuevoGrupo("otro")
      recargar()
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo agregar la especie"))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <PageContainer>
      <h1 className="text-2xl font-bold">Especies</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-xl">
        El grupo dice qué es cada especie, sin importar su nombre: la esquila acepta solo lotes de especies del grupo ovino.
      </p>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {!listo ? (
        <div className="h-64 rounded-lg border bg-muted/30 animate-pulse" />
      ) : (
        <div className="space-y-4 max-w-xl">
          {listo.especies.map(especie => (
            <TarjetaEspecie key={`${especie.id}:${especie.nombre}:${especie.grupo}:${especie.activo}`}
              especie={especie}
              categorias={listo.categorias.filter(c => c.especie_id === especie.id)}
              onCambio={recargar} />
          ))}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Agregar especie</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={agregarEspecie} className="space-y-3">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input aria-label="Nombre de la especie nueva" className={CAMPO} placeholder="Ej: Caprinos"
                    value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} />
                  <select aria-label="Grupo de la especie nueva" className={`${SELECT_NATIVO} w-32`} value={nuevoGrupo}
                    onChange={e => setNuevoGrupo(e.target.value as GrupoEspecie)}>
                    {GRUPOS.map(g => <option key={g.valor} value={g.valor}>{g.etiqueta}</option>)}
                  </select>
                </div>
                <Button type="submit" className={BOTON} disabled={enviando}>
                  <Plus className="h-4 w-4 mr-1" /> {enviando ? "Agregando..." : "Agregar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  )
}

function TarjetaEspecie({ especie, categorias, onCambio }: {
  especie: Especie
  categorias: CategoriaAnimal[]
  onCambio: () => void
}) {
  const [nombre, setNombre] = useState(especie.nombre)
  const [grupo, setGrupo] = useState<GrupoEspecie>(especie.grupo)
  const [activo, setActivo] = useState(especie.activo)
  const [nuevaCategoria, setNuevaCategoria] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const cambiado = nombre.trim() !== especie.nombre || grupo !== especie.grupo || activo !== especie.activo

  const ejecutar = async (accion: () => Promise<unknown>, ok: string, despues?: () => void) => {
    setEnviando(true)
    setError(null)
    try {
      await accion()
      toast.success(ok)
      despues?.()
      onCambio()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      // La tarjeta sigue montada después de recargar: hay que volver a habilitarla
      setEnviando(false)
    }
  }

  const guardar = () => {
    if (!nombre.trim()) return setError("La especie necesita un nombre")
    void ejecutar(() => actualizarEspecie(especie.id, { nombre: nombre.trim(), grupo, activo }), "Especie actualizada")
  }

  const agregarCategoria = () => {
    if (!nuevaCategoria.trim()) return setError("La categoría necesita un nombre")
    const orden = categorias.reduce((m, c) => Math.max(m, c.orden), 0) + 1
    void ejecutar(() => crearCategoria(especie.establecimiento_id, especie.id, nuevaCategoria.trim(), orden), "Categoría agregada",
      () => setNuevaCategoria(""))
  }

  return (
    <Card className={especie.activo ? "" : "opacity-70"}>
      <CardContent className="space-y-4 pt-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{especie.nombre}</h2>
          <Badge variant="secondary">{GRUPOS.find(g => g.valor === especie.grupo)?.etiqueta}</Badge>
          {!especie.activo && <Badge variant="outline">inactiva</Badge>}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`esp-nombre-${especie.id}`}>Nombre</Label>
            <Input id={`esp-nombre-${especie.id}`} className={CAMPO} value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`esp-grupo-${especie.id}`}>Grupo</Label>
            <select id={`esp-grupo-${especie.id}`} className={`${SELECT_NATIVO} w-32`} value={grupo}
              onChange={e => setGrupo(e.target.value as GrupoEspecie)}>
              {GRUPOS.map(g => <option key={g.valor} value={g.valor}>{g.etiqueta}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 min-h-11 cursor-pointer select-none w-fit">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={activo} onChange={e => setActivo(e.target.checked)} />
          <span className="text-sm">Activa</span>
        </label>

        {cambiado && (
          <Button type="button" className={BOTON} disabled={enviando} onClick={guardar}>
            {enviando ? "Guardando..." : "Guardar cambios"}
          </Button>
        )}

        <div>
          <p className="text-sm font-medium mb-2">Categorías</p>
          {categorias.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-2">Sin categorías: hacen falta para armar lotes de esta especie.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {categorias.map(c => (
                <Badge key={c.id} variant={c.activo ? "secondary" : "outline"}>{c.nombre}</Badge>
              ))}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input aria-label={`Nueva categoría de ${especie.nombre}`} className={CAMPO} placeholder="Nueva categoría"
              value={nuevaCategoria} onChange={e => setNuevaCategoria(e.target.value)} />
            <Button type="button" variant="outline" className={BOTON} disabled={enviando} onClick={agregarCategoria}>
              Agregar
            </Button>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
