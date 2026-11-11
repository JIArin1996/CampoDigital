"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, FileSpreadsheet, Plus, Printer, SlidersHorizontal, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import { getMedidasPropias, getTablero, guardarTablero } from "@/lib/queries/tablero"
import { getCategorias, getEspecies, getLotes } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Cargando } from "@/components/shared/Cargando"
import { Button } from "@/components/ui/button"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { nuevoId } from "@/components/actividades/formato"
import { TARJETAS_LISTAS, plantilla, registrarPropias } from "@/components/tablero/catalogo"
import { etiquetaComparada, opcionesPeriodo, periodoPorDefecto, rangoDe } from "@/components/tablero/periodos"
import { Grilla } from "@/components/tablero/Grilla"
import { Tarjeta, type DatosTarjeta } from "@/components/tablero/Tarjeta"
import { exportarExcel } from "@/components/tablero/exportar"
import { Constructor } from "@/components/tablero/Constructor"
import { Confirmar, type Pregunta } from "@/components/tablero/Confirmar"
import { VISTAS, configDe, tituloSugerido, verComo, type Vista } from "@/components/tablero/vistas"
import { cn } from "@/lib/utils"
import type { CategoriaAnimal, Especie } from "@/types/lotes"
import type { FiltroCruzado, FiltrosIds, FiltrosTablero, MedidaPropia, PaginaTablero, TarjetaTablero } from "@/types/tablero"

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
  propias: MedidaPropia[]               // medidas propias (A op B), ya registradas en el catálogo
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
 * filtros generales (período, especie, categoría y lote, que quedan en la URL) y el filtrado cruzado (tocar una
 * barra, porción o fila de una tarjeta abierta por especie, categoría o lote filtra las demás). Solo el
 * Administrador lo edita, y solo en la computadora: mover, cambiar el tamaño, sacar, agregar y armar tarjetas con
 * el constructor, y crear, renombrar, ordenar y borrar páginas. Mientras el establecimiento no guardó su tablero,
 * se ve la plantilla "Resumen".
 */
