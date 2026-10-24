"use client"

import { useState } from "react"
import { FileUp } from "lucide-react"
import { toast } from "sonner"

import { createPotrero, guardarFormaPotrero } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BOTON, SELECT_NATIVO } from "@/components/shared/estilos"
import { hectareas } from "@/components/potreros/BarraDibujo"
import { numero } from "@/components/potreros/ocupacion"
import type { Potrero } from "@/types/database"

// Un polígono del archivo y a dónde va: un potrero existente, uno nuevo o ninguno
interface Fila {
  clave: number
  nombre: string
  forma: GeoJSON.MultiPolygon
  ha: number
  destino: string            // id de potrero, "nuevo" u "omitir"
  error?: string
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()

// Los polígonos de un GeoJSON cualquiera (Feature, FeatureCollection o geometría suelta), con su nombre
function poligonosDe(geo: GeoJSON.GeoJSON): { nombre: string | null; forma: GeoJSON.MultiPolygon }[] {
  const salida: { nombre: string | null; forma: GeoJSON.MultiPolygon }[] = []
  const partes = (g: GeoJSON.Geometry | null): GeoJSON.Position[][][] => {
    if (!g) return []
    if (g.type === "Polygon") return [g.coordinates]
    if (g.type === "MultiPolygon") return g.coordinates
    if (g.type === "GeometryCollection") return g.geometries.flatMap(partes)
    return []
  }
  const agregar = (g: GeoJSON.Geometry | null, props: GeoJSON.GeoJsonProperties) => {
    const coords = partes(g)
    if (coords.length === 0) return
    const nombre = props?.name ?? props?.Name ?? props?.NAME ?? props?.nombre ?? props?.Nombre ?? props?.NOMBRE ?? null
    salida.push({ nombre: nombre == null ? null : String(nombre), forma: { type: "MultiPolygon", coordinates: coords } })
  }
  if (geo.type === "FeatureCollection") geo.features.forEach(f => agregar(f.geometry, f.properties))
  else if (geo.type === "Feature") agregar(geo.geometry, geo.properties)
  else agregar(geo, null)
  return salida
}

// Lee el archivo: KML (Google Earth), GeoJSON o shapefile en zip (con su .prj: se pasa a grados)
async function leerArchivo(archivo: File) {
  const nombre = archivo.name.toLowerCase()
  if (nombre.endsWith(".kml")) {
    const { kml } = await import("@tmcw/togeojson")
    const xml = new DOMParser().parseFromString(await archivo.text(), "text/xml")
    return poligonosDe(kml(xml) as GeoJSON.FeatureCollection)
  }
  if (nombre.endsWith(".geojson") || nombre.endsWith(".json")) {
    return poligonosDe(JSON.parse(await archivo.text()) as GeoJSON.GeoJSON)
  }
  if (nombre.endsWith(".zip")) {
    const { default: shp } = await import("shpjs")
    const res = await shp(await archivo.arrayBuffer())
    return (Array.isArray(res) ? res : [res]).flatMap(c => poligonosDe(c))
  }
  if (nombre.endsWith(".kmz")) throw new Error("Los KMZ no se leen todavía: en Google Earth, guardá el lugar como KML")
  throw new Error("Formato no reconocido: subí un KML, un GeoJSON o un shapefile en zip")
}

// Coordenadas en grados (longitud y latitud); si no, el archivo viene en otra proyección
const enGrados = (f: GeoJSON.MultiPolygon) =>
  f.coordinates.flat(2).every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90)

/**
 * Importa formas de potreros desde un archivo. Cada polígono se asigna a un potrero existente (se sugiere
 * el de igual nombre), se crea uno nuevo con ese nombre y el área como superficie, o se deja afuera.
 * Montado solo mientras está abierto.
 */
