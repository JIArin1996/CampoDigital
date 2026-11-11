"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Expand, FileUp, PencilOff, Scan, Shrink } from "lucide-react"
import { toast } from "sonner"

import { PanelPotrero } from "@/components/potreros/PanelPotrero"
import { ResumenEstablecimiento } from "@/components/potreros/ResumenEstablecimiento"
import { BarraDibujo } from "@/components/potreros/BarraDibujo"
import { BarraZona } from "@/components/potreros/BarraZona"
import { ImportarFormas } from "@/components/potreros/ImportarFormas"
import { CAPAS, CAPA_POR_DEFECTO, type IdCapa } from "@/components/potreros/mapa/capas"
import { LEYENDAS, MODOS, categoriaDe, coloresPorPotrero, type ModoColor } from "@/components/potreros/mapa/colores"
import { textoCabezas } from "@/components/potreros/mapa/etiquetas"
import { numero, type AccionesPotrero, type LoteEnPotrero } from "@/components/potreros/ocupacion"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getSuperpuestos, guardarFormaPotrero, type FormaPotrero } from "@/lib/queries/potreros"
import { borrarZona, getTiposZona, guardarZona, type TipoZona, type ZonaPotrero } from "@/lib/queries/zonas"
import { nuevoId } from "@/components/actividades/formato"
import { mensajeDeError } from "@/lib/supabase/errores"
import type { Potrero } from "@/types/database"

// Leaflet usa window: el mapa se carga solo en el navegador
const MapaLeaflet = dynamic(() => import("@/components/potreros/mapa/MapaLeaflet"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
})

const CLAVE_CAPA = "potreros.capa"
const CLAVE_MODO = "potreros.color"

function leer<T extends string>(clave: string, validos: readonly T[], porDefecto: T): T {
  try {
    const v = localStorage.getItem(clave)
    return v && (validos as readonly string[]).includes(v) ? (v as T) : porDefecto
  } catch {
    return porDefecto
  }
}
// Lo que dice la etiqueta debajo del nombre, según el modo de color
const MAX_CATEGORIAS = 4
function lineasEtiqueta(modo: ModoColor, p: Potrero, ha: number, lotes: LoteEnPotrero[]): string[] {
  if (modo === "uso") return [p.uso_actual ?? "Sin uso cargado"]
  if (modo === "pastura") return [p.tipo_pastura ?? "Sin pastura cargada"]
  if (modo === "ocupacion") {
    // Animales por categoría, sumando los lotes del potrero (en el orden de las categorías)
    const porCategoria = new Map<string, number>()
    for (const l of lotes) for (const c of l.categorias) porCategoria.set(c.nombre, (porCategoria.get(c.nombre) ?? 0) + c.cabezas)
    if (porCategoria.size === 0) return ["Vacío"]
    const filas = [...porCategoria].map(([nombre, n]) => `${nombre} ${n}`)
    return filas.length > MAX_CATEGORIAS
      ? [...filas.slice(0, MAX_CATEGORIAS - 1), `y ${filas.length - MAX_CATEGORIAS + 1} categorías más`]
      : filas
  }
  return [`${numero(ha)} ha`]
}

function guardar(clave: string, valor: string) {
  try { localStorage.setItem(clave, valor) } catch { /* sin almacenamiento: se elige de nuevo la próxima vez */ }
}

/**
 * Vista Mapa de Potreros: los potreros dibujados sobre la imagen satelital, coloreados por uso, pastura u
 * ocupación, con su nombre y hectáreas. Al tocar uno se abre su panel (abajo en el celular, al costado en
 * la computadora). Los potreros sin forma se listan aparte. Administrador y operador dibujan, editan,
 * borran e importan formas; se avisa (sin bloquear) si dos potreros se superponen.
 */
