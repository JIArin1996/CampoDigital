"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { crearEntrada, editarEntrada, getPersonas, type Persona } from "@/lib/queries/bitacora"
import { getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOTON, CAMPO, SELECT_NATIVO, TEXTAREA } from "@/components/shared/estilos"
import { SelectorResponsables } from "@/components/shared/Responsables"
import { hoyLocal } from "@/components/lotes/formato"
import { ETIQUETA_TIPO, TIPOS_ENTRADA, textoRepeticion } from "@/components/bitacora/formato"
import { cn } from "@/lib/utils"
import type { EntradaConLotes, TipoEntrada } from "@/types/bitacora"
import type { Lote } from "@/types/lotes"

interface Props {
  establecimientoId: string
  inicial?: EntradaConLotes        // si viene, se edita
  loteInicial?: string | null      // al crear desde la ficha de un lote
  tipoInicial?: TipoEntrada | null // al crear desde el "+" (por ejemplo, una tarea)
  venceInicial?: string | null     // al crear una tarea desde un día del Calendario
  origen?: EntradaConLotes | null  // "Crear tarea" desde otra nota: precarga texto y lotes
}

// Repeticiones frecuentes; "otra" deja escribir los días
const REPETICIONES = [7, 15, 30, 60, 90, 180, 365]

export function EntradaForm({ establecimientoId, inicial, loteInicial, tipoInicial, venceInicial, origen }: Props) {
  const router = useRouter()
  const [opciones, setOpciones] = useState<{ lotes: Lote[]; personas: Persona[] } | null>(null)
  const [tipo, setTipo] = useState<TipoEntrada>(inicial?.tipo ?? (origen ? "tarea" : tipoInicial ?? "observacion"))
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoyLocal())
  const [texto, setTexto] = useState(inicial?.texto ?? origen?.texto ?? "")
  const [lotes, setLotes] = useState<string[]>(inicial?.lotes ?? origen?.lotes ?? (loteInicial ? [loteInicial] : []))
  const [responsables, setResponsables] = useState<string[]>(inicial?.responsables ?? origen?.responsables ?? [])
  const [vencimiento, setVencimiento] = useState(inicial?.vencimiento ?? venceInicial ?? "")
  const [repetir, setRepetir] = useState(inicial?.repetir_cada_dias ? String(inicial.repetir_cada_dias) : "")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vigente = true
    Promise.all([getLotes(establecimientoId, "activo"), getLotes(establecimientoId, "cerrado"), getPersonas(establecimientoId)])
      .then(([activos, cerrados, personas]) => {
        // Se ofrecen los lotes activos y, al editar, también los cerrados que ya estaban etiquetados
        const etiquetados = new Set(inicial?.lotes ?? origen?.lotes ?? [])
        if (vigente) setOpciones({ lotes: [...activos, ...cerrados.filter(l => etiquetados.has(l.id))], personas })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los lotes")) })
    return () => { vigente = false }
  }, [establecimientoId, inicial?.lotes, origen?.lotes])

  const alternarLote = (id: string) => setLotes(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!texto.trim()) return setError(esTarea ? "Escribí qué hay que hacer" : "Escribí el texto de la entrada")
    const dias = repetir ? Number(repetir) : null
    if (esTarea) {
      if (!vencimiento) return setError("Elegí para cuándo vence la tarea")
      if (dias !== null && !(Number.isInteger(dias) && dias >= 1 && dias <= 366)) return setError("La repetición va de 1 a 366 días")
    }

    const datos = {
      fecha, tipo, texto: texto.trim(), lotes, responsables,
      vencimiento: esTarea ? vencimiento : null,
      repetir_cada_dias: esTarea ? dias : null,
    }
    setEnviando(true)
    try {
      if (inicial) {
        await editarEntrada(inicial.id, datos)
        toast.success(esTarea ? "Tarea editada" : "Entrada editada")
      } else {
        await crearEntrada(establecimientoId, datos, origen?.id)
        toast.success(tipo === "idea" ? "Idea anotada (abierta)" : esTarea ? "Tarea anotada (pendiente)" : "Entrada guardada")
      }
      // Desde el Calendario, el "+" o la tarjeta de otra nota: vuelve a donde estaba
      if (origen || inicial?.tipo === "tarea" || (!inicial && tipoInicial === "tarea")) router.back()
      else router.push(loteInicial ? `/lotes/${loteInicial}` : "/bitacora")
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  const esTarea = tipo === "tarea"
  const repeticionLibre = repetir !== "" && !REPETICIONES.includes(Number(repetir))

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
      {origen && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <p className="text-muted-foreground">Sale de esta {ETIQUETA_TIPO[origen.tipo].toLowerCase()}:</p>
          <p className="line-clamp-2">{origen.texto}</p>
        </div>
      )}

      <fieldset disabled={!!origen}>
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
        {esTarea && !inicial?.estado_tarea && (
          <p className="text-xs text-muted-foreground mt-2">Arranca pendiente y aparece en el Calendario; después se marca hecha o cancelada.</p>
        )}
        {inicial?.tipo === "tarea" && !esTarea && (
          <p className="text-xs text-muted-foreground mt-2">Deja de ser tarea: se le borran el vencimiento, el estado y la repetición.</p>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="ent-texto">Texto</Label>
        <textarea id="ent-texto" rows={5} className={TEXTAREA} placeholder={esTarea ? "Qué hay que hacer. Ej: vacunar contra aftosa" : "Qué se habló, qué se decidió, qué se vio en el campo..."}
          value={texto} onChange={e => setTexto(e.target.value)} />
      </div>

      {esTarea && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ent-vence">Vence</Label>
            <Input id="ent-vence" type="date" className={CAMPO} value={vencimiento} onChange={e => setVencimiento(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ent-repetir">Repetir</Label>
            <select id="ent-repetir" className={SELECT_NATIVO} value={repeticionLibre ? "otra" : repetir}
              onChange={e => setRepetir(e.target.value === "otra" ? "10" : e.target.value)}>
              <option value="">No se repite</option>
              {REPETICIONES.map(d => <option key={d} value={String(d)}>{textoRepeticion(d).replace("Se repite c", "C")}</option>)}
              <option value="otra">Otra cantidad de días</option>
            </select>
          </div>
          {repeticionLibre && (
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ent-dias">Cada cuántos días</Label>
              <Input id="ent-dias" type="number" inputMode="numeric" min={1} max={366} className={CAMPO}
                value={repetir} onChange={e => setRepetir(e.target.value)} />
            </div>
          )}
          {repetir && (
            <p className="col-span-2 text-xs text-muted-foreground">
              Al marcarla hecha se anota la siguiente: vence {repetir} {repetir === "1" ? "día" : "días"} después del vencimiento (o de hoy, si ya pasó).
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5 max-w-[12rem]">
        <Label htmlFor="ent-fecha">{esTarea ? "Anotada el" : "Fecha"}</Label>
        <Input id="ent-fecha" type="date" max={hoyLocal()} className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
      </div>

      {/* Al editar, los que ya tenía se pueden dejar aunque estén de baja */}
      <div>
        <SelectorResponsables personas={opciones?.personas ?? null} elegidos={responsables} onCambio={setResponsables}
          conservar={inicial?.responsables} />
        {responsables.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {esTarea ? "Sin responsable: le toca a cualquiera." : "Sin responsable: nadie en particular."}
          </p>
        )}
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
