"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SELECT_NATIVO } from "@/components/shared/estilos"
import {
  ETIQUETA_DIMENSION, MEDIDAS, NOMBRE_FUENTE, comparacionDe, esBEntero, formula, rasgosDeDefinicion, unidadSugerida,
} from "@/components/tablero/catalogo"
import { guardarMedida } from "@/lib/queries/tablero"
import { mensajeDeError } from "@/lib/supabase/errores"
import type { DefinicionMedida, Fuente, FuenteSimple, MedidaPropia, Operacion, Operando } from "@/types/tablero"

// Un operando en el select: "f:economia:gastos" (medida de una fuente), "p:<id>" (propia) o "c" (un número)
const claveDe = (o: Operando | undefined) =>
  !o ? "" : "constante" in o ? "c" : "propia" in o ? `p:${o.propia}` : `f:${o.fuente}:${o.medida}`

function operandoDe(clave: string, numero: string): Operando | null {
  if (clave === "c") {
    const n = Number(numero.replace(",", "."))
    return numero.trim() !== "" && Number.isFinite(n) ? { constante: n } : null
  }
  if (clave.startsWith("p:")) return { propia: clave.slice(2) }
  const [, fuente, medida] = clave.split(":")
  return fuente && medida ? { fuente: fuente as FuenteSimple, medida } : null
}

// Semi-aditivas: al cierre (un día) y promedio. Para dividir o multiplicar conviene la promedio (sección 4 del diseño).
const AL_CIERRE: Record<string, string> = { "stock:ug": "UG promedio", "stock:stock": "Stock promedio", "potreros:ug": "UG promedio" }

const OPERACIONES: { op: Operacion; nombre: string }[] = [
  { op: "div", nombre: "÷ dividido" }, { op: "mul", nombre: "× por" }, { op: "sum", nombre: "+ más" }, { op: "res", nombre: "− menos" },
]

/**
 * Crear o cambiar una medida propia: A (una medida de una fuente u otra propia), la operación y B (además, un número).
 * Propone la unidad y si es mejor que suba o que baje; la base valida la definición (sin ciclos, hasta 2 niveles).
 */
