"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { nuevoId } from "@/components/actividades/formato"
import {
  ETIQUETA_DIMENSION, FILTRAN, MEDIDAS, MIN_DIAS_POR_DEFECTO, NOMBRE_FUENTE, USAN_TRAMOS, abrirDe, comparacionDe, formula, medidaDe, propiaDe,
} from "@/components/tablero/catalogo"
import { EditorMedida } from "@/components/tablero/EditorMedida"
import { Tarjeta } from "@/components/tablero/Tarjeta"
import { eliminarMedida } from "@/lib/queries/tablero"
import { mensajeDeError } from "@/lib/supabase/errores"
import type { Rango } from "@/components/tablero/periodos"
import { cn } from "@/lib/utils"
import type { CategoriaAnimal, Especie } from "@/types/lotes"
import type { DefinicionTarjeta, Dimension, Fuente, Grafico, MedidaPropia, TarjetaTablero, Tiempo } from "@/types/tablero"

const NOMBRE_TIEMPO: Record<Tiempo, string> = {
  total: "Total del período", mes: "Por mes", ejercicio: "Por ejercicio", temporada: "Por temporada",
}
const GRAFICOS: { id: Grafico; nombre: string }[] = [
  { id: "numero", nombre: "Número" },
  { id: "barras", nombre: "Barras" },
  { id: "barras_horizontales", nombre: "Barras acostadas" },
  { id: "lineas", nombre: "Líneas" },
  { id: "torta", nombre: "Torta" },
  { id: "tabla", nombre: "Tabla" },
]

// Qué gráficos sirven para lo elegido: acostadas y torta, para comparar grupos (abierto y en total); líneas, en el
// tiempo
function graficoValido(g: Grafico, abrir: Dimension | null, tiempo: Tiempo) {
  if (g === "barras_horizontales" || g === "torta") return abrir !== null && tiempo === "total"
  if (g === "lineas") return tiempo !== "total"
  return true
}

function tituloSugerido(fuente: Fuente, medida: string, abrir: Dimension | null, tiempo: Tiempo) {
  const m = medidaDe(fuente, medida)?.etiqueta ?? medida
  const t = tiempo === "total" ? "" : ` ${NOMBRE_TIEMPO[tiempo].toLowerCase()}`
  return `${m}${abrir ? ` por ${ETIQUETA_DIMENSION[abrir]}` : ""}${t}`
}

/**
 * Constructor de tarjetas (panel lateral, solo en la computadora): qué medir → cómo abrirlo (y en el tiempo) → tipo
 * de gráfico, con filtro propio, período y vista previa con datos reales. Solo ofrece lo que la base acepta (el
 * catálogo); los gráficos que no sirven para lo elegido quedan deshabilitados. En "Qué medir" también se crean,
 * cambian y borran las medidas propias (A op B), que se guardan en el momento.
 */
