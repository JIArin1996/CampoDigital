"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { editarLote, getLote } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import { SelectorAnios } from "@/components/lotes/SelectorAnios"
import { BOTON, CAMPO, TEXTAREA } from "@/components/shared/estilos"
import type { Lote } from "@/types/lotes"

// Edición del lote: nombre, notas y años de nacimiento. Solo lotes abiertos y quien puede cargar.
export default function EditarLotePage() {
  const { id } = useParams<{ id: string }>()
  const { puedeOperarEn, cargando } = useEstablecimiento()
  const [lote, setLote] = useState<Lote | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    getLote(id)
      .then(l => { if (vigente) setLote(l) })
      .catch(err => { if (vigente) { setLote(null); setError(mensajeDeError(err, "No se pudo cargar el lote")) } })
    return () => { vigente = false }
  }, [id])

  const volver = <VolverAlLote href={`/lotes/${id}`} />

  if (lote === undefined || cargando) {
    return <PageContainer>{volver}<div className="h-72 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }
  if (!lote) {
    return <PageContainer>{volver}<p className="text-muted-foreground">{error ?? "No se encontró el lote."}</p></PageContainer>
  }
  if (!puedeOperarEn(lote.establecimiento_id) || lote.estado !== "activo") {
    return (
      <PageContainer>
        {volver}
        <p className="text-muted-foreground">Este lote no se puede editar (está cerrado o no tenés permiso de carga).</p>
      </PageContainer>
    )
  }

  // key: el formulario arranca con los datos del lote cargado
  return <PageContainer>{volver}<Formulario key={lote.id} lote={lote} /></PageContainer>
}

function Formulario({ lote }: { lote: Lote }) {
  const router = useRouter()
  const [nombre, setNombre] = useState(lote.nombre)
  const [notas, setNotas] = useState(lote.notas ?? "")
  const [anios, setAnios] = useState<number[]>(lote.anios_nacimiento)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return setError("El lote necesita un nombre")
    setError(null)
    setEnviando(true)
    try {
      await editarLote(lote.id, { nombre: nombre.trim(), notas: notas.trim() || null, anios_nacimiento: anios })
      toast.success("Lote actualizado")
      router.push(`/lotes/${lote.id}`)
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Editar {lote.nombre}</h1>
      <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
        <div className="space-y-1.5">
          <Label htmlFor="editar-nombre">Nombre</Label>
          <Input id="editar-nombre" className={CAMPO} value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editar-anios">Año de nacimiento</Label>
          <SelectorAnios id="editar-anios" valor={anios} onCambio={setAnios} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="editar-notas">Notas</Label>
          <textarea id="editar-notas" rows={3} className={TEXTAREA} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Guardando..." : "Guardar"}</Button>
          <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>Cancelar</Button>
        </div>
      </form>
    </>
  )
}
