"use client"

import { useState, useEffect, useMemo } from "react"
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
import { createAnimal, updateAnimal } from "@/lib/queries/animales"
import { getPotreros } from "@/lib/queries/potreros"
import { getParcelas } from "@/lib/queries/parcelas"
import { getDicosePropiedad } from "@/lib/queries/dicose_propiedad"
import { calcularCategoria, calcularCategoriaPreview } from "@/lib/utils/categorias"
import type { Potrero, Parcela, SexoAnimal, Animal } from "@/types/database"
import type { DicosePropiedad } from "@/lib/queries/dicose_propiedad"

// ── Schema de validación ──────────────────────────────────────────────────────

const schema = z.object({
  caravana_snig: z
    .string()
    .min(1, "La caravana SNIG es requerida")
    .regex(/^\d{15}$/, "Debe tener 15 dígitos")
    .refine(v => v.startsWith("8580000"), "Debe comenzar con 8580000"),
  caravana_propia: z.string().optional(),
  sexo: z.enum(["Macho", "Hembra"], "Requerido"),
  edad_meses_ingreso: z
    .number("Ingresá un número")
    .int("Debe ser entero")
    .min(0, "No puede ser negativo"),
  es_toro: z.boolean().optional(),
  dicose_propiedad_id: z
    .number("Requerido")
    .int()
    .positive("Seleccioná un DICOSE Propiedad"),
  raza: z.string().optional(),
  fecha_nacimiento: z.string().optional(),
  potrero_actual: z.number().optional(),
  parcela_actual: z.number().optional(),
  peso_entrada: z.number().positive().optional().or(z.literal("")),
  fecha_peso_entrada: z.string().optional(),
  observaciones: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// ── Props ─────────────────────────────────────────────────────────────────────

interface AnimalFormProps {
  initialData?: Animal
}

// ── Componente ────────────────────────────────────────────────────────────────

export function AnimalForm({ initialData }: AnimalFormProps) {
  const router = useRouter()
  const { establecimientoActivo } = useEstablecimiento()
  const [enviando, setEnviando] = useState(false)

  const [potreros, setPotreros] = useState<Potrero[]>([])
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [dicoseList, setDicoseList] = useState<DicosePropiedad[]>([])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      caravana_snig: initialData?.caravana_snig ?? "",
      caravana_propia: initialData?.caravana_propia ?? "",
      sexo: initialData?.sexo ?? undefined,
      edad_meses_ingreso: initialData?.edad_meses_ingreso ?? undefined,
      es_toro: initialData?.es_toro ?? false,
      dicose_propiedad_id: initialData?.dicose_propiedad_id ?? undefined,
      raza: initialData?.raza ?? "",
      fecha_nacimiento: initialData?.fecha_nacimiento ?? "",
      potrero_actual: initialData?.potrero_actual ?? undefined,
      parcela_actual: initialData?.parcela_actual ?? undefined,
      peso_entrada: initialData?.peso_entrada ?? undefined,
      fecha_peso_entrada: initialData?.fecha_peso_entrada ?? "",
      observaciones: initialData?.observaciones ?? "",
    },
  })

  const formData = watch()
  const sexo = watch("sexo")
  const edadMeses = watch("edad_meses_ingreso")
  const esToro = watch("es_toro")
  const potreroActual = watch("potrero_actual")
  const dicosePropiedadId = watch("dicose_propiedad_id")

  // Categoría calculada en tiempo real para mostrar como preview
  const categoriaPreview = useMemo(() => {
    if (!sexo || edadMeses === undefined || edadMeses === null || isNaN(edadMeses)) return null
    if (initialData?.fecha_ingreso) {
      // En edición: usar la fecha de ingreso real del animal
      return calcularCategoria(sexo, edadMeses, initialData.fecha_ingreso, esToro)
    }
    // En creación: la fecha de ingreso será hoy
    return calcularCategoriaPreview(sexo, edadMeses, esToro)
  }, [sexo, edadMeses, esToro, initialData?.fecha_ingreso])

  // Carga potreros cuando cambia el establecimiento activo
  useEffect(() => {
    if (!establecimientoActivo) return
    getPotreros(establecimientoActivo.id)
      .then(data => setPotreros(data as Potrero[]))
      .catch(() => toast.error("Error cargando potreros"))
  }, [establecimientoActivo?.id])

  // Carga parcelas cuando se selecciona un potrero
  useEffect(() => {
    if (potreroActual) {
      getParcelas(potreroActual)
        .then(data => setParcelas(data as Parcela[]))
        .catch(() => {})
    } else {
      setParcelas([])
    }
  }, [potreroActual])

  // Carga DICOSE Propiedad del establecimiento activo
  useEffect(() => {
    if (!establecimientoActivo) return
    getDicosePropiedad(establecimientoActivo.id)
      .then(setDicoseList)
      .catch(() => toast.error("Error cargando DICOSE Propiedad"))
  }, [establecimientoActivo?.id])

  // Si el sexo cambia a Hembra, limpiar es_toro
  useEffect(() => {
    if (sexo === "Hembra") {
      setValue("es_toro", false)
    }
  }, [sexo, setValue])

  const onSubmit = async (values: FormValues) => {
    // Potrero con parcelas: exige que se elija parcela
    if (values.potrero_actual && parcelas.length > 0 && !values.parcela_actual) {
      toast.error("Este potrero tiene parcelas activas. Debes elegir una parcela.")
      return
    }

    // es_toro solo válido para machos
    if (values.es_toro && values.sexo !== "Macho") {
      toast.error("Solo los machos pueden marcarse como Toro.")
      return
    }

    setEnviando(true)
    try {
      if (!establecimientoActivo) throw new Error("No hay establecimiento activo seleccionado")

      const fechaIngreso = initialData?.fecha_ingreso ?? new Date().toISOString().split("T")[0]
      const categoriaActual = calcularCategoria(
        values.sexo,
        values.edad_meses_ingreso,
        fechaIngreso,
        values.es_toro
      )

      // Lógica potrero vs parcela: si el potrero tiene parcelas, la ubicación
      // se guarda en parcela_actual y potrero_actual queda null (y viceversa)
      const potreroFinal = parcelas.length > 0 ? null : (values.potrero_actual ?? null)
      const parcelaFinal = parcelas.length > 0 ? (values.parcela_actual ?? null) : null

      if (initialData) {
        await updateAnimal(initialData.id, {
          establecimiento_id: establecimientoActivo.id,
          dicose_propiedad_id: values.dicose_propiedad_id,
          caravana_snig: values.caravana_snig,
          caravana_propia: values.caravana_propia || null,
          sexo: values.sexo as SexoAnimal,
          edad_meses_ingreso: values.edad_meses_ingreso,
          es_toro: values.es_toro ?? false,
          categoria_actual: categoriaActual,
          raza: values.raza || null,
          fecha_nacimiento: values.fecha_nacimiento || null,
          potrero_actual: potreroFinal,
          parcela_actual: parcelaFinal,
          peso_entrada: values.peso_entrada ? Number(values.peso_entrada) : null,
          fecha_peso_entrada: values.fecha_peso_entrada || null,
          observaciones: values.observaciones || null,
        })
        toast.success("Animal actualizado correctamente")
        router.push(`/animales/${initialData.id}`)
      } else {
        await createAnimal({
          establecimiento_id: establecimientoActivo.id,
          dicose_propiedad_id: values.dicose_propiedad_id,
          caravana_snig: values.caravana_snig,
          caravana_propia: values.caravana_propia || null,
          sexo: values.sexo as SexoAnimal,
          edad_meses_ingreso: values.edad_meses_ingreso,
          fecha_ingreso: fechaIngreso,
          es_toro: values.es_toro ?? false,
          categoria_actual: categoriaActual,
          raza: values.raza || null,
          fecha_nacimiento: values.fecha_nacimiento || null,
          potrero_actual: potreroFinal,
          parcela_actual: parcelaFinal,
          lote_actual: null,
          peso_entrada: values.peso_entrada ? Number(values.peso_entrada) : null,
          fecha_peso_entrada: values.fecha_peso_entrada || null,
          estado: "activo",
          fecha_baja: null,
          madre_id: null,
          movimiento_origen_id: null,
          observaciones: values.observaciones || null,
          user_id: null,
        })
        toast.success("Animal registrado correctamente")
        router.push("/animales")
      }
      router.refresh()
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("unique")) {
        toast.error("El SNIG ingresado ya está registrado en el sistema.")
      } else {
        toast.error(err instanceof Error ? err.message : "Error al guardar")
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">

      {/* ── SECCIÓN 1: IDENTIFICACIÓN ──────────────────────────────────────── */}
      <div className="bg-card p-5 rounded-lg border">
        <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground border-b pb-2">
          Identificación
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Caravana SNIG */}
          <div className="space-y-1.5">
            <Label htmlFor="caravana_snig">
              Caravana SNIG <span className="text-destructive">*</span>
            </Label>
            <Input
              id="caravana_snig"
              placeholder="858000012345678"
              maxLength={15}
              aria-invalid={!!errors.caravana_snig}
              {...register("caravana_snig")}
            />
            {errors.caravana_snig && (
              <p className="text-sm text-destructive">{errors.caravana_snig.message}</p>
            )}
          </div>

          {/* Caravana Propia */}
          <div className="space-y-1.5">
            <Label htmlFor="caravana_propia">Caravana Propia</Label>
            <Input
              id="caravana_propia"
              placeholder="Opcional (ej: Moco)"
              {...register("caravana_propia")}
            />
          </div>

          {/* Sexo */}
          <div className="space-y-1.5">
            <Label>Sexo <span className="text-destructive">*</span></Label>
            <Select
              value={sexo ?? ""}
              onValueChange={v => v && setValue("sexo", v as SexoAnimal, { shouldValidate: true })}
            >
              <SelectTrigger aria-invalid={!!errors.sexo}>
                <SelectValue>
                  {(v: string | null) => v || <span className="text-muted-foreground">Seleccionar...</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Hembra">Hembra</SelectItem>
                <SelectItem value="Macho">Macho</SelectItem>
              </SelectContent>
            </Select>
            {errors.sexo && (
              <p className="text-sm text-destructive">{errors.sexo.message}</p>
            )}
          </div>

          {/* Edad al ingreso */}
          <div className="space-y-1.5">
            <Label htmlFor="edad_meses_ingreso">
              Edad al ingreso (meses) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edad_meses_ingreso"
              type="number"
              min={0}
              placeholder="Ej: 14"
              aria-invalid={!!errors.edad_meses_ingreso}
              {...register("edad_meses_ingreso", { valueAsNumber: true })}
            />
            {errors.edad_meses_ingreso && (
              <p className="text-sm text-destructive">{errors.edad_meses_ingreso.message}</p>
            )}
          </div>

          {/* Checkbox es_toro — solo visible para Machos */}
          {sexo === "Macho" && (
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={esToro ?? false}
                  onChange={e => setValue("es_toro", e.target.checked)}
                />
                <span className="text-sm">Es Toro</span>
                <span className="text-xs text-muted-foreground">
                  (sobreescribe la categoría automática)
                </span>
              </label>
            </div>
          )}

          {/* Categoría calculada — solo lectura */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Categoría calculada</Label>
            <div className="flex h-9 w-full rounded-lg border border-input bg-muted/40 px-3 items-center text-sm">
              {categoriaPreview ? (
                <span className="font-medium">{categoriaPreview}</span>
              ) : (
                <span className="text-muted-foreground italic">
                  Completá sexo y edad para calcular
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Se calcula automáticamente y se actualiza con el tiempo.
            </p>
          </div>

          {/* Raza */}
          <div className="space-y-1.5">
            <Label htmlFor="raza">Raza</Label>
            <Input
              id="raza"
              placeholder="Ej: Hereford"
              {...register("raza")}
            />
          </div>

          {/* Fecha de nacimiento */}
          <div className="space-y-1.5">
            <Label htmlFor="fecha_nacimiento">Fecha de nacimiento</Label>
            <Input
              id="fecha_nacimiento"
              type="date"
              {...register("fecha_nacimiento")}
            />
          </div>

          {/* DICOSE Propiedad */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>
              DICOSE Propiedad <span className="text-destructive">*</span>
            </Label>
            <Select
              value={dicosePropiedadId?.toString() ?? ""}
              onValueChange={v => v && setValue("dicose_propiedad_id", Number(v), { shouldValidate: true })}
            >
              <SelectTrigger aria-invalid={!!errors.dicose_propiedad_id}>
                <SelectValue>
                  {(v: string | null) => {
                    if (!v) return <span className="text-muted-foreground">Seleccionar titular...</span>
                    const d = dicoseList.find(d => d.id.toString() === v)
                    return d ? `${d.codigo} — ${d.titular}` : v
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {dicoseList.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No hay DICOSE Propiedad registrados
                  </div>
                )}
                {dicoseList.map(d => (
                  <SelectItem key={d.id} value={d.id.toString()}>
                    {d.codigo} — {d.titular}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.dicose_propiedad_id && (
              <p className="text-sm text-destructive">{errors.dicose_propiedad_id.message}</p>
            )}
          </div>

        </div>
      </div>

      {/* ── SECCIÓN 2: UBICACIÓN ACTUAL ────────────────────────────────────── */}
      <div className="bg-card p-5 rounded-lg border">
        <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground border-b pb-2">
          Ubicación Actual
        </h3>

        {!establecimientoActivo ? (
          <p className="text-sm text-muted-foreground">
            Seleccioná un establecimiento en el menú lateral para ver las ubicaciones.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Potrero */}
            <div className="space-y-1.5">
              <Label>Potrero</Label>
              <Select
                value={formData.potrero_actual?.toString() ?? "none"}
                onValueChange={v => {
                  if (v === "none") {
                    setValue("potrero_actual", undefined)
                    setValue("parcela_actual", undefined)
                  } else {
                    setValue("potrero_actual", Number(v))
                    setValue("parcela_actual", undefined)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v: string | null) => {
                      if (!v || v === "none") return <span className="text-muted-foreground">Sin ubicar</span>
                      const p = potreros.find(p => p.id.toString() === v)
                      return p ? p.nombre : v
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin ubicar</SelectItem>
                  {potreros.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parcela — visible solo si el potrero tiene parcelas */}
            {parcelas.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  Parcela <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.parcela_actual?.toString() ?? ""}
                  onValueChange={v => setValue("parcela_actual", Number(v))}
                >
                  <SelectTrigger className="border-primary/50">
                    <SelectValue>
                      {(v: string | null) => {
                        if (!v) return <span className="text-muted-foreground">Seleccionar parcela...</span>
                        const p = parcelas.find(p => p.id.toString() === v)
                        return p ? p.nombre : v
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {parcelas.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Este potrero está subdividido. Debe elegir una parcela.
                </p>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ── SECCIÓN 3: INFORMACIÓN DE INGRESO ─────────────────────────────── */}
      <div className="bg-card p-5 rounded-lg border">
        <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-muted-foreground border-b pb-2">
          Información de Ingreso
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="peso_entrada">Peso entrada (kg)</Label>
            <Input
              id="peso_entrada"
              type="number"
              step="0.5"
              placeholder="Ej: 320"
              {...register("peso_entrada", { valueAsNumber: true })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fecha_peso_entrada">Fecha de pesaje</Label>
            <Input
              id="fecha_peso_entrada"
              type="date"
              {...register("fecha_peso_entrada")}
            />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="observaciones">Observaciones</Label>
          <textarea
            id="observaciones"
            rows={2}
            placeholder="Notas adicionales..."
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
            {...register("observaciones")}
          />
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Guardando..." : initialData ? "Actualizar Animal" : "Registrar Animal"}
        </Button>
      </div>

    </form>
  )
}
