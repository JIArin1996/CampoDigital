"use client"

import { useState, useEffect } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getParametros } from "@/lib/queries/parametros"
import { cn } from "@/lib/utils"

interface SelectParametroProps {
  clave: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Select dinámico que carga sus opciones desde la tabla parametros de Supabase.
 * Usa cache en memoria (via getParametros) para evitar consultas repetidas.
 */
export function SelectParametro({
  clave,
  value,
  onChange,
  placeholder = "Seleccionar...",
  className,
  disabled,
}: SelectParametroProps) {
  const [opciones, setOpciones] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    getParametros(clave)
      .then(setOpciones)
      .finally(() => setCargando(false))
  }, [clave])

  return (
    <Select
      value={value}
      onValueChange={(val) => val !== null && onChange(val)}
      disabled={disabled || cargando}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={cargando ? "Cargando..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((op) => (
          <SelectItem key={op} value={op}>
            {op}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
