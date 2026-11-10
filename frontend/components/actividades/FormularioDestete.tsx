"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Plus, Scale, X } from "lucide-react"
import { toast } from "sonner"

import { editarDestete, getHistorialCria, getLotesConRol, registrarDestete, type ActividadParaEditar } from "@/lib/queries/actividades"
import { getLotesPorIds } from "@/lib/queries/lotes"
import { mensajeDeError } from "@/lib/supabase/errores"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectorAnios } from "@/components/lotes/SelectorAnios"
import { DESCRIPCION_ACTIVIDAD, nuevoId } from "@/components/actividades/formato"
import { fechaCorta, hoyLocal } from "@/components/lotes/formato"
import { normalizarAnios } from "@/components/lotes/anios"
import { BOTON, CAMPO, SELECT_NATIVO, TEXTAREA } from "@/components/shared/estilos"
import { SelectorResponsables, type PersonaResponsable } from "@/components/shared/Responsables"
import { cn } from "@/lib/utils"
import type { Potrero } from "@/types/database"
import type { CategoriaAnimal, Lote, StockLote } from "@/types/lotes"
import type { DestinoDestete, OrigenDestete } from "@/types/actividades"

type Historial = Awaited<ReturnType<typeof getHistorialCria>>

interface DestinoForm {
  clave: string
  nombre: string
  potrero: string
  anios: number[]
  cantidades: Record<string, string>   // categoría sexada → cabezas
}

// Número entero de un campo (vacío = 0; NaN si no es un entero válido)
const entero = (v: string | undefined) => {
  const t = (v ?? "").trim()
  if (t === "") return 0
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : NaN
}

// Suma de cabezas de unos eventos de una categoría (los que salieron, en positivo)
const sumaDe = (eventos: { categoria_id: string; cabezas: number }[], catId: string | undefined) =>
  eventos.filter(e => e.categoria_id === catId).reduce((s, e) => s + Math.abs(e.cabezas), 0)

/**
 * Destete: mueve crías al pie (solo categorías de cría) de uno o más lotes a lotes nuevos.
 * Las crías sin sexar se separan en machos y hembras; los destinos se sugieren por sexo (o todo
 * junto) con los años de las pariciones, y todo se puede editar. La base valida el balance igual.
 * Al editar (`edicion`), los destinos son los mismos lotes: cambian la fecha, los orígenes y las cabezas.
 */
