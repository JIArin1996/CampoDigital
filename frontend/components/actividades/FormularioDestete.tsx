"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Plus, Scale, X } from "lucide-react"
import { toast } from "sonner"

import { getHistorialCria, getLotesConRol, registrarDestete } from "@/lib/queries/actividades"
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
import { cn } from "@/lib/utils"
import type { Potrero } from "@/types/database"
import type { CategoriaAnimal, Lote, StockLote } from "@/types/lotes"
import type { DestinoDestete, OrigenDestete } from "@/types/actividades"

type Historial = Awaited<ReturnType<typeof getHistorialCria>>
type Persona = { id: string; nombre: string; activo: boolean }

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

/**
 * Destete: mueve crías al pie (solo categorías de cría) de uno o más lotes a lotes nuevos.
 * Las crías sin sexar se separan en machos y hembras; los destinos se sugieren por sexo (o todo
 * junto) con los años de las pariciones, y todo se puede editar. La base valida el balance igual.
 */
export function FormularioDestete({ loteInicial, datos }: {
  loteInicial: string
  datos: {
    estId: string
    lotes: Lote[]
    categorias: CategoriaAnimal[]
    stock: StockLote[]
    potreros: Potrero[]
    personas: Persona[]
  }
}) {
  const { estId, lotes, categorias, stock, potreros, personas } = datos

  const [id] = useState(nuevoId)
  const [fecha, setFecha] = useState(hoyLocal())
  const [historial, setHistorial] = useState<Historial | null>(null)
  // lote → categoría → cabezas. Si se entra desde un lote con crías, arranca elegido con todas.
  const [cantidades, setCantidades] = useState<Record<string, Record<string, string>>>(() => {
    const crias = stock.filter(s => s.lote_id === loteInicial && s.cabezas > 0
      && categorias.some(c => c.id === s.categoria_id && c.cria_al_pie))
    return crias.length > 0 ? { [loteInicial]: Object.fromEntries(crias.map(s => [s.categoria_id, String(s.cabezas)])) } : {}
  })
  const [machos, setMachos] = useState("")
  const [destinosEditados, setDestinosEditados] = useState<DestinoForm[] | null>(null)       // null: los sugeridos
  const [personaId, setPersonaId] = useState("")
  const [notas, setNotas] = useState("")
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
  const lotesConCria = lotes.filter(l => tieneCrias(l.id) && (tieneMadres(l.id) || parioEn(l.id)))

  const elegidos = Object.keys(cantidades)
  const especieId = lotes.find(l => l.id === elegidos[0])?.especie_id ?? null
  const catsEspecie = categorias.filter(c => c.especie_id === especieId && c.cria_al_pie).sort((a, b) => a.orden - b.orden)
  const catMacho = catsEspecie.find(c => c.sexo === "macho") ?? null
  const catHembra = catsEspecie.find(c => c.sexo === "hembra") ?? null
  const sexadas = catsEspecie.filter(c => c.sexo !== null)

  // Lo que sale, por categoría
  const sale = new Map<string, number>()
  for (const [loteId, porCat] of Object.entries(cantidades)) {
    for (const [catId, v] of Object.entries(porCat)) {
      const n = entero(v)
      if (n > 0) sale.set(catId, (sale.get(catId) ?? 0) + n)
    }
    void loteId
  }
  const sinSexar = catsEspecie.filter(c => c.sexo === null).reduce((s, c) => s + (sale.get(c.id) ?? 0), 0)
  const m = sinSexar > 0 ? entero(machos) : 0
  const h = sinSexar - (Number.isNaN(m) ? 0 : m)
  const sexadoValido = sinSexar === 0 || (!Number.isNaN(m) && m >= 0 && m <= sinSexar)

  // Lo que tiene que entrar a los destinos, por categoría sexada
  const totales = new Map<string, number>()
  for (const c of sexadas) {
    let t = sale.get(c.id) ?? 0
    if (sexadoValido && c.id === catMacho?.id) t += m
    if (sexadoValido && c.id === catHembra?.id) t += h
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

  // Cualquier cambio en lo que sale vuelve a los destinos sugeridos
  const cambiarSalida = (cambio: (prev: typeof cantidades) => typeof cantidades) => {
    setCantidades(cambio)
    setDestinosEditados(null)
  }
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
        const n = entero(v)
        if (Number.isNaN(n)) return setError(`Las cabezas de ${lote?.nombre ?? "un lote"} tienen que ser números enteros`)
        if (n > stockDe(loteId, catId)) return setError(`En ${lote?.nombre} hay ${stockDe(loteId, catId)} ${nombreCat(catId).toLowerCase()}`)
        if (n > 0) lineas.push({ categoria_id: catId, cabezas: n })
      }
      if (lineas.length > 0) origenes.push({ lote_id: loteId, lineas })
    }
    if (origenes.length === 0) return setError("Elegí al menos un lote y cuántas crías se destetan")
    if (fechaAntesDeParicion) {
      return setError(`La última parición de los lotes elegidos es del ${fechaCorta(ultimaParicion)}: el destete no puede ser anterior`)
    }
    if (!sexadoValido) return setError(`De las ${sinSexar} crías sin sexar, indicá cuántas son machos (entre 0 y ${sinSexar})`)
    if (sinSexar > 0 && (!catMacho || !catHembra)) {
      return setError("La especie necesita una categoría de cría macho y una hembra (Especies) para separar las sin sexar")
    }
    const lista: DestinoDestete[] = []
    for (const d of destinos) {
      if (!d.nombre.trim()) return setError("Cada lote nuevo necesita un nombre")
      const lineas = []
      for (const [catId, v] of Object.entries(d.cantidades)) {
        const n = entero(v)
        if (Number.isNaN(n)) return setError(`Las cabezas de ${d.nombre} tienen que ser números enteros`)
        if (n > 0) lineas.push({ categoria_id: catId, cabezas: n })
      }
      if (lineas.length === 0) return setError(`${d.nombre} no tiene cabezas: sacalo o asignale crías`)
      lista.push({ nombre: d.nombre.trim(), anios_nacimiento: d.anios, lineas, ...(d.potrero ? { potrero_id: d.potrero } : {}) })
    }
    if (faltantes.length > 0) {
      return setError(faltantes.map(f => `${nombreCat(f.c)}: ${f.falta > 0 ? `faltan asignar ${f.falta}` : `sobran ${-f.falta}`}`).join(" · "))
    }

    setEnviando(true)
    try {
      await registrarDestete({ id, establecimiento_id: estId, fecha, origenes, destinos: lista,
        persona_id: personaId || null, notas: notas.trim() || null })
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
      <h1 className="text-2xl font-bold">Destete</h1>
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

        {/* 2. Sexo de las sin sexar */}
        {sinSexar > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">2. Machos y hembras de las {sinSexar} crías sin sexar</legend>
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="destete-machos" className="text-sm">Machos</Label>
              <Input id="destete-machos" type="number" inputMode="numeric" min="0" max={sinSexar} step="1"
                className={`${CAMPO} w-24 text-right tabular-nums`} value={machos}
                onChange={e => { setMachos(e.target.value); setDestinosEditados(null) }} />
              <span className="text-sm">Hembras: <strong className="tabular-nums">{sexadoValido ? h : "—"}</strong></span>
            </div>
            {!sexadoValido && <p className="text-sm text-destructive">Tiene que ser un número entre 0 y {sinSexar}.</p>}
          </fieldset>
        )}

        {/* 3. Destinos */}
        {totalCrias > 0 && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium mb-1">{sinSexar > 0 ? "3" : "2"}. A qué lotes nuevos van ({totalCrias} crías)</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(destinosEditados === null)} onClick={() => setDestinosEditados(null)}>Por sexo</button>
              <button type="button" className={chip(destinos.length === 1 && destinosEditados !== null)}
                onClick={() => setDestinosEditados([destinoTodo()])}>Juntar todo en un lote</button>
            </div>
            {destinos.map(d => (
              <Card key={d.clave}>
                <CardContent className="space-y-3 pt-4">
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
                  <div className="rounded-lg border divide-y">
                    {[...totales.keys()].map(catId => (
                      <div key={catId} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-sm">{nombreCat(catId)}</span>
                        <Input aria-label={`${nombreCat(catId)} en ${d.nombre}`} type="number" inputMode="numeric" min="0" step="1" placeholder="0"
                          className={`${CAMPO} w-20 text-right tabular-nums`} value={d.cantidades[catId] ?? ""}
                          onChange={e => editarDestino(d.clave, { cantidades: { ...d.cantidades, [catId]: e.target.value } })} />
                      </div>
                    ))}
                  </div>
                  <select aria-label={`Potrero de ${d.nombre}`} className={SELECT_NATIVO} value={d.potrero}
                    onChange={e => editarDestino(d.clave, { potrero: e.target.value })}>
                    <option value="">Sin potrero</option>
                    {potreros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <div className="space-y-1.5">
                    <Label htmlFor={`destete-anios-${d.clave}`}>Año de nacimiento</Label>
                    <SelectorAnios id={`destete-anios-${d.clave}`} valor={d.anios} onCambio={anios => editarDestino(d.clave, { anios })} />
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button type="button" variant="outline" className="h-11 md:h-9"
              onClick={() => setDestinosEditados([...destinos, {
                clave: nuevoId(), nombre: `Destetados ${anioNombre}`, potrero: "", anios: aniosSugeridos, cantidades: {},
              }])}>
              <Plus className="h-4 w-4 mr-1" /> Agregar otro lote
            </Button>
            {faltantes.length > 0 ? (
              <p role="status" className="text-sm text-destructive">
                {faltantes.map(f => `${nombreCat(f.c)}: ${f.falta > 0 ? `faltan asignar ${f.falta}` : `sobran ${-f.falta}`}`).join(" · ")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Todas las crías tienen lote.</p>
            )}
          </fieldset>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="destete-persona">Responsable</Label>
          <select id="destete-persona" className={SELECT_NATIVO} value={personaId} onChange={e => setPersonaId(e.target.value)}>
            <option value="">Sin indicar</option>
            {personas.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="destete-notas">Notas</Label>
          <textarea id="destete-notas" rows={2} className={TEXTAREA} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className={BOTON} disabled={enviando || totalCrias === 0}>
          {enviando ? "Guardando..." : "Registrar destete"}
        </Button>
      </form>
    </>
  )
}
