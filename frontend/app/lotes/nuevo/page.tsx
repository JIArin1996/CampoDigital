"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { crearLote, getCategorias, getEspecies } from "@/lib/queries/lotes"
import { getPotreros } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO, SELECT_NATIVO, hoyLocal } from "@/components/lotes/formato"
import { SelectorAnios } from "@/components/lotes/SelectorAnios"
import { ArchivosNuevoLote } from "@/components/lotes/ArchivosNuevoLote"
import { guardarPendientes } from "@/components/lotes/archivosPendientes"
import { subirArchivoALote } from "@/lib/queries/archivos"
import type { ArchivoPorSubir } from "@/types/archivos"
import type { Potrero } from "@/types/database"
import type { CategoriaAnimal, Especie } from "@/types/lotes"

interface Catalogos {
  estId: string
  especies: Especie[]
  categorias: CategoriaAnimal[]
  potreros: Potrero[]
}

export default function NuevoLotePage() {
  const router = useRouter()
  const { establecimientoActivo, puedeOperar, cargando: cargandoCtx } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  const [catalogos, setCatalogos] = useState<Catalogos | null>(null)
  const [especieElegida, setEspecieElegida] = useState("")
  const [nombre, setNombre] = useState("")
  const [fecha, setFecha] = useState(hoyLocal())
  const [potreroId, setPotreroId] = useState("")
  const [anios, setAnios] = useState<number[]>([])
  const [notas, setNotas] = useState("")
  const [archivos, setArchivos] = useState<ArchivoPorSubir[]>([])
  const [progreso, setProgreso] = useState<string | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([getEspecies(estId), getCategorias(estId), getPotreros(estId)])
      .then(([especies, categorias, potreros]) => {
        if (vigente) setCatalogos({ estId, especies, categorias, potreros })
      })
      .catch(err => {
        if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los catálogos"))
      })
    return () => { vigente = false }
  }, [estId])

  const listos = catalogos && catalogos.estId === estId ? catalogos : null
  // Sin elección explícita, la primera especie del catálogo
  const especieId = especieElegida || listos?.especies[0]?.id || ""
  const categoriasEspecie = listos?.categorias.filter(c => c.especie_id === especieId) ?? []
  const totalCabezas = categoriasEspecie.reduce((s, c) => s + (Number(cantidades[c.id]) || 0), 0)

  const cambiarEspecie = (id: string) => {
    setEspecieElegida(id)
    setCantidades({})
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!estId) return
    setError(null)

    const composicion = categoriasEspecie
      .map(c => ({ categoria_id: c.id, cabezas: Number(cantidades[c.id] || 0) }))
      .filter(item => item.cabezas !== 0)

    if (!nombre.trim()) return setError("Poné un nombre al lote")
    if (!especieId) return setError("Elegí la especie")
    if (composicion.some(item => !Number.isInteger(item.cabezas) || item.cabezas < 0)) {
      return setError("Las cabezas tienen que ser números enteros, sin decimales ni negativos")
    }
    if (composicion.length === 0) return setError("Cargá al menos una categoría con cabezas")

    setEnviando(true)
    try {
      const id = await crearLote({
        establecimiento_id: estId,
        especie_id: especieId,
        nombre: nombre.trim(),
        fecha_apertura: fecha,
        composicion,
        potrero_id: potreroId || null,
        anios_nacimiento: anios,
        notas: notas.trim() || null,
      })

      // Archivos: después de crear el lote. Si alguno falla, el lote queda creado y la ficha
      // ofrece reintentar (sin volver a elegirlos).
      const fallidos: ArchivoPorSubir[] = []
      for (const [i, a] of archivos.entries()) {
        setProgreso(`Subiendo archivos (${i + 1} de ${archivos.length})...`)
        try {
          await subirArchivoALote(estId, id, a)
        } catch {
          fallidos.push(a)
        }
      }
      guardarPendientes(id, fallidos)

      if (fallidos.length === 0) {
        toast.success("Lote creado")
      } else {
        toast.warning(
          `El lote se creó, pero no se ${fallidos.length === 1 ? "pudo subir 1 archivo" : `pudieron subir ${fallidos.length} archivos`}. ` +
          "Podés reintentar desde la ficha del lote.",
          { duration: 10000 },
        )
      }
      router.push(`/lotes/${id}`)
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  const volver = (
    <Link href="/lotes" className="inline-flex items-center gap-1.5 h-10 text-sm text-muted-foreground hover:text-foreground mb-3">
      <ArrowLeft className="h-4 w-4" /> Volver a lotes
    </Link>
  )

  if (cargandoCtx || (estId && !listos && !error)) {
    return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }

  if (!establecimientoActivo) {
    return <PageContainer>{volver}<p className="text-muted-foreground">Seleccioná un establecimiento.</p></PageContainer>
  }

  if (!puedeOperar) {
    return <PageContainer>{volver}<p className="text-muted-foreground">Tenés acceso de solo lectura a este establecimiento.</p></PageContainer>
  }

  return (
    <PageContainer>
      {volver}
      <h1 className="text-2xl font-bold mb-6">Nuevo lote</h1>

      <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
        <div className="space-y-1.5">
          <Label htmlFor="lote-nombre">Nombre</Label>
          <Input
            id="lote-nombre"
            placeholder="Ej: Terneros Nacidos 2026"
            className={CAMPO}
            value={nombre}
            onChange={e => setNombre(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="lote-especie">Especie</Label>
            <select
              id="lote-especie"
              className={SELECT_NATIVO}
              value={especieId}
              onChange={e => cambiarEspecie(e.target.value)}
            >
              {listos?.especies.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lote-fecha">Fecha de apertura</Label>
            <Input
              id="lote-fecha"
              type="date"
              max={hoyLocal()}
              className={CAMPO}
              value={fecha}
              onChange={e => setFecha(e.target.value)}
            />
          </div>
        </div>

        {/* Composición inicial */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium mb-1">Cabezas por categoría</legend>
          <div className="rounded-lg border divide-y">
            {categoriasEspecie.map(c => (
              <label key={c.id} htmlFor={`cat-${c.id}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-base md:text-sm">{c.nombre}</span>
                <Input
                  id={`cat-${c.id}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  placeholder="0"
                  className={`${CAMPO} w-24 text-right tabular-nums`}
                  value={cantidades[c.id] ?? ""}
                  onChange={e => setCantidades(prev => ({ ...prev, [c.id]: e.target.value }))}
                />
              </label>
            ))}
            <div className="flex items-center justify-between px-3 py-3 bg-muted/30">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-bold tabular-nums">{totalCabezas}</span>
            </div>
          </div>
        </fieldset>

        <div className="space-y-1.5">
            <Label htmlFor="lote-potrero">Potrero</Label>
            <select
              id="lote-potrero"
              className={SELECT_NATIVO}
              value={potreroId}
              onChange={e => setPotreroId(e.target.value)}
            >
              <option value="">Sin potrero</option>
              {listos?.potreros.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

        <div className="space-y-1.5">
          <Label htmlFor="lote-anios">Año de nacimiento</Label>
          <SelectorAnios id="lote-anios" valor={anios} onCambio={setAnios} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lote-notas">Notas</Label>
          <textarea
            id="lote-notas"
            rows={2}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
            value={notas}
            onChange={e => setNotas(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Archivos</p>
          <ArchivosNuevoLote valor={archivos} onCambio={setArchivos} disabled={enviando} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" className={BOTON} disabled={enviando}>
            {enviando ? (progreso ?? "Creando...") : "Crear lote"}
          </Button>
          <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      </form>
    </PageContainer>
  )
}
