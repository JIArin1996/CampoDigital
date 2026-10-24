import "server-only"

/**
 * Cliente del web service SOAP de cotizaciones del Banco Central del Uruguay. Solo en el servidor
 * (el BCU no permite CORS). Operación wsbcucotizaciones.Execute del namespace "Cotiza".
 *
 * Respuesta: respuestastatus (status 1 = OK; 0 = error con codigoerror y mensaje) y una lista de
 * datoscotizaciones.dato con Fecha, Moneda, TCC (compra) y TCV (venta). Siempre responde HTTP 200;
 * el error viene adentro. Errores vistos: 100 "No existe cotización para la fecha indicada" (rango
 * sin días hábiles publicados: no es una falla), 101 "Código de moneda no existe", 103 "Fecha Hasta
 * es menor que Fecha Desde".
 */

const URL_BCU = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones"
const SOAP_ACTION = "Cotizaaction/AWSBCUCOTIZACIONES.Execute"

// Dólar estadounidense billete (verificado contra el servicio: "DLS. USA BILLETE")
export const CODIGO_BCU_USD = 2225

const SIN_COTIZACION = 100

export interface CotizacionDia { fecha: string; compra: number; venta: number }

export class ErrorBcu extends Error {
  constructor(public tipo: "timeout" | "error", mensaje: string) {
    super(mensaje)
    this.name = "ErrorBcu"
  }
}

const sobre = (moneda: number, desde: string, hasta: string) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
  <soapenv:Header/>
  <soapenv:Body>
    <cot:wsbcucotizaciones.Execute>
      <cot:Entrada>
        <cot:Moneda><cot:item>${moneda}</cot:item></cot:Moneda>
        <cot:FechaDesde>${desde}</cot:FechaDesde>
        <cot:FechaHasta>${hasta}</cot:FechaHasta>
        <cot:Grupo>0</cot:Grupo>
      </cot:Entrada>
    </cot:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`

// Valor de un elemento (con o sin prefijo de namespace) dentro de un texto XML
function valor(xml: string, nombre: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${nombre.replace(".", "\\.")}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${nombre.replace(".", "\\.")}>`).exec(xml)
  return m ? m[1].trim() : null
}

/**
 * Cotizaciones de una moneda entre dos fechas (AAAA-MM-DD), solo los días publicados.
 * Rango sin datos (código 100): lista vacía. Cualquier otra cosa rara: ErrorBcu.
 */
export async function consultarBcu(desde: string, hasta: string, opciones: { moneda?: number; timeoutMs?: number } = {}) {
  const moneda = opciones.moneda ?? CODIGO_BCU_USD
  let texto: string
  try {
    const res = await fetch(URL_BCU, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${SOAP_ACTION}"` },
      body: sobre(moneda, desde, hasta),
      signal: AbortSignal.timeout(opciones.timeoutMs ?? 5000),
      cache: "no-store",
    })
    if (!res.ok) throw new ErrorBcu("error", `El BCU respondió HTTP ${res.status}`)
    texto = await res.text()
  } catch (err) {
    if (err instanceof ErrorBcu) throw err
    const nombre = (err as { name?: string })?.name
    if (nombre === "TimeoutError" || nombre === "AbortError") throw new ErrorBcu("timeout", "El BCU tardó demasiado en responder")
    throw new ErrorBcu("error", "No se pudo conectar con el BCU")
  }

  const status = valor(texto, "status")
  if (status === null) throw new ErrorBcu("error", "Respuesta del BCU ilegible")
  if (status !== "1") {
    const codigo = Number(valor(texto, "codigoerror"))
    if (codigo === SIN_COTIZACION) return [] as CotizacionDia[]
    throw new ErrorBcu("error", `BCU: ${valor(texto, "mensaje") || `error ${codigo}`}`)
  }

  const datos: CotizacionDia[] = []
  const bloques = texto.match(/<(?:\w+:)?datoscotizaciones\.dato(?:\s[^>]*)?>[\s\S]*?<\/(?:\w+:)?datoscotizaciones\.dato>/g) ?? []
  for (const b of bloques) {
    const fecha = valor(b, "Fecha")
    const codigo = Number(valor(b, "Moneda"))
    const compra = Number(valor(b, "TCC"))
    const venta = Number(valor(b, "TCV"))
    // Solo lo que tiene sentido: la moneda pedida, fecha válida y montos positivos
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || codigo !== moneda) continue
    if (!Number.isFinite(compra) || !Number.isFinite(venta) || compra <= 0 || venta <= 0) continue
    datos.push({ fecha, compra, venta })
  }
  return datos
}
