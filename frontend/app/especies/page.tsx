"use client"

import { useEffect, useState } from "react"
import { Check, Plus } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import {
  actualizarEspecie, cambiarEstadoCategoria, crearCategoria, crearEspecie, getCatalogoEspecies, getStockCategoria,
} from "@/lib/queries/especies"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { COLORES_SUGERIDOS, COLOR_POR_GRUPO, colorSuave, ordenarCategorias, textoSobre } from "@/components/lotes/agrupacion"
import { cn } from "@/lib/utils"
import type { CategoriaAnimal, Especie, GrupoEspecie } from "@/types/lotes"

const GRUPOS: { valor: GrupoEspecie; etiqueta: string }[] = [
  { valor: "bovino", etiqueta: "Bovino" },
  { valor: "ovino", etiqueta: "Ovino" },
  { valor: "otro", etiqueta: "Otro" },
]
const etiquetaGrupo = (g: GrupoEspecie) => GRUPOS.find(x => x.valor === g)?.etiqueta ?? g

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
  const [nuevoColor, setNuevoColor] = useState<string | null>(null)
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
      await crearEspecie(establecimientoActivo.id, nuevoNombre.trim(), nuevoGrupo, nuevoColor)
      toast.success("Especie agregada")
      setNuevoNombre("")
      setNuevoGrupo("otro")
      setNuevoColor(null)
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
        El grupo se elige al agregar la especie y no cambia: dice qué es cada especie, sin importar su nombre (la esquila acepta solo
        lotes de especies del grupo ovino, y la pantalla Lotes ordena Bovinos, Ovinos y Otros). El color identifica a la especie en Lotes.
      </p>

      {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}

      {!listo ? (
        <div className="h-64 rounded-lg border bg-muted/30 animate-pulse" />
      ) : (
        <div className="space-y-4 max-w-xl">
          {listo.especies.map(especie => (
            <TarjetaEspecie key={`${especie.id}:${especie.nombre}:${especie.color}:${especie.activo}`}
              especie={especie}
              categorias={listo.categorias.filter(c => c.especie_id === especie.id)}
              onCambio={recargar} />
          ))}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Agregar especie</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={agregarEspecie} className="space-y-4">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="esp-nueva-nombre">Nombre</Label>
                    <Input id="esp-nueva-nombre" className={CAMPO} placeholder="Ej: Equinos"
                      value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="esp-nueva-grupo">Grupo</Label>
                    <select id="esp-nueva-grupo" className={`${SELECT_NATIVO} w-32`} value={nuevoGrupo}
                      onChange={e => setNuevoGrupo(e.target.value as GrupoEspecie)}>
                      {GRUPOS.map(g => <option key={g.valor} value={g.valor}>{g.etiqueta}</option>)}
                    </select>
                  </div>
                </div>
                <SelectorColor id="esp-nueva-color" valor={nuevoColor} grupo={nuevoGrupo} onCambio={setNuevoColor} />
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

/**
 * Color de la especie: los sugeridos, uno libre y "el del grupo" (vacío en la base).
 * La muestra usa el color elegido o, si no hay, el del grupo, con el texto de mayor contraste.
 */
function SelectorColor({ id, valor, grupo, onCambio }: {
  id: string
  valor: string | null
  grupo: GrupoEspecie
  onCambio: (color: string | null) => void
}) {
  const efectivo = valor ?? COLOR_POR_GRUPO[grupo]
  const elegido = (hex: string) => valor !== null && valor.toLowerCase() === hex.toLowerCase()

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium mb-1">Color</legend>
      <div className="flex flex-wrap items-center gap-2">
        {COLORES_SUGERIDOS.map(c => (
          <button key={c.hex} type="button" aria-label={c.nombre} aria-pressed={elegido(c.hex)} title={c.nombre}
            onClick={() => onCambio(c.hex)}
            className={cn("flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-full border-2 transition-shadow",
              elegido(c.hex) ? "border-foreground ring-2 ring-ring/40" : "border-transparent")}
            style={{ backgroundColor: c.hex }}>
            {elegido(c.hex) && <Check className="h-4 w-4" style={{ color: textoSobre(c.hex) }} />}
          </button>
        ))}
        <label htmlFor={id} className="flex h-11 md:h-9 items-center gap-2 rounded-lg border px-2 text-sm cursor-pointer">
          <input id={id} type="color" className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
            value={efectivo} onChange={e => onCambio(e.target.value)} />
          Otro
        </label>
      </div>
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="rounded-full px-3 py-1 font-medium" style={{ backgroundColor: efectivo, color: textoSobre(efectivo) }}>
          Así se ve
        </span>
        {valor === null ? (
          <span className="text-muted-foreground">Color del grupo ({etiquetaGrupo(grupo).toLowerCase()})</span>
        ) : (
          <button type="button" className="text-primary font-medium min-h-11 md:min-h-0" onClick={() => onCambio(null)}>
            Usar el color del grupo
          </button>
        )}
      </div>
    </fieldset>
  )
}

function TarjetaEspecie({ especie, categorias, onCambio }: {
  especie: Especie
  categorias: CategoriaAnimal[]
  onCambio: () => void
}) {
  const [nombre, setNombre] = useState(especie.nombre)
  const [activo, setActivo] = useState(especie.activo)
  const [color, setColor] = useState<string | null>(especie.color)
  const [nuevaCategoria, setNuevaCategoria] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const colorActual = especie.color ?? COLOR_POR_GRUPO[especie.grupo]
  const cambiado = nombre.trim() !== especie.nombre || activo !== especie.activo || color !== especie.color
  const ordenadas = ordenarCategorias(categorias)
  const activas = ordenadas.filter(c => c.activo)
  const deBaja = ordenadas.filter(c => !c.activo)

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
    void ejecutar(() => actualizarEspecie(especie.id, { nombre: nombre.trim(), activo, color }), "Especie actualizada")
  }

  const agregarCategoria = () => {
    if (!nuevaCategoria.trim()) return setError("La categoría necesita un nombre")
    const orden = categorias.reduce((m, c) => Math.max(m, c.orden), 0) + 1
    void ejecutar(() => crearCategoria(especie.establecimiento_id, especie.id, nuevaCategoria.trim(), orden), "Categoría agregada",
      () => setNuevaCategoria(""))
  }

  // Antes de dar de baja se mira el stock: si hay animales, se dice cuántos y en qué lotes (la base también lo rechaza)
  const darDeBaja = async (categoria: CategoriaAnimal) => {
    setError(null)
    setEnviando(true)
    let conStock = false
    try {
      const stock = await getStockCategoria(categoria.id)
      if (stock.length > 0) {
        conStock = true
        const total = stock.reduce((s, f) => s + f.cabezas, 0)
        setError(`${categoria.nombre} tiene ${total} ${total === 1 ? "animal" : "animales"} en stock: `
          + stock.map(f => `${f.lote} (${f.cabezas})`).join(", ")
          + ". Para darla de baja, primero tienen que salir de esos lotes.")
      }
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo revisar el stock de la categoría"))
      conStock = true
    } finally {
      setEnviando(false)
    }
    if (conStock) return
    if (!window.confirm(`¿Dar de baja "${categoria.nombre}"? No va a aparecer al cargar animales; el historial la sigue mostrando.`)) return
    void ejecutar(() => cambiarEstadoCategoria(categoria.id, false), "Categoría dada de baja")
  }

  return (
    <Card className={cn("pt-0", !especie.activo && "opacity-70")}>
      <div aria-hidden className="h-2" style={{ backgroundColor: colorActual }} />
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: colorActual }} />
          <h2 className="font-semibold">{especie.nombre}</h2>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium text-foreground"
            style={{ backgroundColor: colorSuave(colorActual) }}>
            {etiquetaGrupo(especie.grupo)}
          </span>
          {!especie.activo && <Badge variant="outline">inactiva</Badge>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`esp-nombre-${especie.id}`}>Nombre</Label>
          <Input id={`esp-nombre-${especie.id}`} className={CAMPO} value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>

        <SelectorColor id={`esp-color-${especie.id}`} valor={color} grupo={especie.grupo} onCambio={setColor} />

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
          {activas.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-2">Sin categorías: hacen falta para armar lotes de esta especie.</p>
          ) : (
            <ul className="rounded-lg border divide-y mb-2">
              {activas.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-3 pl-3 pr-1 min-h-11">
                  <span className="text-sm">{c.nombre}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-10 md:h-8 text-muted-foreground"
                    disabled={enviando} onClick={() => void darDeBaja(c)}>
                    Dar de baja
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input aria-label={`Nueva categoría de ${especie.nombre}`} className={CAMPO} placeholder="Nueva categoría"
              value={nuevaCategoria} onChange={e => setNuevaCategoria(e.target.value)} />
            <Button type="button" variant="outline" className={BOTON} disabled={enviando} onClick={agregarCategoria}>
              Agregar
            </Button>
          </div>

          {deBaja.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Dadas de baja</p>
              <ul className="divide-y">
                {deBaja.map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-3 min-h-11">
                    <span className="text-sm text-muted-foreground line-through">{c.nombre}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-10 md:h-8 text-primary" disabled={enviando}
                      onClick={() => void ejecutar(() => cambiarEstadoCategoria(c.id, true), "Categoría reactivada")}>
                      Reactivar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
