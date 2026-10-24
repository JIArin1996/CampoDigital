"use client"

import { SELECT_NATIVO } from "@/components/shared/estilos"
import type { RolMembresia } from "@/types/database"

export type OpcionAcceso = RolMembresia | ""   // "" = sin acceso

/**
 * Acceso de un usuario a un establecimiento: sin acceso, operador o consulta.
 */
export function SelectorRol({
  id, value, onChange, disabled,
}: {
  id: string
  value: OpcionAcceso
  onChange: (valor: OpcionAcceso) => void
  disabled?: boolean
}) {
  return (
    <select
      id={id}
      className={`${SELECT_NATIVO} w-40`}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value as OpcionAcceso)}
    >
      <option value="">Sin acceso</option>
      <option value="operador">Operador</option>
      <option value="consulta">Consulta</option>
    </select>
  )
}