export function EditorMedida({ estId, inicial, propias, onGuardada, onCancelar }: {
  estId: string
  inicial: MedidaPropia | null          // null: nueva
  propias: MedidaPropia[]
  onGuardada: (id: string) => void | Promise<void>
  onCancelar: () => void
}) {
  const d0 = inicial?.definicion
  const [nombre, setNombre] = useState(inicial?.nombre ?? "")
  const [a, setA] = useState(claveDe(d0?.a) || "f:economia:gastos_operativos")
  const [op, setOp] = useState<Operacion>(d0?.op ?? "div")
  const [b, setB] = useState(claveDe(d0?.b) || "f:stock:ug_promedio")
  const [numero, setNumero] = useState(d0 && "constante" in d0.b ? String(d0.b.constante) : "")
  const [unidad, setUnidad] = useState(inicial?.unidad ?? "")
  const [unidadTocada, setUnidadTocada] = useState(!!inicial)
  const [mejor, setMejor] = useState<"sube" | "baja" | "">(inicial ? inicial.mejor ?? "" : "")
  const [mejorTocado, setMejorTocado] = useState(!!inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Propias que se pueden usar adentro: las que no usan otra propia (hasta 2 niveles), menos esta misma. Si otra
  // propia usa a esta, esta no puede usar ninguna (quedaría de 3 niveles).
  const usaPropia = (p: MedidaPropia) => "propia" in p.definicion.a || "propia" in p.definicion.b
  const laUsaOtra = !!inicial && propias.some(p => [p.definicion.a, p.definicion.b].some(o => "propia" in o && o.propia === inicial.id))
  const propiasUsables = laUsaOtra ? [] : propias.filter(p => p.id !== inicial?.id && !usaPropia(p))

  const oa = operandoDe(a, numero)
  const ob = operandoDe(b, numero)
  const definicion: DefinicionMedida | null = oa && ob ? { a: oa, op, b: ob } : null
  const rasgos = definicion ? rasgosDeDefinicion(definicion, nombre, unidad, propias) : null
  const sinTiempo = !!rasgos && rasgos.tiempos.length === 0
  const unidadFinal = unidadTocada ? unidad : definicion ? unidadSugerida(definicion, propias) : ""
  const mejorSugerido = oa && "fuente" in oa ? comparacionDe(oa.fuente, oa.medida) : "sube"
  const mejorFinal = mejorTocado ? mejor : mejorSugerido ?? ""
  const divPorCero = op === "div" && ob !== null && "constante" in ob && ob.constante === 0
  const cierre = (op === "div" || op === "mul") ? [a, b].map(k => AL_CIERRE[k.slice(2)]).find(Boolean) : undefined
  const valido = !!nombre.trim() && !!definicion && !!rasgos && !sinTiempo && !divPorCero && unidadFinal.length <= 20

  const guardar = async () => {
    if (!definicion || !valido) return
    setGuardando(true); setError(null)
    try {
      const id = await guardarMedida(estId, inicial?.id ?? null, {
        nombre: nombre.trim(), unidad: unidadFinal.trim() || null, mejor: mejorFinal || null, definicion,
      })
      await onGuardada(id)
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo guardar la medida"))
    } finally {
      setGuardando(false)
    }
  }

  const etiqueta = "flex flex-col gap-1 text-sm text-muted-foreground"
  const opciones = (conNumero: boolean) => (
    <>
      {(Object.keys(MEDIDAS) as Fuente[]).filter(f => f !== "combinada").map(f => (
        <optgroup key={f} label={NOMBRE_FUENTE[f]}>
          {Object.entries(MEDIDAS[f] ?? {}).map(([m, x]) => <option key={m} value={`f:${f}:${m}`}>{x.etiqueta}</option>)}
        </optgroup>
      ))}
      {propiasUsables.length > 0 && (
        <optgroup label="Medidas propias">
          {propiasUsables.map(p => <option key={p.id} value={`p:${p.id}`}>{p.nombre}</option>)}
        </optgroup>
      )}
      {conNumero && <optgroup label="Otro"><option value="c">Un número</option></optgroup>}
    </>
  )

  return (
    <section aria-label={inicial ? "Editar medida propia" : "Nueva medida propia"} className="space-y-3 rounded-md border bg-muted/30 p-3">
      <h3 className="text-sm font-semibold">{inicial ? "Editar medida propia" : "Nueva medida propia"}</h3>

      <label className={etiqueta}>Nombre
        <Input value={nombre} maxLength={60} placeholder="Ej.: Gasto por UG" onChange={e => setNombre(e.target.value)} />
      </label>

      <label className={etiqueta}>A
        <select className={SELECT_NATIVO} value={a} onChange={e => setA(e.target.value)}>{opciones(false)}</select>
      </label>
      <label className={etiqueta}>Operación
        <select className={SELECT_NATIVO} value={op} onChange={e => setOp(e.target.value as Operacion)}>
          {OPERACIONES.map(o => <option key={o.op} value={o.op}>{o.nombre}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className={etiqueta}>B
          <select className={SELECT_NATIVO} value={b} onChange={e => setB(e.target.value)}>{opciones(true)}</select>
        </label>
        {b === "c" && (
          <label className={etiqueta}>Número
            <Input inputMode="decimal" value={numero} onChange={e => setNumero(e.target.value)} className="w-24" aria-invalid={!ob} />
          </label>
        )}
      </div>

      {definicion && <p className="text-sm font-medium">{nombre.trim() || "La medida"} = {formula(definicion, propias)}</p>}
      {ob && esBEntero(ob) && !("constante" in ob) && (
        <p className="text-xs text-muted-foreground">B es del establecimiento entero: si abrís la tarjeta, cada grupo se divide por el total.</p>
      )}
      {cierre && <p className="text-xs text-amber-800 dark:text-amber-300">Para dividir conviene la versión promedio ({cierre}): la de al cierre es la de un solo día.</p>}
      {sinTiempo && <p role="alert" className="text-xs text-destructive">A y B no tienen ningún tiempo en común (total, por mes, por ejercicio o temporada): no se pueden combinar.</p>}
      {divPorCero && <p role="alert" className="text-xs text-destructive">No se puede dividir por cero.</p>}
      {rasgos && !sinTiempo && (
        <p className="text-xs text-muted-foreground">
          {rasgos.abrir.length > 0 ? `Se abre por ${rasgos.abrir.map(x => ETIQUETA_DIMENSION[x]).join(", ")}.` : "No se abre."}
          {" "}Le aplican los filtros que tienen A y B: {rasgos.filtran.length ? rasgos.filtran.map(x => ETIQUETA_DIMENSION[x]).join(" y ") : "ninguno"}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className={etiqueta}>Unidad
          <Input value={unidadFinal} maxLength={20} placeholder="Sin unidad" onChange={e => { setUnidad(e.target.value); setUnidadTocada(true) }} />
        </label>
        <label className={etiqueta}>Al comparar, es mejor si
          <select className={SELECT_NATIVO} value={mejorFinal} onChange={e => { setMejor(e.target.value as "sube" | "baja" | ""); setMejorTocado(true) }}>
            <option value="sube">Sube</option>
            <option value="baja">Baja</option>
            <option value="">Sin color</option>
          </select>
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!valido || guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar medida"}</Button>
        <Button size="sm" variant="outline" disabled={guardando} onClick={onCancelar}>Cancelar</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">La medida se guarda ya (no hace falta guardar el tablero) y queda para usar en otras tarjetas.</p>
    </section>
  )
}
