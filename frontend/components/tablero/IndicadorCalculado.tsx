"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BuscadorMedidas } from "@/components/tablero/BuscadorMedidas"
import {
  ETIQUETA_DIMENSION, NOMBRE_OP, comparacionDe, esBEntero, esFabrica, nombreOperando, rasgosDe, rasgosDeDefinicion, unidadSugerida,
  type Rasgos,
} from "@/components/tablero/catalogo"
import { formato } from "@/components/tablero/formato"
import type { Rango } from "@/components/tablero/periodos"
import { getDatosTablero, guardarMedida } from "@/lib/queries/tablero"
import { mensajeDeError } from "@/lib/supabase/errores"
import { cn } from "@/lib/utils"
import type { DefinicionMedida, Dimension, FiltrosIds, Fuente, MedidaPropia, Operacion, Operando, Tiempo } from "@/types/tablero"

const OPERACIONES: { op: Operacion; nombre: string }[] = [
  { op: "div", nombre: "dividido" }, { op: "mul", nombre: "por" }, { op: "sum", nombre: "más" }, { op: "res", nombre: "menos" },
]
// Semi-aditivas: al cierre (un día) y promedio. Para dividir o multiplicar conviene la promedio.
const AL_CIERRE: Record<string, string> = { "stock:ug": "UG promedio", "stock:stock": "Stock promedio", "potreros:ug": "UG promedio" }
const foco = "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

// Un operando como lo elige el buscador: las medidas de una fuente, o un indicador calculado (fuente "combinada")
const aOperando = (f: Fuente, m: string): Operando => (f === "combinada" ? { propia: m } : { fuente: f, medida: m })
const deOperando = (o: Operando): [Fuente, string] => ("propia" in o ? ["combinada", o.propia] : "fuente" in o ? [o.fuente, o.medida] : ["stock", "stock"])

// "1.250,5" (coma decimal: los puntos son de miles) o "2.5"; null si no es un número
function numeroDe(texto: string): number | null {
  const t = texto.trim()
  if (!t) return null
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t)
  return Number.isFinite(n) ? n : null
}

// El período del ejemplo: todo junto si se puede; si no, el último que haya
const TIEMPOS_EJEMPLO: Tiempo[] = ["total", "ejercicio", "temporada", "mes"]
const ULTIMO: Record<Tiempo, string> = { total: "", ejercicio: "el último ejercicio", temporada: "la última temporada", mes: "el último mes" }
const CLAVE_FILTRO: Partial<Record<Dimension, keyof FiltrosIds>> = { especie: "especie_ids", categoria: "categoria_ids", lote: "lote_ids" }

// El valor de un operando sin separar, con los filtros del tablero que le aplican (el último período, si no es todo junto)
async function valorDe(o: Operando, tiempo: Tiempo, estId: string, rango: Rango, filtros: FiltrosIds): Promise<number | null> {
  if ("constante" in o) return o.constante
  const [fuente, medida] = deOperando(o)
  const rows = await getDatosTablero({
    establecimiento_id: estId, medida, desde: rango.desde, hasta: rango.hasta, filtros,
    definicion: { fuente, medidas: [medida], abrir_por: null, tiempo, grafico: "numero" },
  })
  const conValor = rows.filter(r => r.clave === null && r.valor !== null)
  return conValor.length ? conValor[conValor.length - 1].valor : null
}

function calcular(a: number, op: Operacion, b: number): number | null {
  if (op === "div") return b === 0 ? null : a / b
  return op === "mul" ? a * b : op === "sum" ? a + b : a - b
}

type Ejemplo =
  | { estado: "cargando" }
  | { estado: "listo"; a: number | null; b: number | null; resultado: number | null; tiempo: Tiempo }
  | { estado: "no"; texto: string }

/**
 * Indicador calculado (contexto/DISENO-CONSTRUCTOR-TARJETAS.md, sección 7): se abre encima del constructor. Fórmula en
 * bloques (A, la operación, B o un número) con el mismo buscador, un resultado de ejemplo con los datos reales del
 * período y los filtros del tablero, la unidad y qué es mejor al comparar. La base valida y guarda (guardar_medida).
 */