export function VistaMapa({ establecimientoId, potreros, formas, ocupacion, ugTotal, salidas, puedeOperar, acciones, onCambio }: {
  establecimientoId: string
  potreros: Potrero[]                       // los activos
  formas: Map<string, FormaPotrero>
  ocupacion: Map<string, LoteEnPotrero[]>
  ugTotal: { ug: number; sinUg: string[] }  // todos los animales (carga global)
  salidas: Map<string, string>              // última salida de cada potrero (desde cuándo descansa)
  puedeOperar: boolean
  acciones: AccionesPotrero
  onCambio: () => void                      // recargar después de guardar
}) {
  const [capa, setCapa] = useState<IdCapa>(() => leer(CLAVE_CAPA, CAPAS.map(c => c.id), CAPA_POR_DEFECTO))
  const [modo, setModo] = useState<ModoColor>(() => leer(CLAVE_MODO, MODOS.map(m => m.id), MODOS[0].id))
  const [seleccionado, setSeleccionadoEstado] = useState<string | null>(null)
  const [detalle, setDetalle] = useState(false)   // celular: panel resumido o desplegado
  const setSeleccionado = (id: string | null) => { setSeleccionadoEstado(id); setDetalle(false) }
  const [encuadre, setEncuadre] = useState(0)
  const [completa, setCompleta] = useState(false)   // pantalla completa
  // Dibujo: qué potrero y con qué forma arranca (un objeto nuevo reinicia el dibujo); la forma actual; guardando
  const [edicion, setEdicion] = useState<{ id: string; inicial: GeoJSON.MultiPolygon | null } | null>(null)
  // Dibujo de una zona no aprovechable: su potrero, la zona (nueva o existente), tipo y nota, y lo que va al mapa
  // (un objeto nuevo reinicia el dibujo, como con el potrero)
  const [edicionZona, setEdicionZona] = useState<{
    potreroId: string; zonaId: string; nueva: boolean; tipoId: string; nota: string
    mapa: { id: string; inicial: GeoJSON.MultiPolygon | null }
  } | null>(null)
  const [tiposZona, setTiposZona] = useState<TipoZona[]>([])
  const [formaEditada, setFormaEditada] = useState<GeoJSON.MultiPolygon | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [importando, setImportando] = useState(false)
  // Los que a este zoom quedaron como círculo numerado en el mapa (no entró ni el nombre)
  const [numerados, setNumerados] = useState<{ id: string; numero: number }[]>([])

  useEffect(() => {
    let vigente = true
    getTiposZona(establecimientoId, { incluirInactivos: true })
      .then(t => { if (vigente) setTiposZona(t) })
      .catch(() => { /* sin tipos no se agregan zonas; el resto anda */ })
    return () => { vigente = false }
  }, [establecimientoId])

  // Escape sale de la pantalla completa
  useEffect(() => {
    if (!completa) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") setCompleta(false) }
    window.addEventListener("keydown", alTeclear)
    return () => window.removeEventListener("keydown", alTeclear)
  }, [completa])

  const nombre = (id: string) => potreros.find(p => p.id === id)?.nombre ?? "otro potrero"

  // Aviso (no bloqueo) si los potreros tocados quedaron superpuestos con otros
  const avisarSuperposiciones = async (tocados: string[]) => {
    try {
      const pares = (await getSuperpuestos(establecimientoId)).filter(p => tocados.includes(p.a) || tocados.includes(p.b))
      if (pares.length > 0) {
        toast.warning(`Se superponen: ${pares.map(p => `${nombre(p.a)} y ${nombre(p.b)} (${numero(p.hectareas, 2)} ha)`).join("; ")}. Revisá los dibujos.`,
          { duration: 10000 })
      }
    } catch { /* el aviso es opcional */ }
  }

  const empezarDibujo = (p: Potrero) => {
    const inicial = formas.get(p.id)?.forma ?? null
    setEdicion({ id: p.id, inicial })
    setFormaEditada(inicial)
    // En el celular se dibuja mejor con el mapa entero
    if (window.innerWidth < 1024) setCompleta(true)
  }

  const guardarDibujo = async () => {
    if (!edicion || !formaEditada) return
    setGuardando(true)
    try {
      await guardarFormaPotrero(edicion.id, formaEditada)
      toast.success("Forma guardada")
      await avisarSuperposiciones([edicion.id])
      setEdicion(null)
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  const borrarForma = async (p: Potrero) => {
    if (!window.confirm(`¿Borrar la forma de ${p.nombre}? El potrero sigue existiendo, sin dibujar y sin superficie.`)) return
    try {
      await guardarFormaPotrero(p.id, null)
      toast.success("Forma borrada")
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    }
  }

  // Zonas: agregar, editar y borrar (administrador u operador)
  const empezarZona = (p: Potrero, z: ZonaPotrero | null) => {
    const tipoInicial = z?.tipo_id ?? tiposZona.find(t => t.activo)?.id ?? ""
    if (!tipoInicial) return toast.error("No hay tipos de zona activos: el administrador los carga en Configuraciones → Potreros")
    const id = z?.id ?? nuevoId()
    setEdicionZona({ potreroId: p.id, zonaId: id, nueva: !z, tipoId: tipoInicial, nota: z?.nota ?? "", mapa: { id, inicial: z?.forma_dibujada ?? null } })
    setFormaEditada(z?.forma_dibujada ?? null)
    if (window.innerWidth < 1024) setCompleta(true)
  }
  const guardarZonaActual = async () => {
    if (!edicionZona || !formaEditada) return
    setGuardando(true)
    try {
      const ha = await guardarZona({ id: edicionZona.zonaId, potrero_id: edicionZona.potreroId, tipo_id: edicionZona.tipoId,
        forma: formaEditada, nota: edicionZona.nota.trim() || null })
      toast.success(`Zona guardada: ${numero(ha, 2)} ha dentro del potrero`)
      setEdicionZona(null)
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }
  const borrarZonaDe = async (z: ZonaPotrero) => {
    if (!window.confirm(`¿Borrar la zona ${z.tipo} (${numero(z.ha, 2)} ha)? El área efectiva del potrero vuelve a sumarla.`)) return
    try {
      await borrarZona(z.id)
      toast.success("Zona borrada")
      onCambio()
    } catch (err) {
      toast.error(mensajeDeError(err))
    }
  }
  const editandoAlgo = !!edicion || !!edicionZona

  const dibujados = potreros.filter(p => formas.has(p.id) && p.id !== edicion?.id)
  const sinDibujar = potreros.filter(p => !formas.has(p.id))
  // Memorizado: mientras se dibuja, los potreros vecinos no se vuelven a crear (si no, se pierde el pegado a sus bordes)
  const idEditado = edicion?.id
  const zonaEditada = edicionZona?.zonaId
  const potreroDeZona = edicionZona?.potreroId
  const poligonos = useMemo(() => {
    const dibujadosMemo = potreros.filter(p => formas.has(p.id))
    const propios = coloresPorPotrero(dibujadosMemo.map(p => ({ id: p.id, nombre: p.nombre, forma: formas.get(p.id)!.forma })))
    return dibujadosMemo
      .filter(p => p.id !== idEditado)
      // Mientras se dibuja una zona: solo su potrero
      .filter(p => !potreroDeZona || p.id === potreroDeZona)
      .map(p => {
        const f = formas.get(p.id)!
        const lotes = ocupacion.get(p.id) ?? []
        const cat = modo === "potrero" ? { color: propios.get(p.id)!, punteado: false } : categoriaDe(modo, p, lotes.length > 0)
        const cabezas = lotes.reduce((s, l) => s + l.cabezas, 0)
        return {
          id: p.id, nombre: p.nombre, lineas: lineasEtiqueta(modo, p, f.area_ha, lotes), resumen: textoCabezas(cabezas), cabezas,
          forma: f.forma, etiqueta: f.etiqueta, color: cat.color, punteado: cat.punteado,
          // Las zonas se ven siempre (la que se está dibujando la muestra el editor). Mientras se dibuja una, su
          // potrero va solo como contorno
          zonas: f.zonas.filter(z => z.id !== zonaEditada).map(z => ({ forma: z.forma, color: z.color })),
          soloContorno: !!potreroDeZona,
        }
      })
  }, [potreros, formas, ocupacion, modo, idEditado, zonaEditada, potreroDeZona])

  // Al empezar a dibujar una zona, el mapa se acerca a su potrero (queda solo él)
  useEffect(() => {
    if (potreroDeZona) setEncuadre(n => n + 1)
  }, [potreroDeZona])
  const elegido = potreros.find(p => p.id === seleccionado) ?? null
  const dibujando = edicion ? potreros.find(p => p.id === edicion.id) ?? null : null
  const potreroZona = edicionZona ? potreros.find(p => p.id === edicionZona.potreroId) ?? null : null
  const barraZona = edicionZona && potreroZona && (
    <BarraZona key={JSON.stringify(edicionZona.mapa.inicial === null)} potrero={potreroZona.nombre} nueva={edicionZona.nueva}
      tipos={tiposZona.filter(t => t.activo || t.id === edicionZona.tipoId)} tipoId={edicionZona.tipoId} nota={edicionZona.nota}
      forma={formaEditada} guardando={guardando}
      onTipo={tipoId => setEdicionZona(e => e && { ...e, tipoId })}
      onNota={nota => setEdicionZona(e => e && { ...e, nota })}
      onGuardar={() => void guardarZonaActual()}
      onReiniciar={() => { setEdicionZona(e => e && { ...e, mapa: { id: e.zonaId, inicial: null } }); setFormaEditada(null) }}
      onCancelar={() => setEdicionZona(null)} />
  )
  // Lo que el panel del potrero necesita para las zonas
  const zonasDe = (p: Potrero) => ({
    superficieEfectiva: formas.get(p.id)?.superficie_efectiva ?? null,
    zonas: formas.get(p.id)?.zonas ?? [],
    onAgregarZona: () => empezarZona(p, null),
    onEditarZona: (z: ZonaPotrero) => empezarZona(p, z),
    onBorrarZona: (z: ZonaPotrero) => void borrarZonaDe(z),
  })

  // Mientras se dibuja, en lugar del panel va la barra del dibujo
  const panel = barraZona ? barraZona : dibujando ? (
    <BarraDibujo key={edicion?.inicial ? "editar" : "dibujar"} potrero={dibujando} forma={formaEditada} guardando={guardando}
      onGuardar={guardarDibujo}
      onReiniciar={() => { setEdicion({ id: dibujando.id, inicial: null }); setFormaEditada(null) }}
      onCancelar={() => setEdicion(null)} />
  ) : elegido && (
    <PanelPotrero potrero={elegido} areaDibujada={formas.get(elegido.id)?.area_ha ?? null} ultimaSalida={salidas.get(elegido.id) ?? null}
      lotes={ocupacion.get(elegido.id) ?? []}
      puedeOperar={puedeOperar} acciones={acciones} onCerrar={() => setSeleccionado(null)}
      onDibujar={() => empezarDibujo(elegido)} onBorrarForma={() => borrarForma(elegido)} {...zonasDe(elegido)} />
  )
  // En el celular: el mismo panel, resumido hasta que se toque "Ver detalle"
  const panelMovil = dibujando || barraZona ? panel : elegido && (
    <PanelPotrero potrero={elegido} areaDibujada={formas.get(elegido.id)?.area_ha ?? null} ultimaSalida={salidas.get(elegido.id) ?? null}
      lotes={ocupacion.get(elegido.id) ?? []}
      puedeOperar={puedeOperar} acciones={acciones} onCerrar={() => setSeleccionado(null)}
      onDibujar={() => empezarDibujo(elegido)} onBorrarForma={() => borrarForma(elegido)} {...zonasDe(elegido)}
      resumido={!detalle} onVerDetalle={() => setDetalle(true)} />
  )
  // Hoja de abajo del celular: resumida ocupa lo justo; desplegada, hasta 75 % de la pantalla
  const hoja = (fija: boolean) => cn(
    "overflow-y-auto rounded-t-2xl bg-background px-4 pb-4 pt-2 shadow-2xl",
    fija ? "lg:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t md:bottom-0 md:left-56"
      : "absolute inset-x-0 bottom-0 z-[1000] pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden",
    detalle || dibujando || barraZona ? "max-h-[75vh]" : "max-h-[45vh]",
  )
  const asa = (
    <button type="button" aria-label={detalle ? "Achicar" : "Ver detalle"} onClick={() => setDetalle(d => !d)}
      className="mx-auto -mt-1 flex h-11 w-24 items-center justify-center">
      <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
    </button>
  )

  // Leyenda de las zonas: los tipos que hay en el mapa (mientras se dibuja una, los de su potrero)
  const tiposEnMapa = [...new Map(
    (potreroDeZona ? formas.get(potreroDeZona)?.zonas ?? [] : [...formas.values()].flatMap(f => f.zonas))
      .map(z => [z.tipo_id, { nombre: z.tipo, color: z.color }]),
  ).values()]
  const leyendaZonas = tiposEnMapa.length > 0 && (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Zonas no aprovechables">
      <li className="text-muted-foreground">No aprovechable:</li>
      {tiposEnMapa.map(t => (
        <li key={t.nombre} className="flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-3.5 rounded-sm border"
            style={{ background: `repeating-linear-gradient(45deg, ${t.color} 0 3px, ${t.color}40 3px 8px)`, borderColor: t.color }} />
          {t.nombre}
        </li>
      ))}
    </ul>
  )
  const leyenda = (
    <div className="space-y-1">
      {modo === "potrero" ? (
        <p className="text-sm text-muted-foreground">Cada potrero con su color; el nombre está escrito en el mapa.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Leyenda">
          {LEYENDAS[modo].map(c => (
            <li key={c.clave} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("h-3.5 w-3.5 rounded-sm border-2", c.punteado && "border-dashed")}
                style={{ borderColor: c.color, backgroundColor: c.punteado ? "transparent" : `${c.color}66` }} />
              {c.nombre}
            </li>
          ))}
        </ul>
      )}
      {leyendaZonas}
    </div>
  )

  // Sin potrero elegido: el resumen de todo el establecimiento
  const resumen = (
    <ResumenEstablecimiento potreros={potreros} formas={formas} ocupacion={ocupacion} ugTotal={ugTotal} salidas={salidas}
      onSeleccionar={id => { if (!editandoAlgo) setSeleccionado(id) }} />
  )

  const listaNumerados = numerados.length > 0 && (
    <div className="text-sm">
      <p className="text-muted-foreground">Sin lugar para el nombre a este zoom (acercate o tocá uno):</p>
      <ol className="mt-1 flex flex-wrap gap-1.5">
        {numerados.map(n => (
          <li key={n.id}>
            <button type="button" onClick={() => { if (!editandoAlgo) setSeleccionado(n.id) }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted pl-1.5 pr-3 font-medium hover:bg-accent md:min-h-9">
              <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">{n.numero}</span>
              {nombre(n.id)}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Color y capa */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Color de los potreros">
          {MODOS.map(m => (
            <button key={m.id} type="button" aria-pressed={modo === m.id}
              onClick={() => { setModo(m.id); guardar(CLAVE_MODO, m.id) }}
              className={cn("min-h-11 rounded-md px-3 text-sm font-semibold transition-colors md:min-h-8",
                modo === m.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {m.nombre}
            </button>
          ))}
        </div>
        <select aria-label="Imagen de fondo" className={cn(SELECT_NATIVO, "w-auto")} value={capa}
          onChange={e => { const v = e.target.value as IdCapa; setCapa(v); guardar(CLAVE_CAPA, v) }}>
          {CAPAS.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {puedeOperar && (
          <Button variant="outline" className="h-11 md:h-9" disabled={editandoAlgo} onClick={() => setImportando(true)}>
            <FileUp className="h-4 w-4 mr-1" /> Importar formas
          </Button>
        )}
      </div>

      {/* Mapa y panel. En la computadora el mapa va a todo el ancho; al elegir un potrero (o dibujar) se
          achica y a la derecha aparece la columna con el detalle */}
      <div className={cn(panel && "lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-4")}>
        {/* El mismo contenedor pasa a pantalla completa (sin volver a crear el mapa) */}
        <div className={cn("isolate overflow-hidden bg-muted",
          completa ? "fixed inset-0 z-50" : "relative h-[60vh] rounded-lg border lg:h-[70vh]")}>
          <MapaLeaflet capa={capa} poligonos={poligonos} seleccionado={seleccionado} encuadre={encuadre}
            onSeleccionar={id => { if (!editandoAlgo) setSeleccionado(id) }}
            edicion={edicion ?? edicionZona?.mapa ?? null} onFormaEditada={setFormaEditada} onNumerados={setNumerados} />
          <div className="absolute right-2 top-[calc(0.5rem+env(safe-area-inset-top))] z-[1000] flex flex-col gap-2">
            <Button variant="secondary" size="icon" className="h-11 w-11 shadow"
              aria-label={completa ? "Salir de la pantalla completa" : "Ver en pantalla completa"}
              title={completa ? "Salir de la pantalla completa" : "Pantalla completa"} onClick={() => setCompleta(c => !c)}>
              {completa ? <Shrink className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
            </Button>
            {dibujados.length > 0 && (
              <Button variant="secondary" size="icon" aria-label="Encuadrar los potreros" title="Encuadrar los potreros"
                className="h-11 w-11 shadow" onClick={() => setEncuadre(n => n + 1)}>
                <Scan className="h-5 w-5" />
              </Button>
            )}
          </div>
          {dibujados.length === 0 && !editandoAlgo && (
            <p className="absolute left-14 right-16 top-3 z-[1000] rounded-lg bg-background/95 p-3 text-sm shadow">
              Todavía no hay potreros dibujados en el mapa.
            </p>
          )}
          {completa && (
            <>
              {/* Leyenda abajo a la izquierda; el panel del potrero, abajo (celular) o al costado (computadora) */}
              {!panel && (
                <div className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-2 z-[1000] max-h-[40vh] max-w-[calc(100%-1rem)] space-y-2 overflow-y-auto rounded-lg bg-background/90 px-3 py-2 shadow">
                  {leyenda}
                  {listaNumerados}
                </div>
              )}
              {panelMovil && (
                <div className={hoja(false)}>
                  {!dibujando && !barraZona && asa}
                  {panelMovil}
                </div>
              )}
              {panel && (
                <div className="absolute bottom-3 right-16 top-3 z-[1000] hidden w-[22rem] overflow-y-auto rounded-lg bg-background p-4 shadow-2xl lg:block">
                  {panel}
                </div>
              )}
            </>
          )}
        </div>
        {panel && (
          <aside className="hidden lg:block rounded-lg border bg-card p-4 lg:h-[70vh] lg:overflow-y-auto">
            {panel}
          </aside>
        )}
      </div>

      {/* El resumen debajo del mapa: en la computadora siempre; en el celular y la tableta, mientras no se
          elige un potrero (el panel ocupa la hoja de abajo) */}
      <section className={cn("rounded-lg border bg-card p-4", panel && "hidden lg:block")}>{resumen}</section>

      {/* Leyenda (siempre: el color nunca va solo) */}
      {leyenda}
      {listaNumerados}

      {/* Sin dibujar */}
      {sinDibujar.length > 0 && (
        <section className="rounded-lg border border-dashed p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <PencilOff className="h-4 w-4 text-muted-foreground" />
            {sinDibujar.length === 1 ? "1 potrero sin dibujar" : `${sinDibujar.length} potreros sin dibujar`}
            <span className="font-normal text-muted-foreground">: no están en el mapa</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sinDibujar.map(p => (
              <button key={p.id} type="button" onClick={() => { if (!editandoAlgo) setSeleccionado(p.id) }}
                className="inline-flex min-h-11 items-center rounded-full bg-muted px-3 text-sm font-medium hover:bg-accent md:min-h-9">
                {p.nombre}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Celular y tableta: el panel sube desde abajo, encima de la barra de navegación */}
      {panelMovil && !completa && (
        <div className={hoja(true)}>
          {!dibujando && !barraZona && asa}
          {panelMovil}
        </div>
      )}
      {importando && (
        <ImportarFormas establecimientoId={establecimientoId} potreros={potreros} conForma={new Set(formas.keys())}
          onCerrar={() => setImportando(false)}
          onHecho={tocados => { setImportando(false); void avisarSuperposiciones(tocados); onCambio(); setEncuadre(n => n + 1) }} />
      )}
    </div>
  )
}
