"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  editarCompra, editarMortandad, editarParicion, editarPesada, editarVenta, getCarencias, registrarCompra,
  registrarMortandad, registrarParicion, registrarPesada, registrarVenta, type ActividadParaEditar,
} from "@/lib/queries/actividades"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DESCRIPCION_ACTIVIDAD, ETIQUETA_ACTIVIDAD, ETIQUETA_MODALIDAD, MODALIDADES, errorKg, nuevoId } from "@/components/actividades/formato"
import { AvisoCarencia } from "@/components/actividades/AvisoCarencia"
import type { DatosCarga } from "@/components/actividades/datosCarga"
import { SelectorAnios } from "@/components/lotes/SelectorAnios"
import { BOTON, CAMPO, SELECT_NATIVO, TEXTAREA } from "@/components/shared/estilos"
import { hoyLocal } from "@/components/lotes/formato"
import { SelectorResponsables } from "@/components/shared/Responsables"
import { cn } from "@/lib/utils"
import type { Carencia, EstadoPago, LineaCarga, LoteNuevoCarga, Modalidad, Moneda, PrecioCarga, TipoActividad6a } from "@/types/actividades"
import { CampoTipoCambio } from "@/components/economia/CampoTipoCambio"
import { ElegirArchivosMovimiento, type ArchivoElegido } from "@/components/economia/ArchivosMovimiento"
import { subirArchivoAActividad } from "@/lib/queries/archivos"
import { tipoCambioATexto, tipoCambioVacio, type TipoCambioForm } from "@/components/economia/formato"
import {
  CampoComentario, CampoIdentificador, CampoPagador, DatosFactura, leerPagoFactura, pagoFacturaVacio, type PagoFacturaForm,
} from "@/components/economia/PagoYFactura"

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

// Número guardado como texto del formulario ("" si no hay)
const aTexto = (n: number | null | undefined) => (n == null ? "" : String(Number(n)).replace(".", ","))

/**
 * Pesada, mortandad, compra, venta y parición: carga nueva o edición (`edicion`).
 * Al editar, la actividad conserva su id; la compra o la parición que creó su lote no cambia de destino.
 */
