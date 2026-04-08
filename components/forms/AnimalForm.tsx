"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"

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
import { createAnimal, updateAnimal } from "@/lib/queries/animales"
import { getPotreros } from "@/lib/queries/potreros"
import { getParcelas } from "@/lib/queries/parcelas"
import type { Potrero, Parcela, SexoAnimal, OrigenAnimal, Animal } from "@/types/database"

const schema = z.object({
  caravana_snig: z.string().min(1, "La caravana SNIG es requerida"),
  caravana_propia: z.string().optional(),
  categoria: z.string().min(1, "Requerido"),
  sexo: z.enum(["Macho", "Hembra"], "Requerido"),
  raza: z.string().optional(),
  fecha_nacimiento: z.string().optional(),
  
  // Ubicación dinámica
  potrero_actual: z.number().optional(),
  parcela_actual: z.number().optional(),

  peso_entrada: z.number().positive("Debe ser mayor a 0").optional().or(z.literal("")),
  fecha_peso_entrada: z.string().optional(),
  origen: z.enum(["Propio", "Comprado", "Nacido en campo"]).optional().or(z.literal("")),
  observaciones: z.string().optional(),
}).superRefine((data, ctx) => {
})

type FormValues = z.infer<typeof schema>

interface AnimalFormProps {
  initialData?: Animal
}

