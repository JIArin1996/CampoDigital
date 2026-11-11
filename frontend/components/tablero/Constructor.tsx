"use client"

import { useState } from "react"
import { ChartColumn, ChartPie, ChevronRight, Hash, Info, ListOrdered, Map as IconoMapa, RotateCcw, Table2, TrendingUp, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { nuevoId } from "@/components/actividades/formato"
import {
  ADITIVAS, ETIQUETA_DIMENSION, FILTRAN, MEDIDAS, MIN_DIAS_POR_DEFECTO, NOMBRE_PERIODO, USAN_TRAMOS, abrirDe, comparacionDe, esFabrica, formula,
  medidaDe, propiaDe,
} from "@/components/tablero/catalogo"
import { BuscadorMedidas } from "@/components/tablero/BuscadorMedidas"
import { EditorMedida } from "@/components/tablero/EditorMedida"
import { Tarjeta } from "@/components/tablero/Tarjeta"
import {
  CONFIG_NUEVA, ORDEN_VISTAS, VISTAS, aplicarVista, cambiarMedida, cambiarPeriodo, cambiarSeparar, configDe, disponibilidad, graficosDe,
  vistaDe, type Ajuste, type Config, type Vista,
} from "@/components/tablero/vistas"
import { eliminarMedida } from "@/lib/queries/tablero"
import { mensajeDeError } from "@/lib/supabase/errores"
import type { Rango } from "@/components/tablero/periodos"
import { cn } from "@/lib/utils"
import type { CategoriaAnimal, Especie } from "@/types/lotes"
import type { DefinicionTarjeta, Dimension, FiltrosIds, Fuente, Grafico, MedidaPropia, TarjetaTablero, Tiempo } from "@/types/tablero"

const ICONO_VISTA: Record<Vista, LucideIcon> = {
  numero: Hash, evolucion: TrendingUp, comparar: ChartColumn, ranking: ListOrdered, composicion: ChartPie, mapa: IconoMapa, tabla: Table2,
}
const NOMBRE_GRAFICO: Record<Grafico, string> = {
  numero: "Número", barras: "Barras", barras_horizontales: "Ranking", barras_apiladas: "Barras apiladas", barras_linea: "Barras y línea",
  lineas: "Líneas", torta: "Torta", tabla: "Tabla", mapa: "Mapa",
}
const mayuscula = (s: string) => s[0].toUpperCase() + s.slice(1)

function tituloSugerido(c: Config) {
  const m = medidaDe(c.fuente, c.medida)?.etiqueta ?? c.medida
  const t = c.tiempo === "total" ? "" : ` ${NOMBRE_PERIODO[c.tiempo].toLowerCase()}`
  return `${m}${c.abrir ? ` por ${ETIQUETA_DIMENSION[c.abrir]}` : ""}${t}`
}

// Una subsección de "Más opciones": siempre visible; si no aplica, deshabilitada con la razón en texto
function Subseccion({ titulo, noAplica, children }: { titulo: string; noAplica?: string | null; children: React.ReactNode }) {
  return (
    <fieldset disabled={!!noAplica} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
      <legend className="text-sm font-semibold">{titulo}</legend>
      {noAplica && <p className="text-xs text-muted-foreground">{noAplica}</p>}
      <div className={cn(noAplica && "opacity-50")}>{children}</div>
    </fieldset>
  )
}

/**
 * Constructor de tarjetas (contexto/DISENO-CONSTRUCTOR-TARJETAS.md, versión A): un diálogo con la configuración a la
 * izquierda (¿qué querés ver?, ¿cómo lo querés ver?, separar por y período, más opciones plegadas) y la vista previa
 * grande a la derecha; título y botones en el pie. Las combinaciones salen de vistas.ts (siempre válidas para el
 * catálogo) y cada ajuste automático avisa con Deshacer.
 */
export function Constructor({ inicial, estId, rango, etiquetaPeriodo, generales, especies, categorias, lotes, nombre, propias, onPropiasCambiaron, propiaEnUso, onAceptar, onCancelar }: {
  inicial: TarjetaTablero | null               // null: tarjeta nueva
  estId: string
  rango: Rango
  etiquetaPeriodo: string                      // el período de arriba en palabras ("Ejercicio 2025/26")
  generales: FiltrosIds                        // los filtros de arriba (la vista previa los usa)
  especies: Especie[]
  categorias: CategoriaAnimal[]
  lotes: { id: string; nombre: string }[]
  nombre: (dim: "especie" | "categoria" | "lote", id: string) => string
  propias: MedidaPropia[]
  onPropiasCambiaron: () => Promise<void>       // vuelve a leerlas y las registra en el catálogo
  propiaEnUso: (id: string) => boolean          // la usa una tarjeta del tablero (guardado o en edición)
  onAceptar: (t: TarjetaTablero) => void
  onCancelar: () => void
}) {
  const d0 = inicial?.definicion
  const [config, setConfig] = useState<Config>(d0 ? configDe(d0) : CONFIG_NUEVA)
  const [aviso, setAviso] = useState<{ texto: string; anterior: Config; extras: string[] } | null>(null)
  const [extras, setExtras] = useState<string[]>(d0?.medidas.slice(1) ?? [])
  const [especie, setEspecie] = useState(d0?.filtros?.especie_ids?.[0] ?? "")
  const [categoria, setCategoria] = useState(d0?.filtros?.categoria_ids?.[0] ?? "")
  const [lote, setLote] = useState(d0?.filtros?.lote_ids?.[0] ?? "")
  const [periodo, setPeriodo] = useState(d0?.periodo && d0.periodo !== "tablero" ? String(d0.periodo.ejercicios) : "tablero")
  const [minDias, setMinDias] = useState(String(d0?.opciones?.min_dias ?? MIN_DIAS_POR_DEFECTO))
  // Título: automático mientras sea igual a la sugerencia; si lo cambian, aparece "Volver al título automático"
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "")
  const [tituloAuto, setTituloAuto] = useState(!inicial || inicial.titulo === tituloSugerido(configDe(inicial.definicion)))
  const [meta, setMeta] = useState(d0?.meta ? String(d0.meta.valor).replace(".", ",") : "")
  const [metaMejor, setMetaMejor] = useState<"sube" | "baja" | null>(d0?.meta?.mejor ?? null)
  const [acumuladas, setAcumuladas] = useState<string[]>(d0?.acumuladas ?? [])
  const [masOpciones, setMasOpciones] = useState(false)
  // Indicador calculado abierto encima: el que se cambia, o null para uno nuevo
  const [editorMedida, setEditorMedida] = useState<{ medida: MedidaPropia | null } | null>(null)

  const { fuente, medida, abrir, tiempo, grafico } = config
  const info = medidaDe(fuente, medida)
  const vista = vistaDe(config)
  const filtran = info?.filtran ?? FILTRAN[fuente] ?? []
  const opcionesSeparar: Dimension[] = abrirDe(fuente, medida)
  const tiempos = info?.tiempos ?? ["total"]
  const sugerido = tituloSugerido(config)
  const tituloFinal = tituloAuto ? sugerido : titulo

  // Series: otras medidas de la misma fuente y unidad que admitan el período (no cuando está separada en el tiempo:
  // ahí cada grupo ya es una serie)
  const extrasPosibles = abrir !== null && tiempo !== "total" || grafico === "torta" || grafico === "numero" || grafico === "mapa" ? []
    : Object.entries(MEDIDAS[fuente] ?? {})
      .filter(([m, x]) => m !== medida && x.unidad === info?.unidad && x.tiempos.includes(tiempo))
      .map(([m, x]) => ({ m, etiqueta: x.etiqueta }))
  const extrasValidos = extras.filter(e => extrasPosibles.some(x => x.m === e))
  const usaTramos = fuente === "pesadas" && [medida, ...extrasValidos].some(m => USAN_TRAMOS.includes(m))
  const conMeta = ["numero", "barras", "barras_horizontales", "barras_apiladas", "barras_linea", "lineas", "mapa"].includes(grafico)
  // "1.250,5" (con coma decimal, los puntos son de miles) o "2.5"
  const metaNum = Number(meta.includes(",") ? meta.trim().replace(/\./g, "").replace(",", ".") : meta.trim())
  const metaValida = meta.trim() === "" || Number.isFinite(metaNum)
  const mejorMedida = comparacionDe(fuente, medida)
  const metaMejorFinal = metaMejor ?? mejorMedida ?? "sube"
  const acumulables = tiempo === "total" || fuente === "combinada" ? [] : [medida, ...extrasValidos].filter(m => ADITIVAS.includes(m))
  const acumuladasValidas = acumuladas.filter(m => acumulables.includes(m))
  const minDiasNum = Number(minDias)
  const minDiasValido = Number.isInteger(minDiasNum) && minDiasNum >= 1 && minDiasNum <= 365

  // Todo cambio de qué medir, cómo verlo, separar o período pasa por vistas.ts: si ajustó algo más, avisa con Deshacer
  const aplicar = (r: Ajuste) => {
    setAviso(r.aviso ? { texto: r.aviso, anterior: config, extras } : null)
    if (r.config.fuente !== fuente || r.config.medida !== medida) {
      setExtras([])
      if (r.config.fuente !== fuente) setCategoria("")
    }
    setConfig(r.config)
  }
  const deshacer = () => {
    if (!aviso) return
    setConfig(aviso.anterior)
    setExtras(aviso.extras)
    setAviso(null)
  }
  const elegirMedida = (f: Fuente, m: string) => aplicar(cambiarMedida(config, f, m))

  const definicion: DefinicionTarjeta = {
    fuente,
    medidas: [medida, ...extrasValidos],
    abrir_por: abrir,
    tiempo,
    grafico,
    ...(periodo !== "tablero" ? { periodo: { ejercicios: Number(periodo) } } : {}),
    ...(acumuladasValidas.length > 0 ? { acumuladas: acumuladasValidas } : {}),
    ...(conMeta && meta.trim() !== "" && metaValida ? { meta: { valor: metaNum, mejor: metaMejorFinal } } : {}),
    ...(usaTramos && minDiasValido && minDiasNum !== MIN_DIAS_POR_DEFECTO ? { opciones: { min_dias: minDiasNum } } : {}),
    ...(((especie && filtran.includes("especie")) || (categoria && filtran.includes("categoria")) || (lote && filtran.includes("lote"))) ? {
      filtros: {
        ...(especie && filtran.includes("especie") ? { especie_ids: [especie] } : {}),
        ...(categoria && filtran.includes("categoria") ? { categoria_ids: [categoria] } : {}),
        ...(lote && filtran.includes("lote") ? { lote_ids: [lote] } : {}),
      },
    } : {}),
  }
  const tamano = (g: Grafico) => (g === "numero" ? { w: 3, h: 3 } : { w: 6, h: 7 })
  const borrador: TarjetaTablero = {
    id: inicial?.id ?? "vista-previa",
    titulo: tituloFinal.trim() || "Sin título",
    definicion,
    x: inicial?.x ?? 0, y: inicial?.y ?? 0,
    ...(inicial ? { w: inicial.w, h: inicial.h } : tamano(grafico)),
  }
  const puedeAceptar = !!tituloFinal.trim() && !(usaTramos && !minDiasValido) && metaValida
  const aceptar = () => {
    if (!puedeAceptar) return
    // Un número que pasa a gráfico (o al revés) toma un tamaño acorde
    const cambioDeTipo = inicial && (inicial.definicion.grafico === "numero") !== (grafico === "numero")
    onAceptar({ ...borrador, id: inicial?.id ?? nuevoId(), titulo: tituloFinal.trim(), ...(cambioDeTipo ? tamano(grafico) : {}) })
  }

  const borrarMedida = async () => {
    const p = propiaDe(medida)
    if (!p) return
    if (propiaEnUso(p.id)) {
      return toast.error(`"${p.nombre}" lo usa una tarjeta del tablero: cambiá o sacá esa tarjeta primero`)
    }
    if (!window.confirm(`¿Borrar el indicador "${p.nombre}"? No se puede deshacer.`)) return
    try {
      await eliminarMedida(p.id)
      await onPropiasCambiaron()
      elegirMedida("stock", "stock")
      toast.success("Indicador borrado")
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo borrar el indicador"))
    }
  }

  // Lo que dice el encabezado de "Más opciones" plegado: lo que no está en su valor normal
  const soloFijos = [
    ...(especie && filtran.includes("especie") ? [`Solo ${nombre("especie", especie)}`] : []),
    ...(categoria && filtran.includes("categoria") ? [`Solo ${nombre("categoria", categoria)}`] : []),
    ...(lote && filtran.includes("lote") ? [`Solo ${nombre("lote", lote)}`] : []),
  ]
  const resumen = [
    ...(conMeta && meta.trim() && metaValida ? [`Meta ${meta.trim()}${info?.unidad ? ` ${info.unidad}` : ""}`] : []),
    ...soloFijos,
    ...(periodo !== "tablero" ? [`Últimos ${periodo} ejercicios`] : []),
    ...(extrasValidos.length ? [`${extrasValidos.length + 1} series`] : []),
    ...(acumuladasValidas.length ? ["Acumulado"] : []),
    ...(usaTramos && minDiasValido && minDiasNum !== MIN_DIAS_POR_DEFECTO ? [`Pesadas cada ${minDiasNum} días o más`] : []),
  ]
  const calculadoCon = [periodo !== "tablero" ? `Últimos ${periodo} ejercicios` : etiquetaPeriodo, ...soloFijos.map(s => `${s} (de esta tarjeta)`), "filtros del tablero"]

  const categoriasVisibles = categorias.filter(c => c.activo && (!especie || c.especie_id === especie))
  const etiqueta = "flex flex-col gap-1.5 text-sm font-semibold"
  const noDisponibles = ORDEN_VISTAS.map(v => ({ v, d: disponibilidad(v, fuente, medida) })).filter(x => !x.d.posible)
  const otrosGraficos = graficosDe(config)
  const propia = fuente === "combinada" ? propiaDe(medida) : undefined
  const foco = "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto) onCancelar() }}>
      <DialogContent showCloseButton={false}
        className="flex h-[min(800px,calc(100vh-2rem))] w-[1120px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]">
        <header className="flex items-center justify-between border-b px-6 py-3.5">
          <DialogTitle className="text-xl font-bold">{inicial ? "Editar tarjeta" : "Nueva tarjeta"}</DialogTitle>
          <button type="button" aria-label="Cerrar sin guardar" onClick={onCancelar} className={cn("rounded-md p-2 text-muted-foreground hover:bg-muted", foco)}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[420px_minmax(0,1fr)]">
          {/* Configuración */}
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r px-6 py-5">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">¿Qué querés ver?</p>
              <BuscadorMedidas fuente={fuente} medida={medida} onElegir={elegirMedida} onNuevoIndicador={() => setEditorMedida({ medida: null })} />
              {propia && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">= {formula(propia.definicion)}</span>
                  {esFabrica(medida) ? <span className="text-muted-foreground">(de fábrica: no se cambia)</span> : <>
                    <button type="button" className={cn("font-semibold text-primary underline-offset-2 hover:underline", foco)} onClick={() => setEditorMedida({ medida: propia })}>Editar indicador</button>
                    <button type="button" className={cn("font-semibold text-destructive underline-offset-2 hover:underline", foco)} onClick={borrarMedida}>Borrar indicador</button>
                  </>}
                </div>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">¿Cómo lo querés ver?</legend>
              <div className="grid grid-cols-4 gap-1.5">
                {ORDEN_VISTAS.map(v => {
                  const Icono = ICONO_VISTA[v]
                  const posible = disponibilidad(v, fuente, medida).posible
                  const elegida = vista === v
                  return (
                    <button key={v} type="button" disabled={!posible} aria-pressed={elegida} onClick={() => aplicar(aplicarVista(config, v))}
                      className={cn("flex flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 text-xs transition-colors", foco,
                        elegida ? "border-2 border-primary bg-secondary font-bold text-secondary-foreground"
                          : posible ? "border border-border bg-background hover:bg-muted" : "cursor-not-allowed border border-dashed border-border bg-muted/40 text-muted-foreground")}>
                      <Icono className="h-5 w-5" aria-hidden />
                      {VISTAS[v].nombre}
                    </button>
                  )
                })}
              </div>
              {noDisponibles.length > 0 && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {noDisponibles.map(x => <li key={x.v}>{VISTAS[x.v].nombre}: {x.d.razon}.</li>)}
                </ul>
              )}
            </fieldset>

            {aviso && (
              <div role="status" className="flex items-start gap-2.5 rounded-lg bg-secondary px-3 py-2.5 text-sm leading-snug text-secondary-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{aviso.texto}</span>
                <button type="button" onClick={deshacer} className={cn("font-bold text-primary underline underline-offset-2", foco)}>Deshacer</button>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-3">
                <label className={etiqueta}>Separar por
                  <select className={cn(SELECT_NATIVO, "font-normal")} value={abrir ?? ""} disabled={opcionesSeparar.length === 0}
                    onChange={e => aplicar(cambiarSeparar(config, (e.target.value || null) as Dimension | null))}>
                    {!info?.abrirObligatorio && <option value="">Sin separar</option>}
                    {opcionesSeparar.map(d => <option key={d} value={d}>{mayuscula(ETIQUETA_DIMENSION[d])}</option>)}
                  </select>
                </label>
                <label className={etiqueta}>Período
                  <select className={cn(SELECT_NATIVO, "font-normal")} value={tiempo} disabled={tiempos.length < 2}
                    onChange={e => aplicar(cambiarPeriodo(config, e.target.value as Tiempo))}>
                    {tiempos.map(t => <option key={t} value={t}>{NOMBRE_PERIODO[t]}</option>)}
                  </select>
                </label>
              </div>
              {(opcionesSeparar.length === 0 || tiempos.length < 2) && (
                <p className="text-xs text-muted-foreground">
                  {opcionesSeparar.length === 0 && `${info?.etiqueta} no se puede separar. `}
                  {tiempos.length < 2 && `${info?.etiqueta} se ve solo ${NOMBRE_PERIODO[tiempos[0]].toLowerCase()}.`}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label="Tipo de gráfico">
              <span className="mr-1 text-muted-foreground">Tipo de gráfico:</span>
              {otrosGraficos.map(g => (
                <button key={g} type="button" aria-pressed={grafico === g} onClick={() => setConfig(c => ({ ...c, grafico: g }))}
                  className={cn("rounded-full border px-3 py-1", foco,
                    grafico === g ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border hover:bg-muted")}>
                  {NOMBRE_GRAFICO[g]}
                </button>
              ))}
              {otrosGraficos.length === 1 && <span className="text-xs text-muted-foreground">(el único para esta opción)</span>}
            </div>

            <div className="mt-auto rounded-lg border bg-muted/40">
              <button type="button" aria-expanded={masOpciones} aria-controls="mas-opciones" onClick={() => setMasOpciones(v => !v)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm", foco)}>
                <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", masOpciones && "rotate-90")} aria-hidden />
                <span className="shrink-0 font-semibold">Más opciones</span>
                {resumen.length > 0 && <span className="truncate text-muted-foreground">· {resumen.join(" · ")}</span>}
              </button>
              {masOpciones && (
                <div id="mas-opciones" className="space-y-3 border-t bg-background px-3 py-3">
                  <Subseccion titulo="Mostrar solo" noAplica={filtran.length === 0 ? `${info?.etiqueta} no se puede filtrar.` : null}>
                    <div className="grid grid-cols-1 gap-2">
                      <select aria-label="Mostrar solo la especie" className={SELECT_NATIVO} value={especie} disabled={!filtran.includes("especie")}
                        onChange={e => { setEspecie(e.target.value); setCategoria("") }}>
                        <option value="">{filtran.includes("especie") ? "Todas las especies (o la del tablero)" : "Especie: no aplica a esta medida"}</option>
                        {especies.filter(e => e.activo).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                      </select>
                      <select aria-label="Mostrar solo la categoría" className={SELECT_NATIVO} value={categoria} disabled={!filtran.includes("categoria")}
                        onChange={e => setCategoria(e.target.value)}>
                        <option value="">{filtran.includes("categoria") ? "Todas las categorías (o la del tablero)" : "Categoría: no aplica a esta medida"}</option>
                        {categoriasVisibles.map(c => <option key={c.id} value={c.id}>{especie ? c.nombre : `${nombre("especie", c.especie_id)} · ${c.nombre}`}</option>)}
                      </select>
                      <select aria-label="Mostrar solo el lote" className={SELECT_NATIVO} value={lote} disabled={!filtran.includes("lote")}
                        onChange={e => setLote(e.target.value)}>
                        <option value="">{filtran.includes("lote") ? "Todos los lotes (o el del tablero)" : "Lote: no aplica a esta medida"}</option>
                        {lotes.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                      </select>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Lo que elijas acá manda sobre los filtros de arriba.</p>
                  </Subseccion>

                  <Subseccion titulo="Período de esta tarjeta">
                    <select aria-label="Período de esta tarjeta" className={SELECT_NATIVO} value={periodo} onChange={e => setPeriodo(e.target.value)}>
                      <option value="tablero">El del tablero ({etiquetaPeriodo})</option>
                      <option value="3">Últimos 3 ejercicios</option>
                      <option value="5">Últimos 5 ejercicios</option>
                    </select>
                  </Subseccion>

                  <Subseccion titulo="Meta" noAplica={conMeta ? null : "Las tortas y las tablas no llevan meta."}>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Valor{info?.unidad ? ` (${info.unidad})` : ""}
                        <Input inputMode="decimal" value={meta} placeholder="Sin meta" aria-invalid={!metaValida} onChange={e => setMeta(e.target.value)} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Cumple si
                        <select className={SELECT_NATIVO} value={metaMejorFinal} disabled={meta.trim() === ""}
                          onChange={e => setMetaMejor(e.target.value as "sube" | "baja")}>
                          <option value="sube">Llega o pasa la meta</option>
                          <option value="baja">Queda en la meta o abajo</option>
                        </select>
                      </label>
                    </div>
                    {meta.trim() !== "" && mejorMedida === null && metaMejor === null && (
                      <p className="mt-1.5 text-xs text-muted-foreground">Esta medida no tiene un sentido bueno o malo: elegí cuándo cumple.</p>
                    )}
                  </Subseccion>

                  <Subseccion titulo="Series y acumulado"
                    noAplica={extrasPosibles.length === 0 && acumulables.length === 0
                      ? "Con esta opción no hay otras medidas de la misma unidad para sumar, ni medidas que se acumulen mes a mes." : null}>
                    <div className="space-y-1">
                      {extrasPosibles.length > 0 && <p className="text-xs text-muted-foreground">Sumar como series del mismo gráfico:</p>}
                      {extrasPosibles.map(x => (
                        <label key={x.m} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4 accent-primary" checked={extras.includes(x.m)}
                            onChange={e => setExtras(v => e.target.checked ? [...v, x.m] : v.filter(y => y !== x.m))} />
                          {x.etiqueta}
                        </label>
                      ))}
                      {acumulables.length > 0 && <p className="pt-1 text-xs text-muted-foreground">Acumulado (cada período suma los anteriores):</p>}
                      {acumulables.map(m => (
                        <label key={m} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4 accent-primary" checked={acumuladas.includes(m)}
                            onChange={e => setAcumuladas(v => e.target.checked ? [...v, m] : v.filter(y => y !== m))} />
                          {medidaDe(fuente, m)?.etiqueta ?? m} acumulado
                        </label>
                      ))}
                    </div>
                  </Subseccion>

                  <Subseccion titulo="Pesadas" noAplica={usaTramos ? null : "Solo para ganancia diaria y kg producidos."}>
                    <label className="flex items-center gap-2 text-sm">Mínimo de días entre pesadas
                      <Input type="number" inputMode="numeric" min={1} max={365} value={minDias} onChange={e => setMinDias(e.target.value)}
                        aria-invalid={!minDiasValido} className="w-24" />
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">Los tramos más cortos se descartan: el llenado del animal pesa más que lo que ganó.</p>
                  </Subseccion>
                </div>
              )}
            </div>
          </div>

          {/* Vista previa, con los datos reales del período y los filtros de arriba */}
          <div className="flex min-h-0 flex-col gap-3 bg-muted/50 px-6 py-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Vista previa</p>
            <div className={cn("min-h-0", grafico === "numero" ? "h-48" : "flex-1")}>
              <Tarjeta tarjeta={borrador} estId={estId} rango={rango} generales={generales} cruzado={null} nombre={nombre} edicion={false} />
            </div>
            <p className="text-sm text-muted-foreground">
              Calculado con: <strong className="text-foreground">{calculadoCon[0]}</strong>{calculadoCon.slice(1).map(c => ` · ${c}`).join("")}
            </p>
          </div>
        </div>

        <footer className="flex items-end gap-3 border-t bg-background px-6 py-3.5">
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">Título
            <span className="flex items-center gap-2">
              <Input value={tituloFinal} maxLength={80} className="font-normal"
                onChange={e => { setTitulo(e.target.value); setTituloAuto(e.target.value === sugerido) }} />
              {tituloAuto
                ? <span className="shrink-0 text-xs font-normal text-muted-foreground">automático</span>
                : <button type="button" onClick={() => setTituloAuto(true)} className={cn("flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline", foco)}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Volver al título automático
                  </button>}
            </span>
          </label>
          <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
          <Button disabled={!puedeAceptar} onClick={aceptar}>{inicial ? "Aplicar cambios" : "Agregar al tablero"}</Button>
        </footer>

        {/* Indicador calculado, encima del constructor (la R3 lo rediseña) */}
        {editorMedida && (
          <Dialog open onOpenChange={a => { if (!a) setEditorMedida(null) }}>
            <DialogContent className="w-[560px] max-w-[calc(100vw-2rem)] sm:max-w-[560px]">
              <DialogTitle className="sr-only">{editorMedida.medida ? "Editar indicador calculado" : "Nuevo indicador calculado"}</DialogTitle>
              <EditorMedida key={editorMedida.medida?.id ?? "nueva"} estId={estId} inicial={editorMedida.medida} propias={propias}
                onCancelar={() => setEditorMedida(null)}
                onGuardada={async id => {
                  await onPropiasCambiaron()
                  setEditorMedida(null)
                  if (medidaDe("combinada", id)) elegirMedida("combinada", id)
                  toast.success("Indicador guardado")
                }} />
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