export function FormularioConStock({ tipo, loteInicial, datos, edicion }: {
  tipo: TipoActividad6a
  loteInicial: string
  datos: DatosCarga
  edicion?: ActividadParaEditar
}) {
  const router = useRouter()
  const { lotes, especies, categorias, stock, potreros, personas, rubros, causas } = datos
  const a = edicion?.actividad
  const mov = edicion?.movimientos.find(m => !m.anulado_en) ?? null
  const loteOriginal = lotes.find(l => l.id === a?.lote_id)
  const rubroEspecieOriginal = especies.find(e => e.id === loteOriginal?.especie_id)?.rubro_id

  // Id de la actividad: el de la que se edita, o uno nuevo que se genera una vez y se reusa en los reintentos
  const [id] = useState(() => a?.id ?? nuevoId())
  const [archivos, setArchivos] = useState<ArchivoElegido[]>([])   // pesada: planilla de la balanza, fotos
  const [fecha, setFecha] = useState(a?.fecha ?? hoyLocal())
  const [loteId, setLoteId] = useState(a?.lote_id ?? (lotes.some(l => l.id === loteInicial) ? loteInicial : ""))
  const [cantidades, setCantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries((edicion?.lineas ?? []).map(l => [l.categoria_id, String(l.cabezas)])))
  // En la pesada se edita el promedio (total / cabezas); en la compra y la venta, el total
  const [pesos, setPesos] = useState<Record<string, string>>(() =>
    Object.fromEntries((edicion?.lineas ?? []).filter(l => l.peso_vivo_total_kg != null).map(l => [
      l.categoria_id,
      aTexto(tipo === "pesada" ? Math.round((Number(l.peso_vivo_total_kg) / l.cabezas) * 100) / 100 : Number(l.peso_vivo_total_kg)),
    ])))
  const [responsables, setResponsables] = useState<string[]>(a?.responsables ?? [])
  const [notas, setNotas] = useState(a?.notas ?? "")

  // Compra: lote existente o nuevo (al editar, siempre el que tiene)
  const [destinoNuevo, setDestinoNuevo] = useState(!edicion && tipo === "compra" && !loteInicial)
  const [nuevoNombre, setNuevoNombre] = useState("")
  const [nuevoEspecie, setNuevoEspecie] = useState(especies[0]?.id ?? "")
  const [nuevoPotrero, setNuevoPotrero] = useState("")
  const [nuevoAnios, setNuevoAnios] = useState<number[]>([])   // los que se indiquen; no se infieren

  // Compra y venta
  const [modalidad, setModalidad] = useState<Modalidad>(a?.modalidad ?? (tipo === "venta" ? "frigorifico" : "productor"))
  const [contraparte, setContraparte] = useState(a?.contraparte ?? "")
  const [kgGancho, setKgGancho] = useState(aTexto(a?.kg_gancho))
  const [conPrecio, setConPrecio] = useState(!!mov)
  const [monto, setMonto] = useState(aTexto(mov?.monto_original))
  const [moneda, setMoneda] = useState<Moneda>(mov?.moneda_original ?? "USD")
  const [tipoCambio, setTipoCambio] = useState<TipoCambioForm>(() => mov
    ? {
        texto: mov.tipo_cambio ? tipoCambioATexto(Number(mov.tipo_cambio)) : "",
        fechaBcu: mov.tipo_cambio_fuente === "BCU" ? mov.tipo_cambio_fecha ?? "" : "",
        guardada: true,
      }
    : tipoCambioVacio())
  const [estadoPago, setEstadoPago] = useState<EstadoPago>(mov?.estado ?? "pendiente")
  const [fechaPago, setFechaPago] = useState(mov?.fecha_pago ?? "")
  // "" = el rubro de la especie
  const [rubroId, setRubroId] = useState(mov && mov.rubro_id !== rubroEspecieOriginal ? mov.rubro_id : "")
  const [pagoFactura, setPagoFactura] = useState<PagoFacturaForm>(() => mov
    ? {
        identificador: mov.identificador ?? "", comentario: mov.comentario ?? "", pagadorId: mov.pagador_id ?? "",
        facturaNombre: mov.factura_nombre ?? "", facturaRut: mov.factura_rut ?? "", comprobante: mov.numero_comprobante ?? "",
      }
    : pagoFacturaVacio())

  // Mortandad
  const [causa, setCausa] = useState(a?.causa ?? "Desconocida")
  const [observaciones, setObservaciones] = useState(a?.observaciones ?? "")

  // Parición: las crías quedan con las madres (por defecto), van a un lote nuevo o a uno existente.
  // Al editar: "creado" si la parición creó su lote de cría (queda fijo); no se ofrece uno nuevo.
  const [destinoCria, setDestinoCria] = useState<"madres" | "nuevo" | "existente" | "creado">(() =>
    !a ? "madres" : a.lote_creado_id ? "creado" : a.lote_cria_id === a.lote_id ? "madres" : "existente")
  const [criaId, setCriaId] = useState(a && !a.lote_creado_id && a.lote_cria_id !== a.lote_id ? a.lote_cria_id ?? "" : "")
  const [criaNombre, setCriaNombre] = useState("")
  const [criaPotrero, setCriaPotrero] = useState("")
  const [nacidosMuertos, setNacidosMuertos] = useState(a?.nacidos_muertos ? String(a.nacidos_muertos) : "")

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
  // Al editar una venta o una mortandad, lo que sacó del lote vuelve a estar disponible
  const propias = new Map(
    edicion && (tipo === "venta" || tipo === "mortandad") && loteId === a?.lote_id
      ? edicion.lineas.map(l => [l.categoria_id, l.cabezas] as const)
      : [])
  const hay = (catId: string) => (stockLote.get(catId) ?? 0) + (propias.get(catId) ?? 0)

  // Categorías que se muestran: las que tienen stock (pesada, venta, mortandad), las de cría al pie
  // (parición: la base no acepta otras) o todas las de la especie (compra)
  const conStock = tipo === "pesada" || tipo === "venta" || tipo === "mortandad"
  const categoriasForm = categorias
    .filter(c => c.especie_id === especieId)
    .filter(c => !conStock || hay(c.id) > 0)
    .filter(c => tipo !== "paricion" || c.cria_al_pie)
  const llevaPeso = tipo === "pesada" || tipo === "compra" || tipo === "venta"
  // En la pesada se carga el peso PROMEDIO por categoría y el total sale de promedio × cabezas;
  // en la compra y la venta, el peso vivo total (opcional)
  const conPromedio = tipo === "pesada"
  const total = categoriasForm.reduce((s, c) => s + (Number(cantidades[c.id]) || 0), 0)
  // Peso vivo total de una categoría (kg, con dos decimales como lo guarda la base); null si falta algo
  const totalDe = (catId: string) => {
    const cab = Number(cantidades[catId]) || 0
    const kg = leer(pesos[catId] ?? "")
    if (!cab || kg === null || !(kg > 0)) return null
    return conPromedio ? Math.round(kg * cab * 100) / 100 : kg
  }
  // Peso promedio en vivo: solo con las categorías que tienen cabezas y peso
  const conPeso = categoriasForm
    .map(c => ({ cab: Number(cantidades[c.id]) || 0, kg: totalDe(c.id) }))
    .filter((x): x is { cab: number; kg: number } => x.cab > 0 && x.kg !== null && x.kg > 0)
  const pesoTotal = conPeso.reduce((s, x) => s + x.kg, 0)
  const cabezasConPeso = conPeso.reduce((s, x) => s + x.cab, 0)

  const lotesCria = lotes.filter(l => l.id !== loteId && l.especie_id === lote?.especie_id && (l.estado === "activo" || l.id === criaId))
  const loteCriaCreado = lotes.find(l => l.id === a?.lote_creado_id)
  // El rubro por defecto es el de la especie (el mismo que usa la base), no uno con el mismo nombre
  const rubroPorDefecto = rubros.find(r => r.id === especie?.rubro_id)
  const sinFechaMinima = tipo === "compra" && destinoNuevo
  // Compra que creó su lote: el destino queda fijo
  const destinoFijo = !!edicion && tipo === "compra" && !!a?.lote_creado_id
  // Al editar se ofrecen los lotes activos y el de la actividad (aunque esté cerrado)
  const lotesElegibles = lotes.filter(l => l.estado === "activo" || l.id === a?.lote_id)

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
        const errorPeso = errorKg(pesos[c.id] ?? "", conPromedio ? `El peso promedio de ${c.nombre.toLowerCase()}` : `El peso vivo de ${c.nombre.toLowerCase()}`)
        if (errorPeso) return setError(errorPeso)
        linea.peso_vivo_total_kg = totalDe(c.id)!
      } else if (tipo === "pesada") {
        return setError(`Falta el peso promedio de ${c.nombre.toLowerCase()}`)
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
      const pago = leerPagoFactura(pagoFactura)
      if ("error" in pago) return setError(pago.error)
      if (!edicion) {
        if (rubroId) precio.rubro_id = rubroId
        Object.assign(precio, pago.datos)
      } else {
        // Al editar, lo que se vació se manda en null (si no, la base lo deja como estaba) y la fecha
        // prevista de cobro o pago, que este formulario no muestra, se conserva
        const d = pago.datos
        Object.assign(precio, {
          rubro_id: rubroId || rubroPorDefecto?.id || null,
          pagador_id: d.pagador_id ?? null, identificador: d.identificador ?? null, comentario: d.comentario ?? null,
          factura_nombre: d.factura_nombre ?? null, factura_rut: d.factura_rut ?? null, numero_comprobante: d.numero_comprobante ?? null,
        })
        if (estadoPago === "pendiente" && mov?.fecha_vencimiento && mov.fecha_vencimiento >= fecha) precio.vencimiento = mov.fecha_vencimiento
      }
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
    const loteCria = destinoCria === "madres" ? loteId : destinoCria === "existente" ? criaId : null

    setEnviando(true)
    try {
      if (edicion) {
        if (tipo === "pesada") await editarPesada({ ...comunes, lote_id: loteId })
        else if (tipo === "mortandad") {
          await editarMortandad({ ...comunes, lote_id: loteId, causa, observaciones: observaciones.trim() || null })
        } else if (tipo === "venta") await editarVenta({ ...comunes, ...compraventa, lote_id: loteId })
        else if (tipo === "compra") await editarCompra({ ...comunes, ...compraventa, lote_id: destinoFijo ? null : loteId })
        else await editarParicion({ ...comunes, lote_madres_id: loteId, nacidos_muertos: muertos ?? 0, lote_cria_id: loteCria })
        toast.success(`${ETIQUETA_ACTIVIDAD[tipo]} actualizada`)
        router.push(`/actividades/${id}`)
        return
      }

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
        await registrarParicion({ ...comunes, lote_madres_id: loteId, nacidos_muertos: muertos, lote_cria_id: loteCria, lote_cria_nuevo: criaNuevo })
      }
      // Los archivos, después: si alguno falla, la actividad ya quedó y se adjunta desde su ficha
      const fallidos: string[] = []
      for (const archivo of archivos) {
        try {
          await subirArchivoAActividad(datos.estId, id, archivo)
        } catch {
          fallidos.push(archivo.file.name)
        }
      }
      toast.success(`${ETIQUETA_ACTIVIDAD[tipo]} registrada`)
      if (fallidos.length > 0) toast.error(`No se pudo subir ${fallidos.join(", ")}: adjuntalo desde la ficha de la actividad`)
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
      <h1 className="text-2xl font-bold">{edicion ? `Editar ${ETIQUETA_ACTIVIDAD[tipo].toLowerCase()}` : ETIQUETA_ACTIVIDAD[tipo]}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">{DESCRIPCION_ACTIVIDAD[tipo]}.</p>

      <form onSubmit={onSubmit} className="space-y-5 max-w-xl">
        {/* Lote (en la compra nueva: existente o nuevo) */}
        {tipo === "compra" && !edicion && (
          <div className="flex gap-2" role="group" aria-label="Lote destino">
            <button type="button" aria-pressed={!destinoNuevo} className={chip(!destinoNuevo)} onClick={() => setDestinoNuevo(false)}>
              A un lote existente
            </button>
            <button type="button" aria-pressed={destinoNuevo} className={chip(destinoNuevo)} onClick={() => setDestinoNuevo(true)}>
              A un lote nuevo
            </button>
          </div>
        )}

        {destinoFijo ? (
          <div className="space-y-1.5">
            <Label>Lote</Label>
            <p className="text-sm">
              <span className="font-medium">{lote?.nombre}</span>
              <span className="text-muted-foreground"> · lo creó esta compra (el destino no se cambia)</span>
            </p>
          </div>
        ) : tipo === "compra" && destinoNuevo ? (
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
              {lotesElegibles.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
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
              {tipo === "paricion" ? "Crías vivas" : "Cabezas"}{llevaPeso && (conPromedio ? " y peso promedio (kg por cabeza)" : " y peso vivo total (opcional)")}
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
                      {conPromedio && totalDe(c.id) !== null && (
                        <span className="block text-xs text-muted-foreground tabular-nums">= {totalDe(c.id)!.toLocaleString("es-UY")} kg en total</span>
                      )}
                    </span>
                    <Input aria-label={`Cabezas de ${c.nombre}`} type="number" inputMode="numeric" min="0" step="1" placeholder="0"
                      className={`${CAMPO} w-20 text-right tabular-nums`}
                      value={cantidades[c.id] ?? ""} onChange={e => setCantidades({ ...cantidades, [c.id]: e.target.value })} />
                    {llevaPeso && (
                      <Input aria-label={conPromedio ? `Peso promedio de ${c.nombre} (kg por cabeza)` : `Peso vivo total de ${c.nombre} (kg)`}
                        type="text" inputMode="decimal" placeholder={conPromedio ? "kg prom." : "kg"}
                        className={`${CAMPO} w-24 text-right tabular-nums`}
                        value={pesos[c.id] ?? ""} onChange={e => setPesos({ ...pesos, [c.id]: e.target.value })} />
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 px-3 py-3 bg-muted/30">
                  <span className="font-semibold">Total</span>
                  {conPromedio ? (
                    // Pesada: cantidad y peso promedio del lote, alineados con sus columnas
                    <span className="flex items-center gap-2">
                      <span className="w-20 text-right text-lg font-bold tabular-nums">{total}</span>
                      <span className="w-24 text-right text-lg font-bold tabular-nums">
                        {cabezasConPeso > 0 ? `${(pesoTotal / cabezasConPeso).toLocaleString("es-UY", { maximumFractionDigits: 2 })} kg` : "—"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-lg font-bold tabular-nums">
                      {total}{llevaPeso && pesoTotal > 0 ? ` · ${pesoTotal.toLocaleString("es-UY")} kg` : ""}
                    </span>
                  )}
                </div>
              </div>
            )}
            {conPromedio && cabezasConPeso > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                Peso promedio del lote: {(pesoTotal / cabezasConPeso).toLocaleString("es-UY", { maximumFractionDigits: 2 })} kg por cabeza
                · {pesoTotal.toLocaleString("es-UY")} kg en total{cabezasConPeso < total ? ` (de ${cabezasConPeso} cabezas con peso)` : ""}
              </p>
            )}
            {!conPromedio && llevaPeso && cabezasConPeso > 0 && (
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
              <span className="text-sm font-medium">{edicion ? "Con precio" : "Cargar el precio"}</span>
            </label>
            {mov && !conPrecio && (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
                Al guardar sin precio, el movimiento de Economía se anula.
              </p>
            )}

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
                      <CampoTipoCambio id="act-tc" fecha={fecha} valor={tipoCambio} onCambio={setTipoCambio} consultarAlInicio={!mov} />
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
                    onCambio={pagadorId => setPagoFactura(v => ({ ...v, pagadorId }))} actual={mov?.pagador_id} recordarUltimo={!edicion} />
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
              {destinoCria === "creado" ? (
                <p className="text-sm">
                  <span className="font-medium">{loteCriaCreado?.nombre}</span>
                  <span className="text-muted-foreground"> · lo creó esta parición (el lote de cría no se cambia)</span>
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Dónde quedan las crías">
                    <button type="button" aria-pressed={destinoCria === "madres"} className={chip(destinoCria === "madres")}
                      onClick={() => setDestinoCria("madres")}>Con las madres</button>
                    {!edicion && (
                      <button type="button" aria-pressed={destinoCria === "nuevo"} className={chip(destinoCria === "nuevo")}
                        onClick={() => setDestinoCria("nuevo")}>Lote nuevo</button>
                    )}
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
                </>
              )}
            </fieldset>
          </>
        )}

        {tipo === "pesada" && !edicion && (
          <div className="space-y-1.5">
            <Label>Archivos <span className="font-normal text-muted-foreground">(opcional: planilla de la balanza, fotos)</span></Label>
            <ElegirArchivosMovimiento elegidos={archivos} onCambio={setArchivos} disabled={enviando} />
          </div>
        )}

        {/* Comunes */}
        <SelectorResponsables personas={personas} elegidos={responsables} onCambio={setResponsables} conservar={a?.responsables ?? []} />
        <div className="space-y-1.5">
          <Label htmlFor="act-notas">Notas</Label>
          <textarea id="act-notas" rows={2} className={TEXTAREA} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" className={BOTON} disabled={enviando}>{enviando ? "Guardando..." : edicion ? "Guardar cambios" : "Guardar"}</Button>
          <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>Cancelar</Button>
        </div>
      </form>
    </>
  )
}