export function ImportarFormas({ establecimientoId, potreros, conForma, onCerrar, onHecho }: {
  establecimientoId: string
  potreros: Potrero[]                 // los activos
  conForma: Set<string>               // potreros que ya tienen forma (se reemplaza)
  onCerrar: () => void
  onHecho: (potrerosTocados: string[]) => void
}) {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [archivo, setArchivo] = useState<string | null>(null)
  const [actualizarSuperficie, setActualizarSuperficie] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const elegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    setTrabajando(true)
    try {
      const poligonos = await leerArchivo(f)
      if (poligonos.length === 0) throw new Error("El archivo no tiene polígonos")
      const usados = new Set<string>()
      setFilas(poligonos.map((p, i) => {
        const nombre = p.nombre?.trim() || `Polígono ${i + 1}`
        // Sugerencia: el potrero con el mismo nombre (sin repetir)
        const igual = potreros.find(x => normalizar(x.nombre) === normalizar(nombre) && !usados.has(x.id))
        if (igual) usados.add(igual.id)
        const grados = enGrados(p.forma)
        return {
          clave: i, nombre, forma: p.forma, ha: grados ? hectareas(p.forma) : 0,
          destino: grados ? (igual?.id ?? "nuevo") : "omitir",
          error: grados ? undefined : "Las coordenadas no están en grados (longitud y latitud): exportalo en WGS84",
        }
      }))
      setArchivo(f.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo")
    } finally {
      setTrabajando(false)
    }
  }

  const cambiarDestino = (clave: number, destino: string) =>
    setFilas(prev => prev?.map(f => (f.clave === clave ? { ...f, destino } : f)) ?? null)

  const importar = async () => {
    if (!filas) return
    const elegidas = filas.filter(f => f.destino !== "omitir")
    const repetidos = elegidas.map(f => f.destino).filter((d, i, a) => d !== "nuevo" && a.indexOf(d) !== i)
    if (repetidos.length > 0) return setError("Dos polígonos van al mismo potrero: elegí uno solo para cada potrero")
    if (elegidas.length === 0) return setError("No hay nada para importar")

    setError(null)
    setTrabajando(true)
    const tocados: string[] = []
    const fallas: string[] = []
    for (const f of elegidas) {
      try {
        let id = f.destino
        if (f.destino === "nuevo") {
          const nuevo = await createPotrero({
            establecimiento_id: establecimientoId, nombre: f.nombre, superficie: Math.max(f.ha, 0.01), estado: "activo",
            uso_actual: null, tipo_pastura: null, aguada: null, sombra: null, observaciones: null,
          })
          id = nuevo.id
        }
        await guardarFormaPotrero(id, f.forma, f.destino !== "nuevo" && actualizarSuperficie)
        tocados.push(id)
      } catch (err) {
        fallas.push(`${f.nombre}: ${mensajeDeError(err)}`)
      }
    }
    setTrabajando(false)
    if (tocados.length > 0) toast.success(tocados.length === 1 ? "1 forma importada" : `${tocados.length} formas importadas`)
    if (fallas.length > 0) {
      setError(`No se importaron:\n${fallas.join("\n")}`)
      setFilas(prev => prev?.filter(f => fallas.some(x => x.startsWith(`${f.nombre}:`))) ?? null)
      if (tocados.length > 0) onHecho(tocados)
      return
    }
    onHecho(tocados)
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !trabajando) onCerrar() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar formas de potreros</DialogTitle>
          <DialogDescription>
            Un archivo KML (Google Earth: clic derecho en la carpeta, &quot;Guardar lugar como&quot;, tipo KML), GeoJSON o un shapefile en zip.
          </DialogDescription>
        </DialogHeader>

        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-medium hover:bg-muted">
          <FileUp className="h-5 w-5" />
          {archivo ?? "Elegir archivo"}
          <input type="file" accept=".kml,.geojson,.json,.zip,.kmz" className="sr-only" onChange={elegirArchivo} disabled={trabajando} />
        </label>

        {filas && (
          <>
            <ul className="divide-y rounded-lg border">
              {filas.map(f => (
                <li key={f.clave} className="space-y-1.5 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium truncate">{f.nombre}</span>
                    {!f.error && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{numero(f.ha, 2)} ha</span>}
                  </div>
                  {f.error ? (
                    <p className="text-sm text-destructive">{f.error}</p>
                  ) : (
                    <select aria-label={`Destino de ${f.nombre}`} className={SELECT_NATIVO} value={f.destino}
                      onChange={e => cambiarDestino(f.clave, e.target.value)}>
                      <option value="nuevo">Crear el potrero &quot;{f.nombre}&quot;</option>
                      {potreros.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}{conForma.has(p.id) ? " (reemplaza su forma)" : ""}</option>
                      ))}
                      <option value="omitir">No importar</option>
                    </select>
                  )}
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 min-h-11 cursor-pointer select-none">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={actualizarSuperficie} onChange={e => setActualizarSuperficie(e.target.checked)} />
              <span className="text-sm">En los potreros que ya existen, usar el área dibujada como superficie</span>
            </label>
          </>
        )}

        {error && <p role="alert" className="whitespace-pre-line text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button className={BOTON} disabled={!filas || trabajando} onClick={importar}>{trabajando ? "Importando..." : "Importar"}</Button>
          <Button variant="outline" className={BOTON} disabled={trabajando} onClick={onCerrar}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
