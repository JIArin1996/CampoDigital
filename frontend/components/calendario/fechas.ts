// Fechas del calendario: todo en texto YYYY-MM-DD, calculado en UTC para que el huso no corra los días

const aFecha = (iso: string) => new Date(iso + "T00:00:00Z")
const aTexto = (d: Date) => d.toISOString().slice(0, 10)

export function sumarDias(iso: string, dias: number) {
  const d = aFecha(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return aTexto(d)
}

// Mes como "YYYY-MM"
export const mesDe = (iso: string) => iso.slice(0, 7)

export function sumarMeses(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return aTexto(d).slice(0, 7)
}

// Días de la grilla del mes: semanas completas de lunes a domingo (con días del mes anterior y del siguiente)
export function diasDeGrilla(mes: string): string[] {
  const primero = aFecha(mes + "-01")
  const atras = (primero.getUTCDay() + 6) % 7          // lunes = 0
  const inicio = sumarDias(mes + "-01", -atras)
  const ultimo = sumarDias(sumarMeses(mes, 1) + "-01", -1)
  const dias: string[] = []
  for (let d = inicio; dias.length % 7 !== 0 || d <= ultimo; d = sumarDias(d, 1)) dias.push(d)
  return dias
}

export const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"]

export const nombreMes = (mes: string) => {
  const t = aFecha(mes + "-01").toLocaleDateString("es-UY", { month: "long", year: "numeric", timeZone: "UTC" })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const nombreDia = (iso: string) => {
  const t = aFecha(iso).toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Próximas ocurrencias previstas de una tarea repetida pendiente, hasta una fecha.
// Como en la base: la siguiente vence N días después del vencimiento, o de hoy si ya pasó.
export function ocurrenciasPrevistas(vencimiento: string, dias: number, hoy: string, hasta: string) {
  const fechas: string[] = []
  let f = sumarDias(vencimiento > hoy ? vencimiento : hoy, dias)
  while (f <= hasta && fechas.length < 400) {
    fechas.push(f)
    f = sumarDias(f, dias)
  }
  return fechas
}
