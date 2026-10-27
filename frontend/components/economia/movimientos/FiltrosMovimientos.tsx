"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CAMPO, SELECT_NATIVO } from "@/components/shared/estilos"
import { cantidadFiltros, rangoDe, type FiltrosMov, type PeriodoMov } from "@/components/economia/movimientos/filtros"
import { cn } from "@/lib/utils"

export interface Opcion { id: string; nombre: string }

export interface OpcionesFiltros {
  titulares: Opcion[]
  pagadores: Opcion[]
  rubros: Opcion[]
  conceptos: Opcion[]
  facturas: Opcion[]          // id = nombre (texto de la factura)
}

type ClaveLista = "titulares" | "pagadores" | "rubros" | "conceptos" | "facturas"
const LISTAS: { clave: ClaveLista; titulo: string; chip: string }[] = [
  { clave: "titulares", titulo: "Titulares", chip: "Titular" },
  { clave: "pagadores", titulo: "Pagado o cobrado por", chip: "Pagó" },
  { clave: "rubros", titulo: "Rubros", chip: "Rubro" },
  { clave: "conceptos", titulo: "Conceptos", chip: "Concepto" },
  { clave: "facturas", titulo: "Factura a nombre de", chip: "Factura" },
]

/**
 * Filtros del listado: el tipo (siempre visible), el período, y titulares, pagador, rubro, concepto,
 * factura, estado y anulados (en el celular, en una hoja que sube desde abajo; en la computadora, en una
 * fila). Los filtros puestos se ven como chips que se sacan con ✕.
 */
