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
import { createMovimiento } from "@/lib/queries/movimientos"
import type { Potrero, TipoMovimiento, TipoUbicacion } from "@/types/database"

// ── Tipos de ayuda ────────────────────────────────────────────────────────────

type Parcela = { id: number; nombre: string; potrero_id: number }

interface UbicacionState {
  tipo: TipoUbicacion
  id: number | null
}

// ── Schema ────────────────────────────────────────────────────────────────────

const TIPOS: TipoMovimiento[] = ["Compra", "Venta", "Nacimiento", "Muerte", "Traslado", "Ajuste"]

const schema = z.object({
  fecha: z.string().min(1, "Requerido"),
  tipo_movimiento: z.enum(
    ["Compra", "Venta", "Nacimiento", "Muerte", "Traslado", "Ajuste"],
    "Requerido"
  ),
  categoria: z.string().min(1, "Requerido"),
  cantidad: z
    .number("Ingresá un número")
    .int("Debe ser entero")
    .positive("Debe ser mayor a 0"),
  ajuste_signo: z.enum(["positivo", "negativo"]).optional(),
  peso_promedio: z.number().positive().optional(),
  precio_unitario: z.number().positive().optional(),
  precio_base: z.string().optional(),
  precio_total: z.number().positive().optional(),
  contraparte: z.string().optional(),
  remito: z.string().optional(),
  guia_dgt: z.string().optional(),
  observaciones: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// ── Props ─────────────────────────────────────────────────────────────────────

interface MovimientoFormProps {
  establecimiento_id: number
  potreros: Potrero[]
  parcelas: Parcela[]
  onSuccess: () => void
  onCancel: () => void
}

// ── Selector de ubicación ─────────────────────────────────────────────────────

function UbicacionSelector({
  label,
  required,
  value,
  onChange,
  potreros,
  parcelas,
  error,
  excludeKey,       // evita seleccionar el mismo lugar en traslados
}: {
  label: string
  required?: boolean
  value: UbicacionState
  onChange: (v: UbicacionState) => void
  potreros: Potrero[]
  parcelas: Parcela[]
  error?: string
  excludeKey?: string  // "potrero|id" o "parcela|id"
}) {
  const opciones =
    value.tipo === "potrero"
      ? potreros.filter(p => `potrero|${p.id}` !== excludeKey)
      : parcelas.filter(p => `parcela|${p.id}` !== excludeKey)

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="flex gap-2">
        {/* Tipo: Potrero / Parcela */}
        <Select
          value={value.tipo}
          onValueChange={v => v && onChange({ tipo: v as TipoUbicacion, id: null })}
        >
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue>
              {(v: string | null) => v === "potrero" ? "Potrero" : v === "parcela" ? "Parcela" : "Tipo"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {potreros.length > 0 && <SelectItem value="potrero">Potrero</SelectItem>}
            {parcelas.length > 0 && <SelectItem value="parcela">Parcela</SelectItem>}
          </SelectContent>
        </Select>

        {/* Nombre */}
        <Select
          value={value.id?.toString() ?? ""}
          onValueChange={v => v && onChange({ ...value, id: Number(v) })}
          disabled={opciones.length === 0}
        >
          <SelectTrigger className="flex-1" aria-invalid={!!error}>
            <SelectValue>
              {(v: string | null) =>
                v
                  ? (opciones.find(o => o.id.toString() === v)?.nombre ?? v)
                  : <span className="text-muted-foreground">Seleccionar...</span>
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {opciones.map(o => (
              <SelectItem key={o.id} value={o.id.toString()}>
                {o.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

// ── Formulario principal ──────────────────────────────────────────────────────

const defaultUbicacion = (potreros: Potrero[]): UbicacionState => ({
  tipo: potreros.length > 0 ? "potrero" : "parcela",
  id: null,
})

export function MovimientoForm({
  establecimiento_id,
  potreros,
  parcelas,
  onSuccess,
  onCancel,
}: MovimientoFormProps) {
  const [enviando, setEnviando] = useState(false)
  const [origen, setOrigen] = useState<UbicacionState>(() => defaultUbicacion(potreros))
  const [destino, setDestino] = useState<UbicacionState>(() => defaultUbicacion(potreros))
  const [ubicAjuste, setUbicAjuste] = useState<UbicacionState>(() => defaultUbicacion(potreros))
  const [errOrigen, setErrOrigen] = useState("")
  const [errDestino, setErrDestino] = useState("")
  const [errAjuste, setErrAjuste] = useState("")

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
      ajuste_signo: "positivo",
    },
  })

  const tipo = watch("tipo_movimiento")
  const ajuste_signo = watch("ajuste_signo")
  const precio_unitario = watch("precio_unitario")
  const cantidad = watch("cantidad")

  const needsOrigen = ["Venta", "Muerte", "Traslado"].includes(tipo)
  const needsDestino = ["Compra", "Nacimiento", "Traslado"].includes(tipo)
  const isAjuste = tipo === "Ajuste"
  const showPrecio = ["Compra", "Venta"].includes(tipo)

  // Auto-calcular precio_total
  const precioTotalAuto =
    precio_unitario && cantidad && !isNaN(precio_unitario) && !isNaN(cantidad)
      ? precio_unitario * cantidad
      : undefined

  const origenKey = origen.id ? `${origen.tipo}|${origen.id}` : undefined
  const destinoKey = destino.id ? `${destino.tipo}|${destino.id}` : undefined

  const onSubmit = async (values: FormValues) => {
    // Validar ubicaciones según tipo
    let valid = true
    setErrOrigen(""); setErrDestino(""); setErrAjuste("")

    if (needsOrigen && !origen.id) {
      setErrOrigen("Seleccioná el origen")
      valid = false
    }
    if (needsDestino && !destino.id) {
      setErrDestino("Seleccioná el destino")
      valid = false
    }
    if (tipo === "Traslado" && origen.id && destino.id && origenKey === destinoKey) {
      setErrDestino("El destino debe ser diferente al origen")
      valid = false
    }
    if (isAjuste && !ubicAjuste.id) {
      setErrAjuste("Seleccioná una ubicación")
      valid = false
    }
    if (!valid) return

    setEnviando(true)
    try {
      // Resolver origen/destino según tipo
      let origenTipo = null, origenId = null, destinoTipo = null, destinoId = null

      if (needsOrigen) {
        origenTipo = origen.tipo
        origenId = origen.id
      }
      if (needsDestino) {
        destinoTipo = destino.tipo
        destinoId = destino.id
      }
      if (isAjuste) {
        if (values.ajuste_signo === "negativo") {
          origenTipo = ubicAjuste.tipo; origenId = ubicAjuste.id
        } else {
          destinoTipo = ubicAjuste.tipo; destinoId = ubicAjuste.id
        }
      }

      await createMovimiento({
        establecimiento_id,
        fecha: values.fecha,
        tipo_movimiento: values.tipo_movimiento,
        categoria: values.categoria,
        cantidad: values.cantidad,
        peso_promedio: values.peso_promedio ?? null,
        peso_total: values.peso_promedio && values.cantidad
          ? +(values.peso_promedio * values.cantidad).toFixed(2)
          : null,
        origen_tipo: origenTipo,
        origen_id: origenId,
        destino_tipo: destinoTipo,
        destino_id: destinoId,
        precio_unitario: values.precio_unitario ?? null,
        precio_base: values.precio_base ?? null,
        precio_total: values.precio_total ?? precioTotalAuto ?? null,
        contraparte: values.contraparte ?? null,
        remito: values.remito ?? null,
        guia_dgt: values.guia_dgt ?? null,
        finanza_id: null,
        observaciones: values.observaciones ?? null,
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

      {/* Tipo + Fecha */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo <span className="text-destructive">*</span></Label>
          <Select
            value={watch("tipo_movimiento") ?? ""}
            onValueChange={v => v && setValue("tipo_movimiento", v as TipoMovimiento, { shouldValidate: true })}
          >
            <SelectTrigger aria-invalid={!!errors.tipo_movimiento}>
              <SelectValue>
                {(v: string | null) => v || <span className="text-muted-foreground">Seleccionar...</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.tipo_movimiento && <p className="text-sm text-destructive">{errors.tipo_movimiento.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mov-fecha">Fecha <span className="text-destructive">*</span></Label>
          <Input id="mov-fecha" type="date" aria-invalid={!!errors.fecha} {...register("fecha")} />
          {errors.fecha && <p className="text-sm text-destructive">{errors.fecha.message}</p>}
        </div>
      </div>

      {/* Categoría + Cantidad */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Categoría <span className="text-destructive">*</span></Label>
          <SelectParametro
            clave="categorias_ganado"
            value={watch("categoria") ?? ""}
            onChange={v => setValue("categoria", v, { shouldValidate: true })}
            placeholder="Seleccionar..."
          />
          {errors.categoria && <p className="text-sm text-destructive">{errors.categoria.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mov-cantidad">Cantidad <span className="text-destructive">*</span></Label>
          <Input
            id="mov-cantidad"
            type="number"
            min={1}
            placeholder="Ej: 10"
            aria-invalid={!!errors.cantidad}
            {...register("cantidad", { valueAsNumber: true })}
          />
          {errors.cantidad && <p className="text-sm text-destructive">{errors.cantidad.message}</p>}
        </div>
      </div>

      {/* Origen */}
      {needsOrigen && (
        <UbicacionSelector
          label="Origen"
          required
          value={origen}
          onChange={setOrigen}
          potreros={potreros}
          parcelas={parcelas}
          error={errOrigen}
          excludeKey={destinoKey}
        />
      )}

      {/* Destino */}
      {needsDestino && (
        <UbicacionSelector
          label="Destino"
          required
          value={destino}
          onChange={setDestino}
          potreros={potreros}
          parcelas={parcelas}
          error={errDestino}
          excludeKey={origenKey}
        />
      )}

      {/* Ajuste: signo + ubicación */}
      {isAjuste && (
        <div className="space-y-3 p-3 rounded-lg bg-muted/30 border">
          <div className="space-y-1.5">
            <Label>Tipo de ajuste <span className="text-destructive">*</span></Label>
            <Select
              value={ajuste_signo ?? "positivo"}
              onValueChange={v => v && setValue("ajuste_signo", v as "positivo" | "negativo")}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: string | null) =>
                    v === "negativo" ? "Negativo — baja del rodeo" : "Positivo — ingresa al rodeo"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="positivo">Positivo — ingresa al rodeo</SelectItem>
                <SelectItem value="negativo">Negativo — baja del rodeo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <UbicacionSelector
            label="Ubicación"
            required
            value={ubicAjuste}
            onChange={setUbicAjuste}
            potreros={potreros}
            parcelas={parcelas}
            error={errAjuste}
          />
        </div>
      )}

      {/* Sección precio (Compra / Venta) */}
      {showPrecio && (
        <div className="space-y-3 p-3 rounded-lg bg-muted/30 border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Precio / Pesaje</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mov-peso">Peso promedio (kg)</Label>
              <Input
                id="mov-peso"
                type="number"
                step="0.1"
                placeholder="Ej: 320"
                {...register("peso_promedio", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Base de precio</Label>
              <Select
                value={watch("precio_base") ?? ""}
                onValueChange={v => v && setValue("precio_base", v)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v: string | null) => v || <span className="text-muted-foreground">Seleccionar...</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Por cabeza">Por cabeza</SelectItem>
                  <SelectItem value="Por kg vivo">Por kg vivo</SelectItem>
                  <SelectItem value="Por kg carcasa">Por kg carcasa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mov-precio-unit">Precio unitario (USD)</Label>
              <Input
                id="mov-precio-unit"
                type="number"
                step="0.01"
                placeholder="Ej: 2.50"
                {...register("precio_unitario", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-precio-total">Precio total (USD)</Label>
              <Input
                id="mov-precio-total"
                type="number"
                step="0.01"
                placeholder={precioTotalAuto ? `Auto: ${precioTotalAuto.toFixed(2)}` : "Ej: 1500"}
                {...register("precio_total", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mov-contraparte">
                {tipo === "Compra" ? "Vendedor" : "Comprador / Frigorífico"}
              </Label>
              <Input
                id="mov-contraparte"
                placeholder="Nombre..."
                {...register("contraparte")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-remito">Remito</Label>
              <Input id="mov-remito" placeholder="Nº remito..." {...register("remito")} />
            </div>
          </div>

          {tipo === "Venta" && (
            <div className="space-y-1.5">
              <Label htmlFor="mov-guia">Guía DGT</Label>
              <Input id="mov-guia" placeholder="Nº guía..." {...register("guia_dgt")} />
            </div>
          )}
        </div>
      )}

      {/* Observaciones */}
      <div className="space-y-1.5">
        <Label htmlFor="mov-obs">Observaciones</Label>
        <textarea
          id="mov-obs"
          rows={2}
          placeholder="Notas adicionales..."
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          {...register("observaciones")}
        />
      </div>

      {/* Botones */}
      <div className="flex gap-3 pt-1 sticky bottom-0 bg-background pb-1">
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