export function AnimalForm({ initialData }: AnimalFormProps) {
  const router = useRouter()
  const { establecimientoActivo } = useEstablecimiento()
  const [enviando, setEnviando] = useState(false)
  
  const [potreros, setPotreros] = useState<Potrero[]>([])
  const [parcelas, setParcelas] = useState<Parcela[]>([])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      caravana_snig: initialData?.caravana_snig || "",
      caravana_propia: initialData?.caravana_propia || "",
      categoria: initialData?.categoria || "",
      sexo: initialData?.sexo || undefined,
      raza: initialData?.raza || "",
      fecha_nacimiento: initialData?.fecha_nacimiento || "",
      potrero_actual: initialData?.potrero_actual || undefined,
      parcela_actual: initialData?.parcela_actual || undefined,
      peso_entrada: initialData?.peso_entrada || undefined,
      fecha_peso_entrada: initialData?.fecha_peso_entrada || "",
      origen: initialData?.origen || undefined,
      observaciones: initialData?.observaciones || "",
    },
  })

  const formData = watch()
  
  // Carga de Potreros al cambiar Establecimiento
  useEffect(() => {
    if (!establecimientoActivo) return
    
    getPotreros(establecimientoActivo.id)
      .then(setPotreros)
      .catch(err => toast.error("Error cargando potreros"))
  }, [establecimientoActivo])

  // Carga superficial de parcelas para el potrero seleccionado
  useEffect(() => {
    if (formData.potrero_actual) {
      getParcelas(formData.potrero_actual)
        .then(setParcelas)
        .catch(() => {})
    } else {
      setParcelas([])
    }
  }, [formData.potrero_actual])

  const onSubmit = async (values: FormValues) => {
    if (values.potrero_actual && parcelas.length > 0 && !values.parcela_actual) {
      toast.error("Este potrero tiene parcelas activas. Debes elegir una parcela.")
      return
    }

    setEnviando(true)
    try {
      if (!establecimientoActivo) throw new Error("No hay contexto de establecimiento activo")

      if (initialData) {
        await updateAnimal(initialData.id, {
          establecimiento_id: establecimientoActivo.id,
          caravana_snig: values.caravana_snig,
          caravana_propia: values.caravana_propia || null,
          categoria: values.categoria,
          sexo: values.sexo as SexoAnimal,
          raza: values.raza || null,
          fecha_nacimiento: values.fecha_nacimiento || null,
          potrero_actual: parcelas.length > 0 ? null : (values.potrero_actual || null),
          parcela_actual: parcelas.length > 0 ? (values.parcela_actual || null) : null,
          peso_entrada: values.peso_entrada ? Number(values.peso_entrada) : null,
          fecha_peso_entrada: values.fecha_peso_entrada || null,
          origen: (values.origen as OrigenAnimal) || null,
          observaciones: values.observaciones || null,
        })
        toast.success("Animal actualizado correctamente")
        router.push(`/animales/${initialData.id}`)
      } else {
        await createAnimal({
          establecimiento_id: establecimientoActivo.id,
          caravana_snig: values.caravana_snig,
          caravana_propia: values.caravana_propia || null,
          categoria: values.categoria,
          sexo: values.sexo as SexoAnimal,
          raza: values.raza || null,
          fecha_nacimiento: values.fecha_nacimiento || null,
          potrero_actual: parcelas.length > 0 ? null : (values.potrero_actual || null),
          parcela_actual: parcelas.length > 0 ? (values.parcela_actual || null) : null,
          peso_entrada: values.peso_entrada ? Number(values.peso_entrada) : null,
          fecha_peso_entrada: values.fecha_peso_entrada || null,
          origen: (values.origen as OrigenAnimal) || null,
          observaciones: values.observaciones || null,
          estado: "activo",
          fecha_baja: null,
          madre_id: null,
          movimiento_origen_id: null,
          user_id: null,
        })
        toast.success("Animal registrado correctamente")
        router.push("/animales")
      }
      router.refresh()
    } catch (err: any) {
      if (err.message && err.message.includes("unique")) {
         toast.error("El SNIG ingresado ya está registrado en este establecimiento.")
      } else {
         toast.error(err.message || "Error al guardar")
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">
      
      {/* SECCIÓN 1: IDENTIFICACIÓN */}
      <div className="bg-card p-5 rounded-lg border">
        <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground border-b pb-2">Identificación</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="caravana_snig">Caravana SNIG <span className="text-destructive">*</span></Label>
            <Input id="caravana_snig" placeholder="Ej: 12345678" {...register("caravana_snig")} aria-invalid={!!errors.caravana_snig} />
            {errors.caravana_snig && <p className="text-sm text-destructive">{errors.caravana_snig.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="caravana_propia">Caravana Propia</Label>
            <Input id="caravana_propia" placeholder="Opcional (Ej: Moco)" {...register("caravana_propia")} />
          </div>

          <div className="space-y-1.5">
            <Label>Categoría <span className="text-destructive">*</span></Label>
            <SelectParametro 
              clave="categorias_ganado" 
              value={formData.categoria ?? ""} 
              onChange={(val) => setValue("categoria", val, { shouldValidate: true })} 
            />
            {errors.categoria && <p className="text-sm text-destructive">{errors.categoria.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Sexo <span className="text-destructive">*</span></Label>
            <Select value={formData.sexo} onValueChange={(val) => setValue("sexo", val as any, { shouldValidate: true })}>
              <SelectTrigger aria-invalid={!!errors.sexo}>
                <SelectValue placeholder="Seleccionar sexo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Hembra">Hembra</SelectItem>
                <SelectItem value="Macho">Macho</SelectItem>
              </SelectContent>
            </Select>
            {errors.sexo && <p className="text-sm text-destructive">{errors.sexo.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Raza</Label>
            <SelectParametro 
              clave="razas" 
              value={formData.raza ?? ""} 
              onChange={(val) => setValue("raza", val)} 
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fecha_nacimiento">Fecha de nacimiento</Label>
            <Input id="fecha_nacimiento" type="date" {...register("fecha_nacimiento")} />
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: UBICACIÓN */}
      <div className="bg-card p-5 rounded-lg border disabled:opacity-50 transition-opacity">
        <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground border-b pb-2">Ubicación Actual</h3>
        
        {!establecimientoActivo ? (
           <p className="text-sm text-muted-foreground">Seleccione un establecimiento activo en el menú lateral para ver las ubicaciones.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Potrero</Label>
              <Select 
                value={formData.potrero_actual ? formData.potrero_actual.toString() : "none"}
                onValueChange={(val) => {
                  if (val === "none") {
                    setValue("potrero_actual", undefined)
                    setValue("parcela_actual", undefined)
                  } else {
                    setValue("potrero_actual", Number(val))
                    setValue("parcela_actual", undefined)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar potrero" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin ubicar</SelectItem>
                  {potreros.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {parcelas.length > 0 && (
              <div className="space-y-1.5 fade-in animate-in">
                <Label>Parcela <span className="text-destructive">*</span></Label>
                <Select 
                  value={formData.parcela_actual ? formData.parcela_actual.toString() : ""}
                  onValueChange={(val) => setValue("parcela_actual", Number(val))}
                >
                  <SelectTrigger className="border-primary/50">
                    <SelectValue placeholder="Seleccionar parcela" />
                  </SelectTrigger>
                  <SelectContent>
                    {parcelas.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Este potrero está subdividido. Debe elegir parcela.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECCIÓN 3: INGRESO AL SISTEMA Y OPS */}
      <div className="bg-card p-5 rounded-lg border">
        <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground border-b pb-2">Información de Ingreso</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="peso_entrada">Peso entrada (kg)</Label>
            <Input id="peso_entrada" type="number" step="0.5" {...register("peso_entrada", { valueAsNumber: true })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fecha_peso_entrada">Fecha de pesaje</Label>
            <Input id="fecha_peso_entrada" type="date" {...register("fecha_peso_entrada")} />
          </div>

          <div className="space-y-1.5">
            <Label>Origen</Label>
            <Select value={formData.origen} onValueChange={(val) => setValue("origen", val as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Propio">Propio</SelectItem>
                <SelectItem value="Comprado">Comprado</SelectItem>
                <SelectItem value="Nacido en campo">Nacido en campo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="observaciones">Observaciones</Label>
          <textarea
            id="observaciones"
            rows={2}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
            {...register("observaciones")}
          />
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={enviando}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Cargando..." : "Registrar Animal"}
        </Button>
      </div>
    </form>
  )
}