export function IndicadorCalculado({ estId, inicial, propias, rango, etiquetaPeriodo, generales, onGuardado, onCancelar }: {
  estId: string
  inicial: MedidaPropia | null                 // null: nuevo
  propias: MedidaPropia[]                      // las del campo (sin las de fábrica)
  rango: Rango
  etiquetaPeriodo: string
  generales: FiltrosIds
  onGuardado: (id: string) => void | Promise<void>
  onCancelar: () => void
}) {
  const d0 = inicial?.definicion
  const [nombre, setNombre] = useState(inicial?.nombre ?? "")
  const [a, setA] = useState<Operando>(d0?.a ?? { fuente: "economia", medida: "gastos_operativos" })
  const [op, setOp] = useState<Operacion>(d0?.op ?? "div")
  const [bMedida, setBMedida] = useState<Operando>(d0 && !("constante" in d0.b) ? d0.b : { fuente: "stock", medida: "ug_promedio" })
  const [bEsNumero, setBEsNumero] = useState(!!d0 && "constante" in d0.b)
  const [numero, setNumero] = useState(d0 && "constante" in d0.b ? String(d0.b.constante).replace(".", ",") : "")
  const [unidad, setUnidad] = useState(inicial?.unidad ?? "")
  const [unidadTocada, setUnidadTocada] = useState(!!inicial)
  const [mejor, setMejor] = useState<"sube" | "baja" | "">(inicial ? inicial.mejor ?? "" : "")
  const [mejorTocado, setMejorTocado] = useState(!!inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ejemplo, setEjemplo] = useState<{ clave: string; e: Ejemplo } | null>(null)

  // Indicadores que se pueden usar adentro: los del campo que no usan otro (hasta 2 niveles), menos este mismo. Si
  // otro indicador usa a este, este no puede usar ninguno (quedaría de 3 niveles).
  const usaPropia = (p: MedidaPropia) => "propia" in p.definicion.a || "propia" in p.definicion.b
  const laUsaOtro = !!inicial && propias.some(p => [p.definicion.a, p.definicion.b].some(o => "propia" in o && o.propia === inicial.id))
  const usables = laUsaOtro ? [] : propias.filter(p => p.id !== inicial?.id && !usaPropia(p)).map(p => p.id)
  const permitir = useCallback((f: Fuente, m: string) => f !== "combinada" || (!esFabrica(m) && usables.includes(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usables.join()])

  const constante = numeroDe(numero)
  const b: Operando | null = bEsNumero ? (constante === null ? null : { constante }) : bMedida
  const definicion: DefinicionMedida | null = b ? { a, op, b } : null
  const rasgos: Rasgos | null = definicion ? rasgosDeDefinicion(definicion, nombre, unidad, propias) : null
  const sinTiempo = !!rasgos && rasgos.tiempos.length === 0
  const unidadFinal = unidadTocada ? unidad : definicion ? unidadSugerida(definicion, propias) : ""
  const mejorSugerido = "fuente" in a ? comparacionDe(a.fuente, a.medida) : "sube"
  const mejorFinal = mejorTocado ? mejor : mejorSugerido ?? ""
  const divPorCero = op === "div" && b !== null && "constante" in b && b.constante === 0
  const claveOp = (o: Operando) => ("fuente" in o ? `${o.fuente}:${o.medida}` : "")
  const cierre = op === "div" || op === "mul" ? [claveOp(a), b ? claveOp(b) : ""].map(k => AL_CIERRE[k]).find(Boolean) : undefined
  const faltaNombre = !nombre.trim()
  const valido = !faltaNombre && !!definicion && !!rasgos && !sinTiempo && !divPorCero && unidadFinal.length <= 20

  // Resultado de ejemplo: A y B por separado (cada uno en su función de la base), con los filtros del tablero que les
  // aplican, y la cuenta acá. Es una muestra: al usarlo en una tarjeta, lo calcula la base (tablero_combinada).
  const tiempoEjemplo = rasgos ? TIEMPOS_EJEMPLO.find(t => rasgos.tiempos.includes(t)) : undefined
  const filtrosEjemplo: FiltrosIds = {}
  for (const d of rasgos?.filtran ?? []) {
    const k = CLAVE_FILTRO[d]
    if (k && generales[k]?.length) filtrosEjemplo[k] = generales[k]
  }
  const claveEjemplo = definicion && rasgos && tiempoEjemplo && !divPorCero && !rasgos.abrirObligatorio
    ? JSON.stringify([estId, definicion, tiempoEjemplo, rango, filtrosEjemplo]) : null
  useEffect(() => {
    if (!claveEjemplo || !definicion || !tiempoEjemplo) return
    let vigente = true
    const t = setTimeout(async () => {
      setEjemplo({ clave: claveEjemplo, e: { estado: "cargando" } })
      try {
        const [va, vb] = await Promise.all([
          valorDe(definicion.a, tiempoEjemplo, estId, rango, filtrosEjemplo),
          valorDe(definicion.b, tiempoEjemplo, estId, rango, filtrosEjemplo),
        ])
        const resultado = va === null || vb === null ? null : calcular(va, definicion.op, vb)
        if (vigente) setEjemplo({ clave: claveEjemplo, e: { estado: "listo", a: va, b: vb, resultado, tiempo: tiempoEjemplo } })
      } catch (err) {
        if (vigente) setEjemplo({ clave: claveEjemplo, e: { estado: "no", texto: mensajeDeError(err, "No se pudo calcular el ejemplo") } })
      }
    }, 350)
    return () => { vigente = false; clearTimeout(t) }
    // claveEjemplo resume definicion, tiempo, rango y filtros
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveEjemplo])
  const e = claveEjemplo && ejemplo?.clave === claveEjemplo ? ejemplo.e : claveEjemplo ? { estado: "cargando" as const } : null

  const guardar = async () => {
    if (!definicion || !valido) return
    setGuardando(true); setError(null)
    try {
      const id = await guardarMedida(estId, inicial?.id ?? null, {
        nombre: nombre.trim(), unidad: unidadFinal.trim() || null, mejor: mejorFinal || null, definicion,
      })
      await onGuardado(id)
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo guardar el indicador"))
      setGuardando(false)
    }
  }

  const unidadDe = (o: Operando) => ("constante" in o ? "" : rasgosDe(o, propias)?.unidad ?? "")
  const [fa, ma] = deOperando(a)
  const [fb, mb] = deOperando(bMedida)
  const titulo = inicial ? "Editar indicador calculado" : "Nuevo indicador calculado"
  const bloque = "space-y-1.5 rounded-lg border bg-muted/30 p-3"
  const chip = (activo: boolean) => cn("rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors", foco,
    activo ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !guardando) onCancelar() }}>
      <DialogContent showCloseButton={false}
        className="flex max-h-[calc(100vh-2rem)] w-[720px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-xl font-bold">{titulo}</DialogTitle>
          <button type="button" aria-label="Cerrar" onClick={onCancelar} disabled={guardando}
            className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-muted", foco)}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre
            <Input value={nombre} maxLength={60} placeholder="Ej.: Gasto por UG" onChange={ev => setNombre(ev.target.value)} />
          </label>

          {/* Fórmula en bloques: A, la operación, B o un número */}
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-semibold">Fórmula</legend>
            <div className={bloque}>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">A</p>
              <BuscadorMedidas fuente={fa} medida={ma} permitir={permitir} nombreCampo="Medida A"
                onElegir={(f, m) => setA(aOperando(f, m))} />
            </div>
            <div role="radiogroup" aria-label="Operación" className="flex flex-wrap items-center gap-1.5 px-1">
              {OPERACIONES.map(o => (
                <button key={o.op} type="button" role="radio" aria-checked={op === o.op} onClick={() => setOp(o.op)} className={chip(op === o.op)}>
                  <span aria-hidden className="mr-1 text-base">{NOMBRE_OP[o.op]}</span>{o.nombre}
                </button>
              ))}
            </div>
            <div className={bloque}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">B</p>
                <div role="radiogroup" aria-label="B es" className="flex gap-1">
                  <button type="button" role="radio" aria-checked={!bEsNumero} onClick={() => setBEsNumero(false)} className={cn(chip(!bEsNumero), "px-2 py-0.5 text-xs")}>Una medida</button>
                  <button type="button" role="radio" aria-checked={bEsNumero} onClick={() => setBEsNumero(true)} className={cn(chip(bEsNumero), "px-2 py-0.5 text-xs")}>Un número</button>
                </div>
              </div>
              {bEsNumero ? (
                <label className="flex items-center gap-2 text-sm">
                  <span className="sr-only">Número</span>
                  <Input inputMode="decimal" value={numero} placeholder="Ej.: 1.000" className="w-40" aria-invalid={numero.trim() !== "" && constante === null}
                    onChange={ev => setNumero(ev.target.value)} />
                  {numero.trim() !== "" && constante === null && <span role="alert" className="text-xs text-destructive">Escribí un número (ej.: 1.250,5)</span>}
                </label>
              ) : (
                <BuscadorMedidas fuente={fb} medida={mb} permitir={permitir} nombreCampo="Medida B"
                  onElegir={(f, m) => setBMedida(aOperando(f, m))} />
              )}
            </div>
          </fieldset>

          {/* Lo que resulta: la fórmula en palabras, el ejemplo con datos reales y los avisos */}
          <section aria-label="Resultado" aria-live="polite" className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            {definicion && <p className="font-semibold">{nombre.trim() || "El indicador"} = {nombreOperando(definicion.a, propias)} {NOMBRE_OP[op]} {nombreOperando(definicion.b, propias)}</p>}
            {!definicion && <p className="text-muted-foreground">Elegí A, la operación y B para ver el resultado.</p>}
            {e?.estado === "cargando" && <p className="text-muted-foreground">Calculando un ejemplo con tus datos…</p>}
            {e?.estado === "no" && <p className="text-muted-foreground">{e.texto}</p>}
            {e?.estado === "listo" && definicion && (e.resultado !== null ? (
              <p>
                Con el período del tablero ({etiquetaPeriodo}{e.tiempo === "total" ? "" : `, ${ULTIMO[e.tiempo]}`}) da{" "}
                <strong className="text-base">{formato(e.resultado, unidadFinal)}</strong>
                <span className="text-muted-foreground"> ({formato(e.a, unidadDe(definicion.a))} {NOMBRE_OP[op]} {formato(e.b, unidadDe(definicion.b))})</span>
              </p>
            ) : (
              <p className="text-muted-foreground">
                Con el período del tablero ({etiquetaPeriodo}){" "}
                {e.a === null ? `no hay datos de ${nombreOperando(definicion.a, propias)}` :
                  e.b === null ? `no hay datos de ${nombreOperando(definicion.b, propias)}` :
                  `${nombreOperando(definicion.b, propias)} da 0 y no se puede dividir`}: no hay ejemplo, pero el indicador se guarda igual.
              </p>
            ))}
            {rasgos?.abrirObligatorio && !sinTiempo && <p className="text-muted-foreground">El ejemplo no se muestra: este indicador solo se ve separado ({rasgos.abrir.map(x => ETIQUETA_DIMENSION[x]).join(", ")}).</p>}
            {Object.keys(filtrosEjemplo).length > 0 && e?.estado === "listo" && <p className="text-xs text-muted-foreground">Con los filtros del tablero.</p>}

            {b && !("constante" in b) && esBEntero(b) && (
              <p className="text-xs text-muted-foreground">B es del establecimiento entero: si separás la tarjeta, cada grupo se divide por el total.</p>
            )}
            {cierre && <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />Para dividir o multiplicar conviene la versión promedio ({cierre}): la de al cierre es la de un solo día.</p>}
            {sinTiempo && <p role="alert" className="text-xs text-destructive">A y B no tienen ningún período en común (todo junto, mes a mes, por ejercicio o por temporada): no se pueden combinar.</p>}
            {divPorCero && <p role="alert" className="text-xs text-destructive">No se puede dividir por cero.</p>}
            {rasgos && !sinTiempo && (
              <p className="text-xs text-muted-foreground">
                {rasgos.abrir.length > 0 ? `Se puede separar por ${rasgos.abrir.map(x => ETIQUETA_DIMENSION[x]).join(", ")}` : "No se puede separar"}
                {" "}(lo que admiten A y B). Le aplican los filtros de {rasgos.filtran.length ? rasgos.filtran.map(x => ETIQUETA_DIMENSION[x]).join(" y ") : "ninguno"}.
              </p>
            )}
          </section>

          <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Unidad
              <Input value={unidadFinal} maxLength={20} placeholder="Sin unidad" onChange={ev => { setUnidad(ev.target.value); setUnidadTocada(true) }} />
              {!unidadTocada && unidadFinal && <span className="text-xs font-normal text-muted-foreground">Sugerida por A y B</span>}
            </label>
            <div className="flex flex-col gap-1.5">
              <p id="mejor-indicador" className="text-sm font-semibold">Al comparar, es mejor que</p>
              <div role="radiogroup" aria-labelledby="mejor-indicador" className="flex flex-wrap gap-1.5">
                {([["sube", "Suba"], ["baja", "Baje"], ["", "Da igual"]] as const).map(([v, t]) => (
                  <button key={t} type="button" role="radio" aria-checked={mejorFinal === v} className={chip(mejorFinal === v)}
                    onClick={() => { setMejor(v); setMejorTocado(true) }}>{t}</button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Da el color de la flecha al comparar con el año anterior.</span>
            </div>
          </div>
        </div>

        <footer className="space-y-1 border-t bg-muted/30 px-6 py-3">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            {faltaNombre && <span className="mr-auto text-xs text-muted-foreground">Falta el nombre.</span>}
            <Button variant="outline" disabled={guardando} onClick={onCancelar}>Cancelar</Button>
            <Button disabled={!valido || guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar indicador"}</Button>
          </div>
          <p className="text-right text-xs text-muted-foreground">Queda disponible para todas las tarjetas del campo.</p>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Borrar un indicador calculado: confirmación propia (no window.confirm). Si lo usan tarjetas u otros indicadores,
 * dice cuáles y no deja.
 */
export function BorrarIndicador({ indicador, tarjetas, indicadores, borrando, onBorrar, onCancelar }: {
  indicador: MedidaPropia
  tarjetas: string[]                            // las tarjetas que lo usan ("Economía · Gasto por UG")
  indicadores: string[]                         // los indicadores que lo usan
  borrando: boolean
  onBorrar: () => void
  onCancelar: () => void
}) {
  const enUso = tarjetas.length + indicadores.length > 0
  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !borrando) onCancelar() }}>
      <DialogContent className="w-[480px] max-w-[calc(100vw-2rem)] sm:max-w-[480px]">
        <DialogTitle>{enUso ? `"${indicador.nombre}" está en uso` : `¿Borrar "${indicador.nombre}"?`}</DialogTitle>
        <DialogDescription>
          {enUso ? "No se puede borrar mientras lo use algo. Cambiá o sacá primero:" : "Se borra para todas las tarjetas del campo. No se puede deshacer."}
        </DialogDescription>
        {enUso && (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {tarjetas.map(t => <li key={`t:${t}`}>Tarjeta {t}</li>)}
            {indicadores.map(i => <li key={`i:${i}`}>Indicador &quot;{i}&quot;</li>)}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-2">
          {enUso ? <Button onClick={onCancelar}>Entendido</Button> : <>
            <Button variant="outline" disabled={borrando} onClick={onCancelar}>Cancelar</Button>
            <Button variant="destructive" disabled={borrando} onClick={onBorrar}>{borrando ? "Borrando…" : "Borrar indicador"}</Button>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
