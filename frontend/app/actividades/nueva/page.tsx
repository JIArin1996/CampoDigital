"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { useEstablecimiento } from "@/lib/context/EstablecimientoContext"
import {
  getCarencias, getNombresPersonalizadas, getRubros, registrarCompra, registrarMortandad, registrarParicion, registrarPesada,
  registrarVenta,
} from "@/lib/queries/actividades"
import { getPersonas } from "@/lib/queries/bitacora"
import { getCategorias, getEspecies, getLotes, getStockLotes } from "@/lib/queries/lotes"
import { getParametros } from "@/lib/queries/parametros"
import { getPotreros } from "@/lib/queries/potreros"
import { mensajeDeError } from "@/lib/supabase/errores"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VolverAlLote } from "@/components/lotes/VolverAlLote"
import {
  DESCRIPCION_ACTIVIDAD, ETIQUETA_ACTIVIDAD, ETIQUETA_MODALIDAD, ICONO_ACTIVIDAD, MODALIDADES, TIPOS_6A, TIPOS_6B1,
  errorKg, esTipo6a, esTipoCargable, nuevoId,
} from "@/components/actividades/formato"
import { FormularioSinStock } from "@/components/actividades/FormularioSinStock"
import { FormularioDestete } from "@/components/actividades/FormularioDestete"
import { AvisoCarencia } from "@/components/actividades/AvisoCarencia"
import { SelectorAnios } from "@/components/lotes/SelectorAnios"
import { BOTON, CAMPO, SELECT_NATIVO, TEXTAREA } from "@/components/shared/estilos"
import { hoyLocal } from "@/components/lotes/formato"
import { SelectorResponsables } from "@/components/shared/Responsables"
import { cn } from "@/lib/utils"
import type { Potrero } from "@/types/database"
import type { CategoriaAnimal, Especie, Lote, StockLote } from "@/types/lotes"
import type {
  Carencia, EstadoPago, LineaCarga, LoteNuevoCarga, Modalidad, Moneda, PrecioCarga, TipoActividad6a, TipoCargable,
} from "@/types/actividades"
import { CampoTipoCambio } from "@/components/economia/CampoTipoCambio"
import { tipoCambioVacio, type TipoCambioForm } from "@/components/economia/formato"
import {
  CampoComentario, CampoIdentificador, CampoPagador, DatosFactura, leerPagoFactura, pagoFacturaVacio, type PagoFacturaForm,
} from "@/components/economia/PagoYFactura"

type Persona = Awaited<ReturnType<typeof getPersonas>>[number]
type Rubro = Awaited<ReturnType<typeof getRubros>>[number]

interface Datos {
  estId: string
  lotes: Lote[]
  especies: Especie[]
  categorias: CategoriaAnimal[]
  stock: StockLote[]
  potreros: Potrero[]
  personas: Persona[]
  rubros: Rubro[]
  causas: string[]
  categoriasSanidad: string[]
  vias: string[]
  nombresPersonalizadas: string[]
}

export default function NuevaActividadPage() {
  return (
    <Suspense fallback={<PageContainer><div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>}>
      <NuevaActividad />
    </Suspense>
  )
}

