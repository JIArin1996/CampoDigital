"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { createEstablecimiento } from "@/lib/queries/establecimientos"

// ── Esquema de validación ──────────────────────────────────────────────────

const schema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  departamento: z.string().min(1, "El departamento es requerido"),
  localidad: z.string().optional(),
  superficie_total: z
    .number("Ingresá un número válido")
    .positive("La superficie debe ser mayor a 0"),
  tipo: z.enum(["Ganadero", "Agrícola", "Mixto"], "El tipo es requerido"),
  propietario: z.string().optional(),
  rut: z.string().optional(),
  dicose: z.string().optional(),
  fecha_alta: z.string().min(1, "La fecha de alta es requerida"),
  observaciones: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// ── Componente ─────────────────────────────────────────────────────────────

export function EstablecimientoForm() {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)

  const today = new Date().toISOString().split("T")[0]

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha_alta: today,
      tipo: undefined,
      departamento: "",
    },
  })

  const departamento = watch("departamento")
  const tipo = watch("tipo")

  const onSubmit = async (values: FormValues) => {
    setEnviando(true)
    try {
      await createEstablecimiento({
        ...values,
        estado: "activo",
        localidad: values.localidad || null,
        propietario: values.propietario || null,
        rut: values.rut || null,
        dicose: values.dicose || null,
        observaciones: values.observaciones || null,
        user_id: null,
      })
      toast.success("Establecimiento creado correctamente")
      router.push("/establecimientos")
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar"
      toast.error(msg)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">

      {/* Fila 1: Nombre */}
      <div className="space-y-1.5">
        <Label htmlFor="nombre">
          Nombre <span className="text-destructive">*</span>
        </Label>
        <Input
          id="nombre"
          placeholder="Ej: Los Sauces"
          aria-invalid={!!errors.nombre}
          {...register("nombre")}
        />
        {errors.nombre && (
          <p className="text-sm text-destructive">{errors.nombre.message}</p>
        )}
      </div>

      {/* Fila 2: Departamento + Localidad */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>
            Departamento <span className="text-destructive">*</span>
          </Label>
          <SelectParametro
            clave="departamentos"
            value={departamento}
            onChange={(val) => setValue("departamento", val, { shouldValidate: true })}
            placeholder="Seleccionar departamento"
          />
          {errors.departamento && (
            <p className="text-sm text-destructive">{errors.departamento.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="localidad">Localidad</Label>
          <Input
            id="localidad"
            placeholder="Ej: Tacuarembó"
            {...register("localidad")}
          />
        </div>
      </div>

      {/* Fila 3: Superficie + Tipo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="superficie_total">
            Superficie (ha) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="superficie_total"
            type="number"
            step="0.01"
            placeholder="Ej: 350"
            aria-invalid={!!errors.superficie_total}
            {...register("superficie_total", { valueAsNumber: true })}
          />
          {errors.superficie_total && (
            <p className="text-sm text-destructive">{errors.superficie_total.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            Tipo <span className="text-destructive">*</span>
          </Label>
          <Select
            value={tipo}
            onValueChange={(val) =>
              setValue("tipo", val as FormValues["tipo"], { shouldValidate: true })
            }
          >
            <SelectTrigger className="w-full" aria-invalid={!!errors.tipo}>
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Ganadero">Ganadero</SelectItem>
              <SelectItem value="Agrícola">Agrícola</SelectItem>
              <SelectItem value="Mixto">Mixto</SelectItem>
            </SelectContent>
          </Select>
          {errors.tipo && (
            <p className="text-sm text-destructive">{errors.tipo.message}</p>
          )}
        </div>
      </div>

      {/* Fila 4: Propietario + Fecha de alta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="propietario">Propietario</Label>
          <Input
            id="propietario"
            placeholder="Nombre del propietario"
            {...register("propietario")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fecha_alta">
            Fecha de alta <span className="text-destructive">*</span>
          </Label>
          <Input
            id="fecha_alta"
            type="date"
            aria-invalid={!!errors.fecha_alta}
            {...register("fecha_alta")}
          />
          {errors.fecha_alta && (
            <p className="text-sm text-destructive">{errors.fecha_alta.message}</p>
          )}
        </div>
      </div>

      {/* Fila 5: RUT + DICOSE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="rut">RUT</Label>
          <Input id="rut" placeholder="Ej: 21234567800" {...register("rut")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dicose">DICOSE</Label>
          <Input
            id="dicose"
            placeholder="Ej: 01.234.567"
            {...register("dicose")}
          />
        </div>
      </div>

      {/* Fila 6: Observaciones */}
      <div className="space-y-1.5">
        <Label htmlFor="observaciones">Observaciones</Label>
        <textarea
          id="observaciones"
          rows={3}
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
          onClick={() => router.back()}
          disabled={enviando}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
