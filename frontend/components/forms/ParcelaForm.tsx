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
import { createParcela, updateParcela } from "@/lib/queries/parcelas"
import type { Parcela, UsoActual } from "@/types/database"

// ── Esquema de validación ──────────────────────────────────────────────────

const schema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  superficie: z
    .number("Ingresá un número válido")
    .positive("La superficie debe ser mayor a 0"),
  uso_actual: z.string().min(1, "El uso es requerido"),
  tipo_pastura: z.string().optional(),
  observaciones: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ParcelaFormProps {
  establecimiento_id: number
  potrero_id: number
  initialData?: Parcela
  onSuccess: () => void
  onCancel: () => void
}

// ── Componente ─────────────────────────────────────────────────────────────

export function ParcelaForm({ establecimiento_id, potrero_id, initialData, onSuccess, onCancel }: ParcelaFormProps) {
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
      nombre: initialData?.nombre || "",
      superficie: initialData?.superficie || undefined,
      tipo_pastura: initialData?.tipo_pastura || "",
      uso_actual: initialData?.uso_actual || "",
      observaciones: initialData?.observaciones || "",
    },
  })

  const uso_actual = watch("uso_actual")
  const tipo_pastura = watch("tipo_pastura")

  const onSubmit = async (values: FormValues) => {
    setEnviando(true)
    try {
      if (initialData) {
        await updateParcela(initialData.id, {
          nombre: values.nombre,
          superficie: values.superficie,
          uso_actual: values.uso_actual as UsoActual,
          tipo_pastura: values.tipo_pastura || null,
          observaciones: values.observaciones || null,
        })
        toast.success("Parcela actualizada correctamente")
      } else {
        await createParcela({
          establecimiento_id,
          potrero_id,
          nombre: values.nombre,
          superficie: values.superficie,
          uso_actual: values.uso_actual as UsoActual,
          tipo_pastura: values.tipo_pastura || null,
          observaciones: values.observaciones || null,
          estado: "activo",
          user_id: null,
        })
        toast.success("Parcela creada correctamente")
      }
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar la parcela"
      toast.error(msg)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

      {/* Nombre */}
      <div className="space-y-1.5">
        <Label htmlFor="parcela-nombre">
          Nombre <span className="text-destructive">*</span>
        </Label>
        <Input
          id="parcela-nombre"
          placeholder="Ej: Parcela Eléctrico 1"
          aria-invalid={!!errors.nombre}
          {...register("nombre")}
        />
        {errors.nombre && (
          <p className="text-sm text-destructive">{errors.nombre.message}</p>
        )}
      </div>

      {/* Superficie + Uso actual */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="parcela-superficie">
            Superficie (ha) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="parcela-superficie"
            type="number"
            step="0.01"
            placeholder="Ej: 10.5"
            aria-invalid={!!errors.superficie}
            {...register("superficie", { valueAsNumber: true })}
          />
          {errors.superficie && (
            <p className="text-sm text-destructive">{errors.superficie.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            Uso actual <span className="text-destructive">*</span>
          </Label>
          <SelectParametro
            clave="uso_subdivision"
            value={uso_actual ?? ""}
            onChange={(val) => setValue("uso_actual", val, { shouldValidate: true })}
            placeholder="Seleccionar"
          />
          {errors.uso_actual && (
            <p className="text-sm text-destructive">{errors.uso_actual.message}</p>
          )}
        </div>
      </div>

      {/* Tipo de pastura */}
      <div className="space-y-1.5">
        <Label>Tipo de pastura</Label>
        <SelectParametro
          clave="tipos_pastura"
          value={tipo_pastura ?? ""}
          onChange={(val) => setValue("tipo_pastura", val)}
          placeholder="Seleccionar (opcional)"
        />
      </div>

      {/* Observaciones */}
      <div className="space-y-1.5">
        <Label htmlFor="parcela-obs">Observaciones</Label>
        <textarea
          id="parcela-obs"
          rows={2}
          placeholder="Notas adicionales..."
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          {...register("observaciones")}
        />
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? "Guardando..." : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={enviando}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
