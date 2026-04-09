"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Plus, Trash2, Building2 } from "lucide-react"

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
import {
  getDicosePropiedad,
  createDicosePropiedad,
  desactivarDicosePropiedad,
} from "@/lib/queries/dicose_propiedad"
import type { DicosePropiedad } from "@/lib/queries/dicose_propiedad"

// ── Schema del mini-formulario ────────────────────────────────────────────────

const schema = z.object({
  codigo: z
    .string()
    .min(1, "Requerido")
    .refine(
      v => /^\d{9}$/.test(v) || /^[A-Za-z]{2}\d{7}$/.test(v),
      "9 dígitos numéricos o 2 letras + 7 dígitos (ej: AB1234567)"
    ),
  titular: z.string().optional(),
  domicilio_constituido: z.string().optional(),
  tipo_titular: z.enum(["Productor", "Fideicomiso", "Empresa", "Otro"], "Requerido"),
})

type FormValues = z.infer<typeof schema>

// ── Props ─────────────────────────────────────────────────────────────────────

interface DicosePropiedadSectionProps {
  establecimiento_id: number
}

// ── Componente ────────────────────────────────────────────────────────────────

export function DicosePropiedadSection({ establecimiento_id }: DicosePropiedadSectionProps) {
  const [lista, setLista] = useState<DicosePropiedad[]>([])
  const [cargando, setCargando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo_titular: undefined,
    },
  })

  const tipoTitular = watch("tipo_titular")

  // Carga los DICOSE Propiedad del establecimiento
  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await getDicosePropiedad(establecimiento_id)
      setLista(data)
    } catch {
      toast.error("Error cargando DICOSE Propiedad")
    } finally {
      setCargando(false)
    }
  }, [establecimiento_id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const onSubmit = async (values: FormValues) => {
    setEnviando(true)
    try {
      await createDicosePropiedad({
        establecimiento_id,
        codigo: values.codigo.toUpperCase(),
        titular: values.titular || "",
        domicilio_constituido: values.domicilio_constituido || null,
        tipo_titular: values.tipo_titular,
        estado: "activo",
        observaciones: null,
      })
      toast.success("DICOSE Propiedad agregado")
      reset()
      setMostrarForm(false)
      cargar()
    } catch (err: unknown) {
      console.error("Error completo:", JSON.stringify(err, null, 2))
      toast.error(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setEnviando(false)
    }
  }

  const handleDesactivar = async (id: number) => {
    try {
      await desactivarDicosePropiedad(id)
      toast.success("DICOSE Propiedad desactivado")
      setConfirmandoId(null)
      cargar()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar")
    }
  }

  return (
    <div className="space-y-4">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">DICOSE Propiedad</h3>
          {lista.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {lista.length}
            </span>
          )}
        </div>
        {!mostrarForm && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMostrarForm(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {/* Lista de DICOSE Propiedad */}
      {cargando ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-14 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : lista.length === 0 && !mostrarForm ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay DICOSE Propiedad registrados para este establecimiento.
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(d => (
            <div
              key={d.id}
              className="flex items-start justify-between rounded-lg border bg-card px-4 py-3 gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold">{d.codigo}</span>
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {d.tipo_titular}
                  </span>
                </div>
                <p className="text-sm text-foreground truncate mt-0.5">{d.titular}</p>
                {d.domicilio_constituido && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {d.domicilio_constituido}
                  </p>
                )}
              </div>

              {/* Confirmación de baja */}
              {confirmandoId === d.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">¿Desactivar?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleDesactivar(d.id)}
                  >
                    Sí
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmandoId(null)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => setConfirmandoId(d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mini-formulario para agregar */}
      {mostrarForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-lg border bg-muted/20 p-4 space-y-4"
        >
          <p className="text-sm font-medium">Nuevo DICOSE Propiedad</p>

          {/* Código + Tipo titular */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dp-codigo">
                Código <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dp-codigo"
                placeholder="Ej: AB1234567"
                maxLength={9}
                className="uppercase"
                aria-invalid={!!errors.codigo}
                {...register("codigo")}
              />
              {errors.codigo ? (
                <p className="text-sm text-destructive">{errors.codigo.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">9 num. o 2 letras + 7 num.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>
                Tipo titular <span className="text-destructive">*</span>
              </Label>
              <Select
                value={tipoTitular ?? ""}
                onValueChange={v => v && setValue("tipo_titular", v as FormValues["tipo_titular"], { shouldValidate: true })}
              >
                <SelectTrigger aria-invalid={!!errors.tipo_titular}>
                  <SelectValue>
                    {(v: string | null) => v || <span className="text-muted-foreground">Seleccionar...</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Productor">Productor</SelectItem>
                  <SelectItem value="Fideicomiso">Fideicomiso</SelectItem>
                  <SelectItem value="Empresa">Empresa</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
              {errors.tipo_titular && (
                <p className="text-sm text-destructive">{errors.tipo_titular.message}</p>
              )}
            </div>
          </div>

          {/* Razón social */}
          <div className="space-y-1.5">
            <Label htmlFor="dp-titular">Razón Social</Label>
            <Input
              id="dp-titular"
              placeholder="Ej: Fideicomiso Ganadero Norte"
              aria-invalid={!!errors.titular}
              {...register("titular")}
            />
            {errors.titular && (
              <p className="text-sm text-destructive">{errors.titular.message}</p>
            )}
          </div>

          {/* Domicilio constituido */}
          <div className="space-y-1.5">
            <Label htmlFor="dp-domicilio">Domicilio Constituido</Label>
            <Input
              id="dp-domicilio"
              placeholder="Ej: Av. 18 de Julio 1234, Montevideo"
              {...register("domicilio_constituido")}
            />
          </div>

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={enviando}>
              {enviando ? "Guardando..." : "Guardar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => { setMostrarForm(false); reset() }}
              disabled={enviando}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