export function Constructor({ inicial, estId, rango, especies, categorias, lotes, nombre, propias, onPropiasCambiaron, propiaEnUso, onAceptar, onCancelar }: {
  inicial: TarjetaTablero | null               // null: tarjeta nueva
  estId: string
  rango: Rango
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
  const [fuente, setFuente] = useState<Fuente>(d0?.fuente ?? "stock")
  const [medida, setMedida] = useState(d0?.medidas[0] ?? "stock")
  const [extras, setExtras] = useState<string[]>(d0?.medidas.slice(1) ?? [])
  const [abrir, setAbrir] = useState<Dimension | null>(d0?.abrir_por ?? null)
  const [tiempo, setTiempo] = useState<Tiempo>(d0?.tiempo ?? "mes")
  const [grafico, setGrafico] = useState<Grafico>(d0?.grafico ?? "barras")
  const [especie, setEspecie] = useState(d0?.filtros?.especie_ids?.[0] ?? "")
  const [categoria, setCategoria] = useState(d0?.filtros?.categoria_ids?.[0] ?? "")
  const [lote, setLote] = useState(d0?.filtros?.lote_ids?.[0] ?? "")
  const [periodo, setPeriodo] = useState(d0?.periodo && d0.periodo !== "tablero" ? String(d0.periodo.ejercicios) : "tablero")
  const [minDias, setMinDias] = useState(String(d0?.opciones?.min_dias ?? MIN_DIAS_POR_DEFECTO))
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "")
  const [tituloTocado, setTituloTocado] = useState(!!inicial)
  // Meta (opcional): el valor y si cumple subiendo o bajando (por defecto, lo de la medida)
  const [meta, setMeta] = useState(d0?.meta ? String(d0.meta.valor).replace(".", ",") : "")
  const [metaMejor, setMetaMejor] = useState<"sube" | "baja" | null>(d0?.meta?.mejor ?? null)
  // Editor de medida propia abierto: la medida a cambiar, o null para una nueva
  const [editorMedida, setEditorMedida] = useState<{ medida: MedidaPropia | null } | null>(null)

  const info = medidaDe(fuente, medida)
  const filtran = info?.filtran ?? FILTRAN[fuente] ?? []
  const abrirObligatorio = !!info?.abrirObligatorio
  const opcionesAbrir: Dimension[] = abrirDe(fuente, medida)
  const tiempos = info?.tiempos ?? ["total"]
  // Otras medidas que se pueden sumar como series: misma fuente y unidad, y que admitan el mismo tiempo
  // (no cuando está abierta y en el tiempo: ahí cada grupo ya es una serie)
  const extrasPosibles = abrir !== null && tiempo !== "total" || grafico === "torta" || grafico === "numero" ? []
    : Object.entries(MEDIDAS[fuente] ?? {})
      .filter(([m, x]) => m !== medida && x.unidad === info?.unidad && x.tiempos.includes(tiempo))
      .map(([m, x]) => ({ m, etiqueta: x.etiqueta }))
  const extrasValidos = extras.filter(e => extrasPosibles.some(x => x.m === e))
  const tituloFinal = tituloTocado ? titulo : tituloSugerido(fuente, medida, abrir, tiempo)
  const usaTramos = fuente === "pesadas" && [medida, ...extras].some(m => USAN_TRAMOS.includes(m))
  // La meta va en el número y en los gráficos de barras y líneas (no en la torta ni en la tabla)
  const conMeta = grafico === "numero" || grafico === "barras" || grafico === "barras_horizontales" || grafico === "lineas"
  // "1.250,5" (con coma decimal, los puntos son de miles) o "2.5"
  const metaNum = Number(meta.includes(",") ? meta.trim().replace(/\./g, "").replace(",", ".") : meta.trim())
  const metaValida = meta.trim() === "" || Number.isFinite(metaNum)
  const mejorMedida = comparacionDe(fuente, medida)
  const metaMejorFinal = metaMejor ?? mejorMedida ?? "sube"
  const minDiasNum = Number(minDias)
  const minDiasValido = Number.isInteger(minDiasNum) && minDiasNum >= 1 && minDiasNum <= 365

  // Al cambiar qué medir o cómo abrirlo, se acomoda lo que dejó de valer
  const elegirMedida = (valor: string) => {
    const [f, m] = valor.split(":") as [Fuente, string]
    const nueva = medidaDe(f, m)!
    const posibles = abrirDe(f, m)
    // Algunas medidas solo tienen sentido abiertas (ej. días de descanso, por potrero)
    const abrirOk = abrir !== null && posibles.includes(abrir) ? abrir : nueva.abrirObligatorio ? posibles[0] : null
    const t = nueva.tiempos.includes(tiempo) ? tiempo : nueva.tiempos[0]
    setFuente(f); setMedida(m); setExtras([]); setAbrir(abrirOk); setTiempo(t)
    if (!graficoValido(grafico, abrirOk, t)) setGrafico("barras")
    if (f !== fuente) setCategoria("")
  }
  const elegirAbrir = (a: Dimension | null) => {
    setAbrir(a)
    if (!graficoValido(grafico, a, tiempo)) setGrafico(a !== null && tiempo === "total" ? "barras_horizontales" : "barras")
  }
  const elegirTiempo = (t: Tiempo) => {
    setTiempo(t)
    if (!graficoValido(grafico, abrir, t)) setGrafico("barras")
  }

  const definicion: DefinicionTarjeta = {
    fuente,
    medidas: [medida, ...extrasValidos],
    abrir_por: abrir,
    tiempo,
    grafico,
    ...(periodo !== "tablero" ? { periodo: { ejercicios: Number(periodo) } } : {}),
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
  const borrador: TarjetaTablero = {
    id: inicial?.id ?? "vista-previa",
    titulo: tituloFinal.trim() || "Sin título",
    definicion,
    x: inicial?.x ?? 0, y: inicial?.y ?? 0,
    w: inicial?.w ?? (grafico === "numero" ? 3 : 6),
    h: inicial?.h ?? (grafico === "numero" ? 3 : 7),
  }
  const aceptar = () => {
    if (!tituloFinal.trim()) return
    // Un número que pasa a gráfico (o al revés) toma un tamaño acorde
    const cambioDeTipo = inicial && (inicial.definicion.grafico === "numero") !== (grafico === "numero")
    onAceptar({
      ...borrador,
      id: inicial?.id ?? nuevoId(),
      titulo: tituloFinal.trim(),
      ...(cambioDeTipo ? { w: grafico === "numero" ? 3 : 6, h: grafico === "numero" ? 3 : 7 } : {}),
    })
  }

  const borrarMedida = async () => {
    const p = propiaDe(medida)
    if (!p) return
    if (propiaEnUso(p.id)) {
      return toast.error(`"${p.nombre}" la usa una tarjeta del tablero: cambiá o sacá esa tarjeta primero`)
    }
    if (!window.confirm(`¿Borrar la medida "${p.nombre}"? No se puede deshacer.`)) return
    try {
      await eliminarMedida(p.id)
      await onPropiasCambiaron()
      elegirMedida("stock:stock")
      toast.success("Medida borrada")
    } catch (err) {
      toast.error(mensajeDeError(err, "No se pudo borrar la medida"))
    }
  }

  const categoriasVisibles = categorias.filter(c => c.activo && (!especie || c.especie_id === especie))
  const etiqueta = "flex flex-col gap-1 text-sm text-muted-foreground"

  return (
    <aside aria-label={inicial ? "Editar tarjeta" : "Nueva tarjeta"}
      className="flex max-h-[calc(100vh-2rem)] w-[400px] shrink-0 flex-col gap-4 overflow-y-auto rounded-lg border bg-card p-5 lg:sticky lg:top-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{inicial ? "Editar tarjeta" : "Nueva tarjeta"}</h2>
        <button type="button" aria-label="Cerrar" onClick={onCancelar} className="rounded p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>

      <label className={etiqueta}>Título
        <Input value={tituloFinal} maxLength={80} onChange={e => { setTitulo(e.target.value); setTituloTocado(true) }} />
      </label>

      <label className={etiqueta}>1 · Qué medir
        <select className={SELECT_NATIVO} value={`${fuente}:${medida}`} disabled={!!editorMedida}
          onChange={e => (e.target.value === "nueva" ? setEditorMedida({ medida: null }) : elegirMedida(e.target.value))}>
          {(Object.keys(MEDIDAS) as Fuente[]).filter(f => Object.keys(MEDIDAS[f] ?? {}).length > 0).map(f => (
            <optgroup key={f} label={NOMBRE_FUENTE[f]}>
              {Object.entries(MEDIDAS[f] ?? {}).map(([m, x]) => <option key={m} value={`${f}:${m}`}>{x.etiqueta}</option>)}
            </optgroup>
          ))}
          <option value="nueva">+ Nueva medida (A ÷ B, A × B…)</option>
        </select>
      </label>
      {fuente === "combinada" && !editorMedida && propiaDe(medida) && (
        <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">= {formula(propiaDe(medida)!.definicion)}</span>
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => setEditorMedida({ medida: propiaDe(medida)! })}>Editar medida</button>
          <button type="button" className="font-medium text-destructive hover:underline" onClick={borrarMedida}>Borrar medida</button>
        </div>
      )}

      {editorMedida ? (
        <EditorMedida key={editorMedida.medida?.id ?? "nueva"} estId={estId} inicial={editorMedida.medida} propias={propias}
          onCancelar={() => setEditorMedida(null)}
          onGuardada={async id => {
            await onPropiasCambiaron()
            setEditorMedida(null)
            if (medidaDe("combinada", id)) elegirMedida(`combinada:${id}`)
            toast.success("Medida guardada")
          }} />
      ) : (<>
      {extrasPosibles.length > 0 && (
        <fieldset className="-mt-2 space-y-1">
          <legend className="mb-1 text-xs text-muted-foreground">Sumar otras medidas como series del mismo gráfico</legend>
          {extrasPosibles.map(x => (
            <label key={x.m} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={extras.includes(x.m)}
                onChange={e => setExtras(v => e.target.checked ? [...v, x.m] : v.filter(y => y !== x.m))} />
              {x.etiqueta}
            </label>
          ))}
        </fieldset>
      )}

      {usaTramos && (
        <label className={cn(etiqueta, "-mt-2")}>Mínimo de días entre pesadas
          <Input type="number" inputMode="numeric" min={1} max={365} value={minDias} onChange={e => setMinDias(e.target.value)}
            aria-invalid={!minDiasValido} className="w-28" />
          <span className="text-xs">
            Los tramos más cortos se descartan: el llenado (3 a 5 % del peso) pesa más que la ganancia. También los que
            tienen en el medio algo que cambia quién está en las categorías pesadas: división, unión, compra, venta,
            destete, parición o ajuste (y, por categoría, la recategorización).
          </span>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className={etiqueta}>2 · Abrir por
          <select className={SELECT_NATIVO} value={abrir ?? ""} onChange={e => elegirAbrir((e.target.value || null) as Dimension | null)}>
            {!abrirObligatorio && <option value="">Nada</option>}
            {opcionesAbrir.map(d => <option key={d} value={d}>{ETIQUETA_DIMENSION[d][0].toUpperCase() + ETIQUETA_DIMENSION[d].slice(1)}</option>)}
          </select>
        </label>
        <label className={etiqueta}>En el tiempo
          <select className={SELECT_NATIVO} value={tiempo} onChange={e => elegirTiempo(e.target.value as Tiempo)}>
            {tiempos.map(t => <option key={t} value={t}>{NOMBRE_TIEMPO[t]}</option>)}
          </select>
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {opcionesAbrir.length > 0
          ? `${info?.etiqueta ?? NOMBRE_FUENTE[fuente]} se abre por ${opcionesAbrir.map(d => ETIQUETA_DIMENSION[d]).join(", ")}.`
          : `${info?.etiqueta ?? NOMBRE_FUENTE[fuente]} no se abre.`}
        {filtran.length < 3 && ` Le aplican los filtros de ${filtran.length ? filtran.map(d => ETIQUETA_DIMENSION[d]).join(" y ") : "nada (no se filtra)"}.`}
      </p>

      <fieldset>
        <legend className="mb-1.5 text-sm text-muted-foreground">3 · Gráfico</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {GRAFICOS.map(g => {
            const valido = graficoValido(g.id, abrir, tiempo)
            return (
              <button key={g.id} type="button" disabled={!valido} aria-pressed={grafico === g.id} onClick={() => setGrafico(g.id)}
                title={valido ? undefined : g.id === "lineas" ? "Necesita tiempo (por mes, ejercicio o temporada)" : "Necesita abrir por algo, en el total del período"}
                className={cn("h-9 rounded-md border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  grafico === g.id ? "border-primary bg-primary font-semibold text-primary-foreground" : "hover:bg-muted")}>
                {g.nombre}
              </button>
            )
          })}
        </div>
      </fieldset>

      {conMeta && (
        <div className="grid grid-cols-2 gap-3">
          <label className={etiqueta}>Meta (opcional){info?.unidad ? ` en ${info.unidad}` : ""}
            <Input inputMode="decimal" value={meta} placeholder="Sin meta" aria-invalid={!metaValida} onChange={e => setMeta(e.target.value)} />
          </label>
          <label className={etiqueta}>Cumple si
            <select className={SELECT_NATIVO} value={metaMejorFinal} disabled={meta.trim() === ""}
              onChange={e => setMetaMejor(e.target.value as "sube" | "baja")}>
              <option value="sube">Llega o pasa la meta</option>
              <option value="baja">Queda en la meta o abajo</option>
            </select>
          </label>
          {meta.trim() !== "" && mejorMedida === null && metaMejor === null && (
            <p className="col-span-2 -mt-2 text-xs text-muted-foreground">Esta medida no tiene un sentido bueno o malo: elegí cuándo cumple.</p>
          )}
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm text-muted-foreground">Filtro propio (opcional)</legend>
        <div className="grid grid-cols-2 gap-2">
          {filtran.includes("especie") && <select aria-label="Especie fija" className={SELECT_NATIVO} value={especie} onChange={e => { setEspecie(e.target.value); setCategoria("") }}>
            <option value="">Especie: la del tablero</option>
            {especies.filter(e => e.activo).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>}
          {filtran.includes("categoria") && (
            <select aria-label="Categoría fija" className={SELECT_NATIVO} value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="">Categoría: la del tablero</option>
              {categoriasVisibles.map(c => (
                <option key={c.id} value={c.id}>{especie ? c.nombre : `${nombre("especie", c.especie_id)} · ${c.nombre}`}</option>
              ))}
            </select>
          )}
          {filtran.includes("lote") && <select aria-label="Lote fijo" className={SELECT_NATIVO} value={lote} onChange={e => setLote(e.target.value)}>
            <option value="">Lote: el del tablero</option>
            {lotes.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>}
          <select aria-label="Período" className={SELECT_NATIVO} value={periodo} onChange={e => setPeriodo(e.target.value)}>
            <option value="tablero">Período: el del tablero</option>
            <option value="3">Últimos 3 ejercicios</option>
            <option value="5">Últimos 5 ejercicios</option>
          </select>
        </div>
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Lo que fijes acá manda: si arriba (o desde otro gráfico) eligen otra cosa, esta tarjeta sigue con lo suyo y lo marca.
        </p>
      </fieldset>

      <div>
        <p className="mb-1.5 text-sm text-muted-foreground">Vista previa, con los datos del período de arriba</p>
        <div style={{ height: grafico === "numero" ? 130 : 260 }}>
          <Tarjeta tarjeta={borrador} estId={estId} rango={rango} generales={{}} cruzado={null} nombre={nombre} edicion={false} />
        </div>
      </div>

      <div className="mt-auto flex gap-2">
        <Button className="flex-1" disabled={!tituloFinal.trim() || (usaTramos && !minDiasValido) || !metaValida} onClick={aceptar}>{inicial ? "Aplicar cambios" : "Agregar al tablero"}</Button>
        <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
      </div>
      </>)}
    </aside>
  )
}
