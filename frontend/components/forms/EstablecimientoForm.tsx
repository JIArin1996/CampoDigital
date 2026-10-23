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
import { SelectParametro } from "@/components/shared/SelectParametro"
import { crearEstablecimiento, updateEstablecimiento } from "@/lib/queries/establecimientos"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { mensajeDeError } from "@/lib/supabase/errores"
import type { Establecimiento, EstablecimientoDatos } from "@/types/database"

// ── Esquema de validación ──────────────────────────────────────────────────

const schema = z.object({
  nombre: z.string().trim().min(1, "El nombre es requerido"),
  departamento: z.string().min(1, "El departamento es requerido"),
  localidad: z.string().optional(),
  paraje: z.string().optional(),
  // Se carga como texto para poder dejarla vacía (es opcional)
  superficie_total: z
    .string()
    .optional()
    .refine(v => !v || Number(v) > 0, "La superficie tiene que ser mayor a 0"),
  sistema_productivo: z.string().optional(),
  propietario: z.string().optional(),
  rut: z.string().optional(),
  dicose: z.string().optional(),
  fecha_alta: z.string().min(1, "La fecha de alta es requerida"),
  observaciones: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// Fecha de hoy en el huso del teléfono, formato YYYY-MM-DD
const hoyLocal = () => new Date().toLocaleDateString("en-CA")

// Campo vacío → null
const oNull = (v?: string) => (v && v.trim() ? v.trim() : null)

// Clases para campos cómodos de tocar en el celular
const CAMPO = "h-11 text-base md:h-9 md:text-sm"

// ── Componente ─────────────────────────────────────────────────────────────

interface EstablecimientoFormProps {
  initialData?: Establecimiento
  volverA?: string            // a dónde va al guardar (por defecto, la lista de establecimientos)
}

export function EstablecimientoForm({ initialData, volverA = "/establecimientos" }: EstablecimientoFormProps = {}) {
  const router = useRouter()
  const { recargarEstablecimientos, esAdmin, cargando } = useEstablecimiento()
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
      departamento: initialData?.departamento ?? "",
      localidad: initialData?.localidad ?? "",
      paraje: initialData?.paraje ?? "",
      superficie_total: initialData?.superficie_total?.toString() ?? "",
      sistema_productivo: initialData?.sistema_productivo ?? "",
      propietario: initialData?.propietario ?? "",
      rut: initialData?.rut ?? "",
      dicose: initialData?.dicose ?? "",
      fecha_alta: initialData?.fecha_alta?.split("T")[0] ?? hoyLocal(),
      observaciones: initialData?.observaciones ?? "",
    },
  })

  const departamento = watch("departamento")

  // Crear y editar establecimientos es configuración: solo el administrador
  if (!cargando && !esAdmin) {
    return <p className="text-muted-foreground">Solo un administrador puede crear o editar establecimientos.</p>
  }

  const onSubmit = async (values: FormValues) => {
    const datos: EstablecimientoDatos = {
      nombre: values.nombre.trim(),
      departamento: values.departamento,
      localidad: oNull(values.localidad),
      paraje: oNull(values.paraje),
      superficie_total: values.superficie_total ? Number(values.superficie_total) : null,
      sistema_productivo: oNull(values.sistema_productivo),
      propietario: oNull(values.propietario),
      rut: oNull(values.rut),
      dicose: oNull(values.dicose),
      fecha_alta: values.fecha_alta,
      observaciones: oNull(values.observaciones),
    }

    setEnviando(true)
    try {
      if (initialData) {
        await updateEstablecimiento(initialData.id, datos)
        await recargarEstablecimientos(initialData.id)
        toast.success("Establecimiento actualizado")
      } else {
        const id = await crearEstablecimiento(datos)
        await recargarEstablecimientos(id)
        toast.success("Establecimiento creado")
      }
      router.push(volverA)
    } catch (err: unknown) {
      toast.error(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">

      {/* Nombre */}
      <div className="space-y-1.5">
        <Label htmlFor="nombre">
          Nombre <span className="text-destructive">*</span>
        </Label>
        <Input
          id="nombre"
          placeholder="Ej: Santa Remigia"
          className={CAMPO}
          aria-invalid={!!errors.nombre}
          {...register("nombre")}
        />
        {errors.nombre && <p className="text-sm text-destructive">{errors.nombre.message}</p>}
      </div>

      {/* Departamento + Localidad */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>
            Departamento <span className="text-destructive">*</span>
          </Label>
          <SelectParametro
            clave="departamentos"
            value={departamento}
            onChange={val => setValue("departamento", val, { shouldValidate: true })}
            placeholder="Seleccionar departamento"
            className={CAMPO}
          />
          {errors.departamento && <p className="text-sm text-destructive">{errors.departamento.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="localidad">Localidad</Label>
          <Input id="localidad" className={CAMPO} {...register("localidad")} />
        </div>
      </div>

      {/* Paraje + Superficie */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="paraje">Paraje</Label>
          <Input id="paraje" className={CAMPO} {...register("paraje")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="superficie_total">Superficie (ha)</Label>
          <Input
            id="superficie_total"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className={CAMPO}
            aria-invalid={!!errors.superficie_total}
            {...register("superficie_total")}
          />
          {errors.superficie_total && <p className="text-sm text-destructive">{errors.superficie_total.message}</p>}
        </div>
      </div>

      {/* Sistema productivo */}
      <div className="space-y-1.5">
        <Label htmlFor="sistema_productivo">Sistema productivo</Label>
        <Input
          id="sistema_productivo"
          placeholder="Ej: cría y recría, invernada, ciclo completo"
          className={CAMPO}
          {...register("sistema_productivo")}
        />
      </div>

      {/* Propietario + Fecha de alta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="propietario">Propietario</Label>
          <Input id="propietario" className={CAMPO} {...register("propietario")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fecha_alta">
            Fecha de alta <span className="text-destructive">*</span>
          </Label>
          <Input
            id="fecha_alta"
            type="date"
            className={CAMPO}
            aria-invalid={!!errors.fecha_alta}
            {...register("fecha_alta")}
          />
          {errors.fecha_alta && <p className="text-sm text-destructive">{errors.fecha_alta.message}</p>}
        </div>
      </div>

      {/* RUT + DICOSE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="rut">RUT</Label>
          <Input id="rut" inputMode="numeric" className={CAMPO} {...register("rut")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dicose">DICOSE</Label>
          <Input id="dicose" className={CAMPO} {...register("dicose")} />
        </div>
      </div>

      {/* Observaciones */}
      <div className="space-y-1.5">
        <Label htmlFor="observaciones">Observaciones</Label>
        <textarea
          id="observaciones"
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base md:text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          {...register("observaciones")}
        />
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" className="h-11 px-5 md:h-9" disabled={enviando}>
          {enviando ? "Guardando..." : initialData ? "Guardar" : "Crear establecimiento"}
        </Button>
        <Button type="button" variant="outline" className="h-11 px-5 md:h-9" onClick={() => router.back()} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
