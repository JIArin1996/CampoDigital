import type { Rol } from "@/types/database"

export const ETIQUETA_ROL: Record<Rol, string> = {
  administrador: "Administrador",
  operador: "Operador",
  consulta: "Consulta",
}

export const DESCRIPCION_ROL: Record<Rol, string> = {
  administrador: "Todo, en todos los establecimientos, incluidos usuarios y configuración",
  operador: "Carga y edita el día a día",
  consulta: "Ve todo, no edita",
}

export const LARGO_MINIMO_CONTRASENA = 8

export const nombreCompleto = (p: { nombre: string; apellido?: string | null }) =>
  [p.nombre, p.apellido].filter(Boolean).join(" ")
