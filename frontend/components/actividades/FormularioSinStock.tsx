"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  registrarDiagnostico, registrarEsquila, registrarPersonalizada, registrarSanidad, registrarServicio,
} from "@/lib/queries/actividades"
import { getEventosLote } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DESCRIPCION_ACTIVIDAD, ETIQUETA_ACTIVIDAD, nuevoId } from "@/components/actividades/formato"
import { BOTON, CAMPO, SELECT_NATIVO, TEXTAREA } from "@/components/shared/estilos"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import type { Especie, Lote, StockLote } from "@/types/lotes"
import type { CampoPersonalizado, ProductoCarga, TipoActividad6b1 } from "@/types/actividades"

export interface DatosSinStock {
  estId: string
  lotes: Lote[]
  especies: Especie[]
  stock: StockLote[]
  personas: { id: string; nombre: string; activo: boolean }[]
  categoriasSanidad: string[]
  vias: string[]
  nombresPersonalizadas: string[]
}

interface ProductoForm {
  clave: number
  producto: string
  categoria: string
  dosis: string
  via: string
  carencia: string
  proxima: string
}

interface CampoForm {
  clave: number
  campo: string
  valor: string
}

let siguienteClave = 1
const productoVacio = (): ProductoForm => ({ clave: siguienteClave++, producto: "", categoria: "", dosis: "", via: "", carencia: "", proxima: "" })
const campoVacio = (): CampoForm => ({ clave: siguienteClave++, campo: "", valor: "" })

// Número de un campo de texto: null si está vacío, NaN si no es un número
const leer = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")))

const VARIOS_LOTES: TipoActividad6b1[] = ["sanidad", "esquila", "personalizada"]

/**
 * Formulario de las actividades que no mueven stock (6b-1).
 * Sanidad, esquila y personalizada: uno o más lotes. Servicio y diagnóstico: un lote.
 */
