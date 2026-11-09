"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getTablero, guardarTablero } from "@/lib/queries/tablero"
import { getCategorias, getEspecies, getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Cargando } from "@/components/shared/Cargando"
import { Button } from "@/components/ui/button"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { nuevoId } from "@/components/actividades/formato"
import { TARJETAS_LISTAS, plantilla } from "@/components/tablero/catalogo"
import { opcionesPeriodo, periodoPorDefecto, rangoDe } from "@/components/tablero/periodos"
import { Grilla } from "@/components/tablero/Grilla"
import { Tarjeta, type FiltrosAplicados } from "@/components/tablero/Tarjeta"
import { cn } from "@/lib/utils"
import type { CategoriaAnimal, Especie } from "@/types/lotes"
import type { Dimension, FiltrosTablero, PaginaTablero } from "@/types/tablero"

export default function IndicadoresPage() {
  return (
    <Suspense fallback={<PageContainer><Cargando /></PageContainer>}>
      <Indicadores />
    </Suspense>
  )
}

interface Datos {
  estId: string
  guardado: PaginaTablero[] | null      // null: nunca se guardó, se muestra la plantilla
  especies: Especie[]
  categorias: CategoriaAnimal[]
  lotes: { id: string; nombre: string }[]
}

// Pantalla de computadora (≥ 1024 px): ahí se edita el tablero
function usePantallaGrande() {
  const [grande, setGrande] = useState(false)
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)")
    const actualizar = () => setGrande(m.matches)
    actualizar()
    m.addEventListener("change", actualizar)
    return () => m.removeEventListener("change", actualizar)
  }, [])
  return grande
}

/**
 * Indicadores: tablero del establecimiento con páginas (pestañas) y tarjetas en una grilla. Todos lo ven y usan los
 * filtros generales (período, especie, categoría y lote, que quedan en la URL); solo el Administrador lo edita, y
 * solo en la computadora: mover, cambiar el tamaño, sacar y agregar tarjetas, y crear, renombrar, ordenar y borrar
 * páginas. Mientras el establecimiento no guardó su tablero, se ve la plantilla "Resumen".
 */
