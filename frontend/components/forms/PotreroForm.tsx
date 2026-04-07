"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SelectParametro } from "@/components/shared/SelectParametro"
import { createPotrero } from "@/lib/queries/potreros"

// ── Esquema de validación ──────────────────────────────────────────────────

const schema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  superficie: z
    .number("Ingresá un número válido")
    .positive("La superficie debe ser mayor a 0"),
  uso_actual: z.enum(
    ["Ganadería", "Agricultura", "Mixto", "Reserva", "Sin uso"],
    "El uso es requerido"
  ),
  tipo_pastura: z.string().optional(),
  aguada: z.boolean(),
  sombra: z.boolean(),
  observaciones: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface PotreroFormProps {
  establecimiento_id: number
  onSuccess: () => void
  onCancel: () => void
}

// ── Componente ─────────────────────────────────────────────────────────────

export function PotreroForm({ establecimiento_id, onSuccess, onCancel }: PotreroFormProps) {
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
      aguada: false,
      sombra: false,
      tipo_pastura: "",
      uso_actual: undefined,
    },
  })

  const uso_actual = watch("uso_actual")
  const tipo_pastura = watch("tipo_pastura")
  const aguada = watch("aguada")
  const sombra = watch("sombra")

  const onSubmit = async (values: FormValues) => {
    setEnviando(true)
    try {
      await createPotrero({
        ...values,
        establecimiento_id,
        estado: "activo",
        tipo_pastura: values.tipo_pastura || null,
        observaciones: values.observaciones || null,
        user_id: null,
      })
      toast.success("Potrero creado correctamente")
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar"
      toast.error(msg)
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
          <Label htmlFor="potrero-superficie">
            Superficie (ha) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="potrero-superficie"
            type="number"
            step="0.01"
            placeholder="Ej: 50"
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
          <Select
            value={uso_actual}
            onValueChange={(val) =>
              setValue("uso_actual", val as FormValues["uso_actual"], {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full" aria-invalid={!!errors.uso_actual}>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Ganadería">Ganadería</SelectItem>
              <SelectItem value="Agricultura">Agricultura</SelectItem>
              <SelectItem value="Mixto">Mixto</SelectItem>
              <SelectItem value="Reserva">Reserva</SelectItem>
              <SelectItem value="Sin uso">Sin uso</SelectItem>
            </SelectContent>
          </Select>
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

      {/* Aguada y Sombra */}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={aguada}
            onChange={(e) => setValue("aguada", e.target.checked)}
          />
          <span className="text-sm">Aguada</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={sombra}
            onChange={(e) => setValue("sombra", e.target.checked)}
          />
          <span className="text-sm">Sombra</span>
        </label>
      </div>

      {/* Observaciones */}
      <div className="space-y-1.5">
        <Label htmlFor="potrero-obs">Observaciones</Label>
        <textarea
          id="potrero-obs"
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