function NuevaActividad() {
  const params = useSearchParams()
  const tipoParam = params.get("tipo")
  const loteParam = params.get("lote") ?? ""
  const { establecimientoActivo, puedeOperar, cargando } = useEstablecimiento()
  const estId = establecimientoActivo?.id

  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!estId) return
    let vigente = true
    Promise.all([
      getLotes(estId, "activo"), getEspecies(estId), getCategorias(estId), getStockLotes(estId),
      getPotreros(estId), getPersonas(estId), getRubros(estId), getParametros("causas_mortandad"),
      getParametros("categorias_sanidad"), getParametros("vias_aplicacion"), getNombresPersonalizadas(estId),
    ])
      .then(([lotes, especies, categorias, stock, potreros, personas, rubros, causas, categoriasSanidad, vias, nombresPersonalizadas]) => {
        if (vigente) {
          setDatos({
            estId, lotes, especies, categorias, stock, potreros, personas, rubros, causas, categoriasSanidad, vias, nombresPersonalizadas,
          })
        }
      })
      .catch(err => { if (vigente) setError(mensajeDeError(err, "No se pudieron cargar los datos")) })
    return () => { vigente = false }
  }, [estId])

  const volver = loteParam
    ? <VolverAlLote href={`/lotes/${loteParam}`} />
    : <VolverAlLote href="/actividades" texto="Volver a actividades" />

  if (cargando) return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  if (!establecimientoActivo) {
    return <PageContainer>{volver}<p className="text-muted-foreground">Elegí un establecimiento.</p></PageContainer>
  }
  if (!puedeOperar) {
    return <PageContainer>{volver}<p className="text-muted-foreground">No tenés permiso de carga en este establecimiento.</p></PageContainer>
  }

  // Sin tipo: elegir qué se carga
  if (!esTipoCargable(tipoParam)) {
    const opcion = (t: TipoCargable) => {
      const Icono = ICONO_ACTIVIDAD[t]
      const href = `/actividades/nueva?tipo=${t}${loteParam ? `&lote=${loteParam}` : ""}`
      return (
        <li key={t}>
          <Link href={href} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-3 hover:bg-muted active:bg-muted">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Icono className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{ETIQUETA_ACTIVIDAD[t]}</span>
              <span className="block text-sm text-muted-foreground">{DESCRIPCION_ACTIVIDAD[t]}</span>
            </span>
          </Link>
        </li>
      )
    }
    return (
      <PageContainer>
        {volver}
        <h1 className="text-2xl font-bold mb-4">¿Qué actividad cargás?</h1>
        <div className="space-y-5 max-w-xl">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">Cambian el stock o lo miden</h2>
            <ul className="space-y-2">{[...TIPOS_6A, "destete" as const].map(opcion)}</ul>
          </section>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">Manejo y sanidad</h2>
            <ul className="space-y-2">{TIPOS_6B1.map(opcion)}</ul>
          </section>
        </div>
      </PageContainer>
    )
  }

  if (error) return <PageContainer>{volver}<p role="alert" className="text-sm text-destructive">{error}</p></PageContainer>
  if (!datos || datos.estId !== estId) {
    return <PageContainer>{volver}<div className="h-96 rounded-lg border bg-muted/30 animate-pulse" /></PageContainer>
  }

  // key: un formulario nuevo (con su propio id) por tipo y lote de entrada
  return (
    <PageContainer>
      {volver}
      {esTipo6a(tipoParam) ? (
        <Formulario key={`${tipoParam}:${loteParam}`} tipo={tipoParam} loteInicial={loteParam} datos={datos} />
      ) : tipoParam === "destete" ? (
        <FormularioDestete key={loteParam} loteInicial={loteParam} datos={datos} />
      ) : (
        <FormularioSinStock key={`${tipoParam}:${loteParam}`} tipo={tipoParam} loteInicial={loteParam} datos={datos} />
      )}
    </PageContainer>
  )
}

// Nombre por defecto del lote de cría
// Por grupo de especie (no por nombre)
function nombreLoteCria(grupo: string | undefined, fecha: string) {
  const anio = fecha.slice(0, 4)
  if (grupo === "bovino") return `Terneros Nacidos ${anio}`
  if (grupo === "ovino") return `Corderos Nacidos ${anio}`
  return `Crías ${anio}`
}

// Número de un campo de texto: null si está vacío, NaN si no es un número
const leer = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")))

