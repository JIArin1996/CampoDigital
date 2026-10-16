"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectParametro } from "@/components/shared/SelectParametro"
import { createPotrero, updatePotrero } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import type { Potrero } from "@/types/database"

// ── Esquema de validación ──────────────────────────────────────────────────

const schema = z.object({
  nombre: z.string().trim().min(1, "El nombre es requerido"),
  superficie: z
    .number("Ingresá un número válido")
    .positive("La superficie tiene que ser mayor a 0"),
  uso_actual: z.string().optional(),
  tipo_pastura: z.string().optional(),
  aguada: z.boolean(),
  sombra: z.boolean(),
  observaciones: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const CAMPO = "h-11 text-base md:h-9 md:text-sm"
const oNull = (v?: string) => (v && v.trim() ? v.trim() : null)

interface PotreroFormProps {
  establecimiento_id: string
  initialData?: Potrero
  onSuccess: () => void
  onCancel: () => void
}

// ── Componente ─────────────────────────────────────────────────────────────

export function PotreroForm({ establecimiento_id, initialData, onSuccess, onCancel }: PotreroFormProps) {
  const [enviando, setEnviando] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: initialData?.nombre ?? "",
      superficie: initialData?.superficie ?? undefined,
      uso_actual: initialData?.uso_actual ?? "",
      tipo_pastura: initialData?.tipo_pastura ?? "",
      aguada: initialData?.aguada ?? false,
      sombra: initialData?.sombra ?? false,
      observaciones: initialData?.observaciones ?? "",
    },
  })

  const uso_actual = watch("uso_actual")
  const tipo_pastura = watch("tipo_pastura")
  const aguada = watch("aguada")
  const sombra = watch("sombra")

  const onSubmit = async (values: FormValues) => {
    const datos = {
      nombre: values.nombre.trim(),
      superficie: values.superficie,
      uso_actual: oNull(values.uso_actual),
      tipo_pastura: oNull(values.tipo_pastura),
      aguada: values.aguada,
      sombra: values.sombra,
      observaciones: oNull(values.observaciones),
    }

    setEnviando(true)
    try {
      if (initialData) {
        await updatePotrero(initialData.id, datos)
        toast.success("Potrero actualizado")
      } else {
        await createPotrero({ ...datos, establecimiento_id, estado: "activo" })
        toast.success("Potrero creado")
      }
      onSuccess()
    } catch (err: unknown) {
      toast.error(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

      {/* Nombre */}
      <div className="space-y-1.5">
        <Label htmlFor="potrero-nombre">
          Nombre <span className="text-destructive">*</span>
        </Label>
        <Input
          id="potrero-nombre"
          placeholder="Ej: Potrero 1"
          className={CAMPO}
          aria-invalid={!!errors.nombre}
          {...register("nombre")}
        />
        {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
      </div>

      {/* Superficie + Uso actual */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="potrero-superficie">
            Superficie (ha) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="potrero-superficie"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className={CAMPO}
            aria-invalid={!!errors.superficie}
            {...register("superficie", { valueAsNumber: true })}
          />
          {errors.superficie && <p className="text-sm text-destructive">{errors.superficie.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Uso actual</Label>
          <SelectParametro
            clave="uso_potrero"
            value={uso_actual ?? ""}
            onChange={val => setValue("uso_actual", val)}
            placeholder="Seleccionar"
            className={CAMPO}
          />
        </div>
      </div>

      {/* Tipo de pastura */}
      <div className="space-y-1.5">
        <Label>Tipo de pastura</Label>
        <SelectParametro
          clave="tipos_pastura"
          value={tipo_pastura ?? ""}
          onChange={val => setValue("tipo_pastura", val)}
          placeholder="Seleccionar (opcional)"
          className={CAMPO}
        />
      </div>

      {/* Aguada y Sombra */}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 h-11 cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-input accent-primary"
            checked={aguada}
            onChange={e => setValue("aguada", e.target.checked)}
          />
          <span className="text-base md:text-sm">Aguada</span>
        </label>

        <label className="flex items-center gap-2 h-11 cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-input accent-primary"
            checked={sombra}
            onChange={e => setValue("sombra", e.target.checked)}
          />
          <span className="text-base md:text-sm">Sombra</span>
        </label>
      </div>

      {/* Observaciones */}
      <div className="space-y-1.5">
        <Label htmlFor="potrero-obs">Observaciones</Label>
        <textarea
          id="potrero-obs"
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base md:text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          {...register("observaciones")}
        />
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" className="h-11 px-5 md:h-9" disabled={enviando}>
          {enviando ? "Guardando..." : "Guardar"}
        </Button>
        <Button type="button" variant="outline" className="h-11 px-5 md:h-9" onClick={onCancel} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
