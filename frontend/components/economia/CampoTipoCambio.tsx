"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CAMPO } from "@/components/shared/estilos"
import { fechaCorta } from "@/components/lotes/formato"
import { numero, tipoCambioATexto, type TipoCambioForm } from "@/components/economia/formato"
import { VENTANA_DIAS, type CotizacionBcu, type ErrorCotizacion } from "@/lib/economia/tipoCambio"

// Tiempo máximo esperando la route (que a su vez espera al BCU 5 segundos)
const ESPERA_MS = 7000

type Consulta = { fecha: string; ok: CotizacionBcu; error?: undefined } | { fecha: string; ok?: undefined; error: ErrorCotizacion }

const deCotizacion = (c: { fecha: string; tipo_cambio: number }, guardada = true): TipoCambioForm =>
  ({ texto: tipoCambioATexto(c.tipo_cambio), fechaBcu: c.fecha, guardada })

const diaMes = (iso: string) => fechaCorta(iso).slice(0, 5)

// ¿La cotización de fechaBcu vale para un movimiento de esa fecha? (la misma regla que la base)
function valePara(fechaBcu: string, fecha: string) {
  const desde = new Date(`${fecha}T12:00:00Z`)
  desde.setUTCDate(desde.getUTCDate() - VENTANA_DIAS)
  return fechaBcu <= fecha && fechaBcu >= desde.toISOString().slice(0, 10)
}

/**
 * Tipo de cambio de un movimiento en pesos. Al elegir la fecha (o al pasar a pesos) se completa con el
 * del BCU, con la leyenda "BCU, 23/10/2026" ("último día hábil anterior" si es de otra fecha y "no se
 * pudo guardar" si no quedó en tipos_cambio). Si se edita a mano queda "Cargado a mano" y, si hay una
 * cotización del BCU para la fecha, el botón "Usar BCU (...)" (un cambio de fecha no pisa lo cargado
 * a mano). Si el BCU falla: aviso y, si hay, "Usar última guardada (...)". Nunca bloquea el guardado.
 */
export function CampoTipoCambio({ id, fecha, valor, onCambio, consultarAlInicio = true }: {
  id: string
  fecha: string                  // la del movimiento
  valor: TipoCambioForm
  onCambio: React.Dispatch<React.SetStateAction<TipoCambioForm>>
  consultarAlInicio?: boolean    // false al editar: muestra lo guardado y consulta recién si cambia la fecha
}) {
  const [consulta, setConsulta] = useState<Consulta | null>(null)
  const [fechaSinConsultar] = useState(consultarAlInicio ? null : fecha)
  const alCambiar = useRef(onCambio)
  useEffect(() => { alCambiar.current = onCambio })

  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha)
  const consultar = fechaValida && fecha !== fechaSinConsultar

  useEffect(() => {
    if (!consultar) return
    let vigente = true
    const control = new AbortController()
    const espera = setTimeout(() => control.abort(), ESPERA_MS)
    fetch(`/api/tipo-cambio?fecha=${fecha}`, { signal: control.signal, cache: "no-store" })
      .then(async (r): Promise<Consulta> => {
        const cuerpo = await r.json().catch(() => null)
        if (r.ok && cuerpo) return { fecha, ok: cuerpo as CotizacionBcu }
        return { fecha, error: (cuerpo as ErrorCotizacion | null) ?? { error: "bcu_error", mensaje: "Respuesta inesperada del servidor" } }
      })
      .catch((err): Consulta => ({
        fecha,
        error: (err as { name?: string })?.name === "AbortError"
          ? { error: "bcu_timeout", mensaje: "El BCU tardó demasiado en responder" }
          : { error: "bcu_error", mensaje: "No se pudo conectar con el servidor" },
      }))
      .then(resultado => {
        if (!vigente) return
        setConsulta(resultado)
        if (resultado.ok) {
          const cot = resultado.ok
          // Completa si está vacío o si lo que había también vino del BCU; lo cargado a mano no se pisa
          alCambiar.current(v => (v.texto.trim() === "" || v.fechaBcu ? deCotizacion(cot, cot.guardada) : v))
        } else {
          // Una cotización del BCU que ya no vale para la nueva fecha se saca (no se completa nada solo)
          alCambiar.current(v => (v.fechaBcu && !valePara(v.fechaBcu, fecha) ? { texto: "", fechaBcu: "", guardada: true } : v))
        }
      })
      .finally(() => clearTimeout(espera))
    return () => { vigente = false; clearTimeout(espera); control.abort() }
  }, [fecha, consultar])

  const actual = consulta?.fecha === fecha ? consulta : null
  const cargando = consultar && !actual
  const aMano = !valor.fechaBcu && valor.texto.trim() !== ""
  const cot = actual?.ok
  const ultima = actual?.error?.ultima_guardada ?? null
  const difiereDelBcu = cot && numero(valor.texto) !== cot.tipo_cambio

  return (
    <div className="space-y-1.5">
      <Input id={id} type="text" inputMode="decimal" placeholder="Ej: 40,5" className={CAMPO} value={valor.texto}
        onChange={e => onCambio({ texto: e.target.value, fechaBcu: "", guardada: true })} />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" aria-live="polite">
        {cargando ? (
          <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando BCU…</span>
        ) : valor.fechaBcu ? (
          <span>
            BCU, {fechaCorta(valor.fechaBcu)}
            {valor.fechaBcu !== fecha && " (último día hábil anterior)"}
            {!valor.guardada && <span className="text-amber-700 dark:text-amber-400"> (no se pudo guardar)</span>}
          </span>
        ) : aMano ? (
          <span>Cargado a mano</span>
        ) : null}

        {!cargando && aMano && cot && difiereDelBcu && (
          <Button type="button" variant="link" size="sm" className="h-auto min-h-8 p-0 text-xs"
            onClick={() => onCambio(deCotizacion(cot, cot.guardada))}>
            Usar BCU ({tipoCambioATexto(cot.tipo_cambio)} del {diaMes(cot.fecha)})
          </Button>
        )}
      </div>

      {!cargando && actual?.error && !valor.fechaBcu && (
        <div className="space-y-1">
          <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
            {actual.error.error === "sin_cotizacion"
              ? "El BCU no tiene cotización para esa fecha: cargala a mano."
              : `No se pudo traer la cotización del BCU (${actual.error.mensaje}): cargala a mano.`}
          </p>
          {ultima && valePara(ultima.fecha, fecha) && (
            <Button type="button" variant="outline" size="sm" className="h-10 md:h-8 text-xs"
              onClick={() => onCambio(deCotizacion(ultima))}>
              Usar última guardada ({tipoCambioATexto(ultima.tipo_cambio)} del {diaMes(ultima.fecha)})
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