function Indicadores() {
  const params = useSearchParams()
  const { establecimientoActivo, esAdmin, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id
  const grande = usePantallaGrande()

  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [pagina, setPagina] = useState(Number(params.get("p") ?? 0) || 0)
  const [filtros, setFiltros] = useState<FiltrosTablero>({
    periodo: rangoDe(params.get("periodo") ?? "") ? params.get("periodo")! : periodoPorDefecto(),
    especie: params.get("especie") ?? "",
    categoria: params.get("categoria") ?? "",
    lote: params.get("lote") ?? "",
  })
  const [borrador, setBorrador] = useState<PaginaTablero[] | null>(null)   // en edición
  const [guardando, setGuardando] = useState(false)
  const [panelFiltros, setPanelFiltros] = useState(false)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([getTablero(estId), getEspecies(estId), getCategorias(estId), getLotes(estId, "activo")])
      .then(([guardado, especies, categorias, lotes]) => {
        if (vigente) setDatos({ estId, guardado, especies, categorias, lotes: lotes.map(l => ({ id: l.id, nombre: l.nombre })) })
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudo cargar el tablero")) })
    return () => { vigente = false }
  }, [estId, recarga])

  // Los filtros y la página quedan en la URL (para volver o compartir)
  useEffect(() => {
    const q = new URLSearchParams()
    if (pagina) q.set("p", String(pagina))
    q.set("periodo", filtros.periodo)
    if (filtros.especie) q.set("especie", filtros.especie)
    if (filtros.categoria) q.set("categoria", filtros.categoria)
    if (filtros.lote) q.set("lote", filtros.lote)
    window.history.replaceState(null, "", `?${q.toString()}`)
  }, [pagina, filtros])

  if (cargando || (estId && !datos && !error)) return <PageContainer><Cargando /></PageContainer>
  if (!establecimientoActivo) {
    return <PageContainer><p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  }
  if (error) return <PageContainer><p role="alert" className="text-sm text-destructive">{error}</p></PageContainer>
  const listos = datos && datos.estId === estId ? datos : null
  if (!listos) return <PageContainer><Cargando /></PageContainer>

  const editando = borrador !== null && grande
  const paginas = (editando ? borrador : null) ?? listos.guardado ?? plantilla()
  const idx = Math.min(pagina, paginas.length - 1)
  const actual = paginas[idx]
  const rango = rangoDe(filtros.periodo)!

  const aplicados: FiltrosAplicados = {
    especie_ids: filtros.especie ? [filtros.especie] : undefined,
    categoria_ids: filtros.categoria ? [filtros.categoria] : undefined,
    lote_ids: filtros.lote ? [filtros.lote] : undefined,
  }
  const activos: Dimension[] = [
    ...(filtros.especie ? ["especie" as const] : []),
    ...(filtros.categoria ? ["categoria" as const] : []),
    ...(filtros.lote ? ["lote" as const] : []),
  ]

  // ── Edición ────────────────────────────────────────────────────────────────
  const cambiarPagina = (cambio: (p: PaginaTablero) => PaginaTablero) =>
    setBorrador(b => b && b.map((p, i) => (i === idx ? cambio(p) : p)))
  const mover = (cambios: Map<string, { x: number; y: number; w: number; h: number }>) => {
    const distinto = actual.tarjetas.some(t => {
      const c = cambios.get(t.id)
      return c && (c.x !== t.x || c.y !== t.y || c.w !== t.w || c.h !== t.h)
    })
    if (distinto) cambiarPagina(p => ({ ...p, tarjetas: p.tarjetas.map(t => ({ ...t, ...(cambios.get(t.id) ?? {}) })) }))
  }
  const agregarTarjeta = (i: number) => {
    const lista = TARJETAS_LISTAS[i]
    const abajo = actual.tarjetas.reduce((m, t) => Math.max(m, t.y + t.h), 0)
    cambiarPagina(p => ({ ...p, tarjetas: [...p.tarjetas, { ...lista, id: nuevoId(), x: 0, y: abajo }] }))
  }
  const agregarPagina = () => {
    setBorrador(b => b && [...b, { id: nuevoId(), nombre: `Página ${b.length + 1}`, tarjetas: [] }])
    setPagina(paginas.length)
  }
  const correrPagina = (d: -1 | 1) => {
    const j = idx + d
    if (j < 0 || j >= paginas.length) return
    setBorrador(b => {
      if (!b) return b
      const c = [...b]
      ;[c[idx], c[j]] = [c[j], c[idx]]
      return c
    })
    setPagina(j)
  }
  const borrarPagina = () => {
    if (paginas.length === 1) return toast.error("El tablero necesita al menos una página")
    if (!window.confirm(`¿Borrar la página "${actual.nombre}" con sus tarjetas?`)) return
    setBorrador(b => b && b.filter((_, i) => i !== idx))
    setPagina(Math.max(0, idx - 1))
  }
  const guardar = async () => {
    if (!borrador) return
    if (borrador.some(p => !p.nombre.trim())) return toast.error("Cada página necesita un nombre")
    setGuardando(true)
    try {
      await guardarTablero(listos.estId, borrador.map(p => ({ ...p, nombre: p.nombre.trim() })))
      toast.success("Tablero guardado")
      setBorrador(null)
      setRecarga(r => r + 1)
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo guardar el tablero"))
    } finally {
      setGuardando(false)
    }
  }

  const categoriasVisibles = listos.categorias.filter(c => c.activo && (!filtros.especie || c.especie_id === filtros.especie))
  const nombreEspecie = new Map(listos.especies.map(e => [e.id, e.nombre]))
  const cantidadFiltros = activos.length
  const selects = (
    <>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Período
        <select className={cn(SELECT_NATIVO, "min-w-44")} value={filtros.periodo}
          onChange={e => setFiltros(f => ({ ...f, periodo: e.target.value }))}>
          {opcionesPeriodo().map(o => <option key={o.clave} value={o.clave}>{o.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Especie
        <select className={SELECT_NATIVO} value={filtros.especie}
          onChange={e => setFiltros(f => ({ ...f, especie: e.target.value, categoria: "" }))}>
          <option value="">Todas</option>
          {listos.especies.filter(e => e.activo).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Categoría
        <select className={SELECT_NATIVO} value={filtros.categoria}
          onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value }))}>
          <option value="">Todas</option>
          {categoriasVisibles.map(c => (
            <option key={c.id} value={c.id}>{filtros.especie ? c.nombre : `${nombreEspecie.get(c.especie_id) ?? ""} · ${c.nombre}`}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Lote
        <select className={SELECT_NATIVO} value={filtros.lote} onChange={e => setFiltros(f => ({ ...f, lote: e.target.value }))}>
          <option value="">Todos</option>
          {listos.lotes.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
      </label>
    </>
  )

  return (
    <PageContainer ancho>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{editando ? `Editando · ${actual.nombre}` : "Indicadores"}</h1>
          <p className="text-sm text-muted-foreground">
            {editando
              ? "Arrastrá las tarjetas desde la manija y cambiá el tamaño desde la esquina de abajo a la derecha."
              : listos.guardado ? establecimientoActivo.nombre : `${establecimientoActivo.nombre} · tablero de ejemplo (todavía no se guardó uno propio)`}
          </p>
        </div>
        {esAdmin && grande && (
          editando ? (
            <div className="flex flex-wrap gap-2">
              <select aria-label="Agregar tarjeta" className={cn(SELECT_NATIVO, "w-auto")} value=""
                onChange={e => { if (e.target.value !== "") agregarTarjeta(Number(e.target.value)) }}>
                <option value="">+ Agregar tarjeta…</option>
                {TARJETAS_LISTAS.map((t, i) => <option key={t.titulo} value={i}>{t.titulo}</option>)}
              </select>
              <Button variant="outline" onClick={() => { if (window.confirm("¿Volver al tablero de ejemplo? Se reemplazan todas las páginas.")) { setBorrador(plantilla()); setPagina(0) } }}>
                Volver al ejemplo
              </Button>
              <Button variant="outline" disabled={guardando} onClick={() => setBorrador(null)}>Descartar</Button>
              <Button disabled={guardando} onClick={() => void guardar()}>{guardando ? "Guardando..." : "Guardar tablero"}</Button>
            </div>
          ) : (
            <Button onClick={() => setBorrador(structuredClone(paginas))}>Editar tablero</Button>
          )
        )}
        {!grande && (
          <Button variant="outline" className="h-11" onClick={() => setPanelFiltros(true)}>
            <SlidersHorizontal className="mr-1 h-4 w-4" /> Filtros{cantidadFiltros > 0 ? ` · ${cantidadFiltros}` : ""}
          </Button>
        )}
      </div>

      {/* Páginas */}
      <div role="tablist" aria-label="Páginas del tablero"
        className={cn("mb-4 flex gap-1 overflow-x-auto", grande ? "border-b" : "-mx-4 px-4 pb-1")}>
        {paginas.map((p, i) => (
          editando && i === idx ? (
            <div key={p.id} className="flex shrink-0 items-center gap-1 border-b-2 border-primary px-1 pb-1">
              <input aria-label="Nombre de la página" value={p.nombre} maxLength={40}
                onChange={e => cambiarPagina(x => ({ ...x, nombre: e.target.value }))}
                className="h-8 w-40 rounded-md border px-2 text-sm font-semibold" />
              <button type="button" aria-label="Mover a la izquierda" disabled={idx === 0} onClick={() => correrPagina(-1)}
                className="rounded p-1 hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" aria-label="Mover a la derecha" disabled={idx === paginas.length - 1} onClick={() => correrPagina(1)}
                className="rounded p-1 hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              <button type="button" aria-label="Borrar la página" onClick={borrarPagina}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : (
            <button key={p.id} type="button" role="tab" aria-selected={i === idx} onClick={() => setPagina(i)}
              className={cn("shrink-0 text-sm transition-colors",
                grande
                  ? cn("border-b-2 px-4 py-2.5", i === idx ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground")
                  : cn("min-h-10 rounded-full px-4", i === idx ? "bg-primary font-semibold text-primary-foreground" : "border bg-card"))}>
              {p.nombre}
            </button>
          )
        ))}
        {editando && (
          <button type="button" onClick={agregarPagina} className="flex shrink-0 items-center gap-1 px-3 py-2 text-sm text-primary hover:underline">
            <Plus className="h-4 w-4" /> Página
          </button>
        )}
      </div>

      {/* Filtros generales: barra en la computadora; en el celular, un resumen y el panel de abajo */}
      {grande ? (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-card px-3 py-2.5">{selects}</div>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          {opcionesPeriodo().find(o => o.clave === filtros.periodo)?.etiqueta}
          {filtros.especie && ` · ${nombreEspecie.get(filtros.especie) ?? ""}`}
          {filtros.categoria && ` · ${listos.categorias.find(c => c.id === filtros.categoria)?.nombre ?? ""}`}
          {filtros.lote && ` · ${listos.lotes.find(l => l.id === filtros.lote)?.nombre ?? ""}`}
        </p>
      )}

      {actual.tarjetas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {editando ? "Página vacía: agregá tarjetas con “+ Agregar tarjeta”." : "Esta página no tiene tarjetas."}
        </div>
      ) : (
        <Grilla tarjetas={actual.tarjetas} grande={grande} edicion={editando} onMover={mover}
          render={t => (
            <Tarjeta tarjeta={t} estId={listos.estId} rango={rango} filtros={aplicados} activos={activos} edicion={editando}
              onQuitar={() => cambiarPagina(p => ({ ...p, tarjetas: p.tarjetas.filter(x => x.id !== t.id) }))} />
          )} />
      )}

      {/* Celular: filtros en un panel desde abajo */}
      {!grande && panelFiltros && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Cerrar los filtros" className="absolute inset-0 bg-black/40" onClick={() => setPanelFiltros(false)} />
          <section role="dialog" aria-modal="true" aria-label="Filtros"
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-background px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Filtros</h2>
              <button type="button" aria-label="Cerrar" onClick={() => setPanelFiltros(false)} className="rounded-full p-2 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-3 [&_select]:h-11">{selects}</div>
            <div className="mt-1 flex gap-2">
              <Button variant="outline" className="h-12 flex-1"
                onClick={() => setFiltros(f => ({ ...f, especie: "", categoria: "", lote: "" }))}>Limpiar</Button>
              <Button className="h-12 flex-[2]" onClick={() => setPanelFiltros(false)}>Ver resultados</Button>
            </div>
          </section>
        </div>
      )}
    </PageContainer>
  )
}
