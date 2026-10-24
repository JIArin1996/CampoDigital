import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { consultarBcu, ErrorBcu } from "@/lib/economia/bcu"
import {
  COTIZACION_USADA, VENTANA_DIAS, redondear4, type CotizacionBcu, type ErrorCotizacion, type ErrorTipoCambio,
} from "@/lib/economia/tipoCambio"

/**
 * GET /api/tipo-cambio?fecha=AAAA-MM-DD — cotización del dólar billete del BCU para esa fecha.
 *
 * 1. Busca en tipos_cambio la de esa fecha.
 * 2. Si no está, consulta al BCU los VENTANA_DIAS días hasta esa fecha y guarda todo lo que devuelva.
 * 3. Usa la de esa fecha o, si no hay (fin de semana, feriado, todavía no publicada), la del último día
 *    hábil anterior dentro de la ventana, y dice de qué fecha es. La elige con lo que vino del BCU más
 *    lo ya guardado (sin releer la tabla): si guardar falla, lo registra y responde igual (guardada: false).
 *
 * Si el BCU falla, no completa nada: responde el error y, si hay, la última cotización guardada dentro
 * de la ventana (la pantalla la ofrece con un botón). Solo usuarios con sesión.
 */

// Freno en memoria: fechas consultadas al BCU y guardadas bien hace menos de 10 minutos (sábados,
// feriados). Solo se usa si hay una cotización guardada para responder. Por instancia: no se comparte
// entre instancias de Vercel y nada depende de él.
const FRENO_MS = 10 * 60 * 1000
const consultadas = new Map<string, number>()

const hoyMontevideo = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" })

function restarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

const esFechaValida = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(`${f}T12:00:00Z`))
  && new Date(`${f}T12:00:00Z`).toISOString().slice(0, 10) === f

function error(status: number, error: ErrorTipoCambio, mensaje: string, extra: Partial<ErrorCotizacion> = {}) {
  return Response.json({ error, mensaje, ...extra } satisfies ErrorCotizacion, { status, headers: { "Cache-Control": "no-store" } })
}

type Fila = { fecha: string; compra: number; venta: number }

const respuesta = (pedida: string, fila: Fila, desdeCache: boolean, guardada = true) => Response.json({
  moneda: "USD",
  fecha_pedida: pedida,
  fecha: fila.fecha,
  tipo_cambio: redondear4(Number(fila[COTIZACION_USADA])),
  compra: Number(fila.compra),
  venta: Number(fila.venta),
  fuente: "BCU",
  desde_cache: desdeCache,
  guardada,
} satisfies CotizacionBcu, { headers: { "Cache-Control": "no-store" } })

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return error(401, "sin_sesion", "Tenés que iniciar sesión")

  const fecha = new URL(request.url).searchParams.get("fecha") ?? ""
  if (!esFechaValida(fecha)) return error(400, "fecha_invalida", "La fecha tiene que ser AAAA-MM-DD")
  if (fecha > hoyMontevideo()) return error(400, "fecha_invalida", "La fecha no puede ser futura")
  const desde = restarDias(fecha, VENTANA_DIAS)

  // La más reciente guardada dentro de la ventana (la de esa fecha o la anterior)
  const guardada = async () => {
    const { data, error: e } = await supabase
      .from("tipos_cambio")
      .select("fecha, compra, venta")
      .eq("moneda", "USD")
      .gte("fecha", desde)
      .lte("fecha", fecha)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (e) throw e
    return data as Fila | null
  }

  try {
    // 1. Ya guardada para esa fecha
    const previa = await guardada()
    if (previa?.fecha === fecha) return respuesta(fecha, previa, true)

    // Consultada y guardada hace poco, y el BCU no tenía esa fecha: vale la anterior guardada.
    // Sin una guardada para responder, el freno no se usa: se vuelve a consultar.
    const ultimaConsulta = consultadas.get(fecha)
    if (previa && ultimaConsulta && Date.now() - ultimaConsulta < FRENO_MS) return respuesta(fecha, previa, true)

    // 2. Consultar al BCU la ventana y guardar todo (sin pisar cotizaciones cargadas a mano)
    let delBcu
    try {
      delBcu = await consultarBcu(desde, fecha)
    } catch (err) {
      const ultima = previa ? { fecha: previa.fecha, tipo_cambio: redondear4(Number(previa[COTIZACION_USADA])) } : null
      if (err instanceof ErrorBcu && err.tipo === "timeout") {
        return error(504, "bcu_timeout", "El BCU tardó demasiado en responder", { ultima_guardada: ultima })
      }
      return error(502, "bcu_error", err instanceof Error ? err.message : "No se pudo consultar al BCU", { ultima_guardada: ultima })
    }
    // Guardar lo que vino (sin pisar cotizaciones cargadas a mano). Si falla, se registra y se sigue.
    let noPisar = new Set<string>()
    let seGuardo = true
    if (delBcu.length > 0) {
      try {
        const admin = createAdminClient()
        const { data: manuales, error: eManuales } = await admin
          .from("tipos_cambio").select("fecha").eq("moneda", "USD").eq("fuente", "manual").gte("fecha", desde).lte("fecha", fecha)
        if (eManuales) throw eManuales
        noPisar = new Set((manuales ?? []).map(m => m.fecha))
        const filas = delBcu.filter(d => !noPisar.has(d.fecha)).map(d => ({
          fecha: d.fecha, moneda: "USD", compra: d.compra, venta: d.venta, fuente: "BCU", consultado_en: new Date().toISOString(),
        }))
        if (filas.length > 0) {
          const { error: eGuardar } = await admin.from("tipos_cambio").upsert(filas, { onConflict: "fecha,moneda" })
          if (eGuardar) throw eGuardar
        }
      } catch (err) {
        seGuardo = false
        console.error("tipo-cambio: no se pudieron guardar las cotizaciones del BCU:", err)
      }
    }
    if (seGuardo) consultadas.set(fecha, Date.now())

    // 3. La de esa fecha o la del último día hábil anterior: lo que vino del BCU (salvo los días con una
    //    cotización manual, que mandan) más lo ya guardado, sin releer la tabla
    const candidatas: (Fila & { guardada: boolean })[] = [
      ...delBcu.filter(d => !noPisar.has(d.fecha) && d.fecha >= desde && d.fecha <= fecha).map(d => ({ ...d, guardada: seGuardo })),
      ...(previa ? [{ ...previa, guardada: true }] : []),
    ]
    // La más reciente; si la misma fecha ya estaba guardada, esa (vale para la base aunque el guardado de ahora falle)
    const elegida = candidatas.sort((a, b) => b.fecha.localeCompare(a.fecha) || Number(b.guardada) - Number(a.guardada))[0]
    if (!elegida) return error(404, "sin_cotizacion", `El BCU no tiene cotización entre el ${desde} y el ${fecha}`)
    if (!elegida.guardada) console.error(`tipo-cambio: se responde la cotización del ${elegida.fecha} sin guardar`)
    return respuesta(fecha, elegida, false, elegida.guardada)
  } catch (err) {
    console.error("tipo-cambio:", err)
    return error(502, "bcu_error", "No se pudo obtener la cotización")
  }
}