export function FormularioSinStock({ tipo, loteInicial, datos }: { tipo: TipoActividad6b1; loteInicial: string; datos: DatosSinStock }) {
  const router = useRouter()
  const { lotes, especies, stock, personas, categoriasSanidad, vias, nombresPersonalizadas } = datos

  const grupoDe = (lote: Lote) => especies.find(e => e.id === lote.especie_id)?.grupo
  const especieDe = (lote: Lote) => especies.find(e => e.id === lote.especie_id)?.nombre ?? ""
  // Esquila: solo lotes de especies del grupo ovino
  const lotesElegibles = tipo === "esquila" ? lotes.filter(l => grupoDe(l) === "ovino") : lotes
  const varios = VARIOS_LOTES.includes(tipo)
  const inicialValido = lotesElegibles.some(l => l.id === loteInicial)

  // Id de la actividad: se genera una vez al abrir el formulario y se reusa en los reintentos
  const [id] = useState(nuevoId)
  const [fecha, setFecha] = useState(hoyLocal())
  const [seleccion, setSeleccion] = useState<string[]>(inicialValido ? [loteInicial] : [])
  const [loteId, setLoteId] = useState(inicialValido ? loteInicial : "")
  const [personaId, setPersonaId] = useState("")
  const [notas, setNotas] = useState("")

  const [productos, setProductos] = useState<ProductoForm[]>(() => [productoVacio()])
  const [entoradas, setEntoradas] = useState("")
  const [toros, setToros] = useState("")
  const [diagnosticadas, setDiagnosticadas] = useState("")
  const [prenadas, setPrenadas] = useState("")
  const [kgLana, setKgLana] = useState("")
  const [nombre, setNombre] = useState("")
  const [campos, setCampos] = useState<CampoForm[]>(() => [campoVacio()])

  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Servicio y diagnóstico: stock del lote a la fecha elegida, para avisar (sin bloquear)
  const [stockAFecha, setStockAFecha] = useState<{ clave: string; cabezas: number } | null>(null)
  const claveStock = `${loteId}:${fecha}`
  useEffect(() => {
    if (varios || !loteId || !fecha) return
    let vigente = true
    getEventosLote(loteId)
      .then(eventos => {
        if (!vigente) return
        const cabezas = eventos.filter(e => e.fecha <= fecha).reduce((s, e) => s + e.cabezas, 0)
        setStockAFecha({ clave: `${loteId}:${fecha}`, cabezas })
      })
      .catch(() => { /* el aviso es opcional */ })
    return () => { vigente = false }
  }, [varios, loteId, fecha])
  const stockLoteFecha = stockAFecha?.clave === claveStock ? stockAFecha.cabezas : null

  // Esquila: cabezas actuales de los lotes elegidos (para el kg por cabeza aproximado)
  const cabezasSeleccion = stock.filter(s => seleccion.includes(s.lote_id)).reduce((t, s) => t + s.cabezas, 0)

  const lote = lotes.find(l => l.id === loteId)
  const fechaMinima = varios
    ? lotes.filter(l => seleccion.includes(l.id)).reduce<string | undefined>((m, l) => (!m || l.fecha_apertura > m ? l.fecha_apertura : m), undefined)
    : lote?.fecha_apertura

  const alternar = (id: string) =>
    setSeleccion(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  const cambiarProducto = (clave: number, cambio: Partial<ProductoForm>) =>
    setProductos(prev => prev.map(p => (p.clave === clave ? { ...p, ...cambio } : p)))
  const cambiarCampo = (clave: number, cambio: Partial<CampoForm>) =>
    setCampos(prev => prev.map(c => (c.clave === clave ? { ...c, ...cambio } : c)))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (varios && seleccion.length === 0) return setError("Elegí al menos un lote")
    if (!varios && !loteId) return setError("Elegí el lote")

    const comunes = { id, fecha, persona_id: personaId || null, notas: notas.trim() || null }
    const variosLotes = { ...comunes, establecimiento_id: datos.estId, lotes: seleccion }

    let enviar: () => Promise<string>
    if (tipo === "sanidad") {
      const lista: ProductoCarga[] = []
      for (const p of productos) {
        if (!p.producto.trim()) return setError("Cada producto necesita un nombre")
        if (!p.categoria) return setError(`Elegí la categoría de ${p.producto.trim()}`)
        const item: ProductoCarga = { producto: p.producto.trim(), categoria: p.categoria }
        if (p.dosis.trim()) item.dosis = p.dosis.trim()
        if (p.via) item.via = p.via
        const carencia = leer(p.carencia)
        if (carencia !== null) {
          if (!Number.isInteger(carencia) || carencia < 0) return setError("La carencia tiene que ser un número entero de días, cero o más")
          item.carencia_dias = carencia
        }
        if (p.proxima) {
          if (p.proxima <= fecha) return setError("La próxima dosis tiene que ser posterior a la fecha de la sanidad")
          item.fecha_proxima_dosis = p.proxima
        }
        lista.push(item)
      }
      if (lista.length === 0) return setError("Indicá al menos un producto")
      enviar = () => registrarSanidad({ ...variosLotes, productos: lista })
    } else if (tipo === "esquila") {
      const kg = leer(kgLana)
      // Mínimo 0,1 kg: la base redondea a 1 decimal
      if (kg === null || Number.isNaN(kg) || kg < 0.1) return setError("Los kg de lana tienen que ser al menos 0,1")
      enviar = () => registrarEsquila({ ...variosLotes, kg_lana_total: kg })
    } else if (tipo === "personalizada") {
      if (!nombre.trim()) return setError("La actividad necesita un nombre")
      const lista: CampoPersonalizado[] = []
      const vistos = new Set<string>()
      for (const c of campos) {
        if (!c.campo.trim() && !c.valor.trim()) continue   // fila vacía: se ignora
        if (!c.campo.trim() || !c.valor.trim()) return setError("Cada campo necesita nombre y valor")
        const k = c.campo.trim().toLowerCase()
        if (vistos.has(k)) return setError(`El campo "${c.campo.trim()}" está repetido`)
        vistos.add(k)
        lista.push({ campo: c.campo.trim(), valor: c.valor.trim() })
      }
      if (lista.length > 20) return setError("Hasta 20 campos")
      enviar = () => registrarPersonalizada({ ...variosLotes, nombre: nombre.trim(), campos: lista })
    } else if (tipo === "servicio") {
      const e = leer(entoradas)
      if (e === null || !Number.isInteger(e) || e <= 0) return setError("Las vacas entoradas tienen que ser un número entero mayor a cero")
      const t = leer(toros)
      if (t !== null && (!Number.isInteger(t) || t <= 0)) return setError("Los toros tienen que ser un número entero mayor a cero (o dejarlo vacío)")
      enviar = () => registrarServicio({ ...comunes, lote_id: loteId, vacas_entoradas: e, toros: t })
    } else {
      const d = leer(diagnosticadas)
      const p = leer(prenadas)
      if (d === null || !Number.isInteger(d) || d <= 0) return setError("Las diagnosticadas tienen que ser un número entero mayor a cero")
      if (p === null || !Number.isInteger(p) || p < 0) return setError("Las preñadas tienen que ser un número entero, cero o más")
      if (p > d) return setError("Las preñadas no pueden ser más que las diagnosticadas")
      enviar = () => registrarDiagnostico({ ...comunes, lote_id: loteId, vacas_diagnosticadas: d, vacas_prenadas: p })
    }

    setEnviando(true)
    try {
      await enviar()
      toast.success(`${ETIQUETA_ACTIVIDAD[tipo]} registrada`)
      router.push(`/actividades/${id}`)
    } catch (err) {
      // El id se conserva: si el envío llegó a guardarse, reintentar no lo duplica
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  // Aviso (sin bloquear) en servicio y diagnóstico si las cabezas superan el stock a esa fecha
  const cabezasCargadas = tipo === "servicio" ? leer(entoradas) : tipo === "diagnostico_gestacion" ? leer(diagnosticadas) : null
  const superaStock = stockLoteFecha !== null && cabezasCargadas !== null && !Number.isNaN(cabezasCargadas) && cabezasCargadas > stockLoteFecha

  const kgNum = leer(kgLana)
  const prenadasNum = leer(prenadas)
  const diagNum = leer(diagnosticadas)

  return (
    <>
      <h1 className="text-2xl font-bold">{ETIQUETA_ACTIVIDAD[tipo]}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">{DESCRIPCION_ACTIVIDAD[tipo]}.</p>

      <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
        {/* Lotes */}
        {varios ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">
              Lotes {tipo === "esquila" && <span className="font-normal text-muted-foreground">(solo ovinos)</span>}
            </legend>
            {lotesElegibles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {tipo === "esquila" ? "No hay lotes activos de especies del grupo ovino." : "No hay lotes activos."}
              </p>
            ) : (
              <div className="rounded-lg border divide-y max-h-72 overflow-y-auto">
                {lotesElegibles.map(l => (
                  <label key={l.id} className="flex items-center gap-3 px-3 min-h-11 cursor-pointer select-none">
                    <input type="checkbox" className="h-5 w-5 accent-primary" checked={seleccion.includes(l.id)} onChange={() => alternar(l.id)} />
                    <span className="flex-1 text-base md:text-sm">{l.nombre}</span>
                    <span className="text-xs text-muted-foreground">{especieDe(l)}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{seleccion.length} {seleccion.length === 1 ? "lote elegido" : "lotes elegidos"}</p>
          </fieldset>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="ss-lote">Lote</Label>
            <select id="ss-lote" className={SELECT_NATIVO} value={loteId} onChange={e => setLoteId(e.target.value)}>
              <option value="">Elegí un lote</option>
              {lotes.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ss-fecha">Fecha</Label>
          <Input id="ss-fecha" type="date" max={hoyLocal()} min={fechaMinima} className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>

        {/* Sanidad: productos */}
        {tipo === "sanidad" && (
          <div className="space-y-3">
            {productos.map((p, i) => (
              <Card key={p.clave}>
                <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">Producto {productos.length > 1 ? i + 1 : ""}</CardTitle>
                  {productos.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" aria-label="Quitar este producto"
                      onClick={() => setProductos(prev => prev.filter(x => x.clave !== p.clave))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`ss-prod-${p.clave}`}>Producto</Label>
                    <Input id={`ss-prod-${p.clave}`} className={CAMPO} placeholder="Ej: Ivermectina 1%"
                      value={p.producto} onChange={e => cambiarProducto(p.clave, { producto: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`ss-cat-${p.clave}`}>Categoría</Label>
                      <select id={`ss-cat-${p.clave}`} className={SELECT_NATIVO} value={p.categoria}
                        onChange={e => cambiarProducto(p.clave, { categoria: e.target.value })}>
                        <option value="">Elegí</option>
                        {categoriasSanidad.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ss-via-${p.clave}`}>Vía</Label>
                      <select id={`ss-via-${p.clave}`} className={SELECT_NATIVO} value={p.via}
                        onChange={e => cambiarProducto(p.clave, { via: e.target.value })}>
                        <option value="">Sin indicar</option>
                        {vias.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`ss-dosis-${p.clave}`}>Dosis</Label>
                    <Input id={`ss-dosis-${p.clave}`} className={CAMPO} placeholder="Ej: 1 ml cada 50 kg"
                      value={p.dosis} onChange={e => cambiarProducto(p.clave, { dosis: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`ss-car-${p.clave}`}>Carencia (días)</Label>
                      <Input id={`ss-car-${p.clave}`} type="number" inputMode="numeric" min="0" step="1" placeholder="0"
                        className={CAMPO} value={p.carencia} onChange={e => cambiarProducto(p.clave, { carencia: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ss-prox-${p.clave}`}>Próxima dosis</Label>
                      <Input id={`ss-prox-${p.clave}`} type="date" min={fecha} className={CAMPO}
                        value={p.proxima} onChange={e => cambiarProducto(p.clave, { proxima: e.target.value })} />
                    </div>
                  </div>
                  {leer(p.carencia) ? (
                    <p className="text-xs text-muted-foreground">
                      En carencia hasta el {fechaCorta(sumarDias(fecha, Number(leer(p.carencia))))}.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
            {productos.length < 20 && (
              <Button type="button" variant="outline" className="w-full" onClick={() => setProductos(prev => [...prev, productoVacio()])}>
                <Plus className="h-4 w-4 mr-1" /> Agregar otro producto
              </Button>
            )}
          </div>
        )}

        {/* Servicio */}
        {tipo === "servicio" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ss-entoradas">Vacas entoradas</Label>
              <Input id="ss-entoradas" type="number" inputMode="numeric" min="1" step="1" className={CAMPO}
                value={entoradas} onChange={e => setEntoradas(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ss-toros">Toros <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="ss-toros" type="number" inputMode="numeric" min="1" step="1" className={CAMPO}
                value={toros} onChange={e => setToros(e.target.value)} />
            </div>
          </div>
        )}

        {/* Diagnóstico */}
        {tipo === "diagnostico_gestacion" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ss-diag">Diagnosticadas</Label>
                <Input id="ss-diag" type="number" inputMode="numeric" min="1" step="1" className={CAMPO}
                  value={diagnosticadas} onChange={e => setDiagnosticadas(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ss-pren">Preñadas</Label>
                <Input id="ss-pren" type="number" inputMode="numeric" min="0" step="1" className={CAMPO}
                  value={prenadas} onChange={e => setPrenadas(e.target.value)} />
              </div>
            </div>
            {diagNum !== null && prenadasNum !== null && diagNum > 0 && prenadasNum >= 0 && prenadasNum <= diagNum && (
              <p className="text-sm text-muted-foreground">
                Vacías: {diagNum - prenadasNum} · preñez {Math.round((prenadasNum / diagNum) * 1000) / 10} %
              </p>
            )}
          </>
        )}

        {superaStock && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            El lote tenía {stockLoteFecha} cabezas ese día y cargaste {cabezasCargadas}. Se puede guardar igual; revisá que esté bien.
          </p>
        )}

        {/* Esquila */}
        {tipo === "esquila" && (
          <div className="space-y-1.5">
            <Label htmlFor="ss-lana">Kg de lana (total de la carga)</Label>
            <Input id="ss-lana" type="text" inputMode="decimal" placeholder="Ej: 350,5" className={CAMPO}
              value={kgLana} onChange={e => setKgLana(e.target.value)} />
            {kgNum !== null && kgNum > 0 && cabezasSeleccion > 0 && (
              <p className="text-xs text-muted-foreground">
                Promedio aproximado: {(kgNum / cabezasSeleccion).toLocaleString("es-UY", { maximumFractionDigits: 2 })} kg por cabeza
                ({cabezasSeleccion} cabezas en los lotes elegidos, todas las categorías).
              </p>
            )}
          </div>
        )}

        {/* Personalizada */}
        {tipo === "personalizada" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ss-nombre">Nombre de la actividad</Label>
              <Input id="ss-nombre" list="ss-nombres" className={CAMPO} placeholder="Ej: Revisión de caravanas"
                value={nombre} onChange={e => setNombre(e.target.value)} />
              <datalist id="ss-nombres">
                {nombresPersonalizadas.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-1">Campos <span className="font-normal text-muted-foreground">(opcionales)</span></legend>
              {campos.map(c => (
                <div key={c.clave} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input aria-label="Campo" className={CAMPO} placeholder="Campo" value={c.campo} onChange={e => cambiarCampo(c.clave, { campo: e.target.value })} />
                  <Input aria-label="Valor" className={CAMPO} placeholder="Valor" value={c.valor} onChange={e => cambiarCampo(c.clave, { valor: e.target.value })} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Quitar este campo" className="h-11 w-11 md:h-9 md:w-9"
                    onClick={() => setCampos(prev => (prev.length > 1 ? prev.filter(x => x.clave !== c.clave) : [campoVacio()]))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {campos.length < 20 && (
                <Button type="button" variant="outline" className="w-full" onClick={() => setCampos(prev => [...prev, campoVacio()])}>
                  <Plus className="h-4 w-4 mr-1" /> Agregar campo
                </Button>
              )}
            </fieldset>
          </>
        )}

        {/* Comunes */}
        <div className="space-y-1.5">
          <Label htmlFor="ss-persona">Responsable</Label>
          <select id="ss-persona" className={SELECT_NATIVO} value={personaId} onChange={e => setPersonaId(e.target.value)}>
            <option value="">Sin indicar</option>
            {personas.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ss-notas">Notas</Label>
          <textarea id="ss-notas" rows={2} className={TEXTAREA} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Guardando..." : "Guardar"}</Button>
          <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>Cancelar</Button>
        </div>
      </form>
    </>
  )
}

// Fecha ISO + n días (sin husos: se trabaja con la fecha local del formulario)
function sumarDias(iso: string, dias: number) {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString("en-CA")
}
