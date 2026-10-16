"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { registrarAjuste } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { BOTON, CAMPO, SELECT_NATIVO, hoyLocal } from "@/components/lotes/formato"
import type { CategoriaAnimal } from "@/types/lotes"

interface AjusteFormProps {
  loteId: string
  categorias: CategoriaAnimal[]   // categorías de la especie del lote
  stockActual: Map<string, number>
  onSuccess: () => void
  onCancel: () => void
}

/**
 * Corrección de stock de una categoría (registrar_ajuste).
 * Los eventos no se editan: un error se corrige sumando o restando cabezas, con un motivo.
 */
export function AjusteForm({ loteId, categorias, stockActual, onSuccess, onCancel }: AjusteFormProps) {
  const [categoriaId, setCategoriaId] = useState("")
  const [sentido, setSentido] = useState<"sumar" | "restar">("restar")
  const [cantidad, setCantidad] = useState("")
  const [fecha, setFecha] = useState(hoyLocal())
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const n = Number(cantidad)
    if (!categoriaId) return setError("Elegí la categoría")
    if (!Number.isInteger(n) || n <= 0) return setError("La cantidad tiene que ser un número entero mayor a 0")
    if (!motivo.trim()) return setError("Escribí el motivo del ajuste")

    setEnviando(true)
    try {
      await registrarAjuste({
        lote_id: loteId,
        categoria_id: categoriaId,
        cabezas: sentido === "sumar" ? n : -n,
        fecha,
        nota: motivo.trim(),
      })
      toast.success("Ajuste registrado")
      onSuccess()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ajuste-categoria">Categoría</Label>
        <select
          id="ajuste-categoria"
          className={SELECT_NATIVO}
          value={categoriaId}
          onChange={e => setCategoriaId(e.target.value)}
        >
          <option value="">Seleccionar</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({stockActual.get(c.id) ?? 0})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>Movimiento</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["restar", "sumar"] as const).map(s => (
            <Button
              key={s}
              type="button"
              variant={sentido === s ? "default" : "outline"}
              className="h-11 md:h-9"
              onClick={() => setSentido(s)}
            >
              {s === "restar" ? "Restar cabezas" : "Sumar cabezas"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ajuste-cantidad">Cantidad</Label>
          <Input
            id="ajuste-cantidad"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            className={CAMPO}
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ajuste-fecha">Fecha</Label>
          <Input
            id="ajuste-fecha"
            type="date"
            max={hoyLocal()}
            className={CAMPO}
            value={fecha}
            onChange={e => setFecha(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ajuste-motivo">Motivo</Label>
        <Input
          id="ajuste-motivo"
          placeholder="Ej: error de conteo en el alta"
          className={CAMPO}
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
        />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 pt-1">
        <Button type="submit" className={BOTON} disabled={enviando}>
          {enviando ? "Guardando..." : "Registrar ajuste"}
        </Button>
        <Button type="button" variant="outline" className={BOTON} onClick={onCancel} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
