"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useState } from "react"

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
import { createMovimiento } from "@/lib/queries/movimientos"
import { SUBTIPOS_POR_TIPO } from "@/types/database"
import type { TipoMovimiento, SubtipoMovimiento } from "@/types/database"
import type { DicosePropiedad } from "@/lib/queries/dicose_propiedad"

// ── Etiquetas legibles para el select de tipo ─────────────────────────────────

const TIPO_LABELS: Record<TipoMovimiento, string> = {
  Ingreso:         "Ingreso",
  Egreso:          "Egreso",
  Traslado:        "Traslado",
  Afectacion:      "Afectación",
  Reclasificacion: "Reclasificación",
}

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  fecha: z.string().min(1, "Requerido"),
  tipo_movimiento: z.enum(
    ["Ingreso", "Egreso", "Traslado", "Afectacion", "Reclasificacion"],
    "Requerido"
  ),
  subtipo: z.string().min(1, "Requerido"),
  dicose_propiedad_id: z
    .number("Requerido")
    .int()
    .positive("Seleccioná un DICOSE Propiedad"),
})

type FormValues = z.infer<typeof schema>

// ── Props ─────────────────────────────────────────────────────────────────────

interface MovimientoFormProps {
  establecimiento_id: number
  dicoseList: DicosePropiedad[]
  onSuccess: () => void
  onCancel: () => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export function MovimientoForm({
  establecimiento_id,
  dicoseList,
  onSuccess,
  onCancel,
}: MovimientoFormProps) {
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
      fecha: new Date().toISOString().split("T")[0],
    },
  })

  const tipo = watch("tipo_movimiento")
  const subtipo = watch("subtipo")
  const dicosePropiedadId = watch("dicose_propiedad_id")

  // Subtipos disponibles según el tipo seleccionado
  const subtiposDisponibles: SubtipoMovimiento[] = tipo ? SUBTIPOS_POR_TIPO[tipo] : []

  // Al cambiar el tipo, limpiar el subtipo si el actual ya no es válido
  useEffect(() => {
    if (subtipo && tipo && !SUBTIPOS_POR_TIPO[tipo].includes(subtipo as SubtipoMovimiento)) {
      setValue("subtipo", "")
    }
  }, [tipo, subtipo, setValue])

  const onSubmit = async (values: FormValues) => {
    setEnviando(true)
    try {
      await createMovimiento({
        establecimiento_id,
        fecha: values.fecha,
        tipo_movimiento: values.tipo_movimiento,
        subtipo: values.subtipo as SubtipoMovimiento,
        dicose_propiedad_id: values.dicose_propiedad_id,
        // Campos a completar en fases posteriores
        lote_movimiento_id: null,
        animal_id: null,
        caravana_snig: null,
        potrero_id: null,
        establecimiento_destino_id: null,
        peso_kg: null,
        precio_unitario: null,
        precio_total: null,
        contraparte: null,
        observaciones: null,
        user_id: null,
      })
      toast.success("Movimiento registrado")
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

      {/* Fecha */}
      <div className="space-y-1.5">
        <Label htmlFor="mov-fecha">
          Fecha <span className="text-destructive">*</span>
        </Label>
        <Input
          id="mov-fecha"
          type="date"
          aria-invalid={!!errors.fecha}
          {...register("fecha")}
        />
        {errors.fecha && (
          <p className="text-sm text-destructive">{errors.fecha.message}</p>
        )}
      </div>

      {/* Tipo + Subtipo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Tipo */}
        <div className="space-y-1.5">
          <Label>
            Tipo <span className="text-destructive">*</span>
          </Label>
          <Select
            value={tipo ?? ""}
            onValueChange={v => v && setValue("tipo_movimiento", v as TipoMovimiento, { shouldValidate: true })}
          >
            <SelectTrigger aria-invalid={!!errors.tipo_movimiento}>
              <SelectValue>
                {(v: string | null) =>
                  v
                    ? TIPO_LABELS[v as TipoMovimiento]
                    : <span className="text-muted-foreground">Seleccionar...</span>
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SUBTIPOS_POR_TIPO) as TipoMovimiento[]).map(t => (
                <SelectItem key={t} value={t}>{TIPO_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.tipo_movimiento && (
            <p className="text-sm text-destructive">{errors.tipo_movimiento.message}</p>
          )}
        </div>

        {/* Subtipo — dinámico según tipo */}
        <div className="space-y-1.5">
          <Label>
            Subtipo <span className="text-destructive">*</span>
          </Label>
          <Select
            value={subtipo ?? ""}
            disabled={!tipo}
            onValueChange={v => v && setValue("subtipo", v, { shouldValidate: true })}
          >
            <SelectTrigger aria-invalid={!!errors.subtipo}>
              <SelectValue>
                {(v: string | null) =>
                  v
                    ? v
                    : <span className="text-muted-foreground">
                        {tipo ? "Seleccionar..." : "Elegí un tipo primero"}
                      </span>
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {subtiposDisponibles.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.subtipo && (
            <p className="text-sm text-destructive">{errors.subtipo.message}</p>
          )}
        </div>

      </div>

      {/* DICOSE Propiedad */}
      <div className="space-y-1.5">
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
            {dicoseList.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No hay DICOSE Propiedad registrados
              </div>
            ) : (
              dicoseList.map(d => (
                <SelectItem key={d.id} value={d.id.toString()}>
                  {d.codigo} — {d.titular}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {errors.dicose_propiedad_id && (
          <p className="text-sm text-destructive">{errors.dicose_propiedad_id.message}</p>
        )}
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={enviando}>
          {enviando ? "Registrando..." : "Registrar"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={enviando}>
          Cancelar
        </Button>
      </div>

    </form>
  )
}