// Ancho útil de una hoja A4 apaisada con 10 mm de margen (277 mm a 96 px por pulgada)
const ANCHO_HOJA = 1040

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
    // Por defecto se compara con el ejercicio anterior (catálogo, sección 4); "comparar=0" en la URL lo apaga
    comparar: params.get("comparar") !== "0",
  })
  // Lo que muestra cada tarjeta (para el Excel)
  const datosTarjetas = useRef(new Map<string, DatosTarjeta>())
  const [exportando, setExportando] = useState(false)
  // PDF: se arma la vista de impresión (hoja apaisada), se espera a que los gráficos se dibujen y se abre la impresión
  const [imprimiendo, setImprimiendo] = useState(false)
  const tituloAnterior = useRef<string | null>(null)
  useEffect(() => {
    if (!imprimiendo) return
    const fin = () => setImprimiendo(false)
    window.addEventListener("afterprint", fin)
    const espera = window.setTimeout(() => window.print(), 1000)
    return () => {
      window.clearTimeout(espera)
      window.removeEventListener("afterprint", fin)
      if (tituloAnterior.current !== null) { document.title = tituloAnterior.current; tituloAnterior.current = null }
    }
  }, [imprimiendo])
  const [borrador, setBorrador] = useState<PaginaTablero[] | null>(null)   // en edición
  const [guardando, setGuardando] = useState(false)
  const [panelFiltros, setPanelFiltros] = useState(false)
  const [cruzado, setCruzado] = useState<FiltroCruzado | null>(null)
  // Constructor abierto: tarjeta a editar, o null para una nueva
  const [constructor, setConstructor] = useState<{ tarjeta: TarjetaTablero | null } | null>(null)
  const [pregunta, setPregunta] = useState<Pregunta | null>(null)   // confirmación antes de borrar o reemplazar páginas

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([getTablero(estId), getEspecies(estId), getCategorias(estId), getLotes(estId, "activo"), getMedidasPropias(estId)])
      .then(([guardado, especies, categorias, lotes, propias]) => {
        if (!vigente) return
        registrarPropias(propias)
        setDatos({ estId, guardado, especies, categorias, lotes: lotes.map(l => ({ id: l.id, nombre: l.nombre })), propias })
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
    if (!filtros.comparar) q.set("comparar", "0")
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

  const generales: FiltrosIds = {
    especie_ids: filtros.especie ? [filtros.especie] : undefined,
    categoria_ids: filtros.categoria ? [filtros.categoria] : undefined,
    lote_ids: filtros.lote ? [filtros.lote] : undefined,
  }
  const nombres = {
    especie: new Map(listos.especies.map(e => [e.id, e.nombre])),
    categoria: new Map(listos.categorias.map(c => [c.id, c.nombre])),
    lote: new Map(listos.lotes.map(l => [l.id, l.nombre])),
  }
  const nombre = (dim: "especie" | "categoria" | "lote", id: string) => nombres[dim].get(id) ?? "—"
  // Tocar lo mismo otra vez lo saca; otra cosa de la misma dimensión lo reemplaza
  const elegir = (origen: string) => (c: Omit<FiltroCruzado, "origen">) =>
    setCruzado(x => (x && x.dimension === c.dimension && x.clave === c.clave ? null : { ...c, origen }))
  const chipCruzado = cruzado && (
    <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent pl-3 pr-1 text-sm font-semibold text-accent-foreground">
      Filtrado por {cruzado.dimension === "categoria" ? "categoría" : cruzado.dimension}: {cruzado.etiqueta}
      <button type="button" aria-label={`Sacar el filtro ${cruzado.etiqueta}`} onClick={() => setCruzado(null)}
        className="rounded-full p-1 hover:bg-background/60"><X className="h-4 w-4" /></button>
    </span>
  )

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
    const pagina = idx
    const n = actual.tarjetas.length
    setPregunta({
      titulo: `¿Borrar la página "${actual.nombre}"?`,
      texto: `Se van ${n === 1 ? "su tarjeta" : `sus ${n} tarjetas`}. Hasta que guardes el tablero, Descartar la recupera.`,
      boton: "Borrar página",
      accion: () => {
        setBorrador(b => b && b.filter((_, i) => i !== pagina))
        setPagina(Math.max(0, pagina - 1))
      },
    })
  }
  const guardar = async () => {
    if (!borrador) return
    // Lleva a la página sin nombre (las otras pestañas no muestran el campo para escribirlo)
    const sinNombre = borrador.findIndex(p => !p.nombre.trim())
    if (sinNombre >= 0) {
      setPagina(sinNombre)
      return toast.error(`La página ${sinNombre + 1} no tiene nombre: escribile uno en la pestaña`)
    }
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

  // Después de crear, cambiar o borrar una medida propia en el constructor
  const recargarPropias = async () => {
    const propias = await getMedidasPropias(listos.estId)
    registrarPropias(propias)
    setDatos(d => (d && d.estId === listos.estId ? { ...d, propias } : d))
  }
  // Las tarjetas que usan un indicador calculado (en el tablero que se edita o en el guardado): mientras haya, no se borra
  const tarjetasQueUsan = (id: string) => {
    const usan = (ps: PaginaTablero[]) => ps.flatMap(p => p.tarjetas
      .filter(t => t.definicion.fuente === "combinada" && t.definicion.medidas.includes(id))
      .map(t => `"${t.titulo}" (página ${p.nombre})`))
    const enEdicion = usan(paginas)
    const guardadas = usan(listos.guardado ?? []).filter(t => !enEdicion.includes(t)).map(t => `${t}, en el tablero guardado`)
    return [...enEdicion, ...guardadas]
  }

  // Menú rápido de la tarjeta. Los cambios van a la página donde se hicieron (aunque después se cambie de página).
  const reemplazarEn = (pagina: number, id: string, t: TarjetaTablero) =>
    setBorrador(b => b && b.map((p, i) => (i === pagina ? { ...p, tarjetas: p.tarjetas.map(x => (x.id === id ? t : x)) } : p)))
  // Ver como: las mismas reglas que el constructor; el título automático acompaña; siempre con Deshacer
  const verComoTarjeta = (t: TarjetaTablero, v: Vista) => {
    const r = verComo(t.definicion, v)
    const auto = t.titulo === tituloSugerido(configDe(t.definicion))
    const cambioDeTipo = (t.definicion.grafico === "numero") !== (r.definicion.grafico === "numero")
    const nueva: TarjetaTablero = {
      ...t, definicion: r.definicion, titulo: auto ? tituloSugerido(configDe(r.definicion)) : t.titulo,
      ...(cambioDeTipo ? (r.definicion.grafico === "numero" ? { w: 3, h: 3 } : { w: 6, h: 7 }) : {}),
    }
    const pagina = idx
    reemplazarEn(pagina, t.id, nueva)
    toast(`"${t.titulo}" ahora se ve como ${VISTAS[v].nombre}.`, {
      description: r.aviso ?? undefined, duration: 8000,
      action: { label: "Deshacer", onClick: () => reemplazarEn(pagina, t.id, t) },
    })
  }
  const duplicarTarjeta = (t: TarjetaTablero) => {
    const abajo = actual.tarjetas.reduce((m, x) => Math.max(m, x.y + x.h), 0)
    cambiarPagina(p => ({ ...p, tarjetas: [...p.tarjetas, { ...t, id: nuevoId(), titulo: `${t.titulo} (copia)`, x: 0, y: abajo }] }))
    toast.success("Tarjeta duplicada: quedó al final de la página")
  }

  const aceptarTarjeta = (t: TarjetaTablero) => {
    const existe = actual.tarjetas.some(x => x.id === t.id)
    const abajo = actual.tarjetas.reduce((m, x) => Math.max(m, x.y + x.h), 0)
    cambiarPagina(p => ({
      ...p,
      tarjetas: existe ? p.tarjetas.map(x => (x.id === t.id ? t : x)) : [...p.tarjetas, { ...t, x: 0, y: abajo }],
    }))
    setConstructor(null)
  }

  const categoriasVisibles = listos.categorias.filter(c => c.activo && (!filtros.especie || c.especie_id === filtros.especie))
  const nombreEspecie = nombres.especie
  const cantidadFiltros = [filtros.especie, filtros.categoria, filtros.lote].filter(Boolean).length + (cruzado ? 1 : 0) + (filtros.comparar ? 1 : 0)
  const comparadoCon = filtros.comparar ? etiquetaComparada(filtros.periodo) : null
  const etiquetaPeriodo = opcionesPeriodo().find(o => o.clave === filtros.periodo)?.etiqueta ?? ""
  // Los filtros en palabras (impresión y Excel)
  const filtrosEnTexto: [string, string][] = [
    ["Establecimiento", establecimientoActivo.nombre],
    ["Página", actual.nombre],
    ["Período", `${etiquetaPeriodo} (${rango.desde} a ${rango.hasta})`],
    ["Especie", filtros.especie ? nombres.especie.get(filtros.especie) ?? "" : "Todas"],
    ["Categoría", filtros.categoria ? nombres.categoria.get(filtros.categoria) ?? "" : "Todas"],
    ["Lote", filtros.lote ? nombres.lote.get(filtros.lote) ?? "" : "Todos"],
    ...(cruzado ? [[`Filtrado por ${cruzado.dimension === "categoria" ? "categoría" : cruzado.dimension}`, cruzado.etiqueta] as [string, string]] : []),
    ...(comparadoCon ? [["Comparado con", `${comparadoCon} (mismas fechas)`] as [string, string]] : []),
    ["Exportado", new Date().toLocaleString("es-UY")],
  ]
  const nombreArchivo = `Indicadores ${establecimientoActivo.nombre} - ${actual.nombre} - ${etiquetaPeriodo}`.replace(/[\\/:*?"<>|]/g, "-")
  const imprimir = () => {
    // El nombre que propone el navegador al guardar el PDF es el título de la pestaña
    tituloAnterior.current = document.title
    document.title = nombreArchivo
    setImprimiendo(true)
  }
  const emitido = new Date().toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" })
  const texto = (s: string) => JSON.stringify(s)
  const pie = "font-family: Arial, sans-serif; font-size: 8pt; color: #64748b"
  // La hoja: A4 apaisada; arriba (desde la 2.ª hoja) el informe y el establecimiento, abajo la app, la fecha y el
  // número de hoja, cada uno con su línea
  const estiloHoja = `
@page {
  size: A4 landscape;
  margin: 14mm 10mm 13mm;
  @top-left { content: ${texto(`Indicadores · ${actual.nombre}`)}; ${pie}; vertical-align: bottom; padding-bottom: 2mm; border-bottom: 0.5pt solid #94a3b8 }
  @top-center { content: ""; vertical-align: bottom; border-bottom: 0.5pt solid #94a3b8 }
  @top-right { content: ${texto(establecimientoActivo.nombre)}; ${pie}; vertical-align: bottom; padding-bottom: 2mm; border-bottom: 0.5pt solid #94a3b8 }
  @bottom-left { content: ${texto(`Campo Digital · emitido el ${emitido}`)}; ${pie}; vertical-align: top; padding-top: 2mm; border-top: 0.5pt solid #94a3b8 }
  @bottom-center { content: ${texto(`${etiquetaPeriodo}${comparadoCon ? ` · vs ${comparadoCon}` : ""}`)}; ${pie}; vertical-align: top; padding-top: 2mm; border-top: 0.5pt solid #94a3b8 }
  @bottom-right { content: "Hoja " counter(page) " de " counter(pages); ${pie}; vertical-align: top; padding-top: 2mm; border-top: 0.5pt solid #94a3b8 }
}
@page :first {
  @top-left { content: none; border: none }
  @top-center { content: none; border: none }
  @top-right { content: none; border: none }
}
@media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact } }`
  const aExcel = async () => {
    setExportando(true)
    try {
      await exportarExcel(`${nombreArchivo}.xlsx`, filtrosEnTexto, actual.tarjetas, datosTarjetas.current)
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo armar el Excel"))
    } finally {
      setExportando(false)
    }
  }
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
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Comparar con
        <select className={SELECT_NATIVO} value={filtros.comparar ? "1" : ""}
          onChange={e => setFiltros(f => ({ ...f, comparar: e.target.value === "1" }))}>
          <option value="">Nada</option>
          <option value="1">{etiquetaComparada(filtros.periodo)} (mismas fechas)</option>
        </select>
      </label>
    </>
  )

  return (
    <PageContainer ancho>
      <style>{estiloHoja}</style>
      {/* Al imprimir, la primera hoja empieza con el encabezado del informe */}
      <header className="mb-4 hidden break-inside-avoid print:block">
        <div className="flex items-center justify-between gap-4 border-b-2 border-primary pb-3">
          <div className="flex items-center gap-3">
            <Image src="/logo-campo-digital.png" alt="Campo Digital" width={1024} height={1024} className="h-16 w-16" />
            <div>
              <p className="text-2xl font-bold leading-tight">Informe de indicadores</p>
              <p className="text-base text-muted-foreground">{establecimientoActivo.nombre} · {actual.nombre}</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{etiquetaPeriodo}</p>
            <p className="text-muted-foreground">{rango.desde.split("-").reverse().join("/")} al {rango.hasta.split("-").reverse().join("/")}</p>
            <p className="text-muted-foreground">Emitido el {emitido}</p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-4 gap-x-6 gap-y-1 rounded-md border bg-muted/40 px-4 py-2 text-xs">
          {filtrosEnTexto.filter(([k]) => !["Establecimiento", "Página", "Período", "Exportado"].includes(k)).map(([k, v]) => (
            <div key={k} className="flex gap-1.5"><dt className="text-muted-foreground">{k}:</dt><dd className="font-medium">{v}</dd></div>
          ))}
        </dl>
      </header>
      {imprimiendo && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/90 print:hidden">
          <p className="text-sm font-medium">Preparando el PDF…</p>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">{editando ? `Editando · ${actual.nombre}` : "Indicadores"}</h1>
          <p className="text-sm text-muted-foreground">
            {editando
              ? "Arrastrá las tarjetas desde la manija y cambiá el tamaño desde la esquina de abajo a la derecha."
              : listos.guardado ? establecimientoActivo.nombre : `${establecimientoActivo.nombre} · tablero de ejemplo (todavía no se guardó uno propio)`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {esAdmin && grande && editando && (
            <>
              <Button onClick={() => setConstructor({ tarjeta: null })}><Plus className="mr-1 h-4 w-4" /> Nueva tarjeta</Button>
              <select aria-label="Agregar una tarjeta lista" className={cn(SELECT_NATIVO, "w-auto")} value=""
                onChange={e => { if (e.target.value !== "") agregarTarjeta(Number(e.target.value)) }}>
                <option value="">Agregar una tarjeta lista…</option>
                {TARJETAS_LISTAS.map((t, i) => <option key={t.titulo} value={i}>{t.titulo}</option>)}
              </select>
              <Button variant="outline" onClick={() => setPregunta({
                titulo: "¿Volver al tablero de ejemplo?",
                texto: "Se reemplazan todas las páginas y tarjetas por las del ejemplo. Hasta que guardes el tablero, Descartar vuelve a las tuyas.",
                boton: "Volver al ejemplo",
                accion: () => { setBorrador(plantilla()); setPagina(0) },
              })}>
                Volver al ejemplo
              </Button>
              <Button variant="outline" disabled={guardando} onClick={() => { setBorrador(null); setConstructor(null) }}>Descartar</Button>
              <Button disabled={guardando} onClick={() => void guardar()}>{guardando ? "Guardando..." : "Guardar tablero"}</Button>
            </>
        )}
        {!editando && (
          <>
            <Button variant="outline" className="h-11 lg:h-9" disabled={imprimiendo} onClick={imprimir} title="Imprimir o guardar como PDF">
              <Printer className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" className="h-11 lg:h-9" disabled={exportando} onClick={() => void aExcel()} title="Bajar los datos de esta página">
              <FileSpreadsheet className="mr-1 h-4 w-4" /> {exportando ? "Armando..." : "Excel"}
            </Button>
          </>
        )}
        {esAdmin && grande && !editando && (
          <Button onClick={() => setBorrador(structuredClone(paginas))}>Editar tablero</Button>
        )}
        {!grande && (
          <Button variant="outline" className="h-11" onClick={() => setPanelFiltros(true)}>
            <SlidersHorizontal className="mr-1 h-4 w-4" /> Filtros{cantidadFiltros > 0 ? ` · ${cantidadFiltros}` : ""}
          </Button>
        )}
        </div>
      </div>

      {/* Páginas */}
      <div role="tablist" aria-label="Páginas del tablero"
        className={cn("mb-4 flex gap-1 overflow-x-auto print:hidden", grande ? "border-b" : "-mx-4 px-4 pb-1")}>
        {paginas.map((p, i) => (
          editando && i === idx ? (
            <div key={p.id} className="flex shrink-0 items-center gap-1 border-b-2 border-primary px-1 pb-1">
              <input aria-label="Nombre de la página" value={p.nombre} maxLength={40} placeholder="Nombre de la página"
                aria-invalid={!p.nombre.trim()}
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
              {p.nombre.trim() || <span className="italic text-destructive">Sin nombre</span>}
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
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-card px-3 py-2.5 print:hidden">
          {selects}
          {chipCruzado && <div className="ml-auto self-center">{chipCruzado}</div>}
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground print:hidden">
          {etiquetaPeriodo}{comparadoCon && ` · vs ${comparadoCon}`}
          {filtros.especie && ` · ${nombreEspecie.get(filtros.especie) ?? ""}`}
          {filtros.categoria && ` · ${listos.categorias.find(c => c.id === filtros.categoria)?.nombre ?? ""}`}
          {filtros.lote && ` · ${listos.lotes.find(l => l.id === filtros.lote)?.nombre ?? ""}`}
          {cruzado && <span className="mt-2 flex">{chipCruzado}</span>}
        </p>
      )}

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {actual.tarjetas.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {editando ? "Página vacía: armá una con “Nueva tarjeta” o agregá una lista." : "Esta página no tiene tarjetas."}
            </div>
          ) : (
            <Grilla tarjetas={actual.tarjetas} grande={grande} edicion={editando} onMover={mover} impresion={imprimiendo ? ANCHO_HOJA : undefined}
              render={t => (
                <Tarjeta tarjeta={t} estId={listos.estId} rango={rango} generales={generales} cruzado={cruzado} nombre={nombre}
                  comparar={comparadoCon} onDatos={(id, d) => { datosTarjetas.current.set(id, d) }} impresion={imprimiendo}
                  edicion={editando} onElegir={elegir(t.id)} onEditar={() => setConstructor({ tarjeta: t })}
                  onDuplicar={() => duplicarTarjeta(t)} onVerComo={v => verComoTarjeta(t, v)}
                  onQuitar={() => cambiarPagina(p => ({ ...p, tarjetas: p.tarjetas.filter(x => x.id !== t.id) }))} />
              )} />
          )}
        </div>
        <Confirmar pregunta={pregunta} onCerrar={() => setPregunta(null)} />
        {editando && constructor && (
          <Constructor key={constructor.tarjeta?.id ?? "nueva"} inicial={constructor.tarjeta} estId={listos.estId} rango={rango}
            etiquetaPeriodo={etiquetaPeriodo} generales={generales}
            especies={listos.especies} categorias={listos.categorias} lotes={listos.lotes} nombre={nombre}
            propias={listos.propias} onPropiasCambiaron={recargarPropias} tarjetasQueUsan={tarjetasQueUsan}
            onAceptar={aceptarTarjeta} onCancelar={() => setConstructor(null)} />
        )}
      </div>

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
            {chipCruzado && <div>{chipCruzado}</div>}
            <div className="mt-1 flex gap-2">
              <Button variant="outline" className="h-12 flex-1"
                onClick={() => { setFiltros(f => ({ ...f, especie: "", categoria: "", lote: "" })); setCruzado(null) }}>Limpiar</Button>
              <Button className="h-12 flex-[2]" onClick={() => setPanelFiltros(false)}>Ver resultados</Button>
            </div>
          </section>
        </div>
      )}
    </PageContainer>
  )
}
