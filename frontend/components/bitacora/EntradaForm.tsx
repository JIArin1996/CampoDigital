"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { crearEntrada, editarEntrada, getPersonas } from "@/lib/queries/bitacora"
import { getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO, SELECT_NATIVO, TEXTAREA } from "@/components/shared/estilos"
import { hoyLocal } from "@/components/lotes/formato"
import { ETIQUETA_TIPO, TIPOS_ENTRADA } from "@/components/bitacora/formato"
import { cn } from "@/lib/utils"
import type { EntradaConLotes, TipoEntrada } from "@/types/bitacora"
import type { Lote } from "@/types/lotes"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]

interface Props {
  establecimientoId: string
  inicial?: EntradaConLotes        // si viene, se edita
  loteInicial?: string | null      // al crear desde la ficha de un lote
}

export function EntradaForm({ establecimientoId, inicial, loteInicial }: Props) {
  const router = useRouter()
  const [opciones, setOpciones] = useState<{ lotes: Lote[]; personas: Persona[] } | null>(null)
  const [tipo, setTipo] = useState<TipoEntrada>(inicial?.tipo ?? "observacion")
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoyLocal())
  const [texto, setTexto] = useState(inicial?.texto ?? "")
  const [lotes, setLotes] = useState<string[]>(inicial?.lotes ?? (loteInicial ? [loteInicial] : []))
  const [personaId, setPersonaId] = useState(inicial?.persona_id ?? "")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vigente = true
    Promise.all([getLotes(establecimientoId, "activo"), getLotes(establecimientoId, "cerrado"), getPersonas(establecimientoId)])
      .then(([activos, cerrados, personas]) => {
        // Se ofrecen los lotes activos y, al editar, también los cerrados que ya estaban etiquetados
        const etiquetados = new Set(inicial?.lotes ?? [])
        if (vigente) setOpciones({ lotes: [...activos, ...cerrados.filter(l => etiquetados.has(l.id))], personas })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los lotes")) })
    return () => { vigente = false }
  }, [establecimientoId, inicial?.lotes])

  const alternarLote = (id: string) => setLotes(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!texto.trim()) return setError("Escribí el texto de la entrada")

    const datos = { fecha, tipo, texto: texto.trim(), lotes, persona_id: personaId || null }
    setEnviando(true)
    try {
      if (inicial) {
        await editarEntrada(inicial.id, datos)
        toast.success("Entrada editada")
      } else {
        await crearEntrada(establecimientoId, datos)
        toast.success(tipo === "idea" ? "Idea anotada (abierta)" : "Entrada guardada")
      }
      router.push(loteInicial ? `/lotes/${loteInicial}` : "/bitacora")
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  // Responsables: los activos, y el actual aunque esté inactivo
  const personas = (opciones?.personas ?? []).filter(p => p.activo || p.id === inicial?.persona_id)

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
      <fieldset>
        <legend className="text-sm font-medium mb-2">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_ENTRADA.map(t => (
            <Button key={t} type="button" variant={tipo === t ? "default" : "outline"} aria-pressed={tipo === t}
              className="h-auto min-h-11 whitespace-normal py-2" onClick={() => setTipo(t)}>
              {ETIQUETA_TIPO[t]}
            </Button>
          ))}
        </div>
        {tipo === "idea" && (
          <p className="text-xs text-muted-foreground mt-2">
            {inicial?.tipo === "idea" ? "Conserva su estado actual." : "Arranca abierta; después se marca decidida o descartada."}
          </p>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="ent-texto">Texto</Label>
        <textarea id="ent-texto" rows={5} className={TEXTAREA} placeholder="Qué se habló, qué se decidió, qué se vio en el campo..."
          value={texto} onChange={e => setTexto(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ent-fecha">Fecha</Label>
          <Input id="ent-fecha" type="date" max={hoyLocal()} className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ent-persona">Responsable</Label>
          <select id="ent-persona" className={SELECT_NATIVO} value={personaId} onChange={e => setPersonaId(e.target.value)}>
            <option value="">Nadie en particular</option>
            {personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium mb-2">Lotes</legend>
        {!opciones ? (
          <div className="h-11 rounded-lg bg-muted animate-pulse" />
        ) : opciones.lotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay lotes para etiquetar.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {opciones.lotes.map(l => {
              const elegido = lotes.includes(l.id)
              return (
                <button key={l.id} type="button" aria-pressed={elegido} onClick={() => alternarLote(l.id)}
                  className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                    elegido ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {elegido && <Check className="h-4 w-4" />}
                  {l.nombre}
                  {l.estado === "cerrado" && <span className="text-xs opacity-80">(cerrado)</span>}
                </button>
              )
            })}
          </div>
        )}
      </fieldset>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Guardando..." : inicial ? "Guardar cambios" : "Guardar"}</Button>
        <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>Cancelar</Button>
      </div>
    </form>
  )
}
