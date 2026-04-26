"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { getAnimales, deleteAnimalesBulk } from "@/lib/queries/animales"
import { getPotreros } from "@/lib/queries/potreros"
import { getDicosesPropiedad, type DicosePropiedad } from "@/lib/queries/dicoses_propiedad"
import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import type { Potrero } from "@/types/database"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { SelectParametro } from "@/components/shared/SelectParametro"
import { Input } from "@/components/ui/input"
import { buttonVariants, Button } from "@/components/ui/button"
import { Plus, Download, Layers, ListFilter, CheckSquare, Trash2 } from "lucide-react"
import { LotesSection } from "@/components/animales/LotesSection"
import { AsignarLoteModal } from "@/components/animales/AsignarLoteModal"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Tab = "animales" | "lotes"

export function AnimalesClientWrapper() {
  const { establecimientoActivo } = useEstablecimiento()
  const establecimientoId = establecimientoActivo?.id ?? 0

  const [tab, setTab] = useState<Tab>("animales")
  const [modalAsignar, setModalAsignar] = useState(false)
  const [modalEliminar, setModalEliminar] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const [animales, setAnimales] = useState<any[]>([])
  const [potreros, setPotreros] = useState<Potrero[]>([])
  const [dicoses, setDicoses] = useState<DicosePropiedad[]>([])
  const [cargando, setCargando] = useState(false)

  // Selección para bulk actions
  const [seleccionados, setSeleccionados] = useState<number[]>([])

  // Filtros
  const [filtroSnig, setFiltroSnig] = useState("")
  const [filtroCategoria, setFiltroCategoria] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("activo")
  const [filtroPotrero, setFiltroPotrero] = useState("")
  const [filtroDicose, setFiltroDicose] = useState("")

  const cargar = () => {
    if (establecimientoId <= 0) { setAnimales([]); return }
    setCargando(true)
    getAnimales(establecimientoId, {
      categoria: filtroCategoria || undefined,
      estado: filtroEstado || undefined,
      potrero_id: filtroPotrero ? Number(filtroPotrero) : undefined,
    })
      .then(data => { setAnimales(data); setSeleccionados([]) })
      .catch(() => setAnimales([]))
      .finally(() => setCargando(false))
  }

  useEffect(() => {
    if (establecimientoId <= 0) return
    getPotreros(establecimientoId).then(data => setPotreros(data as Potrero[])).catch(() => {})
    getDicosesPropiedad(establecimientoId).then(setDicoses).catch(() => {})
  }, [establecimientoId])

  useEffect(() => { cargar() }, [establecimientoId, filtroCategoria, filtroEstado, filtroPotrero])

  const animalesMostrados = animales.filter(a => {
    if (filtroSnig && !a.caravana_snig.includes(filtroSnig) && !a.caravana_propia?.includes(filtroSnig)) return false
    if (filtroDicose) {
      try {
        const obs = a.observaciones ? JSON.parse(a.observaciones.slice(a.observaciones.indexOf('{'))) : {}
        if (obs.dicose_propiedad !== filtroDicose) return false
      } catch { return false }
    }
    return true
  })

  const todosSeleccionados =
    animalesMostrados.length > 0 && seleccionados.length === animalesMostrados.length

  const toggleTodos = () => {
    if (todosSeleccionados) {
      setSeleccionados([])
    } else {
      setSeleccionados(animalesMostrados.map(a => a.id))
    }
  }

  const toggleAnimal = (id: number) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const descargarExcel = () => {
    const filas = animalesMostrados.map(a => ({
      'Caravana SNIG': a.caravana_snig,
      'Caravana Propia': a.caravana_propia ?? '',
      'Categoría': a.categoria,
      'Sexo': a.sexo === 'Hembra' ? 'H' : 'M',
      'Raza': a.raza ?? '',
      'Potrero': a.potrero?.nombre ?? '',
      'Parcela': a.parcela?.nombre ?? '',
      'Lote': a.lote?.nombre ?? '',
      'Estado': a.estado,
      'Fecha Nacimiento': a.fecha_nacimiento ?? '',
      'Peso Entrada (kg)': a.peso_entrada ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Animales')
    XLSX.writeFile(wb, `animales_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const eliminarSeleccionados = async () => {
    setEliminando(true)
    try {
      await deleteAnimalesBulk(seleccionados)
      toast.success(`${seleccionados.length} animal(es) eliminado(s)`)
      setModalEliminar(false)
      cargar()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        <button
          onClick={() => setTab("animales")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "animales"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ListFilter className="inline h-4 w-4 mr-1.5" />
          Stock Ganadero
        </button>
        <button
          onClick={() => setTab("lotes")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "lotes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Layers className="inline h-4 w-4 mr-1.5" />
          Lotes de Manejo
        </button>
      </div>

      {/* ── Tab: Animales ───────────────────────────────────────────────── */}
      {tab === "animales" && (
        <>
          {/* Acciones superiores */}
          <div className="flex justify-end gap-2 flex-wrap">
            <Button variant="outline" onClick={descargarExcel}>
              <Download className="h-4 w-4 mr-2" />
              Descargar Excel
            </Button>
            <Link href="/animales/nuevo" className={buttonVariants({ variant: "default" })}>
              <Plus className="h-4 w-4 mr-2" />
              Ingresar Animal
            </Link>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 border rounded-lg bg-card">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">SNIG / Caravana</label>
              <Input placeholder="Buscar..." value={filtroSnig} onChange={e => setFiltroSnig(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Categoría</label>
              <SelectParametro clave="categorias_ganado" value={filtroCategoria} onChange={setFiltroCategoria} placeholder="Todas" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Ubicación</label>
              <Select value={filtroPotrero} onValueChange={v => setFiltroPotrero(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Todos los potreros" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {potreros.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">DICOSE Propiedad</label>
              <Select value={filtroDicose} onValueChange={v => setFiltroDicose(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {dicoses.map(d => <SelectItem key={d.id} value={d.dicose_propiedad}><span className="font-mono">{d.dicose_propiedad}</span>{d.razon_social && <span className="ml-2 text-xs text-muted-foreground">{d.razon_social}</span>}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <Select value={filtroEstado} onValueChange={v => v && setFiltroEstado(v)}>
                <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="activo">Activos</SelectItem>
                  <SelectItem value="vendido">Vendidos</SelectItem>
                  <SelectItem value="muerto">Muertos</SelectItem>
                  <SelectItem value="transferido">Transferidos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action bar de selección */}
          {seleccionados.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
              <span className="text-sm font-medium text-primary">
                <CheckSquare className="inline h-4 w-4 mr-1.5" />
                {seleccionados.length} animal{seleccionados.length !== 1 ? "es" : ""} seleccionado{seleccionados.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSeleccionados([])}>
                  Limpiar
                </Button>
                <Button size="sm" onClick={() => setModalAsignar(true)}>
                  <Layers className="h-4 w-4 mr-1.5" />
                  Asignar a Lote
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setModalEliminar(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Eliminar
                </Button>
              </div>
            </div>
          )}

          {/* Tabla */}
          <div className="rounded-md border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={todosSeleccionados}
                      onChange={toggleTodos}
                      className="rounded border-muted-foreground/30 cursor-pointer"
                      title="Seleccionar todos"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Caravana SNIG</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Sexo / Raza</th>
                  <th className="px-4 py-3 font-medium">Ubicación</th>
                  <th className="px-4 py-3 font-medium">Lote</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cargando ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      Cargando animales...
                    </td>
                  </tr>
                ) : animalesMostrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No se encontraron animales.
                    </td>
                  </tr>
                ) : (
                  animalesMostrados.map(animal => (
                    <tr
                      key={animal.id}
                      className={cn(
                        "hover:bg-muted/50 transition-colors",
                        seleccionados.includes(animal.id) && "bg-primary/5"
                      )}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={seleccionados.includes(animal.id)}
                          onChange={() => toggleAnimal(animal.id)}
                          className="rounded border-muted-foreground/30 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-primary">{animal.caravana_snig}</div>
                        {animal.caravana_propia && (
                          <div className="text-xs text-muted-foreground">Propia: {animal.caravana_propia}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">{animal.categoria}</td>
                      <td className="px-4 py-3">
                        <div>{animal.sexo}</div>
                        {animal.raza && <div className="text-xs text-muted-foreground">{animal.raza}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {animal.parcela ? (
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                            {animal.parcela.nombre} (P)
                          </span>
                        ) : animal.potrero ? (
                          <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                            {animal.potrero.nombre}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Sin ubicar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {animal.lote ? (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            {animal.lote.nombre}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            animal.estado === "activo"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          )}
                        >
                          {animal.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/animales/${animal.id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          Ver Ficha
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <AsignarLoteModal
            open={modalAsignar}
            onOpenChange={setModalAsignar}
            animalesIds={seleccionados}
            establecimientoId={establecimientoId}
            onSuccess={() => { cargar(); setSeleccionados([]) }}
          />

          <Dialog open={modalEliminar} onOpenChange={setModalEliminar}>
            <DialogContent className="sm:max-w-[440px]">
              <DialogHeader>
                <DialogTitle>¿Eliminar animales?</DialogTitle>
                <DialogDescription>
                  Esta acción es permanente e irreversible. Se eliminarán{' '}
                  <strong>{seleccionados.length} animal{seleccionados.length !== 1 ? 'es' : ''}</strong>{' '}
                  de la base de datos.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setModalEliminar(false)}
                  disabled={eliminando}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={eliminarSeleccionados}
                  disabled={eliminando}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  {eliminando ? 'Eliminando...' : `Eliminar ${seleccionados.length} animal${seleccionados.length !== 1 ? 'es' : ''}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* ── Tab: Lotes ─────────────────────────────────────────────────── */}
      {tab === "lotes" && <LotesSection />}
    </div>
  )
}