function Formulario({ tipo, loteInicial, datos }: { tipo: TipoActividad6a; loteInicial: string; datos: Datos }) {
  const router = useRouter()
  const { lotes, especies, categorias, stock, potreros, personas, rubros, causas } = datos

  // Id de la actividad: se genera una vez al abrir el formulario y se reusa en los reintentos
  const [id] = useState(nuevoId)
  const [fecha, setFecha] = useState(hoyLocal())
  const [loteId, setLoteId] = useState(lotes.some(l => l.id === loteInicial) ? loteInicial : "")
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [pesos, setPesos] = useState<Record<string, string>>({})
  const [responsables, setResponsables] = useState<string[]>([])
  const [notas, setNotas] = useState("")

  // Compra: lote existente o nuevo
  const [destinoNuevo, setDestinoNuevo] = useState(tipo === "compra" && !loteInicial)
  const [nuevoNombre, setNuevoNombre] = useState("")
  const [nuevoEspecie, setNuevoEspecie] = useState(especies[0]?.id ?? "")
  const [nuevoPotrero, setNuevoPotrero] = useState("")
  const [nuevoAnios, setNuevoAnios] = useState<number[]>([])   // los que se indiquen; no se infieren

  // Compra y venta
  const [modalidad, setModalidad] = useState<Modalidad>(tipo === "venta" ? "frigorifico" : "productor")
  const [contraparte, setContraparte] = useState("")
  const [kgGancho, setKgGancho] = useState("")
  const [conPrecio, setConPrecio] = useState(false)
  const [monto, setMonto] = useState("")
  const [moneda, setMoneda] = useState<Moneda>("USD")
  const [tipoCambio, setTipoCambio] = useState<TipoCambioForm>(tipoCambioVacio)
  const [estadoPago, setEstadoPago] = useState<EstadoPago>("pendiente")
  const [fechaPago, setFechaPago] = useState("")
  const [rubroId, setRubroId] = useState("")
  const [pagoFactura, setPagoFactura] = useState<PagoFacturaForm>(pagoFacturaVacio)

  // Mortandad
  const [causa, setCausa] = useState("Desconocida")
  const [observaciones, setObservaciones] = useState("")

  // Parición: las crías quedan con las madres (por defecto), van a un lote nuevo o a uno existente
  const [destinoCria, setDestinoCria] = useState<"madres" | "nuevo" | "existente">("madres")
  const [criaId, setCriaId] = useState("")
  const [criaNombre, setCriaNombre] = useState("")
  const [criaPotrero, setCriaPotrero] = useState("")
  const [nacidosMuertos, setNacidosMuertos] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Venta: carencias del lote vigentes a la fecha de la venta (aviso, no bloquea)
  const [carencias, setCarencias] = useState<{ clave: string; lista: Carencia[] } | null>(null)
  const claveCarencias = `${loteId}:${fecha}`
  useEffect(() => {
    if (tipo !== "venta" || !loteId || !fecha) return
    let vigente = true
    getCarencias([loteId], fecha)
      .then(lista => { if (vigente) setCarencias({ clave: `${loteId}:${fecha}`, lista }) })
      .catch(() => { /* el aviso es opcional */ })
    return () => { vigente = false }
  }, [tipo, loteId, fecha])
  const carenciasVenta = tipo === "venta" && carencias?.clave === claveCarencias ? carencias.lista : []

  const lote = lotes.find(l => l.id === loteId)
  const especieId = tipo === "compra" && destinoNuevo ? nuevoEspecie : lote?.especie_id
  const especie = especies.find(e => e.id === especieId)
  const stockLote = new Map(stock.filter(s => s.lote_id === loteId).map(s => [s.categoria_id, s.cabezas]))
  const hay = (catId: string) => stockLote.get(catId) ?? 0

  // Categorías que se muestran: las que tienen stock (pesada, venta, mortandad), las de cría al pie
  // (parición: la base no acepta otras) o todas las de la especie (compra)
  const conStock = tipo === "pesada" || tipo === "venta" || tipo === "mortandad"
  const categoriasForm = categorias
    .filter(c => c.especie_id === especieId)
    .filter(c => !conStock || hay(c.id) > 0)
    .filter(c => tipo !== "paricion" || c.cria_al_pie)
  const llevaPeso = tipo === "pesada" || tipo === "compra" || tipo === "venta"
  const total = categoriasForm.reduce((s, c) => s + (Number(cantidades[c.id]) || 0), 0)
  // Peso promedio en vivo: solo con las categorías que tienen cabezas y peso
  const conPeso = categoriasForm
    .map(c => ({ cab: Number(cantidades[c.id]) || 0, kg: leer(pesos[c.id] ?? "") }))
    .filter((x): x is { cab: number; kg: number } => x.cab > 0 && x.kg !== null && x.kg > 0)
  const pesoTotal = conPeso.reduce((s, x) => s + x.kg, 0)
  const cabezasConPeso = conPeso.reduce((s, x) => s + x.cab, 0)

  const lotesCria = lotes.filter(l => l.id !== loteId && l.especie_id === lote?.especie_id)
  // El rubro por defecto es el de la especie (el mismo que usa la base), no uno con el mismo nombre
  const rubroPorDefecto = rubros.find(r => r.id === especie?.rubro_id)
  const sinFechaMinima = tipo === "compra" && destinoNuevo

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Destino o lote
    if (tipo === "compra" && destinoNuevo) {
      if (!nuevoNombre.trim()) return setError("El lote nuevo necesita un nombre")
      if (!nuevoEspecie) return setError("Elegí la especie del lote nuevo")
    } else if (!lote) {
      return setError(tipo === "paricion" ? "Elegí el lote de las madres" : "Elegí el lote")
    }

    // Líneas
    const lineas: LineaCarga[] = []
    for (const c of categoriasForm) {
      const cab = leer(cantidades[c.id] ?? "")
      if (cab === null || cab === 0) continue
      if (!Number.isInteger(cab) || cab < 0) return setError("Las cabezas tienen que ser números enteros, sin decimales ni negativos")
      if (conStock && tipo !== "pesada" && cab > hay(c.id)) {
        return setError(`Hay ${hay(c.id)} ${c.nombre.toLowerCase()} en el lote`)
      }
      const linea: LineaCarga = { categoria_id: c.id, cabezas: cab }
      const peso = llevaPeso ? leer(pesos[c.id] ?? "") : null
      if (peso !== null) {
        const errorPeso = errorKg(pesos[c.id] ?? "", `El peso vivo de ${c.nombre.toLowerCase()}`)
        if (errorPeso) return setError(errorPeso)
        linea.peso_vivo_total_kg = peso
      } else if (tipo === "pesada") {
        return setError(`Falta el peso vivo total de ${c.nombre.toLowerCase()}`)
      }
      lineas.push(linea)
    }
    if (lineas.length === 0) return setError("Indicá las cabezas de al menos una categoría")

    // Compra y venta: kg al gancho y precio
    const gancho = leer(kgGancho)
    if (gancho !== null) {
      const errorGancho = errorKg(kgGancho, "Los kg al gancho")
      if (errorGancho) return setError(errorGancho)
    }
    let precio: PrecioCarga | null = null
    if ((tipo === "compra" || tipo === "venta") && conPrecio) {
      const m = leer(monto)
      if (m === null || Number.isNaN(m) || m <= 0) return setError("El monto tiene que ser un número mayor a cero")
      precio = { monto: m, moneda, estado: estadoPago }
      if (moneda === "UYU") {
        const tc = leer(tipoCambio.texto)
        if (tc === null || Number.isNaN(tc) || tc <= 0) return setError("Con pesos hay que cargar el tipo de cambio")
        precio.tipo_cambio = tc
        if (tipoCambio.fechaBcu) precio.tipo_cambio_fecha = tipoCambio.fechaBcu
      }
      if (fechaPago) precio.fecha_pago = fechaPago
      if (rubroId) precio.rubro_id = rubroId
      const pago = leerPagoFactura(pagoFactura)
      if ("error" in pago) return setError(pago.error)
      Object.assign(precio, pago.datos)
    }

    // Parición
    const muertos = leer(nacidosMuertos)
    if (muertos !== null && (!Number.isInteger(muertos) || muertos < 0)) return setError("Los nacidos muertos tienen que ser un número entero, cero o más")
    let criaNuevo: LoteNuevoCarga | null = null
    if (tipo === "paricion") {
      if (destinoCria === "nuevo") {
        const nombre = criaNombre.trim() || nombreLoteCria(especie?.grupo, fecha)
        criaNuevo = { nombre }
        if (criaPotrero) criaNuevo.potrero_id = criaPotrero
      } else if (destinoCria === "existente" && !criaId) {
        return setError("Elegí el lote de cría")
      }
    }

    const comunes = { id, fecha, lineas, responsables, notas: notas.trim() || null }
    const compraventa = { modalidad, contraparte: contraparte.trim() || null, kg_gancho: gancho, precio }

    setEnviando(true)
    try {
      if (tipo === "pesada") await registrarPesada({ ...comunes, lote_id: loteId })
      else if (tipo === "mortandad") {
        await registrarMortandad({ ...comunes, lote_id: loteId, causa, observaciones: observaciones.trim() || null })
      } else if (tipo === "venta") await registrarVenta({ ...comunes, ...compraventa, lote_id: loteId })
      else if (tipo === "compra") {
        const loteNuevo: LoteNuevoCarga | null = destinoNuevo
          ? {
              nombre: nuevoNombre.trim(),
              especie_id: nuevoEspecie,
              ...(nuevoPotrero ? { potrero_id: nuevoPotrero } : {}),
              ...(nuevoAnios.length > 0 ? { anios_nacimiento: nuevoAnios } : {}),
            }
          : null
        await registrarCompra({
          ...comunes, ...compraventa, establecimiento_id: datos.estId,
          lote_id: destinoNuevo ? null : loteId, lote_nuevo: loteNuevo,
        })
      } else {
        await registrarParicion({
          ...comunes, lote_madres_id: loteId, nacidos_muertos: muertos,
          lote_cria_id: destinoCria === "madres" ? loteId : destinoCria === "existente" ? criaId : null,
          lote_cria_nuevo: criaNuevo,
        })
      }
      toast.success(`${ETIQUETA_ACTIVIDAD[tipo]} registrada`)
      router.push(`/actividades/${id}`)
    } catch (err) {
      // El id se conserva: si el envío llegó a guardarse, reintentar no lo duplica
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  const chip = (activo: boolean) =>
    cn("min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors",
      activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")

  return (
    <>
      <h1 className="text-2xl font-bold">{ETIQUETA_ACTIVIDAD[tipo]}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">{DESCRIPCION_ACTIVIDAD[tipo]}.</p>

      <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
        {/* Lote (en la compra: existente o nuevo) */}
        {tipo === "compra" && (
          <div className="flex gap-2" role="group" aria-label="Lote destino">
            <button type="button" aria-pressed={!destinoNuevo} className={chip(!destinoNuevo)} onClick={() => setDestinoNuevo(false)}>
              A un lote existente
            </button>
            <button type="button" aria-pressed={destinoNuevo} className={chip(destinoNuevo)} onClick={() => setDestinoNuevo(true)}>
              A un lote nuevo
            </button>
          </div>
        )}

        {tipo === "compra" && destinoNuevo ? (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Lote nuevo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="act-nuevo-nombre">Nombre</Label>
                <Input id="act-nuevo-nombre" className={CAMPO} placeholder="Ej: Novillos comprados"
                  value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="act-nuevo-especie">Especie</Label>
                <select id="act-nuevo-especie" className={SELECT_NATIVO} value={nuevoEspecie}
                  onChange={e => { setNuevoEspecie(e.target.value); setCantidades({}); setPesos({}) }}>
                  {especies.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="act-nuevo-potrero">Potrero</Label>
                <select id="act-nuevo-potrero" className={SELECT_NATIVO} value={nuevoPotrero} onChange={e => setNuevoPotrero(e.target.value)}>
                  <option value="">Sin potrero</option>
                  {potreros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="act-nuevo-anios">Año de nacimiento <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <SelectorAnios id="act-nuevo-anios" valor={nuevoAnios} onCambio={setNuevoAnios} />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="act-lote">{tipo === "paricion" ? "Lote de las madres" : "Lote"}</Label>
            <select id="act-lote" className={SELECT_NATIVO} value={loteId}
              onChange={e => { setLoteId(e.target.value); setCantidades({}); setPesos({}); setCriaId("") }}>
              <option value="">Elegí un lote</option>
              {lotes.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="act-fecha">Fecha</Label>
          <Input id="act-fecha" type="date" max={hoyLocal()} min={sinFechaMinima ? undefined : lote?.fecha_apertura}
            className={CAMPO} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>

        {/* Cabezas (y peso vivo) por categoría */}
        {especieId && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">
              {tipo === "paricion" ? "Crías vivas" : "Cabezas"}{llevaPeso && (tipo === "pesada" ? " y peso vivo total" : " y peso vivo total (opcional)")}
            </legend>
            {categoriasForm.length === 0 ? (
              <p className="text-sm text-muted-foreground">El lote no tiene animales.</p>
            ) : (
              <div className="rounded-lg border divide-y">
                {categoriasForm.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-base md:text-sm">{c.nombre}</span>
                      {conStock && <span className="block text-xs text-muted-foreground">Hay {hay(c.id)}</span>}
                    </span>
                    <Input aria-label={`Cabezas de ${c.nombre}`} type="number" inputMode="numeric" min="0" step="1" placeholder="0"
                      className={`${CAMPO} w-20 text-right tabular-nums`}
                      value={cantidades[c.id] ?? ""} onChange={e => setCantidades({ ...cantidades, [c.id]: e.target.value })} />
                    {llevaPeso && (
                      <Input aria-label={`Peso vivo total de ${c.nombre} (kg)`} type="text" inputMode="decimal" placeholder="kg"
                        className={`${CAMPO} w-24 text-right tabular-nums`}
                        value={pesos[c.id] ?? ""} onChange={e => setPesos({ ...pesos, [c.id]: e.target.value })} />
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 px-3 py-3 bg-muted/30">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-bold tabular-nums">
                    {total}{llevaPeso && pesoTotal > 0 ? ` · ${pesoTotal.toLocaleString("es-UY")} kg` : ""}
                  </span>
                </div>
              </div>
            )}
            {llevaPeso && cabezasConPeso > 0 && (
              <p className="text-xs text-muted-foreground">
                Peso promedio: {(pesoTotal / cabezasConPeso).toLocaleString("es-UY", { maximumFractionDigits: 1 })} kg por cabeza
              </p>
            )}
          </fieldset>
        )}

        {carenciasVenta.length > 0 && <AvisoCarencia carencias={carenciasVenta} texto="El lote está en carencia ese día. Podés registrar la venta igual." />}

        {/* Compra y venta */}
        {(tipo === "compra" || tipo === "venta") && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="act-modalidad">Modalidad</Label>
                <select id="act-modalidad" className={SELECT_NATIVO} value={modalidad} onChange={e => setModalidad(e.target.value as Modalidad)}>
                  {MODALIDADES.map(m => <option key={m} value={m}>{ETIQUETA_MODALIDAD[m]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="act-gancho">Kg al gancho</Label>
                <Input id="act-gancho" type="text" inputMode="decimal" placeholder="Opcional" className={CAMPO}
                  value={kgGancho} onChange={e => setKgGancho(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="act-contraparte">{tipo === "compra" ? "Vendedor" : "Comprador"}</Label>
              <Input id="act-contraparte" className={CAMPO} placeholder="Opcional" value={contraparte} onChange={e => setContraparte(e.target.value)} />
            </div>

            <label className="flex items-center gap-2 min-h-11 cursor-pointer select-none w-fit">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={conPrecio} onChange={e => setConPrecio(e.target.checked)} />
              <span className="text-sm font-medium">Cargar el precio</span>
            </label>

            {conPrecio && (
              <Card>
                <CardContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="act-monto">Monto total</Label>
                      <Input id="act-monto" type="text" inputMode="decimal" className={CAMPO} value={monto} onChange={e => setMonto(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="act-moneda">Moneda</Label>
                      <select id="act-moneda" className={SELECT_NATIVO} value={moneda} onChange={e => setMoneda(e.target.value as Moneda)}>
                        <option value="USD">Dólares (USD)</option>
                        <option value="UYU">Pesos (UYU)</option>
                      </select>
                    </div>
                  </div>
                  {moneda === "UYU" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="act-tc">Tipo de cambio (pesos por dólar)</Label>
                      <CampoTipoCambio id="act-tc" fecha={fecha} valor={tipoCambio} onCambio={setTipoCambio} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="act-estado-pago">Estado</Label>
                      <select id="act-estado-pago" className={SELECT_NATIVO} value={estadoPago} onChange={e => setEstadoPago(e.target.value as EstadoPago)}>
                        <option value="pendiente">Pendiente</option>
                        <option value="pagado">{tipo === "venta" ? "Cobrado" : "Pagado"}</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="act-fecha-pago">Fecha de {tipo === "venta" ? "cobro" : "pago"}</Label>
                      <Input id="act-fecha-pago" type="date" className={CAMPO} value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
                    </div>
                  </div>
                  <CampoIdentificador id="act" valor={pagoFactura.identificador}
                    onCambio={identificador => setPagoFactura(v => ({ ...v, identificador }))} />
                  <div className="space-y-1.5">
                    <Label htmlFor="act-rubro">Rubro</Label>
                    <select id="act-rubro" className={SELECT_NATIVO} value={rubroId} onChange={e => setRubroId(e.target.value)}>
                      <option value="">{rubroPorDefecto ? `${rubroPorDefecto.nombre} (el de la especie)` : "El de la especie"}</option>
                      {rubros.filter(r => r.id !== rubroPorDefecto?.id).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </div>
                  <CampoPagador id="act" establecimientoId={datos.estId} ingreso={tipo === "venta"} valor={pagoFactura.pagadorId}
                    onCambio={pagadorId => setPagoFactura(v => ({ ...v, pagadorId }))} recordarUltimo />
                  <DatosFactura id="act" establecimientoId={datos.estId} valor={pagoFactura} onCambio={setPagoFactura} />
                  <CampoComentario id="act" valor={pagoFactura.comentario} onCambio={comentario => setPagoFactura(v => ({ ...v, comentario }))} />
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Mortandad */}
        {tipo === "mortandad" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="act-causa">Causa</Label>
              <select id="act-causa" className={SELECT_NATIVO} value={causa} onChange={e => setCausa(e.target.value)}>
                {causas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="act-observaciones">Observaciones</Label>
              <textarea id="act-observaciones" rows={2} className={TEXTAREA} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
            </div>
          </>
        )}

        {/* Parición */}
        {tipo === "paricion" && lote && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="act-muertos">Nacidos muertos</Label>
              <Input id="act-muertos" type="number" inputMode="numeric" min="0" step="1" placeholder="0" className={`${CAMPO} w-28`}
                value={nacidosMuertos} onChange={e => setNacidosMuertos(e.target.value)} />
              <p className="text-xs text-muted-foreground">Quedan registrados para los indicadores; no suman stock.</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium mb-1">Dónde quedan las crías</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Dónde quedan las crías">
                <button type="button" aria-pressed={destinoCria === "madres"} className={chip(destinoCria === "madres")}
                  onClick={() => setDestinoCria("madres")}>Con las madres</button>
                <button type="button" aria-pressed={destinoCria === "nuevo"} className={chip(destinoCria === "nuevo")}
                  onClick={() => setDestinoCria("nuevo")}>Lote nuevo</button>
                <button type="button" aria-pressed={destinoCria === "existente"} className={chip(destinoCria === "existente")}
                  onClick={() => setDestinoCria("existente")} disabled={lotesCria.length === 0}>Lote existente</button>
              </div>
              {destinoCria === "madres" ? (
                <p className="text-sm text-muted-foreground">Las crías quedan al pie, en {lote.nombre}, hasta el destete.</p>
              ) : destinoCria === "nuevo" ? (
                <div className="space-y-3">
                  <Input aria-label="Nombre del lote de cría" className={CAMPO} placeholder={nombreLoteCria(especie?.grupo, fecha)}
                    value={criaNombre} onChange={e => setCriaNombre(e.target.value)} />
                  <select aria-label="Potrero del lote de cría" className={SELECT_NATIVO} value={criaPotrero} onChange={e => setCriaPotrero(e.target.value)}>
                    <option value="">Sin potrero</option>
                    {potreros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              ) : (
                <select aria-label="Lote de cría existente" className={SELECT_NATIVO} value={criaId} onChange={e => setCriaId(e.target.value)}>
                  <option value="">Elegí el lote de cría</option>
                  {lotesCria.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              )}
            </fieldset>
          </>
        )}

        {/* Comunes */}
        <SelectorResponsables personas={personas} elegidos={responsables} onCambio={setResponsables} />
        <div className="space-y-1.5">
          <Label htmlFor="act-notas">Notas</Label>
          <textarea id="act-notas" rows={2} className={TEXTAREA} value={notas} onChange={e => setNotas(e.target.value)} />
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