export function FiltrosMovimientos({ filtros, onCambio, opciones }: {
  filtros: FiltrosMov
  onCambio: (f: FiltrosMov) => void
  opciones: OpcionesFiltros
}) {
  const [hoja, setHoja] = useState(false)
  const cambiar = (c: Partial<FiltrosMov>) => onCambio({ ...filtros, ...c })
  const alternar = (clave: ClaveLista, id: string) =>
    cambiar({ [clave]: filtros[clave].includes(id) ? filtros[clave].filter(x => x !== id) : [...filtros[clave], id] })
  const n = cantidadFiltros(filtros)

  const segmento = (activo: boolean) => cn("flex-1 min-h-11 rounded-md px-3 text-sm font-semibold transition-colors md:min-h-9",
    activo ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")

  // Chips de lo que está filtrado (se sacan de a uno)
  const chips = [
    ...LISTAS.flatMap(l => filtros[l.clave].map(id => ({
      clave: `${l.clave}:${id}`, texto: `${l.chip}: ${opciones[l.clave].find(o => o.id === id)?.nombre ?? "—"}`,
      sacar: () => alternar(l.clave, id),
    }))),
    ...(filtros.estado ? [{ clave: "estado", texto: filtros.estado === "pendiente" ? "Pendientes" : "Pagados o cobrados", sacar: () => cambiar({ estado: "" }) }] : []),
    ...(filtros.anulados ? [{ clave: "anulados", texto: "Con anulados", sacar: () => cambiar({ anulados: false }) }] : []),
  ]

  const selectorEstado = (
      <select aria-label="Estado" className={SELECT_NATIVO} value={filtros.estado} onChange={e => cambiar({ estado: e.target.value as FiltrosMov["estado"] })}>
        <option value="">Pagados y pendientes</option>
        <option value="pendiente">Pendientes</option>
        <option value="pagado">Pagados o cobrados</option>
      </select>
  )
  const verAnulados = (
      <label className="flex min-h-11 cursor-pointer select-none items-center gap-2 text-sm md:min-h-9">
        <input type="checkbox" className="h-5 w-5 accent-primary" checked={filtros.anulados} onChange={e => cambiar({ anulados: e.target.checked })} />
        Ver anulados
      </label>
  )

  return (
    <div className="space-y-3">
      {/* Tipo y período */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full gap-1 rounded-lg bg-muted p-1 sm:w-auto" role="group" aria-label="Tipo de movimiento">
          <button type="button" aria-pressed={!filtros.tipo} className={segmento(!filtros.tipo)} onClick={() => cambiar({ tipo: "" })}>Todos</button>
          <button type="button" aria-pressed={filtros.tipo === "ingreso"} className={segmento(filtros.tipo === "ingreso")} onClick={() => cambiar({ tipo: "ingreso" })}>Ingresos</button>
          <button type="button" aria-pressed={filtros.tipo === "egreso"} className={segmento(filtros.tipo === "egreso")} onClick={() => cambiar({ tipo: "egreso" })}>Egresos</button>
        </div>
        <SelectorPeriodo periodo={filtros.periodo} onCambio={periodo => cambiar({ periodo })} />
        <Button type="button" variant="outline" className="h-11 md:hidden" onClick={() => setHoja(true)}>
          <SlidersHorizontal className="h-4 w-4 mr-1" /> Filtros{n > 0 ? ` (${n})` : ""}
        </Button>
      </div>

      {/* Computadora: los selectores en una fila */}
      <div className="hidden md:flex md:flex-wrap md:items-center md:gap-2">
        {LISTAS.filter(l => opciones[l.clave].length > 0).map(l => (
          <SelectorMultiple key={l.clave} titulo={l.titulo} opciones={opciones[l.clave]} elegidos={filtros[l.clave]} onAlternar={id => alternar(l.clave, id)} />
        ))}
        <div className="w-52">{selectorEstado}</div>
        {verAnulados}
      </div>

      {/* Lo filtrado, como chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(c => (
            <button key={c.clave} type="button" onClick={c.sacar} aria-label={`Sacar el filtro ${c.texto}`}
              className="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent px-3 text-sm font-medium text-accent-foreground">
              {c.texto} <X className="h-3.5 w-3.5" />
            </button>
          ))}
          <button type="button" className="min-h-9 px-2 text-sm text-muted-foreground underline"
            onClick={() => cambiar({ titulares: [], pagadores: [], rubros: [], conceptos: [], facturas: [], estado: "", anulados: false })}>
            Sacar todos
          </button>
        </div>
      )}

      {/* Celular: hoja de filtros */}
      {hoja && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => setHoja(false)}>
          <div role="dialog" aria-label="Filtros" className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Filtros</h2>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Cerrar" onClick={() => setHoja(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-5">
              {LISTAS.filter(l => opciones[l.clave].length > 0).map(l => (
                <section key={l.clave} className="space-y-2">
                  <h3 className="text-sm font-semibold">{l.titulo}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {opciones[l.clave].map(o => {
                      const activo = filtros[l.clave].includes(o.id)
                      return (
                        <button key={o.id} type="button" aria-pressed={activo} onClick={() => alternar(l.clave, o.id)}
                          className={cn("inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm",
                            activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                          {activo && <Check className="h-3.5 w-3.5" />}{o.nombre}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Estado</h3>
                {selectorEstado}
                {verAnulados}
              </section>
            </div>
            <Button type="button" className="mt-5 h-11 w-full" onClick={() => setHoja(false)}>Listo</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Mes (por defecto el actual), año o rango de fechas
function SelectorPeriodo({ periodo, onCambio }: { periodo: PeriodoMov; onCambio: (p: PeriodoMov) => void }) {
  const { desde, hasta } = rangoDe(periodo)
  const anioHoy = new Date().getFullYear()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Período" className={cn(SELECT_NATIVO, "w-auto")} value={periodo.tipo}
        onChange={e => {
          const t = e.target.value
          if (t === "mes") onCambio({ tipo: "mes", mes: desde.slice(0, 7) })
          else if (t === "anio") onCambio({ tipo: "anio", anio: Number(desde.slice(0, 4)) })
          else onCambio({ tipo: "rango", desde, hasta })
        }}>
        <option value="mes">Mes</option>
        <option value="anio">Año</option>
        <option value="rango">Entre fechas</option>
      </select>
      {periodo.tipo === "mes" && (
        <Input type="month" aria-label="Mes" className={cn(CAMPO, "w-auto")} value={periodo.mes}
          onChange={e => e.target.value && onCambio({ tipo: "mes", mes: e.target.value })} />
      )}
      {periodo.tipo === "anio" && (
        <select aria-label="Año" className={cn(SELECT_NATIVO, "w-28")} value={periodo.anio} onChange={e => onCambio({ tipo: "anio", anio: Number(e.target.value) })}>
          {Array.from({ length: 8 }, (_, i) => anioHoy - i).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      {periodo.tipo === "rango" && (
        <>
          <Input type="date" aria-label="Desde" className={cn(CAMPO, "w-auto")} value={periodo.desde} max={periodo.hasta}
            onChange={e => e.target.value && onCambio({ ...periodo, desde: e.target.value })} />
          <Input type="date" aria-label="Hasta" className={cn(CAMPO, "w-auto")} value={periodo.hasta} min={periodo.desde}
            onChange={e => e.target.value && onCambio({ ...periodo, hasta: e.target.value })} />
        </>
      )}
    </div>
  )
}

// Selección múltiple en un desplegable (computadora)
function SelectorMultiple({ titulo, opciones, elegidos, onAlternar }: {
  titulo: string
  opciones: Opcion[]
  elegidos: string[]
  onAlternar: (id: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) }
    document.addEventListener("mousedown", fuera)
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", escape) }
  }, [abierto])

  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="outline" className={cn("h-9", elegidos.length > 0 && "border-primary")} aria-expanded={abierto}
        onClick={() => setAbierto(a => !a)}>
        {titulo}{elegidos.length > 0 ? ` (${elegidos.length})` : ""} <ChevronDown className="h-4 w-4 ml-1" />
      </Button>
      {abierto && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
          {opciones.map(o => {
            const activo = elegidos.includes(o.id)
            return (
              <button key={o.id} type="button" role="menuitemcheckbox" aria-checked={activo} onClick={() => onAlternar(o.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", activo && "border-primary bg-primary text-primary-foreground")}>
                  {activo && <Check className="h-3 w-3" />}
                </span>
                {o.nombre}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
