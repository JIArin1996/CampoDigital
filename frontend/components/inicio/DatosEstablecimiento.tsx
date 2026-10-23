"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, Edit2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ETIQUETA_ROL } from "@/components/usuarios/roles"
import { cn } from "@/lib/utils"
import type { Establecimiento, Rol } from "@/types/database"

const ha = (n: number) => `${n.toLocaleString("es-UY", { maximumFractionDigits: 2 })} ha`

/**
 * Datos del establecimiento activo, bajo el saludo del Inicio: una fila compacta (nombre, sistema
 * productivo y superficie, con el rol) que se expande con "Ver más". Editar, solo el administrador.
 */
export function DatosEstablecimiento({ establecimiento: e, rol, puedeEditar }: {
  establecimiento: Establecimiento
  rol: Rol | null
  puedeEditar: boolean
}) {
  const [abierto, setAbierto] = useState(false)

  const resumen = [e.nombre, e.sistema_productivo, e.superficie_total ? ha(e.superficie_total) : null].filter(Boolean).join(" · ")
  const datos: [string, string | null][] = [
    ["Departamento", e.departamento],
    ["Localidad", e.localidad],
    ["Paraje", e.paraje],
    ["Propietario", e.propietario],
    ["RUT", e.rut],
    ["DICOSE", e.dicose],
    ["Fecha de alta", e.fecha_alta ? new Date(e.fecha_alta + "T00:00:00").toLocaleDateString("es-UY") : null],
  ]
  const conValor = datos.filter((d): d is [string, string] => !!d[1])

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-muted-foreground min-w-0">{resumen}</p>
        {rol && <Badge variant={rol === "consulta" ? "secondary" : "default"}>{ETIQUETA_ROL[rol]}</Badge>}
        <button type="button" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}
          className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-primary">
          {abierto ? "Ver menos" : "Ver más"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} />
        </button>
      </div>

      {abierto && (
        <div className="mt-2 rounded-lg border bg-card px-4 py-3">
          {conValor.length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              {conValor.map(([titulo, valor]) => (
                <div key={titulo}>
                  <dt className="text-muted-foreground">{titulo}</dt>
                  <dd className="font-medium">{valor}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No hay más datos cargados.</p>
          )}
          {e.observaciones && <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{e.observaciones}</p>}
          {puedeEditar && (
            <Link href={`/establecimientos/${e.id}/editar?desde=inicio`}
              className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3 h-11 md:h-8" })}>
              <Edit2 className="h-4 w-4 mr-1" /> Editar establecimiento
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
