// Tipo de cambio del BCU: lo que comparten la route /api/tipo-cambio y la pantalla de carga.

// Cotización que se usa como tipo de cambio de un movimiento en pesos. Para el dólar billete del
// BCU (2225) compra y venta hoy son iguales; la base acepta cualquiera de las dos como 'BCU'.
export const COTIZACION_USADA: "venta" | "compra" = "venta"

// Días hacia atrás que se consultan al BCU y en los que vale una cotización para una fecha
// (fin de semana, feriado o todavía no publicada → la del último día hábil anterior)
export const VENTANA_DIAS = 10

// Respuesta OK de GET /api/tipo-cambio?fecha=AAAA-MM-DD
export interface CotizacionBcu {
  moneda: "USD"
  fecha_pedida: string
  fecha: string              // la fecha real de la cotización (≤ fecha_pedida)
  tipo_cambio: number        // pesos por dólar, redondeado a 4 decimales (COTIZACION_USADA)
  compra: number
  venta: number
  fuente: "BCU"
  desde_cache: boolean       // true si salió de tipos_cambio sin consultar al BCU
  guardada: boolean          // false si vino del BCU pero no se pudo guardar en tipos_cambio: un
                             // movimiento con ese tipo de cambio queda como 'manual' (la base no encuentra la fila)
}

export type ErrorTipoCambio = "fecha_invalida" | "sin_sesion" | "sin_cotizacion" | "bcu_error" | "bcu_timeout"

// Respuesta de error. Si el BCU falló y hay una cotización guardada dentro de la ventana, viene en
// ultima_guardada: la pantalla la ofrece con un botón, nunca la completa sola.
export interface ErrorCotizacion {
  error: ErrorTipoCambio
  mensaje: string
  ultima_guardada?: { fecha: string; tipo_cambio: number } | null
}

export const redondear4 = (n: number) => Math.round(n * 10_000) / 10_000