export function FormularioDestete({ loteInicial, datos, edicion }: {
  loteInicial: string
  datos: {
    estId: string
    lotes: Lote[]
    categorias: CategoriaAnimal[]
    stock: StockLote[]
    potreros: Potrero[]
    personas: PersonaResponsable[]
  }
  edicion?: ActividadParaEditar
}) {
  const router = useRouter()
  const { estId, lotes, categorias, potreros, personas } = datos
  const a = edicion?.actividad

  // Al editar: lo que salió de cada origen vuelve a estar disponible; los destinos quedan fijos
  const salidas = (edicion?.eventos ?? []).filter(e => e.cabezas < 0)
  const entradas = (edicion?.eventos ?? []).filter(e => e.cabezas > 0)
  const destinosFijos = edicion ? lotes.filter(l => edicion.roles.some(r => r.rol === "destino" && r.lote_id === l.id)) : []
  const stock: StockLote[] = (() => {
    if (!edicion) return datos.stock
    const sumado = datos.stock.map(s => ({ ...s }))
    for (const e of salidas) {
      const fila = sumado.find(s => s.lote_id === e.lote_id && s.categoria_id === e.categoria_id)
      if (fila) fila.cabezas += -e.cabezas
      else {
        const lote = lotes.find(l => l.id === e.lote_id)
        sumado.push({ lote_id: e.lote_id, categoria_id: e.categoria_id, cabezas: -e.cabezas, especie_id: lote?.especie_id ?? "", establecimiento_id: estId })
      }
    }
    return sumado
  })()

  const [id] = useState(() => a?.id ?? nuevoId())
  const [fecha, setFecha] = useState(a?.fecha ?? hoyLocal())
  const [historial, setHistorial] = useState<Historial | null>(null)
  // lote → categoría → cabezas. Si se entra desde un lote con crías, arranca elegido con todas.
  // Al editar, lo que salió de cada origen.
  const [cantidades, setCantidades] = useState<Record<string, Record<string, string>>>(() => {
    if (edicion) {
      const porLote: Record<string, Record<string, string>> = {}
      for (const e of salidas) porLote[e.lote_id] = { ...porLote[e.lote_id], [e.categoria_id]: String(-e.cabezas) }
      return porLote
    }
    const crias = stock.filter(s => s.lote_id === loteInicial && s.cabezas > 0
      && categorias.some(c => c.id === s.categoria_id && c.cria_al_pie))
    return crias.length > 0 ? { [loteInicial]: Object.fromEntries(crias.map(s => [s.categoria_id, String(s.cabezas)])) } : {}
  })
  // Peso total de las crías que salen de cada origen (kg, opcional). Al editar, el que se cargó.
  const [pesos, setPesos] = useState<Record<string, string>>(() => Object.fromEntries(
    (edicion?.roles ?? []).filter(r => r.rol === "origen" && r.peso_vivo_total_kg != null)
      .map(r => [r.lote_id, String(r.peso_vivo_total_kg).replace(".", ",")])))
  // Al editar: los machos y las hembras que salieron de las sin sexar (lo que entró de cada sexo menos lo
  // que ya salió sexado)
  const [sexadoInicial] = useState(() => {
    if (!edicion) return { machos: "", hembras: "" }
    const especie = lotes.find(l => l.id === salidas[0]?.lote_id)?.especie_id
    const crias = categorias.filter(c => c.especie_id === especie && c.cria_al_pie)
    const separados = (sexo: string) => {
      const cat = crias.find(c => c.sexo === sexo)?.id
      const n = sumaDe(entradas, cat) - sumaDe(salidas, cat)
      return n > 0 ? String(n) : ""
    }
    return { machos: separados("macho"), hembras: separados("hembra") }
  })
  const [machos, setMachos] = useState(sexadoInicial.machos)
  const [hembras, setHembras] = useState(sexadoInicial.hembras)
  const [destinosEditados, setDestinosEditados] = useState<DestinoForm[] | null>(() =>   // null: los sugeridos
    edicion
      ? destinosFijos.map(l => ({
          clave: l.id, nombre: l.nombre, potrero: "", anios: [],
          cantidades: Object.fromEntries(entradas.filter(e => e.lote_id === l.id).map(e => [e.categoria_id, String(e.cabezas)])),
        }))
      : null)
  const [responsables, setResponsables] = useState<string[]>(a?.responsables ?? [])
  const [notas, setNotas] = useState(a?.notas ?? "")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState<{ destinos: Lote[] } | null>(null)

  useEffect(() => {
    let vigente = true
    getHistorialCria(estId)
      .then(h => { if (vigente) setHistorial(h) })
      .catch(() => { if (vigente) setHistorial({ pariciones: [], destetes: [] }) })   // la sugerencia es opcional
    return () => { vigente = false }
  }, [estId])

  // ── Categorías y stock de cría al pie ──
  const esCria = (catId: string) => categorias.find(c => c.id === catId)?.cria_al_pie ?? false
  const stockDe = (loteId: string, catId: string) => stock.find(s => s.lote_id === loteId && s.categoria_id === catId)?.cabezas ?? 0
  const criasDe = (loteId: string) =>
    categorias.filter(c => c.cria_al_pie && stockDe(loteId, c.id) > 0).sort((a, b) => a.orden - b.orden)
  // Lotes con crías al pie: tienen crías y además madres, o recibieron una parición. Así no aparecen los
  // lotes de destetados ni los de recría (Terneros y Terneras siguen siendo cría al pie después del destete).
  const tieneCrias = (loteId: string) => stock.some(s => s.lote_id === loteId && s.cabezas > 0 && esCria(s.categoria_id))
  const tieneMadres = (loteId: string) => stock.some(s => s.lote_id === loteId && s.cabezas > 0 && !esCria(s.categoria_id))
  const parioEn = (loteId: string) => (historial?.pariciones ?? []).some(p => p.lote_id === loteId)
  // Al editar, también los orígenes que tenía (aunque hoy estén cerrados porque quedaron vacíos)
  const lotesConCria = lotes.filter(l =>
    salidas.some(e => e.lote_id === l.id)
    || (l.estado === "activo" && !destinosFijos.some(d => d.id === l.id) && tieneCrias(l.id) && (tieneMadres(l.id) || parioEn(l.id))))

  const elegidos = Object.keys(cantidades)
  const especieId = lotes.find(l => l.id === elegidos[0])?.especie_id ?? null
  const catsEspecie = categorias.filter(c => c.especie_id === especieId && c.cria_al_pie).sort((a, b) => a.orden - b.orden)
  const catMacho = catsEspecie.find(c => c.sexo === "macho") ?? null
  const catHembra = catsEspecie.find(c => c.sexo === "hembra") ?? null
  const sexadas = catsEspecie.filter(c => c.sexo !== null)

  // Crías sin sexar disponibles en los lotes elegidos (lo indicado en cada uno; por defecto, todas)
  const esSinSexar = (catId: string) => catsEspecie.some(c => c.id === catId && c.sexo === null)
  const sinSexar = Object.values(cantidades)
    .flatMap(porCat => Object.entries(porCat))
    .filter(([catId]) => esSinSexar(catId))
    .reduce((s, [, v]) => s + (entero(v) || 0), 0)

  // De las sin sexar se destetan solo las que se separan en machos y hembras (campos libres, vacío = 0);
  // las demás quedan sin sexar en su lote
  const m = entero(machos)
  const h = entero(hembras)
  const sexadoValido = sinSexar === 0 || (!Number.isNaN(m) && !Number.isNaN(h) && m + h <= sinSexar)
  const separadas = sinSexar > 0 && sexadoValido ? m + h : 0

  // Lo que sale de cada lote: las sexadas como se indicaron; las sin sexar, hasta machos + hembras,
  // tomándolas de los lotes en el orden en que se eligieron
  const efectivas: Record<string, Record<string, number>> = {}
  let porRepartir = separadas
  for (const [loteId, porCat] of Object.entries(cantidades)) {
    efectivas[loteId] = {}
    for (const [catId, v] of Object.entries(porCat)) {
      let n = entero(v)
      if (!Number.isNaN(n) && esSinSexar(catId)) {
        n = Math.min(n, porRepartir)
        porRepartir -= n
      }
      efectivas[loteId][catId] = n
    }
  }
  const sale = new Map<string, number>()
  for (const porCat of Object.values(efectivas)) {
    for (const [catId, n] of Object.entries(porCat)) {
      if (n > 0) sale.set(catId, (sale.get(catId) ?? 0) + n)
    }
  }

  // Lo que tiene que entrar a los destinos, por categoría sexada
  const totales = new Map<string, number>()
  for (const c of sexadas) {
    let t = sale.get(c.id) ?? 0
    if (separadas > 0 && c.id === catMacho?.id) t += m
    if (separadas > 0 && c.id === catHembra?.id) t += h
    if (t > 0) totales.set(c.id, t)
  }
  const totalCrias = [...sale.values()].reduce((s, n) => s + n, 0)

  // El destete no puede ser anterior a la última parición de los lotes elegidos (la base lo rechazaría:
  // ese día el lote todavía no tenía esas crías)
  const ultimaParicion = (historial?.pariciones ?? [])
    .filter(p => elegidos.includes(p.lote_id))
    .reduce((max, p) => (p.fecha > max ? p.fecha : max), "")
  const fechaAntesDeParicion = !!ultimaParicion && fecha < ultimaParicion

  // ── Años sugeridos: fechas de las pariciones de cada origen posteriores a su último destete ──
  const aniosSugeridos = (() => {
    const anios: number[] = []
    for (const loteId of elegidos) {
      const ultimoDestete = (historial?.destetes ?? [])
        .filter(d => d.lote_id === loteId && d.rol === "origen")
        .reduce((max, d) => (d.fecha > max ? d.fecha : max), "")
      const desdePariciones = (historial?.pariciones ?? [])
        .filter(p => p.lote_id === loteId && p.fecha > ultimoDestete)
        .map(p => Number(p.fecha.slice(0, 4)))
      anios.push(...(desdePariciones.length > 0 ? desdePariciones : (lotes.find(l => l.id === loteId)?.anios_nacimiento ?? [])))
    }
    return normalizarAnios(anios)
  })()
  const anioNombre = aniosSugeridos.length > 0 ? aniosSugeridos[aniosSugeridos.length - 1] : Number(fecha.slice(0, 4))

  // ── Destinos sugeridos: uno por sexo, o uno solo ──
  const destinoTodo = (): DestinoForm => ({
    clave: "todo", nombre: `Destetados ${anioNombre}`, potrero: "", anios: aniosSugeridos,
    cantidades: Object.fromEntries([...totales].map(([c, n]) => [c, String(n)])),
  })
  const sugeridos: DestinoForm[] = (() => {
    const tm = catMacho ? totales.get(catMacho.id) ?? 0 : 0
    const th = catHembra ? totales.get(catHembra.id) ?? 0 : 0
    if (tm > 0 && th > 0 && catMacho && catHembra) {
      const otras = [...totales].filter(([c]) => c !== catMacho.id && c !== catHembra.id)
      return [
        { clave: "machos", nombre: `${catMacho.nombre} destetados ${anioNombre}`, potrero: "", anios: aniosSugeridos,
          cantidades: Object.fromEntries([[catMacho.id, String(tm)], ...otras.map(([c, n]) => [c, String(n)])]) },
        { clave: "hembras", nombre: `${catHembra.nombre} destetadas ${anioNombre}`, potrero: "", anios: aniosSugeridos,
          cantidades: { [catHembra.id]: String(th) } },
      ]
    }
    return totales.size > 0 ? [destinoTodo()] : []
  })()
  const destinos = destinosEditados ?? sugeridos

  // Cualquier cambio en lo que sale vuelve a los destinos sugeridos (al editar, los destinos quedan)
  const cambiarSalida = (cambio: (prev: typeof cantidades) => typeof cantidades) => {
    setCantidades(cambio)
    if (!edicion) setDestinosEditados(null)
  }
  // Categorías de cada destino: las que tienen que entrar y, al editar, las que ya tenía
  const categoriasDestino = (d: DestinoForm) =>
    [...new Set([...totales.keys(), ...Object.keys(d.cantidades).filter(c => entero(d.cantidades[c]) > 0)])]
  const alternarOrigen = (lote: Lote) => cambiarSalida(prev => {
    if (prev[lote.id]) {
      const { [lote.id]: _, ...resto } = prev
      void _
      return resto
    }
    return { ...prev, [lote.id]: Object.fromEntries(criasDe(lote.id).map(c => [c.id, String(stockDe(lote.id, c.id))])) }
  })
  const editarDestino = (clave: string, cambio: Partial<DestinoForm>) =>
    setDestinosEditados(destinos.map(d => (d.clave === clave ? { ...d, ...cambio } : d)))

  // Balance por categoría sexada
  const asignado = (catId: string) => destinos.reduce((s, d) => s + (entero(d.cantidades[catId]) || 0), 0)
  const faltantes = [...totales].map(([c, t]) => ({ c, falta: t - asignado(c) })).filter(x => x.falta !== 0)
  const nombreCat = (catId: string) => categorias.find(c => c.id === catId)?.nombre ?? "—"

  const yaDestetados = elegidos
    .map(loteId => ({
      lote: lotes.find(l => l.id === loteId),
      fecha: (historial?.destetes ?? []).filter(d => d.lote_id === loteId && d.rol === "destino").map(d => d.fecha).sort().pop(),
    }))
    .filter((x): x is { lote: Lote; fecha: string } => !!x.lote && !!x.fecha)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const origenes: OrigenDestete[] = []
    for (const [loteId, porCat] of Object.entries(cantidades)) {
      const lote = lotes.find(l => l.id === loteId)
      const lineas = []
      for (const [catId, v] of Object.entries(porCat)) {
        const pedido = entero(v)
        if (Number.isNaN(pedido)) return setError(`Las cabezas de ${lote?.nombre ?? "un lote"} tienen que ser números enteros`)
        if (pedido > stockDe(loteId, catId)) return setError(`En ${lote?.nombre} hay ${stockDe(loteId, catId)} ${nombreCat(catId).toLowerCase()}`)
        const n = efectivas[loteId]?.[catId] ?? 0
        if (n > 0) lineas.push({ categoria_id: catId, cabezas: n })
      }
      const textoKg = (pesos[loteId] ?? "").trim()
      // "6.840" y "6840,5" (puntos de miles, coma decimal) o "6840.5"
      const normal = textoKg.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(textoKg) ? textoKg.replace(/\./g, "").replace(",", ".") : textoKg
      const kg = textoKg === "" ? null : Number(normal)
      if (kg !== null && !(Number.isFinite(kg) && kg > 0)) {
        return setError(`El peso de las crías de ${lote?.nombre ?? "un lote"} tiene que ser un número de kilos mayor a cero`)
      }
      if (lineas.length > 0) origenes.push({ lote_id: loteId, lineas, ...(kg !== null ? { peso_vivo_total_kg: Math.round(kg * 100) / 100 } : {}) })
    }
    if (!sexadoValido) {
      return setError(`Machos y hembras tienen que ser números enteros, sin negativos, y sumar como máximo ${sinSexar}`)
    }
    if (origenes.length === 0) {
      return setError(sinSexar > 0
        ? "Indicá cuántos machos y cuántas hembras se destetan"
        : "Elegí al menos un lote y cuántas crías se destetan")
    }
    if (fechaAntesDeParicion) {
      return setError(`La última parición de los lotes elegidos es del ${fechaCorta(ultimaParicion)}: el destete no puede ser anterior`)
    }
    if (sinSexar > 0 && (!catMacho || !catHembra)) {
      return setError("La especie necesita una categoría de cría macho y una hembra (Especies) para separar las sin sexar")
    }
    const lista: DestinoDestete[] = []
    const fijos: { lote_id: string; lineas: { categoria_id: string; cabezas: number }[] }[] = []
    for (const d of destinos) {
      if (!d.nombre.trim()) return setError("Cada lote nuevo necesita un nombre")
      const lineas = []
      for (const [catId, v] of Object.entries(d.cantidades)) {
        const n = entero(v)
        if (Number.isNaN(n)) return setError(`Las cabezas de ${d.nombre} tienen que ser números enteros`)
        if (n > 0) lineas.push({ categoria_id: catId, cabezas: n })
      }
      if (lineas.length === 0) {
        return setError(edicion
          ? `${d.nombre} no puede quedar sin cabezas: para sacar un destino, eliminá el destete y cargalo de nuevo`
          : `${d.nombre} no tiene cabezas: sacalo o asignale crías`)
      }
      lista.push({ nombre: d.nombre.trim(), anios_nacimiento: d.anios, lineas, ...(d.potrero ? { potrero_id: d.potrero } : {}) })
      fijos.push({ lote_id: d.clave, lineas })
    }
    if (faltantes.length > 0) {
      return setError(faltantes.map(f => `${nombreCat(f.c)}: ${f.falta > 0 ? `faltan asignar ${f.falta}` : `sobran ${-f.falta}`}`).join(" · "))
    }

    setEnviando(true)
    if (edicion) {
      try {
        await editarDestete({ id, fecha, origenes, destinos: fijos, responsables, notas: notas.trim() || null })
        toast.success("Destete actualizado")
        router.push(`/actividades/${id}`)
      } catch (err) {
        setError(mensajeDeError(err))
        setEnviando(false)
      }
      return
    }
    try {
      await registrarDestete({ id, establecimiento_id: estId, fecha, origenes, destinos: lista,
        responsables, notas: notas.trim() || null })
      const roles = await getLotesConRol(id)
      const nuevos = await getLotesPorIds(roles.filter(r => r.rol === "destino").map(r => r.lote_id))
      toast.success("Destete registrado")
      setHecho({ destinos: nuevos })
    } catch (err) {
      // El id se conserva: si el envío llegó a guardarse, reintentar no lo duplica
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  // ── Confirmación: acceso directo a la pesada de cada lote nuevo ──
  if (hecho) {
    return (
      <div className="max-w-xl space-y-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Destete registrado</h1>
        </div>
        <p className="text-sm text-muted-foreground">Lotes nuevos. Podés cargar ahora el peso al destete de cada uno.</p>
        <ul className="space-y-2">
          {hecho.destinos.map(l => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
              <Link href={`/lotes/${l.id}`} className="font-medium text-primary">{l.nombre}</Link>
              <Link href={`/actividades/nueva?tipo=pesada&lote=${l.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "h-10 md:h-8" })}>
                <Scale className="h-4 w-4 mr-1" /> Cargar pesada
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link href={`/actividades/${id}`} className={buttonVariants({ className: BOTON })}>Ver el destete</Link>
          <Link href="/lotes" className={buttonVariants({ variant: "outline", className: BOTON })}>Ir a lotes</Link>
        </div>
      </div>
    )
  }

  const chip = (activo: boolean) => cn("min-h-10 rounded-full border px-3 text-sm transition-colors",
    activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")

  return (
    <>
      <h1 className="text-2xl font-bold">{edicion ? "Editar destete" : "Destete"}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">{DESCRIPCION_ACTIVIDAD.destete}.</p>

      <form onSubmit={onSubmit} className="space-y-6 max-w-xl">
        <div className="space-y-1.5">
          <Label htmlFor="destete-fecha">Fecha</Label>
          <Input id="destete-fecha" type="date" min={ultimaParicion || undefined} max={hoyLocal()} className={CAMPO}
            value={fecha} onChange={e => setFecha(e.target.value)} />
          {fechaAntesDeParicion && (
            <p role="alert" className="text-sm text-destructive">
              La última parición de los lotes elegidos es del {fechaCorta(ultimaParicion)}: el destete tiene que ser ese día o después.
            </p>
          )}
        </div>

        {/* 1. Orígenes */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium mb-1">1. De qué lotes salen las crías</legend>
          {!historial ? (
            <div className="h-24 rounded-lg border bg-muted/30 animate-pulse" />
          ) : lotesConCria.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay lotes con crías al pie (crías con sus madres, o que vengan de una parición).</p>
          ) : (
            <ul className="space-y-2">
              {lotesConCria.map(l => {
                const elegido = !!cantidades[l.id]
                const otraEspecie = !!especieId && l.especie_id !== especieId
                return (
                  <li key={l.id} className={cn("rounded-lg border", elegido && "border-primary")}>
                    <label className={cn("flex items-center gap-3 px-3 min-h-12", otraEspecie ? "opacity-50" : "cursor-pointer")}>
                      <input type="checkbox" className="h-5 w-5 accent-primary" checked={elegido} disabled={otraEspecie || enviando}
                        onChange={() => alternarOrigen(l)} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">{l.nombre}</span>
                        <span className="block text-xs text-muted-foreground">
                          {criasDe(l.id).map(c => `${stockDe(l.id, c.id)} ${c.nombre.toLowerCase()}`).join(" · ")}
                        </span>
                      </span>
                    </label>
                    {elegido && (
                      <div className="border-t">
                        <p className="px-3 pt-2 text-sm font-medium">¿Cuántos se destetan?</p>
                        <p className="px-3 text-xs text-muted-foreground">Por defecto, todos. Podés destetar una parte: el resto queda en el lote.</p>
                        <div className="divide-y">
                          {criasDe(l.id).map(c => (
                            <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                              <span className="text-sm">{c.nombre}</span>
                              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Input aria-label={`${c.nombre} que se destetan de ${l.nombre}`} type="number" inputMode="numeric" min="0"
                                  max={stockDe(l.id, c.id)} step="1" className={`${CAMPO} w-20 text-right tabular-nums text-foreground`}
                                  value={cantidades[l.id]?.[c.id] ?? ""}
                                  onChange={e => cambiarSalida(prev => ({ ...prev, [l.id]: { ...prev[l.id], [c.id]: e.target.value } }))} />
                                de {stockDe(l.id, c.id)}
                              </span>
                            </div>
                          ))}
                          <label className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="text-sm">
                              Peso total de las crías <span className="text-muted-foreground">(kg, opcional)</span>
                            </span>
                            <Input aria-label={`Peso total de las crías que se destetan de ${l.nombre} (kg)`} inputMode="decimal"
                              className={`${CAMPO} w-28 text-right tabular-nums`} placeholder="—" disabled={enviando}
                              value={pesos[l.id] ?? ""} onChange={e => setPesos(prev => ({ ...prev, [l.id]: e.target.value }))} />
                          </label>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {yaDestetados.map(x => (
            <p key={x.lote.id} role="status" className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {x.lote.nombre} ya viene de un destete ({fechaCorta(x.fecha)}). ¿Seguro que querés destetarlo otra vez?
            </p>
          ))}
        </fieldset>

        {/* 2. Sexo de las sin sexar: se destetan solo las que se separan (destete parcial) */}
        {sinSexar > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">2. ¿Cuántos machos y cuántas hembras se destetan?</legend>
            <p className="text-xs text-muted-foreground">
              Hay {sinSexar} crías sin sexar en los lotes elegidos. Se destetan las que separes acá; las demás quedan sin sexar en el lote.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="flex items-center gap-2">
                <Label htmlFor="destete-machos" className="text-sm">Machos</Label>
                <Input id="destete-machos" type="number" inputMode="numeric" min="0" max={sinSexar} step="1" placeholder="0"
                  className={`${CAMPO} w-24 text-right tabular-nums`} value={machos}
                  onChange={e => { setMachos(e.target.value); if (!edicion) setDestinosEditados(null) }} />
              </span>
              <span className="flex items-center gap-2">
                <Label htmlFor="destete-hembras" className="text-sm">Hembras</Label>
                <Input id="destete-hembras" type="number" inputMode="numeric" min="0" max={sinSexar} step="1" placeholder="0"
                  className={`${CAMPO} w-24 text-right tabular-nums`} value={hembras}
                  onChange={e => { setHembras(e.target.value); if (!edicion) setDestinosEditados(null) }} />
              </span>
            </div>
            {sexadoValido ? (
              <p className="text-sm">
                Se destetan <strong className="tabular-nums">{separadas}</strong> de {sinSexar}
                {sinSexar - separadas > 0 && <>; quedan <strong className="tabular-nums">{sinSexar - separadas}</strong> sin sexar en el lote</>}.
              </p>
            ) : (
              <p role="alert" className="text-sm text-destructive">
                Tienen que ser números enteros, sin negativos, y entre los dos no pueden pasar de {sinSexar}.
              </p>
            )}
          </fieldset>
        )}

        {/* 3. Destinos */}
        {totalCrias > 0 && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium mb-1">
              {sinSexar > 0 ? "3" : "2"}. {edicion ? "Cuántas van a cada lote" : "A qué lotes nuevos van"} ({totalCrias} crías)
            </legend>
            {edicion ? (
              <p className="text-xs text-muted-foreground">
                Los lotes que creó el destete no se cambian: para agregar o sacar uno, eliminá el destete y cargalo de nuevo.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={chip(destinosEditados === null)} onClick={() => setDestinosEditados(null)}>Por sexo</button>
                <button type="button" className={chip(destinos.length === 1 && destinosEditados !== null)}
                  onClick={() => setDestinosEditados([destinoTodo()])}>Juntar todo en un lote</button>
              </div>
            )}
            {destinos.map(d => (
              <Card key={d.clave}>
                <CardContent className="space-y-3 pt-4">
                  {edicion ? (
                    <p className="font-medium">{d.nombre}</p>
                  ) : (
                    <div className="flex items-start gap-2">
                      <Input aria-label="Nombre del lote nuevo" className={`${CAMPO} flex-1`} value={d.nombre}
                        onChange={e => editarDestino(d.clave, { nombre: e.target.value })} />
                      {destinos.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9 shrink-0" aria-label={`Sacar ${d.nombre}`}
                          onClick={() => setDestinosEditados(destinos.filter(x => x.clave !== d.clave))}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="rounded-lg border divide-y">
                    {categoriasDestino(d).map(catId => (
                      <div key={catId} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-sm">{nombreCat(catId)}</span>
                        <Input aria-label={`${nombreCat(catId)} en ${d.nombre}`} type="number" inputMode="numeric" min="0" step="1" placeholder="0"
                          className={`${CAMPO} w-20 text-right tabular-nums`} value={d.cantidades[catId] ?? ""}
                          onChange={e => editarDestino(d.clave, { cantidades: { ...d.cantidades, [catId]: e.target.value } })} />
                      </div>
                    ))}
                  </div>
                  {!edicion && (
                    <>
                      <select aria-label={`Potrero de ${d.nombre}`} className={SELECT_NATIVO} value={d.potrero}
                        onChange={e => editarDestino(d.clave, { potrero: e.target.value })}>
                        <option value="">Sin potrero</option>
                        {potreros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                      <div className="space-y-1.5">
                        <Label htmlFor={`destete-anios-${d.clave}`}>Año de nacimiento</Label>
                        <SelectorAnios id={`destete-anios-${d.clave}`} valor={d.anios} onCambio={anios => editarDestino(d.clave, { anios })} />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
            {!edicion && (
              <Button type="button" variant="outline" className="h-11 md:h-9"
                onClick={() => setDestinosEditados([...destinos, {
                  clave: nuevoId(), nombre: `Destetados ${anioNombre}`, potrero: "", anios: aniosSugeridos, cantidades: {},
                }])}>
                <Plus className="h-4 w-4 mr-1" /> Agregar otro lote
              </Button>
            )}
            {faltantes.length > 0 ? (
              <p role="status" className="text-sm text-destructive">
                {faltantes.map(f => `${nombreCat(f.c)}: ${f.falta > 0 ? `faltan asignar ${f.falta}` : `sobran ${-f.falta}`}`).join(" · ")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Todas las crías tienen lote.</p>
            )}
          </fieldset>
        )}

        <SelectorResponsables personas={personas} elegidos={responsables} onCambio={setResponsables} conservar={a?.responsables ?? []} />
        <div className="space-y-1.5">
          <Label htmlFor="destete-notas">Notas</Label>
          <textarea id="destete-notas" rows={2} className={TEXTAREA} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" className={BOTON} disabled={enviando || totalCrias === 0}>
            {enviando ? "Guardando..." : edicion ? "Guardar cambios" : "Registrar destete"}
          </Button>
          {edicion && (
            <Button type="button" variant="outline" className={BOTON} onClick={() => router.back()} disabled={enviando}>Cancelar</Button>
          )}
        </div>
      </form>
    </>
  )
}
